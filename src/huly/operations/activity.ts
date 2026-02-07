import type { ActivityMessage as HulyActivityMessage, Reaction as HulyReaction, SavedMessage as HulySavedMessage, UserMentionInfo } from "@hcengineering/activity"
import type { AttachedData, Class, Doc, Ref } from "@hcengineering/core"
import { generateId, SortingOrder } from "@hcengineering/core"
import { Effect } from "effect"

import type {
  ActivityMessage,
  AddReactionParams,
  ListActivityParams,
  ListMentionsParams,
  ListReactionsParams,
  ListSavedMessagesParams,
  Mention,
  Reaction,
  RemoveReactionParams,
  SavedMessage,
  SaveMessageParams,
  UnsaveMessageParams
} from "../../domain/schemas/activity.js"
import { HulyClient, type HulyClientError } from "../client.js"
import { ActivityMessageNotFoundError, ReactionNotFoundError, SavedMessageNotFoundError } from "../errors.js"

// eslint-disable-next-line @typescript-eslint/no-require-imports
const activity = require("@hcengineering/activity").default as typeof import("@hcengineering/activity").default
// eslint-disable-next-line @typescript-eslint/no-require-imports
const core = require("@hcengineering/core").default as typeof import("@hcengineering/core").default

export type ListActivityError = HulyClientError

export type AddReactionError = HulyClientError | ActivityMessageNotFoundError

export type RemoveReactionError = HulyClientError | ReactionNotFoundError

export type ListReactionsError = HulyClientError

export type SaveMessageError = HulyClientError | ActivityMessageNotFoundError

export type UnsaveMessageError = HulyClientError | SavedMessageNotFoundError

export type ListSavedMessagesError = HulyClientError

export type ListMentionsError = HulyClientError

/**
 * List activity messages for an object.
 * Results sorted by modifiedOn descending (newest first).
 */
export const listActivity = (
  params: ListActivityParams
): Effect.Effect<Array<ActivityMessage>, ListActivityError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient

    const limit = Math.min(params.limit ?? 50, 200)

    const messages = yield* client.findAll<HulyActivityMessage>(
      activity.class.ActivityMessage,
      {
        attachedTo: params.objectId as Ref<Doc>,
        attachedToClass: params.objectClass as Ref<Class<Doc>>
      },
      {
        limit,
        sort: {
          modifiedOn: SortingOrder.Descending
        }
      }
    )

    const result: Array<ActivityMessage> = messages.map((msg) => ({
      id: String(msg._id),
      objectId: String(msg.attachedTo),
      objectClass: String(msg.attachedToClass),
      modifiedBy: msg.modifiedBy ? String(msg.modifiedBy) : undefined,
      modifiedOn: msg.modifiedOn,
      isPinned: msg.isPinned,
      replies: msg.replies,
      reactions: msg.reactions,
      editedOn: msg.editedOn
    }))

    return result
  })

export interface AddReactionResult {
  reactionId: string
  messageId: string
}

/**
 * Add a reaction to an activity message.
 */
export const addReaction = (
  params: AddReactionParams
): Effect.Effect<AddReactionResult, AddReactionError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient

    const message = yield* client.findOne<HulyActivityMessage>(
      activity.class.ActivityMessage,
      { _id: params.messageId as Ref<HulyActivityMessage> }
    )

    if (message === undefined) {
      return yield* new ActivityMessageNotFoundError({ messageId: params.messageId })
    }

    const reactionId: Ref<HulyReaction> = generateId()

    const reactionData: AttachedData<HulyReaction> = {
      emoji: params.emoji,
      createBy: "" as HulyReaction["createBy"]
    }

    yield* client.addCollection(
      activity.class.Reaction,
      message.space,
      message._id,
      activity.class.ActivityMessage,
      "reactions",
      reactionData,
      reactionId
    )

    return {
      reactionId: String(reactionId),
      messageId: params.messageId
    }
  })

export interface RemoveReactionResult {
  messageId: string
  removed: boolean
}

/**
 * Remove a reaction from an activity message.
 */
export const removeReaction = (
  params: RemoveReactionParams
): Effect.Effect<RemoveReactionResult, RemoveReactionError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient

    const reaction = yield* client.findOne<HulyReaction>(
      activity.class.Reaction,
      {
        attachedTo: params.messageId as Ref<HulyActivityMessage>,
        emoji: params.emoji
      }
    )

    if (reaction === undefined) {
      return yield* new ReactionNotFoundError({
        messageId: params.messageId,
        emoji: params.emoji
      })
    }

    yield* client.removeDoc(
      activity.class.Reaction,
      reaction.space,
      reaction._id
    )

    return {
      messageId: params.messageId,
      removed: true
    }
  })

/**
 * List reactions on an activity message.
 */
export const listReactions = (
  params: ListReactionsParams
): Effect.Effect<Array<Reaction>, ListReactionsError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient

    const limit = Math.min(params.limit ?? 50, 200)

    const reactions = yield* client.findAll<HulyReaction>(
      activity.class.Reaction,
      {
        attachedTo: params.messageId as Ref<HulyActivityMessage>
      },
      { limit }
    )

    const result: Array<Reaction> = reactions.map((r) => ({
      id: String(r._id),
      messageId: String(r.attachedTo),
      emoji: r.emoji,
      createdBy: r.createBy ? String(r.createBy) : undefined
    }))

    return result
  })

export interface SaveMessageResult {
  savedId: string
  messageId: string
}

/**
 * Save/bookmark an activity message.
 */
export const saveMessage = (
  params: SaveMessageParams
): Effect.Effect<SaveMessageResult, SaveMessageError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient

    const message = yield* client.findOne<HulyActivityMessage>(
      activity.class.ActivityMessage,
      { _id: params.messageId as Ref<HulyActivityMessage> }
    )

    if (message === undefined) {
      return yield* new ActivityMessageNotFoundError({ messageId: params.messageId })
    }

    const savedId: Ref<HulySavedMessage> = generateId()

    yield* client.createDoc(
      activity.class.SavedMessage,
      core.space.Workspace,
      {
        attachedTo: message._id
      },
      savedId
    )

    return {
      savedId: String(savedId),
      messageId: params.messageId
    }
  })

export interface UnsaveMessageResult {
  messageId: string
  removed: boolean
}

/**
 * Remove a message from saved/bookmarks.
 */
export const unsaveMessage = (
  params: UnsaveMessageParams
): Effect.Effect<UnsaveMessageResult, UnsaveMessageError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient

    const saved = yield* client.findOne<HulySavedMessage>(
      activity.class.SavedMessage,
      {
        attachedTo: params.messageId as Ref<HulyActivityMessage>
      }
    )

    if (saved === undefined) {
      return yield* new SavedMessageNotFoundError({ messageId: params.messageId })
    }

    yield* client.removeDoc(
      activity.class.SavedMessage,
      saved.space,
      saved._id
    )

    return {
      messageId: params.messageId,
      removed: true
    }
  })

/**
 * List saved/bookmarked messages for the current user.
 */
export const listSavedMessages = (
  params: ListSavedMessagesParams
): Effect.Effect<Array<SavedMessage>, ListSavedMessagesError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient

    const limit = Math.min(params.limit ?? 50, 200)

    const saved = yield* client.findAll<HulySavedMessage>(
      activity.class.SavedMessage,
      {},
      { limit }
    )

    const result: Array<SavedMessage> = saved.map((s) => ({
      id: String(s._id),
      messageId: String(s.attachedTo)
    }))

    return result
  })

/**
 * List mentions of the current user.
 */
export const listMentions = (
  params: ListMentionsParams
): Effect.Effect<Array<Mention>, ListMentionsError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient

    const limit = Math.min(params.limit ?? 50, 200)

    const mentions = yield* client.findAll<UserMentionInfo>(
      activity.class.UserMentionInfo,
      {},
      {
        limit,
        sort: {
          modifiedOn: SortingOrder.Descending
        }
      }
    )

    const result: Array<Mention> = mentions.map((m) => ({
      id: String(m._id),
      messageId: String(m.attachedTo),
      userId: String(m.user),
      content: m.content
    }))

    return result
  })
