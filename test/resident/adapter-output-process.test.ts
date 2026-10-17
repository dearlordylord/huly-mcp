import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { once } from "node:events"
import { createInterface } from "node:readline"
import { Schema } from "effect"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { buildIsolatedStdioServer } from "../helpers/stdio-build.js"
import { testStdioEnvironment } from "../helpers/stdio-environment.js"
import { fixturePackageVersion, startResidentFixture } from "../helpers/resident-fixture.js"

const PROCESS_BOUND = 30_000
const EXIT_BOUND = 15_000
const RESPONSE_BOUND = 5_000
const BODY_SIZE = 1024 * 1024
const AUTHORIZATION = "private-output-fixture-authorization"
const Request = Schema.Struct({ id: Schema.Number, params: Schema.Struct({ uri: Schema.String }) })
const Reply = Schema.Struct({ id: Schema.Number, result: Schema.Struct({ text: Schema.String }) })
let bundle: Awaited<ReturnType<typeof buildIsolatedStdioServer>>

beforeAll(async () => {
  bundle = await buildIsolatedStdioServer(PROCESS_BOUND)
})
afterAll(async () => {
  await bundle.cleanup()
})

const send = (child: ChildProcessWithoutNullStreams, uri: string) =>
  child.stdin.write(
    `${JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "resources/read",
      params: {
        uri,
        _meta: {
          "io.modelcontextprotocol/protocolVersion": "2026-07-28",
          "io.modelcontextprotocol/clientCapabilities": {},
          "io.modelcontextprotocol/clientInfo": { name: uri, version: "1.0" }
        }
      }
    })}\n`
  )

const stop = async (child: ChildProcessWithoutNullStreams) => {
  if (child.exitCode !== null || child.signalCode !== null) return
  const exit = once(child, "exit", { signal: AbortSignal.timeout(RESPONSE_BOUND) })
  child.kill("SIGKILL")
  await exit
}

describe("manual adapter output ownership", { timeout: PROCESS_BOUND }, () => {
  it.each(["closed", "unread"])("bounds %s stdout while another host continues", async (mode) => {
    const fixture = await startResidentFixture(
      (request, response) => {
        void (async () => {
          expect(request.headers.authorization).toBe(`Bearer ${AUTHORIZATION}`)
          request.setEncoding("utf8")
          const chunks: Array<string> = []
          for await (const chunk of request) chunks.push(Schema.decodeUnknownSync(Schema.String)(chunk))
          const message = Schema.decodeUnknownSync(Schema.fromJsonString(Request))(chunks.join(""))
          response.writeHead(200, { "content-type": "application/json" })
          response.end(
            JSON.stringify({
              jsonrpc: "2.0",
              id: message.id,
              result: { text: message.params.uri === "blocked" ? "x".repeat(BODY_SIZE) : "survivor" }
            })
          )
        })().catch(() => {
          response.writeHead(500)
          response.end()
        })
      },
      AUTHORIZATION,
      await fixturePackageVersion()
    )
    const environment = {
      ...testStdioEnvironment(),
      MCP_TRANSPORT: "stdio-http",
      MCP_RESIDENT_ATTACHMENT_FILE: fixture.file
    }
    const blocked = spawn(process.execPath, [bundle.path], { env: environment })
    const survivor = spawn(process.execPath, [bundle.path], { env: environment })
    const diagnostic: Array<string> = []
    blocked.stderr.setEncoding("utf8").on("data", (chunk: string) => diagnostic.push(chunk))
    const lines = createInterface({ input: survivor.stdout })
    const failed = once(blocked, "exit", { signal: AbortSignal.timeout(EXIT_BOUND) })
    try {
      if (mode === "closed") blocked.stdout.destroy()
      else blocked.stdout.pause()
      send(blocked, "blocked")
      const response = once(lines, "line", { signal: AbortSignal.timeout(RESPONSE_BOUND) })
      send(survivor, "survivor")
      const [line] = await response
      expect(Schema.decodeUnknownSync(Schema.fromJsonString(Reply))(line)).toEqual({
        id: 1,
        result: { text: "survivor" }
      })
      expect(await failed).toEqual([1, null])
      expect(diagnostic.join("")).not.toContain(AUTHORIZATION)
      const continued = once(lines, "line", { signal: AbortSignal.timeout(RESPONSE_BOUND) })
      send(survivor, "survivor")
      const [next] = await continued
      expect(Schema.decodeUnknownSync(Schema.fromJsonString(Reply))(next)).toEqual({
        id: 1,
        result: { text: "survivor" }
      })
    } finally {
      await Promise.all([stop(blocked), stop(survivor)])
      lines.close()
      await fixture.cleanup()
    }
  })
})
