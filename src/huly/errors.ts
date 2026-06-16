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
import { HulyAuthError, HulyConnectionError, HulyError, NoUpdateFieldsError } from "./errors-base.js"
import {
  CalendarNotAccessibleError,
  EventNotFoundError,
  RecurringEventNotFoundError,
  ScheduleNotFoundError
} from "./errors-calendar.js"
import { CardNotFoundError, CardSpaceNotFoundError, MasterTagNotFoundError } from "./errors-cards.js"
import {
  ContactChannelConflictError,
  ContactChannelIdentifierAmbiguousError,
  ContactChannelNotFoundError,
  InvalidContactChannelLocatorError,
  InvalidContactChannelValueError,
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
  HulyDomainError as HulyDomainErrorSchema,
  type HulyDomainError as HulyDomainErrorUnion
} from "./errors-domain.js"
import {
  DriveFileCommentNotFoundError,
  DriveFileNotFoundError,
  DriveFileVersionNotFoundError,
  DriveFolderNotEmptyError,
  DriveIdentifierAmbiguousError,
  DriveInvalidItemOperationError,
  DriveInvalidMoveError,
  DriveNotEmptyError,
  DriveNotFoundError,
  DriveParentNotFolderError,
  DrivePathAmbiguousError,
  DrivePathConflictError,
  DrivePathNotFoundError
} from "./errors-drive.js"
import {
  AttachmentNotFoundError,
  BYTES_PER_MB,
  DrawingNotFoundError,
  FileFetchError,
  FileNotFoundError,
  FileTooLargeError,
  FileUploadError,
  InvalidContentTypeError,
  InvalidFileDataError,
  MAX_FILE_SIZE,
  MAX_FILE_SIZE_MB,
  SavedAttachmentNotFoundError
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
import {
  InventoryCategoryIdentifierAmbiguousError,
  InventoryCategoryNotFoundError,
  InventoryConflictError,
  InventoryMutationUnsupportedError,
  InventoryNotEmptyError,
  InventoryProductCommentNotFoundError,
  InventoryProductIdentifierAmbiguousError,
  InventoryProductNotFoundError,
  InventoryVariantIdentifierAmbiguousError,
  InventoryVariantNotFoundError
} from "./errors-inventory.js"
import { TagCategoryNotFoundError, TagNotFoundError } from "./errors-labels.js"
import { FunnelNotFoundError, LeadNotFoundError } from "./errors-leads.js"
import { FloorNotFoundError, MeetingMinutesNotFoundError, RoomNotFoundError } from "./errors-love.js"
import {
  ActivityMessageNotFoundError,
  CannotDirectMessageSelfError,
  ChannelArchivedError,
  ChannelLastMemberRemovalError,
  ChannelLastOwnerRemovalError,
  ChannelNotFoundError,
  DirectMessageIdentifierAmbiguousError,
  DirectMessageNotFoundError,
  DirectMessageParticipantCountError,
  MessageNotFoundError,
  PersonNotAnEmployeeError,
  ReactionNotFoundError,
  SavedMessageNotFoundError,
  ThreadReplyNotFoundError
} from "./errors-messaging.js"
import {
  NotificationContextNotFoundError,
  NotificationNotFoundError,
  NotificationPersonSpaceNotFoundError,
  NotificationProviderNotConfigurableError,
  NotificationTypeNotFoundError
} from "./errors-notifications.js"
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
import {
  RecruitingApplicantIdentifierAmbiguousError,
  RecruitingApplicantMatchNotFoundError,
  RecruitingApplicantNotFoundError,
  RecruitingCandidateNotFoundError,
  RecruitingDuplicateApplicantError,
  RecruitingModelMissingError,
  RecruitingMutationUnsupportedError,
  RecruitingOpinionIdentifierAmbiguousError,
  RecruitingOpinionNotFoundError,
  RecruitingReviewIdentifierAmbiguousError,
  RecruitingReviewNotFoundError,
  RecruitingVacancyIdentifierAmbiguousError,
  RecruitingVacancyNotFoundError,
  RecruitingVacancyTypeNotFoundError
} from "./errors-recruiting.js"
import { HulyClassNotFoundError } from "./errors-sdk-discovery.js"
import {
  SpaceIdentifierAmbiguousError,
  SpaceNotFoundError,
  SpaceNotTypedError,
  SpaceRoleAssignmentsMalformedError,
  SpaceRoleIdentifierAmbiguousError,
  SpaceRoleNotFoundError,
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

export const HulyDomainError = HulyDomainErrorSchema
export type HulyDomainError = HulyDomainErrorUnion

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
  ChannelArchivedError,
  ChannelLastMemberRemovalError,
  ChannelLastOwnerRemovalError,
  ChannelNotFoundError,
  CommentNotFoundError,
  ComponentNotFoundError,
  ContactChannelConflictError,
  ContactChannelIdentifierAmbiguousError,
  ContactChannelNotFoundError,
  CustomFieldNotFoundError,
  CustomFieldObjectNotFoundError,
  DirectMessageIdentifierAmbiguousError,
  DirectMessageNotFoundError,
  DirectMessageParticipantCountError,
  DocumentContentCorruptedError,
  DocumentEditModeError,
  DocumentEmptyContentError,
  DocumentNotFoundError,
  DocumentReferenceError,
  DocumentTextMultipleMatchesError,
  DocumentTextNotFoundError,
  DrawingNotFoundError,
  DriveFileCommentNotFoundError,
  DriveFileNotFoundError,
  DriveFileVersionNotFoundError,
  DriveFolderNotEmptyError,
  DriveIdentifierAmbiguousError,
  DriveInvalidItemOperationError,
  DriveInvalidMoveError,
  DriveNotEmptyError,
  DriveNotFoundError,
  DriveParentNotFolderError,
  DrivePathAmbiguousError,
  DrivePathConflictError,
  DrivePathNotFoundError,
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
  InvalidContactChannelLocatorError,
  InvalidContactChannelValueError,
  InvalidContactProviderError,
  InvalidContentTypeError,
  InvalidFileDataError,
  InvalidPersonUuidError,
  InvalidStatusError,
  InventoryCategoryIdentifierAmbiguousError,
  InventoryCategoryNotFoundError,
  InventoryConflictError,
  InventoryMutationUnsupportedError,
  InventoryNotEmptyError,
  InventoryProductCommentNotFoundError,
  InventoryProductIdentifierAmbiguousError,
  InventoryProductNotFoundError,
  InventoryVariantIdentifierAmbiguousError,
  InventoryVariantNotFoundError,
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
  NotificationPersonSpaceNotFoundError,
  NotificationProviderNotConfigurableError,
  NotificationTypeNotFoundError,
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
  RecruitingApplicantIdentifierAmbiguousError,
  RecruitingApplicantMatchNotFoundError,
  RecruitingApplicantNotFoundError,
  RecruitingCandidateNotFoundError,
  RecruitingDuplicateApplicantError,
  RecruitingModelMissingError,
  RecruitingMutationUnsupportedError,
  RecruitingOpinionIdentifierAmbiguousError,
  RecruitingOpinionNotFoundError,
  RecruitingReviewIdentifierAmbiguousError,
  RecruitingReviewNotFoundError,
  RecruitingVacancyIdentifierAmbiguousError,
  RecruitingVacancyNotFoundError,
  RecruitingVacancyTypeNotFoundError,
  RecurringEventNotFoundError,
  RelationCardinalityViolationError,
  RelationDirectionAmbiguousError,
  RelationEndpointClassMismatchError,
  RelationIdentifierAmbiguousError,
  RelationMutationUnsupportedError,
  RelationNotFoundError,
  RoomNotFoundError,
  SavedAttachmentNotFoundError,
  SavedMessageNotFoundError,
  ScheduleNotFoundError,
  SpaceIdentifierAmbiguousError,
  SpaceNotFoundError,
  SpaceNotTypedError,
  SpaceRoleAssignmentsMalformedError,
  SpaceRoleIdentifierAmbiguousError,
  SpaceRoleNotFoundError,
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
