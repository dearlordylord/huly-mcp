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
import type { ToolExposureContext } from "./huly-context-tool.js"
import { type ClientBundle, createMcpProtocolHandlers } from "./protocol-handlers.js"
import { type ProtocolExposureOptions, type ProtocolToolRegistries } from "./protocol-tool-exposure.js"
import { createDefaultMcpSdkServer } from "./sdk-server.js"
import { parseMcpClientInfo } from "./tool-mode.js"
import type { ToolRegistry } from "./tools/index.js"

export type { ClientBundle } from "./protocol-handlers.js"

type McpServerHandle = readonly [server: Server, drainInflight: () => Promise<void>]

const currentClientInfoFromServer = (
  server: Server
): ReturnType<NonNullable<ProtocolExposureOptions["currentClientInfo"]>> => {
  const maybeServer: { readonly getClientVersion?: () => ReturnType<Server["getClientVersion"]> } = server
  return parseMcpClientInfo(maybeServer.getClientVersion?.())
}

export const createMcpServer = (
  resolveClients: () => Promise<ClientBundle>,
  telemetry: TelemetryOperations,
  registry: ToolRegistry | ProtocolToolRegistries,
  getHulyContext: (toolExposure: ToolExposureContext) => GetHulyContextResult,
  createServer: () => Server = createDefaultMcpSdkServer,
  exposureOptions: Partial<ProtocolExposureOptions> = {}
): McpServerHandle => {
  const server = createServer()
  const currentClientInfo = (): ReturnType<NonNullable<ProtocolExposureOptions["currentClientInfo"]>> =>
    exposureOptions.currentClientInfo?.() ?? currentClientInfoFromServer(server)
  const handlers = createMcpProtocolHandlers(
    resolveClients,
    telemetry,
    registry,
    getHulyContext,
    undefined,
    undefined,
    {
      ...exposureOptions,
      currentClientInfo
    }
  )

  server.setRequestHandler(ListToolsRequestSchema, handlers.listTools)
  server.setRequestHandler(CallToolRequestSchema, handlers.callTool)
  server.setRequestHandler(ListResourcesRequestSchema, handlers.listResources)
  server.setRequestHandler(ListResourceTemplatesRequestSchema, handlers.listResourceTemplates)
  server.setRequestHandler(ReadResourceRequestSchema, handlers.readResource)

  return [server, handlers.drainInflight]
}
