import { execFileSync } from "node:child_process"
import { resolve } from "node:path"
import { PassThrough } from "node:stream"

import { Client, ReadBuffer, serializeMessage, type Transport } from "@modelcontextprotocol/client"
import { getDefaultEnvironment, StdioClientTransport } from "@modelcontextprotocol/client/stdio"
import { Server } from "@modelcontextprotocol/server"
import { serveStdio, StdioServerTransport } from "@modelcontextprotocol/server/stdio"
import { Schema } from "effect"
import { beforeAll, describe, expect, it } from "vitest"

const protocolVersion = "2026-07-28"
const legacyProtocolVersion = "2025-06-18"
const builtServerPath = resolve(process.cwd(), "dist/index.cjs")
const SPAWNED_PROCESS_TEST_TIMEOUT_MS = 15_000
const JsonRpcResponseSchema = Schema.Struct({
  jsonrpc: Schema.Literal("2.0"),
  id: Schema.NullOr(Schema.Union(Schema.String, Schema.Number)),
  result: Schema.optionalWith(Schema.Record({ key: Schema.String, value: Schema.Unknown }), { exact: true }),
  error: Schema.optionalWith(
    Schema.Struct({
      code: Schema.Number,
      message: Schema.String,
      data: Schema.optionalWith(Schema.Unknown, { exact: true })
    }),
    { exact: true }
  )
})
type JsonRpcResponse = Schema.Schema.Type<typeof JsonRpcResponseSchema>
type JsonRpcMessage = Parameters<Transport["send"]>[0]

const createTestServer = (): Server => {
  const server = new Server(
    { name: "stdio-test", version: "1.0.0" },
    { capabilities: { tools: {} }, instructions: "final protocol with legacy compatibility" }
  )
  server.setRequestHandler("tools/list", async () => ({
    tools: [{ name: "hello", description: "Return a greeting.", inputSchema: { type: "object" } }]
  }))
  return server
}

const exchange = async (message: Record<string, unknown>): Promise<JsonRpcResponse> => {
  const input = new PassThrough()
  const output = new PassThrough()
  let buffered = ""
  const response = new Promise<JsonRpcResponse>((resolve, reject) => {
    output.on("data", (chunk: Buffer) => {
      buffered += chunk.toString()
      const newline = buffered.indexOf("\n")
      if (newline < 0) return
      try {
        resolve(Schema.decodeUnknownSync(JsonRpcResponseSchema)(JSON.parse(buffered.slice(0, newline))))
      } catch (error) {
        reject(error)
      }
    })
  })
  const handle = serveStdio(createTestServer, { legacy: "serve", transport: new StdioServerTransport(input, output) })
  input.write(`${JSON.stringify(message)}\n`)
  const result = await response
  await handle.close()
  return result
}

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

class LoopbackStdioClientTransport implements Transport {
  readonly input = new PassThrough()
  readonly output = new PassThrough()
  private readonly buffer = new ReadBuffer()
  onclose?: () => void
  onerror?: (error: Error) => void
  onmessage?: Transport["onmessage"]

  async start(): Promise<void> {
    this.output.on("data", (chunk: Buffer) => {
      this.buffer.append(chunk)
      for (let message = this.buffer.readMessage(); message !== null; message = this.buffer.readMessage()) {
        this.onmessage?.(message)
      }
    })
    this.output.on("error", (error) => this.onerror?.(error))
  }

  async send(message: Parameters<Transport["send"]>[0]): Promise<void> {
    this.input.write(serializeMessage(message))
  }

  async close(): Promise<void> {
    this.input.end()
    this.output.end()
    this.onclose?.()
  }
}

describe("MCP 2026-07-28 stdio transport with 2025 compatibility", () => {
  beforeAll(() => {
    execFileSync("pnpm", ["build:mcp"], { cwd: process.cwd(), stdio: "ignore" })
  })

  it("connects with the released SDK client pinned to the final protocol", async () => {
    const transport = new LoopbackStdioClientTransport()
    const serverHandle = serveStdio(createTestServer, {
      legacy: "serve",
      transport: new StdioServerTransport(transport.input, transport.output)
    })
    const client = new Client(
      { name: "released-stdio-client", version: "1.0.0" },
      { versionNegotiation: { mode: { pin: protocolVersion } } }
    )

    await client.connect(transport)
    const result = await client.listTools()

    expect(result.tools.map((tool) => tool.name)).toContain("hello")
    await client.close()
    await serverHandle.close()
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

  it("serves the 2025-06-18 initialize handshake", async () => {
    const response = await exchange({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: legacyProtocolVersion,
        capabilities: {},
        clientInfo: { name: "legacy-stdio-client", version: "1.0.0" }
      }
    })

    expect(response.result).toMatchObject({
      protocolVersion: legacyProtocolVersion,
      capabilities: { tools: {} },
      serverInfo: { name: "stdio-test", version: "1.0.0" }
    })
  })

  it("connects a released legacy client and lists tools on the pinned connection", async () => {
    const transport = new LoopbackStdioClientTransport()
    const serverHandle = serveStdio(createTestServer, {
      legacy: "serve",
      transport: new StdioServerTransport(transport.input, transport.output)
    })
    const client = new Client(
      { name: "legacy-stdio-client", version: "1.0.0" },
      { versionNegotiation: { mode: "legacy" } }
    )

    await client.connect(transport)
    const result = await client.listTools()

    expect(client.getServerVersion()).toMatchObject({ name: "stdio-test", version: "1.0.0" })
    expect(result.tools.map((tool) => tool.name)).toContain("hello")
    await client.close()
    await serverHandle.close()
  })

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

  it("discovers the final protocol and SDK-owned response metadata", async () => {
    const response = await exchange({ jsonrpc: "2.0", id: 1, method: "server/discover", params: { _meta: meta } })

    expect(response.result).toMatchObject({
      supportedVersions: [protocolVersion],
      resultType: "complete",
      ttlMs: 0,
      cacheScope: "private",
      _meta: { "io.modelcontextprotocol/serverInfo": { name: "stdio-test", version: "1.0.0" } }
    })
  })

  it("serves the tool catalog without initialize", async () => {
    const response = await exchange({ jsonrpc: "2.0", id: 1, method: "tools/list", params: { _meta: meta } })

    expect(response.result).toMatchObject({
      tools: [{ name: "hello" }],
      resultType: "complete",
      ttlMs: 0,
      cacheScope: "private"
    })
  })
})
