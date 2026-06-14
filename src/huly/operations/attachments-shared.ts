import type { Attachment as HulyAttachment } from "@hcengineering/attachment"
import { type Class, type Doc, type DocumentUpdate, type Ref, SortingOrder } from "@hcengineering/core"
import { Effect } from "effect"

import type { Attachment, AttachmentSummary } from "../../domain/schemas/attachments.js"
import { AttachmentByteSize, AttachmentDescription, AttachmentFileName } from "../../domain/schemas/domain-values.js"
import {
  AttachmentId,
  type AttachmentId as AttachmentIdType,
  Count,
  type Count as CountType,
  MimeType,
  ObjectClassName
} from "../../domain/schemas/shared.js"
import { Timestamp, UrlString } from "../../domain/schemas/shared.js"
import type { HulyClient, HulyClientError } from "../client.js"
import { AttachmentNotFoundError } from "../errors.js"
import type { HulyStorageClient } from "../storage.js"
import { clampLimit, findOneOrFail, findResultTotal, hulyQuery, type StrictDocumentQuery } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"
import { mergeUpdateEntries } from "./update-guards.js"

interface AttachmentLookupScope {
  readonly classRef: Ref<Class<HulyAttachment>>
  readonly attachedTo?: Ref<Doc> | undefined
  readonly attachedToClass?: Ref<Class<Doc>> | undefined
  readonly collection?: string | undefined
}

export interface AttachmentCollectionScope {
  readonly classRef: Ref<Class<HulyAttachment>>
  readonly attachedTo: Ref<Doc>
  readonly attachedToClass: Ref<Class<Doc>>
  readonly collection: string
}

interface AttachmentMetadataUpdate {
  readonly description?: AttachmentDescription | null | undefined
  readonly pinned?: boolean | undefined
}

interface AttachmentScopeList {
  readonly attachments: Array<AttachmentSummary>
  readonly total: CountType
}

const optionalAttachmentDescription = (description: string | null | undefined) =>
  description === undefined || description === null ? undefined : AttachmentDescription.make(description)

const toAttachmentSummary = (att: HulyAttachment): AttachmentSummary => ({
  id: AttachmentId.make(att._id),
  class: ObjectClassName.make(att._class),
  name: AttachmentFileName.make(att.name),
  type: MimeType.make(att.type),
  size: AttachmentByteSize.make(att.size),
  pinned: att.pinned ?? undefined,
  description: optionalAttachmentDescription(att.description),
  metadata: att.metadata,
  modifiedOn: Timestamp.make(att.modifiedOn)
})

const toAttachment = (att: HulyAttachment, url?: string): Attachment => ({
  id: AttachmentId.make(att._id),
  class: ObjectClassName.make(att._class),
  name: AttachmentFileName.make(att.name),
  type: MimeType.make(att.type),
  size: AttachmentByteSize.make(att.size),
  pinned: att.pinned ?? undefined,
  readonly: att.readonly ?? undefined,
  description: optionalAttachmentDescription(att.description),
  metadata: att.metadata,
  url: url === undefined ? undefined : UrlString.make(url),
  modifiedOn: Timestamp.make(att.modifiedOn),
  createdOn: att.createdOn === undefined ? undefined : Timestamp.make(att.createdOn)
})

const attachmentScopeQuery = (
  attachmentId: AttachmentIdType | undefined,
  scope: AttachmentLookupScope
): StrictDocumentQuery<HulyAttachment> => ({
  ...(attachmentId === undefined ? {} : { _id: toRef<HulyAttachment>(attachmentId) }),
  ...(scope.attachedTo === undefined ? {} : { attachedTo: scope.attachedTo }),
  ...(scope.attachedToClass === undefined ? {} : { attachedToClass: scope.attachedToClass }),
  ...(scope.collection === undefined ? {} : { collection: scope.collection })
})

export const listAttachmentsForScope = (
  client: HulyClient["Type"],
  scope: AttachmentCollectionScope,
  limit?: number | undefined
): Effect.Effect<Array<AttachmentSummary>, HulyClientError> =>
  Effect.map(listAttachmentPageForScope(client, scope, limit), (page) => page.attachments)

export const listAttachmentPageForScope = (
  client: HulyClient["Type"],
  scope: AttachmentCollectionScope,
  limit?: number | undefined
): Effect.Effect<AttachmentScopeList, HulyClientError> =>
  Effect.map(
    client.findAll<HulyAttachment>(
      scope.classRef,
      hulyQuery(attachmentScopeQuery(undefined, scope)),
      {
        limit: clampLimit(limit),
        sort: { modifiedOn: SortingOrder.Descending },
        total: true
      }
    ),
    (attachments) => ({
      attachments: attachments.map(toAttachmentSummary),
      total: Count.make(findResultTotal(attachments))
    })
  )

export const findAttachmentForScope = (
  client: HulyClient["Type"],
  attachmentId: AttachmentIdType,
  scope: AttachmentLookupScope
): Effect.Effect<HulyAttachment, HulyClientError | AttachmentNotFoundError> =>
  findOneOrFail(
    client,
    scope.classRef,
    hulyQuery(attachmentScopeQuery(attachmentId, scope)),
    () => new AttachmentNotFoundError({ attachmentId })
  )

export const getAttachmentForScope = (
  client: HulyClient["Type"],
  storageClient: HulyStorageClient["Type"],
  attachmentId: AttachmentIdType,
  scope: AttachmentLookupScope
): Effect.Effect<Attachment, HulyClientError | AttachmentNotFoundError> =>
  Effect.gen(function*() {
    const att = yield* findAttachmentForScope(client, attachmentId, scope)
    return toAttachment(att, storageClient.getFileUrl(att.file))
  })

const attachmentUpdateOps = (params: AttachmentMetadataUpdate): DocumentUpdate<HulyAttachment> => {
  const descriptionOps: DocumentUpdate<HulyAttachment> = params.description === undefined
    ? {}
    : { description: params.description === null ? "" : params.description }
  const pinnedOps: DocumentUpdate<HulyAttachment> = params.pinned === undefined ? {} : { pinned: params.pinned }
  return mergeUpdateEntries([descriptionOps, pinnedOps])
}

export const updateAttachmentForScope = (
  client: HulyClient["Type"],
  attachmentId: AttachmentIdType,
  params: AttachmentMetadataUpdate,
  scope: AttachmentLookupScope
): Effect.Effect<void, HulyClientError | AttachmentNotFoundError> =>
  Effect.gen(function*() {
    const att = yield* findAttachmentForScope(client, attachmentId, scope)
    yield* client.updateDoc(scope.classRef, att.space, att._id, attachmentUpdateOps(params))
  })
