import { Effect, Exit, Schema } from "effect"

import { type GetHulyContextResult, GetHulyContextResultSchema } from "../domain/schemas/index.js"
import { HulyError } from "../huly/errors-base.js"
import { type ClientBundle, type ClientResolver, resolveClientBundleAbortably } from "../runtime/client-resolver.js"
import { VERSION } from "../version.js"
import { EffectMcpBoundaryError } from "./effect-ai-boundary-error.js"
import type { McpToolResponse } from "./error-mapping.js"
import {
  createSuccessResponse,
  createUnknownToolError,
  mapClientResolutionCauseToMcp,
  mapDomainErrorToMcp
} from "./error-mapping.js"
import {
  GET_HULY_CONTEXT_TOOL_NAME,
  type ToolExposureContext,
  VERSION_TOOL_NAME,
  VersionToolResultSchema
} from "./huly-context-tool.js"
import type { ProtocolToolRegistries, resolveProtocolExposure } from "./protocol-tool-exposure.js"
import {
  handleProxyToolCallEffect,
  INVOKE_TOOL_TOOL_NAME,
  InvokeToolParamsSchema,
  isProxyToolName
} from "./proxy-tools.js"
import type { ToolDefinition, ToolName } from "./tools/registry.js"
import {
  executeRegisteredOperation,
  isEmptyArgumentsObject,
  isNoArgumentTool,
  parseToolName,
  requiresArgumentsObject
} from "./tools/registry.js"

const NPM_UNKNOWN_VERSION = "unknown"
const NPM_FETCH_TIMEOUT_MS = 5_000
const NPM_PACKAGE_NAME = "@firfi/huly-mcp"

/** Fetch the latest published package version without making lookup failure fatal. */
export const fetchLatestNpmVersion = async (fetchImpl: typeof fetch = fetch): Promise<string> => {
  try {
    const response = await fetchImpl(`https://registry.npmjs.org/${NPM_PACKAGE_NAME}/latest`, {
      signal: AbortSignal.timeout(NPM_FETCH_TIMEOUT_MS)
    })
    if (!response.ok) return NPM_UNKNOWN_VERSION
    const data: unknown = await response.json()
    if (typeof data === "object" && data !== null && "version" in data && typeof data.version === "string") {
      return data.version
    }
    return NPM_UNKNOWN_VERSION
  } catch {
    return NPM_UNKNOWN_VERSION
  }
}

export interface EffectMcpDispatchOptions {
  readonly getHulyContext: (toolExposure: ToolExposureContext) => Effect.Effect<GetHulyContextResult>
}

export const deriveEditMode = (name: string, args: unknown): string | undefined => {
  if (name !== "edit_document" || args === undefined) return undefined
  if (typeof args !== "object" || args === null || Array.isArray(args)) return undefined
  if ("old_text" in args) return "search_and_replace"
  if ("content" in args) return "full_replace"
  return "title_only"
}

export const effectMcpEditMode = (name: string, args: unknown): string | undefined => {
  if (name !== INVOKE_TOOL_TOOL_NAME) return deriveEditMode(name, args)
  const decoded = Schema.decodeUnknownResult(InvokeToolParamsSchema)(args)
  return decoded._tag === "Success" ? deriveEditMode(decoded.success.toolName, decoded.success.arguments) : undefined
}

const invalidArgumentsResponse = (
  message: string,
  errorTag: "MissingArguments" | "UnexpectedArguments"
): McpToolResponse => ({
  content: [{ type: "text", text: message }],
  isError: true,
  _meta: { errorCode: -32602, errorTag }
})

const parseToolArguments = (tool: ToolDefinition, args: unknown): McpToolResponse | undefined => {
  if (isNoArgumentTool(tool) && !isEmptyArgumentsObject(args)) {
    return invalidArgumentsResponse(
      `Invalid parameters for ${tool.name}: this tool does not accept arguments. Pass {} or omit arguments.`,
      "UnexpectedArguments"
    )
  }
  if (args === undefined && requiresArgumentsObject(tool)) {
    return invalidArgumentsResponse(
      `Invalid parameters for ${tool.name}: missing arguments object. Pass an arguments object; use {} when you want defaults for optional parameters.`,
      "MissingArguments"
    )
  }
  return undefined
}

const clientResolutionEffect = (
  resolveClients: ClientResolver
): Effect.Effect<Exit.Exit<ClientBundle, unknown>, never> =>
  Effect.tryPromise({
    try: (signal) => resolveClientBundleAbortably(resolveClients, signal),
    catch: (cause) => new EffectMcpBoundaryError({ cause })
  }).pipe(Effect.match({ onFailure: (error) => Exit.fail(error.cause), onSuccess: (result) => result }))

const callVersionTool = (
  args: unknown,
  fetchLatestVersion: () => Promise<string>
): Effect.Effect<McpToolResponse, never> =>
  Effect.gen(function* () {
    if (!isEmptyArgumentsObject(args)) {
      return invalidArgumentsResponse(
        `Invalid parameters for ${VERSION_TOOL_NAME}: this tool does not accept arguments. Pass {} or omit arguments.`,
        "UnexpectedArguments"
      )
    }
    const latest = yield* Effect.tryPromise({
      try: fetchLatestVersion,
      catch: (cause) => new EffectMcpBoundaryError({ cause })
    }).pipe(Effect.match({ onFailure: () => NPM_UNKNOWN_VERSION, onSuccess: (value) => value }))
    const result = Schema.decodeUnknownResult(VersionToolResultSchema)({ current: VERSION, latest })
    if (result._tag === "Success") return createSuccessResponse(result.success)
    return mapDomainErrorToMcp(new HulyError({ message: "Failed to build version result" }))
  })

const callHulyContextTool = (
  args: unknown,
  options: EffectMcpDispatchOptions,
  exposure: ReturnType<typeof resolveProtocolExposure>
): Effect.Effect<McpToolResponse, never> =>
  Effect.gen(function* () {
    if (!isEmptyArgumentsObject(args)) {
      return invalidArgumentsResponse(
        `Invalid parameters for ${GET_HULY_CONTEXT_TOOL_NAME}: this tool does not accept arguments. Pass {} or omit arguments.`,
        "UnexpectedArguments"
      )
    }
    const context = yield* options.getHulyContext(exposure.context)
    return createSuccessResponse(GetHulyContextResultSchema.make(context))
  })

const callProxyWithClients = (
  name: ToolName,
  args: unknown,
  exposure: ReturnType<typeof resolveProtocolExposure>,
  resolveClients: ClientResolver
): Effect.Effect<McpToolResponse, never> =>
  Effect.gen(function* () {
    const clients = yield* clientResolutionEffect(resolveClients)
    if (Exit.isFailure(clients)) return mapClientResolutionCauseToMcp(clients.cause)
    return yield* handleProxyToolCallEffect({
      toolName: name,
      args,
      proxyCandidateRegistry: exposure.proxyCandidateRegistry,
      clients: {
        hulyClient: clients.value.hulyClient,
        storageClient: clients.value.storageClient,
        ...(clients.value.workspaceClient === undefined ? {} : { workspaceClient: clients.value.workspaceClient })
      }
    })
  })

const callProxyTool = (
  name: ToolName,
  args: unknown,
  exposure: ReturnType<typeof resolveProtocolExposure>,
  resolveClients: ClientResolver
): Effect.Effect<McpToolResponse, never> => {
  if (exposure.context.resolvedMode !== "proxy") return Effect.succeed(createUnknownToolError(name))
  if (name === "invoke_tool") return callProxyWithClients(name, args, exposure, resolveClients)
  return handleProxyToolCallEffect({ toolName: name, args, proxyCandidateRegistry: exposure.proxyCandidateRegistry })
}

const nativeRegistryForExposure = (
  exposure: ReturnType<typeof resolveProtocolExposure>,
  toolName: NonNullable<ReturnType<typeof parseToolName>>
): ProtocolToolRegistries["fullRegistry"] => {
  if (exposure.visibleNativeRegistry.tools.has(toolName)) return exposure.visibleNativeRegistry
  if (exposure.context.resolvedMode === "proxy") return exposure.proxyCandidateRegistry
  return exposure.visibleNativeRegistry
}

const callNativeTool = (
  name: string,
  args: unknown,
  exposure: ReturnType<typeof resolveProtocolExposure>,
  resolveClients: ClientResolver
): Effect.Effect<McpToolResponse, never> =>
  Effect.gen(function* () {
    const toolName = parseToolName(name)
    if (toolName === undefined) return createUnknownToolError(name)
    const tool = nativeRegistryForExposure(exposure, toolName).tools.get(toolName)
    if (tool === undefined) return createUnknownToolError(name)
    const argumentError = parseToolArguments(tool, args)
    if (argumentError !== undefined) return argumentError
    const clients = yield* clientResolutionEffect(resolveClients)
    if (Exit.isFailure(clients)) return mapClientResolutionCauseToMcp(clients.cause)
    return yield* executeRegisteredOperation(
      tool.operation,
      args,
      clients.value.hulyClient,
      clients.value.storageClient,
      clients.value.workspaceClient
    )
  })

/** Dispatch one registered definition without introducing a nested runtime. */
export const dispatchEffectMcpTool = (
  options: EffectMcpDispatchOptions,
  exposure: ReturnType<typeof resolveProtocolExposure>,
  definition: ToolDefinition,
  args: unknown,
  fetchLatestVersion: () => Promise<string>,
  resolveClients: ClientResolver
): Effect.Effect<McpToolResponse, never> => {
  const name = String(definition.name)
  if (name === VERSION_TOOL_NAME) return callVersionTool(args, fetchLatestVersion)
  if (name === GET_HULY_CONTEXT_TOOL_NAME) return callHulyContextTool(args, options, exposure)
  if (isProxyToolName(name)) return callProxyTool(name, args, exposure, resolveClients)
  return callNativeTool(name, args, exposure, resolveClients)
}
