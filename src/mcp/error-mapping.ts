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
 * Check if an error is a HulyDomainError.
 */
const isHulyDomainError = (error: unknown): error is HulyDomainError => {
  if (!error || typeof error !== "object") return false
  if (!("_tag" in error)) return false

  const tag = (error as { _tag: string })._tag
  return [
    "HulyError",
    "HulyConnectionError",
    "HulyAuthError",
    "IssueNotFoundError",
    "ProjectNotFoundError",
    "InvalidStatusError",
    "PersonNotFoundError"
  ].includes(tag)
}

/**
 * Check if an error is a ParseError.
 */
const isParseError = (error: unknown): error is ParseResult.ParseError => {
  if (!error || typeof error !== "object") return false
  if (!("_tag" in error)) return false
  return (error as { _tag: string })._tag === "ParseError"
}

/**
 * Map an Effect Cause to an MCP error response.
 * Handles Fail, Die, and Interrupt causes appropriately.
 */
export const mapCauseToMcp = <E>(
  cause: Cause.Cause<E>,
  toolName?: string
): McpErrorResponseWithMeta => {
  // Handle Fail cause (expected errors)
  if (Cause.isFailType(cause)) {
    const error = cause.error

    // Check for ParseError
    if (isParseError(error)) {
      return mapParseErrorToMcp(error, toolName)
    }

    // Check for HulyDomainError
    if (isHulyDomainError(error)) {
      return mapDomainErrorToMcp(error)
    }

    // Unknown error type - provide sanitized message
    const message = error && typeof error === "object" && "message" in error
      ? sanitizeMessage(String((error as { message: unknown }).message))
      : "An unexpected error occurred"

    return createErrorResponse(message, McpErrorCode.InternalError)
  }

  // Handle Die cause (defects/unexpected errors)
  if (Cause.isDieType(cause)) {
    // Never expose defect details - could contain sensitive stack traces
    return createErrorResponse("Internal server error", McpErrorCode.InternalError)
  }

  // Handle Interrupt cause
  if (Cause.isInterruptType(cause)) {
    return createErrorResponse("Operation was interrupted", McpErrorCode.InternalError)
  }

  // Handle composite causes (Sequential, Parallel)
  // Extract the first meaningful error
  const failuresChunk = Cause.failures(cause)
  const failures = Chunk.toArray(failuresChunk)
  if (failures.length > 0) {
    const firstError = failures[0]
    if (isParseError(firstError)) {
      return mapParseErrorToMcp(firstError, toolName)
    }
    if (isHulyDomainError(firstError)) {
      return mapDomainErrorToMcp(firstError)
    }
  }

  // Fallback for any other cause types
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
