import type { Server, ServerContext } from "@modelcontextprotocol/server"
import type { GetHulyContextResult } from "../domain/schemas/index.js"
import type { ClientResolver } from "../runtime/client-resolver.js"
import type { TelemetryOperations } from "../telemetry/telemetry.js"
import type { ToolExposureContext } from "./huly-context-tool.js"
import { createMcpProtocolHandlers } from "./protocol-handlers.js"
import { type ProtocolExposureOptions, type ProtocolToolRegistries } from "./protocol-tool-exposure.js"
import { createDefaultMcpSdkServer } from "./sdk-server.js"
import { parseMcpClientInfo, resolveRequestMcpClientInfo } from "./tool-mode.js"
import type { ToolRegistry } from "./tools/index.js"

export type { ClientBundle } from "../runtime/client-resolver.js"

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
  resolveClients: ClientResolver,
  telemetry: TelemetryOperations,
  registry: ToolRegistry | ProtocolToolRegistries,
  getHulyContext: (toolExposure: ToolExposureContext) => GetHulyContextResult,
  createServer: () => Server = createDefaultMcpSdkServer,
  exposureOptions: Partial<ProtocolExposureOptions> = {}
): McpServerHandle => {
  const server = createServer()
  const currentClientInfo = (): ReturnType<NonNullable<ProtocolExposureOptions["currentClientInfo"]>> =>
    exposureOptions.currentClientInfo?.() ?? currentClientInfoFromServer(server)
  const requestClientInfo = (context: ServerContext | undefined) =>
    resolveRequestMcpClientInfo(context?.mcpReq.envelope, currentClientInfo)
  const handlers = createMcpProtocolHandlers(
    resolveClients,
    telemetry,
    registry,
    getHulyContext,
    undefined,
    undefined,
    { ...exposureOptions, currentClientInfo }
  )

  server.setRequestHandler("tools/list", (_request, context) => handlers.listTools(requestClientInfo(context)))
  server.setRequestHandler("tools/call", (request, context) => handlers.callTool(request, requestClientInfo(context)))
  server.setRequestHandler("resources/list", handlers.listResources)
  server.setRequestHandler("resources/templates/list", handlers.listResourceTemplates)
  server.setRequestHandler("resources/read", handlers.readResource)

  return [server, { quiesce: handlers.quiesce }]
}
