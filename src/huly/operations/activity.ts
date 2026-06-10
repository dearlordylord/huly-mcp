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
import { MentionContent } from "../../domain/schemas/domain-values.js"
import {
  ActivityMessageId,
  DocId,
  EmojiCode,
  MentionId,
  ObjectClassName,
  PersonId,
  ReactionId,
  SavedMessageId
} from "../../domain/schemas/shared.js"
import { HulyClient, type HulyClientError } from "../client.js"
import type {
  ChannelNotFoundError,
  DocumentNotFoundError,
  IssueNotFoundError,
  ProjectNotFoundError,
  TeamspaceNotFoundError
} from "../errors.js"
import { ActivityMessageNotFoundError, ReactionNotFoundError, SavedMessageNotFoundError } from "../errors.js"
import { toActivityMessage } from "./activity-shared.js"
import { findChannel } from "./channels.js"
import { findTeamspaceAndDocument } from "./documents.js"
import { findProjectAndIssue } from "./issues-shared.js"
import { clampLimit, findOneOrFail } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"

import { activity, chunter, core, documentPlugin, tracker } from "../huly-plugins.js"

type ListActivityError =
  | HulyClientError
  | ProjectNotFoundError
  | IssueNotFoundError
  | TeamspaceNotFoundError
  | DocumentNotFoundError
  | ChannelNotFoundError

type AddReactionError = HulyClientError | ActivityMessageNotFoundError

type RemoveReactionError = HulyClientError | ReactionNotFoundError

type ListReactionsError = HulyClientError

type SaveMessageError = HulyClientError | ActivityMessageNotFoundError

type UnsaveMessageError = HulyClientError | SavedMessageNotFoundError

type ListSavedMessagesError = HulyClientError

type ListMentionsError = HulyClientError

const optionalPersonId = (value: string | undefined): PersonId | undefined =>
  value === undefined || value === "" ? undefined : PersonId.make(value)

interface ActivityTarget {
  readonly client: HulyClient["Type"]
  readonly objectId: DocId
  readonly objectClass: ObjectClassName
}

const activityTarget = (
  client: HulyClient["Type"],
  objectId: string,
  objectClass: string
): ActivityTarget => ({
  client,
  objectId: DocId.make(objectId),
  objectClass: ObjectClassName.make(objectClass)
})

const resolveActivityTarget = (
  params: ListActivityParams
): Effect.Effect<ActivityTarget, ListActivityError, HulyClient> =>
  Effect.gen(function*() {
    if (params.objectId !== undefined && params.objectClass !== undefined) {
      const client = yield* HulyClient
      return activityTarget(client, params.objectId, params.objectClass)
    }

    if (params.project !== undefined && params.issueIdentifier !== undefined) {
      const { client, issue } = yield* findProjectAndIssue({
        project: params.project,
        identifier: params.issueIdentifier
      })
      return activityTarget(client, issue._id, tracker.class.Issue)
    }

    if (params.teamspace !== undefined && params.document !== undefined) {
      const { client, doc } = yield* findTeamspaceAndDocument({
        teamspace: params.teamspace,
        document: params.document
      })
      return activityTarget(client, doc._id, documentPlugin.class.Document)
    }

    if (params.channel !== undefined) {
      const { channel, client } = yield* findChannel(params.channel)
      return activityTarget(client, channel._id, chunter.class.Channel)
    }

    return yield* Effect.dieMessage(
      "Invalid list_activity parameters: choose objectId+objectClass, project+issueIdentifier, teamspace+document, or channel."
    )
  })

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
    const target = yield* resolveActivityTarget(params)

    const limit = clampLimit(params.limit)

    const messages = yield* target.client.findAll<HulyActivityMessage>(
      activity.class.ActivityMessage,
      {
        attachedTo: toRef<Doc>(target.objectId),
        attachedToClass: toRef<Class<Doc>>(target.objectClass)
      },
      {
        limit,
        sort: {
          modifiedOn: SortingOrder.Descending
        }
      }
    )

    const result: Array<ActivityMessage> = messages.map((msg) => toActivityMessage(msg, target.client.markupUrlConfig))

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
      content: MentionContent.make(m.content)
    }))

    return result
  })
