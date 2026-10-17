import { spawn } from "node:child_process"
import { once } from "node:events"
import * as fs from "node:fs/promises"
import { join } from "node:path"
import { createInterface } from "node:readline"
import { Schema } from "effect"
import { expect, it } from "vitest"

import { fixturePackageVersion, startResidentFixture } from "../helpers/resident-fixture.js"
import { withRegistryDirectory } from "../helpers/resident-registry-fixture.js"
import { buildIsolatedStdioServer } from "../helpers/stdio-build.js"
import { testStdioEnvironment } from "../helpers/stdio-environment.js"

const PROCESS_BOUND = 30_000
const RESPONSE_BOUND = 5_000
const FixtureWrite = Schema.Struct({
  jsonrpc: Schema.Literal("2.0"),
  id: Schema.Literal(1),
  method: Schema.Literal("tools/call"),
  params: Schema.Struct({ name: Schema.Literal("fixture_increment"), arguments: Schema.Struct({}) })
})
const FixtureState = Schema.Struct({ writes: Schema.Literal(1) })
const FixtureProgress = Schema.Struct({
  jsonrpc: Schema.Literal("2.0"),
  method: Schema.Literal("notifications/progress"),
  params: Schema.Struct({ progressToken: Schema.Literal("fixture-write"), progress: Schema.Literal(1) })
})
const progressLine = Schema.encodeSync(Schema.fromJsonString(FixtureProgress))({
  jsonrpc: "2.0",
  method: "notifications/progress",
  params: { progressToken: "fixture-write", progress: 1 }
})

it.each(["before-headers", "after-progress"])(
  "reports an unknown committed write after %s response loss without dispatching it twice",
  { timeout: PROCESS_BOUND },
  async (mode) => {
    const bundle = await buildIsolatedStdioServer(PROCESS_BOUND)
    let passed = false
    try {
      await withRegistryDirectory(async (directory) => {
        const stateFile = join(directory, "state.json")
        let dispatches = 0
        let truncate: (() => void) | undefined
        const failures: Array<unknown> = []
        const fixture = await startResidentFixture(
          (request, response) => {
            const chunks: Array<Buffer> = []
            request.on("data", (chunk: Buffer) => chunks.push(chunk))
            request.once("end", () => {
              void (async () => {
                Schema.decodeUnknownSync(Schema.fromJsonString(FixtureWrite))(Buffer.concat(chunks).toString("utf8"))
                dispatches++
                await fs.writeFile(stateFile, Schema.encodeSync(Schema.fromJsonString(FixtureState))({ writes: 1 }), {
                  flag: "wx",
                  mode: 0o600
                })
                if (mode === "after-progress") {
                  truncate = () => response.destroy()
                  response.writeHead(200, { "content-type": "text/event-stream" })
                  response.write(`data: ${progressLine}\n\n`)
                } else response.destroy()
              })().catch((error: unknown) => {
                failures.push(error)
                response.destroy()
              })
            })
          },
          "uncertain-write-private-fixture",
          await fixturePackageVersion()
        )
        try {
          const adapter = spawn(process.execPath, [bundle.path], {
            env: { ...testStdioEnvironment(), MCP_TRANSPORT: "stdio-http", MCP_RESIDENT_ATTACHMENT_FILE: fixture.file }
          })
          const lines = createInterface({ input: adapter.stdout })
          const progress =
            mode === "after-progress" ? once(lines, "line", { signal: AbortSignal.timeout(RESPONSE_BOUND) }) : undefined
          const closed = once(adapter, "close", { signal: AbortSignal.timeout(RESPONSE_BOUND) })
          const output: Array<Buffer> = []
          const diagnostics: Array<Buffer> = []
          adapter.stdout.on("data", (chunk: Buffer) => output.push(chunk))
          adapter.stderr.on("data", (chunk: Buffer) => diagnostics.push(chunk))
          try {
            adapter.stdin.write(
              `${Schema.encodeSync(Schema.fromJsonString(FixtureWrite))({
                jsonrpc: "2.0",
                id: 1,
                method: "tools/call",
                params: { name: "fixture_increment", arguments: {} }
              })}\n`
            )
            if (progress !== undefined) {
              const observed = Schema.decodeUnknownSync(Schema.Tuple([Schema.String]))(await progress)
              expect(observed[0]).toBe(progressLine)
              if (truncate === undefined) throw new Error("Progress arrived before the committed-write fault seam")
              truncate()
            }
            expect(await closed).toEqual([1, null])
            expect(Buffer.concat(output).toString("utf8")).toBe(mode === "after-progress" ? `${progressLine}\n` : "")
            expect(Buffer.concat(diagnostics).toString("utf8")).toContain("operation outcome may be unknown")
            expect(Buffer.concat(diagnostics).toString("utf8")).toContain("No request was replayed")
            expect(
              Schema.decodeUnknownSync(Schema.fromJsonString(FixtureState))(await fs.readFile(stateFile, "utf8"))
            ).toEqual({ writes: 1 })
            expect(dispatches).toBe(1)
            expect(failures).toEqual([])
          } finally {
            lines.close()
            if (adapter.exitCode === null && adapter.signalCode === null) {
              adapter.kill("SIGKILL")
              await once(adapter, "close", { signal: AbortSignal.timeout(RESPONSE_BOUND) })
            }
          }
        } finally {
          await fixture.cleanup()
        }
      })
      passed = true
    } finally {
      if (passed) await bundle.cleanup()
    }
  }
)
