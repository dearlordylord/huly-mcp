import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { once } from "node:events"
import { createInterface } from "node:readline"
import { Client } from "@modelcontextprotocol/client"
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio"
import { Effect, Schema } from "effect"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { buildIsolatedStdioServer } from "../helpers/stdio-build.js"
import { testStdioEnvironment } from "../helpers/stdio-environment.js"

const PROCESS_BOUND = 30_000
const RESPONSE_BOUND = 5_000
const READY_PREFIX = "MCP HTTP server listening on "
const AUTHORIZATION = "private-native-backend-fixture"
const PROTOCOL = "2026-07-28"
let bundle: Awaited<ReturnType<typeof buildIsolatedStdioServer>>
let backend: ChildProcessWithoutNullStreams
let endpoint: string

beforeAll(async () => {
  bundle = await buildIsolatedStdioServer(PROCESS_BOUND)
  backend = spawn(process.execPath, [bundle.path], {
    env: {
      ...testStdioEnvironment(),
      MCP_TRANSPORT: "http",
      MCP_HTTP_HOST: "127.0.0.1",
      MCP_HTTP_PORT: "0",
      MCP_AUTH_TOKEN: AUTHORIZATION,
      HULY_TOOL_MODE: "auto",
      HULY_URL: "http://127.0.0.1:1",
      HULY_WORKSPACE: "fixture",
      HULY_TOKEN: "fixture-huly-token"
    }
  })
  const lines = createInterface({ input: backend.stderr })
  const readiness = (async () => {
    for await (const line of lines) {
      if (line.startsWith(READY_PREFIX))
        return Schema.decodeUnknownSync(Schema.URLFromString)(line.slice(READY_PREFIX.length)).href
    }
    throw new Error("Owned native backend exited before announcing its listener")
  })()
  endpoint = await Effect.runPromise(Effect.promise(() => readiness).pipe(Effect.timeout(RESPONSE_BOUND)))
}, PROCESS_BOUND)

afterAll(async () => {
  if (backend !== undefined && backend.exitCode === null && backend.signalCode === null) {
    const exit = once(backend, "exit", { signal: AbortSignal.timeout(RESPONSE_BOUND) })
    backend.kill("SIGTERM")
    try {
      await exit
    } finally {
      if (backend.exitCode === null && backend.signalCode === null) {
        const forcedExit = once(backend, "exit", { signal: AbortSignal.timeout(RESPONSE_BOUND) })
        backend.kill("SIGKILL")
        await forcedExit
      }
    }
  }
  await bundle?.cleanup()
})

describe("manual adapters against the packaged native HTTP backend", { timeout: PROCESS_BOUND }, () => {
  it.each(["modern", "legacy"])("preserves %s host identity and catalog policy", async (mode) => {
    const hosts = ["claude-code", "codex-mcp-client"].map((name) => {
      const transport = new StdioClientTransport({
        command: process.execPath,
        args: [bundle.path],
        stderr: "pipe",
        env: {
          ...testStdioEnvironment(),
          MCP_TRANSPORT: "stdio-http",
          MCP_STDIO_BACKEND_URL: endpoint,
          MCP_AUTH_TOKEN: AUTHORIZATION
        }
      })
      const client = new Client(
        { name, version: "1.0" },
        { versionNegotiation: mode === "modern" ? { mode: { pin: PROTOCOL } } : { mode: "legacy" } }
      )
      return { client, name, transport }
    })
    try {
      await Promise.all(hosts.map(({ client, transport }) => client.connect(transport, { timeout: RESPONSE_BOUND })))
      for (const { client, name } of hosts) {
        const tools = await client.listTools(undefined, { timeout: RESPONSE_BOUND })
        const names = tools.tools.map((tool) => tool.name)
        expect(names).toContain("get_huly_context")
        expect(names.includes("list_projects")).toBe(name === "claude-code")
        expect(names.includes("invoke_tool")).toBe(name === "codex-mcp-client")
        const result = await client.callTool({ name: "get_huly_context", arguments: {} }, { timeout: RESPONSE_BOUND })
        expect(result.isError, JSON.stringify(result)).not.toBe(true)
      }
    } finally {
      await Promise.all(hosts.map(({ transport }) => transport.close()))
    }
  })
})
