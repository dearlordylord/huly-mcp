import { JSONSchema, Schema } from "effect"

import { DocId, EmptyParamsSchema, NonEmptyString, Timestamp } from "./shared.js"

const MINIMUM_AMBIGUOUS_SUPPORT_SYSTEMS = 2

export const SupportSystemId = DocId.pipe(Schema.brand("SupportSystemId"))
export type SupportSystemId = Schema.Schema.Type<typeof SupportSystemId>
export const SupportStatusRecordId = DocId.pipe(Schema.brand("SupportStatusRecordId"))
export type SupportStatusRecordId = Schema.Schema.Type<typeof SupportStatusRecordId>
export const SupportSystemName = Schema.String.pipe(Schema.brand("SupportSystemName"))
export type SupportSystemName = Schema.Schema.Type<typeof SupportSystemName>
export const SupportProviderConversationId = NonEmptyString.pipe(Schema.brand("SupportProviderConversationId"))
export type SupportProviderConversationId = Schema.Schema.Type<typeof SupportProviderConversationId>
export const SupportUnsupportedReason = NonEmptyString.pipe(Schema.brand("SupportUnsupportedReason"))
export type SupportUnsupportedReason = Schema.Schema.Type<typeof SupportUnsupportedReason>

export const GetSupportStatusParamsSchema = EmptyParamsSchema.annotations({
  title: "GetSupportStatusParams",
  description: "No selectors are accepted because support status is private to the authenticated Huly account."
})
export type GetSupportStatusParams = Schema.Schema.Type<typeof GetSupportStatusParamsSchema>

export const SupportSystemSummarySchema = Schema.Struct({ id: SupportSystemId, name: SupportSystemName })
export type SupportSystemSummary = Schema.Schema.Type<typeof SupportSystemSummarySchema>

const MissingSupportSetupSchema = Schema.Struct({ status: Schema.Literal("missing") })
const ConfiguredSupportSetupSchema = Schema.Struct({
  status: Schema.Literal("configured"),
  system: SupportSystemSummarySchema
})
const AmbiguousSupportSetupSchema = Schema.Struct({
  status: Schema.Literal("ambiguous"),
  systems: Schema.Array(SupportSystemSummarySchema).pipe(Schema.minItems(MINIMUM_AMBIGUOUS_SUPPORT_SYSTEMS))
})

export const SupportSetupSchema = Schema.Union(
  MissingSupportSetupSchema,
  ConfiguredSupportSetupSchema,
  AmbiguousSupportSetupSchema
)
export type SupportSetup = Schema.Schema.Type<typeof SupportSetupSchema>

export const SupportStatusRecordSchema = Schema.Struct({
  recordId: SupportStatusRecordId,
  providerConversationId: SupportProviderConversationId.annotations({
    description:
      "Opaque support-widget/provider identifier; it is not a Huly channel, human-readable support number, or participant identity."
  }),
  storedHasUnreadMessages: Schema.Boolean.annotations({
    description: "Stored Huly fallback value; it is not a live provider unread count and has no freshness guarantee."
  }),
  modifiedOn: Timestamp
})
export type SupportStatusRecord = Schema.Schema.Type<typeof SupportStatusRecordSchema>

const SupportStatusRecordsSchema = Schema.Array(SupportStatusRecordSchema).annotations({
  description:
    "Authenticated caller's private stored widget-status rows. Orphaned rows may remain when setup is missing. No message body, participant, attachment, or transcript is available."
})

const SupportModelUnavailableSchema = Schema.Struct({
  supported: Schema.Literal(false),
  unsupportedReasonCode: Schema.Literal("model-unavailable"),
  unsupportedReason: SupportUnsupportedReason
})

const SupportModelAvailableSchema = Schema.Struct({
  supported: Schema.Literal(true),
  setup: SupportSetupSchema,
  statusRecords: SupportStatusRecordsSchema
})

export const GetSupportStatusResultSchema = Schema.Union(
  SupportModelUnavailableSchema,
  SupportModelAvailableSchema
).annotations({
  title: "GetSupportStatusResult",
  description:
    "Workspace support-model/system discovery plus caller-private stored widget status, or an explicit model-unavailable result; this does not prove a live provider connection."
})
export type GetSupportStatusResult = Schema.Schema.Type<typeof GetSupportStatusResultSchema>

export const getSupportStatusParamsJsonSchema = JSONSchema.make(GetSupportStatusParamsSchema)
export const parseGetSupportStatusParams = Schema.decodeUnknown(GetSupportStatusParamsSchema)
