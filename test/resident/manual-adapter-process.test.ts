import { spawn } from "node:child_process"
import { once } from "node:events"
import { createServer } from "node:http"
import { createInterface } from "node:readline"
import { resolve } from "node:path"
import { Effect, Schema } from "effect"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { buildIsolatedStdioServer } from "../helpers/stdio-build.js"
import { testStdioEnvironment } from "../helpers/stdio-environment.js"
import { replayResidentResponses } from "../helpers/resident-response-replay.js"
import { ResidentResponseObservation } from "../../src/resident/response-observations.js"

const PROCESS_BOUND = 30_000
const RESPONSE_BOUND = 5_000
const AUTHORIZATION = "fixture-local-authorization"
const HostRequest = Schema.Struct({
  id: Schema.Number,
  method: Schema.String,
  params: Schema.Struct({
    _meta: Schema.Struct({
      "io.modelcontextprotocol/clientInfo": Schema.Struct({ name: Schema.String, version: Schema.String })
    })
  })
})
const Reply = Schema.Struct({ id: Schema.Number, result: Schema.Struct({ host: Schema.String }) })
const Progress = Schema.Struct({
  method: Schema.Literal("notifications/progress"),
  params: Schema.Struct({ progressToken: Schema.String, progress: Schema.Number })
})
const parseReply = Schema.decodeUnknownSync(Schema.fromJsonString(Reply))
const parseMessage = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Union([Reply, Progress])))
const requestFor = (host: string, method = "server/discover") =>
  `${JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method,
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
  bundle = await buildIsolatedStdioServer(PROCESS_BOUND)
})
afterAll(async () => {
  await bundle.cleanup()
})

describe("packaged manual adapter", { timeout: PROCESS_BOUND }, () => {
  it.each([
    { contentType: "application/json", release: "none" },
    { contentType: "text/event-stream", release: "none" },
    { contentType: "text/event-stream", release: "cancel" },
    { contentType: "text/event-stream", release: "eof" },
    { contentType: "text/event-stream", release: "death" },
    { contentType: "text/event-stream", release: "missing-terminal" }
  ])("isolates colliding IDs through $contentType (release=$release)", async ({ contentType, release }) => {
    const holdFirst = release !== "none"
    const backend = createServer((request, response) => {
      void (async () => {
        expect(request.headers.authorization).toBe(`Bearer ${AUTHORIZATION}`)
        request.setEncoding("utf8")
        const chunks: Array<string> = []
        for await (const chunk of request) chunks.push(Schema.decodeUnknownSync(Schema.String)(chunk))
        const message = Schema.decodeUnknownSync(Schema.fromJsonString(HostRequest))(chunks.join(""))
        const host = message.params._meta["io.modelcontextprotocol/clientInfo"].name
        if (holdFirst && host === "first" && message.method === "server/discover") {
          response.once("close", () => backend.emit("first-stream-closed"))
          response.writeHead(200, { "content-type": contentType })
          response.write(
            `data: ${JSON.stringify({
              jsonrpc: "2.0",
              method: "notifications/progress",
              params: { progressToken: host, progress: 1 }
            })}\n\n`
          )
          if (release === "missing-terminal") backend.once("truncate-first", () => response.end())
          return
        }
        const reply = JSON.stringify({ jsonrpc: "2.0", id: message.id, result: { host } })
        response.writeHead(200, { "content-type": contentType })
        response.end(contentType === "text/event-stream" ? `: keepalive\n\ndata: ${reply}\n\n` : reply)
      })().catch(() => {
        response.writeHead(500)
        response.end()
      })
    })
    backend.listen(0, "127.0.0.1")
    await once(backend, "listening")
    const address = backend.address()
    if (address === null || typeof address === "string") throw new Error("Expected owned loopback port")
    const adapters = ["first", "second"].map((host) => {
      const child = spawn(
        process.execPath,
        ["--import", resolve("test/resident/fixtures/observe-responses.mjs"), bundle.path],
        {
          stdio: ["pipe", "pipe", "pipe", "ipc"],
          env: {
            ...testStdioEnvironment(),
            MCP_TRANSPORT: "stdio-http",
            MCP_STDIO_BACKEND_URL: `http://127.0.0.1:${address.port}/mcp`,
            MCP_AUTH_TOKEN: AUTHORIZATION
          }
        }
      )
      const { stdin, stdout } = child
      if (stdin === null || stdout === null) throw new Error("Owned adapter requires piped stdin and stdout")
      const observations: Array<ResidentResponseObservation> = []
      const observationErrors: Array<unknown> = []
      child.on("message", (message: unknown) => {
        try {
          observations.push(Schema.decodeUnknownSync(ResidentResponseObservation)(message))
        } catch (error) {
          observationErrors.push(error)
        }
      })
      const lines = createInterface({ input: stdout })
      const response = once(lines, "line", { signal: AbortSignal.timeout(RESPONSE_BOUND) }).then(([line]) =>
        parseMessage(line)
      )
      const exit = once(child, "exit")
      const closed = once(child, "close")
      stdin.write(requestFor(host))
      return { child, closed, exit, lines, observationErrors, observations, response, stdin }
    })
    try {
      expect(await Promise.all(adapters.map((adapter) => adapter.response))).toEqual([
        holdFirst
          ? { method: "notifications/progress", params: { progressToken: "first", progress: 1 } }
          : { id: 1, result: { host: "first" } },
        { id: 1, result: { host: "second" } }
      ])
      if (holdFirst) {
        const [first, second] = adapters
        if (first === undefined || second === undefined) throw new Error("Expected two owned adapter processes")
        if (release === "missing-terminal") {
          backend.emit("truncate-first")
          expect(
            await Effect.runPromise(Effect.promise(() => first.exit).pipe(Effect.timeout(RESPONSE_BOUND)))
          ).toEqual([1, null])
        } else {
          const closed = once(backend, "first-stream-closed", { signal: AbortSignal.timeout(RESPONSE_BOUND) })
          if (release === "cancel") {
            first.stdin.write(
              `${JSON.stringify({ jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: 1 } })}\n`
            )
          } else if (release === "eof") first.stdin.end()
          else first.child.kill("SIGKILL")
          await closed
          if (release === "cancel") {
            const resumed = once(first.lines, "line", { signal: AbortSignal.timeout(RESPONSE_BOUND) }).then(([line]) =>
              parseReply(line)
            )
            first.stdin.write(requestFor("first", "ping"))
            expect(await resumed).toEqual({ id: 1, result: { host: "first" } })
          } else {
            expect(await first.exit).toEqual(release === "eof" ? [0, null] : [null, "SIGKILL"])
          }
        }
        const continued = once(second.lines, "line", { signal: AbortSignal.timeout(RESPONSE_BOUND) }).then(([line]) =>
          parseReply(line)
        )
        second.stdin.write(requestFor("second"))
        expect(await continued).toEqual({ id: 1, result: { host: "second" } })
      }
    } finally {
      for (const adapter of adapters) {
        adapter.child.kill()
        adapter.lines.close()
      }
      await Promise.all(adapters.map((adapter) => adapter.exit))
      await Promise.all(adapters.map((adapter) => adapter.closed))
      backend.closeAllConnections()
      await new Promise<void>((resolve, reject) => backend.close((error) => (error ? reject(error) : resolve())))
    }
    expect(adapters.flatMap((adapter) => adapter.observationErrors)).toEqual([])
    if (release === "missing-terminal")
      expect(
        adapters.at(0)?.observations.some((observation) => observation.event === "End" && !observation.accepted)
      ).toBe(true)
    await replayResidentResponses(adapters.map((adapter) => adapter.observations))
    if (contentType === "application/json" && release === "none") {
      const contradicted = adapters.map((adapter) =>
        adapter.observations.map((observation) =>
          observation.event === "OwnReply" ? { ...observation, accepted: false } : observation
        )
      )
      await expect(replayResidentResponses(contradicted)).rejects.toThrow("error: Tests failed")
    }
  })
})
