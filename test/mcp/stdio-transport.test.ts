import { execFileSync, spawn } from "node:child_process"
import { resolve } from "node:path"

import { Client, type Transport } from "@modelcontextprotocol/client"
import { getDefaultEnvironment, StdioClientTransport } from "@modelcontextprotocol/client/stdio"
import { Schema } from "effect"
import { beforeAll, describe, expect, it } from "vitest"

const protocolVersion = "2026-07-28"
const legacyProtocolVersion = "2025-06-18"
const builtServerPath = resolve(process.cwd(), "dist/index.cjs")
const SPAWNED_PROCESS_TEST_TIMEOUT_MS = 15_000
const JsonRpcResponseSchema = Schema.Struct({
  jsonrpc: Schema.Literal("2.0"),
  id: Schema.NullOr(Schema.Union([Schema.String, Schema.Number])),
  result: Schema.optionalKey(Schema.Record(Schema.String, Schema.Unknown)),
  error: Schema.optionalKey(
    Schema.Struct({ code: Schema.Number, message: Schema.String, data: Schema.optionalKey(Schema.Unknown) })
  )
})
type JsonRpcResponse = Schema.Schema.Type<typeof JsonRpcResponseSchema>
type JsonRpcMessage = Parameters<Transport["send"]>[0]
const parseJsonRpcResponse = Schema.decodeUnknownSync(Schema.fromJsonString(JsonRpcResponseSchema))

const sendAndReceive = (transport: Transport, message: JsonRpcMessage): Promise<JsonRpcResponse> =>
  new Promise((resolve, reject) => {
    transport.onmessage = (response) => {
      try {
        resolve(Schema.decodeUnknownSync(JsonRpcResponseSchema)(response))
      } catch (error) {
        reject(error)
      }
    }
    void transport.send(message).catch(reject)
  })

const meta = {
  "io.modelcontextprotocol/protocolVersion": protocolVersion,
  "io.modelcontextprotocol/clientCapabilities": {},
  "io.modelcontextprotocol/clientInfo": { name: "stdio-test", version: "1.0.0" }
}

describe("MCP 2026-07-28 stdio transport with 2025 compatibility", () => {
  beforeAll(() => {
    execFileSync("pnpm", ["build:mcp"], { cwd: process.cwd(), stdio: "ignore" })
  })

  it(
    "connects the released SDK client to the spawned built command",
    { timeout: SPAWNED_PROCESS_TEST_TIMEOUT_MS },
    async () => {
      const transport = new StdioClientTransport({
        command: process.execPath,
        args: [builtServerPath],
        env: { ...getDefaultEnvironment(), LAZY_ENVS: "true" },
        stderr: "pipe"
      })
      const client = new Client(
        { name: "spawned-released-client", version: "1.0.0" },
        { versionNegotiation: { mode: { pin: protocolVersion } } }
      )

      try {
        await client.connect(transport)
        const discovery = client.getDiscoverResult()
        const tools = await client.listTools()

        expect(discovery?.supportedVersions).toContain(protocolVersion)
        expect(tools.tools.map((tool) => tool.name)).toContain("get_huly_context")
      } finally {
        await transport.close()
      }
    }
  )

  it(
    "drains successful and invalid tool calls before the built command exits on EOF",
    { timeout: SPAWNED_PROCESS_TEST_TIMEOUT_MS },
    async () => {
      const child = spawn(process.execPath, [builtServerPath], {
        cwd: process.cwd(),
        env: { ...getDefaultEnvironment(), LAZY_ENVS: "true" },
        stdio: ["pipe", "pipe", "pipe"]
      })
      let stdout = ""
      let stderr = ""
      child.stdout.setEncoding("utf8")
      child.stderr.setEncoding("utf8")
      child.stdout.on("data", (chunk: string) => {
        stdout += chunk
      })
      child.stderr.on("data", (chunk: string) => {
        stderr += chunk
      })
      const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolveExit, reject) => {
        child.once("error", reject)
        child.once("close", (code, signal) => resolveExit({ code, signal }))
      })
      const request = (id: number, method: string, params: Record<string, unknown>) =>
        JSON.stringify({ jsonrpc: "2.0", id, method, params: { ...params, _meta: meta } })

      child.stdin.end(
        `${request(1, "server/discover", {})}\n${request(2, "tools/call", {
          name: "get_huly_context",
          arguments: {}
        })}\n${request(3, "tools/call", { name: "get_issue", arguments: {} })}\n`
      )

      const exit = await exited
      const responses = stdout
        .split("\n")
        .filter((line) => line.length > 0)
        .map((line) => parseJsonRpcResponse(line))
      const byId = new Map(responses.map((response) => [response.id, response]))

      expect(exit).toEqual({ code: 0, signal: null })
      expect(byId.get(1)?.result).toBeDefined()
      expect(byId.get(2)?.result).toMatchObject({ structuredContent: { result: { transport: { type: "stdio" } } } })
      expect(byId.get(3)?.result).toMatchObject({ isError: true })
      expect(stderr).not.toContain("FiberFailure")
    }
  )

  it(
    "connects a released legacy client to the spawned built command",
    { timeout: SPAWNED_PROCESS_TEST_TIMEOUT_MS },
    async () => {
      const transport = new StdioClientTransport({
        command: process.execPath,
        args: [builtServerPath],
        env: { ...getDefaultEnvironment(), LAZY_ENVS: "true" },
        stderr: "pipe"
      })
      const client = new Client(
        { name: "codex-mcp-client", version: "1.0.0" },
        { versionNegotiation: { mode: "legacy" } }
      )

      try {
        await client.connect(transport)
        const tools = await client.listTools()

        expect(tools.tools.map((tool) => tool.name)).toContain("get_huly_context")
      } finally {
        await transport.close()
      }
    }
  )

  it(
    "serves Codex's exact 2025-06-18 handshake and tool discovery from the built command",
    { timeout: SPAWNED_PROCESS_TEST_TIMEOUT_MS },
    async () => {
      const transport = new StdioClientTransport({
        command: process.execPath,
        args: [builtServerPath],
        env: { ...getDefaultEnvironment(), LAZY_ENVS: "true" },
        stderr: "pipe"
      })
      try {
        await transport.start()

        const initialized = await sendAndReceive(transport, {
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: legacyProtocolVersion,
            capabilities: {},
            clientInfo: { name: "codex", version: "1.0.0" }
          }
        })
        await transport.send({ jsonrpc: "2.0", method: "notifications/initialized" })
        const listed = await sendAndReceive(transport, { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} })

        expect(initialized.result).toMatchObject({ protocolVersion: legacyProtocolVersion })
        expect(initialized.error).toBeUndefined()
        expect(listed.result).toMatchObject({
          tools: expect.arrayContaining(
            ["get_huly_context", "search_tools", "get_tool_schema", "invoke_tool"].map((name) =>
              expect.objectContaining({ name })
            )
          )
        })
      } finally {
        await transport.close()
      }
    }
  )
})
