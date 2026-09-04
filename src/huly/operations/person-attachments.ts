import { Effect } from "effect"
import type { Doc, Space } from "@hcengineering/core"

import type {
  AddPersonAttachmentParams,
  DeletePersonAttachmentParams,
  GetPersonAttachmentParams,
  ListPersonAttachmentsParams,
  UpdatePersonAttachmentParams
} from "../../domain/schemas/person-administration.js"
import { HulyClient } from "../client.js"
import { attachment, contact } from "../huly-plugins.js"
import { HulyStorageClient } from "../storage.js"
import {
  findAttachmentForScope,
  getAttachmentForScope,
  listAttachmentPageForScope,
  updateAttachmentForScope
} from "./attachments-shared.js"
import { uploadAndAttach } from "./attachments-upload.js"
import { resolvePersonAdministrationTarget } from "./person-administration-shared.js"
import type { ResolvedPerson } from "./person-administration-boundaries.js"
import { toRef } from "./sdk-boundary.js"

const scopeFor = (person: ResolvedPerson) => ({
  classRef: attachment.class.Attachment,
  attachedTo: toRef<Doc>(person._id),
  attachedToClass: contact.class.Person,
  collection: "attachments"
})

const resolvePersonAttachmentTarget = Effect.fn("PersonAttachments.resolveTarget")(function* (
  params: ListPersonAttachmentsParams
) {
  const client = yield* HulyClient
  const person = yield* resolvePersonAdministrationTarget(client, params.person)
  return { client, person, personId: person._id, scope: scopeFor(person) }
})

export const listPersonAttachments = Effect.fn("PersonAttachments.list")(function* (
  params: ListPersonAttachmentsParams
) {
  const target = yield* resolvePersonAttachmentTarget(params)
  const page = yield* listAttachmentPageForScope(target.client, target.scope, params.limit)
  return { personId: target.personId, attachments: page.attachments, total: page.total }
})

export const addPersonAttachment = Effect.fn("PersonAttachments.add")(function* (params: AddPersonAttachmentParams) {
  const target = yield* resolvePersonAttachmentTarget(params)
  const result = yield* uploadAndAttach(params, {
    spaceRef: toRef<Space>(target.person.space),
    objectRef: toRef<Doc>(target.person._id),
    objectClassRef: contact.class.Person,
    collection: "attachments"
  })
  return { personId: target.personId, ...result }
})

export const getPersonAttachment = Effect.fn("PersonAttachments.get")(function* (params: GetPersonAttachmentParams) {
  const target = yield* resolvePersonAttachmentTarget(params)
  const storage = yield* HulyStorageClient
  const value = yield* getAttachmentForScope(target.client, storage, params.attachmentId, target.scope)
  return { personId: target.personId, attachment: value }
})

export const updatePersonAttachment = Effect.fn("PersonAttachments.update")(function* (
  params: UpdatePersonAttachmentParams
) {
  const target = yield* resolvePersonAttachmentTarget(params)
  yield* updateAttachmentForScope(target.client, params.attachmentId, params, target.scope)
  const updated: true = true
  return { personId: target.personId, attachmentId: params.attachmentId, updated }
})

export const deletePersonAttachment = Effect.fn("PersonAttachments.delete")(function* (
  params: DeletePersonAttachmentParams
) {
  const target = yield* resolvePersonAttachmentTarget(params)
  const value = yield* findAttachmentForScope(target.client, params.attachmentId, target.scope)
  yield* target.client.removeDoc(attachment.class.Attachment, value.space, value._id)
  const deleted: true = true
  return { personId: target.personId, attachmentId: params.attachmentId, deleted }
})
