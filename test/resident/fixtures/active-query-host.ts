import { spawn } from "node:child_process"
import { once } from "node:events"
import { createInterface } from "node:readline"
import { Effect, Result, Schema } from "effect"

import { GetHulyContextResultSchema } from "../../../src/domain/schemas/huly-context.js"
import { GetProjectResultSchema } from "../../../src/domain/schemas/projects.js"
import { MAX_ADAPTER_RESPONSE_BYTES } from "../../../src/resident/adapter-limits.js"
import { HostMessage } from "../../../src/resident/request-headers.js"
import { BackendMessage } from "../../../src/resident/response-stream.js"
import { LiveReadProbeError } from "../../../scripts/resident-live-read-contract.js"
import { discoverLiveReadProtocol, liveReadMetadata } from "../../../scripts/resident-live-protocol.js"
import { boundModelWait } from "../../helpers/model-wait-parent.js"
import { residentSelectionEnvironment } from "../../helpers/resident-selection-environment.js"
import {
  ActiveQueryCommand,
  ActiveQueryEvent,
  ActiveQueryHostInput,
  ActiveQueryToolError,
  AdapterExit,
  OUTPUT_EXIT_BOUND
} from "../active-query-contract.js"

import { makeActiveQueryBurst } from "./active-query-burst.js"

const MAX_NOTIFICATIONS = 64
const FIRST_ID = 41
const CONTEXT_ID = 2
const MAX_DIAGNOSTIC_BYTES = 8_192
const OUTPUT_FAILURE = "Stdio output failed or exceeded its 10 second write allowance"
const ContextReply = Schema.Struct({ structuredContent: Schema.Struct({ result: GetHulyContextResultSchema }) })
const ProjectReply = Schema.Struct({
  isError: Schema.optionalKey(Schema.Literal(false)),
  structuredContent: Schema.Struct({ result: GetProjectResultSchema })
})
let failureStage = "input"
const emit = (event: ActiveQueryEvent) =>
  process.stdout.write(`${Schema.encodeSync(Schema.fromJsonString(ActiveQueryEvent))(event)}\n`)

const main = async () => {
  const input = Schema.decodeUnknownSync(Schema.fromJsonString(ActiveQueryHostInput))(process.argv[2])
  const protocol = {
    protocol: input.protocol,
    host: input.role === "departing" ? "first" : "second"
  } satisfies Parameters<typeof liveReadMetadata>[0]
  const child = spawn(process.execPath, [input.bundle], {
    env: {
      ...residentSelectionEnvironment(),
      HULY_URL: input.endpoint,
      HULY_TOOL_MODE: "native",
      MCP_TRANSPORT: "stdio-resident",
      MCP_RESIDENT_STATE_DIRECTORY: input.directory
    }
  })
  const exited = once(child, "exit").then(([code, signal]) => Schema.decodeUnknownSync(AdapterExit)({ code, signal }))
  void exited.catch(() => {})
  const closed = once(child, "close").then(([code, signal]) => Schema.decodeUnknownSync(AdapterExit)({ code, signal }))
  void closed.catch(() => {})
  let diagnostics = ""
  child.stderr.on("data", (bytes: Buffer) => {
    diagnostics = (diagnostics + bytes.toString("utf8")).slice(-MAX_DIAGNOSTIC_BYTES)
    process.stderr.write(bytes)
  })
  child.stdin.on("error", () => process.stderr.write("Active query adapter input closed\n"))
  const lines = createInterface({ input: child.stdout })
  const incoming = lines[Symbol.asyncIterator]()
  const commands = createInterface({ input: process.stdin })
  const send = async (frame: string) =>
    new Promise<void>((resolve, reject) =>
      child.stdin.write(`${frame}\n`, (error) => (error ? reject(error) : resolve()))
    )
  const request = async (id: number, method: string, params: Readonly<Record<string, Schema.Json>>) => {
    await send(
      Schema.encodeSync(Schema.fromJsonString(HostMessage))({
        jsonrpc: "2.0",
        id,
        method,
        params: { ...params, ...liveReadMetadata(protocol) }
      })
    )
    for (let count = 0; count <= MAX_NOTIFICATIONS; count++) {
      const next = await incoming.next()
      if (next.done) return undefined
      if (Buffer.byteLength(next.value) > MAX_ADAPTER_RESPONSE_BYTES) throw new Error("Oversized adapter response")
      const reply = Schema.decodeUnknownSync(Schema.fromJsonString(BackendMessage))(next.value)
      if (!("id" in reply)) continue
      if (reply.id !== id || "error" in reply) throw new Error("Unexpected adapter response")
      return reply.result
    }
    throw new Error("Adapter notification bound exceeded")
  }
  const burst = makeActiveQueryBurst({
    send: (id, project) =>
      send(
        Schema.encodeSync(Schema.fromJsonString(HostMessage))({
          jsonrpc: "2.0",
          id,
          method: "tools/call",
          params: { name: "get_project", arguments: { project }, ...liveReadMetadata(protocol) }
        })
      ),
    closed,
    diagnostics: () => diagnostics,
    emit
  })
  let losing = false
  let failed = false
  let nextId = FIRST_ID
  let active: Promise<void> | undefined
  const run = async () => {
    failureStage = "discover"
    await Effect.runPromise(
      discoverLiveReadProtocol(
        protocol,
        (id, method, params) =>
          Effect.tryPromise({
            try: () => boundModelWait(request(Schema.decodeUnknownSync(Schema.Int)(id), method, params)),
            catch: () => new LiveReadProbeError({ phase: "discover" })
          }),
        (frame) => Effect.tryPromise({ try: () => send(frame), catch: () => new LiveReadProbeError({ phase: "send" }) })
      )
    )
    failureStage = "context"
    const context = Schema.decodeUnknownSync(ContextReply)(
      await boundModelWait(request(CONTEXT_ID, "tools/call", { name: "get_huly_context", arguments: {} }))
    ).structuredContent.result
    emit(
      Schema.decodeUnknownSync(ActiveQueryEvent.cases.ready)({
        _tag: "ready",
        protocol: input.protocol,
        parentPid: process.pid,
        adapterPid: child.pid,
        port: context.transport.http?.port
      })
    )
    failureStage = "commands"
    for await (const line of commands) {
      const command = Schema.decodeUnknownSync(Schema.fromJsonString(ActiveQueryCommand))(line)
      if (command._tag === "close") break
      if (command._tag === "lose") {
        losing = true
        if (command.mode === "eof") child.stdin.end()
        else if (!child.kill("SIGKILL")) throw new Error("Owned adapter kill failed")
        process.stderr.write(`Active host ${input.role}: ${command.mode} initiated\n`)
        emit({ _tag: "loss", mode: command.mode })
        const exit = await boundModelWait(closed)
        process.stderr.write(`Active host ${input.role}: adapter closed\n`)
        if (active !== undefined) await boundModelWait(active)
        emit({ _tag: "exit", ...exit })
        continue
      }
      if (active !== undefined || losing) throw new Error("Adapter request already active or closed")
      if (command._tag === "fill" || command._tag === "overflow") {
        await burst.handle(command)
        continue
      }
      if (burst.occupied()) throw new Error("Burst adapter cannot serve another fixture operation")
      if (command._tag === "stall") {
        losing = true
        const id = nextId++
        lines.pause()
        if (command.mode === "closed") child.stdout.destroy()
        else child.stdout.pause()
        await send(
          Schema.encodeSync(Schema.fromJsonString(HostMessage))({
            jsonrpc: "2.0",
            id,
            method: "tools/call",
            params: { name: "get_project", arguments: { project: command.project }, ...liveReadMetadata(protocol) }
          })
        )
        emit({ _tag: "stalled", project: command.project, id, mode: command.mode })
        const exit = await Effect.runPromise(Effect.promise(() => exited).pipe(Effect.timeout(OUTPUT_EXIT_BOUND)))
        // Unread pipe bytes can delay close after the actual owned process has exited.
        child.stdout.destroy()
        await boundModelWait(closed)
        emit(
          Schema.decodeUnknownSync(ActiveQueryEvent.cases.outputExit)({
            _tag: "outputExit",
            ...exit,
            outputFailure: diagnostics.includes(OUTPUT_FAILURE)
          })
        )
        continue
      }
      const id = nextId++
      active = boundModelWait(
        request(id, "tools/call", { name: "get_project", arguments: { project: command.project } })
      )
        .then((reply) => {
          if (reply === undefined) {
            if (!losing) throw new Error("Unexpected adapter EOF")
            process.stderr.write(`Active host ${input.role}: request EOF observed\n`)
            emit({ _tag: "interrupted", project: command.project, id })
          } else if (command._tag === "readError") {
            emit({
              _tag: "toolError",
              project: command.project,
              id,
              reply: Schema.decodeUnknownSync(ActiveQueryToolError)(reply)
            })
          } else {
            emit({
              _tag: "result",
              project: command.project,
              id,
              result: Schema.decodeUnknownSync(ProjectReply)(reply).structuredContent.result
            })
          }
        })
        .catch(() => {
          failed = true
        })
        .finally(() => {
          active = undefined
        })
      emit({ _tag: "started", project: command.project, id })
    }
  }
  const outcome = await run().then(
    (value) => Result.succeed(value),
    (error: unknown) => Result.fail(error)
  )
  commands.close()
  if (!child.stdin.writableEnded) child.stdin.end()
  const termination = boundModelWait(closed).catch(async (error: unknown) => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL")
      await boundModelWait(closed)
    }
    throw error
  })
  const cleanup = await Promise.allSettled([
    termination,
    active === undefined ? Promise.resolve() : boundModelWait(active)
  ])
  lines.close()
  if (Result.isFailure(outcome)) throw outcome.failure
  const failure = cleanup.find((result) => result.status === "rejected")
  if (failure !== undefined) throw failure.reason
  if (failed) throw new Error("Active query request failed")
  if (!losing && !burst.occupied()) emit({ _tag: "exit", ...(await closed) })
}
void main().catch(() => {
  process.stderr.write(`Active query host failed at ${failureStage}\n`)
  process.exitCode = 1
})
