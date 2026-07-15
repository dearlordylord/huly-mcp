import type {
  CallToolRequestParams,
  CallToolResult,
  ListResourcesResult,
  ListResourceTemplatesResult,
  ListToolsResult,
  ReadResourceRequestParams,
  ReadResourceResult
} from "@modelcontextprotocol/sdk/types.js"
import { Clock, Effect, Schema } from "effect"

import { type GetHulyContextResult, GetHulyContextResultSchema } from "../domain/schemas/index.js"
import type { HulyClient } from "../huly/client.js"
import { HulyError } from "../huly/errors-base.js"
import type { HulyStorageClient } from "../huly/storage.js"
import { HOSTED_HULY_MIGRATION_INSTRUCTIONS } from "../huly/unavailable-diagnostics.js"
import type { WorkspaceClientOperations } from "../huly/workspace-client.js"
import type { TelemetryOperations } from "../telemetry/telemetry.js"
import { VERSION } from "../version.js"
import type { McpToolResponse } from "./error-mapping.js"
import {
  appendToolWarnings,
  createSuccessResponse,
  createUnknownToolError,
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
import {
  createMissingArgumentsError,
  createUnexpectedArgumentsError,
  isEmptyArgumentsObject,
  isNoArgumentTool,
  parseToolName,
  requiresArgumentsObject
} from "./tools/registry.js"

export interface ClientBundle {
  readonly hulyClient: HulyClient["Type"]
  readonly storageClient: HulyStorageClient["Type"]
  readonly workspaceClient?: WorkspaceClientOperations
}

interface ToolCallRequest {
  readonly params: {
    readonly name: CallToolRequestParams["name"]
    readonly arguments?: unknown
  }
}

interface ResourceReadRequest {
  readonly params: ReadResourceRequestParams
}

type ListToolsProtocolResult = ListToolsResult

type HulyContextProvider = (toolExposure: ToolExposureContext) => GetHulyContextResult

export interface McpProtocolHandlers {
  readonly listTools: () => Promise<ListToolsProtocolResult>
  readonly callTool: (request: ToolCallRequest) => Promise<CallToolResult>
  readonly listResources: () => Promise<ListResourcesResult>
  readonly listResourceTemplates: () => ListResourceTemplatesResult
  readonly readResource: (request: ResourceReadRequest) => Promise<ReadResourceResult>
  readonly serverDiscover: () => ServerDiscoverResult
  readonly drainInflight: () => Promise<void>
}

const ServerDiscoverResultSchema = Schema.Struct({
  resultType: Schema.Literal("complete"),
  supportedVersions: Schema.Tuple(Schema.Literal("2026-07-28")),
  capabilities: Schema.Struct({
    tools: Schema.Struct({}),
    resources: Schema.Struct({})
  }),
  serverInfo: Schema.Struct({
    name: Schema.Literal("huly-mcp"),
    version: Schema.String
  }),
  instructions: Schema.String
})
type ServerDiscoverResult = Schema.Schema.Type<typeof ServerDiscoverResultSchema>

const DRAIN_POLL_MS = 50
const DRAIN_TIMEOUT_MS = 30_000
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

const parseServerDiscoverResult = (value: unknown): ServerDiscoverResult =>
  Schema.decodeUnknownSync(ServerDiscoverResultSchema)(value)

/**
 * Injected wall-clock reader for telemetry timing and the drain-timeout loop. The live
 * implementation reads Effect's Clock so production code performs no direct wall-clock
 * reads; tests pass a deterministic stub through createMcpProtocolHandlers.
 */
export interface NowClock {
  readonly currentTimeMillis: () => number
}

export const liveNowClock: NowClock = {
  currentTimeMillis: () => Effect.runSync(Clock.currentTimeMillis)
}

const createDrainInflight = (getInflight: () => number, clock: NowClock): () => Promise<void> => () => {
  if (getInflight() <= 0) return Promise.resolve()
  return new Promise((resolve) => {
    const start = clock.currentTimeMillis()
    const check = () => {
      if (getInflight() <= 0 || clock.currentTimeMillis() - start > DRAIN_TIMEOUT_MS) {
        resolve()
      } else {
        setTimeout(check, DRAIN_POLL_MS)
      }
    }
    check()
  })
}

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

const invokeToolEditMode = (args: unknown): string | undefined => {
  const decoded = Schema.decodeUnknownEither(InvokeToolParamsSchema)(args)
  return decoded._tag === "Right" ? deriveEditMode(decoded.right.toolName, decoded.right.arguments) : undefined
}

export const createMcpProtocolHandlers = (
  resolveClients: () => Promise<ClientBundle>,
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
  let inflight = 0
  const drainInflight = createDrainInflight(() => inflight, clock)
  const enter = () => {
    inflight++
  }
  const leave = () => {
    inflight--
  }

  const listTools = async (): Promise<ListToolsProtocolResult> => {
    const exposure = resolveProtocolExposure(registries, protocolExposureOptions)
    telemetry.firstListTools({
      clientKind: exposure.context.clientKind,
      resolvedMode: exposure.context.resolvedMode
    })
    return {
      tools: [
        ...[versionToolDefinition, getHulyContextToolDefinition].map(toListedTool),
        ...(exposure.context.resolvedMode === "proxy" ? proxyToolDefinitions.map(toListedHulyTool) : []),
        ...exposure.visibleNativeRegistry.definitions.map(toListedHulyTool)
      ]
    }
  }

  const callTool = async (request: ToolCallRequest): Promise<CallToolResult> => {
    enter()
    const noticeClaim = toolCallNoticeProvider.claim()
    try {
      const { arguments: args, name } = request.params
      const exposure = resolveProtocolExposure(registries, protocolExposureOptions)

      const start = clock.currentTimeMillis()
      const inputBytes = JSON.stringify(args ?? {}).length

      const withClaimedNotice = (response: McpToolResponse): McpToolResponse => {
        if (noticeClaim._tag === "None") return response
        const responseWithNotice = appendToolWarnings(response, [noticeClaim.warning])
        noticeClaim.delivered()
        return responseWithNotice
      }

      const returnError = (errorResponse: McpToolResponse, editMode?: string) => {
        const responseWithNotice = withClaimedNotice(errorResponse)
        const durationMs = clock.currentTimeMillis() - start
        telemetry.toolCalled({
          toolName: name,
          status: "error",
          clientKind: exposure.context.clientKind,
          resolvedMode: exposure.context.resolvedMode,
          errorTag: responseWithNotice._meta?.errorTag,
          durationMs,
          inputBytes,
          outputBytes: computeOutputBytes(responseWithNotice),
          editMode
        })
        return toMcpResponse(responseWithNotice)
      }

      if (name === VERSION_TOOL_NAME) {
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

      if (name === GET_HULY_CONTEXT_TOOL_NAME) {
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

      if (isProxyToolName(name)) {
        if (exposure.context.resolvedMode !== "proxy") return returnError(createUnknownToolError(name))

        const editMode = name === INVOKE_TOOL_TOOL_NAME ? invokeToolEditMode(args) : undefined

        let clients: ClientBundle | undefined
        if (name === INVOKE_TOOL_TOOL_NAME) {
          try {
            clients = await resolveClients()
          } catch (e) {
            const errorResponse = mapClientResolutionErrorToMcp(e)
            return returnError(errorResponse, editMode)
          }
        }

        const response = await handleProxyToolCall({
          toolName: name,
          args,
          proxyCandidateRegistry: exposure.proxyCandidateRegistry,
          ...(clients === undefined
            ? {}
            : {
              clients: {
                hulyClient: clients.hulyClient,
                storageClient: clients.storageClient,
                ...(clients.workspaceClient === undefined ? {} : { workspaceClient: clients.workspaceClient })
              }
            })
        })
        const responseWithNotice = withClaimedNotice(response)
        const durationMs = clock.currentTimeMillis() - start
        telemetry.toolCalled({
          toolName: name,
          status: responseWithNotice.isError === true ? "error" : "success",
          clientKind: exposure.context.clientKind,
          resolvedMode: exposure.context.resolvedMode,
          errorTag: responseWithNotice._meta?.errorTag,
          durationMs,
          inputBytes,
          outputBytes: computeOutputBytes(responseWithNotice),
          editMode
        })
        return toMcpResponse(responseWithNotice)
      }

      const hulyToolName = parseToolName(name)
      if (hulyToolName === undefined) return returnError(createUnknownToolError(name))

      const nativeCallRegistry = exposure.visibleNativeRegistry.tools.has(hulyToolName)
        ? exposure.visibleNativeRegistry
        : exposure.context.resolvedMode === "proxy"
        ? exposure.proxyCandidateRegistry
        : exposure.visibleNativeRegistry
      const tool = nativeCallRegistry.tools.get(hulyToolName)
      if (tool === undefined) return returnError(createUnknownToolError(name))

      if (isNoArgumentTool(tool) && !isEmptyArgumentsObject(args)) {
        return returnError(createUnexpectedArgumentsError(hulyToolName))
      }

      if (args === undefined && requiresArgumentsObject(tool)) {
        return returnError(createMissingArgumentsError(hulyToolName))
      }

      const editMode = deriveEditMode(hulyToolName, args)

      let clients: ClientBundle
      try {
        clients = await resolveClients()
      } catch (e) {
        const errorResponse = mapClientResolutionErrorToMcp(e)
        return returnError(errorResponse, editMode)
      }

      const response = await nativeCallRegistry.handleToolCall(
        hulyToolName,
        args,
        clients.hulyClient,
        clients.storageClient,
        clients.workspaceClient
      )
      const durationMs = clock.currentTimeMillis() - start
      if (response === null) return returnError(createUnknownToolError(name), editMode)

      const responseWithNotice = withClaimedNotice(response)
      telemetry.toolCalled({
        toolName: hulyToolName,
        status: responseWithNotice.isError === true ? "error" : "success",
        clientKind: exposure.context.clientKind,
        resolvedMode: exposure.context.resolvedMode,
        errorTag: responseWithNotice._meta?.errorTag,
        durationMs,
        inputBytes,
        outputBytes: computeOutputBytes(responseWithNotice),
        editMode
      })

      return toMcpResponse(responseWithNotice)
    } catch (error) {
      if (noticeClaim._tag === "Claimed") noticeClaim.release()
      throw error
    } finally {
      leave()
    }
  }

  const resourceHandlers = createResourceProtocolHandlers({ resolveClients, enter, leave })

  return {
    listTools,
    callTool,
    listResources: resourceHandlers.listResources,
    listResourceTemplates,
    readResource: resourceHandlers.readResource,
    serverDiscover: () =>
      parseServerDiscoverResult({
        resultType: "complete",
        supportedVersions: ["2026-07-28"],
        capabilities: { tools: {}, resources: {} },
        serverInfo: { name: "huly-mcp", version: VERSION },
        instructions: HOSTED_HULY_MIGRATION_INSTRUCTIONS
      }),
    drainInflight
  }
}
