import type { ActivityMessage } from "@hcengineering/activity"
import type { ThreadMessage as HulyThreadMessage } from "@hcengineering/chunter"
import {
  type AttachedData,
  type Class,
  type Doc,
  type DocumentUpdate,
  generateId,
  type Ref,
  SortingOrder
} from "@hcengineering/core"
import { Clock, Effect } from "effect"

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
import { ChannelId, MessageId, ThreadReplyId } from "../../domain/schemas/shared.js"
import type { HulyClient, HulyClientError } from "../client.js"
import type { ChannelNotFoundError, HulyError, MessageNotFoundError, ThreadReplyNotFoundError } from "../errors.js"
import { findChannelMessage } from "./channel-messages-shared.js"
import { buildSocialIdToPersonNameMap } from "./channels.js"
import { listTotal, optionalCount } from "./counts.js"
import { markdownToMarkupString, markupToMarkdownString } from "./markup.js"
import { toRef } from "./sdk-boundary.js"
import { findThreadReply, removeThreadReply } from "./thread-replies-shared.js"

import { chunter } from "../huly-plugins.js"

// --- Error Types ---

type ListThreadRepliesError =
  | HulyClientError
  | ChannelNotFoundError
  | MessageNotFoundError

type AddThreadReplyError =
  | HulyClientError
  | ChannelNotFoundError
  | MessageNotFoundError

type UpdateThreadReplyError =
  | HulyClientError
  | ChannelNotFoundError
  | MessageNotFoundError
  | ThreadReplyNotFoundError

type DeleteThreadReplyError =
  | HulyClientError
  | HulyError
  | ChannelNotFoundError
  | MessageNotFoundError
  | ThreadReplyNotFoundError

// --- Operations ---

export const listThreadReplies = (
  params: ListThreadRepliesParams
): Effect.Effect<ListThreadRepliesResult, ListThreadRepliesError, HulyClient> =>
  Effect.gen(function*() {
    const { channel, client, message } = yield* findChannelMessage(params)
    const markupUrlConfig = client.markupUrlConfig

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

    const total = replies.total

    const uniqueSocialIds = [
      ...new Set(
        replies
          .map((msg) => msg.modifiedBy)
      )
    ]

    const socialIdToName = yield* buildSocialIdToPersonNameMap(client, uniqueSocialIds)

    const threadMessages: Array<ThreadMessage> = replies.map((msg) => {
      const senderName = socialIdToName.get(msg.modifiedBy)
      return {
        id: ThreadReplyId.make(msg._id),
        body: markupToMarkdownString(msg.message, markupUrlConfig),
        sender: senderName,
        senderId: msg.modifiedBy,
        createdOn: msg.createdOn,
        modifiedOn: msg.modifiedOn,
        editedOn: msg.editedOn,
        attachments: optionalCount(msg.attachments)
      }
    })

    return { replies: threadMessages, total: listTotal(total) }
  })

export const addThreadReply = (
  params: AddThreadReplyParams
): Effect.Effect<AddThreadReplyResult, AddThreadReplyError, HulyClient> =>
  Effect.gen(function*() {
    const { channel, client, message } = yield* findChannelMessage(params)
    const markupUrlConfig = client.markupUrlConfig

    const replyId: Ref<HulyThreadMessage> = generateId()
    const markup = markdownToMarkupString(params.body, markupUrlConfig)

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
    const { channel, client, message } = yield* findChannelMessage(params)
    const reply = yield* findThreadReply(client, channel, message, params.replyId)
    const markupUrlConfig = client.markupUrlConfig

    const markup = markdownToMarkupString(params.body, markupUrlConfig)

    const now = yield* Clock.currentTimeMillis
    const updateOps: DocumentUpdate<HulyThreadMessage> = {
      message: markup,
      editedOn: now
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
    const { channel, client, message } = yield* findChannelMessage(params)
    const reply = yield* findThreadReply(client, channel, message, params.replyId)

    yield* removeThreadReply(client, reply)

    return { id: ThreadReplyId.make(reply._id), deleted: true }
  })
