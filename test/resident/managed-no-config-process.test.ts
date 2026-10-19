import { execFile } from "node:child_process"
import * as fs from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"
import { Client } from "@modelcontextprotocol/client"
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio"
import { Deferred, Effect, Schema } from "effect"
import { afterAll, beforeAll, expect, it } from "vitest"

import { buildIsolatedStdioServer } from "../helpers/stdio-build.js"
import { testStdioEnvironment } from "../helpers/stdio-environment.js"

const REQUEST_BOUND = 5_000
const PROCESS_BOUND = 30_000
let bundle: Awaited<ReturnType<typeof buildIsolatedStdioServer>>
let passed = 0
const EXPECTED_CASES = 3
const runFile = promisify(execFile)
beforeAll(async () => {
  bundle = await buildIsolatedStdioServer(PROCESS_BOUND)
}, PROCESS_BOUND)
afterAll(async () => {
  if (passed === EXPECTED_CASES) await bundle.cleanup()
})

it("keeps lazy NoConfig discovery local before acquiring resident ownership", { timeout: PROCESS_BOUND }, async () => {
  const root = await fs.mkdtemp(join(await fs.realpath(tmpdir()), "resident-no-config-"))
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [bundle.path],
    stderr: "ignore",
    env: {
      ...testStdioEnvironment(),
      MCP_TRANSPORT: "stdio-resident",
      LAZY_ENVS: "true",
      MCP_RESIDENT_STATE_DIRECTORY: root
    }
  })
  const client = new Client(
    { name: "codex-mcp-client", version: "1.0" },
    { versionNegotiation: { mode: { pin: "2026-07-28" } } }
  )
  const closed = Effect.runSync(Deferred.make<void>())
  client.onclose = () => Effect.runSync(Deferred.succeed(closed, undefined))
  try {
    await client.connect(transport, { timeout: REQUEST_BOUND })
    const tools = await client.listTools(undefined, { timeout: REQUEST_BOUND })
    expect(tools.tools.some((tool) => tool.name === "get_version")).toBe(true)
    const version = await client.callTool({ name: "get_version", arguments: {} }, { timeout: REQUEST_BOUND })
    expect(version.isError ?? false).toBe(false)
    expect(await fs.readdir(root)).toEqual([])
  } finally {
    const ownsAdapter = transport.pid !== null
    await transport.close()
    if (ownsAdapter) await Effect.runPromise(Deferred.await(closed).pipe(Effect.timeout(REQUEST_BOUND)))
    if ((await fs.readdir(root)).length === 0) await fs.rmdir(root)
  }
  passed++
})

it(
  "retains explicit profile diagnostics instead of falling back to lazy NoConfig",
  { timeout: PROCESS_BOUND },
  async () => {
    const error = await runFile(process.execPath, [bundle.path], {
      timeout: REQUEST_BOUND,
      env: { ...testStdioEnvironment(), MCP_TRANSPORT: "stdio-resident", HULY_PROFILE: " " }
    }).then(
      () => {
        throw new Error("Invalid profile unexpectedly started")
      },
      (failure: unknown) => Schema.decodeUnknownSync(Schema.Struct({ stderr: Schema.String }))(failure)
    )
    expect(error.stderr).toContain("Invalid resolved Huly CLI configuration.")
    passed++
  }
)

it("does not disclose invalid authority bytes through startup diagnostics", { timeout: PROCESS_BOUND }, async () => {
  const error = await runFile(process.execPath, [bundle.path], {
    timeout: REQUEST_BOUND,
    env: {
      ...testStdioEnvironment(),
      MCP_TRANSPORT: "stdio-resident",
      HULY_URL: "fixture-url-secret",
      HULY_WORKSPACE: "fixture",
      HULY_TOKEN: "fixture-token-secret"
    }
  }).then(
    () => {
      throw new Error("Invalid authority unexpectedly started")
    },
    (failure: unknown) => Schema.decodeUnknownSync(Schema.Struct({ stderr: Schema.String }))(failure)
  )
  expect(error.stderr).toContain("Configuration error:")
  expect(error.stderr).toContain('["HULY_URL"]')
  expect(error.stderr).not.toContain("fixture-url-secret")
  expect(error.stderr).not.toContain("fixture-token-secret")
  passed++
})
