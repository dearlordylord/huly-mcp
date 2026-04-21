/**
 * Channel message edit and delete operations.
 *
 * @module
 */
import type { Channel as HulyChannel, ChatMessage } from "@hcengineering/chunter"
import type { DocumentUpdate } from "@hcengineering/core"
import { Clock, Effect } from "effect"

import type { DeleteChannelMessageParams, UpdateChannelMessageParams } from "../../domain/schemas.js"
import type { DeleteChannelMessageResult, UpdateChannelMessageResult } from "../../domain/schemas/channels.js"
import { MessageId } from "../../domain/schemas/shared.js"
import type { HulyClient, HulyClientError } from "../client.js"
import type { ChannelNotFoundError } from "../errors.js"
import { MessageNotFoundError } from "../errors.js"
import { findChannel } from "./channels.js"
import { markdownToMarkupString } from "./markup.js"
import { toRef } from "./shared.js"

import { chunter } from "../huly-plugins.js"

type UpdateChannelMessageError =
  | HulyClientError
  | ChannelNotFoundError
  | MessageNotFoundError

type DeleteChannelMessageError =
  | HulyClientError
  | ChannelNotFoundError
  | MessageNotFoundError

const findChannelMessage = (
  channelIdentifier: string,
  messageId: string
): Effect.Effect<
  { client: HulyClient["Type"]; channel: HulyChannel; message: ChatMessage },
  ChannelNotFoundError | MessageNotFoundError | HulyClientError,
  HulyClient
> =>
  Effect.gen(function*() {
    const { channel, client } = yield* findChannel(channelIdentifier)

    const message = yield* client.findOne<ChatMessage>(
      chunter.class.ChatMessage,
      {
        _id: toRef<ChatMessage>(messageId),
        space: channel._id
      }
    )

    if (message === undefined) {
      return yield* new MessageNotFoundError({ messageId, channel: channelIdentifier })
    }

    return { client, channel, message }
  })

/**
 * Update an existing channel message. Only the body can be modified.
 */
export const updateChannelMessage = (
  params: UpdateChannelMessageParams
): Effect.Effect<UpdateChannelMessageResult, UpdateChannelMessageError, HulyClient> =>
  Effect.gen(function*() {
    const { channel, client, message } = yield* findChannelMessage(params.channel, params.messageId)
    const markupUrlConfig = client.markupUrlConfig

    const markup = markdownToMarkupString(params.body, markupUrlConfig)

    const now = yield* Clock.currentTimeMillis
    const updateOps: DocumentUpdate<ChatMessage> = {
      message: markup,
      editedOn: now
    }

    yield* client.updateDoc(
      chunter.class.ChatMessage,
      channel._id,
      message._id,
      updateOps
    )

    return { id: MessageId.make(message._id), updated: true }
  })

/**
 * Permanently delete a channel message.
 */
export const deleteChannelMessage = (
  params: DeleteChannelMessageParams
): Effect.Effect<DeleteChannelMessageResult, DeleteChannelMessageError, HulyClient> =>
  Effect.gen(function*() {
    const { channel, client, message } = yield* findChannelMessage(params.channel, params.messageId)

    yield* client.removeDoc(
      chunter.class.ChatMessage,
      channel._id,
      message._id
    )

    return { id: MessageId.make(message._id), deleted: true }
  })
