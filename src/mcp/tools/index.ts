import type { HulyClient } from "../../huly/client.js"
import type { HulyStorageClient } from "../../huly/storage.js"
import type { WorkspaceClientOperations } from "../../huly/workspace-client.js"
import type { McpToolResponse } from "../error-mapping.js"
import {
  type RegisteredTool,
  type ToolCategory,
  type ToolDefinition,
  createMissingArgumentsError,
  createUnexpectedArgumentsError,
  isEmptyArgumentsObject,
  isNoArgumentTool,
  requiresArgumentsObject,
  resolveAnnotations
} from "./registry.js"

import type { McpToolName } from "./eager.js"
import { toolCatalog } from "./catalog.js"
import { toolGroupLoaders } from "./group-loaders.js"
import { makeLazyTool, preloadToolGroups } from "../lazy-tool.js"
export type { McpToolName } from "./eager.js"
export const allTools = toolCatalog.map(({ group, ...definition }) => makeLazyTool(definition, toolGroupLoaders[group]))

export const CATEGORY_NAMES: ReadonlySet<ToolCategory> = new Set(allTools.map((t) => t.category))

type ToolRegistryData = {
  readonly tools: ReadonlyMap<string, RegisteredTool>
  readonly definitions: ReadonlyArray<ToolDefinition>
}

type OperationRegistryData = {
  readonly operations: ReadonlyMap<McpToolName, RegisteredTool<McpToolName>["operation"]>
  readonly definitions: ReadonlyArray<ToolDefinition>
}

type OperationRegistryMethods = {
  readonly getOperation: (name: McpToolName) => RegisteredTool<McpToolName>["operation"]
}

type OperationRegistry = OperationRegistryData & OperationRegistryMethods

type ToolRegistryMethods = {
  readonly handleToolCall: (
    toolName: string,
    args: unknown,
    hulyClient: HulyClient["Service"],
    storageClient: HulyStorageClient["Service"],
    workspaceClient?: WorkspaceClientOperations
  ) => Promise<McpToolResponse | null>
}

export type ToolRegistry = ToolRegistryData & ToolRegistryMethods

interface ToolRegistryScope {
  readonly filteringActive: boolean
  readonly categories: ReadonlySet<ToolCategory>
  readonly toolNames: ReadonlySet<string>
}

const buildRegistry = (tools: ReadonlyArray<RegisteredTool>): ToolRegistry => {
  const map = new Map<string, RegisteredTool>(tools.map((t) => [t.name, t]))
  return {
    tools: map,
    definitions: tools,
    handleToolCall: async (toolName, args, hulyClient, storageClient, workspaceClient) => {
      const tool = map.get(toolName)
      if (!tool) return null
      if (isNoArgumentTool(tool) && !isEmptyArgumentsObject(args)) {
        return createUnexpectedArgumentsError(toolName)
      }
      if (args === undefined && requiresArgumentsObject(tool)) {
        return createMissingArgumentsError(toolName)
      }
      return tool.handler(args ?? {}, hulyClient, storageClient, workspaceClient)
    }
  }
}

export const toolRegistry: ToolRegistry = buildRegistry(allTools)

const buildOperationRegistry = (tools: ReadonlyArray<RegisteredTool<McpToolName>>): OperationRegistry => {
  const operations = new Map<McpToolName, RegisteredTool<McpToolName>["operation"]>(
    tools.map((tool) => [tool.name, tool.operation])
  )
  return {
    operations,
    definitions: tools.map((tool) => tool.operation),
    getOperation: (name) => {
      const operation = operations.get(name)
      if (operation === undefined) {
        throw new Error(`Operation registry is missing MCP tool: ${name}`)
      }
      return operation
    }
  }
}

export const operationRegistry: OperationRegistry = buildOperationRegistry(allTools)

export const createScopedRegistry = (scope: ToolRegistryScope): ToolRegistry => {
  return createScopedRegistryFrom(toolRegistry, scope)
}

export const createScopedRegistryFrom = (registry: ToolRegistry, scope: ToolRegistryScope): ToolRegistry => {
  if (!scope.filteringActive) return registry
  return buildRegistry(
    Array.from(registry.tools.values()).filter(
      (tool) => scope.categories.has(tool.category) || scope.toolNames.has(tool.name)
    )
  )
}

export const createFilteredRegistry = (categories: ReadonlySet<ToolCategory>): ToolRegistry =>
  createScopedRegistry({ filteringActive: true, categories, toolNames: new Set<string>() })

export { resolveAnnotations }

export const TOOL_DEFINITIONS = Object.fromEntries(toolRegistry.tools)

export const preloadToolHandlers = preloadToolGroups(Object.values(toolGroupLoaders))
