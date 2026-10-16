import { Result, Schema } from "effect"

const StartupDiagnosticErrorSchema = Schema.Union([
  Schema.Struct({
    code: Schema.Literal("UNSUPPORTED_NODE_RUNTIME"),
    detectedNodeVersion: Schema.NonEmptyString,
    executable: Schema.NonEmptyString,
    requiredNodeVersion: Schema.NonEmptyString
  }),
  Schema.Struct({ code: Schema.Literal("PROFILE_CREDENTIALS_UNAVAILABLE"), message: Schema.NonEmptyString })
])
export const StartupDiagnosticConfigSchema = Schema.Struct({
  serverVersion: Schema.NonEmptyString,
  message: Schema.NonEmptyString,
  error: StartupDiagnosticErrorSchema
})
export type StartupDiagnosticConfig = Schema.Schema.Type<typeof StartupDiagnosticConfigSchema>

const parseErrorCode = -32700
const invalidRequestCode = -32600
const methodNotFoundCode = -32601
const invalidParamsCode = -32602
const diagnosticToolName = "get_huly_startup_diagnostic"

const JsonRpcIdSchema = Schema.Union([Schema.String, Schema.Number])
const JsonRpcErrorCodeSchema = Schema.Literals([
  parseErrorCode,
  invalidParamsCode,
  methodNotFoundCode,
  invalidRequestCode
])
const JsonRpcRequestSchema = Schema.Struct({
  jsonrpc: Schema.Literal("2.0"),
  id: Schema.optionalKey(JsonRpcIdSchema),
  method: Schema.String,
  params: Schema.optionalKey(Schema.Unknown)
})
const InitializeParamsSchema = Schema.Struct({ protocolVersion: Schema.NonEmptyString })
const ToolCallParamsSchema = Schema.Struct({ name: Schema.String })
const EmptyObjectSchema = Schema.Struct({}).check(Schema.isMaxProperties(0))
const DiagnosticToolSchema = Schema.Struct({
  name: Schema.Literal(diagnosticToolName),
  description: Schema.NonEmptyString,
  inputSchema: Schema.Struct({
    additionalProperties: Schema.Literal(false),
    properties: EmptyObjectSchema,
    type: Schema.Literal("object")
  }),
  annotations: Schema.Struct({
    destructiveHint: Schema.Literal(false),
    idempotentHint: Schema.Literal(true),
    openWorldHint: Schema.Literal(false),
    readOnlyHint: Schema.Literal(true)
  })
})
const InitializeResultSchema = Schema.Struct({
  resultType: Schema.Literal("complete"),
  capabilities: Schema.Struct({ tools: Schema.Struct({ listChanged: Schema.Literal(false) }) }),
  instructions: Schema.NonEmptyString,
  protocolVersion: Schema.NonEmptyString,
  serverInfo: Schema.Struct({ name: Schema.Literal("huly-mcp"), version: Schema.NonEmptyString })
})
const PingResultSchema = Schema.Struct({ resultType: Schema.Literal("complete") }).check(Schema.isMaxProperties(1))
const cacheFields = {
  resultType: Schema.Literal("complete"),
  ttlMs: Schema.Literal(0),
  cacheScope: Schema.Literal("private")
}
const ToolsListResultSchema = Schema.Struct({ ...cacheFields, tools: Schema.Tuple([DiagnosticToolSchema]) })
const DiscoverResultSchema = Schema.Struct({
  ...cacheFields,
  supportedVersions: Schema.Tuple([Schema.Literal("2026-07-28")]),
  capabilities: Schema.Struct({ tools: Schema.Struct({ listChanged: Schema.Literal(false) }) }),
  instructions: Schema.NonEmptyString
})
const DiagnosticToolResultSchema = Schema.Struct({
  ...cacheFields,
  content: Schema.Tuple([Schema.Struct({ text: Schema.NonEmptyString, type: Schema.Literal("text") })]),
  isError: Schema.Literal(true),
  structuredContent: Schema.Struct({ error: StartupDiagnosticErrorSchema })
})
const JsonRpcResultSchema = Schema.Union([
  DiscoverResultSchema,
  InitializeResultSchema,
  PingResultSchema,
  ToolsListResultSchema,
  DiagnosticToolResultSchema
])
const JsonRpcSuccessSchema = Schema.Struct({
  jsonrpc: Schema.Literal("2.0"),
  id: JsonRpcIdSchema,
  result: JsonRpcResultSchema
})
const JsonRpcErrorSchema = Schema.Struct({
  jsonrpc: Schema.Literal("2.0"),
  id: Schema.Union([JsonRpcIdSchema, Schema.Null]),
  error: Schema.Struct({ code: JsonRpcErrorCodeSchema, message: Schema.String })
})
const JsonRpcResponseSchema = Schema.Union([JsonRpcSuccessSchema, JsonRpcErrorSchema])

type JsonRpcId = Schema.Schema.Type<typeof JsonRpcIdSchema>
type JsonRpcErrorCode = Schema.Schema.Type<typeof JsonRpcErrorCodeSchema>
type JsonRpcRequest = Schema.Schema.Type<typeof JsonRpcRequestSchema>
type JsonRpcResponse = Schema.Schema.Type<typeof JsonRpcResponseSchema>
type JsonRpcResult = Schema.Schema.Type<typeof JsonRpcResultSchema>

const parseRequest = Schema.decodeUnknownResult(Schema.fromJsonString(JsonRpcRequestSchema))
const parseInitializeParams = Schema.decodeUnknownResult(InitializeParamsSchema)
const parseToolCallParams = Schema.decodeUnknownResult(ToolCallParamsSchema)
const encodeResponse = Schema.encodeSync(Schema.fromJsonString(JsonRpcResponseSchema))

const success = (id: JsonRpcId, result: JsonRpcResult): JsonRpcResponse => ({ id, jsonrpc: "2.0", result })

const successWhenRequested = (id: JsonRpcId | undefined, result: JsonRpcResult): JsonRpcResponse | undefined =>
  id === undefined ? undefined : success(id, result)

const error = (id: JsonRpcId | null, code: JsonRpcErrorCode, message: string): JsonRpcResponse => ({
  error: { code, message },
  id,
  jsonrpc: "2.0"
})

const diagnosticTool = (diagnostic: string): Schema.Schema.Type<typeof DiagnosticToolSchema> => ({
  name: diagnosticToolName,
  description: diagnostic,
  inputSchema: { additionalProperties: false, properties: {}, type: "object" },
  annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: false, readOnlyHint: true }
})

const diagnosticToolResult = (config: StartupDiagnosticConfig, diagnostic: string): JsonRpcResult => ({
  resultType: "complete",
  ttlMs: 0,
  cacheScope: "private",
  content: [{ text: diagnostic, type: "text" }],
  isError: true,
  structuredContent: { error: config.error }
})

const initializeResponse = (
  request: JsonRpcRequest,
  config: StartupDiagnosticConfig,
  diagnostic: string
): JsonRpcResponse => {
  const params = parseInitializeParams(request.params)
  const requestId = request.id
  if (requestId === undefined || Result.isFailure(params))
    return error(requestId ?? null, invalidRequestCode, diagnostic)
  return success(requestId, {
    resultType: "complete",
    capabilities: { tools: { listChanged: false } },
    instructions: diagnostic,
    protocolVersion: params.success.protocolVersion,
    serverInfo: { name: "huly-mcp", version: config.serverVersion }
  })
}

const toolCallResponse = (
  request: JsonRpcRequest,
  config: StartupDiagnosticConfig,
  diagnostic: string
): JsonRpcResponse => {
  const params = parseToolCallParams(request.params)
  const requestId = request.id
  if (requestId === undefined || Result.isFailure(params))
    return error(requestId ?? null, invalidRequestCode, diagnostic)
  return params.success.name === diagnosticToolName
    ? success(requestId, diagnosticToolResult(config, diagnostic))
    : error(requestId, invalidParamsCode, diagnostic)
}

const responseForRequest = (
  request: JsonRpcRequest,
  config: StartupDiagnosticConfig,
  diagnostic: string
): JsonRpcResponse | undefined => {
  switch (request.method) {
    case "server/discover":
      return successWhenRequested(request.id, {
        resultType: "complete",
        ttlMs: 0,
        cacheScope: "private",
        supportedVersions: ["2026-07-28"],
        capabilities: { tools: { listChanged: false } },
        instructions: diagnostic
      })
    case "initialize":
      return initializeResponse(request, config, diagnostic)
    case "notifications/initialized":
      return undefined
    case "ping":
      return successWhenRequested(request.id, { resultType: "complete" })
    case "tools/list":
      return successWhenRequested(request.id, {
        resultType: "complete",
        ttlMs: 0,
        cacheScope: "private",
        tools: [diagnosticTool(diagnostic)]
      })
    case "tools/call":
      return toolCallResponse(request, config, diagnostic)
    default:
      return request.id === undefined ? undefined : error(request.id, methodNotFoundCode, diagnostic)
  }
}

export const handleStartupDiagnosticRequest = (line: string, config: StartupDiagnosticConfig): string | undefined => {
  const diagnostic = config.message
  const decoded = parseRequest(line)
  const response = Result.isFailure(decoded)
    ? error(null, parseErrorCode, diagnostic)
    : responseForRequest(decoded.success, config, diagnostic)
  return response === undefined ? undefined : encodeResponse(response)
}
