import type {
  ActivityMessage as HulyActivityMessage,
  Reaction as HulyReaction,
  SavedMessage as HulySavedMessage,
  UserMentionInfo
} from "@hcengineering/activity"
import type { AttachedData, Class, Doc, Ref } from "@hcengineering/core"
import { generateId, SortingOrder } from "@hcengineering/core"
import { Effect } from "effect"

import {
  ActivityCount,
  type ActivityMessage,
  type AddReactionParams,
  type AddReactionResult,
  type ListActivityParams,
  type ListMentionsParams,
  type ListReactionsParams,
  type ListSavedMessagesParams,
  type Mention,
  type Reaction,
  type RemoveReactionParams,
  type RemoveReactionResult,
  type SavedMessage,
  type SaveMessageParams,
  type SaveMessageResult,
  type UnsaveMessageParams,
  type UnsaveMessageResult
} from "../../domain/schemas/activity.js"
import {
  ActivityMessageId,
  EmojiCode,
  MentionId,
  NonEmptyString,
  ObjectClassName,
  PersonId,
  ReactionId,
  SavedMessageId,
  Timestamp
} from "../../domain/schemas/shared.js"
import { HulyClient, type HulyClientError } from "../client.js"
import { ActivityMessageNotFoundError, ReactionNotFoundError, SavedMessageNotFoundError } from "../errors.js"
import { clampLimit, findOneOrFail } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"

import { activity, core } from "../huly-plugins.js"

type ListActivityError = HulyClientError

type AddReactionError = HulyClientError | ActivityMessageNotFoundError

type RemoveReactionError = HulyClientError | ReactionNotFoundError

type ListReactionsError = HulyClientError

type SaveMessageError = HulyClientError | ActivityMessageNotFoundError

type UnsaveMessageError = HulyClientError | SavedMessageNotFoundError

type ListSavedMessagesError = HulyClientError

type ListMentionsError = HulyClientError

const optionalTimestamp = (value: number | undefined): Timestamp | undefined =>
  value === undefined ? undefined : Timestamp.make(value)

const optionalNullableTimestamp = (value: number | null | undefined): Timestamp | null | undefined =>
  value === undefined || value === null ? value : Timestamp.make(value)

const optionalActivityCount = (value: number | undefined): ActivityCount | undefined =>
  value === undefined ? undefined : ActivityCount.make(value)

const optionalPersonId = (value: string | undefined): PersonId | undefined =>
  value === undefined || value === "" ? undefined : PersonId.make(value)

// SDK: Data<Reaction> requires createBy (PersonId, branded string) but server populates from auth context.
// PersonId = string & { __personId: true }; no SDK factory exists. Empty string is overwritten server-side.
// eslint-disable-next-line no-restricted-syntax -- see above
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

    const limit = clampLimit(params.limit)

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
      objectId: NonEmptyString.make(msg.attachedTo),
      objectClass: ObjectClassName.make(msg.attachedToClass),
      modifiedBy: PersonId.make(msg.modifiedBy),
      modifiedOn: optionalTimestamp(msg.modifiedOn),
      isPinned: msg.isPinned,
      replies: optionalActivityCount(msg.replies),
      reactions: optionalActivityCount(msg.reactions),
      editedOn: optionalNullableTimestamp(msg.editedOn)
    }))

    return result
  })

/**
 * Add a reaction to an activity message.
 */
export const addReaction = (
  params: AddReactionParams
): Effect.Effect<AddReactionResult, AddReactionError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient

    const message = yield* findOneOrFail(
      client,
      activity.class.ActivityMessage,
      { _id: toRef<HulyActivityMessage>(params.messageId) },
      () => new ActivityMessageNotFoundError({ messageId: params.messageId })
    )

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
      reactionId: ReactionId.make(reactionId),
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

    const reaction = yield* findOneOrFail(
      client,
      activity.class.Reaction,
      {
        attachedTo: toRef<HulyActivityMessage>(params.messageId),
        emoji: params.emoji
      },
      () =>
        new ReactionNotFoundError({
          messageId: params.messageId,
          emoji: params.emoji
        })
    )

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

    const limit = clampLimit(params.limit)

    const reactions = yield* client.findAll<HulyReaction>(
      activity.class.Reaction,
      {
        attachedTo: toRef<HulyActivityMessage>(params.messageId)
      },
      { limit }
    )

    const result: Array<Reaction> = reactions.map((r) => ({
      id: ReactionId.make(r._id),
      messageId: ActivityMessageId.make(r.attachedTo),
      emoji: EmojiCode.make(r.emoji),
      createdBy: optionalPersonId(r.createBy)
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

    const message = yield* findOneOrFail(
      client,
      activity.class.ActivityMessage,
      { _id: toRef<HulyActivityMessage>(params.messageId) },
      () => new ActivityMessageNotFoundError({ messageId: params.messageId })
    )

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
      savedId: SavedMessageId.make(savedId),
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

    const saved = yield* findOneOrFail(
      client,
      activity.class.SavedMessage,
      {
        attachedTo: toRef<HulyActivityMessage>(params.messageId)
      },
      () => new SavedMessageNotFoundError({ messageId: params.messageId })
    )

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

    const limit = clampLimit(params.limit)

    const saved = yield* client.findAll<HulySavedMessage>(
      activity.class.SavedMessage,
      {},
      { limit }
    )

    const result: Array<SavedMessage> = saved.map((s) => ({
      id: SavedMessageId.make(s._id),
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

    const limit = clampLimit(params.limit)

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
      id: MentionId.make(m._id),
      messageId: ActivityMessageId.make(m.attachedTo),
      userId: PersonId.make(m.user),
      content: m.content
    }))

    return result
  })
