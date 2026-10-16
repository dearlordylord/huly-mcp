import { once } from "node:events"
import { createServer } from "node:http"
import { Client } from "@modelcontextprotocol/client"
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio"
import { afterAll, beforeAll, expect, it } from "vitest"
import { buildIsolatedStdioServer } from "../helpers/stdio-build.js"
import { testStdioEnvironment } from "../helpers/stdio-environment.js"

let entry: string
let cleanup: (() => Promise<void>) | undefined
beforeAll(async () => {
  const built = await buildIsolatedStdioServer(30000)
  entry = built.path
  cleanup = built.cleanup
}, 30000)
afterAll(async () => {
  await cleanup?.()
})

it.each(["2025-06-18", "2026-07-28"])(
  "completes %s stdio discovery before connecting to Huly",
  { timeout: 30000 },
  async (version) => {
    let requests = 0
    const endpoint = createServer((_request, response) => {
      requests += 1
      response.writeHead(503).end()
    })
    endpoint.listen(0, "127.0.0.1")
    await once(endpoint, "listening")
    const address = endpoint.address()
    if (address === null || typeof address === "string") throw new Error("Expected TCP endpoint")
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [entry],
      env: {
        ...testStdioEnvironment(),
        LAZY_ENVS: "false",
        HULY_URL: `http://127.0.0.1:${address.port}`,
        HULY_WORKSPACE: "startup-test",
        HULY_TOKEN: "startup-test-token",
        HULY_TOOL_MODE: "native"
      },
      stderr: "pipe"
    })
    const client = new Client(
      { name: "startup-network-test", version: "1.0.0" },
      { versionNegotiation: { mode: version === "2025-06-18" ? "legacy" : { pin: version } } }
    )
    try {
      await client.connect(transport, { timeout: 10000 })
      const listed = await client.listTools()
      expect(listed.tools.some((tool) => tool.name === "list_projects")).toBe(true)
      expect(requests).toBe(0)
      const result = await client.callTool({ name: "list_projects", arguments: {} })
      expect(requests).toBeGreaterThan(0)
      expect(result.isError).toBe(true)
      expect(JSON.stringify(result)).toContain("Cannot reach the configured Huly endpoint")
      expect(JSON.stringify(result)).not.toContain("startup-test-token")
    } finally {
      await transport.close()
      endpoint.closeAllConnections()
      await new Promise<void>((resolve, reject) => endpoint.close((error) => (error ? reject(error) : resolve())))
    }
  }
)
