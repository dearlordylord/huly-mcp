import { Schema } from "effect"
import { toDraft07EmptyObjectJsonSchema } from "./json-schema.js"
import { NonEmptyString } from "./shared-base.js"

export { NonEmptyString } from "./shared-base.js"
export * from "./shared-refs.js"

export const MAX_LIMIT = 200
export const DEFAULT_LIMIT = 50
export const DEFAULT_COLOR_INDEX = 0
export const MAX_COLOR_INDEX = 23
export const DEFAULT_INCLUDE_ARCHIVED = false
export const DEFAULT_PRIVATE = false

export const NonNegativeInteger = Schema.Natural.annotate({
  identifier: "NonNegativeInteger",
  title: "NonNegativeInteger",
  description: "Integer greater than or equal to zero."
})
export type NonNegativeInteger = Schema.Schema.Type<typeof NonNegativeInteger>

export const PositiveInteger = Schema.Int.pipe(
  Schema.check(Schema.isGreaterThan(0)),
  Schema.brand("PositiveInteger")
).annotate({ identifier: "PositiveInteger", title: "PositiveInteger", description: "Integer greater than zero." })
export type PositiveInteger = Schema.Schema.Type<typeof PositiveInteger>

export const Integer = Schema.Int.pipe(Schema.brand("Integer")).annotate({
  identifier: "Integer",
  title: "Integer",
  description: "Whole number."
})
export type Integer = Schema.Schema.Type<typeof Integer>

export const Count = NonNegativeInteger.pipe(Schema.brand("Count")).annotate({
  identifier: "Count",
  title: "Count",
  description: "Non-negative integer count."
})
export type Count = Schema.Schema.Type<typeof Count>

export const UNKNOWN_TOTAL = -1

export const ListTotal = Schema.Union([Count, Schema.Literal(UNKNOWN_TOTAL)]).annotate({
  identifier: "ListTotal",
  title: "ListTotal",
  description: "Count of matching list results, or -1 when the Huly backend reports an unknown total."
})
export type ListTotal = Schema.Schema.Type<typeof ListTotal>

export const HulyTransactionScope = NonEmptyString.pipe(Schema.brand("HulyTransactionScope"))
export type HulyTransactionScope = Schema.Schema.Type<typeof HulyTransactionScope>

export const HulyConditionalWriteResult = Schema.Literals(["applied", "condition-not-met"])
export type HulyConditionalWriteResult = Schema.Schema.Type<typeof HulyConditionalWriteResult>

export const Sha256Hex = Schema.String.pipe(
  Schema.check(Schema.isPattern(/^[0-9a-f]{64}$/u)),
  Schema.brand("Sha256Hex")
).annotate({
  identifier: "Sha256Hex",
  title: "Sha256Hex",
  description: "Lowercase 64-character hexadecimal SHA-256 digest."
})
export type Sha256Hex = Schema.Schema.Type<typeof Sha256Hex>

export const Timestamp = NonNegativeInteger.pipe(Schema.brand("Timestamp")).annotate({
  identifier: "Timestamp",
  title: "Timestamp",
  description: "Unix timestamp in milliseconds (non-negative integer)"
})
export type Timestamp = Schema.Schema.Type<typeof Timestamp>

export const LimitParam = Schema.Int.check(Schema.isGreaterThan(0), Schema.isLessThanOrEqualTo(MAX_LIMIT))
export type LimitParam = Schema.Schema.Type<typeof LimitParam>

export const EmptyParamsSchema = Schema.Struct({})

export const emptyParamsJsonSchema = toDraft07EmptyObjectJsonSchema(EmptyParamsSchema)

export const enumValuesDescription = (values: ReadonlyArray<string>): string => values.join(", ")

export const hasAtLeastOneDefined = <K extends string>(
  params: { readonly [P in K]?: unknown },
  fields: ReadonlyArray<K>
): boolean => fields.some((field) => params[field] !== undefined)

export const hasAllDefined = (...values: ReadonlyArray<unknown>): boolean =>
  values.every((value) => value !== undefined)

export const atLeastOneUpdateFieldMessage = (fields: ReadonlyArray<string>): string =>
  `At least one update field must be provided: ${fields.join(", ")}.`

export const mutuallyExclusiveFieldsMessage = (fields: ReadonlyArray<string>): string =>
  `Provide only one of ${fields.join(" or ")}.`

export const hasMutuallyExclusiveFields = <K extends string>(
  params: { readonly [P in K]?: unknown },
  fields: ReadonlyArray<K>
): boolean => fields.every((field) => params[field] !== undefined)

export const withAtLeastOneRequired = <K extends string>(schema: object, fields: ReadonlyArray<K>): object => ({
  ...schema,
  anyOf: fields.map((field) => ({ required: [field] }))
})

export const withMutuallyExclusiveFields = <K extends string>(schema: object, fields: ReadonlyArray<K>): object => ({
  ...schema,
  not: { required: [...fields] }
})

type UpdateFieldExactness<Params, NonUpdateFields extends ReadonlyArray<string>, Fields extends ReadonlyArray<string>> =
  Exclude<Extract<keyof Params, string>, NonUpdateFields[number] | Fields[number]> extends never
    ? Extract<NonUpdateFields[number], Fields[number]> extends never
      ? unknown
      : { readonly __overlappingUpdateFields: Extract<NonUpdateFields[number], Fields[number]> }
    : {
        readonly __missingUpdateFields: Exclude<Extract<keyof Params, string>, NonUpdateFields[number] | Fields[number]>
      }

export const assertUpdateFields =
  <Params>() =>
  <
    const NonUpdateFields extends ReadonlyArray<Extract<keyof Params, string>>,
    const Fields extends ReadonlyArray<Extract<keyof Params, string>>
  >(
    _nonUpdateFields: NonUpdateFields,
    fields: Fields & UpdateFieldExactness<Params, NonUpdateFields, Fields>
  ): Fields =>
    fields

// === Tier 2: Human-Readable Identifiers ===

export const ProjectIdentifier = NonEmptyString.pipe(Schema.brand("ProjectIdentifier"))
export type ProjectIdentifier = Schema.Schema.Type<typeof ProjectIdentifier>

export const IssueIdentifier = NonEmptyString.pipe(Schema.brand("IssueIdentifier"))
export type IssueIdentifier = Schema.Schema.Type<typeof IssueIdentifier>

export const SpaceIdentifier = NonEmptyString.pipe(Schema.brand("SpaceIdentifier"))
export type SpaceIdentifier = Schema.Schema.Type<typeof SpaceIdentifier>

export const SpaceClassFilter = NonEmptyString.pipe(Schema.brand("SpaceClassFilter"))
export type SpaceClassFilter = Schema.Schema.Type<typeof SpaceClassFilter>

export const SpaceTypeIdentifier = NonEmptyString.pipe(Schema.brand("SpaceTypeIdentifier"))
export type SpaceTypeIdentifier = Schema.Schema.Type<typeof SpaceTypeIdentifier>

// === Tier 3: Constrained String Domains ===

export const Email = Schema.NonEmptyString.pipe(
  Schema.check(Schema.isPattern(/^[^@]+@[^@]+$/, { message: "must contain exactly one @" })),
  Schema.brand("Email")
)
export type Email = Schema.Schema.Type<typeof Email>

export const StatusName = NonEmptyString.annotate({
  description:
    "Exact workflow status display name. Status names are workspace data, not a fixed enum; use the relevant workflow-status listing tool to discover valid values."
}).pipe(Schema.brand("StatusName"))
export type StatusName = Schema.Schema.Type<typeof StatusName>

export const PersonName = NonEmptyString.pipe(Schema.brand("PersonName"))
export type PersonName = Schema.Schema.Type<typeof PersonName>

export const PersonLocator = NonEmptyString.pipe(Schema.brand("PersonLocator")).annotate({
  description: "Person or employee ID, exact email address, or exact Huly display name."
})
export type PersonLocator = Schema.Schema.Type<typeof PersonLocator>

/**
 * Input schema for any field that accepts either an email address or a display
 * name as a person reference. Email validation stays strict for fields where
 * only an email makes sense (account creation, social-id lookups). Named
 * `*Input` to distinguish from the existing PersonRef output struct in
 * domain/schemas/issues.ts.
 */
export const PersonRefInput = Schema.Union([Email, PersonName])
export type PersonRefInput = Schema.Schema.Type<typeof PersonRefInput>

export const ComponentLabel = NonEmptyString.pipe(Schema.brand("ComponentLabel"))
export type ComponentLabel = Schema.Schema.Type<typeof ComponentLabel>

export const MilestoneLabel = NonEmptyString.pipe(Schema.brand("MilestoneLabel"))
export type MilestoneLabel = Schema.Schema.Type<typeof MilestoneLabel>

export const ChannelName = NonEmptyString.pipe(Schema.brand("ChannelName"))
export type ChannelName = Schema.Schema.Type<typeof ChannelName>

export const RoomName = NonEmptyString.pipe(Schema.brand("RoomName")).annotate({
  identifier: "RoomName",
  title: "RoomName",
  description: "Non-empty virtual-office room name."
})
export type RoomName = Schema.Schema.Type<typeof RoomName>

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

export const AccountUuid = Schema.String.check(Schema.isUUID()).pipe(Schema.brand("AccountUuid"))
export type AccountUuid = Schema.Schema.Type<typeof AccountUuid>

export const SessionId = NonEmptyString.pipe(Schema.brand("SessionId"))
export type SessionId = Schema.Schema.Type<typeof SessionId>

export const RegionId = Schema.String.pipe(Schema.brand("RegionId"))
export type RegionId = Schema.Schema.Type<typeof RegionId>

// === Tier 5: Numeric Brands ===

export const NonNegativeNumber = Schema.Number.check(Schema.isGreaterThanOrEqualTo(0)).pipe(
  Schema.brand("NonNegativeNumber")
)
export type NonNegativeNumber = Schema.Schema.Type<typeof NonNegativeNumber>

export const PositiveNumber = NonNegativeNumber.check(Schema.isGreaterThan(0)).pipe(Schema.brand("PositiveNumber"))
export type PositiveNumber = Schema.Schema.Type<typeof PositiveNumber>

export const VirtualOfficeCoordinate = Schema.Number.pipe(Schema.brand("VirtualOfficeCoordinate")).annotate({
  identifier: "VirtualOfficeCoordinate",
  title: "VirtualOfficeCoordinate",
  description: "Coordinate in Huly virtual-office layout space."
})
export type VirtualOfficeCoordinate = Schema.Schema.Type<typeof VirtualOfficeCoordinate>

export const VirtualOfficeDimension = NonNegativeNumber.pipe(Schema.brand("VirtualOfficeDimension")).annotate({
  identifier: "VirtualOfficeDimension",
  title: "VirtualOfficeDimension",
  description: "Non-negative dimension in Huly virtual-office layout space."
})
export type VirtualOfficeDimension = Schema.Schema.Type<typeof VirtualOfficeDimension>

export const BlurRadius = NonNegativeNumber.pipe(Schema.brand("BlurRadius")).annotate({
  identifier: "BlurRadius",
  title: "BlurRadius",
  description: "Non-negative virtual-office video blur radius."
})
export type BlurRadius = Schema.Schema.Type<typeof BlurRadius>

export const TimeZoneId = NonEmptyString.pipe(Schema.brand("TimeZoneId")).annotate({
  identifier: "TimeZoneId",
  title: "TimeZoneId",
  description: "IANA time zone identifier."
})
export type TimeZoneId = Schema.Schema.Type<typeof TimeZoneId>

export const DurationMinutes = NonNegativeInteger.pipe(Schema.brand("DurationMinutes")).annotate({
  identifier: "DurationMinutes",
  title: "DurationMinutes",
  description: "Duration expressed in whole minutes."
})
export type DurationMinutes = Schema.Schema.Type<typeof DurationMinutes>

export const PositiveDurationMinutes = PositiveInteger.pipe(Schema.brand("PositiveDurationMinutes")).annotate({
  identifier: "PositiveDurationMinutes",
  title: "PositiveDurationMinutes",
  description: "Positive duration expressed in whole minutes."
})
export type PositiveDurationMinutes = Schema.Schema.Type<typeof PositiveDurationMinutes>

const HOURS_PER_DAY = 24
const MINUTES_PER_HOUR = 60
const MINUTES_PER_DAY = HOURS_PER_DAY * MINUTES_PER_HOUR

export const MinuteOfDay = NonNegativeInteger.pipe(
  Schema.check(Schema.isLessThanOrEqualTo(MINUTES_PER_DAY)),
  Schema.brand("MinuteOfDay")
).annotate({
  identifier: "MinuteOfDay",
  title: "MinuteOfDay",
  description: "Minute offset within a day, from 0 through 1440."
})
export type MinuteOfDay = Schema.Schema.Type<typeof MinuteOfDay>

export const ColorCode = Schema.Int.pipe(
  Schema.check(Schema.isGreaterThanOrEqualTo(0), Schema.isLessThanOrEqualTo(MAX_COLOR_INDEX)),
  Schema.brand("ColorCode")
).annotate({ title: "ColorCode", description: `Huly platform color palette index, from 0 through ${MAX_COLOR_INDEX}.` })
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

export const WorkflowStatusIdentifier = NonEmptyString.pipe(Schema.brand("WorkflowStatusIdentifier"))
export type WorkflowStatusIdentifier = Schema.Schema.Type<typeof WorkflowStatusIdentifier>

export const StatusCategoryIdentifier = NonEmptyString.pipe(Schema.brand("StatusCategoryIdentifier"))
export type StatusCategoryIdentifier = Schema.Schema.Type<typeof StatusCategoryIdentifier>

export const HulyAttributeIdentifier = NonEmptyString.pipe(Schema.brand("HulyAttributeIdentifier"))
export type HulyAttributeIdentifier = Schema.Schema.Type<typeof HulyAttributeIdentifier>

export const InventoryCategoryIdentifier = NonEmptyString.pipe(Schema.brand("InventoryCategoryIdentifier"))
export type InventoryCategoryIdentifier = Schema.Schema.Type<typeof InventoryCategoryIdentifier>

export const InventoryProductIdentifier = NonEmptyString.pipe(Schema.brand("InventoryProductIdentifier"))
export type InventoryProductIdentifier = Schema.Schema.Type<typeof InventoryProductIdentifier>

export const InventoryVariantIdentifier = NonEmptyString.pipe(Schema.brand("InventoryVariantIdentifier"))
export type InventoryVariantIdentifier = Schema.Schema.Type<typeof InventoryVariantIdentifier>

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
