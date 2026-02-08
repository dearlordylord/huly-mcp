/**
 * Error hierarchy for Huly MCP server.
 *
 * Tagged errors for pattern matching in Effect code.
 *
 * @module
 */
import { Schema } from "effect"

export const BYTES_PER_MB = 1024 * 1024

/**
 * Base Huly error - generic operational error.
 */
export class HulyError extends Schema.TaggedError<HulyError>()("HulyError", {
  message: Schema.String,
  cause: Schema.optional(Schema.Defect)
}) {}

/**
 * Connection error - network/transport failures.
 */
export class HulyConnectionError extends Schema.TaggedError<HulyConnectionError>()(
  "HulyConnectionError",
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Defect)
  }
) {}

/**
 * Authentication error - invalid credentials or expired session.
 */
export class HulyAuthError extends Schema.TaggedError<HulyAuthError>()(
  "HulyAuthError",
  {
    message: Schema.String
  }
) {}

/**
 * Issue not found in the specified project.
 */
export class IssueNotFoundError extends Schema.TaggedError<IssueNotFoundError>()(
  "IssueNotFoundError",
  {
    identifier: Schema.String,
    project: Schema.String
  }
) {
  override get message(): string {
    return `Issue '${this.identifier}' not found in project '${this.project}'`
  }
}

/**
 * Project not found in the workspace.
 */
export class ProjectNotFoundError extends Schema.TaggedError<ProjectNotFoundError>()(
  "ProjectNotFoundError",
  {
    identifier: Schema.String
  }
) {
  override get message(): string {
    return `Project '${this.identifier}' not found`
  }
}

/**
 * Invalid status for the given project.
 */
export class InvalidStatusError extends Schema.TaggedError<InvalidStatusError>()(
  "InvalidStatusError",
  {
    status: Schema.String,
    project: Schema.String
  }
) {
  override get message(): string {
    return `Invalid status '${this.status}' for project '${this.project}'`
  }
}

/**
 * Person (assignee) not found.
 */
export class PersonNotFoundError extends Schema.TaggedError<PersonNotFoundError>()(
  "PersonNotFoundError",
  {
    identifier: Schema.String
  }
) {
  override get message(): string {
    return `Person '${this.identifier}' not found`
  }
}

/**
 * File upload error - storage operation failed.
 */
export class FileUploadError extends Schema.TaggedError<FileUploadError>()(
  "FileUploadError",
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Defect)
  }
) {}

/**
 * Invalid file data error - e.g., malformed base64.
 */
export class InvalidFileDataError extends Schema.TaggedError<InvalidFileDataError>()(
  "InvalidFileDataError",
  {
    message: Schema.String
  }
) {}

/**
 * File not found at specified path.
 */
export class FileNotFoundError extends Schema.TaggedError<FileNotFoundError>()(
  "FileNotFoundError",
  {
    filePath: Schema.String
  }
) {
  override get message(): string {
    return `File not found: ${this.filePath}`
  }
}

/**
 * Failed to fetch file from URL.
 */
export class FileFetchError extends Schema.TaggedError<FileFetchError>()(
  "FileFetchError",
  {
    fileUrl: Schema.String,
    reason: Schema.String
  }
) {
  override get message(): string {
    return `Failed to fetch file from ${this.fileUrl}: ${this.reason}`
  }
}

/**
 * Teamspace not found in the workspace.
 */
export class TeamspaceNotFoundError extends Schema.TaggedError<TeamspaceNotFoundError>()(
  "TeamspaceNotFoundError",
  {
    identifier: Schema.String
  }
) {
  override get message(): string {
    return `Teamspace '${this.identifier}' not found`
  }
}

/**
 * Document not found in the specified teamspace.
 */
export class DocumentNotFoundError extends Schema.TaggedError<DocumentNotFoundError>()(
  "DocumentNotFoundError",
  {
    identifier: Schema.String,
    teamspace: Schema.String
  }
) {
  override get message(): string {
    return `Document '${this.identifier}' not found in teamspace '${this.teamspace}'`
  }
}

/**
 * Comment not found on the specified issue.
 */
export class CommentNotFoundError extends Schema.TaggedError<CommentNotFoundError>()(
  "CommentNotFoundError",
  {
    commentId: Schema.String,
    issueIdentifier: Schema.String,
    project: Schema.String
  }
) {
  override get message(): string {
    return `Comment '${this.commentId}' not found on issue '${this.issueIdentifier}' in project '${this.project}'`
  }
}

/**
 * Milestone not found in the specified project.
 */
export class MilestoneNotFoundError extends Schema.TaggedError<MilestoneNotFoundError>()(
  "MilestoneNotFoundError",
  {
    identifier: Schema.String,
    project: Schema.String
  }
) {
  override get message(): string {
    return `Milestone '${this.identifier}' not found in project '${this.project}'`
  }
}

/**
 * Channel not found in the workspace.
 */
export class ChannelNotFoundError extends Schema.TaggedError<ChannelNotFoundError>()(
  "ChannelNotFoundError",
  {
    identifier: Schema.String
  }
) {
  override get message(): string {
    return `Channel '${this.identifier}' not found`
  }
}

/**
 * Message not found in the channel.
 */
export class MessageNotFoundError extends Schema.TaggedError<MessageNotFoundError>()(
  "MessageNotFoundError",
  {
    messageId: Schema.String,
    channel: Schema.String
  }
) {
  override get message(): string {
    return `Message '${this.messageId}' not found in channel '${this.channel}'`
  }
}

/**
 * Thread reply not found.
 */
export class ThreadReplyNotFoundError extends Schema.TaggedError<ThreadReplyNotFoundError>()(
  "ThreadReplyNotFoundError",
  {
    replyId: Schema.String,
    messageId: Schema.String
  }
) {
  override get message(): string {
    return `Thread reply '${this.replyId}' not found on message '${this.messageId}'`
  }
}

/**
 * Calendar event not found.
 */
export class EventNotFoundError extends Schema.TaggedError<EventNotFoundError>()(
  "EventNotFoundError",
  {
    eventId: Schema.String
  }
) {
  override get message(): string {
    return `Event '${this.eventId}' not found`
  }
}

/**
 * Recurring calendar event not found.
 */
export class RecurringEventNotFoundError extends Schema.TaggedError<RecurringEventNotFoundError>()(
  "RecurringEventNotFoundError",
  {
    eventId: Schema.String
  }
) {
  override get message(): string {
    return `Recurring event '${this.eventId}' not found`
  }
}

/**
 * Activity message not found.
 */
export class ActivityMessageNotFoundError extends Schema.TaggedError<ActivityMessageNotFoundError>()(
  "ActivityMessageNotFoundError",
  {
    messageId: Schema.String
  }
) {
  override get message(): string {
    return `Activity message '${this.messageId}' not found`
  }
}

/**
 * Reaction not found on message.
 */
export class ReactionNotFoundError extends Schema.TaggedError<ReactionNotFoundError>()(
  "ReactionNotFoundError",
  {
    messageId: Schema.String,
    emoji: Schema.String
  }
) {
  override get message(): string {
    return `Reaction '${this.emoji}' not found on message '${this.messageId}'`
  }
}

/**
 * Saved message not found.
 */
export class SavedMessageNotFoundError extends Schema.TaggedError<SavedMessageNotFoundError>()(
  "SavedMessageNotFoundError",
  {
    messageId: Schema.String
  }
) {
  override get message(): string {
    return `Saved message for '${this.messageId}' not found`
  }
}

/**
 * Attachment not found.
 */
export class AttachmentNotFoundError extends Schema.TaggedError<AttachmentNotFoundError>()(
  "AttachmentNotFoundError",
  {
    attachmentId: Schema.String
  }
) {
  override get message(): string {
    return `Attachment '${this.attachmentId}' not found`
  }
}

/**
 * Component not found in the specified project.
 */
export class ComponentNotFoundError extends Schema.TaggedError<ComponentNotFoundError>()(
  "ComponentNotFoundError",
  {
    identifier: Schema.String,
    project: Schema.String
  }
) {
  override get message(): string {
    return `Component '${this.identifier}' not found in project '${this.project}'`
  }
}

/**
 * Issue template not found in the specified project.
 */
export class IssueTemplateNotFoundError extends Schema.TaggedError<IssueTemplateNotFoundError>()(
  "IssueTemplateNotFoundError",
  {
    identifier: Schema.String,
    project: Schema.String
  }
) {
  override get message(): string {
    return `Issue template '${this.identifier}' not found in project '${this.project}'`
  }
}

/**
 * Notification not found.
 */
export class NotificationNotFoundError extends Schema.TaggedError<NotificationNotFoundError>()(
  "NotificationNotFoundError",
  {
    notificationId: Schema.String
  }
) {
  override get message(): string {
    return `Notification '${this.notificationId}' not found`
  }
}

/**
 * Notification context not found.
 */
export class NotificationContextNotFoundError extends Schema.TaggedError<NotificationContextNotFoundError>()(
  "NotificationContextNotFoundError",
  {
    contextId: Schema.String
  }
) {
  override get message(): string {
    return `Notification context '${this.contextId}' not found`
  }
}

/**
 * Invalid PersonUuid format.
 */
export class InvalidPersonUuidError extends Schema.TaggedError<InvalidPersonUuidError>()(
  "InvalidPersonUuidError",
  {
    uuid: Schema.String
  }
) {
  override get message(): string {
    return `Invalid PersonUuid format: '${this.uuid}'`
  }
}

/**
 * File size exceeds maximum allowed.
 */
export class FileTooLargeError extends Schema.TaggedError<FileTooLargeError>()(
  "FileTooLargeError",
  {
    filename: Schema.String,
    size: Schema.Number,
    maxSize: Schema.Number
  }
) {
  override get message(): string {
    const DECIMAL_PLACES = 2
    const sizeMB = (this.size / BYTES_PER_MB).toFixed(DECIMAL_PLACES)
    const maxMB = (this.maxSize / BYTES_PER_MB).toFixed(0)
    return `File '${this.filename}' is too large (${sizeMB}MB). Maximum allowed: ${maxMB}MB`
  }
}

/**
 * Invalid content type for file upload.
 */
export class InvalidContentTypeError extends Schema.TaggedError<InvalidContentTypeError>()(
  "InvalidContentTypeError",
  {
    filename: Schema.String,
    contentType: Schema.String
  }
) {
  override get message(): string {
    return `Invalid content type '${this.contentType}' for file '${this.filename}'`
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
  | MessageNotFoundError
  | ThreadReplyNotFoundError
  | EventNotFoundError
  | RecurringEventNotFoundError
  | ActivityMessageNotFoundError
  | ReactionNotFoundError
  | SavedMessageNotFoundError
  | AttachmentNotFoundError
  | ComponentNotFoundError
  | IssueTemplateNotFoundError
  | NotificationNotFoundError
  | NotificationContextNotFoundError
  | InvalidPersonUuidError
  | FileTooLargeError
  | InvalidContentTypeError

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
    typeof MessageNotFoundError,
    typeof ThreadReplyNotFoundError,
    typeof EventNotFoundError,
    typeof RecurringEventNotFoundError,
    typeof ActivityMessageNotFoundError,
    typeof ReactionNotFoundError,
    typeof SavedMessageNotFoundError,
    typeof AttachmentNotFoundError,
    typeof ComponentNotFoundError,
    typeof IssueTemplateNotFoundError,
    typeof NotificationNotFoundError,
    typeof NotificationContextNotFoundError,
    typeof InvalidPersonUuidError,
    typeof FileTooLargeError,
    typeof InvalidContentTypeError
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
  MessageNotFoundError,
  ThreadReplyNotFoundError,
  EventNotFoundError,
  RecurringEventNotFoundError,
  ActivityMessageNotFoundError,
  ReactionNotFoundError,
  SavedMessageNotFoundError,
  AttachmentNotFoundError,
  ComponentNotFoundError,
  IssueTemplateNotFoundError,
  NotificationNotFoundError,
  NotificationContextNotFoundError,
  InvalidPersonUuidError,
  FileTooLargeError,
  InvalidContentTypeError
)
