/**
 * Attachment domain operations for Huly MCP server.
 *
 * Provides typed operations for managing attachments on Huly entities (issues, documents, etc.).
 * Operations use HulyClient and HulyStorageClient services.
 *
 * @module
 */
import type { Attachment as HulyAttachment } from "@hcengineering/attachment"
import { type Class, type Doc, type DocumentUpdate, SortingOrder, type Space } from "@hcengineering/core"
import { Effect } from "effect"

import type {
  Attachment,
  AttachmentSummary,
  DeleteAttachmentParams,
  DeleteAttachmentResult,
  DownloadAttachmentParams,
  DownloadAttachmentResult,
  GetAttachmentParams,
  ListAttachmentsParams,
  PinAttachmentParams,
  PinAttachmentResult,
  UpdateAttachmentParams,
  UpdateAttachmentResult
} from "../../domain/schemas/attachments.js"
import { UPDATE_ATTACHMENT_FIELDS } from "../../domain/schemas/attachments.js"
import { AttachmentByteSize, AttachmentDescription, AttachmentFileName } from "../../domain/schemas/domain-values.js"
import { AttachmentId, MimeType, ObjectClassName, Timestamp, UrlString } from "../../domain/schemas/shared.js"
import { HulyClient, type HulyClientError } from "../client.js"
import { AttachmentNotFoundError, type NoUpdateFieldsError } from "../errors.js"
import { HulyStorageClient } from "../storage.js"
import { clampLimit, findOneOrFail } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"
import { type DirectUpdateEntry, mergeUpdateEntries, requireUpdateFields } from "./update-guards.js"

import { attachment } from "../huly-plugins.js"

export { addAttachment, addDocumentAttachment, addIssueAttachment } from "./attachments-upload.js"

type ListAttachmentsError = HulyClientError

type GetAttachmentError =
  | HulyClientError
  | AttachmentNotFoundError

type UpdateAttachmentError =
  | HulyClientError
  | NoUpdateFieldsError
  | AttachmentNotFoundError

type DeleteAttachmentError =
  | HulyClientError
  | AttachmentNotFoundError

type PinAttachmentError =
  | HulyClientError
  | AttachmentNotFoundError

type DownloadAttachmentError =
  | HulyClientError
  | AttachmentNotFoundError

// --- Helpers ---

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

// --- Operations ---

/**
 * List attachments on an object.
 * Results sorted by modifiedOn descending.
 */
export const listAttachments = (
  params: ListAttachmentsParams
): Effect.Effect<Array<AttachmentSummary>, ListAttachmentsError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient

    const limit = clampLimit(params.limit)

    const attachments = yield* client.findAll<HulyAttachment>(
      attachment.class.Attachment,
      {
        attachedTo: toRef<Doc>(params.objectId),
        attachedToClass: toRef<Class<Doc<Space>>>(params.objectClass)
      },
      {
        limit,
        sort: {
          modifiedOn: SortingOrder.Descending
        }
      }
    )

    return attachments.map(toAttachmentSummary)
  })

/**
 * Get a single attachment with full details.
 */
export const getAttachment = (
  params: GetAttachmentParams
): Effect.Effect<Attachment, GetAttachmentError, HulyClient | HulyStorageClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const storageClient = yield* HulyStorageClient

    const att = yield* findOneOrFail(
      client,
      attachment.class.Attachment,
      { _id: toRef<HulyAttachment>(params.attachmentId) },
      () => new AttachmentNotFoundError({ attachmentId: params.attachmentId })
    )

    const url = storageClient.getFileUrl(att.file)
    return toAttachment(att, url)
  })

/**
 * Update an attachment's metadata.
 */
export const updateAttachment = (
  params: UpdateAttachmentParams
): Effect.Effect<UpdateAttachmentResult, UpdateAttachmentError, HulyClient> =>
  Effect.gen(function*() {
    yield* requireUpdateFields("update_attachment", params, UPDATE_ATTACHMENT_FIELDS)

    const client = yield* HulyClient

    const att = yield* findOneOrFail(
      client,
      attachment.class.Attachment,
      { _id: toRef<HulyAttachment>(params.attachmentId) },
      () => new AttachmentNotFoundError({ attachmentId: params.attachmentId })
    )

    type UpdateAttachmentField = typeof UPDATE_ATTACHMENT_FIELDS[number]
    type UpdateAttachmentEntries = {
      readonly [Field in UpdateAttachmentField]: DirectUpdateEntry<
        UpdateAttachmentField,
        DocumentUpdate<HulyAttachment>,
        Field
      >
    }
    type UpdateAttachmentDescriptionEntry = UpdateAttachmentEntries["description"]
    // Huly clears attachment descriptions with empty string; the SDK type does not model that path directly.
    const clearAttachmentDescription = (): UpdateAttachmentDescriptionEntry => Object.assign({}, { description: "" })
    const descriptionOps: UpdateAttachmentDescriptionEntry = params.description === undefined
      ? {}
      : params.description === null
      ? clearAttachmentDescription()
      : { description: params.description }
    const updateEntries = {
      description: descriptionOps,
      pinned: params.pinned === undefined ? {} : { pinned: params.pinned }
    } satisfies UpdateAttachmentEntries
    const updateOps: DocumentUpdate<HulyAttachment> = mergeUpdateEntries(Object.values(updateEntries))

    yield* client.updateDoc(
      attachment.class.Attachment,
      att.space,
      att._id,
      updateOps
    )

    return { attachmentId: AttachmentId.make(params.attachmentId), updated: true }
  })

/**
 * Delete an attachment.
 */
export const deleteAttachment = (
  params: DeleteAttachmentParams
): Effect.Effect<DeleteAttachmentResult, DeleteAttachmentError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient

    const att = yield* findOneOrFail(
      client,
      attachment.class.Attachment,
      { _id: toRef<HulyAttachment>(params.attachmentId) },
      () => new AttachmentNotFoundError({ attachmentId: params.attachmentId })
    )

    yield* client.removeDoc(
      attachment.class.Attachment,
      att.space,
      att._id
    )

    return { attachmentId: AttachmentId.make(params.attachmentId), deleted: true }
  })

/**
 * Pin or unpin an attachment.
 */
export const pinAttachment = (
  params: PinAttachmentParams
): Effect.Effect<PinAttachmentResult, PinAttachmentError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient

    const att = yield* findOneOrFail(
      client,
      attachment.class.Attachment,
      { _id: toRef<HulyAttachment>(params.attachmentId) },
      () => new AttachmentNotFoundError({ attachmentId: params.attachmentId })
    )

    yield* client.updateDoc(
      attachment.class.Attachment,
      att.space,
      att._id,
      { pinned: params.pinned }
    )

    return { attachmentId: AttachmentId.make(params.attachmentId), pinned: params.pinned }
  })

/**
 * Get download URL for an attachment.
 */
export const downloadAttachment = (
  params: DownloadAttachmentParams
): Effect.Effect<DownloadAttachmentResult, DownloadAttachmentError, HulyClient | HulyStorageClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const storageClient = yield* HulyStorageClient

    const att = yield* findOneOrFail(
      client,
      attachment.class.Attachment,
      { _id: toRef<HulyAttachment>(params.attachmentId) },
      () => new AttachmentNotFoundError({ attachmentId: params.attachmentId })
    )

    const url = storageClient.getFileUrl(att.file)

    return {
      attachmentId: AttachmentId.make(params.attachmentId),
      url: UrlString.make(url),
      name: AttachmentFileName.make(att.name),
      type: MimeType.make(att.type),
      size: AttachmentByteSize.make(att.size)
    }
  })
