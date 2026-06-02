import { JSONSchema, Schema } from "effect"

export const MAX_LIMIT = 200

export const NonEmptyString = Schema.Trim.pipe(Schema.nonEmptyString())
export type NonEmptyString = Schema.Schema.Type<typeof NonEmptyString>

export const Timestamp = Schema.NonNegativeInt.annotations({
  identifier: "Timestamp",
  title: "Timestamp",
  description: "Unix timestamp in milliseconds (non-negative integer)"
})
export type Timestamp = Schema.Schema.Type<typeof Timestamp>

export const LimitParam = Schema.Number.pipe(
  Schema.int(),
  Schema.positive(),
  Schema.lessThanOrEqualTo(MAX_LIMIT)
)

export const EmptyParamsSchema = Schema.Struct({}).annotations({
  jsonSchema: { type: "object", properties: {}, additionalProperties: false }
})

export const emptyParamsJsonSchema = JSONSchema.make(EmptyParamsSchema)

export const enumValuesDescription = (values: ReadonlyArray<string>): string => values.join(", ")

export const hasAtLeastOneDefined = <K extends string>(
  params: { readonly [P in K]?: unknown },
  fields: ReadonlyArray<K>
): boolean => fields.some((field) => params[field] !== undefined)

export const atLeastOneUpdateFieldMessage = (fields: ReadonlyArray<string>): string =>
  `At least one update field must be provided: ${fields.join(", ")}.`

export const withAtLeastOneRequired = <K extends string>(
  schema: object,
  fields: ReadonlyArray<K>
): object => ({
  ...schema,
  anyOf: fields.map((field) => ({ required: [field] }))
})

// === Tier 1: Huly Internal Refs (opaque IDs from _id) ===

export const DocId = NonEmptyString.pipe(Schema.brand("DocId"))
export type DocId = Schema.Schema.Type<typeof DocId>

const HulyRef = <T extends string>(tag: T) => DocId.pipe(Schema.brand(tag))

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

export const AttachmentId = HulyRef("AttachmentId")
export type AttachmentId = Schema.Schema.Type<typeof AttachmentId>

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

export const TodoId = HulyRef("TodoId")
export type TodoId = Schema.Schema.Type<typeof TodoId>

export const SpaceId = HulyRef("SpaceId")
export type SpaceId = Schema.Schema.Type<typeof SpaceId>

export const CommentId = HulyRef("CommentId")
export type CommentId = Schema.Schema.Type<typeof CommentId>

export const TimeSpendReportId = HulyRef("TimeSpendReportId")
export type TimeSpendReportId = Schema.Schema.Type<typeof TimeSpendReportId>

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

// === Tier 2: Human-Readable Identifiers ===

export const ProjectIdentifier = NonEmptyString.pipe(Schema.brand("ProjectIdentifier"))
export type ProjectIdentifier = Schema.Schema.Type<typeof ProjectIdentifier>

export const IssueIdentifier = NonEmptyString.pipe(Schema.brand("IssueIdentifier"))
export type IssueIdentifier = Schema.Schema.Type<typeof IssueIdentifier>

// === Tier 3: Constrained String Domains ===

export const Email = Schema.NonEmptyString.pipe(
  Schema.pattern(/^[^@]+@[^@]+$/, {
    message: () => "must contain exactly one @"
  }),
  Schema.brand("Email")
)
export type Email = Schema.Schema.Type<typeof Email>

export const StatusName = NonEmptyString.annotations({
  description:
    "Exact workflow status display name from the target project. Status names are workspace data, not a fixed enum; call list_statuses or get_project_type to discover valid values."
}).pipe(Schema.brand("StatusName"))
export type StatusName = Schema.Schema.Type<typeof StatusName>

export const PersonName = NonEmptyString.pipe(Schema.brand("PersonName"))
export type PersonName = Schema.Schema.Type<typeof PersonName>

/**
 * Input schema for any field that accepts either an email address or a display
 * name as a person reference. Email validation stays strict for fields where
 * only an email makes sense (account creation, social-id lookups). Named
 * `*Input` to distinguish from the existing PersonRef output struct in
 * domain/schemas/issues.ts.
 */
export const PersonRefInput = Schema.Union(Email, PersonName)
export type PersonRefInput = Schema.Schema.Type<typeof PersonRefInput>

export const ComponentLabel = NonEmptyString.pipe(Schema.brand("ComponentLabel"))
export type ComponentLabel = Schema.Schema.Type<typeof ComponentLabel>

export const MilestoneLabel = NonEmptyString.pipe(Schema.brand("MilestoneLabel"))
export type MilestoneLabel = Schema.Schema.Type<typeof MilestoneLabel>

export const ChannelName = NonEmptyString.pipe(Schema.brand("ChannelName"))
export type ChannelName = Schema.Schema.Type<typeof ChannelName>

export const MimeType = NonEmptyString.pipe(Schema.brand("MimeType"))
export type MimeType = Schema.Schema.Type<typeof MimeType>

export const ObjectClassName = NonEmptyString.pipe(Schema.brand("ObjectClassName"))
export type ObjectClassName = Schema.Schema.Type<typeof ObjectClassName>

export const EmojiCode = NonEmptyString.pipe(Schema.brand("EmojiCode"))
export type EmojiCode = Schema.Schema.Type<typeof EmojiCode>

export const ContactProvider = NonEmptyString.pipe(Schema.brand("ContactProvider"))
export type ContactProvider = Schema.Schema.Type<typeof ContactProvider>

export const NotificationProviderId = NonEmptyString.pipe(Schema.brand("NotificationProviderId"))
export type NotificationProviderId = Schema.Schema.Type<typeof NotificationProviderId>

export const NotificationTypeId = NonEmptyString.pipe(Schema.brand("NotificationTypeId"))
export type NotificationTypeId = Schema.Schema.Type<typeof NotificationTypeId>

export const WorkspaceName = NonEmptyString.pipe(Schema.brand("WorkspaceName"))
export type WorkspaceName = Schema.Schema.Type<typeof WorkspaceName>

export const UrlString = NonEmptyString.pipe(Schema.brand("UrlString"))
export type UrlString = Schema.Schema.Type<typeof UrlString>

export const WorkspaceUrlSlug = NonEmptyString.pipe(Schema.brand("WorkspaceUrlSlug"))
export type WorkspaceUrlSlug = Schema.Schema.Type<typeof WorkspaceUrlSlug>

export const WorkspaceVersion = NonEmptyString.pipe(Schema.brand("WorkspaceVersion"))
export type WorkspaceVersion = Schema.Schema.Type<typeof WorkspaceVersion>

export const WorkspaceMode = NonEmptyString.pipe(Schema.brand("WorkspaceMode"))
export type WorkspaceMode = Schema.Schema.Type<typeof WorkspaceMode>

// === Tier 4: Workspace/Account Identifiers ===

export const WorkspaceUuid = NonEmptyString.pipe(Schema.brand("WorkspaceUuid"))
export type WorkspaceUuid = Schema.Schema.Type<typeof WorkspaceUuid>

export const PersonUuid = NonEmptyString.pipe(Schema.brand("PersonUuid"))
export type PersonUuid = Schema.Schema.Type<typeof PersonUuid>

export const AccountId = NonEmptyString.pipe(Schema.brand("AccountId"))
export type AccountId = Schema.Schema.Type<typeof AccountId>

export const AccountUuid = Schema.String.pipe(Schema.brand("AccountUuid"))
export type AccountUuid = Schema.Schema.Type<typeof AccountUuid>

export const RegionId = Schema.String.pipe(Schema.brand("RegionId"))
export type RegionId = Schema.Schema.Type<typeof RegionId>

// === Tier 5: Numeric Brands ===

export const NonNegativeNumber = Schema.Number.pipe(Schema.nonNegative(), Schema.brand("NonNegativeNumber"))
export type NonNegativeNumber = Schema.Schema.Type<typeof NonNegativeNumber>

export const PositiveNumber = NonNegativeNumber.pipe(Schema.positive(), Schema.brand("PositiveNumber"))
export type PositiveNumber = Schema.Schema.Type<typeof PositiveNumber>

export const ColorCode = Schema.Number.pipe(
  Schema.int(),
  Schema.greaterThanOrEqualTo(0),
  Schema.brand("ColorCode")
).annotations({
  title: "ColorCode",
  description: "Non-negative Huly platform color index. Huly SDK stores tag colors as numbers."
})
export type ColorCode = Schema.Schema.Type<typeof ColorCode>

// === Tier 6: Dual-Semantic Lookup Types ===

export const ComponentIdentifier = NonEmptyString.pipe(Schema.brand("ComponentIdentifier"))
export type ComponentIdentifier = Schema.Schema.Type<typeof ComponentIdentifier>

export const MilestoneIdentifier = NonEmptyString.pipe(Schema.brand("MilestoneIdentifier"))
export type MilestoneIdentifier = Schema.Schema.Type<typeof MilestoneIdentifier>

export const TemplateIdentifier = NonEmptyString.pipe(Schema.brand("TemplateIdentifier"))
export type TemplateIdentifier = Schema.Schema.Type<typeof TemplateIdentifier>

export const ChannelIdentifier = NonEmptyString.pipe(Schema.brand("ChannelIdentifier"))
export type ChannelIdentifier = Schema.Schema.Type<typeof ChannelIdentifier>

/**
 * Identifier for a direct-message conversation. Accepts either:
 * - the DM `_id` (e.g. `69fe02a3671a9bf783dc94fb`), or
 * - a participant display name (e.g. `Kerr,Shannon`) — resolves to the
 *   one-to-one DM that has both the authenticated account and the named
 *   participant.
 */
export const DirectMessageIdentifier = NonEmptyString.pipe(Schema.brand("DirectMessageIdentifier"))
export type DirectMessageIdentifier = Schema.Schema.Type<typeof DirectMessageIdentifier>

export const TeamspaceIdentifier = NonEmptyString.pipe(Schema.brand("TeamspaceIdentifier"))
export type TeamspaceIdentifier = Schema.Schema.Type<typeof TeamspaceIdentifier>

export const CardIdentifier = NonEmptyString.pipe(Schema.brand("CardIdentifier"))
export type CardIdentifier = Schema.Schema.Type<typeof CardIdentifier>

export const CardSpaceIdentifier = NonEmptyString.pipe(Schema.brand("CardSpaceIdentifier"))
export type CardSpaceIdentifier = Schema.Schema.Type<typeof CardSpaceIdentifier>

export const DocumentIdentifier = NonEmptyString.pipe(Schema.brand("DocumentIdentifier"))
export type DocumentIdentifier = Schema.Schema.Type<typeof DocumentIdentifier>

export const MasterTagIdentifier = NonEmptyString.pipe(Schema.brand("MasterTagIdentifier"))
export type MasterTagIdentifier = Schema.Schema.Type<typeof MasterTagIdentifier>

export const TagIdentifier = NonEmptyString.pipe(Schema.brand("TagIdentifier"))
export type TagIdentifier = Schema.Schema.Type<typeof TagIdentifier>

export const TagCategoryIdentifier = NonEmptyString.pipe(Schema.brand("TagCategoryIdentifier"))
export type TagCategoryIdentifier = Schema.Schema.Type<typeof TagCategoryIdentifier>

export const MemberReference = NonEmptyString.pipe(Schema.brand("MemberReference"))
export type MemberReference = Schema.Schema.Type<typeof MemberReference>

export const TestProjectIdentifier = NonEmptyString.pipe(Schema.brand("TestProjectIdentifier"))
export type TestProjectIdentifier = Schema.Schema.Type<typeof TestProjectIdentifier>

export const TestSuiteIdentifier = NonEmptyString.pipe(Schema.brand("TestSuiteIdentifier"))
export type TestSuiteIdentifier = Schema.Schema.Type<typeof TestSuiteIdentifier>

export const TestCaseIdentifier = NonEmptyString.pipe(Schema.brand("TestCaseIdentifier"))
export type TestCaseIdentifier = Schema.Schema.Type<typeof TestCaseIdentifier>

export const TestPlanIdentifier = NonEmptyString.pipe(Schema.brand("TestPlanIdentifier"))
export type TestPlanIdentifier = Schema.Schema.Type<typeof TestPlanIdentifier>

export const TestRunIdentifier = NonEmptyString.pipe(Schema.brand("TestRunIdentifier"))
export type TestRunIdentifier = Schema.Schema.Type<typeof TestRunIdentifier>

export const TestResultIdentifier = NonEmptyString.pipe(Schema.brand("TestResultIdentifier"))
export type TestResultIdentifier = Schema.Schema.Type<typeof TestResultIdentifier>
