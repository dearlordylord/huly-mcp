import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js"
import type { Request, Response } from "express"

import { McpErrorCode } from "./error-mapping.js"
import {
  type JsonRpcErrorObject,
  type JsonRpcErrorResponse,
  parseHeaderValidatedRequest
} from "./http-2026-boundary.js"
import type { McpProtocolHandlers } from "./protocol-handlers.js"

export { shouldDispatchMcp2026Request } from "./http-2026-boundary.js"

const HTTP_BAD_REQUEST = 400
const HTTP_NOT_FOUND = 404
const HTTP_INTERNAL_SERVER_ERROR = 500
const HTTP_OK = 200
const PUBLIC_LIST_TTL_MS = 300_000
const PRIVATE_RESOURCE_TTL_MS = 60_000

type CacheScope = "public" | "private"

interface JsonRpcSuccessResponse {
  readonly jsonrpc: "2.0"
  readonly id: string | number | null
  readonly result: unknown
}

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

// Internal failures (ErrorCode.InternalError, -32603) are the server's fault, so they map
// to 500 — matching the SDK transport path. Unknown methods map to 404; all other
// protocol/validation errors are client errors and map to 400.
const httpStatusForErrorCode = (code: number): number => {
  if (code === ErrorCode.MethodNotFound) return HTTP_NOT_FOUND
  if (code === ErrorCode.InternalError) return HTTP_INTERNAL_SERVER_ERROR
  return HTTP_BAD_REQUEST
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
  if (error.code === McpErrorCode.ResourceNotFound) {
    return { code: ErrorCode.InvalidParams, message: "Resource not found", data: error.data }
  }
  return {
    code: error.code,
    message: error.message,
    data: error.data
  }
}

const thrownToJsonRpcError = (error: unknown): JsonRpcErrorObject => {
  if (error instanceof McpError) return toModernMcpError(error)
  return { code: ErrorCode.InternalError, message: `Internal server error: ${String(error)}` }
}

export const dispatchMcp2026Request = async (
  req: Request,
  res: Response,
  handlers: McpProtocolHandlers
): Promise<void> => {
  res.setHeader("Content-Type", "application/json")

  const validation = parseHeaderValidatedRequest(req)
  if ("error" in validation) {
    res.status(httpStatusForErrorCode(validation.error.code)).json(validation)
    return
  }

  try {
    switch (validation.kind) {
      case "tools/call":
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

      case "resources/read":
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

      case "other":
        break
    }

    switch (validation.request.method) {
      case "server/discover":
        writeSuccess(res, validation.id, handlers.serverDiscover())
        return

      case "tools/list":
        writeSuccess(res, validation.id, cacheable(await handlers.listTools(), PUBLIC_LIST_TTL_MS, "public"))
        return

      case "resources/list":
        writeSuccess(res, validation.id, cacheable(await handlers.listResources(), PRIVATE_RESOURCE_TTL_MS, "private"))
        return

      case "resources/templates/list":
        writeSuccess(res, validation.id, cacheable(handlers.listResourceTemplates(), PUBLIC_LIST_TTL_MS, "public"))
        return

      default:
        writeError(res, HTTP_NOT_FOUND, validation.id, ErrorCode.MethodNotFound, "Method not found")
    }
  } catch (error) {
    const mapped = thrownToJsonRpcError(error)
    writeError(res, httpStatusForErrorCode(mapped.code), validation.id, mapped.code, mapped.message, mapped.data)
  }
}
