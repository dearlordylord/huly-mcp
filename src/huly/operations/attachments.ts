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
  type Class,
  type Doc,
  type DocumentUpdate,
  generateId,
  type Ref,
  SortingOrder,
  type Space
} from "@hcengineering/core"
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
import { AttachmentId } from "../../domain/schemas/shared.js"
import { HulyClient, type HulyClientError } from "../client.js"
import {
  AttachmentNotFoundError,
  type DocumentNotFoundError,
  type FileFetchError,
  type FileNotFoundError,
  type FileTooLargeError,
  type InvalidContentTypeError,
  type InvalidFileDataError,
  type IssueNotFoundError,
  type ProjectNotFoundError,
  type TeamspaceNotFoundError
} from "../errors.js"
import {
  type FileSourceParams,
  getBufferFromParams,
  HulyStorageClient,
  type StorageClientError,
  validateContentType,
  validateFileSize
} from "../storage.js"
import { findTeamspaceAndDocument } from "./documents.js"
import { findProjectAndIssue, toRef } from "./shared.js"

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/consistent-type-imports -- CJS interop
const attachment = require("@hcengineering/attachment").default as typeof import("@hcengineering/attachment").default
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/consistent-type-imports -- CJS interop
const tracker = require("@hcengineering/tracker").default as typeof import("@hcengineering/tracker").default
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/consistent-type-imports -- CJS interop
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

// SDK: DocumentUpdate<Attachment> doesn't allow clearing optional fields with empty string.
// Huly API requires empty string to clear description (not undefined/null).
const clearAttachmentDescription = (ops: DocumentUpdate<HulyAttachment>): void => {
  ;(ops as Record<string, unknown>).description = ""
}

const toAttachmentSummary = (att: HulyAttachment): AttachmentSummary => ({
  id: AttachmentId.make(att._id),
  name: att.name,
  type: att.type,
  size: att.size,
  pinned: att.pinned ?? undefined,
  description: att.description ?? undefined,
  modifiedOn: att.modifiedOn
})

const toAttachment = (att: HulyAttachment, url?: string): Attachment => ({
  id: AttachmentId.make(att._id),
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

interface AttachmentParent {
  readonly spaceRef: Ref<Space>
  readonly objectRef: Ref<Doc>
  readonly objectClassRef: Ref<Class<Doc>>
}

const uploadAndAttach = (
  params: {
    readonly filename: string
    readonly contentType: string
    readonly filePath?: string | undefined
    readonly fileUrl?: string | undefined
    readonly data?: string | undefined
    readonly description?: string | undefined
    readonly pinned?: boolean | undefined
  },
  parent: AttachmentParent
): Effect.Effect<
  AddAttachmentResult,
  | HulyClientError
  | StorageClientError
  | InvalidFileDataError
  | FileNotFoundError
  | FileFetchError
  | FileTooLargeError
  | InvalidContentTypeError,
  HulyClient | HulyStorageClient
> =>
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
      file: uploadResult.blobId,
      size: uploadResult.size,
      type: params.contentType,
      lastModified: Date.now(),
      pinned: params.pinned ?? false,
      ...(params.description !== undefined ? { description: params.description } : {})
    }

    yield* client.addCollection(
      attachment.class.Attachment,
      parent.spaceRef,
      parent.objectRef,
      parent.objectClassRef,
      "attachments",
      attachmentData,
      attachmentId
    )

    return {
      attachmentId,
      blobId: uploadResult.blobId,
      url: uploadResult.url
    }
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

    const att = yield* client.findOne<HulyAttachment>(
      attachment.class.Attachment,
      { _id: toRef<HulyAttachment>(params.attachmentId) }
    )

    if (att === undefined) {
      return yield* new AttachmentNotFoundError({ attachmentId: params.attachmentId })
    }

    const url = storageClient.getFileUrl(att.file)
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
  uploadAndAttach(params, {
    spaceRef: toRef<Space>(params.space),
    objectRef: toRef<Doc>(params.objectId),
    objectClassRef: toRef<Class<Doc>>(params.objectClass)
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
      { _id: toRef<HulyAttachment>(params.attachmentId) }
    )

    if (att === undefined) {
      return yield* new AttachmentNotFoundError({ attachmentId: params.attachmentId })
    }

    const updateOps: DocumentUpdate<HulyAttachment> = {}

    if (params.description !== undefined) {
      if (params.description === null) {
        clearAttachmentDescription(updateOps)
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
      { _id: toRef<HulyAttachment>(params.attachmentId) }
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
      { _id: toRef<HulyAttachment>(params.attachmentId) }
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
      { _id: toRef<HulyAttachment>(params.attachmentId) }
    )

    if (att === undefined) {
      return yield* new AttachmentNotFoundError({ attachmentId: params.attachmentId })
    }

    const url = storageClient.getFileUrl(att.file)

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
    const { issue, project } = yield* findProjectAndIssue(params)

    return yield* uploadAndAttach(params, {
      spaceRef: project._id,
      objectRef: issue._id,
      objectClassRef: tracker.class.Issue
    })
  })

/**
 * Add an attachment to a document.
 */
export const addDocumentAttachment = (
  params: AddDocumentAttachmentParams
): Effect.Effect<AddAttachmentResult, AddDocumentAttachmentError, HulyClient | HulyStorageClient> =>
  Effect.gen(function*() {
    const { doc, teamspace } = yield* findTeamspaceAndDocument({
      teamspace: params.teamspace,
      document: params.document
    })

    return yield* uploadAndAttach(params, {
      spaceRef: teamspace._id,
      objectRef: doc._id,
      objectClassRef: documentPlugin.class.Document
    })
  })
