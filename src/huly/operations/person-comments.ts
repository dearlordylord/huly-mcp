import type { Person } from "@hcengineering/contact"
import { Effect } from "effect"

import type {
  AddPersonCommentParams,
  DeletePersonCommentParams,
  ListPersonCommentsParams,
  UpdatePersonCommentParams
} from "../../domain/schemas/person-administration.js"
import { PersonId } from "../../domain/schemas/shared.js"
import { HulyClient, type HulyClientError } from "../client.js"
import type { PersonIdentifierAmbiguousError, PersonNotFoundError } from "../errors.js"
import { PersonCommentNotFoundError } from "../errors.js"
import { contact } from "../huly-plugins.js"
import {
  addAttachedComment,
  type AttachedCommentTarget,
  deleteAttachedComment,
  listAttachedCommentsPage,
  updateAttachedComment
} from "./attached-comments.js"
import { resolvePersonAdministrationTarget } from "./person-administration-shared.js"

type PersonCommentError = HulyClientError | PersonIdentifierAmbiguousError | PersonNotFoundError

const targetFor = (client: HulyClient["Service"], person: Person): AttachedCommentTarget => ({
  client,
  space: person.space,
  attachedTo: person._id,
  attachedToClass: contact.class.Person,
  collection: "comments"
})

const resolveTarget = (
  params: ListPersonCommentsParams
): Effect.Effect<
  { readonly target: AttachedCommentTarget; readonly personId: PersonId },
  PersonCommentError,
  HulyClient
> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const person = yield* resolvePersonAdministrationTarget(client, params.person)
    return { target: targetFor(client, person), personId: PersonId.make(person._id) }
  })

export const listPersonComments = (params: ListPersonCommentsParams) =>
  Effect.gen(function* () {
    const resolved = yield* resolveTarget(params)
    const page = yield* listAttachedCommentsPage(resolved.target, params.limit, "Person")
    return { personId: resolved.personId, comments: page.comments, total: page.total }
  })

export const addPersonComment = (params: AddPersonCommentParams) =>
  Effect.gen(function* () {
    const resolved = yield* resolveTarget(params)
    const commentId = yield* addAttachedComment(resolved.target, params.body)
    return { personId: resolved.personId, commentId }
  })

const notFound = (personId: PersonId, commentId: DeletePersonCommentParams["commentId"]) => () =>
  new PersonCommentNotFoundError({ personId, commentId })

export const updatePersonComment = (params: UpdatePersonCommentParams) =>
  Effect.gen(function* () {
    const resolved = yield* resolveTarget(params)
    const updated = yield* updateAttachedComment(
      resolved.target,
      params.commentId,
      params.body,
      notFound(resolved.personId, params.commentId)
    )
    return { personId: resolved.personId, commentId: params.commentId, updated }
  })

export const deletePersonComment = (params: DeletePersonCommentParams) =>
  Effect.gen(function* () {
    const resolved = yield* resolveTarget(params)
    yield* deleteAttachedComment(resolved.target, params.commentId, notFound(resolved.personId, params.commentId))
    const deleted: true = true
    return { personId: resolved.personId, commentId: params.commentId, deleted }
  })
