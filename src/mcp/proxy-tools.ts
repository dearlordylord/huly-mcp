import { Effect, Result, Schema } from "effect"

import { Count } from "../domain/schemas/index.js"
import type { HulyStorageClient } from "../huly/storage.js"
import type { WorkspaceClientOperations } from "../huly/workspace-client.js"
import {
  createImageSuccessResponse,
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
import type { ToolAnnotations } from "./tools/tool-annotations.js"
import {
  createToolDefinition,
  executeRegisteredOperation,
  isEmptyArgumentsObject,
  isNoArgumentTool,
  makeToolCategory,
  requiresArgumentsObject,
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

const EmptyProxyParamsSchema = Schema.Record(Schema.String, Schema.Never)
const SearchToolsParamsSchema = Schema.Struct({ query: ToolSearchQuery, limit: Schema.optionalKey(SearchToolLimit) })
const ToolNameParamsSchema = Schema.Struct({ toolName: ToolName })
export const InvokeToolParamsSchema = Schema.Struct({
  toolName: ToolName,
  arguments: Schema.optionalKey(Schema.Unknown)
})

const ProxyToolCategorySchema = Schema.Struct({ name: ToolCategory, description: ToolDescription, toolCount: Count })
const ListToolCategoriesResultSchema = Schema.Struct({ categories: Schema.Array(ProxyToolCategorySchema) })
const ToolSearchMatchBaseSchema = Schema.Struct({
  name: ToolName,
  category: ToolCategory,
  description: ToolDescription,
  requiredParams: Schema.Array(ToolParameterName),
  optionalParams: Schema.Array(ToolParameterName)
})
const ToolSearchMatchSchema = Schema.Union([
  ToolSearchMatchBaseSchema.pipe(Schema.fieldsAssign({ parameterSummaryStatus: Schema.Literal("available") })),
  ToolSearchMatchBaseSchema.pipe(Schema.fieldsAssign({ parameterSummaryStatus: Schema.Literal("empty") })),
  ToolSearchMatchBaseSchema.pipe(
    Schema.fieldsAssign({
      parameterSummaryStatus: Schema.Literal("invalid_input_schema"),
      parameterSummaryIssue: Schema.String
    })
  )
])
const SearchToolsResultSchema = Schema.Struct({ matches: Schema.Array(ToolSearchMatchSchema) })
const ToolAnnotationsSchema = Schema.Struct({
  title: Schema.optionalKey(Schema.Trimmed.pipe(Schema.check(Schema.isNonEmpty()))),
  readOnlyHint: Schema.optionalKey(Schema.Boolean),
  destructiveHint: Schema.optionalKey(Schema.Boolean),
  idempotentHint: Schema.optionalKey(Schema.Boolean),
  openWorldHint: Schema.optionalKey(Schema.Boolean)
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
  warnings: Schema.optionalKey(Schema.Array(Schema.Unknown))
})

const emptyInputSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  properties: {},
  additionalProperties: false
} satisfies ToolDefinition["inputSchema"]

const searchToolsInputSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
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
  $schema: "http://json-schema.org/draft-07/schema#",
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
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  properties: {
    toolName: { type: "string", minLength: 1, description: "Exact Huly tool name to invoke through the proxy." },
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

type DecodeOrErrorResult<A> =
  | { readonly _tag: "success"; readonly params: A }
  | { readonly _tag: "error"; readonly response: McpToolResponse }

const decodeOrError = <A, I>(
  schema: Schema.Codec<A, I>,
  input: unknown,
  toolName: ToolName
): DecodeOrErrorResult<A> => {
  const decoded = Schema.decodeUnknownResult(schema)(input ?? {})
  if (Result.isSuccess(decoded)) return { _tag: "success", params: decoded.success }
  return { _tag: "error", response: mapParseErrorToMcp(decoded.failure, toolName) }
}

const searchTools = (registry: ToolRegistry, args: unknown): McpToolResponse => {
  const decoded = decodeOrError(SearchToolsParamsSchema, args, SEARCH_TOOLS_TOOL_NAME)
  if (decoded._tag === "error") return decoded.response
  const params = decoded.params
  const limit = params.limit ?? SEARCH_DEFAULT_LIMIT_VALUE
  const matches = searchToolDefinitions(registry, params.query, limit).map((tool) => {
    const paramSummary = toolParamSummary(tool)
    return {
      name: tool.name,
      category: tool.category,
      description: tool.description,
      requiredParams: paramSummary.requiredParams,
      optionalParams: paramSummary.optionalParams,
      parameterSummaryStatus: paramSummary.parameterSummaryStatus,
      ...(paramSummary.parameterSummaryIssue === undefined
        ? {}
        : { parameterSummaryIssue: paramSummary.parameterSummaryIssue })
    }
  })
  return createSuccessResponse({ matches })
}

const getToolSchema = (registry: ToolRegistry, args: unknown): McpToolResponse => {
  const decoded = decodeOrError(ToolNameParamsSchema, args, GET_TOOL_SCHEMA_TOOL_NAME)
  if (decoded._tag === "error") return decoded.response
  const params = decoded.params

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
  readonly storageClient: HulyStorageClient["Service"]
  readonly workspaceClient?: WorkspaceClientOperations
}

const DeferredToolArgumentsJsonSchema = Schema.fromJsonString(Schema.Unknown)

/**
 * Some deferred-tool clients serialize invoke_tool's schema-less arguments value.
 * Decode that transport shape once here, immediately before target dispatch. Invalid
 * JSON remains unchanged so the target schema reports the actual value it received.
 */
const normalizeDeferredToolArguments = (value: unknown): unknown => {
  if (typeof value !== "string") return value
  const decoded = Schema.decodeUnknownResult(DeferredToolArgumentsJsonSchema)(value)
  return Result.isSuccess(decoded) ? decoded.success : value
}

type SuccessfulToolCallResponse = Exclude<McpToolResponse, { readonly isError: true }>

const successfulInvokeResponse = (toolName: ToolName, response: SuccessfulToolCallResponse): McpToolResponse => {
  const warnings = response.structuredContent?.warnings ?? []
  const result = {
    toolName,
    result: response.structuredContent?.result ?? response.content,
    ...(warnings.length === 0 ? {} : { warnings })
  }
  return response.imageContent === undefined
    ? createSuccessResponse(result, warnings)
    : createImageSuccessResponse(result, response.imageContent, warnings)
}

const invokeTool = (
  registry: ToolRegistry,
  args: unknown,
  clients: InvokeToolClients
): Effect.Effect<McpToolResponse> => {
  const decoded = decodeOrError(InvokeToolParamsSchema, args, INVOKE_TOOL_TOOL_NAME)
  if (decoded._tag === "error") return Effect.succeed(decoded.response)
  const params = decoded.params

  const tool = registry.tools.get(params.toolName)
  if (tool === undefined) return Effect.succeed(createUnknownToolError(params.toolName))
  const normalizedArguments = normalizeDeferredToolArguments(params.arguments)
  if (isNoArgumentTool(tool) && !isEmptyArgumentsObject(normalizedArguments)) {
    return Effect.succeed(
      createInvalidParamsError(
        `Invalid parameters for ${params.toolName}: this tool does not accept arguments. Pass {} or omit arguments.`,
        "UnexpectedArguments"
      )
    )
  }
  if (normalizedArguments === undefined && requiresArgumentsObject(tool)) {
    return Effect.succeed(
      createInvalidParamsError(
        `Invalid parameters for ${params.toolName}: missing arguments object. Pass an arguments object; use {} when you want defaults for optional parameters.`,
        "MissingArguments"
      )
    )
  }
  return executeRegisteredOperation(
    tool.operation,
    normalizedArguments ?? {},
    clients.hulyClient,
    clients.storageClient,
    clients.workspaceClient
  ).pipe(
    Effect.map((response) =>
      response.isError === true ? response : successfulInvokeResponse(params.toolName, response)
    )
  )
}

interface ProxyToolCallInput {
  readonly toolName: ToolName
  readonly args: unknown
  readonly proxyCandidateRegistry: ToolRegistry
  readonly clients?: InvokeToolClients
}

const listProxyCategories = (registry: ToolRegistry, args: unknown): McpToolResponse => {
  const decoded = decodeOrError(EmptyProxyParamsSchema, args, LIST_TOOL_CATEGORIES_TOOL_NAME)
  return decoded._tag === "error" ? decoded.response : listCategories(registry)
}

const invokeProxyTool = (input: ProxyToolCallInput): Effect.Effect<McpToolResponse> => {
  if (input.clients === undefined) {
    return Effect.succeed(
      createInvalidParamsError("invoke_tool requires initialized Huly clients.", "ProxyClientsMissing")
    )
  }
  return invokeTool(input.proxyCandidateRegistry, input.args, input.clients)
}

export const handleProxyToolCallEffect = (input: ProxyToolCallInput): Effect.Effect<McpToolResponse> => {
  switch (input.toolName) {
    case LIST_TOOL_CATEGORIES_TOOL_NAME:
      return Effect.succeed(listProxyCategories(input.proxyCandidateRegistry, input.args))
    case SEARCH_TOOLS_TOOL_NAME:
      return Effect.succeed(searchTools(input.proxyCandidateRegistry, input.args))
    case GET_TOOL_SCHEMA_TOOL_NAME:
      return Effect.succeed(getToolSchema(input.proxyCandidateRegistry, input.args))
    case INVOKE_TOOL_TOOL_NAME:
      return invokeProxyTool(input)
    default:
      return Effect.succeed(createUnknownToolError(input.toolName))
  }
}

export const handleProxyToolCall = (input: ProxyToolCallInput): Promise<McpToolResponse> =>
  Effect.runPromise(handleProxyToolCallEffect(input))
