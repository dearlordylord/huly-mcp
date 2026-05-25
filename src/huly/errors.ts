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
 * - errors-cards: card space, card, master tag errors
 * - errors-labels: tag, tag category errors
 * - errors-test-management: test project/suite/case/plan/run/result errors
 * - errors-notifications: notification errors
 *
 * @module
 */
import { Schema } from "effect"

import { HulyAuthError, HulyConnectionError, HulyError } from "./errors-base.js"
import { CalendarNotAccessibleError, EventNotFoundError, RecurringEventNotFoundError } from "./errors-calendar.js"
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
  DocumentEmptyContentError,
  DocumentNotFoundError,
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
  InvalidFileDataError
} from "./errors-files.js"
import {
  AssociationIdentifierAmbiguousError,
  AssociationNotFoundError,
  GenericObjectIdentifierAmbiguousError,
  GenericObjectLocatorInvalidError,
  GenericObjectNotFoundError,
  RelationEndpointClassMismatchError,
  RelationIdentifierAmbiguousError,
  RelationMutationUnsupportedError,
  RelationNotFoundError
} from "./errors-generic-associations.js"
import { TagCategoryNotFoundError, TagNotFoundError } from "./errors-labels.js"
import { FunnelNotFoundError, LeadNotFoundError } from "./errors-leads.js"
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
  AssociationIdentifierAmbiguousError,
  AssociationNotFoundError,
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
  DocumentEmptyContentError,
  DocumentNotFoundError,
  DocumentTextMultipleMatchesError,
  DocumentTextNotFoundError,
  EventNotFoundError,
  FileFetchError,
  FileNotFoundError,
  FileTooLargeError,
  FileUploadError,
  FunnelNotFoundError,
  GenericObjectIdentifierAmbiguousError,
  GenericObjectLocatorInvalidError,
  GenericObjectNotFoundError,
  HulyAuthError,
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
  MessageNotFoundError,
  MilestoneNotFoundError,
  NotificationContextNotFoundError,
  NotificationNotFoundError,
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
  RelationEndpointClassMismatchError,
  RelationIdentifierAmbiguousError,
  RelationMutationUnsupportedError,
  RelationNotFoundError,
  SavedMessageNotFoundError,
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
  ThreadReplyNotFoundError
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
  | PersonIdentifierAmbiguousError
  | PersonNotFoundError
  | OrganizationNotFoundError
  | OrganizationIdentifierAmbiguousError
  | InvalidContactProviderError
  | FileUploadError
  | InvalidFileDataError
  | FileNotFoundError
  | FileFetchError
  | TeamspaceNotFoundError
  | DocumentNotFoundError
  | DocumentTextNotFoundError
  | DocumentTextMultipleMatchesError
  | DocumentEmptyContentError
  | CommentNotFoundError
  | MilestoneNotFoundError
  | ChannelNotFoundError
  | CannotDirectMessageSelfError
  | DirectMessageIdentifierAmbiguousError
  | DirectMessageNotFoundError
  | MessageNotFoundError
  | PersonNotAnEmployeeError
  | ThreadReplyNotFoundError
  | CalendarNotAccessibleError
  | EventNotFoundError
  | RecurringEventNotFoundError
  | ActivityMessageNotFoundError
  | ReactionNotFoundError
  | SavedMessageNotFoundError
  | AttachmentNotFoundError
  | CardSpaceNotFoundError
  | CardNotFoundError
  | MasterTagNotFoundError
  | TagNotFoundError
  | TagCategoryNotFoundError
  | TestProjectNotFoundError
  | TestSuiteNotFoundError
  | TestCaseNotFoundError
  | TestPlanNotFoundError
  | TestRunNotFoundError
  | TestResultNotFoundError
  | TestPlanItemNotFoundError
  | ComponentNotFoundError
  | CustomFieldNotFoundError
  | CustomFieldObjectNotFoundError
  | IssueTemplateNotFoundError
  | TemplateChildNotFoundError
  | NotificationNotFoundError
  | NotificationContextNotFoundError
  | InvalidPersonUuidError
  | FunnelNotFoundError
  | LeadNotFoundError
  | FileTooLargeError
  | InvalidContentTypeError
  | ProcessNotFoundError
  | ProcessIdentifierAmbiguousError
  | ProcessMasterTagAmbiguousError
  | ProcessMasterTagNotFoundError
  | ProcessCardIdentifierAmbiguousError
  | ProcessCardNotFoundError
  | ProcessInitialStateNotFoundError
  | ProcessParallelExecutionForbiddenError
  | ProcessExecutionNotFoundError
  | ProcessExecutionNotCancellableError
  | AssociationNotFoundError
  | AssociationIdentifierAmbiguousError
  | RelationNotFoundError
  | RelationIdentifierAmbiguousError
  | RelationMutationUnsupportedError
  | RelationEndpointClassMismatchError
  | GenericObjectIdentifierAmbiguousError
  | GenericObjectLocatorInvalidError
  | GenericObjectNotFoundError

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
    typeof PersonIdentifierAmbiguousError,
    typeof PersonNotFoundError,
    typeof OrganizationNotFoundError,
    typeof OrganizationIdentifierAmbiguousError,
    typeof InvalidContactProviderError,
    typeof FileUploadError,
    typeof InvalidFileDataError,
    typeof FileNotFoundError,
    typeof FileFetchError,
    typeof TeamspaceNotFoundError,
    typeof DocumentNotFoundError,
    typeof DocumentTextNotFoundError,
    typeof DocumentTextMultipleMatchesError,
    typeof DocumentEmptyContentError,
    typeof CommentNotFoundError,
    typeof MilestoneNotFoundError,
    typeof ChannelNotFoundError,
    typeof CannotDirectMessageSelfError,
    typeof DirectMessageIdentifierAmbiguousError,
    typeof DirectMessageNotFoundError,
    typeof MessageNotFoundError,
    typeof PersonNotAnEmployeeError,
    typeof ThreadReplyNotFoundError,
    typeof CalendarNotAccessibleError,
    typeof EventNotFoundError,
    typeof RecurringEventNotFoundError,
    typeof ActivityMessageNotFoundError,
    typeof ReactionNotFoundError,
    typeof SavedMessageNotFoundError,
    typeof AttachmentNotFoundError,
    typeof CardSpaceNotFoundError,
    typeof CardNotFoundError,
    typeof MasterTagNotFoundError,
    typeof TagNotFoundError,
    typeof TagCategoryNotFoundError,
    typeof TestProjectNotFoundError,
    typeof TestSuiteNotFoundError,
    typeof TestCaseNotFoundError,
    typeof TestPlanNotFoundError,
    typeof TestRunNotFoundError,
    typeof TestResultNotFoundError,
    typeof TestPlanItemNotFoundError,
    typeof ComponentNotFoundError,
    typeof CustomFieldNotFoundError,
    typeof CustomFieldObjectNotFoundError,
    typeof IssueTemplateNotFoundError,
    typeof TemplateChildNotFoundError,
    typeof NotificationNotFoundError,
    typeof NotificationContextNotFoundError,
    typeof InvalidPersonUuidError,
    typeof FunnelNotFoundError,
    typeof LeadNotFoundError,
    typeof FileTooLargeError,
    typeof InvalidContentTypeError,
    typeof ProcessNotFoundError,
    typeof ProcessIdentifierAmbiguousError,
    typeof ProcessMasterTagAmbiguousError,
    typeof ProcessMasterTagNotFoundError,
    typeof ProcessCardIdentifierAmbiguousError,
    typeof ProcessCardNotFoundError,
    typeof ProcessInitialStateNotFoundError,
    typeof ProcessParallelExecutionForbiddenError,
    typeof ProcessExecutionNotFoundError,
    typeof ProcessExecutionNotCancellableError,
    typeof AssociationNotFoundError,
    typeof AssociationIdentifierAmbiguousError,
    typeof RelationNotFoundError,
    typeof RelationIdentifierAmbiguousError,
    typeof RelationMutationUnsupportedError,
    typeof RelationEndpointClassMismatchError,
    typeof GenericObjectIdentifierAmbiguousError,
    typeof GenericObjectLocatorInvalidError,
    typeof GenericObjectNotFoundError
  ]
> = Schema.Union(
  HulyError,
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
  RelationNotFoundError,
  RelationIdentifierAmbiguousError,
  RelationMutationUnsupportedError,
  RelationEndpointClassMismatchError,
  GenericObjectIdentifierAmbiguousError,
  GenericObjectLocatorInvalidError,
  GenericObjectNotFoundError
)
