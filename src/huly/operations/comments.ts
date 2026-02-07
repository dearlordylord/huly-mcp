import type { ChatMessage } from "@hcengineering/chunter"
import { type AttachedData, type DocumentUpdate, generateId, type Ref, SortingOrder } from "@hcengineering/core"
import { Effect } from "effect"

import type {
  AddCommentParams,
  Comment,
  DeleteCommentParams,
  ListCommentsParams,
  UpdateCommentParams
} from "../../domain/schemas.js"
import type { AddCommentResult, DeleteCommentResult, UpdateCommentResult } from "../../domain/schemas/comments.js"
import { CommentId, IssueIdentifier } from "../../domain/schemas/shared.js"
import type { HulyClient, HulyClientError } from "../client.js"
import type { IssueNotFoundError, ProjectNotFoundError } from "../errors.js"
import { CommentNotFoundError } from "../errors.js"
import { findProjectAndIssue as findProjectAndIssueShared, toRef } from "./shared.js"

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/consistent-type-imports -- CJS interop
const tracker = require("@hcengineering/tracker").default as typeof import("@hcengineering/tracker").default
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/consistent-type-imports -- CJS interop
const chunter = require("@hcengineering/chunter").default as typeof import("@hcengineering/chunter").default

export type ListCommentsError =
  | HulyClientError
  | ProjectNotFoundError
  | IssueNotFoundError

export type AddCommentError =
  | HulyClientError
  | ProjectNotFoundError
  | IssueNotFoundError

export type UpdateCommentError =
  | HulyClientError
  | ProjectNotFoundError
  | IssueNotFoundError
  | CommentNotFoundError

export type DeleteCommentError =
  | HulyClientError
  | ProjectNotFoundError
  | IssueNotFoundError
  | CommentNotFoundError

// --- Helpers ---

const findProjectAndIssue = (
  params: { project: string; issueIdentifier: string }
) => findProjectAndIssueShared({ project: params.project, identifier: params.issueIdentifier })

// --- Operations ---

/**
 * List comments on an issue.
 * Results sorted by createdOn ascending (oldest first).
 */
export const listComments = (
  params: ListCommentsParams
): Effect.Effect<Array<Comment>, ListCommentsError, HulyClient> =>
  Effect.gen(function*() {
    const { client, issue } = yield* findProjectAndIssue({
      project: params.project,
      issueIdentifier: params.issueIdentifier
    })

    const limit = Math.min(params.limit ?? 50, 200)

    const messages = yield* client.findAll<ChatMessage>(
      chunter.class.ChatMessage,
      {
        attachedTo: issue._id,
        attachedToClass: tracker.class.Issue
      },
      {
        limit,
        sort: {
          createdOn: SortingOrder.Ascending
        }
      }
    )

    const comments: Array<Comment> = messages.map((msg) => ({
      id: CommentId.make(msg._id),
      body: msg.message,
      authorId: msg.modifiedBy,
      createdOn: msg.createdOn,
      modifiedOn: msg.modifiedOn,
      editedOn: msg.editedOn
    }))

    return comments
  })

export type { AddCommentResult, DeleteCommentResult, UpdateCommentResult }

/**
 * Add a comment to an issue.
 */
export const addComment = (
  params: AddCommentParams
): Effect.Effect<AddCommentResult, AddCommentError, HulyClient> =>
  Effect.gen(function*() {
    const { client, issue, project } = yield* findProjectAndIssue({
      project: params.project,
      issueIdentifier: params.issueIdentifier
    })

    const commentId: Ref<ChatMessage> = generateId()

    const commentData: AttachedData<ChatMessage> = {
      message: params.body
    }

    yield* client.addCollection(
      chunter.class.ChatMessage,
      project._id,
      issue._id,
      tracker.class.Issue,
      "comments",
      commentData,
      commentId
    )

    return {
      commentId: CommentId.make(commentId),
      issueIdentifier: IssueIdentifier.make(issue.identifier)
    }
  })

/**
 * Update an existing comment on an issue.
 */
export const updateComment = (
  params: UpdateCommentParams
): Effect.Effect<UpdateCommentResult, UpdateCommentError, HulyClient> =>
  Effect.gen(function*() {
    const { client, issue, project } = yield* findProjectAndIssue({
      project: params.project,
      issueIdentifier: params.issueIdentifier
    })

    const comment = yield* client.findOne<ChatMessage>(
      chunter.class.ChatMessage,
      {
        _id: toRef<ChatMessage>(params.commentId),
        attachedTo: issue._id
      }
    )

    if (comment === undefined) {
      return yield* new CommentNotFoundError({
        commentId: params.commentId,
        issueIdentifier: params.issueIdentifier,
        project: params.project
      })
    }

    if (params.body === comment.message) {
      return {
        commentId: CommentId.make(params.commentId),
        issueIdentifier: IssueIdentifier.make(issue.identifier),
        updated: false
      }
    }

    const updateOps: DocumentUpdate<ChatMessage> = {
      message: params.body,
      editedOn: Date.now()
    }

    yield* client.updateDoc(
      chunter.class.ChatMessage,
      project._id,
      comment._id,
      updateOps
    )

    return {
      commentId: CommentId.make(params.commentId),
      issueIdentifier: IssueIdentifier.make(issue.identifier),
      updated: true
    }
  })

/**
 * Delete a comment from an issue.
 */
export const deleteComment = (
  params: DeleteCommentParams
): Effect.Effect<DeleteCommentResult, DeleteCommentError, HulyClient> =>
  Effect.gen(function*() {
    const { client, issue, project } = yield* findProjectAndIssue({
      project: params.project,
      issueIdentifier: params.issueIdentifier
    })

    const comment = yield* client.findOne<ChatMessage>(
      chunter.class.ChatMessage,
      {
        _id: toRef<ChatMessage>(params.commentId),
        attachedTo: issue._id
      }
    )

    if (comment === undefined) {
      return yield* new CommentNotFoundError({
        commentId: params.commentId,
        issueIdentifier: params.issueIdentifier,
        project: params.project
      })
    }

    yield* client.removeDoc(
      chunter.class.ChatMessage,
      project._id,
      comment._id
    )

    return {
      commentId: CommentId.make(params.commentId),
      issueIdentifier: IssueIdentifier.make(issue.identifier),
      deleted: true
    }
  })
