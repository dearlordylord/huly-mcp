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
import { Cause, Chunk, ParseResult } from "effect"

import type { ToolWarning } from "../domain/schemas/tool-warnings.js"
import type { HulyDomainError } from "../huly/errors.js"

/**
 * MCP standard error codes.
 *
 * Single source of truth for MCP JSON-RPC error codes shared across modules — e.g.
 * resources.ts produces ResourceNotFound and the 2026 HTTP dispatcher remaps it.
 */
export const McpErrorCode = {
  InvalidParams: -32602,
  InternalError: -32603,
  ResourceNotFound: -32002
} as const

export type McpErrorCode = (typeof McpErrorCode)[keyof typeof McpErrorCode]

// --- MCP Error Response Types ---

/**
 * Internal metadata for error tracking (stripped before sending to MCP).
 */
interface ErrorMetadata {
  errorCode: McpErrorCode
  errorTag?: string | undefined
}

/**
 * MCP protocol tool response structure.
 * Compatible with MCP SDK CallToolResult.
 * _meta carries internal error metadata, stripped by toMcpResponse before wire.
 */
interface McpToolResponseBase {
  readonly content: Array<{ type: "text"; text: string }>
  readonly _meta?: ErrorMetadata
}

interface McpToolSuccessResponse extends McpToolResponseBase {
  structuredContent?: {
    readonly result: unknown
    readonly warnings?: ReadonlyArray<ToolWarning>
  }
  readonly isError?: false
}

interface McpToolErrorResponse extends McpToolResponseBase {
  readonly structuredContent?: never
  readonly isError: true
}

export type McpToolResponse = McpToolSuccessResponse | McpToolErrorResponse

type WithoutMeta<T> = T extends unknown ? Omit<T, "_meta"> : never

type McpWireResponse = WithoutMeta<McpToolResponse>

/**
 * Error response with required metadata for error tracking/testing.
 */
interface McpErrorResponseWithMeta extends McpToolErrorResponse {
  isError: true
  _meta: ErrorMetadata
}

const createErrorResponse = (
  text: string,
  errorCode: McpErrorCode,
  errorTag?: string,
  warnings: ReadonlyArray<ToolWarning> = []
): McpErrorResponseWithMeta => {
  const warningContent = warnings.length > 0
    ? [{ type: "text" as const, text: encodeJsonText({ warnings }) }]
    : []
  return {
    content: [{ type: "text" as const, text }, ...warningContent],
    isError: true,
    _meta: { errorCode, errorTag }
  }
}

// --- Domain Error Mapping ---

const INVALID_PARAMS_TAGS: ReadonlySet<HulyDomainError["_tag"]> = new Set<HulyDomainError["_tag"]>([
  "IssueNotFoundError",
  "ProjectNotFoundError",
  "InvalidStatusError",
  "PersonIdentifierAmbiguousError",
  "PersonNotFoundError",
  "OrganizationNotFoundError",
  "OrganizationIdentifierAmbiguousError",
  "InvalidContactProviderError",
  "ContactChannelNotFoundError",
  "ContactChannelIdentifierAmbiguousError",
  "ContactChannelConflictError",
  "InvalidContactChannelLocatorError",
  "InvalidContactChannelValueError",
  "InvalidFileDataError",
  "FileNotFoundError",
  "TeamspaceNotFoundError",
  "DocumentNotFoundError",
  "DocumentTextNotFoundError",
  "DocumentTextMultipleMatchesError",
  "DocumentEmptyContentError",
  "DocumentContentCorruptedError",
  "DocumentEditModeError",
  "DocumentReferenceError",
  "CommentNotFoundError",
  "MilestoneNotFoundError",
  "ChannelNotFoundError",
  "ChannelArchivedError",
  "ChannelLastMemberRemovalError",
  "ChannelLastOwnerRemovalError",
  "DirectMessageIdentifierAmbiguousError",
  "DirectMessageNotFoundError",
  "DirectMessageParticipantCountError",
  "CannotDirectMessageSelfError",
  "PersonNotAnEmployeeError",
  "MessageNotFoundError",
  "ThreadReplyNotFoundError",
  "CalendarNotAccessibleError",
  "EventNotFoundError",
  "RecurringEventNotFoundError",
  "ScheduleNotFoundError",
  "FloorNotFoundError",
  "RoomNotFoundError",
  "MeetingMinutesNotFoundError",
  "ActivityMessageNotFoundError",
  "ReactionNotFoundError",
  "SavedMessageNotFoundError",
  "AttachmentNotFoundError",
  "TestProjectNotFoundError",
  "TestSuiteNotFoundError",
  "TestCaseNotFoundError",
  "TestPlanNotFoundError",
  "TestRunNotFoundError",
  "TestResultNotFoundError",
  "TestPlanItemNotFoundError",
  "ComponentNotFoundError",
  "CustomFieldNotFoundError",
  "CustomFieldObjectNotFoundError",
  "IssueTemplateNotFoundError",
  "TemplateChildNotFoundError",
  "NotificationNotFoundError",
  "NotificationContextNotFoundError",
  "NotificationPersonSpaceNotFoundError",
  "InvalidPersonUuidError",
  "FunnelNotFoundError",
  "LeadNotFoundError",
  "FileTooLargeError",
  "InvalidContentTypeError",
  "ProcessNotFoundError",
  "ProcessIdentifierAmbiguousError",
  "ProcessMasterTagAmbiguousError",
  "ProcessMasterTagNotFoundError",
  "ProcessCardIdentifierAmbiguousError",
  "ProcessCardNotFoundError",
  "AssociationNotFoundError",
  "AssociationIdentifierAmbiguousError",
  "AssociationSystemClassUnsupportedError",
  "AssociationConflictError",
  "AssociationInUseError",
  "RelationNotFoundError",
  "RelationIdentifierAmbiguousError",
  "RelationMutationUnsupportedError",
  "RelationCardinalityViolationError",
  "RelationDirectionAmbiguousError",
  "RelationEndpointClassMismatchError",
  "GenericObjectIdentifierAmbiguousError",
  "GenericObjectLocatorInvalidError",
  "GenericObjectNotFoundError",
  "SpaceNotFoundError",
  "SpaceIdentifierAmbiguousError",
  "SpaceNotTypedError",
  "SpaceRoleNotFoundError",
  "SpaceRoleIdentifierAmbiguousError",
  "SpaceTypeNotFoundError",
  "SpaceTypeIdentifierAmbiguousError",
  "DriveNotFoundError",
  "DriveIdentifierAmbiguousError",
  "DrivePathNotFoundError",
  "DrivePathAmbiguousError",
  "DriveParentNotFolderError",
  "DriveFileNotFoundError",
  "DriveFileCommentNotFoundError",
  "DriveFileVersionNotFoundError",
  "DrivePathConflictError",
  "DriveInvalidMoveError",
  "DriveInvalidItemOperationError",
  "DriveFolderNotEmptyError",
  "DriveNotEmptyError",
  "NoUpdateFieldsError"
])

const INTERNAL_ERROR_PREFIX: Partial<Record<HulyDomainError["_tag"], string>> = {
  FileUploadError: "File upload error",
  HulyConnectionError: "Connection error",
  HulyAuthError: "Authentication error"
}

export const mapDomainErrorToMcp = (
  error: HulyDomainError,
  warnings: ReadonlyArray<ToolWarning> = []
): McpErrorResponseWithMeta => {
  if (INVALID_PARAMS_TAGS.has(error._tag)) {
    return createErrorResponse(error.message, McpErrorCode.InvalidParams, undefined, warnings)
  }
  const prefix = INTERNAL_ERROR_PREFIX[error._tag]
  const message = prefix !== undefined ? `${prefix}: ${error.message}` : error.message
  return createErrorResponse(message, McpErrorCode.InternalError, error._tag, warnings)
}

// --- Parse Error Mapping ---

export const formatParseError = (error: ParseResult.ParseError): string => {
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
  cause: Cause.Cause<HulyDomainError>,
  warnings: ReadonlyArray<ToolWarning> = []
): McpErrorResponseWithMeta => {
  if (Cause.isFailType(cause)) {
    return mapDomainErrorToMcp(cause.error, warnings)
  }

  if (Cause.isDieType(cause)) {
    return createErrorResponse("An unexpected error occurred", McpErrorCode.InternalError, "UnexpectedError", warnings)
  }

  const failures = Chunk.toArray(Cause.failures(cause))
  if (failures.length > 0) {
    return mapDomainErrorToMcp(failures[0], warnings)
  }

  return createErrorResponse("An unexpected error occurred", McpErrorCode.InternalError, undefined, warnings)
}

const encodeJsonText = (value: unknown): string => {
  const text = JSON.stringify(value)
  return typeof text === "string" ? text : "null"
}

export const createSuccessResponse = <T>(
  result: T,
  warnings: ReadonlyArray<ToolWarning> = []
): McpToolResponse => ({
  content: [
    { type: "text" as const, text: encodeJsonText(result) },
    ...(warnings.length > 0 ? [{ type: "text" as const, text: encodeJsonText({ warnings }) }] : [])
  ],
  structuredContent: warnings.length > 0
    ? {
      result,
      warnings
    }
    : {
      result
    }
})

export const createUnknownToolError = (toolName: string): McpErrorResponseWithMeta =>
  createErrorResponse(`Unknown tool: ${toolName}`, McpErrorCode.InvalidParams, "UnknownTool")

export const createInvalidParamsError = (message: string, errorTag?: string): McpErrorResponseWithMeta =>
  createErrorResponse(message, McpErrorCode.InvalidParams, errorTag)

export const toMcpResponse = (response: McpToolResponse): McpWireResponse =>
  response.isError === true
    ? {
      content: response.content,
      isError: true
    }
    : {
      content: response.content,
      ...(response.structuredContent === undefined ? {} : { structuredContent: response.structuredContent }),
      ...(response.isError === undefined ? {} : { isError: response.isError })
    }
