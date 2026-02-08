/**
 * Test factory functions for branded and phantom types.
 *
 * Branded types from Effect Schema and phantom types from the Huly SDK
 * have no runtime constructors. In test code, the only way to create
 * values of these types is via type assertion. These helpers centralize
 * the casts so test files stay clean.
 */

// --- Effect Schema brands (src/domain/schemas/shared.ts) ---

import type {
  AccountId,
  AccountUuid,
  ActivityMessageId,
  AttachmentId,
  BlobId,
  ChannelId,
  ChannelIdentifier,
  ChannelName,
  ColorCode,
  CommentId,
  ComponentId,
  ComponentIdentifier,
  ComponentLabel,
  ContactProvider,
  DocumentId,
  DocumentIdentifier,
  Email,
  EmojiCode,
  EventId,
  IssueId,
  IssueIdentifier,
  IssueTemplateId,
  MemberReference,
  MessageId,
  MilestoneId,
  MilestoneIdentifier,
  MilestoneLabel,
  MimeType,
  NonNegativeNumber,
  NotificationContextId,
  NotificationId,
  NotificationProviderId,
  NotificationTypeId,
  ObjectClassName,
  OrganizationId,
  PersonId,
  PersonName,
  PersonUuid,
  PositiveNumber,
  ProjectIdentifier,
  RegionId,
  SpaceId,
  StatusName,
  TeamspaceId,
  TeamspaceIdentifier,
  TemplateIdentifier,
  ThreadReplyId,
  TimeSpendReportId,
  TodoId,
  WorkspaceUuid
} from "../../src/domain/schemas/shared.js"

// Tier 1: Huly Internal Refs
// SDK phantom types use `as` because there are no constructors — standard for phantom-branded external types
export const personId = (s: string) => s as PersonId
export const organizationId = (s: string) => s as OrganizationId
export const issueId = (s: string) => s as IssueId
export const componentBrandId = (s: string) => s as ComponentId
export const milestoneId = (s: string) => s as MilestoneId
export const issueTemplateId = (s: string) => s as IssueTemplateId
export const channelBrandId = (s: string) => s as ChannelId
export const messageBrandId = (s: string) => s as MessageId
export const threadReplyId = (s: string) => s as ThreadReplyId
export const activityMessageId = (s: string) => s as ActivityMessageId
export const attachmentBrandId = (s: string) => s as AttachmentId
export const blobId = (s: string) => s as BlobId
export const documentBrandId = (s: string) => s as DocumentId
export const teamspaceId = (s: string) => s as TeamspaceId
export const notificationBrandId = (s: string) => s as NotificationId
export const notificationContextId = (s: string) => s as NotificationContextId
export const eventBrandId = (s: string) => s as EventId
export const todoId = (s: string) => s as TodoId
export const spaceBrandId = (s: string) => s as SpaceId
export const commentBrandId = (s: string) => s as CommentId
export const timeSpendReportId = (s: string) => s as TimeSpendReportId

// Tier 2: Human-Readable Identifiers
export const projectIdentifier = (s: string) => s as ProjectIdentifier
export const issueIdentifier = (s: string) => s as IssueIdentifier

// Tier 3: Constrained String Domains
export const email = (s: string) => s as Email
export const statusName = (s: string) => s as StatusName
export const personName = (s: string) => s as PersonName
export const componentLabel = (s: string) => s as ComponentLabel
export const milestoneLabel = (s: string) => s as MilestoneLabel
export const channelName = (s: string) => s as ChannelName
export const mimeType = (s: string) => s as MimeType
export const objectClassName = (s: string) => s as ObjectClassName
export const emojiCode = (s: string) => s as EmojiCode
export const contactProvider = (s: string) => s as ContactProvider
export const notificationProviderId = (s: string) => s as NotificationProviderId
export const notificationTypeId = (s: string) => s as NotificationTypeId

// Tier 4: Workspace/Account Identifiers
export const workspaceUuid = (s: string) => s as WorkspaceUuid
export const personUuid = (s: string) => s as PersonUuid
export const accountId = (s: string) => s as AccountId
export const accountUuid = (s: string) => s as AccountUuid
export const regionId = (s: string) => s as RegionId

// Tier 5: Numeric Brands
export const nonNegativeNumber = (n: number) => n as NonNegativeNumber
export const positiveNumber = (n: number): PositiveNumber => {
  const nn = n as NonNegativeNumber
  return nn as PositiveNumber
}
export const colorCode = (n: number) => n as ColorCode

// Tier 6: Dual-Semantic Lookup Types
export const componentIdentifier = (s: string) => s as ComponentIdentifier
export const milestoneIdentifier = (s: string) => s as MilestoneIdentifier
export const templateIdentifier = (s: string) => s as TemplateIdentifier
export const channelIdentifier = (s: string) => s as ChannelIdentifier
export const teamspaceIdentifier = (s: string) => s as TeamspaceIdentifier
export const documentIdentifier = (s: string) => s as DocumentIdentifier
export const memberReference = (s: string) => s as MemberReference

// Re-export branded types for convenience
export type {
  AccountId,
  AccountUuid,
  ActivityMessageId,
  AttachmentId,
  BlobId,
  ChannelId,
  ChannelIdentifier,
  ChannelName,
  ColorCode,
  CommentId,
  ComponentId,
  ComponentIdentifier,
  ComponentLabel,
  ContactProvider,
  DocumentId,
  DocumentIdentifier,
  Email,
  EmojiCode,
  EventId,
  IssueId,
  IssueIdentifier,
  IssueTemplateId,
  MemberReference,
  MessageId,
  MilestoneId,
  MilestoneIdentifier,
  MilestoneLabel,
  MimeType,
  NonNegativeNumber,
  NotificationContextId,
  NotificationId,
  NotificationProviderId,
  NotificationTypeId,
  ObjectClassName,
  OrganizationId,
  PersonId,
  PersonName,
  PersonUuid,
  PositiveNumber,
  ProjectIdentifier,
  RegionId,
  SpaceId,
  StatusName,
  TeamspaceId,
  TeamspaceIdentifier,
  TemplateIdentifier,
  ThreadReplyId,
  TimeSpendReportId,
  TodoId,
  WorkspaceUuid
} from "../../src/domain/schemas/shared.js"
