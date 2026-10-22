/**
 * Effect AI registration for the Huly MCP tool and resource registries.
 *
 * The Huly registry intentionally stays independent from the MCP transport.
 * A transport provides `McpServer` (through `McpServer.layerStdio`,
 * `McpServer.layerHttp`, or `McpServer.layer`) and provides this module's
 * registration effect.  This keeps request-scoped client acquisition in the
 * caller's closure while making protocol dispatch Effect-native.
 */
import type { MovementStageObserver } from "./movement-stage-observer.js"
import { Context, Effect, type Exit, Layer } from "effect"
import { McpServer } from "effect/ai/McpServer"
import * as McpSchema from "effect/ai/McpSchema"

import type { GetHulyContextResult } from "../domain/schemas/huly-context.js"
import { HulyError } from "../huly/errors-base.js"
import type { ClientBundle, ClientResolver, HulyClientBundleError } from "../runtime/client-resolver.js"
import {
  jsonUtf8Bytes,
  observeToolCall,
  toolResponseStatus,
  type ToolObservation
} from "../telemetry/tool-observation.js"
import { reportTelemetry } from "../telemetry/events.js"
import type { TelemetryOperations } from "../telemetry/telemetry.js"
import {
  type McpToolResponse,
  createServerShuttingDownError,
  createUnknownToolError,
  mapDomainErrorToMcp
} from "./error-mapping.js"

import { getHulyContextToolDefinition, type ToolExposureContext, versionToolDefinition } from "./huly-context-tool.js"
import { createRequestAdmission, type RequestAdmission } from "./request-admission.js"
import type { RequestClientLease } from "./request-client-lifecycle.js"
import { withRequestScopedResolver } from "./effect-ai-request.js"
import {
  defaultExposureOptions,
  normalizeRegistries,
  type ProtocolExposureOptions,
  type ProtocolToolRegistries,
  resolveNativeRegistrationRegistry,
  resolveProtocolExposure,
  toListedHulyTool
} from "./protocol-tool-exposure.js"
import { proxyToolDefinitions } from "./proxy-tools.js"
import type { ToolRegistry } from "./tools/index.js"
import { makeToolCategory, resolveAnnotations, type ToolDefinition } from "./tools/registry.js"

import { type McpClientInfoLike, parseMcpClientInfo } from "./tool-mode.js"

import { registerEffectMcpResources } from "./effect-ai-resources.js"
import { toEffectCallToolResult } from "./effect-ai-content.js"
import { dispatchEffectMcpTool, effectMcpEditMode, fetchLatestNpmVersion } from "./effect-ai-dispatch.js"

/** Inputs needed to build a transport-independent Effect MCP registry. */
export interface EffectMcpRegistryOptions {
  readonly onDiscovery?: () => void
  readonly observeMovement?: MovementStageObserver
  readonly resolveClients: ClientResolver
  readonly resolveResourceClientLease?: (
    signal: AbortSignal
  ) => Promise<RequestClientLease<Exit.Exit<ClientBundle, HulyClientBundleError>>>
  readonly discoverConcreteResources?: boolean
  readonly telemetry: TelemetryOperations
  readonly registry: ToolRegistry | ProtocolToolRegistries
  readonly getHulyContext: (toolExposure: ToolExposureContext) => Effect.Effect<GetHulyContextResult>
  readonly exposureOptions?: Partial<ProtocolExposureOptions>
  readonly fetchLatestVersion?: () => Promise<string>
  readonly admission?: RequestAdmission
}

/**
 * The registration handle is deliberately small so a transport can own the
 * Effect scope while the server lifecycle owns request draining.
 */
export interface EffectMcpRegistry {
  readonly registration: Effect.Effect<void, never, McpServer>
  readonly layer: Layer.Layer<never, never, McpServer>
  readonly admission: RequestAdmission
  readonly quiesce: () => Promise<void>
}

type EffectCallToolResult = typeof McpSchema.CallToolResult.Type
// Internal view of Effect's decoded request profile. This value is not
// serialized or parsed by Huly, so the dated Effect protocol schema owns it.
type McpExposureProfile = { readonly clientInfo?: McpSchema.Implementation | undefined }

const defaultToolAnnotations = (tool: ToolDefinition): McpSchema.ToolAnnotations => {
  const annotations = resolveAnnotations(tool)
  return {
    title: annotations.title,
    readOnlyHint: annotations.readOnlyHint,
    destructiveHint: annotations.destructiveHint,
    idempotentHint: annotations.idempotentHint,
    openWorldHint: annotations.openWorldHint
  }
}

const clientInfoFromProfile = (profile: McpExposureProfile): McpClientInfoLike | undefined =>
  profile.clientInfo === undefined ? undefined : parseMcpClientInfo({ name: profile.clientInfo.name })

export { toEffectCallToolResult }

const responseStatus = (response: McpToolResponse) =>
  toolResponseStatus(response.isError === true, response._meta?.errorTag)

const responseOutputBytes = (response: McpToolResponse): number =>
  response.content.reduce((sum, entry) => sum + Buffer.byteLength(entry.text, "utf8"), 0)

const toolDefinition = (definition: ToolDefinition): McpSchema.Tool => {
  const listed = toListedHulyTool(definition)
  return new McpSchema.Tool({
    name: definition.name,
    description: definition.description,
    inputSchema: McpSchema.ToolJson.make(listed.inputSchema),
    outputSchema: McpSchema.ToolJson.make(listed.outputSchema),
    annotations: defaultToolAnnotations(definition)
  })
}

const builtinToolDefinitions = [versionToolDefinition, getHulyContextToolDefinition] as const

const asToolDefinition = (definition: (typeof builtinToolDefinitions)[number]): ToolDefinition => ({
  name: definition.name,
  description: definition.description,
  inputSchema: definition.inputSchema,
  outputSchema: definition.outputSchema,
  category: makeToolCategory("builtin")
})

const contextForVisibility = (enabledWhen: (profile: McpExposureProfile) => boolean): Context.Context<never> =>
  Context.add(Context.empty(), McpSchema.EnabledWhen, enabledWhen)

export const effectMcpFirstListVisibility = (
  options: EffectMcpRegistryOptions,
  registries: ProtocolToolRegistries,
  exposureOptions: ProtocolExposureOptions
): ((profile: McpExposureProfile) => boolean) => {
  let discovered = false
  return (profile) => {
    if (!discovered) {
      discovered = true
      options.onDiscovery?.()
    }
    const exposure = initializeExposure(registries, exposureOptions, profile)
    reportTelemetry(() =>
      options.telemetry.firstListTools({
        clientKind: exposure.context.clientKind,
        resolvedMode: exposure.context.resolvedMode
      })
    )
    return true
  }
}

const initializeExposure = (
  registries: ProtocolToolRegistries,
  options: ProtocolExposureOptions,
  profile: McpExposureProfile
) => resolveProtocolExposure(registries, { ...options, currentClientInfo: () => clientInfoFromProfile(profile) })

/** Deterministic request-profile visibility rules used by Effect AI's registry filter. */
export const effectMcpBuiltinVisible = (_profile: McpExposureProfile): boolean => true

export const effectMcpProxyVisible = (
  registries: ProtocolToolRegistries,
  options: ProtocolExposureOptions,
  profile: McpExposureProfile
): boolean => initializeExposure(registries, options, profile).context.resolvedMode === "proxy"

export const effectMcpNativeVisible = (
  registries: ProtocolToolRegistries,
  options: ProtocolExposureOptions,
  definition: ToolDefinition,
  profile: McpExposureProfile
): boolean => initializeExposure(registries, options, profile).visibleNativeRegistry.tools.has(definition.name)

export const effectMcpProxyVisibility =
  (registries: ProtocolToolRegistries, options: ProtocolExposureOptions): ((profile: McpExposureProfile) => boolean) =>
  (profile) =>
    effectMcpProxyVisible(registries, options, profile)

export const effectMcpNativeVisibility =
  (
    registries: ProtocolToolRegistries,
    options: ProtocolExposureOptions,
    definition: ToolDefinition
  ): ((profile: McpExposureProfile) => boolean) =>
  (profile) =>
    effectMcpNativeVisible(registries, options, definition, profile)

/** Registered tools remain directly callable so dispatch can return the established tool-level unavailable error. */
export const effectMcpRegisteredToolCallable = (_profile: McpExposureProfile): boolean => true

const makeToolHandler = (
  options: EffectMcpRegistryOptions,
  registries: ProtocolToolRegistries,
  exposureOptions: ProtocolExposureOptions,
  definition: ToolDefinition,
  admission: RequestAdmission,
  fetchLatestVersion: () => Promise<string>
): ((
  args: unknown
) => Effect.Effect<
  EffectCallToolResult,
  McpSchema.InternalError | McpSchema.InvalidParams,
  McpSchema.McpRequestContext
>) => {
  const handler = (args: unknown): Effect.Effect<EffectCallToolResult, never, McpSchema.McpRequestContext> =>
    Effect.gen(function* () {
      const request = yield* McpSchema.McpRequestContext
      const exposure = initializeExposure(registries, exposureOptions, request)
      const inputBytes = jsonUtf8Bytes(args ?? {})
      const editMode = definition.name === "invoke_tool" ? undefined : effectMcpEditMode(String(definition.name), args)
      const metadata = {
        toolName: definition.name,
        callPath: definition.name === "invoke_tool" ? "invoke_tool" : "direct",
        clientKind: exposure.context.clientKind,
        resolvedMode: exposure.context.resolvedMode,
        ...(inputBytes === undefined ? {} : { inputBytes }),
        ...(editMode === undefined ? {} : { editMode })
      } satisfies ToolObservation
      const dispatchOptions = {
        ...options,
        onInvoke: (tool: ToolDefinition, normalized: unknown) => {
          metadata.toolName = tool.name
          const mode = effectMcpEditMode(String(tool.name), normalized)
          if (mode !== undefined) metadata.editMode = mode
        }
      }
      const call = Effect.acquireUseRelease(
        Effect.sync(() => admission.enter()),
        (lease) =>
          lease === null
            ? Effect.succeed(createServerShuttingDownError())
            : withRequestScopedResolver(options.resolveClients, (resolver) => {
                const dispatched = dispatchEffectMcpTool(
                  dispatchOptions,
                  exposure,
                  definition,
                  args,
                  fetchLatestVersion,
                  resolver
                )
                const observed =
                  definition.name === "move_issue" && options.observeMovement !== undefined
                    ? options.observeMovement(dispatched)
                    : dispatched
                return observed.pipe(
                  Effect.catchDefect((defect) =>
                    Effect.succeed(
                      mapDomainErrorToMcp(
                        new HulyError({ message: defect instanceof Error ? defect.message : "Tool execution failed" })
                      )
                    )
                  )
                )
              }),
        (lease) => Effect.sync(() => lease?.release())
      )
      const response = yield* observeToolCall(options.telemetry, metadata, call, (value) => ({
        status: responseStatus(value),
        ...(value._meta?.errorTag === undefined ? {} : { errorTag: value._meta.errorTag }),
        outputBytes: responseOutputBytes(value)
      }))
      return toEffectCallToolResult(response)
    })

  return handler
}

const registerTool = (
  server: McpServer["Service"],
  options: EffectMcpRegistryOptions,
  registries: ProtocolToolRegistries,
  exposureOptions: ProtocolExposureOptions,
  definition: ToolDefinition,
  visibility: (profile: McpExposureProfile) => boolean,
  admission: RequestAdmission,
  fetchLatestVersion: () => Promise<string>,
  callableWhen?: (profile: McpExposureProfile) => boolean
): Effect.Effect<void> =>
  server.addTool({
    tool: toolDefinition(definition),
    annotations: contextForVisibility(visibility),
    ...(callableWhen === undefined ? {} : { callableWhen }),
    handle: makeToolHandler(options, registries, exposureOptions, definition, admission, fetchLatestVersion)
  })

const registerAll = (
  options: EffectMcpRegistryOptions,
  registries: ProtocolToolRegistries,
  exposureOptions: ProtocolExposureOptions,
  admission: RequestAdmission,
  fetchLatestVersion: () => Promise<string>
): Effect.Effect<void, never, McpServer> =>
  Effect.gen(function* () {
    const server = yield* McpServer
    yield* server.setUnknownToolHandler((call) => {
      const definition = registries.fullRegistry.tools.get(call.name)
      if (definition !== undefined)
        return makeToolHandler(
          options,
          registries,
          exposureOptions,
          definition,
          admission,
          fetchLatestVersion
        )(call.arguments)
      const response = Effect.acquireUseRelease(
        Effect.sync(() => admission.enter()),
        (lease) => Effect.succeed(lease === null ? createServerShuttingDownError() : createUnknownToolError(call.name)),
        (lease) => Effect.sync(() => lease?.release())
      )
      return observeToolCall(options.telemetry, { toolName: "unknown", callPath: "direct" }, response, (value) => ({
        status: responseStatus(value),
        ...(value._meta?.errorTag === undefined ? {} : { errorTag: value._meta.errorTag }),
        outputBytes: responseOutputBytes(value)
      })).pipe(Effect.map(toEffectCallToolResult))
    })
    for (const [index, definition] of builtinToolDefinitions.entries()) {
      yield* registerTool(
        server,
        options,
        registries,
        exposureOptions,
        asToolDefinition(definition),
        index === 0 ? effectMcpFirstListVisibility(options, registries, exposureOptions) : effectMcpBuiltinVisible,
        admission,
        fetchLatestVersion
      )
    }
    for (const definition of proxyToolDefinitions) {
      yield* registerTool(
        server,
        options,
        registries,
        exposureOptions,
        definition,
        effectMcpProxyVisibility(registries, exposureOptions),
        admission,
        fetchLatestVersion,
        effectMcpRegisteredToolCallable
      )
    }
    for (const definition of resolveNativeRegistrationRegistry(registries, exposureOptions).definitions) {
      yield* registerTool(
        server,
        options,
        registries,
        exposureOptions,
        definition,
        effectMcpNativeVisibility(registries, exposureOptions, definition),
        admission,
        fetchLatestVersion,
        effectMcpRegisteredToolCallable
      )
    }
    yield* registerEffectMcpResources(options.resolveClients, admission, {
      ...(options.resolveResourceClientLease === undefined
        ? {}
        : { leaseResolver: options.resolveResourceClientLease }),
      ...(options.discoverConcreteResources === undefined
        ? {}
        : { discoverConcreteResources: options.discoverConcreteResources })
    })
  })

const resolveExposureOptions = (options: EffectMcpRegistryOptions): ProtocolExposureOptions => {
  const defaults = defaultExposureOptions()
  const configured = options.exposureOptions
  return {
    exposureConfig: configured?.exposureConfig ?? defaults.exposureConfig,
    toolScopeFilteringActive: configured?.toolScopeFilteringActive ?? defaults.toolScopeFilteringActive,
    currentClientInfo: configured?.currentClientInfo ?? defaults.currentClientInfo
  }
}

/** Build an Effect AI registry and its transport-facing registration layer. */
export const makeEffectMcpRegistry = (options: EffectMcpRegistryOptions): EffectMcpRegistry => {
  const registries = normalizeRegistries(options.registry)
  const exposureOptions = resolveExposureOptions(options)
  const admission = options.admission ?? createRequestAdmission()
  const fetchLatestVersion = options.fetchLatestVersion ?? fetchLatestNpmVersion
  const registration = registerAll(options, registries, exposureOptions, admission, fetchLatestVersion)

  return { registration, layer: Layer.effectDiscard(registration), admission, quiesce: admission.quiesce }
}

/** Convenience alias for callers that only need a registration effect. */
export const registerEffectMcpRegistry = (options: EffectMcpRegistryOptions): Effect.Effect<void, never, McpServer> =>
  makeEffectMcpRegistry(options).registration
