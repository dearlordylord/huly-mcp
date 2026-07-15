import { Server } from "@modelcontextprotocol/sdk/server/index.js"

import type { HostedHulyMigrationInstructions } from "../huly/unavailable-diagnostics.js"
import { VERSION } from "../version.js"

export const createDefaultMcpSdkServer = (instructions?: HostedHulyMigrationInstructions): Server =>
  new Server(
    {
      name: "huly-mcp",
      version: VERSION
    },
    {
      capabilities: {
        resources: {},
        tools: {}
      },
      ...(instructions === undefined ? {} : { instructions })
    }
  )
