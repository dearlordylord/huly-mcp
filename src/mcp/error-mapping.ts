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
import { absurd, Cause, Chunk, ParseResult } from "effect"

import type { HulyDomainError } from "../huly/errors.js"

/**
 * MCP standard error codes.
 */
export const McpErrorCode = {
  InvalidParams: -32602,
  InternalError: -32603
} as const

export type McpErrorCode = (typeof McpErrorCode)[keyof typeof McpErrorCode]

// --- MCP Error Response Types ---

/**
 * Internal metadata for error tracking (stripped before sending to MCP).
 */
interface ErrorMetadata {
  errorCode: McpErrorCode
}

/**
 * MCP protocol tool response structure.
 * Compatible with MCP SDK CallToolResult.
 * _meta carries internal error metadata, stripped by toMcpResponse before wire.
 */
export interface McpToolResponse {
  content: Array<{ type: "text"; text: string }>
  isError?: boolean
  _meta?: ErrorMetadata
}

/**
 * Error response with required metadata for error tracking/testing.
 */
interface McpErrorResponseWithMeta extends McpToolResponse {
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
 * Uses switch statement because Effect's Match.tag has a 20-branch limit.
 */
export const mapDomainErrorToMcp = (error: HulyDomainError): McpErrorResponseWithMeta => {
  switch (error._tag) {
    case "IssueNotFoundError":
    case "ProjectNotFoundError":
    case "InvalidStatusError":
    case "PersonNotFoundError":
    case "InvalidFileDataError":
    case "FileNotFoundError":
    case "TeamspaceNotFoundError":
    case "DocumentNotFoundError":
    case "CommentNotFoundError":
    case "MilestoneNotFoundError":
    case "ChannelNotFoundError":
    case "MessageNotFoundError":
    case "ThreadReplyNotFoundError":
    case "EventNotFoundError":
    case "RecurringEventNotFoundError":
    case "ActivityMessageNotFoundError":
    case "ReactionNotFoundError":
    case "SavedMessageNotFoundError":
    case "AttachmentNotFoundError":
    case "ComponentNotFoundError":
    case "IssueTemplateNotFoundError":
    case "NotificationNotFoundError":
    case "NotificationContextNotFoundError":
    case "InvalidPersonUuidError":
    case "FileTooLargeError":
    case "InvalidContentTypeError":
      return createErrorResponse(error.message, McpErrorCode.InvalidParams)

    case "FileFetchError":
      return createErrorResponse(error.message, McpErrorCode.InternalError)

    case "FileUploadError":
      return createErrorResponse(`File upload error: ${error.message}`, McpErrorCode.InternalError)

    case "HulyConnectionError":
      return createErrorResponse(`Connection error: ${error.message}`, McpErrorCode.InternalError)

    case "HulyAuthError":
      return createErrorResponse(`Authentication error: ${error.message}`, McpErrorCode.InternalError)

    case "HulyError":
      return createErrorResponse(error.message, McpErrorCode.InternalError)

    default:
      return absurd(error)
  }
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

const JSON_INDENT = 2
export const createSuccessResponse = <T>(result: T): McpToolResponse => ({
  content: [{ type: "text" as const, text: JSON.stringify(result, null, JSON_INDENT) }]
})

export const createUnknownToolError = (toolName: string): McpErrorResponseWithMeta =>
  createErrorResponse(`Unknown tool: ${toolName}`, McpErrorCode.InvalidParams)

export const toMcpResponse = (response: McpToolResponse): Omit<McpToolResponse, "_meta"> => {
  const { _meta: _, ...wire } = response
  return wire
}
