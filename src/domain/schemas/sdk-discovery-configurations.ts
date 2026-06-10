import { JSONSchema, Schema } from "effect"

import {
  AccountUuid,
  Count,
  EmptyParamsSchema,
  NonEmptyString,
  NonNegativeInteger,
  ObjectClassName,
  PositiveInteger,
  SpaceTypeId,
  SpaceTypeIdentifier
} from "./shared.js"
import { SpacePermissionSummarySchema, SpaceRoleSummarySchema } from "./spaces.js"

const ParityStatusValues = ["covered", "gap", "not-mcp-facing", "ignored"] as const
const DomainIndexMetadataKindValues = ["field", "sdk-open-metadata"] as const

export const HulyPluginId = NonEmptyString.pipe(Schema.brand("HulyPluginId"))
export type HulyPluginId = Schema.Schema.Type<typeof HulyPluginId>

export const HulySequenceId = NonEmptyString.pipe(Schema.brand("HulySequenceId"))
export type HulySequenceId = Schema.Schema.Type<typeof HulySequenceId>

export const HulySequencePrefix = NonEmptyString.pipe(Schema.brand("HulySequencePrefix"))
export type HulySequencePrefix = Schema.Schema.Type<typeof HulySequencePrefix>

export const HulyDomainName = NonEmptyString.pipe(Schema.brand("HulyDomainName"))
export type HulyDomainName = Schema.Schema.Type<typeof HulyDomainName>

export const HulyParityStatusSchema = Schema.Literal(...ParityStatusValues)
export type HulyParityStatus = Schema.Schema.Type<typeof HulyParityStatusSchema>

export const HulyBacklogIssueNumber = PositiveInteger.pipe(Schema.brand("HulyBacklogIssueNumber"))
export type HulyBacklogIssueNumber = Schema.Schema.Type<typeof HulyBacklogIssueNumber>

export const HulyMcpToolName = NonEmptyString.pipe(Schema.brand("HulyMcpToolName"))
export type HulyMcpToolName = Schema.Schema.Type<typeof HulyMcpToolName>

export const HulyConfigurationMetadataKey = NonEmptyString.pipe(Schema.brand("HulyConfigurationMetadataKey"))
export type HulyConfigurationMetadataKey = Schema.Schema.Type<typeof HulyConfigurationMetadataKey>

const RoutingRationaleSchema = NonEmptyString.annotations({
  description: "Concise reason copied from the audited SDK parity ledger classification."
})

const HulyCoveredClassRoutingHintSchema = Schema.Struct({
  status: Schema.Literal("covered"),
  safestMcpTools: Schema.Array(HulyMcpToolName),
  rationale: RoutingRationaleSchema
})

const HulyGapClassRoutingHintSchema = Schema.Struct({
  status: Schema.Literal("gap"),
  backlogIssue: HulyBacklogIssueNumber,
  rationale: RoutingRationaleSchema
})

const HulyNonMcpFacingClassRoutingHintSchema = Schema.Struct({
  status: Schema.Literal("not-mcp-facing", "ignored"),
  rationale: RoutingRationaleSchema
})

export const HulyClassRoutingHintSchema = Schema.Union(
  HulyCoveredClassRoutingHintSchema,
  HulyGapClassRoutingHintSchema,
  HulyNonMcpFacingClassRoutingHintSchema
)
export type HulyClassRoutingHint = Schema.Schema.Type<typeof HulyClassRoutingHintSchema>

export const HulyPluginConfigurationSummarySchema = Schema.Struct({
  pluginId: HulyPluginId,
  label: NonEmptyString,
  enabled: Schema.Boolean,
  beta: Schema.Boolean,
  transactionCount: Count
})
export type HulyPluginConfigurationSummary = Schema.Schema.Type<typeof HulyPluginConfigurationSummarySchema>

export const ListHulyPluginConfigurationsResultSchema = Schema.Struct({
  pluginConfigurations: Schema.Array(HulyPluginConfigurationSummarySchema),
  total: Count
})
export type ListHulyPluginConfigurationsResult = Schema.Schema.Type<
  typeof ListHulyPluginConfigurationsResultSchema
>

const HulySdkOpenDomainIndexMetadata = Schema.Unknown.annotations({
  description:
    "Open Huly SDK domain-index metadata payload. Shape is backend/model-version dependent; inspect keys before relying on it."
})

const HulyDomainIndexMetadataEntrySchema = Schema.Union(
  Schema.Struct({
    kind: Schema.Literal("field"),
    key: HulyConfigurationMetadataKey
  }),
  Schema.Struct({
    kind: Schema.Literal("sdk-open-metadata"),
    metadata: HulySdkOpenDomainIndexMetadata
  })
).annotations({
  description: `Domain index entry summary. kind is one of ${DomainIndexMetadataKindValues.join(", ")}.`
})
export type HulyDomainIndexMetadataEntry = Schema.Schema.Type<typeof HulyDomainIndexMetadataEntrySchema>

export const HulyDomainIndexConfigurationSummarySchema = Schema.Struct({
  domain: HulyDomainName,
  disableCollection: Schema.optional(Schema.Boolean),
  disabled: Schema.Array(HulyDomainIndexMetadataEntrySchema),
  indexes: Schema.Array(HulyDomainIndexMetadataEntrySchema),
  skip: Schema.Array(HulyConfigurationMetadataKey)
})
export type HulyDomainIndexConfigurationSummary = Schema.Schema.Type<
  typeof HulyDomainIndexConfigurationSummarySchema
>

export const ListHulyDomainIndexConfigurationsResultSchema = Schema.Struct({
  domainIndexConfigurations: Schema.Array(HulyDomainIndexConfigurationSummarySchema),
  total: Count
})
export type ListHulyDomainIndexConfigurationsResult = Schema.Schema.Type<
  typeof ListHulyDomainIndexConfigurationsResultSchema
>

export const HulySequenceValue = NonNegativeInteger.pipe(Schema.brand("HulySequenceValue"))
export type HulySequenceValue = Schema.Schema.Type<typeof HulySequenceValue>

export const HulySequenceSummarySchema = Schema.Struct({
  sequenceId: HulySequenceId,
  attachedClass: ObjectClassName,
  currentValue: HulySequenceValue,
  prefix: Schema.optional(HulySequencePrefix)
})
export type HulySequenceSummary = Schema.Schema.Type<typeof HulySequenceSummarySchema>

export const ListHulySequencesResultSchema = Schema.Struct({
  sequences: Schema.Array(HulySequenceSummarySchema),
  total: Count
})
export type ListHulySequencesResult = Schema.Schema.Type<typeof ListHulySequencesResultSchema>

export const DescribeHulySpaceTypeCapabilitiesParamsSchema = Schema.Struct({
  spaceType: SpaceTypeIdentifier.annotations({
    description: "SpaceType _id or exact name. Resolution tries _id first, then exact name."
  })
})
export type DescribeHulySpaceTypeCapabilitiesParams = Schema.Schema.Type<
  typeof DescribeHulySpaceTypeCapabilitiesParamsSchema
>

export const HulySpaceTypeAssignmentShapeSchema = Schema.Struct({
  storedOnSpaceField: HulyConfigurationMetadataKey,
  roleKeyField: HulyConfigurationMetadataKey,
  memberValueShape: Schema.Literal("accountUuidArrayOrUndefined"),
  readProjectionTools: Schema.Array(HulyMcpToolName)
})
export type HulySpaceTypeAssignmentShape = Schema.Schema.Type<typeof HulySpaceTypeAssignmentShapeSchema>

export const HulySpaceTypeCapabilitiesSchema = Schema.Struct({
  id: SpaceTypeId,
  name: NonEmptyString,
  shortDescription: Schema.optional(Schema.String),
  descriptor: NonEmptyString,
  descriptorName: Schema.optional(NonEmptyString),
  descriptorDescription: Schema.optional(NonEmptyString),
  baseClass: Schema.optional(ObjectClassName),
  targetClass: ObjectClassName,
  defaultMembers: Schema.Array(AccountUuid),
  autoJoin: Schema.optional(Schema.Boolean),
  roles: Schema.Array(SpaceRoleSummarySchema),
  rolePermissions: Schema.Array(SpacePermissionSummarySchema),
  assignmentShape: HulySpaceTypeAssignmentShapeSchema
})
export type HulySpaceTypeCapabilities = Schema.Schema.Type<typeof HulySpaceTypeCapabilitiesSchema>

export const listHulyPluginConfigurationsParamsJsonSchema = JSONSchema.make(EmptyParamsSchema)
export const listHulyDomainIndexConfigurationsParamsJsonSchema = JSONSchema.make(EmptyParamsSchema)
export const listHulySequencesParamsJsonSchema = JSONSchema.make(EmptyParamsSchema)
export const describeHulySpaceTypeCapabilitiesParamsJsonSchema = JSONSchema.make(
  DescribeHulySpaceTypeCapabilitiesParamsSchema
)

export const parseListHulyPluginConfigurationsParams = Schema.decodeUnknown(EmptyParamsSchema)
export const parseListHulyDomainIndexConfigurationsParams = Schema.decodeUnknown(EmptyParamsSchema)
export const parseListHulySequencesParams = Schema.decodeUnknown(EmptyParamsSchema)
export const parseDescribeHulySpaceTypeCapabilitiesParams = Schema.decodeUnknown(
  DescribeHulySpaceTypeCapabilitiesParamsSchema
)
