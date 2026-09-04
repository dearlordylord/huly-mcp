import type { Doc } from "@hcengineering/core"
import type { Request as HulyRequest } from "@hcengineering/hr"
import { Effect } from "effect"

import type {
  AddHrRequestAttachmentParams,
  AddHrRequestCommentParams,
  DeleteHrRequestAttachmentParams,
  DeleteHrRequestCommentParams,
  GetHrRequestAttachmentParams,
  ListHrRequestAttachmentsParams,
  ListHrRequestCommentsParams,
  UpdateHrRequestAttachmentParams,
  UpdateHrRequestCommentParams
} from "../../domain/schemas.js"
import { HrRequestId } from "../../domain/schemas.js"
import { NonEmptyString } from "../../domain/schemas/shared.js"
import { HulyClient } from "../client.js"
import { HrRequestCommentNotFoundError, HrRequestMutationUnsupportedError } from "../errors.js"
import { attachment, hr } from "../huly-plugins.js"
import { HulyStorageClient } from "../storage.js"
import {
  addAttachedComment,
  deleteAttachedComment,
  listAttachedCommentsPage,
  updateAttachedComment
} from "./attached-comments.js"
import {
  findAttachmentForScope,
  getAttachmentForScope,
  listAttachmentPageForScope,
  updateAttachmentForScope
} from "./attachments-shared.js"
import { uploadAndAttach } from "./attachments-upload.js"
import { resolveHrRequest } from "./hr-requests.js"

const CONTINUATION_UNSUPPORTED =
  "Huly attached-collection queries do not expose a stable continuation cursor; increase limit and compare returned rows with total."

const targetFor = (client: HulyClient["Service"], request: HulyRequest) => ({
  client,
  space: request.space,
  attachedTo: request._id,
  attachedToClass: hr.class.Request,
  collection: "comments"
})
const scopeFor = (request: { readonly _id: Doc["_id"] }) => ({
  classRef: attachment.class.Attachment,
  attachedTo: request._id,
  attachedToClass: hr.class.Request,
  collection: "attachments"
})

export const listHrRequestComments = (params: ListHrRequestCommentsParams) =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const request = yield* resolveHrRequest(client, params.request)
    const page = yield* listAttachedCommentsPage(targetFor(client, request), params.limit, "HrRequest")
    return {
      request: HrRequestId.make(request._id),
      comments: page.comments,
      total: page.total,
      truncated: page.comments.length < page.total,
      ...(page.comments.length < page.total ? { continuationUnsupportedReason: CONTINUATION_UNSUPPORTED } : {})
    }
  })
export const addHrRequestComment = (params: AddHrRequestCommentParams) =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const request = yield* resolveHrRequest(client, params.request)
    return {
      request: HrRequestId.make(request._id),
      commentId: yield* addAttachedComment(targetFor(client, request), params.body)
    }
  })
const commentMissing = (request: HrRequestId, id: UpdateHrRequestCommentParams["commentId"]) => () =>
  new HrRequestCommentNotFoundError({ request, commentId: id })
export const updateHrRequestComment = (params: UpdateHrRequestCommentParams) =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const request = yield* resolveHrRequest(client, params.request)
    const updated = yield* updateAttachedComment(
      targetFor(client, request),
      params.commentId,
      params.body,
      commentMissing(params.request, params.commentId)
    )
    return { request: HrRequestId.make(request._id), commentId: params.commentId, updated }
  })
export const deleteHrRequestComment = (params: DeleteHrRequestCommentParams) =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const request = yield* resolveHrRequest(client, params.request)
    yield* deleteAttachedComment(
      targetFor(client, request),
      params.commentId,
      commentMissing(params.request, params.commentId)
    )
    return { request: HrRequestId.make(request._id), commentId: params.commentId, deleted: true }
  })
export const listHrRequestAttachments = (params: ListHrRequestAttachmentsParams) =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const request = yield* resolveHrRequest(client, params.request)
    const page = yield* listAttachmentPageForScope(client, scopeFor(request), params.limit)
    return {
      request: HrRequestId.make(request._id),
      attachments: page.attachments,
      total: page.total,
      truncated: page.attachments.length < page.total,
      ...(page.attachments.length < page.total ? { continuationUnsupportedReason: CONTINUATION_UNSUPPORTED } : {})
    }
  })
export const getHrRequestAttachment = (params: GetHrRequestAttachmentParams) =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const storage = yield* HulyStorageClient
    const request = yield* resolveHrRequest(client, params.request)
    return {
      request: HrRequestId.make(request._id),
      attachment: yield* getAttachmentForScope(client, storage, params.attachmentId, scopeFor(request))
    }
  })
export const addHrRequestAttachment = (params: AddHrRequestAttachmentParams) =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const request = yield* resolveHrRequest(client, params.request)
    const result = yield* uploadAndAttach(params, {
      spaceRef: request.space,
      objectRef: request._id,
      objectClassRef: hr.class.Request,
      attachmentClassRef: attachment.class.Attachment,
      collection: "attachments"
    })
    return {
      request: HrRequestId.make(request._id),
      attachmentId: result.attachmentId,
      blobId: result.blobId,
      url: result.url
    }
  })
export const updateHrRequestAttachment = (params: UpdateHrRequestAttachmentParams) =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const request = yield* resolveHrRequest(client, params.request)
    yield* updateAttachmentForScope(client, params.attachmentId, params, scopeFor(request))
    return { request: HrRequestId.make(request._id), attachmentId: params.attachmentId, updated: true }
  })
export const deleteHrRequestAttachment = (params: DeleteHrRequestAttachmentParams) =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const request = yield* resolveHrRequest(client, params.request)
    const removeCollection = client.removeCollection
    if (removeCollection === undefined)
      return yield* new HrRequestMutationUnsupportedError({ operation: NonEmptyString.make("attachment deletion") })
    const found = yield* findAttachmentForScope(client, params.attachmentId, scopeFor(request))
    yield* removeCollection(
      attachment.class.Attachment,
      found.space,
      found._id,
      request._id,
      hr.class.Request,
      "attachments"
    )
    return { request: HrRequestId.make(request._id), attachmentId: params.attachmentId, deleted: true }
  })
