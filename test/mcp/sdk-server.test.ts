import { Client, InMemoryTransport } from "@modelcontextprotocol/client"
import { describe, expect, it } from "vitest"

import { createDefaultMcpSdkServer } from "../../src/mcp/sdk-server.js"

describe("default MCP SDK server", () => {
  const initialize = async (): Promise<string | undefined> => {
    const server = createDefaultMcpSdkServer()
    const client = new Client({ name: "sdk-server-test", version: "1.0.0" }, { capabilities: {} })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()

    await server.connect(serverTransport)
    await client.connect(clientTransport)

    const received = client.getInstructions()
    await client.close()
    return received
  }

  it("omits initialization instructions by default", async () => {
    expect(await initialize()).toBeUndefined()
  })
})
