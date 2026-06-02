import type { Server } from "@modelcontextprotocol/sdk/server/index.js"
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema
} from "@modelcontextprotocol/sdk/types.js"

import type { GetHulyContextResult } from "../domain/schemas/index.js"
import type { TelemetryOperations } from "../telemetry/telemetry.js"
import { type ClientBundle, createMcpProtocolHandlers } from "./protocol-handlers.js"
import { createDefaultMcpSdkServer } from "./sdk-server.js"
import type { ToolRegistry } from "./tools/index.js"

export type { ClientBundle } from "./protocol-handlers.js"

type McpServerHandle = readonly [server: Server, drainInflight: () => Promise<void>]

export const createMcpServer = (
  resolveClients: () => Promise<ClientBundle>,
  telemetry: TelemetryOperations,
  registry: ToolRegistry,
  getHulyContext: () => GetHulyContextResult,
  createServer: () => Server = createDefaultMcpSdkServer
): McpServerHandle => {
  const server = createServer()
  const handlers = createMcpProtocolHandlers(resolveClients, telemetry, registry, getHulyContext)

  server.setRequestHandler(ListToolsRequestSchema, handlers.listTools)
  server.setRequestHandler(CallToolRequestSchema, handlers.callTool)
  server.setRequestHandler(ListResourcesRequestSchema, handlers.listResources)
  server.setRequestHandler(ListResourceTemplatesRequestSchema, handlers.listResourceTemplates)
  server.setRequestHandler(ReadResourceRequestSchema, handlers.readResource)

  return [server, handlers.drainInflight]
}
