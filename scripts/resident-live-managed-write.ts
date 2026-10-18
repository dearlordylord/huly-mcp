import { spawn } from "node:child_process"
import { once } from "node:events"
import * as fs from "node:fs/promises"
import { join } from "node:path"
import { createInterface } from "node:readline"
import { Effect, Redacted, Schema } from "effect"

import { CreateProjectParamsSchema, CreateProjectResultSchema } from "../src/domain/schemas/projects.js"
import { type ResidentPackagePath, ResidentRegistryEnvelope } from "../src/resident/managed-contract.js"
import { HostMessage } from "../src/resident/request-headers.js"
import { BackendMessage } from "../src/resident/response-stream.js"
import type { ResidentDirectory } from "../src/resident/protected-path.js"
import { openKernelReapedEvents, type ReapedEventsFd } from "../test/helpers/kernel-reaped-events.js"
import {
  type LiveProbeEnvironment,
  type LiveReadProtocol,
  type LiveReadHostInput,
  LiveReadProbeError
} from "./resident-live-read-contract.js"

import { discoverLiveReadProtocol, liveReadMetadata } from "./resident-live-protocol.js"
import { probeIo } from "./resident-live-read-process.js"

const RESPONSE_BOUND = 5_000
const EXIT_BOUND = 7_000
const REQUEST_ID = 41
const NativeResult = Schema.Struct({
  isError: Schema.optionalKey(Schema.Literal(false)),
  structuredContent: Schema.Struct({ result: CreateProjectResultSchema })
})
const bounded = <A>(pending: Promise<A>, millis: number) =>
  Effect.runPromise(Effect.promise(() => pending).pipe(Effect.timeout(millis)))

const readGeneration = async (root: ResidentDirectory) => {
  const directory = join(root, "generations")
  const names = await fs.readdir(directory)
  const [name] = names
  if (names.length !== 1 || name === undefined) throw new Error("Managed write requires exactly one generation")
  return Schema.decodeUnknownSync(Schema.fromJsonString(ResidentRegistryEnvelope))(
    await fs.readFile(join(directory, name), "utf8")
  )
}

export const withLiveManagedWrite = async <A>(
  input: {
    readonly bundle: Schema.Schema.Type<typeof ResidentPackagePath>
    readonly directory: ResidentDirectory
    readonly reapedFd: ReapedEventsFd
    readonly protocol: LiveReadProtocol
  },
  environment: LiveProbeEnvironment,
  use: (
    submit: (
      project: Schema.Schema.Type<typeof CreateProjectParamsSchema>
    ) => Promise<Schema.Schema.Type<typeof CreateProjectResultSchema>>
  ) => Promise<A>
) => {
  const kernel = openKernelReapedEvents(input.reapedFd)
  const child = spawn(process.execPath, [input.bundle], {
    env: {
      ...Object.fromEntries(Object.entries(environment).map(([key, value]) => [key, Redacted.value(value)])),
      MCP_TRANSPORT: "stdio-resident",
      MCP_RESIDENT_STATE_DIRECTORY: input.directory,
      HULY_TOOL_MODE: "native",
      HULY_MCP_TELEMETRY: "0"
    }
  })
  const closed = once(child, "close")
  void closed.catch(() => {})
  child.stderr.resume()
  child.stdin.on("error", () => {})
  const lines = createInterface({ input: child.stdout })
  const incoming = lines[Symbol.asyncIterator]()
  const protocolInput: Pick<LiveReadHostInput, "protocol" | "host" | "client"> = {
    protocol: input.protocol,
    host: "first",
    client: { name: "resident-live-write", configuredMode: "native", exposure: "native" }
  }
  const send = (frame: string) =>
    probeIo(
      "send",
      () =>
        new Promise<void>((resolve, reject) => {
          child.stdin.write(`${frame}\n`, (error) =>
            error === null || error === undefined ? resolve() : reject(error)
          )
        })
    )
  const request = (
    id: NonNullable<HostMessage["id"]>,
    method: "initialize" | "server/discover" | "tools/call",
    params: Readonly<Record<string, Schema.Json>>
  ) =>
    Effect.gen(function* () {
      const frame = yield* Schema.encodeEffect(Schema.fromJsonString(HostMessage))({
        jsonrpc: "2.0",
        id,
        method,
        params: { ...params, ...liveReadMetadata(protocolInput) }
      }).pipe(Effect.mapError(() => new LiveReadProbeError({ phase: "send" })))
      yield* send(frame)
      const next = yield* probeIo("response", () => incoming.next())
      if (next.done) return yield* new LiveReadProbeError({ phase: "response" })
      const reply = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(BackendMessage))(next.value).pipe(
        Effect.mapError(() => new LiveReadProbeError({ phase: "response" }))
      )
      if (!("id" in reply) || reply.id !== id || "error" in reply)
        return yield* new LiveReadProbeError({ phase: "response" })
      return reply.result
    }).pipe(
      Effect.timeout(RESPONSE_BOUND),
      Effect.mapError(() => new LiveReadProbeError({ phase: "response" }))
    )
  const submit = async (project: Schema.Schema.Type<typeof CreateProjectParamsSchema>) => {
    await Effect.runPromise(discoverLiveReadProtocol(protocolInput, request, send))
    const args = Schema.decodeUnknownSync(Schema.Json)(Schema.encodeSync(CreateProjectParamsSchema)(project))
    const result = await Effect.runPromise(
      request(REQUEST_ID, "tools/call", { name: "create_project", arguments: args })
    )
    return Schema.decodeUnknownSync(NativeResult)(result).structuredContent.result
  }
  const outcome = await (async (): Promise<
    { readonly value: A; readonly record: ResidentRegistryEnvelope } | { readonly error: unknown }
  > => {
    try {
      const value = await use(submit)
      return { value, record: await readGeneration(input.directory) }
    } catch (error) {
      return { error }
    }
  })()
  const cleanup = await Promise.allSettled([
    (async () => {
      child.stdin.end()
      const exited = await bounded(closed, RESPONSE_BOUND).catch(async () => {
        if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL")
        await bounded(closed, EXIT_BOUND)
        throw new Error("Managed write adapter did not close cooperatively")
      })
      if (exited[0] !== 0 || exited[1] !== null) throw new Error("Managed write adapter exited unsuccessfully")
    })()
  ])
  lines.close()
  try {
    if ("error" in outcome) throw outcome.error
    for (const result of cleanup) if (result.status === "rejected") throw result.reason
    const backendExit = await kernel.wait(outcome.record.diagnostics.processId)
    if (backendExit.exitCode !== 0 || (await fs.readdir(input.directory)).length !== 0)
      throw new Error("Managed write backend retirement not confirmed")
    return { observation: outcome.value, backendExit }
  } finally {
    kernel.close()
  }
}
