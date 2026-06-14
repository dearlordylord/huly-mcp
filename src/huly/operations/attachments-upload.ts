import type { Attachment as HulyAttachment } from "@hcengineering/attachment"
import { type AttachedData, type Class, type Doc, generateId, type Ref, type Space } from "@hcengineering/core"
import { Clock, Effect } from "effect"

import type {
  AddAttachmentParams,
  AddAttachmentResult,
  AddDocumentAttachmentParams,
  AddIssueAttachmentParams,
  AttachmentKind
} from "../../domain/schemas/attachments.js"
import type {
  AttachmentDescription,
  AttachmentFileName,
  Base64FileData,
  LocalFilePath
} from "../../domain/schemas/domain-values.js"
import type { MimeType } from "../../domain/schemas/shared.js"
import { AttachmentId, BlobId, UrlString } from "../../domain/schemas/shared.js"
import { HulyClient, type HulyClientError } from "../client.js"
import type {
  DocumentNotFoundError,
  FileFetchError,
  FileNotFoundError,
  FileTooLargeError,
  InvalidContentTypeError,
  InvalidFileDataError,
  IssueNotFoundError,
  ProjectNotFoundError,
  TeamspaceNotFoundError
} from "../errors.js"
import { attachment, documentPlugin, tracker } from "../huly-plugins.js"
import {
  type FileSourceParams,
  getBufferFromParams,
  HulyStorageClient,
  type StorageClientError,
  validateContentType,
  validateFileSize
} from "../storage.js"
import { findTeamspaceAndDocument } from "./documents.js"
import { findProjectAndIssue } from "./issues-shared.js"
import { toRef } from "./sdk-boundary.js"

type AddAttachmentError =
  | HulyClientError
  | StorageClientError
  | InvalidFileDataError
  | FileNotFoundError
  | FileFetchError
  | FileTooLargeError
  | InvalidContentTypeError

type AddIssueAttachmentError =
  | HulyClientError
  | ProjectNotFoundError
  | IssueNotFoundError
  | StorageClientError
  | InvalidFileDataError
  | FileNotFoundError
  | FileFetchError
  | FileTooLargeError
  | InvalidContentTypeError

type AddDocumentAttachmentError =
  | HulyClientError
  | TeamspaceNotFoundError
  | DocumentNotFoundError
  | StorageClientError
  | InvalidFileDataError
  | FileNotFoundError
  | FileFetchError
  | FileTooLargeError
  | InvalidContentTypeError

interface AttachmentParent {
  readonly spaceRef: Ref<Space>
  readonly objectRef: Ref<Doc>
  readonly objectClassRef: Ref<Class<Doc>>
  readonly attachmentClassRef?: Ref<Class<HulyAttachment>> | undefined
  readonly collection?: string | undefined
}

const attachmentClassForKind = (kind: AttachmentKind | undefined): Ref<Class<HulyAttachment>> => {
  switch (kind ?? "attachment") {
    case "attachment":
      return attachment.class.Attachment
    case "embedding":
      return attachment.class.Embedding
    case "photo":
      return attachment.class.Photo
  }
}

const toFileSourceParams = (params: {
  readonly filePath?: LocalFilePath | undefined
  readonly fileUrl?: UrlString | undefined
  readonly data?: Base64FileData | undefined
}): FileSourceParams => {
  if (params.filePath !== undefined) return { _tag: "filePath", filePath: params.filePath }
  if (params.fileUrl !== undefined) return { _tag: "fileUrl", fileUrl: params.fileUrl }
  if (params.data !== undefined) return { _tag: "base64", data: params.data }
  throw new Error("Schema validation should guarantee at least one file source (filePath, fileUrl, or data)")
}

export const uploadAndAttach = (
  params: {
    readonly filename: AttachmentFileName
    readonly contentType: MimeType
    readonly filePath?: LocalFilePath | undefined
    readonly fileUrl?: UrlString | undefined
    readonly data?: Base64FileData | undefined
    readonly description?: AttachmentDescription | undefined
    readonly pinned?: boolean | undefined
    readonly kind?: AttachmentKind | undefined
  },
  parent: AttachmentParent
): Effect.Effect<
  AddAttachmentResult,
  AddAttachmentError,
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
    const now = yield* Clock.currentTimeMillis
    const attachmentData: AttachedData<HulyAttachment> = {
      name: params.filename,
      file: uploadResult.blobId,
      size: uploadResult.size,
      type: params.contentType,
      lastModified: now,
      pinned: params.pinned ?? false,
      ...(params.description !== undefined ? { description: params.description } : {})
    }

    yield* client.addCollection(
      parent.attachmentClassRef ?? attachmentClassForKind(params.kind),
      parent.spaceRef,
      parent.objectRef,
      parent.objectClassRef,
      parent.collection ?? "attachments",
      attachmentData,
      attachmentId
    )

    return {
      attachmentId: AttachmentId.make(attachmentId),
      blobId: BlobId.make(uploadResult.blobId),
      url: UrlString.make(uploadResult.url)
    }
  })

export const addAttachment = (
  params: AddAttachmentParams
): Effect.Effect<AddAttachmentResult, AddAttachmentError, HulyClient | HulyStorageClient> =>
  uploadAndAttach(params, {
    spaceRef: toRef<Space>(params.space),
    objectRef: toRef<Doc>(params.objectId),
    objectClassRef: toRef<Class<Doc>>(params.objectClass)
  })

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
