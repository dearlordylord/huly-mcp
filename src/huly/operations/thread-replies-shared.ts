import type { ActivityMessage } from "@hcengineering/activity"
import type { Channel as HulyChannel, ChatMessage, ThreadMessage as HulyThreadMessage } from "@hcengineering/chunter"
import { Effect } from "effect"

import type { ThreadReplyId } from "../../domain/schemas/shared.js"
import type { HulyClient, HulyClientError } from "../client.js"
import { HulyError, ThreadReplyNotFoundError } from "../errors.js"
import { chunter } from "../huly-plugins.js"
import { hulyQuery } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"

type RemoveThreadReplyError = HulyClientError | HulyError

export const findThreadReply = (
  client: HulyClient["Type"],
  channel: HulyChannel,
  message: ChatMessage,
  replyId: ThreadReplyId
): Effect.Effect<HulyThreadMessage, ThreadReplyNotFoundError | HulyClientError> =>
  Effect.gen(function*() {
    const reply = yield* client.findOne<HulyThreadMessage>(
      chunter.class.ThreadMessage,
      hulyQuery<HulyThreadMessage>({
        _id: toRef<HulyThreadMessage>(replyId),
        attachedTo: toRef<ActivityMessage>(message._id),
        space: channel._id
      })
    )

    if (reply === undefined) {
      return yield* new ThreadReplyNotFoundError({
        replyId,
        messageId: message._id
      })
    }

    return reply
  })

export const removeThreadReply = (
  client: HulyClient["Type"],
  reply: HulyThreadMessage
): Effect.Effect<void, RemoveThreadReplyError> =>
  Effect.gen(function*() {
    const removeCollection = client.removeCollection
    if (removeCollection === undefined) {
      return yield* new HulyError({ message: "Huly client does not support removeCollection" })
    }

    yield* removeCollection<ActivityMessage, HulyThreadMessage>(
      chunter.class.ThreadMessage,
      reply.space,
      reply._id,
      reply.attachedTo,
      reply.attachedToClass,
      reply.collection
    )
  })
