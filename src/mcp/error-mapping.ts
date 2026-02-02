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
import type { ParseResult } from "effect"
import { Cause, Chunk, Match } from "effect"

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

// --- Error Message Sanitization ---

/**
 * Patterns that indicate sensitive information that should not be leaked.
 * Uses regex for more precise matching (word boundaries where appropriate).
 */
const SENSITIVE_PATTERNS = [
  /password/i,
  /\btoken\b/i, // word boundary to avoid "tokenize" etc
  /secret/i, // matches client_secret, secret_key, etc
  /credential/i,
  /api[_-]?key/i,
  /\bauth\b/i, // word boundary to avoid "authentication" etc
  /\bbearer\b/i,
  /\bjwt\b/i,
  /session[_-]?id/i, // session_id or sessionid
  /cookie/i
] as const

/**
 * Check if a message contains potentially sensitive information.
 */
const containsSensitiveInfo = (message: string): boolean => {
  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(message))
}

/**
 * Sanitize error message to prevent leaking sensitive information.
 * Replaces messages with sensitive keywords with a generic message.
 */
const sanitizeMessage = (message: string): string => {
  if (containsSensitiveInfo(message)) {
    return "An error occurred while processing the request"
  }
  return message
}

// --- Internal Helper to Create Error Response ---

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
 * Uses pattern matching on tagged errors for type-safe handling.
 */
export const mapDomainErrorToMcp = (error: HulyDomainError): McpErrorResponseWithMeta => {
  return Match.value(error).pipe(
    Match.tag("IssueNotFoundError", (e) => createErrorResponse(e.message, McpErrorCode.InvalidParams)),
    Match.tag("ProjectNotFoundError", (e) => createErrorResponse(e.message, McpErrorCode.InvalidParams)),
    Match.tag("InvalidStatusError", (e) => createErrorResponse(e.message, McpErrorCode.InvalidParams)),
    Match.tag("PersonNotFoundError", (e) => createErrorResponse(e.message, McpErrorCode.InvalidParams)),
    Match.tag("HulyConnectionError", (e) =>
      createErrorResponse(
        sanitizeMessage(`Connection error: ${e.message}`),
        McpErrorCode.InternalError
      )),
    Match.tag("HulyAuthError", (e) =>
      createErrorResponse(
        sanitizeMessage(`Authentication error: ${e.message}`),
        McpErrorCode.InternalError
      )),
    Match.tag("HulyError", (e) => createErrorResponse(sanitizeMessage(e.message), McpErrorCode.InternalError)),
    Match.exhaustive
  )
}

// --- Parse Error Mapping ---

/**
 * Format a ParseError to a user-friendly message.
 * Extracts the most relevant information without exposing internal structure.
 */
const formatParseError = (error: ParseResult.ParseError): string => {
  const issue = error.issue

  // Handle ArrayFormatter-like output for clearer messages
  if ("_tag" in issue) {
    switch (issue._tag) {
      case "Missing":
        return "Required field is missing"
      case "Unexpected":
        return "Unexpected field provided"
      case "Type":
        return `Invalid type: expected ${String(issue.ast)}`
      case "Forbidden":
        return "Field is forbidden"
      default:
        // For complex issues, provide a general message
        return "Invalid parameters provided"
    }
  }

  return "Invalid parameters provided"
}

/**
 * Map a ParseError to an MCP error response.
 */
export const mapParseErrorToMcp = (
  error: ParseResult.ParseError,
  toolName?: string
): McpErrorResponseWithMeta => {
  const prefix = toolName ? `Invalid parameters for ${toolName}: ` : "Invalid parameters: "
  const message = formatParseError(error)

  return createErrorResponse(`${prefix}${message}`, McpErrorCode.InvalidParams)
}

// --- Cause Mapping ---

/**
 * Internal helper to handle Die/Interrupt causes.
 */
const mapDefectCause = <E>(cause: Cause.Cause<E>): McpErrorResponseWithMeta | null => {
  if (Cause.isDieType(cause)) {
    return createErrorResponse("Internal server error", McpErrorCode.InternalError)
  }
  if (Cause.isInterruptType(cause)) {
    return createErrorResponse("Operation was interrupted", McpErrorCode.InternalError)
  }
  return null
}

/**
 * Map a ParseError Cause to an MCP error response.
 */
export const mapParseCauseToMcp = (
  cause: Cause.Cause<ParseResult.ParseError>,
  toolName?: string
): McpErrorResponseWithMeta => {
  const defectResponse = mapDefectCause(cause)
  if (defectResponse) return defectResponse

  if (Cause.isFailType(cause)) {
    return mapParseErrorToMcp(cause.error, toolName)
  }

  // Composite causes - extract first failure
  const failures = Chunk.toArray(Cause.failures(cause))
  if (failures.length > 0) {
    return mapParseErrorToMcp(failures[0], toolName)
  }

  return createErrorResponse("An unexpected error occurred", McpErrorCode.InternalError)
}

/**
 * Map a HulyDomainError Cause to an MCP error response.
 */
export const mapDomainCauseToMcp = (
  cause: Cause.Cause<HulyDomainError>
): McpErrorResponseWithMeta => {
  const defectResponse = mapDefectCause(cause)
  if (defectResponse) return defectResponse

  if (Cause.isFailType(cause)) {
    return mapDomainErrorToMcp(cause.error)
  }

  // Composite causes - extract first failure
  const failures = Chunk.toArray(Cause.failures(cause))
  if (failures.length > 0) {
    return mapDomainErrorToMcp(failures[0])
  }

  return createErrorResponse("An unexpected error occurred", McpErrorCode.InternalError)
}

// --- Success Response Builder ---

/**
 * Create an MCP success response from a result value.
 */
export const createSuccessResponse = <T>(result: T): McpToolResponse => ({
  content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }]
})

// --- Unknown Tool Error ---

/**
 * Create an MCP error response for an unknown tool.
 */
export const createUnknownToolError = (toolName: string): McpErrorResponseWithMeta =>
  createErrorResponse(`Unknown tool: ${toolName}`, McpErrorCode.InvalidParams)

// --- Convert to MCP SDK format ---

/**
 * Strip internal metadata for MCP SDK compatibility.
 * Converts internal response to MCP-compatible format.
 */
export const toMcpResponse = (response: McpErrorResponseWithMeta | McpToolResponse): McpToolResponse => {
  const result: McpToolResponse = { content: response.content }
  if (response.isError !== undefined) {
    result.isError = response.isError
  }
  return result
}
