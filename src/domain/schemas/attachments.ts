import { Schema } from "effect"

import {
  AttachmentId,
  BlobId,
  DocumentIdentifier,
  IssueIdentifier,
  LimitParam,
  makeJsonSchema,
  MimeType,
  NonEmptyString,
  ObjectClassName,
  ProjectIdentifier,
  SpaceId,
  TeamspaceIdentifier,
  Timestamp
} from "./shared.js"

export const AttachmentSummarySchema = Schema.Struct({
  id: AttachmentId.annotations({
    description: "Attachment ID"
  }),
  name: Schema.String.annotations({
    description: "File name"
  }),
  type: Schema.String.annotations({
    description: "MIME type"
  }),
  size: Schema.Number.pipe(Schema.int(), Schema.nonNegative()).annotations({
    description: "File size in bytes"
  }),
  pinned: Schema.optional(Schema.Boolean).annotations({
    description: "Whether the attachment is pinned"
  }),
  description: Schema.optional(Schema.String).annotations({
    description: "Attachment description"
  }),
  modifiedOn: Schema.optional(Timestamp).annotations({
    description: "Last modification timestamp"
  })
}).annotations({
  title: "AttachmentSummary",
  description: "Attachment summary for list operations"
})

export type AttachmentSummary = Schema.Schema.Type<typeof AttachmentSummarySchema>

export const AttachmentSchema = Schema.Struct({
  id: AttachmentId.annotations({
    description: "Attachment ID"
  }),
  name: Schema.String.annotations({
    description: "File name"
  }),
  type: Schema.String.annotations({
    description: "MIME type"
  }),
  size: Schema.Number.pipe(Schema.int(), Schema.nonNegative()).annotations({
    description: "File size in bytes"
  }),
  pinned: Schema.optional(Schema.Boolean).annotations({
    description: "Whether the attachment is pinned"
  }),
  readonly: Schema.optional(Schema.Boolean).annotations({
    description: "Whether the attachment is readonly"
  }),
  description: Schema.optional(Schema.String).annotations({
    description: "Attachment description"
  }),
  url: Schema.optional(Schema.String).annotations({
    description: "Download URL for the attachment"
  }),
  modifiedOn: Schema.optional(Timestamp).annotations({
    description: "Last modification timestamp"
  }),
  createdOn: Schema.optional(Timestamp).annotations({
    description: "Creation timestamp"
  })
}).annotations({
  title: "Attachment",
  description: "Full attachment with all fields"
})

export type Attachment = Schema.Schema.Type<typeof AttachmentSchema>

export const ListAttachmentsParamsSchema = Schema.Struct({
  objectId: NonEmptyString.annotations({
    description: "ID of the parent object (issue, document, etc.)"
  }),
  objectClass: ObjectClassName.annotations({
    description: "Class of the parent object (e.g., 'tracker:class:Issue', 'document:class:Document')"
  }),
  limit: Schema.optional(
    LimitParam.annotations({
      description: "Maximum number of attachments to return (default: 50)"
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
  filename: NonEmptyString.annotations({
    description: "Name of the file"
  }),
  contentType: MimeType.annotations({
    description: "MIME type of the file (e.g., 'image/png', 'application/pdf')"
  }),
  filePath: Schema.optional(Schema.String.annotations({
    description: "Local file path to upload (preferred - avoids context flooding)"
  })),
  fileUrl: Schema.optional(Schema.String.annotations({
    description: "URL to fetch file from (for remote files)"
  })),
  data: Schema.optional(Schema.String.annotations({
    description: "Base64-encoded file data (fallback for small files <10KB)"
  })),
  description: Schema.optional(Schema.String.annotations({
    description: "Attachment description"
  })),
  pinned: Schema.optional(Schema.Boolean.annotations({
    description: "Whether to pin the attachment (default: false)"
  }))
}

const hasFileSource = (params: {
  readonly filePath?: string | undefined
  readonly fileUrl?: string | undefined
  readonly data?: string | undefined
}) => {
  const hasSource = params.filePath || params.fileUrl || params.data
  return hasSource ? true : "Must provide filePath, fileUrl, or data"
}

const AddAttachmentParamsBase = Schema.Struct({
  objectId: NonEmptyString.annotations({
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
  Schema.filter((params) => hasFileSource(params))
).annotations({
  title: "AddAttachmentParams",
  description: "Parameters for adding an attachment. Provide ONE of: filePath, fileUrl, or data"
})

export type AddAttachmentParams = Schema.Schema.Type<typeof AddAttachmentParamsSchema>

export const UpdateAttachmentParamsSchema = Schema.Struct({
  attachmentId: AttachmentId.annotations({
    description: "Attachment ID"
  }),
  description: Schema.optional(
    Schema.NullOr(Schema.String).annotations({
      description: "New description (null to clear)"
    })
  ),
  pinned: Schema.optional(Schema.Boolean.annotations({
    description: "Pin or unpin the attachment"
  }))
}).annotations({
  title: "UpdateAttachmentParams",
  description: "Parameters for updating an attachment"
})

export type UpdateAttachmentParams = Schema.Schema.Type<typeof UpdateAttachmentParamsSchema>

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
  Schema.filter((params) => hasFileSource(params))
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
  Schema.filter((params) => hasFileSource(params))
).annotations({
  title: "AddDocumentAttachmentParams",
  description: "Parameters for adding an attachment to a document"
})

export type AddDocumentAttachmentParams = Schema.Schema.Type<typeof AddDocumentAttachmentParamsSchema>

export const listAttachmentsParamsJsonSchema = makeJsonSchema(ListAttachmentsParamsSchema)
export const getAttachmentParamsJsonSchema = makeJsonSchema(GetAttachmentParamsSchema)
export const addAttachmentParamsJsonSchema = makeJsonSchema(AddAttachmentParamsSchema)
export const updateAttachmentParamsJsonSchema = makeJsonSchema(UpdateAttachmentParamsSchema)
export const deleteAttachmentParamsJsonSchema = makeJsonSchema(DeleteAttachmentParamsSchema)
export const pinAttachmentParamsJsonSchema = makeJsonSchema(PinAttachmentParamsSchema)
export const downloadAttachmentParamsJsonSchema = makeJsonSchema(DownloadAttachmentParamsSchema)
export const addIssueAttachmentParamsJsonSchema = makeJsonSchema(AddIssueAttachmentParamsSchema)
export const addDocumentAttachmentParamsJsonSchema = makeJsonSchema(AddDocumentAttachmentParamsSchema)

export const parseListAttachmentsParams = Schema.decodeUnknown(ListAttachmentsParamsSchema)
export const parseGetAttachmentParams = Schema.decodeUnknown(GetAttachmentParamsSchema)
export const parseAddAttachmentParams = Schema.decodeUnknown(AddAttachmentParamsSchema)
export const parseUpdateAttachmentParams = Schema.decodeUnknown(UpdateAttachmentParamsSchema)
export const parseDeleteAttachmentParams = Schema.decodeUnknown(DeleteAttachmentParamsSchema)
export const parsePinAttachmentParams = Schema.decodeUnknown(PinAttachmentParamsSchema)
export const parseDownloadAttachmentParams = Schema.decodeUnknown(DownloadAttachmentParamsSchema)
export const parseAddIssueAttachmentParams = Schema.decodeUnknown(AddIssueAttachmentParamsSchema)
export const parseAddDocumentAttachmentParams = Schema.decodeUnknown(AddDocumentAttachmentParamsSchema)

// --- Result Schemas ---

export const AddAttachmentResultSchema = Schema.Struct({
  attachmentId: AttachmentId,
  blobId: BlobId,
  url: Schema.String
}).annotations({ title: "AddAttachmentResult", description: "Result of add attachment operation" })
export type AddAttachmentResult = Schema.Schema.Type<typeof AddAttachmentResultSchema>

export const UpdateAttachmentResultSchema = Schema.Struct({
  attachmentId: AttachmentId,
  updated: Schema.Boolean
}).annotations({ title: "UpdateAttachmentResult", description: "Result of update attachment operation" })
export type UpdateAttachmentResult = Schema.Schema.Type<typeof UpdateAttachmentResultSchema>

export const DeleteAttachmentResultSchema = Schema.Struct({
  attachmentId: AttachmentId,
  deleted: Schema.Boolean
}).annotations({ title: "DeleteAttachmentResult", description: "Result of delete attachment operation" })
export type DeleteAttachmentResult = Schema.Schema.Type<typeof DeleteAttachmentResultSchema>

export const PinAttachmentResultSchema = Schema.Struct({
  attachmentId: AttachmentId,
  pinned: Schema.Boolean
}).annotations({ title: "PinAttachmentResult", description: "Result of pin attachment operation" })
export type PinAttachmentResult = Schema.Schema.Type<typeof PinAttachmentResultSchema>

export const DownloadAttachmentResultSchema = Schema.Struct({
  attachmentId: AttachmentId,
  url: Schema.String,
  name: Schema.String,
  type: Schema.String,
  size: Schema.Number
}).annotations({ title: "DownloadAttachmentResult", description: "Result of download attachment operation" })
export type DownloadAttachmentResult = Schema.Schema.Type<typeof DownloadAttachmentResultSchema>
