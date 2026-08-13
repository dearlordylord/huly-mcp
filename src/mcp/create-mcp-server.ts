import type { Server } from "@modelcontextprotocol/server"
import type { GetHulyContextResult } from "../domain/schemas/index.js"
import type { HostedHulyMigrationInstructions } from "../huly/unavailable-diagnostics.js"
import type { TelemetryOperations } from "../telemetry/telemetry.js"
import type { ToolExposureContext } from "./huly-context-tool.js"
import { type ClientBundle, createMcpProtocolHandlers } from "./protocol-handlers.js"
import { type ProtocolExposureOptions, type ProtocolToolRegistries } from "./protocol-tool-exposure.js"
import { createDefaultMcpSdkServer } from "./sdk-server.js"
import { noToolCallNoticeProvider, type ToolCallNoticeProvider } from "./tool-call-notices.js"
import { parseMcpClientInfo } from "./tool-mode.js"
import type { ToolRegistry } from "./tools/index.js"

export type { ClientBundle } from "./protocol-handlers.js"

export interface McpServerLifecycle {
  readonly quiesce: () => Promise<void>
}

type McpServerHandle = readonly [server: Server, lifecycle: McpServerLifecycle]

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
  createServer: (instructions?: HostedHulyMigrationInstructions) => Server = createDefaultMcpSdkServer,
  exposureOptions: Partial<ProtocolExposureOptions> = {},
  toolCallNoticeProvider: ToolCallNoticeProvider = noToolCallNoticeProvider,
  serverInstructions?: HostedHulyMigrationInstructions
): McpServerHandle => {
  const server = createServer(serverInstructions)
  const currentClientInfo = (): ReturnType<NonNullable<ProtocolExposureOptions["currentClientInfo"]>> =>
    exposureOptions.currentClientInfo?.() ?? currentClientInfoFromServer(server)
  const handlers = createMcpProtocolHandlers(
    resolveClients,
    telemetry,
    registry,
    getHulyContext,
    undefined,
    undefined,
    { ...exposureOptions, currentClientInfo },
    toolCallNoticeProvider
  )

  server.setRequestHandler("tools/list", handlers.listTools)
  server.setRequestHandler("tools/call", handlers.callTool)
  server.setRequestHandler("resources/list", handlers.listResources)
  server.setRequestHandler("resources/templates/list", handlers.listResourceTemplates)
  server.setRequestHandler("resources/read", handlers.readResource)

  return [server, { quiesce: handlers.quiesce }]
}
