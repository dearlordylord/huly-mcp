import { Effect } from "effect"
import type { Doc, Space } from "@hcengineering/core"

import type {
  AddPersonCommentParams,
  DeletePersonCommentParams,
  ListPersonCommentsParams,
  UpdatePersonCommentParams
} from "../../domain/schemas/person-administration.js"
import type { PersonId } from "../../domain/schemas/shared.js"
import { HulyClient, type HulyClientError } from "../client.js"
import {
  type HulyDataInvalidError,
  PersonCommentNotFoundError,
  type PersonIdentifierAmbiguousError,
  type PersonNotFoundError
} from "../errors.js"
import { contact } from "../huly-plugins.js"
import {
  addAttachedComment,
  type AttachedCommentTarget,
  deleteAttachedComment,
  listAttachedCommentsPage,
  updateAttachedComment
} from "./attached-comments.js"
import { resolvePersonAdministrationTarget } from "./person-administration-shared.js"
import type { ResolvedPerson } from "./person-administration-boundaries.js"
import { toRef } from "./sdk-boundary.js"

type PersonCommentError = HulyClientError | HulyDataInvalidError | PersonIdentifierAmbiguousError | PersonNotFoundError

const targetFor = (client: HulyClient["Service"], person: ResolvedPerson): AttachedCommentTarget => ({
  client,
  space: toRef<Space>(person.space),
  attachedTo: toRef<Doc>(person._id),
  attachedToClass: contact.class.Person,
  collection: "comments"
})

const resolveTarget = Effect.fn("PersonComments.resolveTarget")(function* (
  params: ListPersonCommentsParams
): Effect.fn.Return<
  { readonly target: AttachedCommentTarget; readonly personId: PersonId },
  PersonCommentError,
  HulyClient
> {
  const client = yield* HulyClient
  const person = yield* resolvePersonAdministrationTarget(client, params.person)
  return { target: targetFor(client, person), personId: person._id }
})

export const listPersonComments = Effect.fn("PersonComments.list")(function* (params: ListPersonCommentsParams) {
  const resolved = yield* resolveTarget(params)
  const page = yield* listAttachedCommentsPage(resolved.target, params.limit, "Person")
  return { personId: resolved.personId, comments: page.comments, total: page.total }
})

export const addPersonComment = Effect.fn("PersonComments.add")(function* (params: AddPersonCommentParams) {
  const resolved = yield* resolveTarget(params)
  const commentId = yield* addAttachedComment(resolved.target, params.body)
  return { personId: resolved.personId, commentId }
})

const notFound = (personId: PersonId, commentId: DeletePersonCommentParams["commentId"]) => () =>
  new PersonCommentNotFoundError({ personId, commentId })

export const updatePersonComment = Effect.fn("PersonComments.update")(function* (params: UpdatePersonCommentParams) {
  const resolved = yield* resolveTarget(params)
  const updated = yield* updateAttachedComment(
    resolved.target,
    params.commentId,
    params.body,
    notFound(resolved.personId, params.commentId)
  )
  return { personId: resolved.personId, commentId: params.commentId, updated }
})

export const deletePersonComment = Effect.fn("PersonComments.delete")(function* (params: DeletePersonCommentParams) {
  const resolved = yield* resolveTarget(params)
  yield* deleteAttachedComment(resolved.target, params.commentId, notFound(resolved.personId, params.commentId))
  const deleted: true = true
  return { personId: resolved.personId, commentId: params.commentId, deleted }
})
