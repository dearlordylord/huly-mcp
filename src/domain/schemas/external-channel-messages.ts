import { JSONSchema, Schema } from "effect"

import {
  ChannelId,
  ChannelIdentifier,
  Count,
  DEFAULT_LIMIT,
  LimitParam,
  MessageId,
  NonEmptyString,
  Timestamp
} from "./shared.js"

export const ExternalChannelMessageProviderValues = ["gmail", "telegram"] as const

export const ExternalChannelMessageProviderSchema = Schema.Literal(...ExternalChannelMessageProviderValues)

export const DEFAULT_EXTERNAL_CHANNEL_MESSAGE_LIMIT = DEFAULT_LIMIT

export const ListExternalChannelMessagesParamsSchema = Schema.Struct({
  provider: ExternalChannelMessageProviderSchema.annotations({
    description:
      "External provider to read or assess. Telegram reads persisted messages when its published model and an exact channel are available; Gmail remains an explicit compatibility assessment."
  }),
  channel: ChannelIdentifier.annotations({
    description:
      "Provider channel locator. For Gmail, use an exact correspondent email address or Huly contact-channel ID. For Telegram, use the exact stored contact-channel value or, preferably, its stable Huly contact-channel ID."
  }),
  limit: Schema.optional(
    LimitParam.annotations({
      description: `Requested maximum message count to echo in the result (default: ${DEFAULT_EXTERNAL_CHANNEL_MESSAGE_LIMIT}, max: 200).`
    })
  )
}).annotations({
  title: "ListExternalChannelMessagesParams",
  description:
    "Parameters for reading persisted Telegram messages or assessing why an external channel cannot be read safely."
})

export type ListExternalChannelMessagesParams = Schema.Schema.Type<typeof ListExternalChannelMessagesParamsSchema>

export type ExternalChannelMessageProvider = Schema.Schema.Type<typeof ExternalChannelMessageProviderSchema>

export const TelegramExternalChannelSchema = Schema.Struct({ id: ChannelId, value: NonEmptyString })
export type TelegramExternalChannel = Schema.Schema.Type<typeof TelegramExternalChannelSchema>

export const TelegramExternalChannelMessageSchema = Schema.Struct({
  id: MessageId,
  contentMarkdown: Schema.String.annotations({
    description: "Telegram message content converted from Huly's stored markup to Markdown."
  }),
  direction: Schema.Literal("incoming", "outgoing"),
  sentOn: Timestamp,
  attachmentCount: Schema.optionalWith(Count, { exact: true })
})
export type TelegramExternalChannelMessage = Schema.Schema.Type<typeof TelegramExternalChannelMessageSchema>

const ExternalChannelMessagesUnsupportedBaseSchema = Schema.Struct({
  supported: Schema.Literal(false),
  channel: ChannelIdentifier,
  limit: LimitParam,
  unsupportedReason: NonEmptyString,
  messages: Schema.Tuple()
})

export const ListExternalChannelMessagesResultSchema = Schema.Union(
  Schema.Struct({
    ...ExternalChannelMessagesUnsupportedBaseSchema.fields,
    provider: Schema.Literal("gmail"),
    unsupportedReasonCode: Schema.Literal("model-unavailable", "runtime-unverifiable")
  }),
  Schema.Struct({
    ...ExternalChannelMessagesUnsupportedBaseSchema.fields,
    provider: Schema.Literal("telegram"),
    unsupportedReasonCode: Schema.Literal("model-unavailable", "channel-unavailable")
  }),
  Schema.Struct({
    supported: Schema.Literal(true),
    provider: Schema.Literal("telegram"),
    channel: TelegramExternalChannelSchema,
    limit: LimitParam,
    messages: Schema.Array(TelegramExternalChannelMessageSchema)
  })
).annotations({
  title: "ListExternalChannelMessagesResult",
  description:
    "Persisted Telegram messages when safely readable, or an explicit no-fake-data result explaining why the requested provider/channel cannot be read."
})

export type ListExternalChannelMessagesResult = Schema.Schema.Type<typeof ListExternalChannelMessagesResultSchema>

export const listExternalChannelMessagesParamsJsonSchema = JSONSchema.make(ListExternalChannelMessagesParamsSchema)
export const parseListExternalChannelMessagesParams = Schema.decodeUnknown(ListExternalChannelMessagesParamsSchema)
export const encodeListExternalChannelMessagesResult = Schema.encodeSync(ListExternalChannelMessagesResultSchema)
