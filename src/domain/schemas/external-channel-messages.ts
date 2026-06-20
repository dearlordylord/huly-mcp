import { JSONSchema, Schema } from "effect"

import { ChannelIdentifier, DEFAULT_LIMIT, LimitParam, NonEmptyString, Timestamp, UrlString } from "./shared.js"

export const ExternalChannelMessageProviderValues = ["gmail", "telegram"] as const

export const ExternalChannelMessageProviderSchema = Schema.Literal(...ExternalChannelMessageProviderValues)

export const DEFAULT_EXTERNAL_CHANNEL_MESSAGE_LIMIT = DEFAULT_LIMIT

export const ListExternalChannelMessagesParamsSchema = Schema.Struct({
  provider: ExternalChannelMessageProviderSchema.annotations({
    description:
      "External provider to read from. Supported locator values are validated for gmail and telegram; providers without a compatible installed Huly message SDK return structured unsupported results instead of fake data."
  }),
  channel: ChannelIdentifier.annotations({
    description:
      "External channel name or Huly channel ID locator, such as a Gmail label/inbox name or Telegram chat name/id."
  }),
  limit: Schema.optional(LimitParam.annotations({
    description:
      `Maximum number of external messages to return (default: ${DEFAULT_EXTERNAL_CHANNEL_MESSAGE_LIMIT}, max: 200).`
  }))
}).annotations({
  title: "ListExternalChannelMessagesParams",
  description: "Parameters for listing read-only Gmail or Telegram external channel messages."
})

export type ListExternalChannelMessagesParams = Schema.Schema.Type<typeof ListExternalChannelMessagesParamsSchema>

export type ExternalChannelMessageProvider = Schema.Schema.Type<typeof ExternalChannelMessageProviderSchema>

export const ExternalChannelMessageId = NonEmptyString.pipe(Schema.brand("ExternalChannelMessageId")).annotations({
  identifier: "ExternalChannelMessageId",
  title: "ExternalChannelMessageId",
  description: "Opaque external provider message ID."
})
export type ExternalChannelMessageId = Schema.Schema.Type<typeof ExternalChannelMessageId>

const ExternalChannelMessageSubject = NonEmptyString.pipe(
  Schema.brand("ExternalChannelMessageSubject")
).annotations({
  identifier: "ExternalChannelMessageSubject",
  title: "ExternalChannelMessageSubject",
  description: "Non-empty external message subject. Omit the field when the provider has no subject value."
})

const ExternalChannelMessageSender = NonEmptyString.pipe(Schema.brand("ExternalChannelMessageSender"))
  .annotations({
    identifier: "ExternalChannelMessageSender",
    title: "ExternalChannelMessageSender",
    description: "Non-empty normalized external message sender label or address."
  })

const ExternalChannelMessageSenderId = NonEmptyString.pipe(Schema.brand("ExternalChannelMessageSenderId"))
  .annotations({
    identifier: "ExternalChannelMessageSenderId",
    title: "ExternalChannelMessageSenderId",
    description: "Non-empty opaque external provider sender ID."
  })

export const ExternalChannelMessageSummarySchema = Schema.Struct({
  id: ExternalChannelMessageId,
  subject: Schema.optional(ExternalChannelMessageSubject),
  bodyPreview: NonEmptyString,
  sender: Schema.optional(ExternalChannelMessageSender),
  senderId: Schema.optional(ExternalChannelMessageSenderId),
  createdOn: Schema.optional(Timestamp),
  modifiedOn: Schema.optional(Timestamp),
  url: Schema.optional(UrlString)
}).annotations({
  title: "ExternalChannelMessageSummary",
  description: "Normalized read-only summary of one external Gmail or Telegram message."
})

export type ExternalChannelMessageSummary = Schema.Schema.Type<typeof ExternalChannelMessageSummarySchema>

export const ListExternalChannelMessagesSupportedResultSchema = Schema.Struct({
  supported: Schema.Literal(true),
  provider: ExternalChannelMessageProviderSchema,
  channel: ChannelIdentifier,
  limit: LimitParam,
  messages: Schema.Array(ExternalChannelMessageSummarySchema)
}).annotations({
  title: "ListExternalChannelMessagesSupportedResult",
  description: "External channel messages returned from a compatible installed Huly provider SDK/model."
})

export const ListExternalChannelMessagesUnsupportedResultSchema = Schema.Struct({
  supported: Schema.Literal(false),
  provider: ExternalChannelMessageProviderSchema,
  channel: ChannelIdentifier,
  limit: LimitParam,
  unsupportedReason: NonEmptyString,
  messages: Schema.Tuple()
}).annotations({
  title: "ListExternalChannelMessagesUnsupportedResult",
  description: "Explicit no-fake-data result when the requested external provider cannot be read in this build."
})

export const ListExternalChannelMessagesResultSchema = Schema.Union(
  ListExternalChannelMessagesSupportedResultSchema,
  ListExternalChannelMessagesUnsupportedResultSchema
).annotations({
  title: "ListExternalChannelMessagesResult",
  description: "Read-only external channel message listing result."
})

export type ListExternalChannelMessagesResult = Schema.Schema.Type<typeof ListExternalChannelMessagesResultSchema>

export const listExternalChannelMessagesParamsJsonSchema = JSONSchema.make(ListExternalChannelMessagesParamsSchema)
export const parseListExternalChannelMessagesParams = Schema.decodeUnknown(ListExternalChannelMessagesParamsSchema)
export const encodeListExternalChannelMessagesResult = Schema.encodeSync(ListExternalChannelMessagesResultSchema)
