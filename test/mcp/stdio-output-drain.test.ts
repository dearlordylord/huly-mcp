import { spawn } from "node:child_process"
import { once } from "node:events"
import { mkdtemp, rm } from "node:fs/promises"
import { join, resolve } from "node:path"

import { build } from "esbuild"
import { Result, Schema } from "effect"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

const PROCESS_TIMEOUT_MS = 30_000
const CALL_COUNT = 12
const fixturePath = resolve(process.cwd(), "test/mcp/fixtures/stdio-drain-server.ts")
const StartedMessage = Schema.Struct({ type: Schema.Literal("started") })
const ResponseEnvelope = Schema.Struct({ id: Schema.Number, jsonrpc: Schema.Literal("2.0") })
const parseResponseEnvelope = Schema.decodeUnknownSync(Schema.fromJsonString(ResponseEnvelope))
let fixtureDirectory = ""
let fixtureBundle = ""

beforeAll(async () => {
  fixtureDirectory = await mkdtemp(join(process.cwd(), ".tmp-stdio-drain-"))
  fixtureBundle = join(fixtureDirectory, "fixture.cjs")
  await build({
    bundle: true,
    entryPoints: [fixturePath],
    external: ["ws"],
    format: "cjs",
    logLevel: "silent",
    outfile: fixtureBundle,
    platform: "node"
  })
})

afterAll(async () => {
  if (fixtureDirectory !== "") await rm(fixtureDirectory, { force: true, recursive: true })
})

const withTimeout = <A>(promise: Promise<A>, label: string): Promise<A> =>
  new Promise((resolvePromise, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} exceeded ${String(PROCESS_TIMEOUT_MS)}ms`)),
      PROCESS_TIMEOUT_MS
    )
    void promise.then(
      (value) => {
        clearTimeout(timer)
        resolvePromise(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error)
      }
    )
  })

const modernMeta = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientCapabilities": {},
  "io.modelcontextprotocol/clientInfo": { name: "stdio-drain-certification", version: "1.0.0" }
}

describe("Effect stdio output drain", () => {
  it(
    "writes a delayed large response admitted before EOF before exiting",
    { timeout: PROCESS_TIMEOUT_MS + 1_000 },
    async () => {
      const child = spawn(process.execPath, [fixtureBundle], {
        cwd: process.cwd(),
        env: { ...process.env, HULY_MCP_TELEMETRY: "0" },
        stdio: ["pipe", "pipe", "pipe", "ipc"]
      })
      const { stderr, stdin, stdout } = child
      if (stderr === null || stdin === null || stdout === null) throw new Error("fixture stdio pipes were not created")
      const output = { stderr: "", stdout: "" }
      stdout.setEncoding("utf8")
      stderr.setEncoding("utf8")
      stdout.on("data", (chunk: string) => {
        output.stdout += chunk
      })
      stderr.on("data", (chunk: string) => {
        output.stderr += chunk
      })
      const started = new Promise<void>((resolveStarted) => {
        let count = 0
        child.on("message", (message: unknown) => {
          if (Result.isFailure(Schema.decodeUnknownResult(StartedMessage)(message))) return
          count++
          if (count === CALL_COUNT) resolveStarted()
        })
      })
      const exited = once(child, "exit").then(([code, signal]) => ({ code, signal }))

      try {
        const discovery = JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "server/discover",
          params: { _meta: modernMeta }
        })
        const calls = Array.from({ length: CALL_COUNT }, (_, index) =>
          JSON.stringify({
            jsonrpc: "2.0",
            id: index + 2,
            method: "tools/call",
            params: { name: "delayed_large_response", arguments: {}, _meta: modernMeta }
          })
        )
        stdin.end(`${[discovery, ...calls].join("\n")}\n`)
        await withTimeout(
          Promise.race([
            started,
            exited.then(({ code, signal }) =>
              Promise.reject(
                new Error(
                  `fixture exited before operation admission: code=${String(code)} signal=${String(signal)} stdout=${output.stdout} stderr=${output.stderr}`
                )
              )
            )
          ]),
          "operation admission"
        )
        child.send({ type: "release" })

        expect(await withTimeout(exited, "stdio drain fixture exit")).toEqual({ code: 0, signal: null })
        const responseLines = output.stdout.split("\n").filter((line) => line.includes("stdio-drain-payload:"))
        const responseIds = responseLines
          .map((line) => parseResponseEnvelope(line).id)
          .sort((left, right) => left - right)
        expect(responseIds).toEqual(Array.from({ length: CALL_COUNT }, (_, index) => index + 2))
        expect(responseLines.every((line) => line.length > 128_000)).toBe(true)
        expect(output.stderr).toBe("")
      } finally {
        if (child.exitCode === null) child.kill("SIGKILL")
      }
    }
  )
})
