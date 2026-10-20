import { spawn } from "node:child_process"
import { once } from "node:events"
import { createInterface } from "node:readline"
import { resolve } from "node:path"
import { createServer, type Socket } from "node:net"
import * as fs from "node:fs/promises"
import { Effect, Redacted, Schema } from "effect"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { makeByteDisclosureDetector } from "../helpers/byte-disclosure.js"
import { buildIsolatedStdioServer } from "../helpers/stdio-build.js"
import { testStdioEnvironment } from "../helpers/stdio-environment.js"
import { replayResidentResponses } from "../helpers/resident-response-replay.js"
import { prepareResidentQuintCli } from "../helpers/resident-quint-cli.js"
import { ResidentResponseObservation } from "../../src/resident/response-observations.js"
import { fixturePackageVersion, startResidentFixture } from "../helpers/resident-fixture.js"
import { ResidentAttachment } from "../../src/resident/attachment-file.js"

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
const prepareResources = async () => {
  const bundle = await buildIsolatedStdioServer(PROCESS_BOUND)
  try {
    return { bundle, quint: await prepareResidentQuintCli() }
  } catch (error) {
    await bundle.cleanup()
    throw error
  }
}
let resources: Awaited<ReturnType<typeof prepareResources>>
let preparation: ReturnType<typeof prepareResources> | undefined
beforeAll(async () => {
  preparation = prepareResources()
  resources = await preparation
}, PROCESS_BOUND)
afterAll(async () => {
  await preparation?.then(
    ({ bundle, quint }) => Promise.all([bundle.cleanup(), quint.cleanup()]),
    () => undefined
  )
})

describe("packaged manual adapter", { timeout: PROCESS_BOUND }, () => {
  it("refuses a same-port plaintext replacement before disclosing authorization or an operation", async () => {
    const fixture = await startResidentFixture(
      (_request, response) => response.end(),
      AUTHORIZATION,
      await fixturePackageVersion()
    )
    const descriptor = Schema.decodeUnknownSync(Schema.fromJsonString(ResidentAttachment))(
      await fs.readFile(fixture.file, "utf8")
    )
    const sockets = new Set<Socket>()
    let leaked = false
    const replacement = createServer((socket) => {
      const detectsDisclosure = makeByteDisclosureDetector([
        Buffer.from(AUTHORIZATION),
        Buffer.from("server/discover"),
        Buffer.from(Redacted.value(descriptor.identity.key), "hex")
      ])
      sockets.add(socket)
      socket.once("close", () => sockets.delete(socket))
      socket.on("data", (bytes: Buffer) => {
        leaked = detectsDisclosure(bytes) || leaked
        if (!socket.writableEnded) socket.end("HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\n{}")
      })
    })
    try {
      await new Promise<void>((resolve, reject) =>
        fixture.backend.close((error) => (error ? reject(error) : resolve()))
      )
      replacement.listen(Number(descriptor.endpoint.port), "127.0.0.1")
      await once(replacement, "listening")
      const child = spawn(process.execPath, [resources.bundle.path], {
        env: { ...testStdioEnvironment(), MCP_TRANSPORT: "stdio-http", MCP_RESIDENT_ATTACHMENT_FILE: fixture.file }
      })
      const closed = once(child, "close", { signal: AbortSignal.timeout(RESPONSE_BOUND) })
      const output: Array<Buffer> = []
      child.stdout.on("data", (bytes: Buffer) => output.push(bytes))
      child.stdin.write(requestFor("first"))
      try {
        expect(await closed).toEqual([1, null])
        expect(leaked).toBe(false)
        expect(Buffer.concat(output).length).toBe(0)
      } finally {
        if (child.exitCode === null && child.signalCode === null) {
          child.kill("SIGKILL")
          await once(child, "close", { signal: AbortSignal.timeout(RESPONSE_BOUND) })
        }
      }
    } finally {
      for (const socket of sockets) socket.destroy()
      if (replacement.listening)
        await new Promise<void>((resolve, reject) => replacement.close((error) => (error ? reject(error) : resolve())))
      await fixture.cleanup()
    }
  })

  it.each([
    { contentType: "application/json", release: "none" },
    { contentType: "text/event-stream", release: "none" },
    { contentType: "text/event-stream", release: "cancel" },
    { contentType: "text/event-stream", release: "eof" },
    { contentType: "text/event-stream", release: "death" },
    { contentType: "text/event-stream", release: "missing-terminal" }
  ])("isolates colliding IDs through $contentType (release=$release)", async ({ contentType, release }) => {
    const holdFirst = release !== "none"
    const fixture = await startResidentFixture(
      (request, response) => {
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
      },
      AUTHORIZATION,
      await fixturePackageVersion()
    )
    const { backend } = fixture
    const adapters = ["first", "second"].map((host) => {
      const child = spawn(
        process.execPath,
        ["--import", resolve("test/resident/fixtures/observe-responses.mjs"), resources.bundle.path],
        {
          stdio: ["pipe", "pipe", "pipe", "ipc"],
          env: { ...testStdioEnvironment(), MCP_TRANSPORT: "stdio-http", MCP_RESIDENT_ATTACHMENT_FILE: fixture.file }
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
      await fixture.cleanup()
    }
    expect(adapters.flatMap((adapter) => adapter.observationErrors)).toEqual([])
    if (release === "missing-terminal")
      expect(
        adapters.at(0)?.observations.some((observation) => observation.event === "End" && !observation.accepted)
      ).toBe(true)
    await replayResidentResponses(
      adapters.map((adapter) => adapter.observations),
      resources.quint.cli
    )
    if (contentType === "application/json" && release === "none") {
      const contradicted = adapters.map((adapter) =>
        adapter.observations.map((observation) =>
          observation.event === "OwnReply" ? { ...observation, accepted: false } : observation
        )
      )
      await expect(replayResidentResponses(contradicted, resources.quint.cli)).rejects.toThrow("error: Tests failed")
    }
  })
})
