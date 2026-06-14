import type { ChatMessage } from "@hcengineering/chunter"
import {
  type AttachedData,
  type Class,
  type Doc,
  type DocumentUpdate,
  generateId,
  type Ref,
  SortingOrder,
  type Space
} from "@hcengineering/core"
import { Clock, Effect, Schema } from "effect"

import { type Comment, CommentSchema } from "../../domain/schemas/comments.js"
import {
  CommentId,
  type CommentId as CommentIdType,
  Count,
  type Count as CountType
} from "../../domain/schemas/shared.js"
import type { HulyClient, HulyClientError } from "../client.js"
import { HulyConnectionError } from "../errors.js"
import { chunter } from "../huly-plugins.js"
import { markdownToMarkupString, optionalMarkupToMarkdown } from "./markup.js"
import { clampLimit, findResultTotal, hulyQuery } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"

export interface AttachedCommentTarget {
  readonly client: HulyClient["Type"]
  readonly space: Ref<Space>
  readonly attachedTo: Ref<Doc>
  readonly attachedToClass: Ref<Class<Doc>>
  readonly collection: string
}

interface AttachedCommentsPage {
  readonly comments: Array<Comment>
  readonly total: CountType
}

const toComment = (
  client: HulyClient["Type"],
  message: ChatMessage
) => ({
  id: message._id,
  body: optionalMarkupToMarkdown(message.message, client.markupUrlConfig, ""),
  authorId: message.modifiedBy,
  createdOn: message.createdOn,
  modifiedOn: message.modifiedOn,
  editedOn: message.editedOn
})

const decodeComments = (
  context: string,
  comments: ReadonlyArray<ReturnType<typeof toComment>>
): Effect.Effect<ReadonlyArray<Comment>, HulyConnectionError> =>
  Schema.decodeUnknown(Schema.Array(CommentSchema))(comments).pipe(
    Effect.mapError((parseError) =>
      new HulyConnectionError({
        message: `${context} comments response failed schema validation: ${parseError.message}`,
        cause: parseError
      })
    )
  )

export const listAttachedCommentsPage = (
  target: AttachedCommentTarget,
  limit?: number | undefined,
  context = "Attached"
): Effect.Effect<AttachedCommentsPage, HulyClientError | HulyConnectionError> =>
  Effect.gen(function*() {
    const messages = yield* target.client.findAll<ChatMessage>(
      chunter.class.ChatMessage,
      hulyQuery<ChatMessage>({
        attachedTo: target.attachedTo,
        attachedToClass: target.attachedToClass,
        collection: target.collection
      }),
      {
        limit: clampLimit(limit),
        sort: { createdOn: SortingOrder.Ascending },
        total: true
      }
    )
    const comments = yield* decodeComments(context, messages.map((message) => toComment(target.client, message)))
    return {
      comments: [...comments],
      total: Count.make(findResultTotal(messages))
    }
  })

export const addAttachedComment = (
  target: AttachedCommentTarget,
  body: string
): Effect.Effect<CommentIdType, HulyClientError> =>
  Effect.gen(function*() {
    const commentId: Ref<ChatMessage> = generateId()
    const commentData: AttachedData<ChatMessage> = {
      message: markdownToMarkupString(body, target.client.markupUrlConfig)
    }

    yield* target.client.addCollection(
      chunter.class.ChatMessage,
      target.space,
      target.attachedTo,
      target.attachedToClass,
      target.collection,
      commentData,
      commentId
    )

    return CommentId.make(commentId)
  })

const findAttachedComment = <E>(
  target: AttachedCommentTarget,
  commentId: CommentIdType,
  notFound: () => E
): Effect.Effect<ChatMessage, HulyClientError | E> =>
  Effect.gen(function*() {
    const comment = yield* target.client.findOne<ChatMessage>(
      chunter.class.ChatMessage,
      hulyQuery<ChatMessage>({
        _id: toRef<ChatMessage>(commentId),
        attachedTo: target.attachedTo,
        attachedToClass: target.attachedToClass,
        collection: target.collection
      })
    )
    if (comment === undefined) return yield* Effect.fail(notFound())
    return comment
  })

export const updateAttachedComment = <E>(
  target: AttachedCommentTarget,
  commentId: CommentIdType,
  body: string,
  notFound: () => E
): Effect.Effect<boolean, HulyClientError | E> =>
  Effect.gen(function*() {
    const comment = yield* findAttachedComment(target, commentId, notFound)
    const newMarkup = markdownToMarkupString(body, target.client.markupUrlConfig)
    if (newMarkup === comment.message) return false

    const now = yield* Clock.currentTimeMillis
    const updateOps: DocumentUpdate<ChatMessage> = {
      message: newMarkup,
      editedOn: now
    }
    yield* target.client.updateDoc(chunter.class.ChatMessage, target.space, comment._id, updateOps)
    return true
  })

export const deleteAttachedComment = <E>(
  target: AttachedCommentTarget,
  commentId: CommentIdType,
  notFound: () => E
): Effect.Effect<void, HulyClientError | E> =>
  Effect.gen(function*() {
    const comment = yield* findAttachedComment(target, commentId, notFound)
    yield* target.client.removeDoc(chunter.class.ChatMessage, target.space, comment._id)
  })
