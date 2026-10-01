import { Schema } from "effect"

import { BYTES_PER_MB, MAX_FILE_SIZE_MB } from "../../huly/errors-files.js"
import {
  AttachmentByteSize,
  AttachmentDescription,
  AttachmentFileName,
  AttachmentMetadataKey,
  Base64FileData,
  LocalFilePath
} from "./domain-values.js"
import { toDraft07JsonSchema, withJsonSchemaPropertyDescriptions } from "./json-schema.js"
import { optionalOutput } from "./output-helpers.js"
import {
  assertUpdateFields,
  atLeastOneUpdateFieldMessage,
  AttachmentId,
  BlobId,
  DEFAULT_LIMIT,
  DocId,
  DocumentIdentifier,
  hasAtLeastOneDefined,
  IssueIdentifier,
  LimitParam,
  MimeType,
  ObjectClassName,
  ProjectIdentifier,
  SpaceId,
  TeamspaceIdentifier,
  Timestamp,
  UrlString,
  withAtLeastOneRequired
} from "./shared.js"
import {
  UPLOAD_BASE64_DATA_DESCRIPTION,
  UPLOAD_FILE_PATH_DESCRIPTION,
  UPLOAD_FILE_URL_DESCRIPTION,
  UPLOAD_SOURCE_FIELD_DESCRIPTIONS
} from "./upload-source.js"

const DEFAULT_ATTACHMENT_PINNED = false

export const AttachmentKindSchema = Schema.Literals(["attachment", "embedding", "photo"]).annotate({
  title: "AttachmentKind",
  description: "Attachment class to create: attachment, embedding, or photo. Defaults to attachment."
})

export type AttachmentKind = Schema.Schema.Type<typeof AttachmentKindSchema>

// Attachment metadata is an open SDK-provided record. Keys are branded as open
// SDK metadata keys; values remain unknown because Huly does not publish a
// stable typed value space for this bag.
const AttachmentMetadataSchema = Schema.Record(AttachmentMetadataKey, Schema.Unknown)

export const ListAttachmentsParamsSchema = Schema.Struct({
  objectId: DocId.annotate({ description: "ID of the parent object (issue, document, etc.)" }),
  objectClass: ObjectClassName.annotate({
    description: "Class of the parent object (e.g., 'tracker:class:Issue', 'document:class:Document')"
  }),
  limit: Schema.optional(
    LimitParam.annotate({ description: `Maximum number of attachments to return (default: ${DEFAULT_LIMIT})` })
  )
}).annotate({ title: "ListAttachmentsParams", description: "Parameters for listing attachments on an object" })

export type ListAttachmentsParams = Schema.Schema.Type<typeof ListAttachmentsParamsSchema>

export const GetAttachmentParamsSchema = Schema.Struct({
  attachmentId: AttachmentId.annotate({ description: "Attachment ID" })
}).annotate({ title: "GetAttachmentParams", description: "Parameters for getting a single attachment" })

export type GetAttachmentParams = Schema.Schema.Type<typeof GetAttachmentParamsSchema>

const FileSourceFields = {
  filename: AttachmentFileName.annotate({ description: "Name of the file" }),
  contentType: MimeType.annotate({ description: "MIME type of the file (e.g., 'image/png', 'application/pdf')" }),
  filePath: Schema.optional(LocalFilePath.annotate({ description: UPLOAD_FILE_PATH_DESCRIPTION })),
  fileUrl: Schema.optional(UrlString.annotate({ description: UPLOAD_FILE_URL_DESCRIPTION })),
  data: Schema.optional(
    Base64FileData.annotate({ description: `${UPLOAD_BASE64_DATA_DESCRIPTION} Upload limit: ${MAX_FILE_SIZE_MB} MiB.` })
  ),
  description: Schema.optional(AttachmentDescription.annotate({ description: "Attachment description" })),
  pinned: Schema.optional(
    Schema.Boolean.annotate({ description: `Whether to pin the attachment (default: ${DEFAULT_ATTACHMENT_PINNED})` })
  ),
  kind: Schema.optional(
    AttachmentKindSchema.annotate({
      description: "Attachment subclass to create: attachment, embedding, or photo (default: attachment)."
    })
  )
}

const ATTACHMENT_UPLOAD_FIELD_DESCRIPTIONS = {
  ...UPLOAD_SOURCE_FIELD_DESCRIPTIONS,
  data: `${UPLOAD_BASE64_DATA_DESCRIPTION} Upload limit: ${MAX_FILE_SIZE_MB} MiB.`
}

const hasFileSource = (params: {
  readonly filePath?: LocalFilePath | undefined
  readonly fileUrl?: UrlString | undefined
  readonly data?: Base64FileData | undefined
}) => {
  const hasSource = params.filePath || params.fileUrl || params.data
  return hasSource ? true : "Must provide filePath, fileUrl, or data"
}

const AddAttachmentParamsBase = Schema.Struct({
  objectId: DocId.annotate({ description: "ID of the parent object (issue, document, etc.)" }),
  objectClass: ObjectClassName.annotate({
    description: "Class of the parent object (e.g., 'tracker:class:Issue', 'document:class:Document')"
  }),
  space: SpaceId.annotate({ description: "Space ID where the parent object resides" }),
  ...FileSourceFields
})

export const AddAttachmentParamsSchema = AddAttachmentParamsBase.pipe(
  Schema.check(Schema.makeFilter(hasFileSource))
).annotate({
  title: "AddAttachmentParams",
  description: "Parameters for adding an attachment. Provide ONE of: filePath, fileUrl, or data"
})

export type AddAttachmentParams = Schema.Schema.Type<typeof AddAttachmentParamsSchema>

export const UPDATE_ATTACHMENT_FIELDS = ["description", "pinned"] as const satisfies ReadonlyArray<
  "description" | "pinned"
>

export const UpdateAttachmentParamsSchema = Schema.Struct({
  attachmentId: AttachmentId.annotate({ description: "Attachment ID" }),
  description: Schema.optional(
    Schema.NullOr(AttachmentDescription).annotate({ description: "New description (null to clear)" })
  ),
  pinned: Schema.optional(Schema.Boolean.annotate({ description: "Pin or unpin the attachment" }))
})
  .pipe(
    Schema.check(
      Schema.makeFilter((params) =>
        hasAtLeastOneDefined(params, UPDATE_ATTACHMENT_FIELDS)
          ? undefined
          : atLeastOneUpdateFieldMessage(UPDATE_ATTACHMENT_FIELDS)
      )
    )
  )
  .annotate({
    title: "UpdateAttachmentParams",
    description: `Parameters for updating an attachment. ${atLeastOneUpdateFieldMessage(UPDATE_ATTACHMENT_FIELDS)}`
  })

export type UpdateAttachmentParams = Schema.Schema.Type<typeof UpdateAttachmentParamsSchema>
assertUpdateFields<UpdateAttachmentParams>()(["attachmentId"], UPDATE_ATTACHMENT_FIELDS)

export const DeleteAttachmentParamsSchema = Schema.Struct({
  attachmentId: AttachmentId.annotate({ description: "Attachment ID to delete" })
}).annotate({ title: "DeleteAttachmentParams", description: "Parameters for deleting an attachment" })

export type DeleteAttachmentParams = Schema.Schema.Type<typeof DeleteAttachmentParamsSchema>

export const PinAttachmentParamsSchema = Schema.Struct({
  attachmentId: AttachmentId.annotate({ description: "Attachment ID" }),
  pinned: Schema.Boolean.annotate({ description: "Whether to pin (true) or unpin (false)" })
}).annotate({ title: "PinAttachmentParams", description: "Parameters for pinning/unpinning an attachment" })

export type PinAttachmentParams = Schema.Schema.Type<typeof PinAttachmentParamsSchema>

export const DownloadAttachmentParamsSchema = Schema.Struct({
  attachmentId: AttachmentId.annotate({ description: "Attachment ID" })
}).annotate({ title: "DownloadAttachmentParams", description: "Parameters for getting attachment download URL" })

export type DownloadAttachmentParams = Schema.Schema.Type<typeof DownloadAttachmentParamsSchema>

const AddIssueAttachmentParamsBase = Schema.Struct({
  project: ProjectIdentifier.annotate({ description: "Project identifier (e.g., 'HULY')" }),
  identifier: IssueIdentifier.annotate({ description: "Issue identifier (e.g., 'HULY-123')" }),
  ...FileSourceFields
})

export const AddIssueAttachmentParamsSchema = AddIssueAttachmentParamsBase.pipe(
  Schema.check(Schema.makeFilter(hasFileSource))
).annotate({ title: "AddIssueAttachmentParams", description: "Parameters for adding an attachment to an issue" })

export type AddIssueAttachmentParams = Schema.Schema.Type<typeof AddIssueAttachmentParamsSchema>

const AddDocumentAttachmentParamsBase = Schema.Struct({
  teamspace: TeamspaceIdentifier.annotate({ description: "Teamspace name or ID" }),
  document: DocumentIdentifier.annotate({ description: "Document title or ID" }),
  ...FileSourceFields
})

export const AddDocumentAttachmentParamsSchema = AddDocumentAttachmentParamsBase.pipe(
  Schema.check(Schema.makeFilter(hasFileSource))
).annotate({ title: "AddDocumentAttachmentParams", description: "Parameters for adding an attachment to a document" })

export type AddDocumentAttachmentParams = Schema.Schema.Type<typeof AddDocumentAttachmentParamsSchema>

export const listAttachmentsParamsJsonSchema = toDraft07JsonSchema(ListAttachmentsParamsSchema)
export const getAttachmentParamsJsonSchema = toDraft07JsonSchema(GetAttachmentParamsSchema)
export const addAttachmentParamsJsonSchema = withJsonSchemaPropertyDescriptions(
  toDraft07JsonSchema(AddAttachmentParamsSchema),
  ATTACHMENT_UPLOAD_FIELD_DESCRIPTIONS
)
export const updateAttachmentParamsJsonSchema = withAtLeastOneRequired(
  toDraft07JsonSchema(UpdateAttachmentParamsSchema),
  UPDATE_ATTACHMENT_FIELDS
)
export const deleteAttachmentParamsJsonSchema = toDraft07JsonSchema(DeleteAttachmentParamsSchema)
export const pinAttachmentParamsJsonSchema = toDraft07JsonSchema(PinAttachmentParamsSchema)
export const downloadAttachmentParamsJsonSchema = toDraft07JsonSchema(DownloadAttachmentParamsSchema)
export const addIssueAttachmentParamsJsonSchema = withJsonSchemaPropertyDescriptions(
  toDraft07JsonSchema(AddIssueAttachmentParamsSchema),
  ATTACHMENT_UPLOAD_FIELD_DESCRIPTIONS
)
export const addDocumentAttachmentParamsJsonSchema = withJsonSchemaPropertyDescriptions(
  toDraft07JsonSchema(AddDocumentAttachmentParamsSchema),
  ATTACHMENT_UPLOAD_FIELD_DESCRIPTIONS
)

export const parseListAttachmentsParams = Schema.decodeUnknownEffect(ListAttachmentsParamsSchema)
export const parseGetAttachmentParams = Schema.decodeUnknownEffect(GetAttachmentParamsSchema)
export const parseAddAttachmentParams = Schema.decodeUnknownEffect(AddAttachmentParamsSchema)
export const parseUpdateAttachmentParams = Schema.decodeUnknownEffect(UpdateAttachmentParamsSchema)
export const parseDeleteAttachmentParams = Schema.decodeUnknownEffect(DeleteAttachmentParamsSchema)
export const parsePinAttachmentParams = Schema.decodeUnknownEffect(PinAttachmentParamsSchema)
export const parseDownloadAttachmentParams = Schema.decodeUnknownEffect(DownloadAttachmentParamsSchema)
export const parseAddIssueAttachmentParams = Schema.decodeUnknownEffect(AddIssueAttachmentParamsSchema)
export const parseAddDocumentAttachmentParams = Schema.decodeUnknownEffect(AddDocumentAttachmentParamsSchema)

export const READ_ATTACHMENT_CONTENT_MAX_MIB = 4
export const READ_ATTACHMENT_CONTENT_MAX_BYTES = READ_ATTACHMENT_CONTENT_MAX_MIB * BYTES_PER_MB
export const SupportedAttachmentImageTypeSchema = Schema.Literals([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp"
]).annotate({
  title: "SupportedAttachmentImageType",
  description: "Image MIME type supported for inline MCP image content."
})
export type SupportedAttachmentImageType = Schema.Schema.Type<typeof SupportedAttachmentImageTypeSchema>

const CANONICAL_BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u
const MIN_NON_EMPTY_BASE64_LENGTH = 4
const canonicalBase64RoundTrips = (value: Base64FileData): boolean | string =>
  Buffer.from(value, "base64").toString("base64") === value
    ? true
    : "Image data must use the canonical RFC 4648 representation with zero-valued padding bits."

export const CanonicalBase64ImageData = Base64FileData.pipe(
  Schema.check(Schema.isMinLength(MIN_NON_EMPTY_BASE64_LENGTH, { message: "Image data must not be empty." })),
  Schema.check(
    Schema.isPattern(CANONICAL_BASE64_PATTERN, {
      message: "Image data must use the RFC 4648 alphabet and trailing padding where required."
    })
  ),
  Schema.check(Schema.makeFilter(canonicalBase64RoundTrips)),
  Schema.brand("CanonicalBase64ImageData")
).annotate({
  identifier: "CanonicalBase64ImageData",
  title: "CanonicalBase64ImageData",
  description:
    "Non-empty canonical RFC 4648 base64 image data with trailing padding where required and zero-valued padding bits."
})
export type CanonicalBase64ImageData = Schema.Schema.Type<typeof CanonicalBase64ImageData>

export const McpImageContentSchema = Schema.Struct({
  type: Schema.Literal("image"),
  data: CanonicalBase64ImageData,
  mimeType: SupportedAttachmentImageTypeSchema
}).annotate({
  title: "McpImageContent",
  description: "Schema-owned MCP image content block encoded at the protocol boundary."
})
export type McpImageContent = Schema.Schema.Type<typeof McpImageContentSchema>

export const ReadAttachmentContentParamsSchema = Schema.Struct({
  attachmentId: AttachmentId.annotate({ description: "Attachment ID whose image content should be returned." })
}).annotate({
  title: "ReadAttachmentContentParams",
  description: "Parameters for reading a supported image attachment as MCP image content."
})
export type ReadAttachmentContentParams = Schema.Schema.Type<typeof ReadAttachmentContentParamsSchema>

export const ReadAttachmentContentMetadataSchema = Schema.Struct({
  attachmentId: AttachmentId,
  name: AttachmentFileName,
  type: SupportedAttachmentImageTypeSchema,
  size: AttachmentByteSize
})
export type ReadAttachmentContentMetadata = Schema.Schema.Type<typeof ReadAttachmentContentMetadataSchema>

export const ReadAttachmentContentResultSchema = Schema.Struct({
  _tag: Schema.Literal("ImageAttachmentContent"),
  metadata: ReadAttachmentContentMetadataSchema,
  data: CanonicalBase64ImageData
})
export type ReadAttachmentContentResult = Schema.Schema.Type<typeof ReadAttachmentContentResultSchema>

export const readAttachmentContentParamsJsonSchema = toDraft07JsonSchema(ReadAttachmentContentParamsSchema)
export const parseReadAttachmentContentParams = Schema.decodeUnknownEffect(ReadAttachmentContentParamsSchema)

export const AttachmentSummaryWireSchema = Schema.Struct({
  id: AttachmentId,
  class: ObjectClassName,
  name: AttachmentFileName,
  type: MimeType,
  size: AttachmentByteSize,
  pinned: optionalOutput(Schema.Boolean),
  description: optionalOutput(AttachmentDescription),
  metadata: optionalOutput(AttachmentMetadataSchema),
  modifiedOn: optionalOutput(Timestamp)
})
export type AttachmentSummary = Schema.Schema.Type<typeof AttachmentSummaryWireSchema>

export const AttachmentWireSchema = Schema.Struct({
  id: AttachmentId,
  class: ObjectClassName,
  name: AttachmentFileName,
  type: MimeType,
  size: AttachmentByteSize,
  pinned: optionalOutput(Schema.Boolean),
  readonly: optionalOutput(Schema.Boolean),
  description: optionalOutput(AttachmentDescription),
  metadata: optionalOutput(AttachmentMetadataSchema),
  url: optionalOutput(UrlString),
  modifiedOn: optionalOutput(Timestamp),
  createdOn: optionalOutput(Timestamp)
})
export type Attachment = Schema.Schema.Type<typeof AttachmentWireSchema>

export const AddAttachmentResultSchema = Schema.Struct({ attachmentId: AttachmentId, blobId: BlobId, url: UrlString })
export type AddAttachmentResult = Schema.Schema.Type<typeof AddAttachmentResultSchema>

export const UpdateAttachmentResultSchema = Schema.Struct({ attachmentId: AttachmentId, updated: Schema.Boolean })
export type UpdateAttachmentResult = Schema.Schema.Type<typeof UpdateAttachmentResultSchema>

export const DeleteAttachmentResultSchema = Schema.Struct({ attachmentId: AttachmentId, deleted: Schema.Boolean })
export type DeleteAttachmentResult = Schema.Schema.Type<typeof DeleteAttachmentResultSchema>

export const PinAttachmentResultSchema = Schema.Struct({ attachmentId: AttachmentId, pinned: Schema.Boolean })
export type PinAttachmentResult = Schema.Schema.Type<typeof PinAttachmentResultSchema>

export const DownloadAttachmentResultSchema = Schema.Struct({
  attachmentId: AttachmentId,
  url: UrlString,
  name: AttachmentFileName,
  type: MimeType,
  size: AttachmentByteSize
})
export type DownloadAttachmentResult = Schema.Schema.Type<typeof DownloadAttachmentResultSchema>

export const ListAttachmentsResultSchema = Schema.Array(AttachmentSummaryWireSchema)
export const GetAttachmentResultSchema = AttachmentWireSchema
