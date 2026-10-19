import { spawn } from "node:child_process"
import { EventEmitter, once } from "node:events"
import { resolve } from "node:path"
import { createInterface } from "node:readline"
import { scheduler } from "node:timers/promises"
import { Effect, Schema } from "effect"
import { afterAll, beforeAll, expect, it } from "vitest"

import { buildIsolatedStdioServer } from "../helpers/stdio-build.js"
import { fixturePackageVersion, startResidentFixture } from "../helpers/resident-fixture.js"
import { testStdioEnvironment } from "../helpers/stdio-environment.js"
import { ResidentResponseObservation } from "../../src/resident/response-observations.js"

const REQUEST_BOUND = 5_000
const BUILD_BOUND = 30_000
const FRAME_COUNT = 80
const FRAME_BYTES = 256 * 1024
const AUTHORIZATION = "output-pipeline-fixture"
const Progress = Schema.Struct({
  jsonrpc: Schema.Literal("2.0"),
  method: Schema.Literal("notifications/progress"),
  params: Schema.Struct({ progressToken: Schema.Literal("blocked"), progress: Schema.Natural, message: Schema.String })
})
const Request = Schema.Struct({
  jsonrpc: Schema.Literal("2.0"),
  id: Schema.Literal(1),
  method: Schema.String,
  params: Schema.Struct({
    _meta: Schema.Struct({
      "io.modelcontextprotocol/protocolVersion": Schema.Literal("2026-07-28"),
      "io.modelcontextprotocol/clientCapabilities": Schema.Struct({}),
      "io.modelcontextprotocol/clientInfo": Schema.Struct({ name: Schema.String, version: Schema.String })
    })
  })
})
const Reply = Schema.Struct({ id: Schema.Literal(1), result: Schema.Struct({ host: Schema.String }) })
const WireReply = Schema.Struct({ jsonrpc: Schema.Literal("2.0"), ...Reply.fields })
const encodeProgress = Schema.encodeSync(Schema.fromJsonString(Progress))
const parseProgress = Schema.decodeUnknownSync(Schema.fromJsonString(Progress))
const parseReply = Schema.decodeUnknownSync(Schema.fromJsonString(Reply))
const hostRequest = (host: string) =>
  `${Schema.encodeSync(Schema.fromJsonString(Request))({
    jsonrpc: "2.0",
    id: 1,
    method: "server/discover",
    params: {
      _meta: {
        "io.modelcontextprotocol/protocolVersion": "2026-07-28",
        "io.modelcontextprotocol/clientCapabilities": {},
        "io.modelcontextprotocol/clientInfo": { name: host, version: "1.0" }
      }
    }
  })}\n`
let bundle: Awaited<ReturnType<typeof buildIsolatedStdioServer>>
beforeAll(async () => {
  bundle = await buildIsolatedStdioServer(BUILD_BOUND)
}, BUILD_BOUND)
afterAll(async () => {
  await bundle.cleanup()
})

it(
  "bounds a saturated output pipeline while a peer continues, then resumes and blocks again",
  { timeout: 25_000 },
  async () => {
    let submittedFrames = 0
    const fixture = await startResidentFixture(
      (request, response) => {
        void (async () => {
          request.setEncoding("utf8")
          const chunks: Array<string> = []
          for await (const chunk of request) chunks.push(Schema.decodeUnknownSync(Schema.String)(chunk))
          const input = Schema.decodeUnknownSync(Schema.fromJsonString(Request))(chunks.join(""))
          const host = input.params._meta["io.modelcontextprotocol/clientInfo"].name
          const terminal = Schema.encodeSync(Schema.fromJsonString(WireReply))({
            jsonrpc: "2.0",
            id: 1,
            result: { host }
          })
          if (host === "blocked") {
            const frames = Array.from(
              { length: FRAME_COUNT },
              (_, progress) =>
                `data: ${encodeProgress({
                  jsonrpc: "2.0",
                  method: "notifications/progress",
                  params: { progressToken: "blocked", progress, message: "a".repeat(FRAME_BYTES) }
                })}\n\n`
            )
            submittedFrames = frames.length
            response.writeHead(200, { "content-type": "text/event-stream" })
            response.end(frames.join("") + `data: ${terminal}\n\n`)
          } else {
            response.writeHead(200, { "content-type": "application/json" })
            response.end(terminal)
          }
        })().catch(() => response.destroy())
      },
      AUTHORIZATION,
      await fixturePackageVersion()
    )
    const adapters = ["blocked", "peer"].map((host) => {
      const child = spawn(
        process.execPath,
        ["--import", resolve("test/resident/fixtures/observe-responses.mjs"), bundle.path],
        {
          stdio: ["pipe", "pipe", "pipe", "ipc"],
          env: { ...testStdioEnvironment(), MCP_TRANSPORT: "stdio-http", MCP_RESIDENT_ATTACHMENT_FILE: fixture.file }
        }
      )
      const { stderr, stdin, stdout } = child
      if (stdin === null || stdout === null || stderr === null) throw new Error("Owned adapter needs three pipes")
      const events = new EventEmitter()
      const progress: Array<number> = []
      const errors: Array<unknown> = []
      child.on("message", (message: unknown) => {
        try {
          const observation = Schema.decodeUnknownSync(ResidentResponseObservation)(message)
          if (observation.event === "Progress" && observation.accepted) {
            progress.push(progress.length)
            events.emit("progress")
          }
        } catch (error) {
          errors.push(error)
        }
      })
      const diagnostics: Array<Buffer> = []
      stderr.on("data", (bytes: Buffer) => diagnostics.push(bytes))
      return {
        child,
        stdin,
        stdout,
        events,
        progress,
        errors,
        diagnostics,
        exit: once(child, "exit"),
        closed: once(child, "close"),
        host
      }
    })
    const [blocked, peer] = adapters
    if (blocked === undefined || peer === undefined) throw new Error("Two adapters required")
    const peerLines = createInterface({ input: peer.stdout })
    const askPeer = async () => {
      const line = once(peerLines, "line", { signal: AbortSignal.timeout(REQUEST_BOUND) })
      peer.stdin.write(hostRequest("peer"))
      const [value] = await line
      expect(parseReply(value)).toEqual({ id: 1, result: { host: "peer" } })
    }
    const outcome = await (async (): Promise<PromiseSettledResult<void>> => {
      try {
        const acquisitionSignal = AbortSignal.timeout(REQUEST_BOUND)
        blocked.stdin.write(hostRequest("blocked"))
        while (blocked.progress.length < 18) await once(blocked.events, "progress", { signal: acquisitionSignal })
        await askPeer()
        await Effect.runPromise(Effect.sleep("100 millis"))
        const plateau = blocked.progress.length
        await askPeer()
        await Effect.runPromise(Effect.sleep("100 millis"))
        expect(blocked.progress.length).toBe(plateau)
        expect(plateau).toBeGreaterThan(16)
        expect(plateau).toBeLessThan(FRAME_COUNT)
        expect(submittedFrames).toBe(FRAME_COUNT)
        let pending = ""
        let consumed = 0
        const drainSignal = AbortSignal.timeout(REQUEST_BOUND)
        while (blocked.progress.length <= plateau) {
          drainSignal.throwIfAborted()
          const newline = pending.indexOf("\n")
          if (newline >= 0) {
            const frame = parseProgress(pending.slice(0, newline))
            expect(frame.params.progress).toBe(consumed)
            expect(frame.params.message.length).toBe(FRAME_BYTES)
            consumed++
            pending = pending.slice(newline + 1)
            await scheduler.yield()
          } else {
            const chunk: unknown = blocked.stdout.read()
            if (chunk === null) await once(blocked.stdout, "readable", { signal: drainSignal })
            else pending += Buffer.from(Schema.decodeUnknownSync(Schema.Uint8Array)(chunk)).toString("utf8")
          }
        }
        expect(consumed).toBeGreaterThan(0)
        expect(consumed).toBeLessThan(FRAME_COUNT - 16)
        await askPeer()
        expect(await Effect.runPromise(Effect.promise(() => blocked.exit).pipe(Effect.timeout("12 seconds")))).toEqual([
          1,
          null
        ])
        blocked.stdout.destroy()
        await Effect.runPromise(Effect.promise(() => blocked.closed).pipe(Effect.timeout("7 seconds")))
        expect(Buffer.concat(blocked.diagnostics).toString("utf8")).toContain("10 second")
        expect(blocked.progress.length).toBeLessThan(FRAME_COUNT)
        expect(adapters.flatMap((adapter) => adapter.errors)).toEqual([])
        return { status: "fulfilled", value: undefined }
      } catch (reason) {
        return { status: "rejected", reason }
      }
    })()
    const cleanup = await Promise.allSettled([
      (async () => {
        peerLines.close()
        for (const adapter of adapters) {
          adapter.stdout.destroy()
          adapter.stdin.end()
          if (adapter.child.exitCode === null && adapter.child.signalCode === null) adapter.child.kill("SIGKILL")
        }
        await Effect.runPromise(
          Effect.promise(() => Promise.all(adapters.map((adapter) => adapter.closed))).pipe(Effect.timeout("7 seconds"))
        )
      })(),
      Effect.runPromise(Effect.promise(() => fixture.cleanup()).pipe(Effect.timeout("7 seconds")))
    ])
    if (outcome.status === "rejected") throw outcome.reason
    const failures = cleanup.filter((result) => result.status === "rejected")
    if (failures.length > 0)
      throw new AggregateError(
        failures.map((result) => result.reason),
        "Owned cleanup failed"
      )
  }
)
