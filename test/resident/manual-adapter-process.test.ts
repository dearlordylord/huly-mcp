import { spawn } from "node:child_process"
import { once } from "node:events"
import { createServer } from "node:http"
import { createInterface } from "node:readline"
import { Schema } from "effect"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { buildIsolatedStdioServer } from "../helpers/stdio-build.js"
import { testStdioEnvironment } from "../helpers/stdio-environment.js"

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
const requestFor = (host: string) =>
  `${JSON.stringify({
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
  bundle = await buildIsolatedStdioServer(PROCESS_BOUND)
})
afterAll(async () => {
  await bundle.cleanup()
})

describe("packaged manual adapter", { timeout: PROCESS_BOUND }, () => {
  it.each([
    { contentType: "application/json", cancelFirst: false },
    { contentType: "text/event-stream", cancelFirst: false },
    { contentType: "text/event-stream", cancelFirst: true }
  ])("isolates colliding IDs through $contentType (cancel=$cancelFirst)", async ({ cancelFirst, contentType }) => {
    const backend = createServer((request, response) => {
      void (async () => {
        expect(request.headers.authorization).toBe(`Bearer ${AUTHORIZATION}`)
        request.setEncoding("utf8")
        const chunks: Array<string> = []
        for await (const chunk of request) chunks.push(Schema.decodeUnknownSync(Schema.String)(chunk))
        const message = Schema.decodeUnknownSync(Schema.fromJsonString(HostRequest))(chunks.join(""))
        const host = message.params._meta["io.modelcontextprotocol/clientInfo"].name
        if (cancelFirst && host === "first") {
          response.once("close", () => backend.emit("first-stream-closed"))
          response.writeHead(200, { "content-type": contentType })
          response.write(
            `data: ${JSON.stringify({
              jsonrpc: "2.0",
              method: "notifications/progress",
              params: { progressToken: host, progress: 1 }
            })}\n\n`
          )
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
      const child = spawn(process.execPath, [bundle.path], {
        env: {
          ...testStdioEnvironment(),
          MCP_TRANSPORT: "stdio-http",
          MCP_STDIO_BACKEND_URL: `http://127.0.0.1:${address.port}/mcp`,
          MCP_AUTH_TOKEN: AUTHORIZATION
        }
      })
      const lines = createInterface({ input: child.stdout })
      const response = once(lines, "line", { signal: AbortSignal.timeout(RESPONSE_BOUND) }).then(([line]) =>
        parseMessage(line)
      )
      const exit = once(child, "exit")
      child.stdin.write(requestFor(host))
      return { child, exit, lines, response }
    })
    try {
      expect(await Promise.all(adapters.map((adapter) => adapter.response))).toEqual([
        cancelFirst
          ? { method: "notifications/progress", params: { progressToken: "first", progress: 1 } }
          : { id: 1, result: { host: "first" } },
        { id: 1, result: { host: "second" } }
      ])
      if (cancelFirst) {
        const [first, second] = adapters
        if (first === undefined || second === undefined) throw new Error("Expected two owned adapter processes")
        const closed = once(backend, "first-stream-closed", { signal: AbortSignal.timeout(RESPONSE_BOUND) })
        first.child.stdin.write(
          `${JSON.stringify({ jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: 1 } })}\n`
        )
        await closed
        const continued = once(second.lines, "line", { signal: AbortSignal.timeout(RESPONSE_BOUND) }).then(([line]) =>
          parseReply(line)
        )
        second.child.stdin.write(requestFor("second"))
        expect(await continued).toEqual({ id: 1, result: { host: "second" } })
      }
    } finally {
      for (const adapter of adapters) {
        adapter.child.kill()
        adapter.lines.close()
      }
      await Promise.all(adapters.map((adapter) => adapter.exit))
      backend.closeAllConnections()
      await new Promise<void>((resolve, reject) => backend.close((error) => (error ? reject(error) : resolve())))
    }
  })
})
