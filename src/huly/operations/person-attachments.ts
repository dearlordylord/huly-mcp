import type { Person } from "@hcengineering/contact"
import { Effect } from "effect"

import type {
  AddPersonAttachmentParams,
  DeletePersonAttachmentParams,
  GetPersonAttachmentParams,
  ListPersonAttachmentsParams,
  UpdatePersonAttachmentParams
} from "../../domain/schemas/person-administration.js"
import { PersonId } from "../../domain/schemas/shared.js"
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

const scopeFor = (person: Person) => ({
  classRef: attachment.class.Attachment,
  attachedTo: person._id,
  attachedToClass: contact.class.Person,
  collection: "attachments"
})

const resolvePersonAttachmentTarget = (params: ListPersonAttachmentsParams) =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const person = yield* resolvePersonAdministrationTarget(client, params.person)
    return { client, person, personId: PersonId.make(person._id), scope: scopeFor(person) }
  })

export const listPersonAttachments = (params: ListPersonAttachmentsParams) =>
  Effect.gen(function* () {
    const target = yield* resolvePersonAttachmentTarget(params)
    const page = yield* listAttachmentPageForScope(target.client, target.scope, params.limit)
    return { personId: target.personId, attachments: page.attachments, total: page.total }
  })

export const addPersonAttachment = (params: AddPersonAttachmentParams) =>
  Effect.gen(function* () {
    const target = yield* resolvePersonAttachmentTarget(params)
    const result = yield* uploadAndAttach(params, {
      spaceRef: target.person.space,
      objectRef: target.person._id,
      objectClassRef: contact.class.Person,
      collection: "attachments"
    })
    return { personId: target.personId, ...result }
  })

export const getPersonAttachment = (params: GetPersonAttachmentParams) =>
  Effect.gen(function* () {
    const target = yield* resolvePersonAttachmentTarget(params)
    const storage = yield* HulyStorageClient
    const value = yield* getAttachmentForScope(target.client, storage, params.attachmentId, target.scope)
    return { personId: target.personId, attachment: value }
  })

export const updatePersonAttachment = (params: UpdatePersonAttachmentParams) =>
  Effect.gen(function* () {
    const target = yield* resolvePersonAttachmentTarget(params)
    yield* updateAttachmentForScope(target.client, params.attachmentId, params, target.scope)
    const updated: true = true
    return { personId: target.personId, attachmentId: params.attachmentId, updated }
  })

export const deletePersonAttachment = (params: DeletePersonAttachmentParams) =>
  Effect.gen(function* () {
    const target = yield* resolvePersonAttachmentTarget(params)
    const value = yield* findAttachmentForScope(target.client, params.attachmentId, target.scope)
    yield* target.client.removeDoc(attachment.class.Attachment, value.space, value._id)
    const deleted: true = true
    return { personId: target.personId, attachmentId: params.attachmentId, deleted }
  })
