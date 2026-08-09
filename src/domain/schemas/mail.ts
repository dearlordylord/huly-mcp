import { JSONSchema, Schema } from "effect"

import { CardId, DEFAULT_LIMIT, LimitParam, NonEmptyString, SpaceId, SpaceIdentifier, Timestamp } from "./shared.js"

export const MAIL_THREAD_SUBJECT_LIMIT = 10

export const ListMailThreadsParamsSchema = Schema.Struct({
  space: Schema.optional(
    SpaceIdentifier.annotations({
      description: "Filter by a Huly space name or stable space ID. Names must resolve unambiguously."
    })
  ),
  channelTitleSearch: Schema.optional(
    NonEmptyString.annotations({
      description:
        "Case-insensitive substring search over the outer Mail channel title. The title may be a replication-recipient email; it does not prove a correspondent or configured mailbox."
    })
  ),
  limit: Schema.optional(
    LimitParam.annotations({
      description: `Maximum number of Mail thread channels to return (default: ${DEFAULT_LIMIT})`
    })
  )
}).annotations({
  title: "ListMailThreadsParams",
  description: "Filters for read-only Huly Mail thread metadata discovery."
})
export type ListMailThreadsParams = Schema.Schema.Type<typeof ListMailThreadsParamsSchema>

export const MailThreadSpaceSchema = Schema.Struct({ id: SpaceId, name: Schema.String })
export type MailThreadSpace = Schema.Schema.Type<typeof MailThreadSpaceSchema>

export const MailThreadSubjectSummarySchema = Schema.Struct({
  id: CardId,
  subject: Schema.String,
  createdOn: Schema.optionalWith(Timestamp, { exact: true }),
  modifiedOn: Schema.optionalWith(Timestamp, { exact: true })
})
export type MailThreadSubjectSummary = Schema.Schema.Type<typeof MailThreadSubjectSummarySchema>

export const MailThreadSummarySchema = Schema.Struct({
  id: CardId,
  channelTitle: Schema.String,
  space: MailThreadSpaceSchema,
  createdOn: Schema.optionalWith(Timestamp, { exact: true }),
  modifiedOn: Schema.optionalWith(Timestamp, { exact: true }),
  subjects: Schema.Array(MailThreadSubjectSummarySchema)
})
export type MailThreadSummary = Schema.Schema.Type<typeof MailThreadSummarySchema>

export const ListMailThreadsResultSchema = Schema.Struct({ threads: Schema.Array(MailThreadSummarySchema) })
export type ListMailThreadsResult = Schema.Schema.Type<typeof ListMailThreadsResultSchema>

export const listMailThreadsParamsJsonSchema = JSONSchema.make(ListMailThreadsParamsSchema)
export const parseListMailThreadsParams = Schema.decodeUnknown(ListMailThreadsParamsSchema)
