import type { ListToolsResult } from "@modelcontextprotocol/sdk/types.js"

import type { ToolExposureContext } from "./huly-context-tool.js"
import { toClientCompatibleInputSchema } from "./input-schema-compat.js"
import { stripCollidingSchemaIdsProperties, stripCollidingSchemaIdsRecord } from "./json-schema-refs.js"
import { PROXY_TOOL_NAMES, proxyToolDefinitions } from "./proxy-tools.js"
import {
  classifyMcpClient,
  type McpClientInfoLike,
  resolveToolExposureMode,
  type ToolExposureConfig
} from "./tool-mode.js"
import type { ToolRegistry } from "./tools/index.js"
import { resolveAnnotations } from "./tools/index.js"
import type { RegisteredTool, ToolDescription, ToolName } from "./tools/registry.js"

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

type ProtocolObjectSchema = ListToolsResult["tools"][number]["inputSchema"]
type ListedTool = ListToolsResult["tools"][number]

interface ListedToolSource {
  readonly name: ToolName
  readonly description: ToolDescription
  readonly inputSchema: ProtocolObjectSchemaSource
  readonly outputSchema?: ProtocolObjectSchemaSource
  readonly annotations?: ListedTool["annotations"]
}

const BUILTIN_TOOL_COUNT = 2
const DEFAULT_HANDLER_EXPOSURE_CONFIG: ToolExposureConfig = {
  configuredMode: "native",
  proxyOutputStrict: false
}

const emptyToolRegistry: ToolRegistry = {
  tools: new Map<ToolName, RegisteredTool>(),
  definitions: [],
  handleToolCall: async () => null
}

const isObjectPropertyEntry = (entry: [string, unknown]): entry is [string, object] => {
  const value = entry[1]
  return typeof value === "object" && value !== null
}

const objectProperties = (properties: Record<string, unknown> | undefined): Record<string, object> | undefined => {
  if (properties === undefined) return undefined

  return Object.entries(properties).filter(isObjectPropertyEntry).reduce<Record<string, object>>(
    (acc, [key, value]) => ({ ...acc, [key]: value }),
    {}
  )
}

const toProtocolObjectSchema = (schema: ProtocolObjectSchemaSource): ProtocolObjectSchema => {
  const { properties, required, ...rest } = schema
  const convertedProperties = objectProperties(properties)
  return {
    ...stripCollidingSchemaIdsRecord(rest),
    type: "object",
    ...(convertedProperties === undefined
      ? {}
      : { properties: stripCollidingSchemaIdsProperties(convertedProperties) }),
    ...(required === undefined ? {} : { required: [...required] })
  }
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
  const visibleNativeRegistry = resolvedMode === "native"
    ? registries.scopedNativeRegistry
    : options.toolScopeFilteringActive && !options.exposureConfig.proxyOutputStrict
    ? registries.scopedNativeRegistry
    : emptyToolRegistry
  const visibleToolCount = BUILTIN_TOOL_COUNT
    + visibleNativeRegistry.definitions.length
    + (resolvedMode === "proxy" ? proxyToolDefinitions.length : 0)

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
