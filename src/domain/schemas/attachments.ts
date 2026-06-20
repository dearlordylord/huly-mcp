import { JSONSchema, Schema } from "effect"

import {
  AttachmentByteSize,
  AttachmentDescription,
  AttachmentFileName,
  AttachmentMetadataKey,
  Base64FileData,
  LocalFilePath
} from "./domain-values.js"
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

const DEFAULT_ATTACHMENT_PINNED = false

export const AttachmentKindSchema = Schema.Literal("attachment", "embedding", "photo").annotations({
  title: "AttachmentKind",
  description: "Attachment class to create: attachment, embedding, or photo. Defaults to attachment."
})

export type AttachmentKind = Schema.Schema.Type<typeof AttachmentKindSchema>

// Attachment metadata is an open SDK-provided record. Keys are branded as open
// SDK metadata keys; values remain unknown because Huly does not publish a
// stable typed value space for this bag.
const AttachmentMetadataSchema = Schema.Record({ key: AttachmentMetadataKey, value: Schema.Unknown })

export const ListAttachmentsParamsSchema = Schema.Struct({
  objectId: DocId.annotations({
    description: "ID of the parent object (issue, document, etc.)"
  }),
  objectClass: ObjectClassName.annotations({
    description: "Class of the parent object (e.g., 'tracker:class:Issue', 'document:class:Document')"
  }),
  limit: Schema.optional(
    LimitParam.annotations({
      description: `Maximum number of attachments to return (default: ${DEFAULT_LIMIT})`
    })
  )
}).annotations({
  title: "ListAttachmentsParams",
  description: "Parameters for listing attachments on an object"
})

export type ListAttachmentsParams = Schema.Schema.Type<typeof ListAttachmentsParamsSchema>

export const GetAttachmentParamsSchema = Schema.Struct({
  attachmentId: AttachmentId.annotations({
    description: "Attachment ID"
  })
}).annotations({
  title: "GetAttachmentParams",
  description: "Parameters for getting a single attachment"
})

export type GetAttachmentParams = Schema.Schema.Type<typeof GetAttachmentParamsSchema>

const FileSourceFields = {
  filename: AttachmentFileName.annotations({
    description: "Name of the file"
  }),
  contentType: MimeType.annotations({
    description: "MIME type of the file (e.g., 'image/png', 'application/pdf')"
  }),
  filePath: Schema.optional(LocalFilePath.annotations({
    description: "Local file path to upload (preferred - avoids context flooding)"
  })),
  fileUrl: Schema.optional(UrlString.annotations({
    description: "URL to fetch file from (for remote files)"
  })),
  data: Schema.optional(Base64FileData.annotations({
    description: "Base64-encoded file data (fallback for small files <10KB)"
  })),
  description: Schema.optional(AttachmentDescription.annotations({
    description: "Attachment description"
  })),
  pinned: Schema.optional(Schema.Boolean.annotations({
    description: `Whether to pin the attachment (default: ${DEFAULT_ATTACHMENT_PINNED})`
  })),
  kind: Schema.optional(AttachmentKindSchema.annotations({
    description: "Attachment subclass to create: attachment, embedding, or photo (default: attachment)."
  }))
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
  objectId: DocId.annotations({
    description: "ID of the parent object (issue, document, etc.)"
  }),
  objectClass: ObjectClassName.annotations({
    description: "Class of the parent object (e.g., 'tracker:class:Issue', 'document:class:Document')"
  }),
  space: SpaceId.annotations({
    description: "Space ID where the parent object resides"
  }),
  ...FileSourceFields
})

export const AddAttachmentParamsSchema = AddAttachmentParamsBase.pipe(
  Schema.filter(hasFileSource)
).annotations({
  title: "AddAttachmentParams",
  description: "Parameters for adding an attachment. Provide ONE of: filePath, fileUrl, or data"
})

export type AddAttachmentParams = Schema.Schema.Type<typeof AddAttachmentParamsSchema>

export const UPDATE_ATTACHMENT_FIELDS = ["description", "pinned"] as const satisfies ReadonlyArray<
  "description" | "pinned"
>

export const UpdateAttachmentParamsSchema = Schema.Struct({
  attachmentId: AttachmentId.annotations({
    description: "Attachment ID"
  }),
  description: Schema.optional(
    Schema.NullOr(AttachmentDescription).annotations({
      description: "New description (null to clear)"
    })
  ),
  pinned: Schema.optional(Schema.Boolean.annotations({
    description: "Pin or unpin the attachment"
  }))
}).pipe(
  Schema.filter((params) =>
    hasAtLeastOneDefined(params, UPDATE_ATTACHMENT_FIELDS)
      ? undefined
      : atLeastOneUpdateFieldMessage(UPDATE_ATTACHMENT_FIELDS)
  )
).annotations({
  title: "UpdateAttachmentParams",
  description: `Parameters for updating an attachment. ${atLeastOneUpdateFieldMessage(UPDATE_ATTACHMENT_FIELDS)}`
})

export type UpdateAttachmentParams = Schema.Schema.Type<typeof UpdateAttachmentParamsSchema>
assertUpdateFields<UpdateAttachmentParams>()(["attachmentId"], UPDATE_ATTACHMENT_FIELDS)

export const DeleteAttachmentParamsSchema = Schema.Struct({
  attachmentId: AttachmentId.annotations({
    description: "Attachment ID to delete"
  })
}).annotations({
  title: "DeleteAttachmentParams",
  description: "Parameters for deleting an attachment"
})

export type DeleteAttachmentParams = Schema.Schema.Type<typeof DeleteAttachmentParamsSchema>

export const PinAttachmentParamsSchema = Schema.Struct({
  attachmentId: AttachmentId.annotations({
    description: "Attachment ID"
  }),
  pinned: Schema.Boolean.annotations({
    description: "Whether to pin (true) or unpin (false)"
  })
}).annotations({
  title: "PinAttachmentParams",
  description: "Parameters for pinning/unpinning an attachment"
})

export type PinAttachmentParams = Schema.Schema.Type<typeof PinAttachmentParamsSchema>

export const DownloadAttachmentParamsSchema = Schema.Struct({
  attachmentId: AttachmentId.annotations({
    description: "Attachment ID"
  })
}).annotations({
  title: "DownloadAttachmentParams",
  description: "Parameters for getting attachment download URL"
})

export type DownloadAttachmentParams = Schema.Schema.Type<typeof DownloadAttachmentParamsSchema>

const AddIssueAttachmentParamsBase = Schema.Struct({
  project: ProjectIdentifier.annotations({
    description: "Project identifier (e.g., 'HULY')"
  }),
  identifier: IssueIdentifier.annotations({
    description: "Issue identifier (e.g., 'HULY-123')"
  }),
  ...FileSourceFields
})

export const AddIssueAttachmentParamsSchema = AddIssueAttachmentParamsBase.pipe(
  Schema.filter(hasFileSource)
).annotations({
  title: "AddIssueAttachmentParams",
  description: "Parameters for adding an attachment to an issue"
})

export type AddIssueAttachmentParams = Schema.Schema.Type<typeof AddIssueAttachmentParamsSchema>

const AddDocumentAttachmentParamsBase = Schema.Struct({
  teamspace: TeamspaceIdentifier.annotations({
    description: "Teamspace name or ID"
  }),
  document: DocumentIdentifier.annotations({
    description: "Document title or ID"
  }),
  ...FileSourceFields
})

export const AddDocumentAttachmentParamsSchema = AddDocumentAttachmentParamsBase.pipe(
  Schema.filter(hasFileSource)
).annotations({
  title: "AddDocumentAttachmentParams",
  description: "Parameters for adding an attachment to a document"
})

export type AddDocumentAttachmentParams = Schema.Schema.Type<typeof AddDocumentAttachmentParamsSchema>

export const listAttachmentsParamsJsonSchema = JSONSchema.make(ListAttachmentsParamsSchema)
export const getAttachmentParamsJsonSchema = JSONSchema.make(GetAttachmentParamsSchema)
export const addAttachmentParamsJsonSchema = JSONSchema.make(AddAttachmentParamsSchema)
export const updateAttachmentParamsJsonSchema = withAtLeastOneRequired(
  JSONSchema.make(UpdateAttachmentParamsSchema),
  UPDATE_ATTACHMENT_FIELDS
)
export const deleteAttachmentParamsJsonSchema = JSONSchema.make(DeleteAttachmentParamsSchema)
export const pinAttachmentParamsJsonSchema = JSONSchema.make(PinAttachmentParamsSchema)
export const downloadAttachmentParamsJsonSchema = JSONSchema.make(DownloadAttachmentParamsSchema)
export const addIssueAttachmentParamsJsonSchema = JSONSchema.make(AddIssueAttachmentParamsSchema)
export const addDocumentAttachmentParamsJsonSchema = JSONSchema.make(AddDocumentAttachmentParamsSchema)

export const parseListAttachmentsParams = Schema.decodeUnknown(ListAttachmentsParamsSchema)
export const parseGetAttachmentParams = Schema.decodeUnknown(GetAttachmentParamsSchema)
export const parseAddAttachmentParams = Schema.decodeUnknown(AddAttachmentParamsSchema)
export const parseUpdateAttachmentParams = Schema.decodeUnknown(UpdateAttachmentParamsSchema)
export const parseDeleteAttachmentParams = Schema.decodeUnknown(DeleteAttachmentParamsSchema)
export const parsePinAttachmentParams = Schema.decodeUnknown(PinAttachmentParamsSchema)
export const parseDownloadAttachmentParams = Schema.decodeUnknown(DownloadAttachmentParamsSchema)
export const parseAddIssueAttachmentParams = Schema.decodeUnknown(AddIssueAttachmentParamsSchema)
export const parseAddDocumentAttachmentParams = Schema.decodeUnknown(AddDocumentAttachmentParamsSchema)

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

export const AddAttachmentResultSchema = Schema.Struct({
  attachmentId: AttachmentId,
  blobId: BlobId,
  url: UrlString
})
export type AddAttachmentResult = Schema.Schema.Type<typeof AddAttachmentResultSchema>

export const UpdateAttachmentResultSchema = Schema.Struct({
  attachmentId: AttachmentId,
  updated: Schema.Boolean
})
export type UpdateAttachmentResult = Schema.Schema.Type<typeof UpdateAttachmentResultSchema>

export const DeleteAttachmentResultSchema = Schema.Struct({
  attachmentId: AttachmentId,
  deleted: Schema.Boolean
})
export type DeleteAttachmentResult = Schema.Schema.Type<typeof DeleteAttachmentResultSchema>

export const PinAttachmentResultSchema = Schema.Struct({
  attachmentId: AttachmentId,
  pinned: Schema.Boolean
})
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
