import { Schema } from "effect"
import { NonEmptyString } from "./shared-base.js"

export const DocId = NonEmptyString.pipe(Schema.brand("DocId"))
export type DocId = Schema.Schema.Type<typeof DocId>

const HulyRef = <T extends string>(tag: T & Parameters<typeof Schema.brand<T>>[0]) => DocId.pipe(Schema.brand<T>(tag))

export const PersonId = HulyRef("PersonId")
export type PersonId = Schema.Schema.Type<typeof PersonId>

export const OrganizationId = HulyRef("OrganizationId")
export type OrganizationId = Schema.Schema.Type<typeof OrganizationId>

export const IssueId = HulyRef("IssueId")
export type IssueId = Schema.Schema.Type<typeof IssueId>

export const AssociationId = HulyRef("AssociationId")
export type AssociationId = Schema.Schema.Type<typeof AssociationId>

export const RelationId = HulyRef("RelationId")
export type RelationId = Schema.Schema.Type<typeof RelationId>

export const ComponentId = HulyRef("ComponentId")
export type ComponentId = Schema.Schema.Type<typeof ComponentId>

export const MilestoneId = HulyRef("MilestoneId")
export type MilestoneId = Schema.Schema.Type<typeof MilestoneId>

export const IssueTemplateId = HulyRef("IssueTemplateId")
export type IssueTemplateId = Schema.Schema.Type<typeof IssueTemplateId>

export const IssueTemplateChildId = HulyRef("IssueTemplateChildId")
export type IssueTemplateChildId = Schema.Schema.Type<typeof IssueTemplateChildId>

export const ProjectTypeId = HulyRef("ProjectTypeId")
export type ProjectTypeId = Schema.Schema.Type<typeof ProjectTypeId>

export const TaskTypeId = HulyRef("TaskTypeId")
export type TaskTypeId = Schema.Schema.Type<typeof TaskTypeId>

export const IssueStatusId = HulyRef("IssueStatusId")
export type IssueStatusId = Schema.Schema.Type<typeof IssueStatusId>

export const WorkflowStatusId = HulyRef("WorkflowStatusId")
export type WorkflowStatusId = Schema.Schema.Type<typeof WorkflowStatusId>

export const StatusCategoryId = HulyRef("StatusCategoryId")
export type StatusCategoryId = Schema.Schema.Type<typeof StatusCategoryId>

export const ChannelId = HulyRef("ChannelId")
export type ChannelId = Schema.Schema.Type<typeof ChannelId>

export const MessageId = HulyRef("MessageId")
export type MessageId = Schema.Schema.Type<typeof MessageId>

export const ThreadReplyId = HulyRef("ThreadReplyId")
export type ThreadReplyId = Schema.Schema.Type<typeof ThreadReplyId>

export const ActivityMessageId = HulyRef("ActivityMessageId")
export type ActivityMessageId = Schema.Schema.Type<typeof ActivityMessageId>

export const ReactionId = HulyRef("ReactionId")
export type ReactionId = Schema.Schema.Type<typeof ReactionId>

export const SavedMessageId = HulyRef("SavedMessageId")
export type SavedMessageId = Schema.Schema.Type<typeof SavedMessageId>

export const MentionId = HulyRef("MentionId")
export type MentionId = Schema.Schema.Type<typeof MentionId>

export const ActivityReferenceId = HulyRef("ActivityReferenceId")
export type ActivityReferenceId = Schema.Schema.Type<typeof ActivityReferenceId>

export const ActivityFilterId = HulyRef("ActivityFilterId")
export type ActivityFilterId = Schema.Schema.Type<typeof ActivityFilterId>

export const AttachmentId = HulyRef("AttachmentId")
export type AttachmentId = Schema.Schema.Type<typeof AttachmentId>

export const SavedAttachmentId = HulyRef("SavedAttachmentId")
export type SavedAttachmentId = Schema.Schema.Type<typeof SavedAttachmentId>

export const DrawingId = HulyRef("DrawingId")
export type DrawingId = Schema.Schema.Type<typeof DrawingId>

export const BlobId = HulyRef("BlobId")
export type BlobId = Schema.Schema.Type<typeof BlobId>

export const CardId = HulyRef("CardId")
export type CardId = Schema.Schema.Type<typeof CardId>

export const CardSpaceId = HulyRef("CardSpaceId")
export type CardSpaceId = Schema.Schema.Type<typeof CardSpaceId>

export const DocumentId = HulyRef("DocumentId")
export type DocumentId = Schema.Schema.Type<typeof DocumentId>

export const MasterTagId = HulyRef("MasterTagId")
export type MasterTagId = Schema.Schema.Type<typeof MasterTagId>

export const TeamspaceId = HulyRef("TeamspaceId")
export type TeamspaceId = Schema.Schema.Type<typeof TeamspaceId>

export const NotificationId = HulyRef("NotificationId")
export type NotificationId = Schema.Schema.Type<typeof NotificationId>

export const NotificationContextId = HulyRef("NotificationContextId")
export type NotificationContextId = Schema.Schema.Type<typeof NotificationContextId>

export const EventId = HulyRef("EventId")
export type EventId = Schema.Schema.Type<typeof EventId>

export const CalendarId = HulyRef("CalendarId")
export type CalendarId = Schema.Schema.Type<typeof CalendarId>

export const ScheduleId = HulyRef("ScheduleId")
export type ScheduleId = Schema.Schema.Type<typeof ScheduleId>

export const FloorId = HulyRef("FloorId")
export type FloorId = Schema.Schema.Type<typeof FloorId>

export const RoomId = HulyRef("RoomId")
export type RoomId = Schema.Schema.Type<typeof RoomId>

export const MeetingMinutesId = HulyRef("MeetingMinutesId")
export type MeetingMinutesId = Schema.Schema.Type<typeof MeetingMinutesId>

export const DevicePreferenceId = HulyRef("DevicePreferenceId")
export type DevicePreferenceId = Schema.Schema.Type<typeof DevicePreferenceId>

export const TodoId = HulyRef("TodoId")
export type TodoId = Schema.Schema.Type<typeof TodoId>

export const SpaceId = HulyRef("SpaceId")
export type SpaceId = Schema.Schema.Type<typeof SpaceId>

export const SpaceTypeId = HulyRef("SpaceTypeId")
export type SpaceTypeId = Schema.Schema.Type<typeof SpaceTypeId>

export const RoleId = HulyRef("RoleId")
export type RoleId = Schema.Schema.Type<typeof RoleId>

export const PermissionId = HulyRef("PermissionId")
export type PermissionId = Schema.Schema.Type<typeof PermissionId>

export const CommentId = HulyRef("CommentId")
export type CommentId = Schema.Schema.Type<typeof CommentId>

export const TimeSpendReportId = HulyRef("TimeSpendReportId")
export type TimeSpendReportId = Schema.Schema.Type<typeof TimeSpendReportId>

export const ParticipantInfoId = HulyRef("ParticipantInfoId")
export type ParticipantInfoId = Schema.Schema.Type<typeof ParticipantInfoId>

export const TagElementId = HulyRef("TagElementId")
export type TagElementId = Schema.Schema.Type<typeof TagElementId>

export const TagReferenceId = HulyRef("TagReferenceId")
export type TagReferenceId = Schema.Schema.Type<typeof TagReferenceId>

export const TagCategoryId = HulyRef("TagCategoryId")
export type TagCategoryId = Schema.Schema.Type<typeof TagCategoryId>

export const WorkSlotId = HulyRef("WorkSlotId")
export type WorkSlotId = Schema.Schema.Type<typeof WorkSlotId>

export const CustomFieldId = HulyRef("CustomFieldId")
export type CustomFieldId = Schema.Schema.Type<typeof CustomFieldId>

export const HulyAttributeId = HulyRef("HulyAttributeId")
export type HulyAttributeId = Schema.Schema.Type<typeof HulyAttributeId>

export const HulyEnumId = HulyRef("HulyEnumId")
export type HulyEnumId = Schema.Schema.Type<typeof HulyEnumId>

export const TestProjectId = HulyRef("TestProjectId")
export type TestProjectId = Schema.Schema.Type<typeof TestProjectId>

export const TestSuiteId = HulyRef("TestSuiteId")
export type TestSuiteId = Schema.Schema.Type<typeof TestSuiteId>

export const TestCaseId = HulyRef("TestCaseId")
export type TestCaseId = Schema.Schema.Type<typeof TestCaseId>

export const TestPlanId = HulyRef("TestPlanId")
export type TestPlanId = Schema.Schema.Type<typeof TestPlanId>

export const TestPlanItemId = HulyRef("TestPlanItemId")
export type TestPlanItemId = Schema.Schema.Type<typeof TestPlanItemId>

export const TestRunId = HulyRef("TestRunId")
export type TestRunId = Schema.Schema.Type<typeof TestRunId>

export const TestResultId = HulyRef("TestResultId")
export type TestResultId = Schema.Schema.Type<typeof TestResultId>

export const InventoryCategoryId = HulyRef("InventoryCategoryId")
export type InventoryCategoryId = Schema.Schema.Type<typeof InventoryCategoryId>

export const InventoryProductId = HulyRef("InventoryProductId")
export type InventoryProductId = Schema.Schema.Type<typeof InventoryProductId>

export const InventoryVariantId = HulyRef("InventoryVariantId")
export type InventoryVariantId = Schema.Schema.Type<typeof InventoryVariantId>

export const NotificationTypeSettingId = HulyRef("NotificationTypeSettingId")
export type NotificationTypeSettingId = Schema.Schema.Type<typeof NotificationTypeSettingId>

export const CollaboratorId = HulyRef("CollaboratorId")
export type CollaboratorId = Schema.Schema.Type<typeof CollaboratorId>
