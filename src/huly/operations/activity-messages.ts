import type {
  ActivityMessage as HulyActivityMessage,
  ActivityMessagesFilter as HulyActivityMessagesFilter,
  ActivityReference as HulyActivityReference
} from "@hcengineering/activity"
import type { ThreadMessage as HulyThreadMessage } from "@hcengineering/chunter"
import type { AttachedData, Class, Doc, DocumentQuery, DocumentUpdate, Ref } from "@hcengineering/core"
import { generateId, SortingOrder } from "@hcengineering/core"
import { Clock, Effect } from "effect"

import type {
  ActivityFilter,
  ActivityReference,
  AddActivityReplyParams,
  AddActivityReplyResult,
  DeleteActivityReplyParams,
  DeleteActivityReplyResult,
  GetActivityMessageParams,
  ListActivityFiltersParams,
  ListActivityReferencesParams,
  ListActivityRepliesParams,
  PinActivityMessageParams,
  PinActivityMessageResult,
  UpdateActivityReplyParams,
  UpdateActivityReplyResult
} from "../../domain/schemas/activity-messages.js"
import type { ActivityMessage } from "../../domain/schemas/activity.js"
import { ActivityFilterPosition, ActivityMarkup, DisplayText } from "../../domain/schemas/domain-values.js"
import {
  ActivityFilterId,
  ActivityMessageId,
  ActivityReferenceId,
  DocId,
  ObjectClassName,
  Timestamp
} from "../../domain/schemas/shared.js"
import { HulyClient, type HulyClientError } from "../client.js"
import { ActivityMessageNotFoundError } from "../errors.js"
import { activity, chunter } from "../huly-plugins.js"
import { findActivityMessage, toActivityMessage } from "./activity-shared.js"
import { markdownToMarkupString } from "./markup.js"
import { clampLimit, findOneOrFail, hulyQuery, type StrictDocumentQuery } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"

type GetActivityMessageError = HulyClientError | ActivityMessageNotFoundError
type PinActivityMessageError = HulyClientError | ActivityMessageNotFoundError
type ListActivityFiltersError = HulyClientError
type ListActivityReferencesError = HulyClientError
type ListActivityRepliesError = HulyClientError | ActivityMessageNotFoundError
type AddActivityReplyError = HulyClientError | ActivityMessageNotFoundError
type UpdateActivityReplyError = HulyClientError | ActivityMessageNotFoundError
type DeleteActivityReplyError = HulyClientError | ActivityMessageNotFoundError

export const getActivityMessage = (
  params: GetActivityMessageParams
): Effect.Effect<ActivityMessage, GetActivityMessageError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const message = yield* findActivityMessage(client, params.messageId)
    return toActivityMessage(message, client.markupUrlConfig)
  })

export const pinActivityMessage = (
  params: PinActivityMessageParams
): Effect.Effect<PinActivityMessageResult, PinActivityMessageError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const message = yield* findActivityMessage(client, params.messageId)

    if ((message.isPinned ?? false) === params.pinned) {
      return { messageId: ActivityMessageId.make(message._id), pinned: params.pinned }
    }

    yield* client.updateDoc(activity.class.ActivityMessage, message.space, message._id, { isPinned: params.pinned })
    return { messageId: ActivityMessageId.make(message._id), pinned: params.pinned }
  })

export const listActivityFilters = (
  params: ListActivityFiltersParams
): Effect.Effect<Array<ActivityFilter>, ListActivityFiltersError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const limit = clampLimit(params.limit)
    const filters = yield* client.findAll<HulyActivityMessagesFilter>(
      activity.class.ActivityMessagesFilter,
      hulyQuery<HulyActivityMessagesFilter>({}),
      { limit, sort: { position: SortingOrder.Ascending } }
    )

    return filters.map(filter => ({
      id: ActivityFilterId.make(filter._id),
      label: typeof filter.label === "string" && filter.label.length > 0 ? DisplayText.make(filter.label) : undefined,
      position: ActivityFilterPosition.make(filter.position)
    }))
  })

export const listActivityReferences = (
  params: ListActivityReferencesParams
): Effect.Effect<Array<ActivityReference>, ListActivityReferencesError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const limit = clampLimit(params.limit)
    const sourceQuery = {
      srcDocId: toRef<Doc>(params.objectId),
      srcDocClass: toRef<Class<Doc>>(params.objectClass)
    } satisfies StrictDocumentQuery<HulyActivityReference>
    const attachedQuery = {
      attachedDocId: toRef<Doc>(params.objectId),
      attachedDocClass: toRef<Class<Doc>>(params.objectClass)
    } satisfies StrictDocumentQuery<HulyActivityReference>
    // Huly's DocumentQuery supports Mongo-style `$or`; StrictDocumentQuery only
    // models document fields, so the combined direction intentionally uses the
    // SDK query type while the exact direction branches stay field-strict.
    const query: DocumentQuery<HulyActivityReference> = params.direction === "from"
      ? hulyQuery<HulyActivityReference>(sourceQuery)
      : params.direction === "to"
      ? hulyQuery<HulyActivityReference>(attachedQuery)
      : { $or: [sourceQuery, attachedQuery] }

    const references = yield* client.findAll<HulyActivityReference>(
      activity.class.ActivityReference,
      query,
      { limit, sort: { modifiedOn: SortingOrder.Descending } }
    )

    return references.map(reference => ({
      id: ActivityReferenceId.make(reference._id),
      messageId: ActivityMessageId.make(reference._id),
      srcDocId: DocId.make(reference.srcDocId),
      srcDocClass: ObjectClassName.make(reference.srcDocClass),
      attachedDocId: reference.attachedDocId === undefined ? undefined : DocId.make(reference.attachedDocId),
      attachedDocClass: reference.attachedDocClass === undefined
        ? undefined
        : ObjectClassName.make(reference.attachedDocClass),
      message: ActivityMarkup.make(reference.message),
      modifiedOn: Timestamp.make(reference.modifiedOn)
    }))
  })

export const listActivityReplies = (
  params: ListActivityRepliesParams
): Effect.Effect<Array<ActivityMessage>, ListActivityRepliesError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const parent = yield* findActivityMessage(client, params.messageId)
    const limit = clampLimit(params.limit)
    const replies = yield* client.findAll<HulyThreadMessage>(
      chunter.class.ThreadMessage,
      hulyQuery<HulyThreadMessage>({ attachedTo: parent._id }),
      { limit, sort: { createdOn: SortingOrder.Ascending } }
    )

    return replies.map(reply => toActivityMessage(reply, client.markupUrlConfig))
  })

export const addActivityReply = (
  params: AddActivityReplyParams
): Effect.Effect<AddActivityReplyResult, AddActivityReplyError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const parent = yield* findActivityMessage(client, params.messageId)
    const replyId: Ref<HulyThreadMessage> = generateId()
    const replyData: AttachedData<HulyThreadMessage> = {
      message: markdownToMarkupString(params.body, client.markupUrlConfig),
      attachments: 0,
      objectId: parent.attachedTo,
      objectClass: parent.attachedToClass
    }

    yield* client.addCollection(
      chunter.class.ThreadMessage,
      parent.space,
      parent._id,
      toRef<Class<HulyActivityMessage>>(parent._class),
      "replies",
      replyData,
      replyId
    )

    return {
      replyId: ActivityMessageId.make(replyId),
      messageId: ActivityMessageId.make(parent._id)
    }
  })

export const updateActivityReply = (
  params: UpdateActivityReplyParams
): Effect.Effect<UpdateActivityReplyResult, UpdateActivityReplyError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const reply = yield* findOneOrFail(
      client,
      chunter.class.ThreadMessage,
      hulyQuery<HulyThreadMessage>({ _id: toRef<HulyThreadMessage>(params.replyId) }),
      () => new ActivityMessageNotFoundError({ messageId: params.replyId })
    )

    const now = yield* Clock.currentTimeMillis
    const updateOps: DocumentUpdate<HulyThreadMessage> = {
      message: markdownToMarkupString(params.body, client.markupUrlConfig),
      editedOn: now
    }

    yield* client.updateDoc(chunter.class.ThreadMessage, reply.space, reply._id, updateOps)
    return { replyId: ActivityMessageId.make(reply._id), updated: true }
  })

export const deleteActivityReply = (
  params: DeleteActivityReplyParams
): Effect.Effect<DeleteActivityReplyResult, DeleteActivityReplyError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const reply = yield* findOneOrFail(
      client,
      chunter.class.ThreadMessage,
      hulyQuery<HulyThreadMessage>({ _id: toRef<HulyThreadMessage>(params.replyId) }),
      () => new ActivityMessageNotFoundError({ messageId: params.replyId })
    )

    yield* client.removeDoc(chunter.class.ThreadMessage, reply.space, reply._id)
    return { replyId: ActivityMessageId.make(reply._id), deleted: true }
  })
