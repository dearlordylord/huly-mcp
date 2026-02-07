import type { ActivityMessage } from "@hcengineering/activity"
import type { Channel as HulyChannel, ChatMessage, ThreadMessage as HulyThreadMessage } from "@hcengineering/chunter"
import {
  type AttachedData,
  type Class,
  type Doc,
  type DocumentUpdate,
  generateId,
  type PersonId,
  type Ref,
  SortingOrder
} from "@hcengineering/core"
import { Effect } from "effect"

import type {
  AddThreadReplyParams,
  DeleteThreadReplyParams,
  ListThreadRepliesParams,
  ThreadMessage,
  UpdateThreadReplyParams
} from "../../domain/schemas.js"
import type {
  AddThreadReplyResult,
  DeleteThreadReplyResult,
  ListThreadRepliesResult,
  UpdateThreadReplyResult
} from "../../domain/schemas/channels.js"
import { ChannelId, MessageId, PersonName, ThreadReplyId } from "../../domain/schemas/shared.js"
import type { HulyClient, HulyClientError } from "../client.js"
import type { ChannelNotFoundError } from "../errors.js"
import { MessageNotFoundError, ThreadReplyNotFoundError } from "../errors.js"
import {
  buildSocialIdToPersonNameMap,
  findChannel,
  markdownToMarkupString,
  markupToMarkdownString
} from "./channels.js"
import { toRef } from "./shared.js"

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/consistent-type-imports -- CJS interop
const chunter = require("@hcengineering/chunter").default as typeof import("@hcengineering/chunter").default

// --- Error Types ---

export type ListThreadRepliesError =
  | HulyClientError
  | ChannelNotFoundError
  | MessageNotFoundError

export type AddThreadReplyError =
  | HulyClientError
  | ChannelNotFoundError
  | MessageNotFoundError

export type UpdateThreadReplyError =
  | HulyClientError
  | ChannelNotFoundError
  | MessageNotFoundError
  | ThreadReplyNotFoundError

export type DeleteThreadReplyError =
  | HulyClientError
  | ChannelNotFoundError
  | MessageNotFoundError
  | ThreadReplyNotFoundError

export type { AddThreadReplyResult, DeleteThreadReplyResult, ListThreadRepliesResult, UpdateThreadReplyResult }

// --- Helpers ---

const findMessage = (
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

// --- Operations ---

export const listThreadReplies = (
  params: ListThreadRepliesParams
): Effect.Effect<ListThreadRepliesResult, ListThreadRepliesError, HulyClient> =>
  Effect.gen(function*() {
    const { channel, client, message } = yield* findMessage(params.channel, params.messageId)

    const limit = Math.min(params.limit ?? 50, 200)

    const replies = yield* client.findAll<HulyThreadMessage>(
      chunter.class.ThreadMessage,
      {
        attachedTo: toRef<ActivityMessage>(message._id),
        space: channel._id
      },
      {
        limit,
        sort: {
          createdOn: SortingOrder.Ascending
        }
      }
    )

    const total = replies.total ?? replies.length

    const uniqueSocialIds = [
      ...new Set(
        replies
          .map((msg) => msg.modifiedBy)
          .filter((id): id is PersonId => id !== undefined)
      )
    ]

    const socialIdToName = yield* buildSocialIdToPersonNameMap(client, uniqueSocialIds)

    const threadMessages: Array<ThreadMessage> = replies.map((msg) => {
      const senderName = msg.modifiedBy ? socialIdToName.get(msg.modifiedBy) : undefined
      return {
        id: ThreadReplyId.make(msg._id),
        body: markupToMarkdownString(msg.message),
        sender: senderName !== undefined ? PersonName.make(senderName) : undefined,
        senderId: msg.modifiedBy,
        createdOn: msg.createdOn,
        modifiedOn: msg.modifiedOn,
        editedOn: msg.editedOn
      }
    })

    return { replies: threadMessages, total }
  })

export const addThreadReply = (
  params: AddThreadReplyParams
): Effect.Effect<AddThreadReplyResult, AddThreadReplyError, HulyClient> =>
  Effect.gen(function*() {
    const { channel, client, message } = yield* findMessage(params.channel, params.messageId)

    const replyId: Ref<HulyThreadMessage> = generateId()
    const markup = markdownToMarkupString(params.body)

    const replyData: AttachedData<HulyThreadMessage> = {
      message: markup,
      attachments: 0,
      objectId: toRef<Doc>(channel._id),
      objectClass: toRef<Class<Doc>>(chunter.class.Channel)
    }

    yield* client.addCollection(
      chunter.class.ThreadMessage,
      channel._id,
      toRef<ActivityMessage>(message._id),
      toRef<Class<ActivityMessage>>(chunter.class.ChatMessage),
      "replies",
      replyData,
      replyId
    )

    return {
      id: ThreadReplyId.make(replyId),
      messageId: MessageId.make(message._id),
      channelId: ChannelId.make(channel._id)
    }
  })

export const updateThreadReply = (
  params: UpdateThreadReplyParams
): Effect.Effect<UpdateThreadReplyResult, UpdateThreadReplyError, HulyClient> =>
  Effect.gen(function*() {
    const { channel, client, message } = yield* findMessage(params.channel, params.messageId)

    const reply = yield* client.findOne<HulyThreadMessage>(
      chunter.class.ThreadMessage,
      {
        _id: toRef<HulyThreadMessage>(params.replyId),
        attachedTo: toRef<ActivityMessage>(message._id),
        space: channel._id
      }
    )

    if (reply === undefined) {
      return yield* new ThreadReplyNotFoundError({
        replyId: params.replyId,
        messageId: params.messageId
      })
    }

    const markup = markdownToMarkupString(params.body)

    const updateOps: DocumentUpdate<HulyThreadMessage> = {
      message: markup,
      editedOn: Date.now()
    }

    yield* client.updateDoc(
      chunter.class.ThreadMessage,
      channel._id,
      reply._id,
      updateOps
    )

    return { id: ThreadReplyId.make(reply._id), updated: true }
  })

export const deleteThreadReply = (
  params: DeleteThreadReplyParams
): Effect.Effect<DeleteThreadReplyResult, DeleteThreadReplyError, HulyClient> =>
  Effect.gen(function*() {
    const { channel, client, message } = yield* findMessage(params.channel, params.messageId)

    const reply = yield* client.findOne<HulyThreadMessage>(
      chunter.class.ThreadMessage,
      {
        _id: toRef<HulyThreadMessage>(params.replyId),
        attachedTo: toRef<ActivityMessage>(message._id),
        space: channel._id
      }
    )

    if (reply === undefined) {
      return yield* new ThreadReplyNotFoundError({
        replyId: params.replyId,
        messageId: params.messageId
      })
    }

    yield* client.removeDoc(
      chunter.class.ThreadMessage,
      channel._id,
      reply._id
    )

    return { id: ThreadReplyId.make(reply._id), deleted: true }
  })
