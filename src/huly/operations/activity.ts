import type {
  ActivityMessage as HulyActivityMessage,
  Reaction as HulyReaction,
  SavedMessage as HulySavedMessage,
  UserMentionInfo
} from "@hcengineering/activity"
import type { AttachedData, Class, Doc, Ref } from "@hcengineering/core"
import { generateId, SortingOrder } from "@hcengineering/core"
import { Effect } from "effect"

import type {
  ActivityMessage,
  AddReactionParams,
  AddReactionResult,
  ListActivityParams,
  ListMentionsParams,
  ListReactionsParams,
  ListSavedMessagesParams,
  Mention,
  Reaction,
  RemoveReactionParams,
  RemoveReactionResult,
  SavedMessage,
  SaveMessageParams,
  SaveMessageResult,
  UnsaveMessageParams,
  UnsaveMessageResult
} from "../../domain/schemas/activity.js"
import { ActivityMessageId, EmojiCode, NonEmptyString, ObjectClassName } from "../../domain/schemas/shared.js"
import { HulyClient, type HulyClientError } from "../client.js"
import { ActivityMessageNotFoundError, ReactionNotFoundError, SavedMessageNotFoundError } from "../errors.js"
import { toRef } from "./shared.js"

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/consistent-type-imports -- CJS interop
const activity = require("@hcengineering/activity").default as typeof import("@hcengineering/activity").default
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/consistent-type-imports -- CJS interop
const core = require("@hcengineering/core").default as typeof import("@hcengineering/core").default

export type ListActivityError = HulyClientError

export type AddReactionError = HulyClientError | ActivityMessageNotFoundError

export type RemoveReactionError = HulyClientError | ReactionNotFoundError

export type ListReactionsError = HulyClientError

export type SaveMessageError = HulyClientError | ActivityMessageNotFoundError

export type UnsaveMessageError = HulyClientError | SavedMessageNotFoundError

export type ListSavedMessagesError = HulyClientError

export type ListMentionsError = HulyClientError

// SDK: Data<Reaction> requires createBy but server populates from auth context.
const serverPopulatedCreateBy: HulyReaction["createBy"] = "" as HulyReaction["createBy"]

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
        attachedTo: toRef<Doc>(params.objectId),
        attachedToClass: toRef<Class<Doc>>(params.objectClass)
      },
      {
        limit,
        sort: {
          modifiedOn: SortingOrder.Descending
        }
      }
    )

    const result: Array<ActivityMessage> = messages.map((msg) => ({
      id: ActivityMessageId.make(msg._id),
      objectId: msg.attachedTo,
      objectClass: ObjectClassName.make(msg.attachedToClass),
      modifiedBy: msg.modifiedBy,
      modifiedOn: msg.modifiedOn,
      isPinned: msg.isPinned,
      replies: msg.replies,
      reactions: msg.reactions,
      editedOn: msg.editedOn
    }))

    return result
  })

export type { AddReactionResult, RemoveReactionResult, SaveMessageResult, UnsaveMessageResult }

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
      { _id: toRef<HulyActivityMessage>(params.messageId) }
    )

    if (message === undefined) {
      return yield* new ActivityMessageNotFoundError({ messageId: params.messageId })
    }

    const reactionId: Ref<HulyReaction> = generateId()

    const reactionData: AttachedData<HulyReaction> = {
      emoji: params.emoji,
      createBy: serverPopulatedCreateBy
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
      reactionId: NonEmptyString.make(reactionId),
      messageId: ActivityMessageId.make(params.messageId)
    }
  })

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
        attachedTo: toRef<HulyActivityMessage>(params.messageId),
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
      messageId: ActivityMessageId.make(params.messageId),
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
        attachedTo: toRef<HulyActivityMessage>(params.messageId)
      },
      { limit }
    )

    const result: Array<Reaction> = reactions.map((r) => ({
      id: r._id,
      messageId: ActivityMessageId.make(r.attachedTo),
      emoji: EmojiCode.make(r.emoji),
      createdBy: r.createBy
    }))

    return result
  })

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
      { _id: toRef<HulyActivityMessage>(params.messageId) }
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
      savedId: NonEmptyString.make(savedId),
      messageId: ActivityMessageId.make(params.messageId)
    }
  })

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
        attachedTo: toRef<HulyActivityMessage>(params.messageId)
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
      messageId: ActivityMessageId.make(params.messageId),
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
      id: s._id,
      messageId: ActivityMessageId.make(s.attachedTo)
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
      id: m._id,
      messageId: ActivityMessageId.make(m.attachedTo),
      userId: m.user,
      content: m.content
    }))

    return result
  })
