import { JSONSchema, Schema } from "effect"

import {
  DocumentId,
  DocumentIdentifier,
  LimitParam,
  NonEmptyString,
  TeamspaceId,
  TeamspaceIdentifier,
  Timestamp
} from "./shared.js"

export const TeamspaceSummarySchema = Schema.Struct({
  id: TeamspaceId,
  name: Schema.String,
  description: Schema.optional(Schema.String),
  archived: Schema.Boolean,
  private: Schema.Boolean
}).annotations({
  title: "TeamspaceSummary",
  description: "Teamspace summary for list operations"
})

export type TeamspaceSummary = Schema.Schema.Type<typeof TeamspaceSummarySchema>

export const ListTeamspacesParamsSchema = Schema.Struct({
  includeArchived: Schema.optional(Schema.Boolean.annotations({
    description: "Include archived teamspaces in results (default: false, showing only active)"
  })),
  limit: Schema.optional(
    LimitParam.annotations({
      description: "Maximum number of teamspaces to return (default: 50)"
    })
  )
}).annotations({
  title: "ListTeamspacesParams",
  description: "Parameters for listing teamspaces"
})

export type ListTeamspacesParams = Schema.Schema.Type<typeof ListTeamspacesParamsSchema>

export const ListTeamspacesResultSchema = Schema.Struct({
  teamspaces: Schema.Array(TeamspaceSummarySchema),
  total: Schema.Number.pipe(Schema.int(), Schema.nonNegative())
}).annotations({
  title: "ListTeamspacesResult",
  description: "Result of listing teamspaces"
})

export type ListTeamspacesResult = Schema.Schema.Type<typeof ListTeamspacesResultSchema>

export const DocumentSummarySchema = Schema.Struct({
  id: DocumentId,
  title: Schema.String,
  teamspace: NonEmptyString,
  modifiedOn: Schema.optional(Timestamp)
}).annotations({
  title: "DocumentSummary",
  description: "Document summary for list operations"
})

export type DocumentSummary = Schema.Schema.Type<typeof DocumentSummarySchema>

export const ListDocumentsParamsSchema = Schema.Struct({
  teamspace: TeamspaceIdentifier.annotations({
    description: "Teamspace name or ID"
  }),
  titleSearch: Schema.optional(Schema.String.annotations({
    description: "Search documents by title substring (case-insensitive)"
  })),
  contentSearch: Schema.optional(Schema.String.annotations({
    description: "Search documents by content (fulltext search)"
  })),
  limit: Schema.optional(
    LimitParam.annotations({
      description: "Maximum number of documents to return (default: 50)"
    })
  )
}).annotations({
  title: "ListDocumentsParams",
  description: "Parameters for listing documents in a teamspace"
})

export type ListDocumentsParams = Schema.Schema.Type<typeof ListDocumentsParamsSchema>

export const ListDocumentsResultSchema = Schema.Struct({
  documents: Schema.Array(DocumentSummarySchema),
  total: Schema.Number.pipe(Schema.int(), Schema.nonNegative())
}).annotations({
  title: "ListDocumentsResult",
  description: "Result of listing documents"
})

export type ListDocumentsResult = Schema.Schema.Type<typeof ListDocumentsResultSchema>

export const DocumentSchema = Schema.Struct({
  id: DocumentId,
  title: Schema.String,
  content: Schema.optional(Schema.String),
  teamspace: NonEmptyString,
  modifiedOn: Schema.optional(Timestamp),
  createdOn: Schema.optional(Timestamp)
}).annotations({
  title: "Document",
  description: "Full document with content"
})

export type Document = Schema.Schema.Type<typeof DocumentSchema>

export const GetDocumentParamsSchema = Schema.Struct({
  teamspace: TeamspaceIdentifier.annotations({
    description: "Teamspace name or ID"
  }),
  document: DocumentIdentifier.annotations({
    description: "Document title or ID"
  })
}).annotations({
  title: "GetDocumentParams",
  description: "Parameters for getting a single document"
})

export type GetDocumentParams = Schema.Schema.Type<typeof GetDocumentParamsSchema>

export const CreateDocumentParamsSchema = Schema.Struct({
  teamspace: TeamspaceIdentifier.annotations({
    description: "Teamspace name or ID"
  }),
  title: NonEmptyString.annotations({
    description: "Document title"
  }),
  content: Schema.optional(Schema.String.annotations({
    description: "Document content (markdown supported)"
  }))
}).annotations({
  title: "CreateDocumentParams",
  description: "Parameters for creating a document"
})

export type CreateDocumentParams = Schema.Schema.Type<typeof CreateDocumentParamsSchema>

export const UpdateDocumentParamsSchema = Schema.Struct({
  teamspace: TeamspaceIdentifier.annotations({
    description: "Teamspace name or ID"
  }),
  document: DocumentIdentifier.annotations({
    description: "Document title or ID"
  }),
  title: Schema.optional(NonEmptyString.annotations({
    description: "New document title"
  })),
  content: Schema.optional(Schema.String.annotations({
    description: "New document content (markdown supported)"
  }))
}).annotations({
  title: "UpdateDocumentParams",
  description: "Parameters for updating a document"
})

export type UpdateDocumentParams = Schema.Schema.Type<typeof UpdateDocumentParamsSchema>

export const DeleteDocumentParamsSchema = Schema.Struct({
  teamspace: TeamspaceIdentifier.annotations({
    description: "Teamspace name or ID"
  }),
  document: DocumentIdentifier.annotations({
    description: "Document title or ID"
  })
}).annotations({
  title: "DeleteDocumentParams",
  description: "Parameters for deleting a document"
})

export type DeleteDocumentParams = Schema.Schema.Type<typeof DeleteDocumentParamsSchema>

export const listTeamspacesParamsJsonSchema = JSONSchema.make(ListTeamspacesParamsSchema)
export const listDocumentsParamsJsonSchema = JSONSchema.make(ListDocumentsParamsSchema)
export const getDocumentParamsJsonSchema = JSONSchema.make(GetDocumentParamsSchema)
export const createDocumentParamsJsonSchema = JSONSchema.make(CreateDocumentParamsSchema)
export const updateDocumentParamsJsonSchema = JSONSchema.make(UpdateDocumentParamsSchema)
export const deleteDocumentParamsJsonSchema = JSONSchema.make(DeleteDocumentParamsSchema)

export const parseListTeamspacesParams = Schema.decodeUnknown(ListTeamspacesParamsSchema)
export const parseListDocumentsParams = Schema.decodeUnknown(ListDocumentsParamsSchema)
export const parseGetDocumentParams = Schema.decodeUnknown(GetDocumentParamsSchema)
export const parseCreateDocumentParams = Schema.decodeUnknown(CreateDocumentParamsSchema)
export const parseUpdateDocumentParams = Schema.decodeUnknown(UpdateDocumentParamsSchema)
export const parseDeleteDocumentParams = Schema.decodeUnknown(DeleteDocumentParamsSchema)

// --- Result Schemas ---

export const CreateDocumentResultSchema = Schema.Struct({
  id: DocumentId,
  title: Schema.String
}).annotations({ title: "CreateDocumentResult", description: "Result of create document operation" })
export type CreateDocumentResult = Schema.Schema.Type<typeof CreateDocumentResultSchema>

export const UpdateDocumentResultSchema = Schema.Struct({
  id: DocumentId,
  updated: Schema.Boolean
}).annotations({ title: "UpdateDocumentResult", description: "Result of update document operation" })
export type UpdateDocumentResult = Schema.Schema.Type<typeof UpdateDocumentResultSchema>

export const DeleteDocumentResultSchema = Schema.Struct({
  id: DocumentId,
  deleted: Schema.Boolean
}).annotations({ title: "DeleteDocumentResult", description: "Result of delete document operation" })
export type DeleteDocumentResult = Schema.Schema.Type<typeof DeleteDocumentResultSchema>
