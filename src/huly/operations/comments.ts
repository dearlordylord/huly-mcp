import type { ChatMessage } from "@hcengineering/chunter"
import {
  type AttachedData,
  type DocumentUpdate,
  generateId,
  type Ref,
  SortingOrder
} from "@hcengineering/core"
import type { Issue as HulyIssue, Project as HulyProject } from "@hcengineering/tracker"
import { Effect } from "effect"

import type {
  AddCommentParams,
  Comment,
  DeleteCommentParams,
  ListCommentsParams,
  UpdateCommentParams
} from "../../domain/schemas.js"
import { HulyClient, type HulyClientError } from "../client.js"
import { CommentNotFoundError, IssueNotFoundError, ProjectNotFoundError } from "../errors.js"

// eslint-disable-next-line @typescript-eslint/no-require-imports
const tracker = require("@hcengineering/tracker").default as typeof import("@hcengineering/tracker").default
// eslint-disable-next-line @typescript-eslint/no-require-imports
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

const findProject = (
  projectIdentifier: string
): Effect.Effect<
  { client: HulyClient["Type"]; project: HulyProject },
  ProjectNotFoundError | HulyClientError,
  HulyClient
> =>
  Effect.gen(function*() {
    const client = yield* HulyClient

    const project = yield* client.findOne<HulyProject>(
      tracker.class.Project,
      { identifier: projectIdentifier }
    )
    if (project === undefined) {
      return yield* new ProjectNotFoundError({ identifier: projectIdentifier })
    }

    return { client, project }
  })

const parseIssueIdentifier = (
  identifier: string | number,
  projectIdentifier: string
): { fullIdentifier: string; number: number | null } => {
  const idStr = String(identifier).trim()

  const match = idStr.match(/^([A-Z]+)-(\d+)$/i)
  if (match) {
    return {
      fullIdentifier: `${match[1].toUpperCase()}-${match[2]}`,
      number: parseInt(match[2], 10)
    }
  }

  const numMatch = idStr.match(/^\d+$/)
  if (numMatch) {
    const num = parseInt(idStr, 10)
    return {
      fullIdentifier: `${projectIdentifier.toUpperCase()}-${num}`,
      number: num
    }
  }

  return { fullIdentifier: idStr, number: null }
}

const findProjectAndIssue = (
  params: { project: string; issueIdentifier: string }
): Effect.Effect<
  { client: HulyClient["Type"]; project: HulyProject; issue: HulyIssue },
  ProjectNotFoundError | IssueNotFoundError | HulyClientError,
  HulyClient
> =>
  Effect.gen(function*() {
    const { client, project } = yield* findProject(params.project)

    const { fullIdentifier, number } = parseIssueIdentifier(
      params.issueIdentifier,
      params.project
    )

    let issue = yield* client.findOne<HulyIssue>(
      tracker.class.Issue,
      {
        space: project._id,
        identifier: fullIdentifier
      }
    )
    if (issue === undefined && number !== null) {
      issue = yield* client.findOne<HulyIssue>(
        tracker.class.Issue,
        {
          space: project._id,
          number
        }
      )
    }
    if (issue === undefined) {
      return yield* new IssueNotFoundError({
        identifier: params.issueIdentifier,
        project: params.project
      })
    }

    return { client, project, issue }
  })

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
      id: String(msg._id),
      body: msg.message ?? "",
      authorId: msg.modifiedBy ? String(msg.modifiedBy) : undefined,
      createdOn: msg.createdOn,
      modifiedOn: msg.modifiedOn,
      editedOn: msg.editedOn
    }))

    return comments
  })

/**
 * Result of addComment operation.
 */
export interface AddCommentResult {
  commentId: string
  issueIdentifier: string
}

/**
 * Add a comment to an issue.
 */
export const addComment = (
  params: AddCommentParams
): Effect.Effect<AddCommentResult, AddCommentError, HulyClient> =>
  Effect.gen(function*() {
    const { client, project, issue } = yield* findProjectAndIssue({
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
      commentId: String(commentId),
      issueIdentifier: issue.identifier
    }
  })

/**
 * Result of updateComment operation.
 */
export interface UpdateCommentResult {
  commentId: string
  issueIdentifier: string
  updated: boolean
}

/**
 * Update an existing comment on an issue.
 */
export const updateComment = (
  params: UpdateCommentParams
): Effect.Effect<UpdateCommentResult, UpdateCommentError, HulyClient> =>
  Effect.gen(function*() {
    const { client, project, issue } = yield* findProjectAndIssue({
      project: params.project,
      issueIdentifier: params.issueIdentifier
    })

    const comment = yield* client.findOne<ChatMessage>(
      chunter.class.ChatMessage,
      {
        _id: params.commentId as Ref<ChatMessage>,
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
        commentId: params.commentId,
        issueIdentifier: issue.identifier,
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
      commentId: params.commentId,
      issueIdentifier: issue.identifier,
      updated: true
    }
  })

/**
 * Result of deleteComment operation.
 */
export interface DeleteCommentResult {
  commentId: string
  issueIdentifier: string
  deleted: boolean
}

/**
 * Delete a comment from an issue.
 */
export const deleteComment = (
  params: DeleteCommentParams
): Effect.Effect<DeleteCommentResult, DeleteCommentError, HulyClient> =>
  Effect.gen(function*() {
    const { client, project, issue } = yield* findProjectAndIssue({
      project: params.project,
      issueIdentifier: params.issueIdentifier
    })

    const comment = yield* client.findOne<ChatMessage>(
      chunter.class.ChatMessage,
      {
        _id: params.commentId as Ref<ChatMessage>,
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
      commentId: params.commentId,
      issueIdentifier: issue.identifier,
      deleted: true
    }
  })
