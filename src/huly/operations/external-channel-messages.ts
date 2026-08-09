import type { Channel } from "@hcengineering/contact"
import { SortingOrder } from "@hcengineering/core"
import type { TelegramMessage } from "@hcengineering/telegram"
import { Effect, Schema } from "effect"

import {
  DEFAULT_EXTERNAL_CHANNEL_MESSAGE_LIMIT,
  type ListExternalChannelMessagesParams,
  type ListExternalChannelMessagesResult,
  type TelegramExternalChannel,
  type TelegramExternalChannelMessage
} from "../../domain/schemas/external-channel-messages.js"
import {
  ChannelId,
  Count,
  type LimitParam,
  MessageId,
  NonEmptyString,
  ObjectClassName,
  Timestamp
} from "../../domain/schemas/shared.js"
import { ExternalChannelRuntimeUnsupportedWarningCode } from "../../domain/schemas/tool-warnings.js"
import { HulyClient, type HulyClientError } from "../client.js"
import { Diagnostics } from "../diagnostics.js"
import { HulyError, TelegramChannelIdentifierAmbiguousError } from "../errors.js"
import { contact, core, gmail, telegram } from "../huly-plugins.js"
import { hulyQuery } from "./query-helpers.js"
import { markupToMarkdownString, type MarkupUrlConfig } from "./markup.js"
import type { MetadataClassDoc } from "./sdk-discovery-mappers.js"
import { toClassRef, toRef } from "./sdk-boundary.js"

const TELEGRAM_MODEL_UNAVAILABLE_REASON =
  "model-unavailable: @hcengineering/telegram@0.7.0 is installed, but this Huly workspace does not expose telegram:class:Message"

const GMAIL_MODEL_UNAVAILABLE_REASON =
  "model-unavailable: @hcengineering/gmail@0.7.0 is installed, but this Huly workspace does not expose gmail:class:Message"

const GMAIL_RUNTIME_UNVERIFIABLE_REASON =
  "runtime-unverifiable: @hcengineering/gmail@0.7.0 exposes the legacy Message model, but Huly does not expose the deployment-wide Gmail writer version needed to distinguish v1 records from stale data after a v2 upgrade"

const modelClassRef = toClassRef<MetadataClassDoc>(core.class.Class)
const gmailMessageModelId = ObjectClassName.make(String(gmail.class.Message))
const telegramMessageModelId = ObjectClassName.make(String(telegram.class.Message))

const TelegramChannelProjectionSchema = Schema.Struct({ _id: ChannelId, value: NonEmptyString })
type TelegramChannelProjection = Schema.Schema.Type<typeof TelegramChannelProjectionSchema>

const TelegramMessageProjectionSchema = Schema.Struct({
  _id: MessageId,
  content: Schema.String,
  incoming: Schema.Boolean,
  sendOn: Timestamp,
  attachments: Schema.optional(Count)
})
type TelegramMessageProjection = Schema.Schema.Type<typeof TelegramMessageProjectionSchema>

type ExternalChannelMessagesError = HulyClientError | HulyError | TelegramChannelIdentifierAmbiguousError
type TelegramUnsupportedResult = Extract<
  ListExternalChannelMessagesResult,
  { readonly supported: false; readonly provider: "telegram" }
>

const gmailUnsupportedResult = (
  params: ListExternalChannelMessagesParams,
  limit: LimitParam,
  unsupportedReasonCode: "model-unavailable" | "runtime-unverifiable",
  unsupportedReason: NonEmptyString
): ListExternalChannelMessagesResult => ({
  supported: false,
  provider: "gmail",
  channel: params.channel,
  limit,
  unsupportedReasonCode,
  unsupportedReason,
  messages: []
})

const telegramUnsupportedResult = (
  params: ListExternalChannelMessagesParams,
  limit: LimitParam,
  unsupportedReasonCode: TelegramUnsupportedResult["unsupportedReasonCode"],
  unsupportedReason: NonEmptyString
): ListExternalChannelMessagesResult => ({
  supported: false,
  provider: "telegram",
  channel: params.channel,
  limit,
  unsupportedReasonCode,
  unsupportedReason,
  messages: []
})

const hasMessageModel = (
  client: HulyClient["Type"],
  messageModelId: ObjectClassName
): Effect.Effect<boolean, HulyClientError> =>
  Effect.map(
    client.findAllInModel<MetadataClassDoc>(
      modelClassRef,
      hulyQuery<MetadataClassDoc>({ _id: toRef<MetadataClassDoc>(messageModelId) }),
      { limit: 1 }
    ),
    (classes) => classes.length > 0
  )

const warnUnsupportedRuntime = (reason: NonEmptyString): Effect.Effect<void, never, Diagnostics> =>
  Effect.flatMap(Diagnostics, (diagnostics) =>
    diagnostics.warnAgent({ code: ExternalChannelRuntimeUnsupportedWarningCode, message: reason })
  )

const parseTelegramChannel = (input: unknown): Effect.Effect<TelegramChannelProjection, HulyError> =>
  Schema.decodeUnknown(TelegramChannelProjectionSchema)(input).pipe(
    Effect.mapError(
      (cause) => new HulyError({ message: "Huly returned malformed Telegram contact-channel metadata.", cause })
    )
  )

const parseTelegramMessage = (input: unknown): Effect.Effect<TelegramMessageProjection, HulyError> =>
  Schema.decodeUnknown(TelegramMessageProjectionSchema)(input).pipe(
    Effect.mapError((cause) => new HulyError({ message: "Huly returned malformed Telegram message metadata.", cause }))
  )

const resolveTelegramChannel = (
  client: HulyClient["Type"],
  identifier: ListExternalChannelMessagesParams["channel"]
): Effect.Effect<TelegramChannelProjection | undefined, ExternalChannelMessagesError> =>
  Effect.gen(function* () {
    const byId = yield* client.findOne<Channel>(
      contact.class.Channel,
      hulyQuery<Channel>({ _id: toRef<Channel>(identifier), provider: contact.channelProvider.Telegram })
    )
    if (byId !== undefined) return yield* parseTelegramChannel(byId)

    const matches = yield* client.findAll<Channel>(
      contact.class.Channel,
      hulyQuery<Channel>({ provider: contact.channelProvider.Telegram, value: identifier }),
      { limit: 2 }
    )
    if (matches.length > 1) {
      return yield* new TelegramChannelIdentifierAmbiguousError({ identifier, matches: Count.make(matches.length) })
    }
    return matches[0] === undefined ? undefined : yield* parseTelegramChannel(matches[0])
  })

const toTelegramMessageResult = (
  message: TelegramMessageProjection,
  markupUrlConfig: MarkupUrlConfig
): TelegramExternalChannelMessage => ({
  id: message._id,
  contentMarkdown: markupToMarkdownString(message.content, markupUrlConfig),
  direction: message.incoming ? "incoming" : "outgoing",
  sentOn: message.sendOn,
  ...(message.attachments === undefined ? {} : { attachmentCount: message.attachments })
})

const listTelegramMessages = (
  client: HulyClient["Type"],
  params: ListExternalChannelMessagesParams,
  limit: LimitParam
): Effect.Effect<ListExternalChannelMessagesResult, ExternalChannelMessagesError, Diagnostics> =>
  Effect.gen(function* () {
    const hasModel = yield* hasMessageModel(client, telegramMessageModelId)
    if (!hasModel) {
      const reason = NonEmptyString.make(TELEGRAM_MODEL_UNAVAILABLE_REASON)
      yield* warnUnsupportedRuntime(reason)
      return telegramUnsupportedResult(params, limit, "model-unavailable", reason)
    }

    const channel = yield* resolveTelegramChannel(client, params.channel)
    if (channel === undefined) {
      return telegramUnsupportedResult(
        params,
        limit,
        "channel-unavailable",
        NonEmptyString.make(
          `channel-unavailable: no Telegram contact channel matches '${params.channel}'; Telegram may not be configured in this workspace, or the caller should use a stable contact-channel ID`
        )
      )
    }

    const rawMessages = yield* client.findAll<TelegramMessage>(
      telegram.class.Message,
      hulyQuery<TelegramMessage>({ attachedTo: toRef<Channel>(channel._id) }),
      { limit, sort: { sendOn: SortingOrder.Descending } }
    )
    const messages = yield* Effect.forEach(rawMessages, parseTelegramMessage)
    const resultChannel: TelegramExternalChannel = { id: channel._id, value: channel.value }
    return {
      supported: true,
      provider: "telegram",
      channel: resultChannel,
      limit,
      messages: messages.map((message) => toTelegramMessageResult(message, client.markupUrlConfig))
    }
  })

/**
 * Reads persisted legacy Telegram messages when both the published model and an exact contact channel are present.
 * Gmail remains an assessment: its package exposes a sound legacy Message contract, but the actual writer version
 * is deployment config rather than authoritative workspace metadata, so reads cannot yet be represented honestly.
 */
export const listExternalChannelMessages = (
  params: ListExternalChannelMessagesParams
): Effect.Effect<ListExternalChannelMessagesResult, ExternalChannelMessagesError, HulyClient | Diagnostics> =>
  Effect.gen(function* () {
    const limit = params.limit ?? DEFAULT_EXTERNAL_CHANNEL_MESSAGE_LIMIT
    const client = yield* HulyClient
    if (params.provider === "telegram") {
      return yield* listTelegramMessages(client, params, limit)
    }

    const hasModel = yield* hasMessageModel(client, gmailMessageModelId)
    const reasonCode = hasModel ? "runtime-unverifiable" : "model-unavailable"
    const reason = NonEmptyString.make(hasModel ? GMAIL_RUNTIME_UNVERIFIABLE_REASON : GMAIL_MODEL_UNAVAILABLE_REASON)
    yield* warnUnsupportedRuntime(reason)
    return gmailUnsupportedResult(params, limit, reasonCode, reason)
  })
