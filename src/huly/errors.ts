/**
 * Error hierarchy for Huly MCP server — barrel re-export.
 *
 * Split into domain modules:
 * - errors-base: HulyError, HulyConnectionError, HulyAuthError
 * - errors-tracker: issue, project, status, milestone, component, template errors
 * - errors-contacts: person, organization, and contact validation errors
 * - errors-files: file upload/fetch/size errors, BYTES_PER_MB
 * - errors-documents: teamspace, document errors
 * - errors-messaging: channel, message, thread, reaction errors
 * - errors-calendar: event and calendar errors
 * - errors-love: virtual office, room, and meeting minutes errors
 * - errors-cards: card space, card, master tag errors
 * - errors-labels: tag, tag category errors
 * - errors-test-management: test project/suite/case/plan/run/result errors
 * - errors-notifications: notification errors
 *
 * @module
 */
import { Schema } from "effect"

import { HulyAuthError, HulyConnectionError, HulyError, NoUpdateFieldsError } from "./errors-base.js"
import {
  CalendarNotAccessibleError,
  EventNotFoundError,
  RecurringEventNotFoundError,
  ScheduleNotFoundError
} from "./errors-calendar.js"
import { CardNotFoundError, CardSpaceNotFoundError, MasterTagNotFoundError } from "./errors-cards.js"
import {
  InvalidContactProviderError,
  InvalidPersonUuidError,
  OrganizationIdentifierAmbiguousError,
  OrganizationNotFoundError,
  PersonIdentifierAmbiguousError,
  PersonNotFoundError
} from "./errors-contacts.js"
import { CustomFieldNotFoundError, CustomFieldObjectNotFoundError } from "./errors-custom-fields.js"
import {
  DocumentContentCorruptedError,
  DocumentEditModeError,
  DocumentEmptyContentError,
  DocumentNotFoundError,
  DocumentReferenceError,
  DocumentTextMultipleMatchesError,
  DocumentTextNotFoundError,
  TeamspaceNotFoundError
} from "./errors-documents.js"
import {
  AttachmentNotFoundError,
  BYTES_PER_MB,
  FileFetchError,
  FileNotFoundError,
  FileTooLargeError,
  FileUploadError,
  InvalidContentTypeError,
  InvalidFileDataError,
  MAX_FILE_SIZE,
  MAX_FILE_SIZE_MB
} from "./errors-files.js"
import {
  AssociationConflictError,
  AssociationIdentifierAmbiguousError,
  AssociationInUseError,
  AssociationNotFoundError,
  AssociationSystemClassUnsupportedError,
  GenericObjectIdentifierAmbiguousError,
  GenericObjectLocatorInvalidError,
  GenericObjectNotFoundError,
  RelationCardinalityViolationError,
  RelationDirectionAmbiguousError,
  RelationEndpointClassMismatchError,
  RelationIdentifierAmbiguousError,
  RelationMutationUnsupportedError,
  RelationNotFoundError
} from "./errors-generic-associations.js"
import { TagCategoryNotFoundError, TagNotFoundError } from "./errors-labels.js"
import { FunnelNotFoundError, LeadNotFoundError } from "./errors-leads.js"
import { FloorNotFoundError, MeetingMinutesNotFoundError, RoomNotFoundError } from "./errors-love.js"
import {
  ActivityMessageNotFoundError,
  CannotDirectMessageSelfError,
  ChannelNotFoundError,
  DirectMessageIdentifierAmbiguousError,
  DirectMessageNotFoundError,
  MessageNotFoundError,
  PersonNotAnEmployeeError,
  ReactionNotFoundError,
  SavedMessageNotFoundError,
  ThreadReplyNotFoundError
} from "./errors-messaging.js"
import { NotificationContextNotFoundError, NotificationNotFoundError } from "./errors-notifications.js"
import { TodoIdentifierAmbiguousError, TodoNotFoundError, TodoWorkSlotNotFoundError } from "./errors-planner.js"
import {
  ProcessCardIdentifierAmbiguousError,
  ProcessCardNotFoundError,
  ProcessExecutionNotCancellableError,
  ProcessExecutionNotFoundError,
  ProcessIdentifierAmbiguousError,
  ProcessInitialStateNotFoundError,
  ProcessMasterTagAmbiguousError,
  ProcessMasterTagNotFoundError,
  ProcessNotFoundError,
  ProcessParallelExecutionForbiddenError
} from "./errors-processes.js"
import { HulyClassNotFoundError } from "./errors-sdk-discovery.js"
import {
  SpaceIdentifierAmbiguousError,
  SpaceNotFoundError,
  SpaceTypeIdentifierAmbiguousError,
  SpaceTypeNotFoundError
} from "./errors-spaces.js"
import {
  TestCaseNotFoundError,
  TestPlanItemNotFoundError,
  TestPlanNotFoundError,
  TestProjectNotFoundError,
  TestResultNotFoundError,
  TestRunNotFoundError,
  TestSuiteNotFoundError
} from "./errors-test-management.js"
import {
  CommentNotFoundError,
  ComponentNotFoundError,
  InvalidStatusError,
  IssueNotFoundError,
  IssueTemplateNotFoundError,
  MilestoneNotFoundError,
  ProjectNotFoundError,
  TemplateChildNotFoundError
} from "./errors-tracker.js"

export {
  ActivityMessageNotFoundError,
  AssociationConflictError,
  AssociationIdentifierAmbiguousError,
  AssociationInUseError,
  AssociationNotFoundError,
  AssociationSystemClassUnsupportedError,
  AttachmentNotFoundError,
  BYTES_PER_MB,
  CalendarNotAccessibleError,
  CannotDirectMessageSelfError,
  CardNotFoundError,
  CardSpaceNotFoundError,
  ChannelNotFoundError,
  CommentNotFoundError,
  ComponentNotFoundError,
  CustomFieldNotFoundError,
  CustomFieldObjectNotFoundError,
  DirectMessageIdentifierAmbiguousError,
  DirectMessageNotFoundError,
  DocumentContentCorruptedError,
  DocumentEditModeError,
  DocumentEmptyContentError,
  DocumentNotFoundError,
  DocumentReferenceError,
  DocumentTextMultipleMatchesError,
  DocumentTextNotFoundError,
  EventNotFoundError,
  FileFetchError,
  FileNotFoundError,
  FileTooLargeError,
  FileUploadError,
  FloorNotFoundError,
  FunnelNotFoundError,
  GenericObjectIdentifierAmbiguousError,
  GenericObjectLocatorInvalidError,
  GenericObjectNotFoundError,
  HulyAuthError,
  HulyClassNotFoundError,
  HulyConnectionError,
  HulyError,
  InvalidContactProviderError,
  InvalidContentTypeError,
  InvalidFileDataError,
  InvalidPersonUuidError,
  InvalidStatusError,
  IssueNotFoundError,
  IssueTemplateNotFoundError,
  LeadNotFoundError,
  MasterTagNotFoundError,
  MAX_FILE_SIZE,
  MAX_FILE_SIZE_MB,
  MeetingMinutesNotFoundError,
  MessageNotFoundError,
  MilestoneNotFoundError,
  NotificationContextNotFoundError,
  NotificationNotFoundError,
  NoUpdateFieldsError,
  OrganizationIdentifierAmbiguousError,
  OrganizationNotFoundError,
  PersonIdentifierAmbiguousError,
  PersonNotAnEmployeeError,
  PersonNotFoundError,
  ProcessCardIdentifierAmbiguousError,
  ProcessCardNotFoundError,
  ProcessExecutionNotCancellableError,
  ProcessExecutionNotFoundError,
  ProcessIdentifierAmbiguousError,
  ProcessInitialStateNotFoundError,
  ProcessMasterTagAmbiguousError,
  ProcessMasterTagNotFoundError,
  ProcessNotFoundError,
  ProcessParallelExecutionForbiddenError,
  ProjectNotFoundError,
  ReactionNotFoundError,
  RecurringEventNotFoundError,
  RelationCardinalityViolationError,
  RelationDirectionAmbiguousError,
  RelationEndpointClassMismatchError,
  RelationIdentifierAmbiguousError,
  RelationMutationUnsupportedError,
  RelationNotFoundError,
  RoomNotFoundError,
  SavedMessageNotFoundError,
  ScheduleNotFoundError,
  SpaceIdentifierAmbiguousError,
  SpaceNotFoundError,
  SpaceTypeIdentifierAmbiguousError,
  SpaceTypeNotFoundError,
  TagCategoryNotFoundError,
  TagNotFoundError,
  TeamspaceNotFoundError,
  TemplateChildNotFoundError,
  TestCaseNotFoundError,
  TestPlanItemNotFoundError,
  TestPlanNotFoundError,
  TestProjectNotFoundError,
  TestResultNotFoundError,
  TestRunNotFoundError,
  TestSuiteNotFoundError,
  ThreadReplyNotFoundError,
  TodoIdentifierAmbiguousError,
  TodoNotFoundError,
  TodoWorkSlotNotFoundError
}

/**
 * Schema for all Huly domain errors (for serialization).
 */
export const HulyDomainError = Schema.Union(
  HulyError,
  NoUpdateFieldsError,
  HulyConnectionError,
  HulyAuthError,
  IssueNotFoundError,
  ProjectNotFoundError,
  InvalidStatusError,
  PersonIdentifierAmbiguousError,
  PersonNotFoundError,
  OrganizationNotFoundError,
  OrganizationIdentifierAmbiguousError,
  InvalidContactProviderError,
  FileUploadError,
  InvalidFileDataError,
  FileNotFoundError,
  FileFetchError,
  TeamspaceNotFoundError,
  DocumentNotFoundError,
  DocumentTextNotFoundError,
  DocumentTextMultipleMatchesError,
  DocumentEmptyContentError,
  DocumentContentCorruptedError,
  DocumentEditModeError,
  DocumentReferenceError,
  CommentNotFoundError,
  MilestoneNotFoundError,
  ChannelNotFoundError,
  CannotDirectMessageSelfError,
  DirectMessageIdentifierAmbiguousError,
  DirectMessageNotFoundError,
  MessageNotFoundError,
  PersonNotAnEmployeeError,
  ThreadReplyNotFoundError,
  CalendarNotAccessibleError,
  EventNotFoundError,
  RecurringEventNotFoundError,
  ScheduleNotFoundError,
  ActivityMessageNotFoundError,
  ReactionNotFoundError,
  SavedMessageNotFoundError,
  AttachmentNotFoundError,
  CardSpaceNotFoundError,
  CardNotFoundError,
  MasterTagNotFoundError,
  TagNotFoundError,
  TagCategoryNotFoundError,
  TestProjectNotFoundError,
  TestSuiteNotFoundError,
  TestCaseNotFoundError,
  TestPlanNotFoundError,
  TestRunNotFoundError,
  TestResultNotFoundError,
  TestPlanItemNotFoundError,
  ComponentNotFoundError,
  CustomFieldNotFoundError,
  CustomFieldObjectNotFoundError,
  IssueTemplateNotFoundError,
  TemplateChildNotFoundError,
  NotificationNotFoundError,
  NotificationContextNotFoundError,
  InvalidPersonUuidError,
  FunnelNotFoundError,
  LeadNotFoundError,
  FloorNotFoundError,
  RoomNotFoundError,
  MeetingMinutesNotFoundError,
  FileTooLargeError,
  InvalidContentTypeError,
  ProcessNotFoundError,
  ProcessIdentifierAmbiguousError,
  ProcessMasterTagAmbiguousError,
  ProcessMasterTagNotFoundError,
  ProcessCardIdentifierAmbiguousError,
  ProcessCardNotFoundError,
  ProcessInitialStateNotFoundError,
  ProcessParallelExecutionForbiddenError,
  ProcessExecutionNotFoundError,
  ProcessExecutionNotCancellableError,
  AssociationNotFoundError,
  AssociationIdentifierAmbiguousError,
  AssociationSystemClassUnsupportedError,
  AssociationConflictError,
  AssociationInUseError,
  RelationNotFoundError,
  RelationIdentifierAmbiguousError,
  RelationMutationUnsupportedError,
  RelationCardinalityViolationError,
  RelationDirectionAmbiguousError,
  RelationEndpointClassMismatchError,
  GenericObjectIdentifierAmbiguousError,
  GenericObjectLocatorInvalidError,
  GenericObjectNotFoundError,
  HulyClassNotFoundError,
  SpaceNotFoundError,
  SpaceIdentifierAmbiguousError,
  SpaceTypeNotFoundError,
  SpaceTypeIdentifierAmbiguousError,
  TodoNotFoundError,
  TodoIdentifierAmbiguousError,
  TodoWorkSlotNotFoundError
)

/**
 * Union of all Huly domain errors.
 */
export type HulyDomainError = Schema.Schema.Type<typeof HulyDomainError>
