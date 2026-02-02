/**
 * Error mapping from Effect errors to MCP protocol error responses.
 *
 * Maps domain errors to appropriate MCP error codes:
 * - -32602 (Invalid params): ParseError, IssueNotFoundError, ProjectNotFoundError, etc.
 * - -32603 (Internal error): HulyConnectionError, HulyAuthError, unknown errors
 *
 * Security: Sanitizes error messages to prevent leaking sensitive information.
 *
 * @module
 */
import { absurd, Cause, Chunk, Match, ParseResult } from "effect"

import type { Die, Interrupt } from "effect/Cause"
import { type HulyDomainError, McpErrorCode } from "../huly/errors.js"

// --- MCP Error Response Types ---

/**
 * MCP protocol tool response structure.
 * Compatible with MCP SDK CallToolResult.
 * Uses index signature to match SDK's loose typing.
 */
export interface McpToolResponse {
  content: Array<{ type: "text"; text: string }>
  isError?: boolean
  [key: string]: unknown
}

/**
 * Internal metadata for error tracking (not exposed to MCP).
 */
export interface ErrorMetadata {
  errorCode: McpErrorCode
}

/**
 * Internal error response with metadata for testing.
 */
export interface McpErrorResponseWithMeta extends McpToolResponse {
  isError: true
  _meta: ErrorMetadata
}

const createErrorResponse = (
  text: string,
  errorCode: McpErrorCode
): McpErrorResponseWithMeta => ({
  content: [{ type: "text" as const, text }],
  isError: true,
  _meta: { errorCode }
})

// --- Domain Error Mapping ---

/**
 * Map a HulyDomainError to an MCP error response.
 */
export const mapDomainErrorToMcp = (error: HulyDomainError): McpErrorResponseWithMeta => {
  return Match.value(error).pipe(
    Match.tag("IssueNotFoundError", (e) => createErrorResponse(e.message, McpErrorCode.InvalidParams)),
    Match.tag("ProjectNotFoundError", (e) => createErrorResponse(e.message, McpErrorCode.InvalidParams)),
    Match.tag("InvalidStatusError", (e) => createErrorResponse(e.message, McpErrorCode.InvalidParams)),
    Match.tag("PersonNotFoundError", (e) => createErrorResponse(e.message, McpErrorCode.InvalidParams)),
    Match.tag("HulyConnectionError", (e) =>
      createErrorResponse(
        `Connection error: ${e.message}`,
        McpErrorCode.InternalError
      )),
    Match.tag("HulyAuthError", (e) =>
      createErrorResponse(
        `Authentication error: ${e.message}`,
        McpErrorCode.InternalError
      )),
    Match.tag("HulyError", (e) => createErrorResponse(e.message, McpErrorCode.InternalError)),
    Match.exhaustive
  )
}

// --- Parse Error Mapping ---

const formatParseError = (error: ParseResult.ParseError): string => {
  const issues = ParseResult.ArrayFormatter.formatErrorSync(error)
  return issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ")
}

export const mapParseErrorToMcp = (
  error: ParseResult.ParseError,
  toolName?: string
): McpErrorResponseWithMeta => {
  const prefix = toolName ? `Invalid parameters for ${toolName}: ` : "Invalid parameters: "
  const message = formatParseError(error)

  return createErrorResponse(`${prefix}${message}`, McpErrorCode.InvalidParams)
}

export const mapDefectCause = (cause: Die | Interrupt): McpErrorResponseWithMeta => {
  if (Cause.isDieType(cause)) {
    return createErrorResponse("Internal server error", McpErrorCode.InternalError)
  }
  if (Cause.isInterruptType(cause)) {
    return createErrorResponse("Operation was interrupted", McpErrorCode.InternalError)
  }
  absurd(cause)
  throw new Error("Unexpected cause type")
}

export const mapParseCauseToMcp = (
  cause: Cause.Cause<ParseResult.ParseError>,
  toolName?: string
): McpErrorResponseWithMeta => {
  if (Cause.isFailType(cause)) {
    return mapParseErrorToMcp(cause.error, toolName)
  }

  const failures = Chunk.toArray(Cause.failures(cause))
  if (failures.length > 0) {
    return mapParseErrorToMcp(failures[0], toolName)
  }

  return createErrorResponse("An unexpected error occurred", McpErrorCode.InternalError)
}

export const mapDomainCauseToMcp = (
  cause: Cause.Cause<HulyDomainError>
): McpErrorResponseWithMeta => {
  if (Cause.isFailType(cause)) {
    return mapDomainErrorToMcp(cause.error)
  }

  const failures = Chunk.toArray(Cause.failures(cause))
  if (failures.length > 0) {
    return mapDomainErrorToMcp(failures[0])
  }

  return createErrorResponse("An unexpected error occurred", McpErrorCode.InternalError)
}

export const createSuccessResponse = <T>(result: T): McpToolResponse => ({
  content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }]
})

export const createUnknownToolError = (toolName: string): McpErrorResponseWithMeta =>
  createErrorResponse(`Unknown tool: ${toolName}`, McpErrorCode.InvalidParams)

export const toMcpResponse = (response: McpErrorResponseWithMeta | McpToolResponse): McpToolResponse => {
  const result: McpToolResponse = { content: response.content }
  if (response.isError !== undefined) {
    result.isError = response.isError
  }
  return result
}
