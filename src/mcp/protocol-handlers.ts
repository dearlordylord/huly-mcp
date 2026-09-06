import type {
  CallToolRequestParams,
  ListResourcesResult,
  ListResourceTemplatesResult,
  ListToolsResult,
  ReadResourceRequestParams,
  ReadResourceResult
} from "@modelcontextprotocol/server"
import { Clock, Effect, Exit, Option, Result, Schema } from "effect"

import { type GetHulyContextResult, GetHulyContextResultSchema } from "../domain/schemas/index.js"
import { HulyError } from "../huly/errors-base.js"
import type { ClientBundle, ClientResolver } from "../runtime/client-resolver.js"
import type { TelemetryOperations, ToolCalledProps } from "../telemetry/telemetry.js"
import { VERSION } from "../version.js"
import type { McpToolResponse } from "./error-mapping.js"
import type { McpWireResponse } from "./tool-responses.js"
import {
  appendToolWarnings,
  createServerShuttingDownError,
  createSuccessResponse,
  createUnknownToolError,
  mapClientResolutionCauseToMcp,
  mapClientResolutionErrorToMcp,
  mapDomainErrorToMcp,
  toMcpResponse
} from "./error-mapping.js"
import {
  GET_HULY_CONTEXT_TOOL_NAME,
  getHulyContextToolDefinition,
  type ToolExposureContext,
  VERSION_TOOL_NAME,
  versionToolDefinition,
  VersionToolResultSchema
} from "./huly-context-tool.js"
import { createResourceProtocolHandlers } from "./protocol-resource-handlers.js"
import { createRequestAdmission } from "./request-admission.js"
import {
  defaultExposureOptions,
  normalizeRegistries,
  type ProtocolExposureOptions,
  type ProtocolToolRegistries,
  resolveProtocolExposure,
  toListedHulyTool,
  toListedTool
} from "./protocol-tool-exposure.js"
import {
  handleProxyToolCall,
  INVOKE_TOOL_TOOL_NAME,
  InvokeToolParamsSchema,
  isProxyToolName,
  proxyToolDefinitions
} from "./proxy-tools.js"
import { listResourceTemplates } from "./resources.js"
import { noToolCallNoticeProvider, type ToolCallNoticeProvider } from "./tool-call-notices.js"
import type { ToolRegistry } from "./tools/index.js"
import type { McpClientInfoLike } from "./tool-mode.js"
import {
  createMissingArgumentsError,
  createUnexpectedArgumentsError,
  isEmptyArgumentsObject,
  isNoArgumentTool,
  parseToolName,
  requiresArgumentsObject
} from "./tools/registry.js"

interface ToolCallRequest {
  readonly params: { readonly name: CallToolRequestParams["name"]; readonly arguments?: unknown }
}

interface ResourceReadRequest {
  readonly params: ReadResourceRequestParams
}

type ListToolsProtocolResult = ListToolsResult

type HulyContextProvider = (toolExposure: ToolExposureContext) => GetHulyContextResult

export interface McpProtocolHandlers {
  readonly listTools: (requestClientInfo?: Option.Option<McpClientInfoLike>) => Promise<ListToolsProtocolResult>
  readonly callTool: (
    request: ToolCallRequest,
    requestClientInfo?: Option.Option<McpClientInfoLike>
  ) => Promise<McpWireResponse>
  readonly listResources: () => Promise<ListResourcesResult>
  readonly listResourceTemplates: () => ListResourceTemplatesResult
  readonly readResource: (request: ResourceReadRequest) => Promise<ReadResourceResult>
  readonly quiesce: () => Promise<void>
}

const NPM_FETCH_TIMEOUT_MS = 5_000
const NPM_PACKAGE_NAME = "@firfi/huly-mcp"

const computeOutputBytes = (response: McpToolResponse): number =>
  response.content.reduce((sum, c) => sum + c.text.length, 0)

export const deriveEditMode = (name: string, args: unknown): string | undefined => {
  if (name !== "edit_document" || args === undefined) return undefined
  if (typeof args !== "object" || args === null || Array.isArray(args)) return undefined
  if ("old_text" in args) return "search_and_replace"
  if ("content" in args) return "full_replace"
  return "title_only"
}

const validateHulyContextResult = (value: unknown): GetHulyContextResult =>
  Schema.decodeUnknownSync(GetHulyContextResultSchema)(value)

const validateVersionToolResult = (value: unknown): Schema.Schema.Type<typeof VersionToolResultSchema> =>
  Schema.decodeUnknownSync(VersionToolResultSchema)(value)

/**
 * Injected wall-clock reader for telemetry timing and the drain-timeout loop. The live
 * implementation reads Effect's Clock so production code performs no direct wall-clock
 * reads; tests pass a deterministic stub through createMcpProtocolHandlers.
 */
export interface NowClock {
  readonly currentTimeMillis: () => number
}

export const liveNowClock: NowClock = { currentTimeMillis: () => Effect.runSync(Clock.currentTimeMillis) }

/**
 * Fetch the latest published npm version. The `fetch` implementation is injected
 * (defaulting to the global) so tests can supply a deterministic stub instead of
 * reaching the network — no mocks required.
 */
export const fetchLatestNpmVersion = async (fetchImpl: typeof fetch = fetch): Promise<string> => {
  try {
    const res = await fetchImpl(`https://registry.npmjs.org/${NPM_PACKAGE_NAME}/latest`, {
      signal: AbortSignal.timeout(NPM_FETCH_TIMEOUT_MS)
    })
    if (!res.ok) return "unknown"
    const data: unknown = await res.json()
    if (typeof data === "object" && data !== null && "version" in data && typeof data.version === "string") {
      return data.version
    }
    return "unknown"
  } catch {
    return "unknown"
  }
}

type ToolCallAttribution = Pick<ToolCalledProps, "toolName" | "callPath" | "editMode">

const proxyCallTelemetry = (toolName: string, args: unknown, registry: ToolRegistry): ToolCallAttribution => {
  if (toolName !== INVOKE_TOOL_TOOL_NAME) return { toolName, callPath: "direct" }
  const decoded = Schema.decodeUnknownResult(InvokeToolParamsSchema)(args)
  if (Result.isFailure(decoded)) return { toolName, callPath: "invoke_tool" }
  const target = decoded.success.toolName
  // Only catalog names are safe analytics dimensions; arbitrary input may contain
  // workspace data, so an unknown target stays attributed to the dispatcher.
  return {
    toolName: registry.tools.has(target) ? target : toolName,
    callPath: "invoke_tool",
    editMode: deriveEditMode(target, decoded.success.arguments)
  }
}

type ClientResolution =
  | { readonly _tag: "Success"; readonly clients: ClientBundle }
  | { readonly _tag: "Failure"; readonly response: McpToolResponse }

const resolveClientBundle = async (resolveClients: ClientResolver): Promise<ClientResolution> => {
  try {
    const exit = await resolveClients()
    return Exit.isSuccess(exit)
      ? { _tag: "Success", clients: exit.value }
      : { _tag: "Failure", response: mapClientResolutionCauseToMcp(exit.cause) }
  } catch (error) {
    // A ClientResolver must resolve with Exit. Keep a defensive framework
    // boundary for third-party or injected implementations that reject.
    return { _tag: "Failure", response: mapClientResolutionErrorToMcp(error) }
  }
}

const proxyClients = (clients: ClientBundle) => ({
  hulyClient: clients.hulyClient,
  storageClient: clients.storageClient,
  ...(clients.workspaceClient === undefined ? {} : { workspaceClient: clients.workspaceClient })
})

const resolveProxyClients = (
  toolName: NonNullable<ReturnType<typeof parseToolName>>,
  resolveClients: ClientResolver
): Promise<ClientResolution | undefined> =>
  toolName === INVOKE_TOOL_TOOL_NAME ? resolveClientBundle(resolveClients) : Promise.resolve(undefined)

const responseStatus = (response: McpToolResponse): "error" | "success" =>
  response.isError === true ? "error" : "success"

type ResolvedProtocolExposure = ReturnType<typeof resolveProtocolExposure>

const selectNativeCallRegistry = (
  exposure: ResolvedProtocolExposure,
  toolName: NonNullable<ReturnType<typeof parseToolName>>
): ToolRegistry =>
  exposure.visibleNativeRegistry.tools.has(toolName)
    ? exposure.visibleNativeRegistry
    : exposure.context.resolvedMode === "proxy"
      ? exposure.proxyCandidateRegistry
      : exposure.visibleNativeRegistry

const nativeArgumentError = (tool: ToolRegistry["definitions"][number], args: unknown): McpToolResponse | undefined => {
  if (isNoArgumentTool(tool) && !isEmptyArgumentsObject(args)) {
    return createUnexpectedArgumentsError(tool.name)
  }
  if (args === undefined && requiresArgumentsObject(tool)) {
    return createMissingArgumentsError(tool.name)
  }
  return undefined
}

export const createMcpProtocolHandlers = (
  resolveClients: ClientResolver,
  telemetry: TelemetryOperations,
  registry: ToolRegistry | ProtocolToolRegistries,
  getHulyContext: HulyContextProvider,
  clock: NowClock = liveNowClock,
  fetchLatestVersion: () => Promise<string> = fetchLatestNpmVersion,
  exposureOptions: Partial<ProtocolExposureOptions> = {},
  toolCallNoticeProvider: ToolCallNoticeProvider = noToolCallNoticeProvider
): McpProtocolHandlers => {
  const registries = normalizeRegistries(registry)
  const defaults = defaultExposureOptions()
  const protocolExposureOptions: ProtocolExposureOptions = {
    exposureConfig: exposureOptions.exposureConfig ?? defaults.exposureConfig,
    currentClientInfo: exposureOptions.currentClientInfo ?? defaults.currentClientInfo,
    toolScopeFilteringActive: exposureOptions.toolScopeFilteringActive ?? defaults.toolScopeFilteringActive
  }
  const admission = createRequestAdmission()

  const exposureFor = (requestClientInfo: Option.Option<McpClientInfoLike> | undefined): ResolvedProtocolExposure =>
    resolveProtocolExposure(
      registries,
      requestClientInfo === undefined
        ? protocolExposureOptions
        : {
            ...protocolExposureOptions,
            currentClientInfo: () => (Option.isSome(requestClientInfo) ? requestClientInfo.value : undefined)
          }
    )

  const listTools = async (requestClientInfo?: Option.Option<McpClientInfoLike>): Promise<ListToolsProtocolResult> => {
    const exposure = exposureFor(requestClientInfo)
    telemetry.firstListTools({ clientKind: exposure.context.clientKind, resolvedMode: exposure.context.resolvedMode })
    return {
      tools: [
        ...[versionToolDefinition, getHulyContextToolDefinition].map(toListedTool),
        ...(exposure.context.resolvedMode === "proxy" ? proxyToolDefinitions.map(toListedHulyTool) : []),
        ...exposure.visibleNativeRegistry.definitions.map(toListedHulyTool)
      ]
    }
  }

  const callTool = async (
    request: ToolCallRequest,
    requestClientInfo?: Option.Option<McpClientInfoLike>
  ): Promise<McpWireResponse> => {
    const lease = admission.enter()
    if (lease === null) return toMcpResponse(createServerShuttingDownError())
    const noticeClaim = toolCallNoticeProvider.claim()
    try {
      const { arguments: args, name } = request.params
      const exposure = exposureFor(requestClientInfo)

      const start = clock.currentTimeMillis()
      const inputBytes = JSON.stringify(args ?? {}).length

      const withClaimedNotice = (response: McpToolResponse): McpToolResponse => {
        if (noticeClaim._tag === "None") return response
        const responseWithNotice = appendToolWarnings(response, [noticeClaim.warning])
        noticeClaim.delivered()
        return responseWithNotice
      }

      const returnError = (
        errorResponse: McpToolResponse,
        attribution: ToolCallAttribution = { toolName: name, callPath: "direct" }
      ) => {
        const responseWithNotice = withClaimedNotice(errorResponse)
        const durationMs = clock.currentTimeMillis() - start
        telemetry.toolCalled({
          ...attribution,
          status: "error",
          clientKind: exposure.context.clientKind,
          resolvedMode: exposure.context.resolvedMode,
          errorTag: responseWithNotice._meta?.errorTag,
          durationMs,
          inputBytes,
          outputBytes: computeOutputBytes(responseWithNotice)
        })
        return toMcpResponse(responseWithNotice)
      }

      const callVersionTool = async (): Promise<McpWireResponse> => {
        if (!isEmptyArgumentsObject(args)) return returnError(createUnexpectedArgumentsError(VERSION_TOOL_NAME))

        const latest = await fetchLatestVersion()
        let versionResult: Schema.Schema.Type<typeof VersionToolResultSchema>
        try {
          versionResult = validateVersionToolResult({ current: VERSION, latest })
        } catch {
          return returnError(mapDomainErrorToMcp(new HulyError({ message: "Failed to build version result" })))
        }
        const versionResponse = withClaimedNotice(createSuccessResponse(versionResult))
        const durationMs = clock.currentTimeMillis() - start
        telemetry.toolCalled({
          toolName: name,
          status: "success",
          clientKind: exposure.context.clientKind,
          resolvedMode: exposure.context.resolvedMode,
          durationMs,
          inputBytes,
          outputBytes: computeOutputBytes(versionResponse)
        })
        return toMcpResponse(versionResponse)
      }

      const callHulyContextTool = (): McpWireResponse => {
        if (!isEmptyArgumentsObject(args)) {
          return returnError(createUnexpectedArgumentsError(GET_HULY_CONTEXT_TOOL_NAME))
        }

        let context: GetHulyContextResult
        try {
          context = validateHulyContextResult(getHulyContext(exposure.context))
        } catch {
          return returnError(mapDomainErrorToMcp(new HulyError({ message: "Failed to build Huly context" })))
        }

        const contextResponse = withClaimedNotice(createSuccessResponse(context))
        const durationMs = clock.currentTimeMillis() - start
        telemetry.toolCalled({
          toolName: name,
          status: "success",
          clientKind: exposure.context.clientKind,
          resolvedMode: exposure.context.resolvedMode,
          durationMs,
          inputBytes,
          outputBytes: computeOutputBytes(contextResponse)
        })
        return toMcpResponse(contextResponse)
      }

      const callProxyTool = async (
        toolName: NonNullable<ReturnType<typeof parseToolName>>
      ): Promise<McpWireResponse> => {
        if (exposure.context.resolvedMode !== "proxy") return returnError(createUnknownToolError(toolName))

        const attribution = proxyCallTelemetry(toolName, args, exposure.proxyCandidateRegistry)
        const clientResolution = await resolveProxyClients(toolName, resolveClients)
        if (clientResolution?._tag === "Failure") {
          return returnError(clientResolution.response, attribution)
        }

        const response = await handleProxyToolCall({
          toolName,
          args,
          proxyCandidateRegistry: exposure.proxyCandidateRegistry,
          ...(clientResolution?._tag === "Success" ? { clients: proxyClients(clientResolution.clients) } : {})
        })
        const responseWithNotice = withClaimedNotice(response)
        const durationMs = clock.currentTimeMillis() - start
        telemetry.toolCalled({
          ...attribution,
          status: responseStatus(responseWithNotice),
          clientKind: exposure.context.clientKind,
          resolvedMode: exposure.context.resolvedMode,
          errorTag: responseWithNotice._meta?.errorTag,
          durationMs,
          inputBytes,
          outputBytes: computeOutputBytes(responseWithNotice)
        })
        return toMcpResponse(responseWithNotice)
      }

      const callNativeTool = async (): Promise<McpWireResponse> => {
        const hulyToolName = parseToolName(name)
        if (hulyToolName === undefined) return returnError(createUnknownToolError(name))

        const nativeCallRegistry = selectNativeCallRegistry(exposure, hulyToolName)
        const tool = nativeCallRegistry.tools.get(hulyToolName)
        if (tool === undefined) return returnError(createUnknownToolError(name))

        const argumentError = nativeArgumentError(tool, args)
        if (argumentError !== undefined) return returnError(argumentError)

        const attribution: ToolCallAttribution = {
          toolName: hulyToolName,
          callPath: "direct",
          editMode: deriveEditMode(hulyToolName, args)
        }
        const clientResolution = await resolveClientBundle(resolveClients)
        if (clientResolution._tag === "Failure") return returnError(clientResolution.response, attribution)
        const { clients } = clientResolution

        const response = await nativeCallRegistry.handleToolCall(
          hulyToolName,
          args,
          clients.hulyClient,
          clients.storageClient,
          clients.workspaceClient
        )
        const durationMs = clock.currentTimeMillis() - start
        if (response === null) return returnError(createUnknownToolError(name), attribution)

        const responseWithNotice = withClaimedNotice(response)
        telemetry.toolCalled({
          ...attribution,
          status: responseStatus(responseWithNotice),
          clientKind: exposure.context.clientKind,
          resolvedMode: exposure.context.resolvedMode,
          errorTag: responseWithNotice._meta?.errorTag,
          durationMs,
          inputBytes,
          outputBytes: computeOutputBytes(responseWithNotice)
        })

        return toMcpResponse(responseWithNotice)
      }

      if (name === VERSION_TOOL_NAME) return await callVersionTool()
      if (name === GET_HULY_CONTEXT_TOOL_NAME) return callHulyContextTool()
      if (isProxyToolName(name)) return await callProxyTool(name)
      return await callNativeTool()
    } catch (error) {
      if (noticeClaim._tag === "Claimed") noticeClaim.release()
      throw error
    } finally {
      lease.release()
    }
  }

  const resourceHandlers = createResourceProtocolHandlers({ resolveClients, admission })

  return {
    listTools,
    callTool,
    listResources: resourceHandlers.listResources,
    listResourceTemplates,
    readResource: resourceHandlers.readResource,
    quiesce: admission.quiesce
  }
}
