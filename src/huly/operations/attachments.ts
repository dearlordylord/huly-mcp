/**
 * Attachment domain operations for Huly MCP server.
 *
 * Provides typed operations for managing attachments on Huly entities (issues, documents, etc.).
 * Operations use HulyClient and HulyStorageClient services.
 *
 * @module
 */
import type { Attachment as HulyAttachment } from "@hcengineering/attachment"
import {
  type AttachedData,
  type Blob,
  type Class,
  type Doc,
  type DocumentUpdate,
  generateId,
  type Ref,
  SortingOrder,
  type Space
} from "@hcengineering/core"
import type { Document as HulyDocument, Teamspace as HulyTeamspace } from "@hcengineering/document"
import type { Issue as HulyIssue } from "@hcengineering/tracker"
import { Effect } from "effect"

import type {
  AddAttachmentParams,
  AddDocumentAttachmentParams,
  AddIssueAttachmentParams,
  Attachment,
  AttachmentSummary,
  DeleteAttachmentParams,
  DownloadAttachmentParams,
  GetAttachmentParams,
  ListAttachmentsParams,
  PinAttachmentParams,
  UpdateAttachmentParams
} from "../../domain/schemas/attachments.js"
import { HulyClient, type HulyClientError } from "../client.js"
import {
  AttachmentNotFoundError,
  DocumentNotFoundError,
  type FileFetchError,
  type FileNotFoundError,
  type FileTooLargeError,
  type InvalidContentTypeError,
  type InvalidFileDataError,
  IssueNotFoundError,
  ProjectNotFoundError,
  TeamspaceNotFoundError
} from "../errors.js"
import {
  type FileSourceParams,
  getBufferFromParams,
  HulyStorageClient,
  type StorageClientError,
  validateContentType,
  validateFileSize
} from "../storage.js"
import { findProject, parseIssueIdentifier } from "./shared.js"

// eslint-disable-next-line @typescript-eslint/no-require-imports
const attachment = require("@hcengineering/attachment").default as typeof import("@hcengineering/attachment").default
// eslint-disable-next-line @typescript-eslint/no-require-imports
const tracker = require("@hcengineering/tracker").default as typeof import("@hcengineering/tracker").default
// eslint-disable-next-line @typescript-eslint/no-require-imports
const documentPlugin = require("@hcengineering/document").default as typeof import("@hcengineering/document").default

export type ListAttachmentsError = HulyClientError

export type GetAttachmentError =
  | HulyClientError
  | AttachmentNotFoundError

export type AddAttachmentError =
  | HulyClientError
  | StorageClientError
  | InvalidFileDataError
  | FileNotFoundError
  | FileFetchError
  | FileTooLargeError
  | InvalidContentTypeError

export type UpdateAttachmentError =
  | HulyClientError
  | AttachmentNotFoundError

export type DeleteAttachmentError =
  | HulyClientError
  | AttachmentNotFoundError

export type PinAttachmentError =
  | HulyClientError
  | AttachmentNotFoundError

export type DownloadAttachmentError =
  | HulyClientError
  | AttachmentNotFoundError

export type AddIssueAttachmentError =
  | HulyClientError
  | ProjectNotFoundError
  | IssueNotFoundError
  | StorageClientError
  | InvalidFileDataError
  | FileNotFoundError
  | FileFetchError
  | FileTooLargeError
  | InvalidContentTypeError

export type AddDocumentAttachmentError =
  | HulyClientError
  | TeamspaceNotFoundError
  | DocumentNotFoundError
  | StorageClientError
  | InvalidFileDataError
  | FileNotFoundError
  | FileFetchError
  | FileTooLargeError
  | InvalidContentTypeError

// --- Helpers ---

const toAttachmentSummary = (att: HulyAttachment): AttachmentSummary => ({
  id: String(att._id),
  name: att.name,
  type: att.type,
  size: att.size,
  pinned: att.pinned ?? undefined,
  description: att.description ?? undefined,
  modifiedOn: att.modifiedOn
})

const toAttachment = (att: HulyAttachment, url?: string): Attachment => ({
  id: String(att._id),
  name: att.name,
  type: att.type,
  size: att.size,
  pinned: att.pinned ?? undefined,
  readonly: att.readonly ?? undefined,
  description: att.description ?? undefined,
  url,
  modifiedOn: att.modifiedOn,
  createdOn: att.createdOn
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

    const limit = Math.min(params.limit ?? 50, 200)

    const attachments = yield* client.findAll<HulyAttachment>(
      attachment.class.Attachment,
      {
        attachedTo: params.objectId as Ref<Doc>,
        attachedToClass: params.objectClass as Ref<Class<Doc>>
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

    const att = yield* client.findOne<HulyAttachment>(
      attachment.class.Attachment,
      { _id: params.attachmentId as Ref<HulyAttachment> }
    )

    if (att === undefined) {
      return yield* new AttachmentNotFoundError({ attachmentId: params.attachmentId })
    }

    const url = storageClient.getFileUrl(att.file as string)
    return toAttachment(att, url)
  })

/**
 * Result of addAttachment operation.
 */
export interface AddAttachmentResult {
  attachmentId: string
  blobId: string
  url: string
}

/**
 * Add an attachment to an object.
 *
 * Uploads file to storage and creates Attachment document linked to parent.
 */
const toFileSourceParams = (params: {
  readonly filePath?: string | undefined
  readonly fileUrl?: string | undefined
  readonly data?: string | undefined
}): FileSourceParams => {
  const result: FileSourceParams = {}
  if (params.filePath !== undefined) result.filePath = params.filePath
  if (params.fileUrl !== undefined) result.fileUrl = params.fileUrl
  if (params.data !== undefined) result.data = params.data
  return result
}

export const addAttachment = (
  params: AddAttachmentParams
): Effect.Effect<AddAttachmentResult, AddAttachmentError, HulyClient | HulyStorageClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const storageClient = yield* HulyStorageClient

    const buffer = yield* getBufferFromParams(toFileSourceParams(params))
    yield* validateFileSize(buffer, params.filename)
    yield* validateContentType(params.contentType, params.filename)

    const uploadResult = yield* storageClient.uploadFile(
      params.filename,
      buffer,
      params.contentType
    )

    const attachmentId: Ref<HulyAttachment> = generateId()

    const attachmentData: AttachedData<HulyAttachment> = {
      name: params.filename,
      file: uploadResult.blobId as Ref<Blob>,
      size: uploadResult.size,
      type: params.contentType,
      lastModified: Date.now(),
      pinned: params.pinned ?? false,
      ...(params.description !== undefined ? { description: params.description } : {})
    }

    yield* client.addCollection(
      attachment.class.Attachment,
      params.space as Ref<Space>,
      params.objectId as Ref<Doc>,
      params.objectClass as Ref<Class<Doc>>,
      "attachments",
      attachmentData,
      attachmentId
    )

    return {
      attachmentId: String(attachmentId),
      blobId: uploadResult.blobId,
      url: uploadResult.url
    }
  })

/**
 * Result of updateAttachment operation.
 */
export interface UpdateAttachmentResult {
  attachmentId: string
  updated: boolean
}

/**
 * Update an attachment's metadata.
 */
export const updateAttachment = (
  params: UpdateAttachmentParams
): Effect.Effect<UpdateAttachmentResult, UpdateAttachmentError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient

    const att = yield* client.findOne<HulyAttachment>(
      attachment.class.Attachment,
      { _id: params.attachmentId as Ref<HulyAttachment> }
    )

    if (att === undefined) {
      return yield* new AttachmentNotFoundError({ attachmentId: params.attachmentId })
    }

    const updateOps: DocumentUpdate<HulyAttachment> = {}

    if (params.description !== undefined) {
      if (params.description === null) {
        // Clear description by setting to empty string (Huly API doesn't support undefined in updates)
        (updateOps as Record<string, unknown>).description = ""
      } else {
        updateOps.description = params.description
      }
    }

    if (params.pinned !== undefined) {
      updateOps.pinned = params.pinned
    }

    if (Object.keys(updateOps).length === 0) {
      return { attachmentId: params.attachmentId, updated: false }
    }

    yield* client.updateDoc(
      attachment.class.Attachment,
      att.space,
      att._id,
      updateOps
    )

    return { attachmentId: params.attachmentId, updated: true }
  })

/**
 * Result of deleteAttachment operation.
 */
export interface DeleteAttachmentResult {
  attachmentId: string
  deleted: boolean
}

/**
 * Delete an attachment.
 */
export const deleteAttachment = (
  params: DeleteAttachmentParams
): Effect.Effect<DeleteAttachmentResult, DeleteAttachmentError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient

    const att = yield* client.findOne<HulyAttachment>(
      attachment.class.Attachment,
      { _id: params.attachmentId as Ref<HulyAttachment> }
    )

    if (att === undefined) {
      return yield* new AttachmentNotFoundError({ attachmentId: params.attachmentId })
    }

    yield* client.removeDoc(
      attachment.class.Attachment,
      att.space,
      att._id
    )

    return { attachmentId: params.attachmentId, deleted: true }
  })

/**
 * Result of pinAttachment operation.
 */
export interface PinAttachmentResult {
  attachmentId: string
  pinned: boolean
}

/**
 * Pin or unpin an attachment.
 */
export const pinAttachment = (
  params: PinAttachmentParams
): Effect.Effect<PinAttachmentResult, PinAttachmentError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient

    const att = yield* client.findOne<HulyAttachment>(
      attachment.class.Attachment,
      { _id: params.attachmentId as Ref<HulyAttachment> }
    )

    if (att === undefined) {
      return yield* new AttachmentNotFoundError({ attachmentId: params.attachmentId })
    }

    yield* client.updateDoc(
      attachment.class.Attachment,
      att.space,
      att._id,
      { pinned: params.pinned }
    )

    return { attachmentId: params.attachmentId, pinned: params.pinned }
  })

/**
 * Result of downloadAttachment operation.
 */
export interface DownloadAttachmentResult {
  attachmentId: string
  url: string
  name: string
  type: string
  size: number
}

/**
 * Get download URL for an attachment.
 */
export const downloadAttachment = (
  params: DownloadAttachmentParams
): Effect.Effect<DownloadAttachmentResult, DownloadAttachmentError, HulyClient | HulyStorageClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const storageClient = yield* HulyStorageClient

    const att = yield* client.findOne<HulyAttachment>(
      attachment.class.Attachment,
      { _id: params.attachmentId as Ref<HulyAttachment> }
    )

    if (att === undefined) {
      return yield* new AttachmentNotFoundError({ attachmentId: params.attachmentId })
    }

    const url = storageClient.getFileUrl(att.file as string)

    return {
      attachmentId: params.attachmentId,
      url,
      name: att.name,
      type: att.type,
      size: att.size
    }
  })

// --- Convenience Operations ---

/**
 * Add an attachment to an issue.
 */
export const addIssueAttachment = (
  params: AddIssueAttachmentParams
): Effect.Effect<AddAttachmentResult, AddIssueAttachmentError, HulyClient | HulyStorageClient> =>
  Effect.gen(function*() {
    const { client, project } = yield* findProject(params.project)

    const { fullIdentifier, number } = parseIssueIdentifier(params.identifier, params.project)

    let issue = yield* client.findOne<HulyIssue>(
      tracker.class.Issue,
      { space: project._id, identifier: fullIdentifier }
    )
    if (issue === undefined && number !== null) {
      issue = yield* client.findOne<HulyIssue>(
        tracker.class.Issue,
        { space: project._id, number }
      )
    }
    if (issue === undefined) {
      return yield* new IssueNotFoundError({
        identifier: params.identifier,
        project: params.project
      })
    }

    const storageClient = yield* HulyStorageClient

    const buffer = yield* getBufferFromParams(toFileSourceParams(params))
    yield* validateFileSize(buffer, params.filename)
    yield* validateContentType(params.contentType, params.filename)

    const uploadResult = yield* storageClient.uploadFile(
      params.filename,
      buffer,
      params.contentType
    )

    const attachmentId: Ref<HulyAttachment> = generateId()

    const attachmentData: AttachedData<HulyAttachment> = {
      name: params.filename,
      file: uploadResult.blobId as Ref<Blob>,
      size: uploadResult.size,
      type: params.contentType,
      lastModified: Date.now(),
      pinned: params.pinned ?? false,
      ...(params.description !== undefined ? { description: params.description } : {})
    }

    yield* client.addCollection(
      attachment.class.Attachment,
      project._id,
      issue._id,
      tracker.class.Issue,
      "attachments",
      attachmentData,
      attachmentId
    )

    return {
      attachmentId: String(attachmentId),
      blobId: uploadResult.blobId,
      url: uploadResult.url
    }
  })

/**
 * Add an attachment to a document.
 */
export const addDocumentAttachment = (
  params: AddDocumentAttachmentParams
): Effect.Effect<AddAttachmentResult, AddDocumentAttachmentError, HulyClient | HulyStorageClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient

    let teamspace = yield* client.findOne<HulyTeamspace>(
      documentPlugin.class.Teamspace,
      { name: params.teamspace, archived: false }
    )
    if (teamspace === undefined) {
      teamspace = yield* client.findOne<HulyTeamspace>(
        documentPlugin.class.Teamspace,
        { _id: params.teamspace as Ref<HulyTeamspace> }
      )
    }
    if (teamspace === undefined) {
      return yield* new TeamspaceNotFoundError({ identifier: params.teamspace })
    }

    let doc = yield* client.findOne<HulyDocument>(
      documentPlugin.class.Document,
      { space: teamspace._id, title: params.document }
    )
    if (doc === undefined) {
      doc = yield* client.findOne<HulyDocument>(
        documentPlugin.class.Document,
        { space: teamspace._id, _id: params.document as Ref<HulyDocument> }
      )
    }
    if (doc === undefined) {
      return yield* new DocumentNotFoundError({
        identifier: params.document,
        teamspace: params.teamspace
      })
    }

    const storageClient = yield* HulyStorageClient

    const buffer = yield* getBufferFromParams(toFileSourceParams(params))
    yield* validateFileSize(buffer, params.filename)
    yield* validateContentType(params.contentType, params.filename)

    const uploadResult = yield* storageClient.uploadFile(
      params.filename,
      buffer,
      params.contentType
    )

    const attachmentId: Ref<HulyAttachment> = generateId()

    const attachmentData: AttachedData<HulyAttachment> = {
      name: params.filename,
      file: uploadResult.blobId as Ref<Blob>,
      size: uploadResult.size,
      type: params.contentType,
      lastModified: Date.now(),
      pinned: params.pinned ?? false,
      ...(params.description !== undefined ? { description: params.description } : {})
    }

    yield* client.addCollection(
      attachment.class.Attachment,
      teamspace._id,
      doc._id,
      documentPlugin.class.Document,
      "attachments",
      attachmentData,
      attachmentId
    )

    return {
      attachmentId: String(attachmentId),
      blobId: uploadResult.blobId,
      url: uploadResult.url
    }
  })
