import { JSONSchema, Schema } from "effect"

export const NonEmptyString = Schema.Trim.pipe(Schema.nonEmptyString())

export const Timestamp = Schema.NonNegativeInt.annotations({
  identifier: "Timestamp",
  title: "Timestamp",
  description: "Unix timestamp in milliseconds (non-negative integer)"
})

export const LimitParam = Schema.Number.pipe(
  Schema.int(),
  Schema.positive(),
  Schema.lessThanOrEqualTo(200)
)

export const makeJsonSchema = <A, I, R>(
  schema: Schema.Schema<A, I, R>
): ReturnType<typeof JSONSchema.make> => JSONSchema.make(schema)

export const EmptyParamsSchema = Schema.Struct({}).annotations({
  jsonSchema: { type: "object", properties: {}, additionalProperties: false }
})

export const emptyParamsJsonSchema = makeJsonSchema(EmptyParamsSchema)

// === Tier 1: Huly Internal Refs (opaque IDs from _id) ===

const HulyRef = <T extends string>(tag: T) => NonEmptyString.pipe(Schema.brand(tag))

export const PersonId = HulyRef("PersonId")
export type PersonId = Schema.Schema.Type<typeof PersonId>

export const OrganizationId = HulyRef("OrganizationId")
export type OrganizationId = Schema.Schema.Type<typeof OrganizationId>

export const IssueId = HulyRef("IssueId")
export type IssueId = Schema.Schema.Type<typeof IssueId>

export const ComponentId = HulyRef("ComponentId")
export type ComponentId = Schema.Schema.Type<typeof ComponentId>

export const MilestoneId = HulyRef("MilestoneId")
export type MilestoneId = Schema.Schema.Type<typeof MilestoneId>

export const IssueTemplateId = HulyRef("IssueTemplateId")
export type IssueTemplateId = Schema.Schema.Type<typeof IssueTemplateId>

export const ChannelId = HulyRef("ChannelId")
export type ChannelId = Schema.Schema.Type<typeof ChannelId>

export const MessageId = HulyRef("MessageId")
export type MessageId = Schema.Schema.Type<typeof MessageId>

export const ThreadReplyId = HulyRef("ThreadReplyId")
export type ThreadReplyId = Schema.Schema.Type<typeof ThreadReplyId>

export const ActivityMessageId = HulyRef("ActivityMessageId")
export type ActivityMessageId = Schema.Schema.Type<typeof ActivityMessageId>

export const AttachmentId = HulyRef("AttachmentId")
export type AttachmentId = Schema.Schema.Type<typeof AttachmentId>

export const BlobId = HulyRef("BlobId")
export type BlobId = Schema.Schema.Type<typeof BlobId>

export const DocumentId = HulyRef("DocumentId")
export type DocumentId = Schema.Schema.Type<typeof DocumentId>

export const TeamspaceId = HulyRef("TeamspaceId")
export type TeamspaceId = Schema.Schema.Type<typeof TeamspaceId>

export const NotificationId = HulyRef("NotificationId")
export type NotificationId = Schema.Schema.Type<typeof NotificationId>

export const NotificationContextId = HulyRef("NotificationContextId")
export type NotificationContextId = Schema.Schema.Type<typeof NotificationContextId>

export const EventId = HulyRef("EventId")
export type EventId = Schema.Schema.Type<typeof EventId>

export const TodoId = HulyRef("TodoId")
export type TodoId = Schema.Schema.Type<typeof TodoId>

export const SpaceId = HulyRef("SpaceId")
export type SpaceId = Schema.Schema.Type<typeof SpaceId>

export const CommentId = HulyRef("CommentId")
export type CommentId = Schema.Schema.Type<typeof CommentId>

export const TimeSpendReportId = HulyRef("TimeSpendReportId")
export type TimeSpendReportId = Schema.Schema.Type<typeof TimeSpendReportId>

// === Tier 2: Human-Readable Identifiers ===

export const ProjectIdentifier = NonEmptyString.pipe(Schema.brand("ProjectIdentifier"))
export type ProjectIdentifier = Schema.Schema.Type<typeof ProjectIdentifier>

export const IssueIdentifier = NonEmptyString.pipe(Schema.brand("IssueIdentifier"))
export type IssueIdentifier = Schema.Schema.Type<typeof IssueIdentifier>

// === Tier 3: Constrained String Domains ===

export const Email = Schema.String.pipe(Schema.brand("Email"))
export type Email = Schema.Schema.Type<typeof Email>

export const StatusName = Schema.String.pipe(Schema.brand("StatusName"))
export type StatusName = Schema.Schema.Type<typeof StatusName>

export const PersonName = Schema.String.pipe(Schema.brand("PersonName"))
export type PersonName = Schema.Schema.Type<typeof PersonName>

export const ComponentLabel = Schema.String.pipe(Schema.brand("ComponentLabel"))
export type ComponentLabel = Schema.Schema.Type<typeof ComponentLabel>

export const MilestoneLabel = Schema.String.pipe(Schema.brand("MilestoneLabel"))
export type MilestoneLabel = Schema.Schema.Type<typeof MilestoneLabel>

export const ChannelName = Schema.String.pipe(Schema.brand("ChannelName"))
export type ChannelName = Schema.Schema.Type<typeof ChannelName>

export const MimeType = NonEmptyString.pipe(Schema.brand("MimeType"))
export type MimeType = Schema.Schema.Type<typeof MimeType>

export const ObjectClassName = NonEmptyString.pipe(Schema.brand("ObjectClassName"))
export type ObjectClassName = Schema.Schema.Type<typeof ObjectClassName>

export const EmojiCode = NonEmptyString.pipe(Schema.brand("EmojiCode"))
export type EmojiCode = Schema.Schema.Type<typeof EmojiCode>

export const ContactProvider = Schema.String.pipe(Schema.brand("ContactProvider"))
export type ContactProvider = Schema.Schema.Type<typeof ContactProvider>

export const NotificationProviderId = NonEmptyString.pipe(Schema.brand("NotificationProviderId"))
export type NotificationProviderId = Schema.Schema.Type<typeof NotificationProviderId>

export const NotificationTypeId = NonEmptyString.pipe(Schema.brand("NotificationTypeId"))
export type NotificationTypeId = Schema.Schema.Type<typeof NotificationTypeId>

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
  Schema.lessThanOrEqualTo(9),
  Schema.brand("ColorCode")
)
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

export const TeamspaceIdentifier = NonEmptyString.pipe(Schema.brand("TeamspaceIdentifier"))
export type TeamspaceIdentifier = Schema.Schema.Type<typeof TeamspaceIdentifier>

export const DocumentIdentifier = NonEmptyString.pipe(Schema.brand("DocumentIdentifier"))
export type DocumentIdentifier = Schema.Schema.Type<typeof DocumentIdentifier>

export const MemberReference = Schema.String.pipe(Schema.brand("MemberReference"))
export type MemberReference = Schema.Schema.Type<typeof MemberReference>
