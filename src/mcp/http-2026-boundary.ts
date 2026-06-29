import { ErrorCode } from "@modelcontextprotocol/sdk/types.js"
import { Schema } from "effect"
import type { Request } from "express"

const MCP_2026_PROTOCOL_VERSION = "2026-07-28"

// JSON-RPC error codes specific to the MCP 2026-07-28 stateless transport. Standard
// JSON-RPC codes come from the SDK's ErrorCode enum (ErrorCode.InvalidRequest etc.).
// HEADER_MISMATCH (-32001) intentionally reuses the numeric value the SDK assigns to
// ErrorCode.RequestTimeout, but carries a distinct 2026 meaning (header/body/_meta
// mismatch), so it stays a named local rather than ErrorCode.RequestTimeout.
const HEADER_MISMATCH = -32001
const UNSUPPORTED_PROTOCOL_VERSION = -32004
const PROTOCOL_VERSION_META_KEY = "io.modelcontextprotocol/protocolVersion"
const CLIENT_INFO_META_KEY = "io.modelcontextprotocol/clientInfo"
const CLIENT_CAPABILITIES_META_KEY = "io.modelcontextprotocol/clientCapabilities"
const PARAMETER_SEPARATOR_NOT_FOUND = -1

interface JsonRpcRequest {
  readonly jsonrpc: "2.0"
  readonly id?: string | number | null
  readonly method: string
  readonly params?: unknown
}

export interface JsonRpcErrorObject {
  readonly code: number
  readonly message: string
  readonly data?: unknown
}

export interface JsonRpcErrorResponse {
  readonly jsonrpc: "2.0"
  readonly id: string | number | null
  readonly error: JsonRpcErrorObject
}

interface HeaderValidationBase {
  readonly request: JsonRpcRequest
  readonly id: string | number | null
}

const AnyRecordSchema = Schema.Record({ key: Schema.String, value: Schema.Unknown })
const JsonRpcRequestEnvelopeSchema = Schema.Struct({
  jsonrpc: Schema.optional(Schema.Unknown),
  id: Schema.optional(Schema.Unknown),
  method: Schema.optional(Schema.Unknown),
  params: Schema.optional(Schema.Unknown)
})
type JsonRpcRequestEnvelope = Schema.Schema.Type<typeof JsonRpcRequestEnvelopeSchema>

const Mcp2026RequestMetadataSchema = AnyRecordSchema.pipe(
  Schema.extend(
    Schema.Struct({
      [PROTOCOL_VERSION_META_KEY]: Schema.Literal(MCP_2026_PROTOCOL_VERSION),
      [CLIENT_INFO_META_KEY]: AnyRecordSchema,
      [CLIENT_CAPABILITIES_META_KEY]: AnyRecordSchema
    })
  )
)

const Mcp2026RequestParamsSchema = AnyRecordSchema.pipe(
  Schema.extend(
    Schema.Struct({
      _meta: Mcp2026RequestMetadataSchema
    })
  )
)
type Mcp2026RequestParams = Schema.Schema.Type<typeof Mcp2026RequestParamsSchema>

const NonEmptyProtocolStringSchema = Schema.String.pipe(Schema.nonEmptyString())
const ToolCallParamsSchema = Mcp2026RequestParamsSchema.pipe(
  Schema.extend(
    Schema.Struct({
      name: NonEmptyProtocolStringSchema
    })
  )
)
const ResourceReadParamsSchema = Mcp2026RequestParamsSchema.pipe(
  Schema.extend(
    Schema.Struct({
      uri: NonEmptyProtocolStringSchema
    })
  )
)
type ToolCallParams = Schema.Schema.Type<typeof ToolCallParamsSchema>
type ResourceReadParams = Schema.Schema.Type<typeof ResourceReadParamsSchema>

type HeaderValidation =
  | (HeaderValidationBase & {
    readonly kind: "other"
    readonly params: Mcp2026RequestParams
  })
  | (HeaderValidationBase & {
    readonly kind: "tools/call"
    readonly request: JsonRpcRequest & { readonly method: "tools/call" }
    readonly params: ToolCallParams
  })
  | (HeaderValidationBase & {
    readonly kind: "resources/read"
    readonly request: JsonRpcRequest & { readonly method: "resources/read" }
    readonly params: ResourceReadParams
  })

type Mcp2026RequestParamsParseResult =
  | { readonly _tag: "success"; readonly params: Mcp2026RequestParams }
  | { readonly _tag: "error"; readonly error: JsonRpcErrorObject }

const Mcp2026RequestParamsWithMetaSchema = AnyRecordSchema.pipe(
  Schema.extend(
    Schema.Struct({
      _meta: AnyRecordSchema
    })
  )
)
const Mcp2026ProtocolMetadataSchema = Schema.Struct({
  [PROTOCOL_VERSION_META_KEY]: Schema.Literal(MCP_2026_PROTOCOL_VERSION)
})
const Mcp2026ClientInfoMetadataSchema = Schema.Struct({
  [CLIENT_INFO_META_KEY]: AnyRecordSchema
})

const requestMethodSchema = Schema.Struct({ method: Schema.optional(Schema.Unknown) })

const lightweightMetaProtocolSchema = Schema.Struct({
  params: Schema.Struct({
    _meta: Schema.Struct({
      [PROTOCOL_VERSION_META_KEY]: Schema.String
    })
  })
})

const firstHeader = (value: string | ReadonlyArray<string> | undefined): string | undefined => {
  if (typeof value === "string") return value
  return value?.[0]
}

const parseJsonRpcRequestEnvelope = (body: object): JsonRpcRequestEnvelope =>
  Schema.decodeUnknownSync(JsonRpcRequestEnvelopeSchema)(body)

const parseMcp2026RequestParams = (params: unknown): Mcp2026RequestParamsParseResult => {
  const decoded = Schema.decodeUnknownEither(Mcp2026RequestParamsSchema)(params)
  if (decoded._tag === "Right") return { _tag: "success", params: decoded.right }

  const paramsWithMeta = Schema.decodeUnknownEither(Mcp2026RequestParamsWithMetaSchema)(params)
  if (paramsWithMeta._tag === "Left") {
    return { _tag: "error", error: { code: HEADER_MISMATCH, message: "Header mismatch: params._meta is required" } }
  }
  if (Schema.decodeUnknownEither(Mcp2026ProtocolMetadataSchema)(paramsWithMeta.right._meta)._tag === "Left") {
    return {
      _tag: "error",
      error: { code: HEADER_MISMATCH, message: "Header mismatch: params._meta protocol version must be 2026-07-28" }
    }
  }
  if (Schema.decodeUnknownEither(Mcp2026ClientInfoMetadataSchema)(paramsWithMeta.right._meta)._tag === "Left") {
    return {
      _tag: "error",
      error: { code: HEADER_MISMATCH, message: "Header mismatch: clientInfo metadata is required" }
    }
  }
  return {
    _tag: "error",
    error: { code: HEADER_MISMATCH, message: "Header mismatch: clientCapabilities metadata is required" }
  }
}

const parseRequestId = (id: unknown): string | number | null | undefined =>
  typeof id === "string" || typeof id === "number" || id === null ? id : undefined

const parseJsonRpcRequestId = (body: unknown): string | number | null => {
  if (Array.isArray(body) || body === null || typeof body !== "object") return null
  return parseRequestId(parseJsonRpcRequestEnvelope(body).id) ?? null
}

const metaProtocolVersion = (body: unknown): string | undefined => {
  try {
    return Schema.decodeUnknownSync(lightweightMetaProtocolSchema)(body)
      .params._meta[PROTOCOL_VERSION_META_KEY]
  } catch {
    return undefined
  }
}

const bodyMethod = (body: unknown): string | undefined => {
  if (Array.isArray(body) || body === null || body === undefined || typeof body !== "object") return undefined
  const requestMethod = Schema.decodeUnknownSync(requestMethodSchema)(body).method
  return typeof requestMethod === "string" ? requestMethod : undefined
}

// A request is handled by the 2026 stateless dispatcher when it carries a signal the
// legacy SDK Streamable HTTP transport never emits: the Mcp-Method routing header
// (mandatory in the 2026 transport), a 2026 protocol version inside params._meta, or
// the server/discover bootstrap call. We deliberately do NOT trigger on
// MCP-Protocol-Version alone because the SDK client sends that header with its own
// negotiated version, so routing on it would hijack legacy clients once the SDK
// advertises 2026-07-28. The header is still required once dispatched.
export const shouldDispatchMcp2026Request = (req: Request): boolean =>
  firstHeader(req.headers["mcp-method"]) !== undefined
  || metaProtocolVersion(req.body) === MCP_2026_PROTOCOL_VERSION
  || bodyMethod(req.body) === "server/discover"

const jsonRpcError = (
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown
): JsonRpcErrorResponse => {
  if (data === undefined) {
    return { jsonrpc: "2.0", id, error: { code, message } }
  }
  return { jsonrpc: "2.0", id, error: { code, message, data } }
}

const acceptsModernResponseTypes = (req: Request): boolean => {
  const accept = firstHeader(req.headers.accept)
  if (accept === undefined) return false
  const parts = accept.split(",").map((part) => {
    const parameterIndex = part.indexOf(";")
    const mediaType = parameterIndex === PARAMETER_SEPARATOR_NOT_FOUND ? part : part.slice(0, parameterIndex)
    return mediaType.trim().toLowerCase()
  })
  return parts.includes("application/json") && parts.includes("text/event-stream")
}

const parseJsonRpcRequest = (body: unknown): JsonRpcRequest | JsonRpcErrorObject => {
  if (Array.isArray(body)) {
    return { code: ErrorCode.InvalidRequest, message: "Batch JSON-RPC requests are not supported" }
  }
  if (body === null || typeof body !== "object") {
    return { code: ErrorCode.InvalidRequest, message: "Request body must be a single JSON-RPC object" }
  }

  const request = parseJsonRpcRequestEnvelope(body)
  if (request.jsonrpc !== "2.0") {
    return { code: ErrorCode.InvalidRequest, message: "Request body must include jsonrpc: \"2.0\"" }
  }
  if (typeof request.method !== "string" || request.method === "") {
    return { code: ErrorCode.InvalidRequest, message: "Request body must include a non-empty method" }
  }
  const requestId = parseRequestId(request.id)
  return {
    jsonrpc: "2.0",
    ...(requestId === undefined ? {} : { id: requestId }),
    method: request.method,
    params: request.params
  }
}

const requiredStringHeader = (req: Request, name: string): string | JsonRpcErrorObject => {
  const header = firstHeader(req.headers[name.toLowerCase()])
  if (header === undefined || header.trim() === "") {
    return { code: HEADER_MISMATCH, message: `Header mismatch: required ${name} header is missing` }
  }
  return header
}

export const parseHeaderValidatedRequest = (req: Request): HeaderValidation | JsonRpcErrorResponse => {
  const parsed = parseJsonRpcRequest(req.body)
  if ("code" in parsed) return jsonRpcError(parseJsonRpcRequestId(req.body), parsed.code, parsed.message, parsed.data)
  const requestId = parsed.id ?? null

  if (!acceptsModernResponseTypes(req)) {
    return jsonRpcError(
      requestId,
      HEADER_MISMATCH,
      "Header mismatch: Accept header must include application/json and text/event-stream"
    )
  }

  const protocolHeader = requiredStringHeader(req, "MCP-Protocol-Version")
  if (typeof protocolHeader !== "string") {
    return jsonRpcError(requestId, protocolHeader.code, protocolHeader.message, protocolHeader.data)
  }
  if (protocolHeader !== MCP_2026_PROTOCOL_VERSION) {
    return jsonRpcError(
      requestId,
      UNSUPPORTED_PROTOCOL_VERSION,
      "Unsupported protocol version",
      { supported: [MCP_2026_PROTOCOL_VERSION], requested: protocolHeader }
    )
  }

  const methodHeader = requiredStringHeader(req, "Mcp-Method")
  if (typeof methodHeader !== "string") {
    return jsonRpcError(requestId, methodHeader.code, methodHeader.message, methodHeader.data)
  }
  if (methodHeader !== parsed.method) {
    return jsonRpcError(
      requestId,
      HEADER_MISMATCH,
      `Header mismatch: Mcp-Method header value '${methodHeader}' does not match body value '${parsed.method}'`
    )
  }

  const params = parseMcp2026RequestParams(parsed.params)
  if (params._tag === "error") {
    return jsonRpcError(requestId, params.error.code, params.error.message, params.error.data)
  }

  const nameValidation = parseNamedRequest(req, parsed, params.params)
  if ("code" in nameValidation) {
    return jsonRpcError(requestId, nameValidation.code, nameValidation.message, nameValidation.data)
  }

  return { ...nameValidation, id: requestId }
}

const parseNamedRequest = (
  req: Request,
  request: JsonRpcRequest,
  params: Mcp2026RequestParams
): HeaderValidation | JsonRpcErrorObject => {
  const method = request.method
  if (method !== "tools/call" && method !== "resources/read") {
    return { kind: "other", request, params, id: request.id ?? null }
  }

  const nameHeader = requiredStringHeader(req, "Mcp-Name")
  if (typeof nameHeader !== "string") return nameHeader

  if (method === "tools/call") {
    const toolCallParams = Schema.decodeUnknownEither(ToolCallParamsSchema)(params)
    if (toolCallParams._tag === "Left") {
      return { code: ErrorCode.InvalidParams, message: "Invalid params: tools/call requires params.name" }
    }
    if (nameHeader !== toolCallParams.right.name) {
      return {
        code: HEADER_MISMATCH,
        message:
          `Header mismatch: Mcp-Name header value '${nameHeader}' does not match body value '${toolCallParams.right.name}'`
      }
    }
    return {
      kind: "tools/call",
      request: { ...request, method },
      params: toolCallParams.right,
      id: request.id ?? null
    }
  }

  const resourceReadParams = Schema.decodeUnknownEither(ResourceReadParamsSchema)(params)
  if (resourceReadParams._tag === "Left") {
    return { code: ErrorCode.InvalidParams, message: "Invalid params: resources/read requires params.uri" }
  }
  if (nameHeader !== resourceReadParams.right.uri) {
    return {
      code: HEADER_MISMATCH,
      message:
        `Header mismatch: Mcp-Name header value '${nameHeader}' does not match body value '${resourceReadParams.right.uri}'`
    }
  }
  return {
    kind: "resources/read",
    request: { ...request, method },
    params: resourceReadParams.right,
    id: request.id ?? null
  }
}
