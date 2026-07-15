import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { describe, expect, it } from "vitest"

import {
  HOSTED_HULY_MIGRATION_INSTRUCTIONS,
  type HostedHulyMigrationInstructions
} from "../../src/huly/unavailable-diagnostics.js"
import { createDefaultMcpSdkServer } from "../../src/mcp/sdk-server.js"

describe("default MCP SDK server", () => {
  const initialize = async (instructions?: HostedHulyMigrationInstructions): Promise<string | undefined> => {
    const server = createDefaultMcpSdkServer(instructions)
    const client = new Client(
      { name: "migration-warning-test", version: "1.0.0" },
      { capabilities: {} }
    )
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()

    await server.connect(serverTransport)
    await client.connect(clientTransport)

    const received = client.getInstructions()
    await client.close()
    return received
  }

  it("omits initialization instructions when no hosted warning applies", async () => {
    expect(await initialize()).toBeUndefined()
  })

  it("includes supplied hosted Huly migration instructions", async () => {
    const instructions = await initialize(HOSTED_HULY_MIGRATION_INSTRUCTIONS)

    expect(instructions).toContain("Hosted Huly is shutting down")
    expect(instructions).toContain("July 20")
    expect(instructions).toContain("https://github.com/hcengineering/platform/blob/develop/README.md")
    expect(instructions).toContain(
      "https://github.com/hcengineering/platform/blob/develop/docs/guides/backup-restore.en.md"
    )
    expect(instructions).toContain("https://github.com/hcengineering/huly-selfhost")
    expect(instructions).toContain("Self-hosted deployments are not affected")
  })
})
