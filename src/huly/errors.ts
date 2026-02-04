/**
 * Error hierarchy for Huly MCP server.
 *
 * Tagged errors for pattern matching in Effect code.
 * Maps to MCP error codes:
 * - -32602 (Invalid params): IssueNotFoundError, ProjectNotFoundError, InvalidStatusError
 * - -32603 (Internal error): HulyConnectionError, HulyAuthError, HulyError
 *
 * @module
 */
import { Schema } from "effect"

/**
 * MCP standard error codes.
 */
export const McpErrorCode = {
  InvalidParams: -32602,
  InternalError: -32603
} as const

export type McpErrorCode = (typeof McpErrorCode)[keyof typeof McpErrorCode]

/**
 * Base Huly error - generic operational error.
 * Maps to MCP -32603 (Internal error).
 */
export class HulyError extends Schema.TaggedError<HulyError>()("HulyError", {
  message: Schema.String,
  cause: Schema.optional(Schema.Defect)
}) {
  readonly mcpErrorCode: McpErrorCode = McpErrorCode.InternalError
}

/**
 * Connection error - network/transport failures.
 * Maps to MCP -32603 (Internal error).
 */
export class HulyConnectionError extends Schema.TaggedError<HulyConnectionError>()(
  "HulyConnectionError",
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Defect)
  }
) {
  readonly mcpErrorCode: McpErrorCode = McpErrorCode.InternalError
}

/**
 * Authentication error - invalid credentials or expired session.
 * Maps to MCP -32603 (Internal error).
 */
export class HulyAuthError extends Schema.TaggedError<HulyAuthError>()(
  "HulyAuthError",
  {
    message: Schema.String
  }
) {
  readonly mcpErrorCode: McpErrorCode = McpErrorCode.InternalError
}

/**
 * Issue not found in the specified project.
 * Maps to MCP -32602 (Invalid params).
 */
export class IssueNotFoundError extends Schema.TaggedError<IssueNotFoundError>()(
  "IssueNotFoundError",
  {
    identifier: Schema.String,
    project: Schema.String
  }
) {
  readonly mcpErrorCode: McpErrorCode = McpErrorCode.InvalidParams

  override get message(): string {
    return `Issue '${this.identifier}' not found in project '${this.project}'`
  }
}

/**
 * Project not found in the workspace.
 * Maps to MCP -32602 (Invalid params).
 */
export class ProjectNotFoundError extends Schema.TaggedError<ProjectNotFoundError>()(
  "ProjectNotFoundError",
  {
    identifier: Schema.String
  }
) {
  readonly mcpErrorCode: McpErrorCode = McpErrorCode.InvalidParams

  override get message(): string {
    return `Project '${this.identifier}' not found`
  }
}

/**
 * Invalid status for the given project.
 * Maps to MCP -32602 (Invalid params).
 */
export class InvalidStatusError extends Schema.TaggedError<InvalidStatusError>()(
  "InvalidStatusError",
  {
    status: Schema.String,
    project: Schema.String
  }
) {
  readonly mcpErrorCode: McpErrorCode = McpErrorCode.InvalidParams

  override get message(): string {
    return `Invalid status '${this.status}' for project '${this.project}'`
  }
}

/**
 * Person (assignee) not found.
 * Maps to MCP -32602 (Invalid params).
 */
export class PersonNotFoundError extends Schema.TaggedError<PersonNotFoundError>()(
  "PersonNotFoundError",
  {
    identifier: Schema.String
  }
) {
  readonly mcpErrorCode: McpErrorCode = McpErrorCode.InvalidParams

  override get message(): string {
    return `Person '${this.identifier}' not found`
  }
}

/**
 * File upload error - storage operation failed.
 * Maps to MCP -32603 (Internal error).
 */
export class FileUploadError extends Schema.TaggedError<FileUploadError>()(
  "FileUploadError",
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Defect)
  }
) {
  readonly mcpErrorCode: McpErrorCode = McpErrorCode.InternalError
}

/**
 * Invalid file data error - e.g., malformed base64.
 * Maps to MCP -32602 (Invalid params).
 */
export class InvalidFileDataError extends Schema.TaggedError<InvalidFileDataError>()(
  "InvalidFileDataError",
  {
    message: Schema.String
  }
) {
  readonly mcpErrorCode: McpErrorCode = McpErrorCode.InvalidParams
}

/**
 * File not found at specified path.
 * Maps to MCP -32602 (Invalid params).
 */
export class FileNotFoundError extends Schema.TaggedError<FileNotFoundError>()(
  "FileNotFoundError",
  {
    filePath: Schema.String
  }
) {
  readonly mcpErrorCode: McpErrorCode = McpErrorCode.InvalidParams

  override get message(): string {
    return `File not found: ${this.filePath}`
  }
}

/**
 * Failed to fetch file from URL.
 * Maps to MCP -32603 (Internal error).
 */
export class FileFetchError extends Schema.TaggedError<FileFetchError>()(
  "FileFetchError",
  {
    fileUrl: Schema.String,
    reason: Schema.String
  }
) {
  readonly mcpErrorCode: McpErrorCode = McpErrorCode.InternalError

  override get message(): string {
    return `Failed to fetch file from ${this.fileUrl}: ${this.reason}`
  }
}

/**
 * Teamspace not found in the workspace.
 * Maps to MCP -32602 (Invalid params).
 */
export class TeamspaceNotFoundError extends Schema.TaggedError<TeamspaceNotFoundError>()(
  "TeamspaceNotFoundError",
  {
    identifier: Schema.String
  }
) {
  readonly mcpErrorCode: McpErrorCode = McpErrorCode.InvalidParams

  override get message(): string {
    return `Teamspace '${this.identifier}' not found`
  }
}

/**
 * Document not found in the specified teamspace.
 * Maps to MCP -32602 (Invalid params).
 */
export class DocumentNotFoundError extends Schema.TaggedError<DocumentNotFoundError>()(
  "DocumentNotFoundError",
  {
    identifier: Schema.String,
    teamspace: Schema.String
  }
) {
  readonly mcpErrorCode: McpErrorCode = McpErrorCode.InvalidParams

  override get message(): string {
    return `Document '${this.identifier}' not found in teamspace '${this.teamspace}'`
  }
}

/**
 * Comment not found on the specified issue.
 * Maps to MCP -32602 (Invalid params).
 */
export class CommentNotFoundError extends Schema.TaggedError<CommentNotFoundError>()(
  "CommentNotFoundError",
  {
    commentId: Schema.String,
    issueIdentifier: Schema.String,
    project: Schema.String
  }
) {
  readonly mcpErrorCode: McpErrorCode = McpErrorCode.InvalidParams

  override get message(): string {
    return `Comment '${this.commentId}' not found on issue '${this.issueIdentifier}' in project '${this.project}'`
  }
}

/**
 * Milestone not found in the specified project.
 * Maps to MCP -32602 (Invalid params).
 */
export class MilestoneNotFoundError extends Schema.TaggedError<MilestoneNotFoundError>()(
  "MilestoneNotFoundError",
  {
    identifier: Schema.String,
    project: Schema.String
  }
) {
  readonly mcpErrorCode: McpErrorCode = McpErrorCode.InvalidParams

  override get message(): string {
    return `Milestone '${this.identifier}' not found in project '${this.project}'`
  }
}

/**
 * Channel not found in the workspace.
 * Maps to MCP -32602 (Invalid params).
 */
export class ChannelNotFoundError extends Schema.TaggedError<ChannelNotFoundError>()(
  "ChannelNotFoundError",
  {
    identifier: Schema.String
  }
) {
  readonly mcpErrorCode: McpErrorCode = McpErrorCode.InvalidParams

  override get message(): string {
    return `Channel '${this.identifier}' not found`
  }
}

/**
 * Calendar event not found.
 * Maps to MCP -32602 (Invalid params).
 */
export class EventNotFoundError extends Schema.TaggedError<EventNotFoundError>()(
  "EventNotFoundError",
  {
    eventId: Schema.String
  }
) {
  readonly mcpErrorCode: McpErrorCode = McpErrorCode.InvalidParams

  override get message(): string {
    return `Event '${this.eventId}' not found`
  }
}

/**
 * Recurring calendar event not found.
 * Maps to MCP -32602 (Invalid params).
 */
export class RecurringEventNotFoundError extends Schema.TaggedError<RecurringEventNotFoundError>()(
  "RecurringEventNotFoundError",
  {
    eventId: Schema.String
  }
) {
  readonly mcpErrorCode: McpErrorCode = McpErrorCode.InvalidParams

  override get message(): string {
    return `Recurring event '${this.eventId}' not found`
  }
}

/**
 * Activity message not found.
 * Maps to MCP -32602 (Invalid params).
 */
export class ActivityMessageNotFoundError extends Schema.TaggedError<ActivityMessageNotFoundError>()(
  "ActivityMessageNotFoundError",
  {
    messageId: Schema.String
  }
) {
  readonly mcpErrorCode: McpErrorCode = McpErrorCode.InvalidParams

  override get message(): string {
    return `Activity message '${this.messageId}' not found`
  }
}

/**
 * Reaction not found on message.
 * Maps to MCP -32602 (Invalid params).
 */
export class ReactionNotFoundError extends Schema.TaggedError<ReactionNotFoundError>()(
  "ReactionNotFoundError",
  {
    messageId: Schema.String,
    emoji: Schema.String
  }
) {
  readonly mcpErrorCode: McpErrorCode = McpErrorCode.InvalidParams

  override get message(): string {
    return `Reaction '${this.emoji}' not found on message '${this.messageId}'`
  }
}

/**
 * Saved message not found.
 * Maps to MCP -32602 (Invalid params).
 */
export class SavedMessageNotFoundError extends Schema.TaggedError<SavedMessageNotFoundError>()(
  "SavedMessageNotFoundError",
  {
    messageId: Schema.String
  }
) {
  readonly mcpErrorCode: McpErrorCode = McpErrorCode.InvalidParams

  override get message(): string {
    return `Saved message for '${this.messageId}' not found`
  }
}

/**
 * Union of all Huly domain errors.
 */
export type HulyDomainError =
  | HulyError
  | HulyConnectionError
  | HulyAuthError
  | IssueNotFoundError
  | ProjectNotFoundError
  | InvalidStatusError
  | PersonNotFoundError
  | FileUploadError
  | InvalidFileDataError
  | FileNotFoundError
  | FileFetchError
  | TeamspaceNotFoundError
  | DocumentNotFoundError
  | CommentNotFoundError
  | MilestoneNotFoundError
  | ChannelNotFoundError
  | EventNotFoundError
  | RecurringEventNotFoundError
  | ActivityMessageNotFoundError
  | ReactionNotFoundError
  | SavedMessageNotFoundError

/**
 * Schema for all Huly domain errors (for serialization).
 */
export const HulyDomainError: Schema.Union<
  [
    typeof HulyError,
    typeof HulyConnectionError,
    typeof HulyAuthError,
    typeof IssueNotFoundError,
    typeof ProjectNotFoundError,
    typeof InvalidStatusError,
    typeof PersonNotFoundError,
    typeof FileUploadError,
    typeof InvalidFileDataError,
    typeof FileNotFoundError,
    typeof FileFetchError,
    typeof TeamspaceNotFoundError,
    typeof DocumentNotFoundError,
    typeof CommentNotFoundError,
    typeof MilestoneNotFoundError,
    typeof ChannelNotFoundError,
    typeof EventNotFoundError,
    typeof RecurringEventNotFoundError,
    typeof ActivityMessageNotFoundError,
    typeof ReactionNotFoundError,
    typeof SavedMessageNotFoundError
  ]
> = Schema.Union(
  HulyError,
  HulyConnectionError,
  HulyAuthError,
  IssueNotFoundError,
  ProjectNotFoundError,
  InvalidStatusError,
  PersonNotFoundError,
  FileUploadError,
  InvalidFileDataError,
  FileNotFoundError,
  FileFetchError,
  TeamspaceNotFoundError,
  DocumentNotFoundError,
  CommentNotFoundError,
  MilestoneNotFoundError,
  ChannelNotFoundError,
  EventNotFoundError,
  RecurringEventNotFoundError,
  ActivityMessageNotFoundError,
  ReactionNotFoundError,
  SavedMessageNotFoundError
)

/**
 * Get MCP error code from a Huly domain error.
 */
export const getMcpErrorCode = (error: HulyDomainError): McpErrorCode => {
  return error.mcpErrorCode
}
