import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { describe, expect, it } from "vitest"

import { createDefaultMcpSdkServer } from "../../src/mcp/sdk-server.js"

describe("default MCP SDK server", () => {
  it("includes the hosted Huly migration warning in initialization instructions", async () => {
    const server = createDefaultMcpSdkServer()
    const client = new Client(
      { name: "migration-warning-test", version: "1.0.0" },
      { capabilities: {} }
    )
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()

    await server.connect(serverTransport)
    await client.connect(clientTransport)

    const instructions = client.getInstructions()
    expect(instructions).toContain("Hosted Huly is shutting down")
    expect(instructions).toContain("July 20")
    expect(instructions).toContain("https://github.com/hcengineering/platform/blob/develop/README.md")
    expect(instructions).toContain(
      "https://github.com/hcengineering/platform/blob/develop/docs/guides/backup-restore.en.md"
    )
    expect(instructions).toContain("https://github.com/hcengineering/huly-selfhost")
    expect(instructions).toContain("Self-hosted deployments are not affected")

    await client.close()
  })
})
