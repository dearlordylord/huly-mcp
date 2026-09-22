/**
 * Effect AI registration for the Huly MCP tool and resource registries.
 *
 * The Huly registry intentionally stays independent from the MCP transport.
 * A transport provides `McpServer` (through `McpServer.layerStdio`,
 * `McpServer.layerHttp`, or `McpServer.layer`) and provides this module's
 * registration effect.  This keeps request-scoped client acquisition in the
 * caller's closure while making protocol dispatch Effect-native.
 */
import { Clock, Context, Effect, type Exit, Layer } from "effect"
import { McpServer } from "effect/unstable/ai/McpServer"
import * as McpSchema from "effect/unstable/ai/McpSchema"

import type { GetHulyContextResult } from "../domain/schemas/index.js"
import { HulyError } from "../huly/errors-base.js"
import type { ClientBundle, ClientResolver, HulyClientBundleError } from "../runtime/client-resolver.js"
import type { TelemetryOperations } from "../telemetry/telemetry.js"
import type { McpToolResponse } from "./error-mapping.js"
import { createServerShuttingDownError, createUnknownToolError, mapDomainErrorToMcp } from "./error-mapping.js"
import { getHulyContextToolDefinition, type ToolExposureContext, versionToolDefinition } from "./huly-context-tool.js"
import { createRequestAdmission, type RequestAdmission } from "./request-admission.js"
import type { RequestClientLease } from "./request-client-lifecycle.js"
import { withRequestScopedResolver } from "./effect-ai-request.js"
import {
  defaultExposureOptions,
  normalizeRegistries,
  type ProtocolExposureOptions,
  type ProtocolToolRegistries,
  resolveProtocolExposure,
  toListedHulyTool
} from "./protocol-tool-exposure.js"
import { proxyToolDefinitions } from "./proxy-tools.js"
import type { ToolRegistry } from "./tools/index.js"
import { makeToolCategory, resolveAnnotations } from "./tools/registry.js"
import type { ToolDefinition } from "./tools/registry.js"
import type { McpClientInfoLike } from "./tool-mode.js"
import { parseMcpClientInfo } from "./tool-mode.js"
import { registerEffectMcpResources } from "./effect-ai-resources.js"
import { toEffectCallToolResult } from "./effect-ai-content.js"
import { dispatchEffectMcpTool, effectMcpEditMode, fetchLatestNpmVersion } from "./effect-ai-dispatch.js"

/** Inputs needed to build a transport-independent Effect MCP registry. */
export interface EffectMcpRegistryOptions {
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

const responseStatus = (response: McpToolResponse): "error" | "success" =>
  response.isError === true ? "error" : "success"

const responseOutputBytes = (response: McpToolResponse): number =>
  response.content.reduce((sum, entry) => sum + entry.text.length, 0)

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

export const effectMcpFirstListVisibility =
  (
    options: EffectMcpRegistryOptions,
    registries: ProtocolToolRegistries,
    exposureOptions: ProtocolExposureOptions
  ): ((profile: McpExposureProfile) => boolean) =>
  (profile) => {
    const exposure = initializeExposure(registries, exposureOptions, profile)
    options.telemetry.firstListTools({
      clientKind: exposure.context.clientKind,
      resolvedMode: exposure.context.resolvedMode
    })
    return true
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
    Effect.acquireUseRelease(
      Effect.sync(() => admission.enter()),
      (lease) => {
        if (lease === null) return Effect.succeed(toEffectCallToolResult(createServerShuttingDownError()))
        return withRequestScopedResolver(options.resolveClients, (resolver) =>
          Effect.gen(function* () {
            const start = yield* Clock.currentTimeMillis
            const request = yield* McpSchema.McpRequestContext
            const exposure = initializeExposure(registries, exposureOptions, request)
            const call = dispatchEffectMcpTool(options, exposure, definition, args, fetchLatestVersion, resolver)
            const editMode = effectMcpEditMode(String(definition.name), args)
            const response = yield* call.pipe(
              Effect.catchDefect((defect) =>
                Effect.succeed(
                  mapDomainErrorToMcp(
                    new HulyError({ message: defect instanceof Error ? defect.message : "Tool execution failed" })
                  )
                )
              )
            )
            const end = yield* Clock.currentTimeMillis
            yield* Effect.sync(() => {
              options.telemetry.toolCalled({
                toolName: definition.name,
                status: responseStatus(response),
                clientKind: exposure.context.clientKind,
                resolvedMode: exposure.context.resolvedMode,
                errorTag: response._meta?.errorTag,
                durationMs: end - start,
                inputBytes: JSON.stringify(args ?? {}).length,
                outputBytes: responseOutputBytes(response),
                ...(editMode === undefined ? {} : { editMode })
              })
            })
            return toEffectCallToolResult(response)
          })
        )
      },
      (lease) => Effect.sync(() => lease?.release())
    )

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
    yield* server.setUnknownToolHandler((call) =>
      Effect.acquireUseRelease(
        Effect.sync(() => admission.enter()),
        (lease) =>
          Effect.succeed(
            toEffectCallToolResult(lease === null ? createServerShuttingDownError() : createUnknownToolError(call.name))
          ),
        (lease) => Effect.sync(() => lease?.release())
      )
    )
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
    for (const definition of registries.fullRegistry.definitions) {
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
