import { Schema } from "effect"
import type * as McpSchema from "effect/unstable/ai/McpSchema"
import type { ToolExposureContext } from "./huly-context-tool.js"
import { toClientCompatibleInputSchema } from "./input-schema-compat.js"
import { stripCollidingSchemaIdsRecord } from "./json-schema-refs.js"
import { PROXY_TOOL_NAMES, proxyToolDefinitions } from "./proxy-tools.js"
import {
  classifyMcpClient,
  type McpClientInfoLike,
  resolveToolExposureMode,
  type ToolExposureConfig
} from "./tool-mode.js"
import type { ToolRegistry } from "./tools/index.js"
import { resolveAnnotations } from "./tools/index.js"
import type { RegisteredTool } from "./tools/registry.js"

export interface ProtocolToolRegistries {
  readonly fullRegistry: ToolRegistry
  readonly scopedNativeRegistry: ToolRegistry
}

// eslint-disable-next-line functional/no-mixed-types -- protocol exposure options bundle static config with a request-local client-info provider.
export interface ProtocolExposureOptions {
  readonly exposureConfig: ToolExposureConfig
  readonly toolScopeFilteringActive: boolean
  readonly currentClientInfo: () => McpClientInfoLike | undefined
}

interface ResolvedProtocolExposure {
  readonly context: ToolExposureContext
  readonly visibleNativeRegistry: ToolRegistry
  readonly proxyCandidateRegistry: ToolRegistry
}

interface ProtocolObjectSchemaSource {
  readonly type: "object"
  // JSON Schema property names are string keys by protocol definition.
  readonly properties?: Record<string, unknown> | undefined
  readonly required?: ReadonlyArray<string> | undefined
  readonly [key: string]: unknown
}

type JSONValue = Schema.Schema.Type<typeof Schema.Json>
type ProtocolObjectSchema = McpSchema.Tool["inputSchema"]
type ListedTool = McpSchema.Tool

interface ListedToolSource {
  readonly name: string
  readonly description: string
  readonly inputSchema: ProtocolObjectSchemaSource
  readonly outputSchema?: ProtocolObjectSchemaSource
  readonly annotations?: ListedTool["annotations"]
}

const BUILTIN_TOOL_COUNT = 2
const DEFAULT_HANDLER_EXPOSURE_CONFIG: ToolExposureConfig = { configuredMode: "native", proxyOutputStrict: false }

const emptyToolRegistry: ToolRegistry = {
  tools: new Map<string, RegisteredTool>(),
  definitions: [],
  handleToolCall: async () => null
}

const isJsonValue = (value: unknown): value is JSONValue => {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true
  if (typeof value === "number") return Number.isFinite(value)
  if (Array.isArray(value)) return value.every(isJsonValue)
  if (typeof value !== "object") return false
  return Object.values(value).every(isJsonValue)
}

const isProtocolObjectSchema = (value: unknown): value is ProtocolObjectSchema =>
  isJsonValue(value) &&
  !Array.isArray(value) &&
  value !== null &&
  typeof value === "object" &&
  "type" in value &&
  value.type === "object"

const protocolProperties = (properties: Record<string, unknown> | undefined): Record<string, JSONValue> | undefined => {
  if (properties === undefined) return undefined
  return Object.fromEntries(
    Object.entries(properties).map(([name, value]): [string, JSONValue] => {
      if (
        typeof value !== "boolean" &&
        !(isJsonValue(value) && typeof value === "object" && value !== null && !Array.isArray(value))
      ) {
        throw new TypeError(`Tool schema property "${name}" is not a JSON Schema object or boolean`)
      }
      return [name, value]
    })
  )
}

const ProtocolObjectSchemaBoundary = Schema.declare(isProtocolObjectSchema)

const toProtocolObjectSchema = (schema: ProtocolObjectSchemaSource): ProtocolObjectSchema => {
  const { properties, required, ...rest } = schema
  const convertedProperties = protocolProperties(properties)
  return Schema.decodeUnknownSync(ProtocolObjectSchemaBoundary)({
    ...stripCollidingSchemaIdsRecord({
      ...rest,
      ...(convertedProperties === undefined ? {} : { properties: convertedProperties })
    }),
    type: "object",
    ...(required === undefined ? {} : { required: [...required] })
  })
}

export const normalizeRegistries = (registry: ToolRegistry | ProtocolToolRegistries): ProtocolToolRegistries =>
  "fullRegistry" in registry ? registry : { fullRegistry: registry, scopedNativeRegistry: registry }

export const defaultExposureOptions = (): ProtocolExposureOptions => ({
  exposureConfig: DEFAULT_HANDLER_EXPOSURE_CONFIG,
  toolScopeFilteringActive: false,
  currentClientInfo: () => undefined
})

const resolveProxyCandidateRegistry = (
  registries: ProtocolToolRegistries,
  options: ProtocolExposureOptions
): ToolRegistry => {
  if (!options.exposureConfig.proxyOutputStrict) return registries.fullRegistry
  return options.toolScopeFilteringActive ? registries.scopedNativeRegistry : registries.fullRegistry
}

export const resolveProtocolExposure = (
  registries: ProtocolToolRegistries,
  options: ProtocolExposureOptions
): ResolvedProtocolExposure => {
  const clientInfo = options.currentClientInfo()
  const clientKind = classifyMcpClient(clientInfo)
  const resolvedMode = resolveToolExposureMode({
    configuredMode: options.exposureConfig.configuredMode,
    ...(clientInfo === undefined ? {} : { clientInfo })
  })
  const proxyCandidateRegistry = resolveProxyCandidateRegistry(registries, options)
  const visibleNativeRegistry =
    resolvedMode === "native"
      ? registries.scopedNativeRegistry
      : options.toolScopeFilteringActive && !options.exposureConfig.proxyOutputStrict
        ? registries.scopedNativeRegistry
        : emptyToolRegistry
  const visibleToolCount =
    BUILTIN_TOOL_COUNT +
    visibleNativeRegistry.definitions.length +
    (resolvedMode === "proxy" ? proxyToolDefinitions.length : 0)

  return {
    context: {
      configuredMode: options.exposureConfig.configuredMode,
      resolvedMode,
      clientKind,
      proxyOutputStrict: options.exposureConfig.proxyOutputStrict,
      visibleToolCount,
      nativeVisibleToolCount: visibleNativeRegistry.definitions.length,
      proxyCandidateToolCount: proxyCandidateRegistry.definitions.length,
      proxyToolNames: resolvedMode === "proxy" ? PROXY_TOOL_NAMES : []
    },
    visibleNativeRegistry,
    proxyCandidateRegistry
  }
}

export const toListedTool = (tool: ListedToolSource): ListedTool => ({
  name: tool.name,
  description: tool.description,
  inputSchema: toProtocolObjectSchema(tool.inputSchema),
  ...(tool.outputSchema === undefined ? {} : { outputSchema: toProtocolObjectSchema(tool.outputSchema) }),
  ...(tool.annotations === undefined ? {} : { annotations: tool.annotations })
})

export const toListedHulyTool = (tool: ToolRegistry["definitions"][number]): ListedTool =>
  toListedTool({
    name: tool.name,
    description: tool.description,
    inputSchema: toClientCompatibleInputSchema(tool.inputSchema),
    outputSchema: tool.outputSchema,
    annotations: resolveAnnotations(tool)
  })
