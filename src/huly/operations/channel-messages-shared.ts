import type { Channel as HulyChannel, ChatMessage } from "@hcengineering/chunter"
import { Effect } from "effect"

import type { ChannelIdentifier, MessageId } from "../../domain/schemas/shared.js"
import type { HulyClient, HulyClientError } from "../client.js"
import type { ChannelNotFoundError } from "../errors.js"
import { MessageNotFoundError } from "../errors.js"
import { findChannel } from "./channels.js"
import { toRef } from "./shared.js"

import { chunter } from "../huly-plugins.js"

export const findChannelMessage = (
  params: {
    channel: ChannelIdentifier
    messageId: MessageId
  }
): Effect.Effect<
  { client: HulyClient["Type"]; channel: HulyChannel; message: ChatMessage },
  ChannelNotFoundError | MessageNotFoundError | HulyClientError,
  HulyClient
> =>
  Effect.gen(function*() {
    const { channel, client } = yield* findChannel(params.channel)

    const message = yield* client.findOne<ChatMessage>(
      chunter.class.ChatMessage,
      {
        _id: toRef<ChatMessage>(params.messageId),
        space: channel._id
      }
    )

    if (message === undefined) {
      return yield* new MessageNotFoundError({
        messageId: params.messageId,
        channel: params.channel
      })
    }

    return { client, channel, message }
  })
