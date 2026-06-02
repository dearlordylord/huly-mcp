import { McpError } from "@modelcontextprotocol/sdk/types.js"
import type { Request, Response } from "express"

import type { McpProtocolHandlers } from "./protocol-handlers.js"

const MCP_2026_PROTOCOL_VERSION = "2026-07-28"

const HEADER_MISMATCH = -32001
const UNSUPPORTED_PROTOCOL_VERSION = -32004
const INVALID_REQUEST = -32600
const METHOD_NOT_FOUND = -32601
const INVALID_PARAMS = -32602
const INTERNAL_ERROR = -32603
const RESOURCE_NOT_FOUND = -32002

const HTTP_BAD_REQUEST = 400
const HTTP_NOT_FOUND = 404
const HTTP_OK = 200
const PUBLIC_LIST_TTL_MS = 300_000
const PRIVATE_RESOURCE_TTL_MS = 60_000

type CacheScope = "public" | "private"

interface JsonRpcRequest {
  readonly jsonrpc: "2.0"
  readonly id?: string | number | null
  readonly method: string
  readonly params?: unknown
}

interface JsonRpcErrorObject {
  readonly code: number
  readonly message: string
  readonly data?: unknown
}

interface JsonRpcErrorResponse {
  readonly jsonrpc: "2.0"
  readonly id: string | number | null
  readonly error: JsonRpcErrorObject
}

interface JsonRpcSuccessResponse {
  readonly jsonrpc: "2.0"
  readonly id: string | number | null
  readonly result: unknown
}

interface HeaderValidation {
  readonly request: JsonRpcRequest
  readonly params: Record<string, unknown>
  readonly id: string | number | null
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const firstHeader = (value: string | ReadonlyArray<string> | undefined): string | undefined => {
  if (typeof value === "string") return value
  return value?.[0]
}

const requestId = (body: unknown): string | number | null => {
  if (!isRecord(body)) return null
  const id = body.id
  return typeof id === "string" || typeof id === "number" || id === null ? id : null
}

const metaProtocolVersion = (body: unknown): string | undefined => {
  if (!isRecord(body) || !isRecord(body.params) || !isRecord(body.params._meta)) return undefined
  const version = body.params._meta["io.modelcontextprotocol/protocolVersion"]
  return typeof version === "string" ? version : undefined
}

const bodyMethod = (body: unknown): string | undefined => {
  if (!isRecord(body)) return undefined
  return typeof body.method === "string" ? body.method : undefined
}

export const shouldDispatchMcp2026Request = (req: Request): boolean =>
  firstHeader(req.headers["mcp-protocol-version"]) === MCP_2026_PROTOCOL_VERSION
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

const writeError = (
  res: Response,
  status: number,
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown
): void => {
  res.status(status).json(jsonRpcError(id, code, message, data))
}

const writeSuccess = (res: Response, id: string | number | null, result: unknown): void => {
  const body: JsonRpcSuccessResponse = { jsonrpc: "2.0", id, result }
  res.status(HTTP_OK).json(body)
}

const acceptsModernResponseTypes = (req: Request): boolean => {
  const accept = firstHeader(req.headers.accept)
  if (accept === undefined) return false
  const parts = accept.split(",").map(part => part.trim().toLowerCase().split(";")[0])
  return parts.includes("application/json") && parts.includes("text/event-stream")
}

const validateJsonRpcRequest = (body: unknown): JsonRpcRequest | JsonRpcErrorObject => {
  if (Array.isArray(body)) {
    return { code: INVALID_REQUEST, message: "Batch JSON-RPC requests are not supported" }
  }
  if (!isRecord(body)) {
    return { code: INVALID_REQUEST, message: "Request body must be a single JSON-RPC object" }
  }
  if (body.jsonrpc !== "2.0") {
    return { code: INVALID_REQUEST, message: "Request body must include jsonrpc: \"2.0\"" }
  }
  if (typeof body.method !== "string" || body.method === "") {
    return { code: INVALID_REQUEST, message: "Request body must include a non-empty method" }
  }
  return {
    jsonrpc: "2.0",
    id: requestId(body),
    method: body.method,
    params: body.params
  }
}

const requiredStringHeader = (req: Request, name: string): string | JsonRpcErrorObject => {
  const header = firstHeader(req.headers[name.toLowerCase()])
  if (header === undefined || header.trim() === "") {
    return { code: HEADER_MISMATCH, message: `Header mismatch: required ${name} header is missing` }
  }
  return header
}

const validateMeta = (params: Record<string, unknown>): JsonRpcErrorObject | undefined => {
  if (!isRecord(params._meta)) {
    return { code: HEADER_MISMATCH, message: "Header mismatch: params._meta is required" }
  }
  if (params._meta["io.modelcontextprotocol/protocolVersion"] !== MCP_2026_PROTOCOL_VERSION) {
    return {
      code: HEADER_MISMATCH,
      message: "Header mismatch: params._meta protocol version must be 2026-07-28"
    }
  }
  if (!isRecord(params._meta["io.modelcontextprotocol/clientInfo"])) {
    return { code: HEADER_MISMATCH, message: "Header mismatch: clientInfo metadata is required" }
  }
  if (!isRecord(params._meta["io.modelcontextprotocol/clientCapabilities"])) {
    return { code: HEADER_MISMATCH, message: "Header mismatch: clientCapabilities metadata is required" }
  }
  return undefined
}

const validateHeadersAndMeta = (req: Request): HeaderValidation | JsonRpcErrorResponse => {
  const id = requestId(req.body)
  const parsed = validateJsonRpcRequest(req.body)
  if ("code" in parsed) return jsonRpcError(id, parsed.code, parsed.message, parsed.data)

  if (!acceptsModernResponseTypes(req)) {
    return jsonRpcError(
      parsed.id ?? null,
      HEADER_MISMATCH,
      "Header mismatch: Accept header must include application/json and text/event-stream"
    )
  }

  const protocolHeader = requiredStringHeader(req, "MCP-Protocol-Version")
  if (typeof protocolHeader !== "string") {
    return jsonRpcError(parsed.id ?? null, protocolHeader.code, protocolHeader.message, protocolHeader.data)
  }
  if (protocolHeader !== MCP_2026_PROTOCOL_VERSION) {
    return jsonRpcError(
      parsed.id ?? null,
      UNSUPPORTED_PROTOCOL_VERSION,
      "Unsupported protocol version",
      { supported: [MCP_2026_PROTOCOL_VERSION], requested: protocolHeader }
    )
  }

  const methodHeader = requiredStringHeader(req, "Mcp-Method")
  if (typeof methodHeader !== "string") {
    return jsonRpcError(parsed.id ?? null, methodHeader.code, methodHeader.message, methodHeader.data)
  }
  if (methodHeader !== parsed.method) {
    return jsonRpcError(
      parsed.id ?? null,
      HEADER_MISMATCH,
      `Header mismatch: Mcp-Method header value '${methodHeader}' does not match body value '${parsed.method}'`
    )
  }

  const params = isRecord(parsed.params) ? parsed.params : {}
  const metaError = validateMeta(params)
  if (metaError !== undefined) {
    return jsonRpcError(parsed.id ?? null, metaError.code, metaError.message, metaError.data)
  }

  const nameValidation = validateNameHeader(req, parsed.method, params)
  if (nameValidation !== undefined) {
    return jsonRpcError(parsed.id ?? null, nameValidation.code, nameValidation.message, nameValidation.data)
  }

  return { request: parsed, params, id: parsed.id ?? null }
}

const validateNameHeader = (
  req: Request,
  method: string,
  params: Record<string, unknown>
): JsonRpcErrorObject | undefined => {
  if (method !== "tools/call" && method !== "resources/read") return undefined

  const nameHeader = requiredStringHeader(req, "Mcp-Name")
  if (typeof nameHeader !== "string") return nameHeader

  const bodyName = method === "tools/call" ? params.name : params.uri
  if (typeof bodyName !== "string" || bodyName === "") {
    return {
      code: INVALID_PARAMS,
      message: method === "tools/call"
        ? "Invalid params: tools/call requires params.name"
        : "Invalid params: resources/read requires params.uri"
    }
  }
  if (nameHeader !== bodyName) {
    return {
      code: HEADER_MISMATCH,
      message: `Header mismatch: Mcp-Name header value '${nameHeader}' does not match body value '${bodyName}'`
    }
  }
  return undefined
}

const complete = <T extends object>(result: T): T & { readonly resultType: "complete" } => ({
  ...result,
  resultType: "complete"
})

const cacheable = (
  result: object,
  ttlMs: number,
  cacheScope: CacheScope
): object => ({
  ...complete(result),
  ttlMs,
  cacheScope
})

const toModernMcpError = (error: McpError): JsonRpcErrorObject => {
  if (error.code === RESOURCE_NOT_FOUND) {
    return { code: INVALID_PARAMS, message: "Resource not found", data: error.data }
  }
  return {
    code: error.code,
    message: error.message,
    data: error.data
  }
}

const thrownToJsonRpcError = (error: unknown): JsonRpcErrorObject => {
  if (error instanceof McpError) return toModernMcpError(error)
  return { code: INTERNAL_ERROR, message: `Internal server error: ${String(error)}` }
}

export const dispatchMcp2026Request = async (
  req: Request,
  res: Response,
  handlers: McpProtocolHandlers
): Promise<void> => {
  res.setHeader("Content-Type", "application/json")

  const validation = validateHeadersAndMeta(req)
  if ("error" in validation) {
    const status = validation.error.code === METHOD_NOT_FOUND ? HTTP_NOT_FOUND : HTTP_BAD_REQUEST
    res.status(status).json(validation)
    return
  }

  try {
    switch (validation.request.method) {
      case "server/discover":
        writeSuccess(res, validation.id, handlers.serverDiscover())
        return

      case "tools/list":
        writeSuccess(res, validation.id, cacheable(await handlers.listTools(), PUBLIC_LIST_TTL_MS, "public"))
        return

      case "tools/call":
        if (typeof validation.params.name !== "string") {
          writeError(
            res,
            HTTP_BAD_REQUEST,
            validation.id,
            INVALID_PARAMS,
            "Invalid params: tools/call requires params.name"
          )
          return
        }
        writeSuccess(
          res,
          validation.id,
          complete(
            await handlers.callTool({
              params: {
                name: validation.params.name,
                arguments: validation.params.arguments
              }
            })
          )
        )
        return

      case "resources/list":
        writeSuccess(res, validation.id, cacheable(await handlers.listResources(), PRIVATE_RESOURCE_TTL_MS, "private"))
        return

      case "resources/templates/list":
        writeSuccess(res, validation.id, cacheable(handlers.listResourceTemplates(), PUBLIC_LIST_TTL_MS, "public"))
        return

      case "resources/read":
        if (typeof validation.params.uri !== "string") {
          writeError(
            res,
            HTTP_BAD_REQUEST,
            validation.id,
            INVALID_PARAMS,
            "Invalid params: resources/read requires params.uri"
          )
          return
        }
        writeSuccess(
          res,
          validation.id,
          cacheable(
            await handlers.readResource({ params: { uri: validation.params.uri } }),
            PRIVATE_RESOURCE_TTL_MS,
            "private"
          )
        )
        return

      default:
        writeError(res, HTTP_NOT_FOUND, validation.id, METHOD_NOT_FOUND, "Method not found")
    }
  } catch (error) {
    const mapped = thrownToJsonRpcError(error)
    writeError(
      res,
      mapped.code === METHOD_NOT_FOUND ? HTTP_NOT_FOUND : HTTP_BAD_REQUEST,
      validation.id,
      mapped.code,
      mapped.message,
      mapped.data
    )
  }
}
