import type { ActivityMessage } from "@hcengineering/activity"
import type { ThreadMessage as HulyThreadMessage } from "@hcengineering/chunter"
import { Effect } from "effect"

import type { HulyClient, HulyClientError } from "../client.js"
import { HulyError } from "../errors.js"
import { chunter } from "../huly-plugins.js"

type RemoveThreadReplyError = HulyClientError | HulyError

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
