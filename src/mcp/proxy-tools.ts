import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js"
import { Either, Schema } from "effect"

import { Count } from "../domain/schemas/index.js"
import type { HulyStorageClient } from "../huly/storage.js"
import type { WorkspaceClientOperations } from "../huly/workspace-client.js"
import {
  createInvalidParamsError,
  createSuccessResponse,
  createUnknownToolError,
  mapParseErrorToMcp,
  type McpToolResponse
} from "./error-mapping.js"
import {
  listCategories,
  SEARCH_DEFAULT_LIMIT_VALUE,
  SEARCH_MAX_LIMIT,
  searchToolDefinitions,
  SearchToolLimit,
  ToolParameterName,
  toolParamSummary,
  ToolSearchQuery
} from "./proxy-tool-catalog.js"
import { createToolOutputSchema } from "./tool-output-schema.js"
import type { ToolRegistry } from "./tools/index.js"
import { resolveAnnotations } from "./tools/index.js"
import {
  createToolDefinition,
  makeToolCategory,
  ToolCategory,
  type ToolDefinition,
  ToolDescription,
  ToolName
} from "./tools/registry.js"

export { makeSearchToolLimit, makeToolSearchQuery, searchToolDefinitions } from "./proxy-tool-catalog.js"

const LIST_TOOL_CATEGORIES_TOOL_NAME = ToolName.make("list_tool_categories")
const SEARCH_TOOLS_TOOL_NAME = ToolName.make("search_tools")
const GET_TOOL_SCHEMA_TOOL_NAME = ToolName.make("get_tool_schema")
export const INVOKE_TOOL_TOOL_NAME = ToolName.make("invoke_tool")
const PROXY_TOOL_CATEGORY = makeToolCategory("proxy")

export const PROXY_TOOL_NAMES: ReadonlyArray<ToolName> = [
  LIST_TOOL_CATEGORIES_TOOL_NAME,
  SEARCH_TOOLS_TOOL_NAME,
  GET_TOOL_SCHEMA_TOOL_NAME,
  INVOKE_TOOL_TOOL_NAME
]

const EmptyProxyParamsSchema = Schema.Record({ key: Schema.String, value: Schema.Never })
const SearchToolsParamsSchema = Schema.Struct({
  query: ToolSearchQuery,
  limit: Schema.optionalWith(SearchToolLimit, { exact: true })
})
const ToolNameParamsSchema = Schema.Struct({
  toolName: ToolName
})
const InvokeToolParamsSchema = Schema.Struct({
  toolName: ToolName,
  arguments: Schema.optionalWith(Schema.Unknown, { exact: true })
})

const ProxyToolCategorySchema = Schema.Struct({
  name: ToolCategory,
  description: ToolDescription,
  toolCount: Count
})
const ListToolCategoriesResultSchema = Schema.Struct({
  categories: Schema.Array(ProxyToolCategorySchema)
})
const ToolSearchMatchSchema = Schema.Struct({
  name: ToolName,
  category: ToolCategory,
  description: ToolDescription,
  requiredParams: Schema.Array(ToolParameterName),
  optionalParams: Schema.Array(ToolParameterName)
})
const SearchToolsResultSchema = Schema.Struct({
  matches: Schema.Array(ToolSearchMatchSchema)
})
const ToolAnnotationsSchema = Schema.Struct({
  title: Schema.optionalWith(Schema.NonEmptyTrimmedString, { exact: true }),
  readOnlyHint: Schema.optionalWith(Schema.Boolean, { exact: true }),
  destructiveHint: Schema.optionalWith(Schema.Boolean, { exact: true }),
  idempotentHint: Schema.optionalWith(Schema.Boolean, { exact: true }),
  openWorldHint: Schema.optionalWith(Schema.Boolean, { exact: true })
})
const GetToolSchemaResultSchema = Schema.Struct({
  name: ToolName,
  category: ToolCategory,
  description: ToolDescription,
  inputSchema: Schema.Unknown,
  outputSchema: Schema.Unknown,
  annotations: ToolAnnotationsSchema
})
const InvokeToolResultSchema = Schema.Struct({
  toolName: ToolName,
  result: Schema.Unknown,
  warnings: Schema.optionalWith(Schema.Array(Schema.Unknown), { exact: true })
})

const emptyInputSchema = {
  type: "object",
  properties: {},
  additionalProperties: false
} satisfies ToolDefinition["inputSchema"]

const searchToolsInputSchema = {
  type: "object",
  properties: {
    query: {
      type: "string",
      minLength: 1,
      description: "Search text matched against Huly tool names, categories, descriptions, and parameter names."
    },
    limit: {
      type: "integer",
      minimum: 1,
      maximum: SEARCH_MAX_LIMIT,
      description: "Maximum number of matches to return. Defaults to 10 and cannot exceed 50."
    }
  },
  required: ["query"],
  additionalProperties: false
} satisfies ToolDefinition["inputSchema"]

const toolNameInputSchema = {
  type: "object",
  properties: {
    toolName: {
      type: "string",
      minLength: 1,
      description: "Exact Huly tool name from search_tools or list_tool_categories results."
    }
  },
  required: ["toolName"],
  additionalProperties: false
} satisfies ToolDefinition["inputSchema"]

const invokeToolInputSchema = {
  type: "object",
  properties: {
    toolName: {
      type: "string",
      minLength: 1,
      description: "Exact Huly tool name to invoke through the proxy."
    },
    arguments: {
      description: "Arguments object for the target Huly tool. Use {} when the target tool accepts no parameters."
    }
  },
  required: ["toolName"],
  additionalProperties: false
} satisfies ToolDefinition["inputSchema"]

const readOnlyProxyAnnotations = (title: string): ToolAnnotations => ({
  title,
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false
})

export const proxyToolDefinitions: ReadonlyArray<ToolDefinition> = [
  createToolDefinition({
    name: LIST_TOOL_CATEGORIES_TOOL_NAME,
    description:
      "Lists Huly tool categories available through this proxy. Use this first when you need a broad map of capabilities before searching for a specific Huly tool.",
    inputSchema: emptyInputSchema,
    outputSchema: createToolOutputSchema(ListToolCategoriesResultSchema),
    category: PROXY_TOOL_CATEGORY,
    annotations: readOnlyProxyAnnotations("List Tool Categories")
  }),
  createToolDefinition({
    name: SEARCH_TOOLS_TOOL_NAME,
    description:
      "Searches the current proxy-visible Huly tool catalog by tool name, category, description, and parameter names. Returns exact tool names plus required and optional parameter names for single-call follow-up with get_tool_schema or invoke_tool.",
    inputSchema: searchToolsInputSchema,
    outputSchema: createToolOutputSchema(SearchToolsResultSchema),
    category: PROXY_TOOL_CATEGORY,
    annotations: readOnlyProxyAnnotations("Search Tools")
  }),
  createToolDefinition({
    name: GET_TOOL_SCHEMA_TOOL_NAME,
    description:
      "Returns the exact input and output schema for one proxy-visible Huly tool. Use this before invoke_tool when you are not certain about required argument names or result shape.",
    inputSchema: toolNameInputSchema,
    outputSchema: createToolOutputSchema(GetToolSchemaResultSchema),
    category: PROXY_TOOL_CATEGORY,
    annotations: readOnlyProxyAnnotations("Get Tool Schema")
  }),
  createToolDefinition({
    name: INVOKE_TOOL_TOOL_NAME,
    description:
      "Invokes one proxy-visible Huly tool by exact name with its arguments. This tool can call read or write Huly operations; check get_tool_schema and the target tool annotations when safety matters.",
    inputSchema: invokeToolInputSchema,
    outputSchema: createToolOutputSchema(InvokeToolResultSchema),
    category: PROXY_TOOL_CATEGORY,
    annotations: {
      title: "Invoke Tool",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false
    }
  })
]

export const isProxyToolName = (name: string): name is ToolName =>
  PROXY_TOOL_NAMES.some((toolName) => toolName === name)

const decodeOrError = <A, I>(
  schema: Schema.Schema<A, I, never>,
  input: unknown,
  toolName: ToolName
): A | McpToolResponse => {
  const decoded = Schema.decodeUnknownEither(schema)(input ?? {})
  if (Either.isRight(decoded)) return decoded.right
  return mapParseErrorToMcp(decoded.left, toolName)
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const isMcpToolResponse = (value: unknown): value is McpToolResponse => isRecord(value) && Array.isArray(value.content)

const searchTools = (registry: ToolRegistry, args: unknown): McpToolResponse => {
  const params = decodeOrError(SearchToolsParamsSchema, args, SEARCH_TOOLS_TOOL_NAME)
  if (isMcpToolResponse(params)) return params
  const limit = params.limit ?? SEARCH_DEFAULT_LIMIT_VALUE
  const matches = searchToolDefinitions(registry, params.query, limit).map((tool) => {
    const paramSummary = toolParamSummary(tool)
    return {
      name: tool.name,
      category: tool.category,
      description: tool.description,
      requiredParams: paramSummary.requiredParams,
      optionalParams: paramSummary.optionalParams
    }
  })
  return createSuccessResponse({ matches })
}

const getToolSchema = (registry: ToolRegistry, args: unknown): McpToolResponse => {
  const params = decodeOrError(ToolNameParamsSchema, args, GET_TOOL_SCHEMA_TOOL_NAME)
  if (isMcpToolResponse(params)) return params

  const tool = registry.tools.get(params.toolName)
  if (tool === undefined) return createUnknownToolError(params.toolName)
  return createSuccessResponse({
    name: tool.name,
    category: tool.category,
    description: tool.description,
    inputSchema: tool.inputSchema,
    outputSchema: tool.outputSchema,
    annotations: resolveAnnotations(tool)
  })
}

interface InvokeToolClients {
  readonly hulyClient: Parameters<ToolRegistry["handleToolCall"]>[2]
  readonly storageClient: HulyStorageClient["Type"]
  readonly workspaceClient?: WorkspaceClientOperations
}

const invokeTool = async (
  registry: ToolRegistry,
  args: unknown,
  clients: InvokeToolClients
): Promise<McpToolResponse> => {
  const params = decodeOrError(InvokeToolParamsSchema, args, INVOKE_TOOL_TOOL_NAME)
  if (isMcpToolResponse(params)) return params

  if (!registry.tools.has(params.toolName)) return createUnknownToolError(params.toolName)

  const response = await registry.handleToolCall(
    params.toolName,
    params.arguments,
    clients.hulyClient,
    clients.storageClient,
    clients.workspaceClient
  )
  if (response === null) return createUnknownToolError(params.toolName)
  if (response.isError === true) return response

  const warnings = response.structuredContent?.warnings ?? []
  return createSuccessResponse(
    {
      toolName: params.toolName,
      result: response.structuredContent?.result ?? response.content,
      ...(warnings.length === 0 ? {} : { warnings })
    },
    warnings
  )
}

interface ProxyToolCallInput {
  readonly toolName: ToolName
  readonly args: unknown
  readonly proxyCandidateRegistry: ToolRegistry
  readonly clients?: InvokeToolClients
}

export const handleProxyToolCall = async (input: ProxyToolCallInput): Promise<McpToolResponse> => {
  switch (input.toolName) {
    case LIST_TOOL_CATEGORIES_TOOL_NAME: {
      const params = decodeOrError(EmptyProxyParamsSchema, input.args, LIST_TOOL_CATEGORIES_TOOL_NAME)
      if (isMcpToolResponse(params)) return params
      return listCategories(input.proxyCandidateRegistry)
    }
    case SEARCH_TOOLS_TOOL_NAME:
      return searchTools(input.proxyCandidateRegistry, input.args)
    case GET_TOOL_SCHEMA_TOOL_NAME:
      return getToolSchema(input.proxyCandidateRegistry, input.args)
    case INVOKE_TOOL_TOOL_NAME:
      if (input.clients === undefined) {
        return createInvalidParamsError("invoke_tool requires initialized Huly clients.", "ProxyClientsMissing")
      }
      return invokeTool(input.proxyCandidateRegistry, input.args, input.clients)
    default:
      return createUnknownToolError(input.toolName)
  }
}
