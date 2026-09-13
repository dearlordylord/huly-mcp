import { Server } from "@modelcontextprotocol/server"
import { VERSION } from "../version.js"

export const createDefaultMcpSdkServer = (): Server =>
  new Server({ name: "huly-mcp", version: VERSION }, { capabilities: { resources: {}, tools: {} } })
