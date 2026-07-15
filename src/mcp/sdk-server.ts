import { Server } from "@modelcontextprotocol/sdk/server/index.js"

import { HOSTED_HULY_MIGRATION_INSTRUCTIONS } from "../huly/unavailable-diagnostics.js"
import { VERSION } from "../version.js"

export const createDefaultMcpSdkServer = (): Server =>
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
      instructions: HOSTED_HULY_MIGRATION_INSTRUCTIONS
    }
  )
