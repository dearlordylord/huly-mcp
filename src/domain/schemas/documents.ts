import { Schema, SchemaGetter } from "effect"

import { DOCUMENT_NATIVE_REFERENCE_TOOL_USAGE } from "./document-native-references.js"
import { toDraft07JsonSchema } from "./json-schema.js"
import {
  assertUpdateFields,
  atLeastOneUpdateFieldMessage,
  DEFAULT_INCLUDE_ARCHIVED,
  DEFAULT_LIMIT,
  DEFAULT_PRIVATE,
  DocumentId,
  DocumentIdentifier,
  hasAtLeastOneDefined,
  LimitParam,
  ListTotal,
  NonEmptyString,
  TeamspaceId,
  TeamspaceIdentifier,
  UrlString,
  withAtLeastOneRequired
} from "./shared.js"

const DEFAULT_REPLACE_ALL = false
const DEFAULT_INCLUDE_COMMENT_REPLIES = false
export const TeamspaceSummarySchema = Schema.Struct({
  id: TeamspaceId,
  name: Schema.String,
  description: Schema.optional(Schema.String),
  archived: Schema.Boolean,
  private: Schema.Boolean
})
export type TeamspaceSummary = Schema.Schema.Type<typeof TeamspaceSummarySchema>

export const ListTeamspacesParamsSchema = Schema.Struct({
  includeArchived: Schema.optional(
    Schema.Boolean.annotate({
      description: `Include archived teamspaces in results (default: ${DEFAULT_INCLUDE_ARCHIVED}, showing only active)`
    })
  ),
  limit: Schema.optional(
    LimitParam.annotate({ description: `Maximum number of teamspaces to return (default: ${DEFAULT_LIMIT})` })
  )
}).annotate({ title: "ListTeamspacesParams", description: "Parameters for listing teamspaces" })

export type ListTeamspacesParams = Schema.Schema.Type<typeof ListTeamspacesParamsSchema>
export const ListTeamspacesResultSchema = Schema.Struct({
  teamspaces: Schema.Array(TeamspaceSummarySchema),
  total: ListTotal
})
export type ListTeamspacesResult = Schema.Schema.Type<typeof ListTeamspacesResultSchema>
const DocumentParentField = Schema.NullOr(DocumentId).annotate({
  description: "ID of the parent document, or null when the document is at the teamspace root."
})

export const DocumentSummarySchema = Schema.Struct({
  id: DocumentId,
  title: Schema.String,
  teamspace: Schema.String,
  parent: DocumentParentField,
  url: UrlString,
  modifiedOn: Schema.optional(Schema.Number)
})
export type DocumentSummary = Schema.Schema.Type<typeof DocumentSummarySchema>

const ListDocumentsParamsBase = Schema.Struct({
  teamspace: TeamspaceIdentifier.annotate({ description: "Teamspace name or ID" }),
  titleSearch: Schema.optional(
    Schema.String.annotate({
      description: "Search documents by title substring (case-insensitive). Mutually exclusive with titleRegex."
    })
  ),
  titleRegex: Schema.optional(
    Schema.String.annotate({
      description:
        "Filter documents by title using Huly $regex. On the supported Postgres backend this is SQL SIMILAR TO, not JavaScript RegExp; matching is case-sensitive and the pattern must match the whole title: use '%' for any string (e.g., '%RFC%' contains, 'RFC%' prefix). Mutually exclusive with titleSearch; use titleSearch for simple substring matching."
    })
  ),
  contentSearch: Schema.optional(
    Schema.String.annotate({ description: "Search documents by content (fulltext search)" })
  ),
  limit: Schema.optional(
    LimitParam.annotate({ description: `Maximum number of documents to return (default: ${DEFAULT_LIMIT})` })
  )
})

export const ListDocumentsParamsSchema = ListDocumentsParamsBase.pipe(
  Schema.check(
    Schema.makeFilter((params) => {
      if (params.titleSearch !== undefined && params.titleRegex !== undefined) {
        return "Cannot provide both 'titleSearch' and 'titleRegex'. Use one or the other."
      }
      return undefined
    })
  )
).annotate({ title: "ListDocumentsParams", description: "Parameters for listing documents in a teamspace" })

export type ListDocumentsParams = Schema.Schema.Type<typeof ListDocumentsParamsSchema>
export const ListDocumentsResultSchema = Schema.Struct({
  documents: Schema.Array(DocumentSummarySchema),
  total: ListTotal
})
export type ListDocumentsResult = Schema.Schema.Type<typeof ListDocumentsResultSchema>
export const DocumentSchema = Schema.Struct({
  id: DocumentId,
  title: Schema.String,
  content: Schema.optional(Schema.String),
  teamspace: Schema.String,
  parent: DocumentParentField,
  url: UrlString,
  modifiedOn: Schema.optional(Schema.Number),
  createdOn: Schema.optional(Schema.Number)
})
export type Document = Schema.Schema.Type<typeof DocumentSchema>
export const GetDocumentResultSchema = DocumentSchema
export type GetDocumentResult = Schema.Schema.Type<typeof GetDocumentResultSchema>

export const GetDocumentParamsSchema = Schema.Struct({
  teamspace: TeamspaceIdentifier.annotate({ description: "Teamspace name or ID" }),
  document: DocumentIdentifier.annotate({ description: "Document title or ID" })
}).annotate({ title: "GetDocumentParams", description: "Parameters for getting a single document" })

export type GetDocumentParams = Schema.Schema.Type<typeof GetDocumentParamsSchema>

export const CreateDocumentParamsSchema = Schema.Struct({
  teamspace: TeamspaceIdentifier.annotate({ description: "Teamspace name or ID" }),
  title: NonEmptyString.annotate({ description: "Document title" }),
  content: Schema.optional(
    Schema.String.annotate({ description: `Document content in markdown. ${DOCUMENT_NATIVE_REFERENCE_TOOL_USAGE}` })
  ),
  parent: Schema.optional(
    DocumentIdentifier.annotate({
      description: "Parent document title or ID to nest this document under. If omitted, creates a top-level document."
    })
  )
}).annotate({ title: "CreateDocumentParams", description: "Parameters for creating a document" })

export type CreateDocumentParams = Schema.Schema.Type<typeof CreateDocumentParamsSchema>

/**
 * Edit document parameters — supports two mutually exclusive content modes:
 *
 * 1. Full replace: provide `content` to overwrite the entire document body.
 * 2. Search-and-replace: provide `old_text` + `new_text` to perform a targeted edit.
 *
 * NOT SDK PARITY — Intentional design divergence.
 *
 * The Huly SDK only supports whole-document read (getMarkup) and whole-document
 * write (updateMarkup). There is no partial/patch API.
 *
 * The search-and-replace mode (old_text/new_text) is inspired by Claude Code's
 * Edit tool, to avoid forcing the calling agent to send full document content on
 * every edit. The server performs read-modify-write internally using SDK primitives.
 *
 * The old_text/new_text contract mirrors Claude Code's Edit tool:
 * - old_text must match exactly (no regex)
 * - Multiple matches error unless replace_all is set
 * - Empty new_text deletes the matched text
 * - Empty old_text is an error (use create_document for new content)
 *
 * Agents familiar with Claude Code's Edit tool can use the same mental model.
 */
const EditDocumentParamsBase = Schema.Struct({
  teamspace: TeamspaceIdentifier.annotate({ description: "Teamspace name or ID" }),
  document: DocumentIdentifier.annotate({ description: "Document title or ID" }),
  title: Schema.optional(NonEmptyString.annotate({ description: "New document title" })),
  content: Schema.optional(
    Schema.String.annotate({
      description: `Full replacement content in markdown. Mutually exclusive with old_text/new_text. ${DOCUMENT_NATIVE_REFERENCE_TOOL_USAGE}`
    })
  ),
  old_text: Schema.optional(
    Schema.String.annotate({
      description: "Exact text to find in the document. Must be non-empty. Mutually exclusive with content."
    })
  ),
  new_text: Schema.optional(
    Schema.String.annotate({
      description: "Replacement text. Empty string deletes the matched text. Required when old_text is provided."
    })
  ),
  replace_all: Schema.optional(
    Schema.Boolean.annotate({
      description: `Replace all occurrences of old_text (default: ${DEFAULT_REPLACE_ALL}). Only used with old_text/new_text.`
    })
  )
})

export const EDIT_DOCUMENT_UPDATE_FIELD_GROUPS: ReadonlyArray<string> = ["title", "content", "old_text/new_text"]

type EditDocumentParamsBase = Schema.Schema.Type<typeof EditDocumentParamsBase>

const contentModeError = (params: EditDocumentParamsBase): string | undefined =>
  params.content !== undefined && (params.old_text !== undefined || params.new_text !== undefined)
    ? "Cannot provide 'content' with 'old_text'/'new_text'. Use full replace or search-and-replace, not both."
    : undefined

const searchReplacePairError = (params: EditDocumentParamsBase): string | undefined =>
  (params.old_text !== undefined) !== (params.new_text !== undefined)
    ? "Both 'old_text' and 'new_text' must be provided together for search-and-replace mode."
    : undefined

const replaceAllModeError = (params: EditDocumentParamsBase): string | undefined =>
  params.replace_all !== undefined && params.old_text === undefined
    ? "replace_all can only be used with search-and-replace mode. Provide both 'old_text' and 'new_text'."
    : undefined

const missingDocumentUpdateError = (params: EditDocumentParamsBase): string | undefined =>
  params.title === undefined && params.content === undefined && params.old_text === undefined
    ? atLeastOneUpdateFieldMessage(EDIT_DOCUMENT_UPDATE_FIELD_GROUPS)
    : undefined

const emptyOldTextError = (params: EditDocumentParamsBase): string | undefined =>
  params.old_text !== undefined && params.old_text.trim() === ""
    ? "old_text must be non-empty. To create a new document, use create_document."
    : undefined

const editDocumentValidationError = (params: EditDocumentParamsBase): string | undefined =>
  [
    contentModeError(params),
    searchReplacePairError(params),
    replaceAllModeError(params),
    missingDocumentUpdateError(params),
    emptyOldTextError(params)
  ].find((error) => error !== undefined)

const ValidatedEditDocumentInputSchema = EditDocumentParamsBase.pipe(
  Schema.check(Schema.makeFilter(editDocumentValidationError))
)
const EditDocumentSearchText = Schema.String.pipe(
  /* v8 ignore next -- the outer input schema rejects blank old_text before constructing the command */
  Schema.check(Schema.makeFilter((value) => (value.trim() === "" ? "old_text must be non-empty" : undefined))),
  Schema.brand("EditDocumentSearchText")
)

const EditDocumentLocatorSchema = Schema.Struct({ teamspace: TeamspaceIdentifier, document: DocumentIdentifier })

const EditDocumentCommandSchema = Schema.Union([
  Schema.Struct({ ...EditDocumentLocatorSchema.fields, _tag: Schema.Literal("TitleOnly"), title: NonEmptyString }),
  Schema.Struct({
    ...EditDocumentLocatorSchema.fields,
    _tag: Schema.Literal("ReplaceContent"),
    title: Schema.optionalKey(NonEmptyString),
    content: Schema.String
  }),
  Schema.Struct({
    ...EditDocumentLocatorSchema.fields,
    _tag: Schema.Literal("SearchAndReplace"),
    title: Schema.optionalKey(NonEmptyString),
    oldText: EditDocumentSearchText,
    newText: Schema.String,
    replaceAll: Schema.Boolean
  })
]).annotate({ identifier: "EditDocumentCommand", title: "EditDocumentCommand" })

type EditDocumentCommand = Schema.Schema.Type<typeof EditDocumentCommandSchema>

const toEditDocumentCommand = (params: EditDocumentParamsBase): EditDocumentCommand => {
  if (params.content !== undefined) {
    return {
      _tag: "ReplaceContent",
      teamspace: params.teamspace,
      document: params.document,
      ...(params.title === undefined ? {} : { title: params.title }),
      content: params.content
    }
  }
  if (params.old_text !== undefined && params.new_text !== undefined) {
    return {
      _tag: "SearchAndReplace",
      teamspace: params.teamspace,
      document: params.document,
      ...(params.title === undefined ? {} : { title: params.title }),
      oldText: EditDocumentSearchText.make(params.old_text),
      newText: params.new_text,
      replaceAll: params.replace_all ?? DEFAULT_REPLACE_ALL
    }
  }
  return {
    _tag: "TitleOnly",
    teamspace: params.teamspace,
    document: params.document,
    /* v8 ignore next -- the validated title-only input necessarily contains title */
    title: NonEmptyString.make(params.title ?? "")
  }
}

const fromEditDocumentCommand = (command: EditDocumentCommand): EditDocumentParamsBase => {
  switch (command._tag) {
    case "TitleOnly":
      return { teamspace: command.teamspace, document: command.document, title: command.title }
    case "ReplaceContent":
      return {
        teamspace: command.teamspace,
        document: command.document,
        ...(command.title === undefined ? {} : { title: command.title }),
        content: command.content
      }
    case "SearchAndReplace":
      return {
        teamspace: command.teamspace,
        document: command.document,
        ...(command.title === undefined ? {} : { title: command.title }),
        old_text: command.oldText,
        new_text: command.newText,
        replace_all: command.replaceAll
      }
  }
}

export const EditDocumentParamsSchema = ValidatedEditDocumentInputSchema.pipe(
  Schema.decodeTo(Schema.toType(EditDocumentCommandSchema), {
    decode: SchemaGetter.transform(toEditDocumentCommand),
    encode: SchemaGetter.transform(fromEditDocumentCommand)
  })
).annotate({
  title: "EditDocumentParams",
  description: `Edit a document. Two content modes (mutually exclusive): (1) 'content' for full replace, (2) 'old_text' + 'new_text' for targeted search-and-replace. Also supports renaming via 'title'. ${atLeastOneUpdateFieldMessage(
    EDIT_DOCUMENT_UPDATE_FIELD_GROUPS
  )}`
})

export type EditDocumentParams = Schema.Schema.Type<typeof EditDocumentParamsSchema>
export type EditDocumentInput = Schema.Codec.Encoded<typeof EditDocumentParamsSchema>

export const DeleteDocumentParamsSchema = Schema.Struct({
  teamspace: TeamspaceIdentifier.annotate({ description: "Teamspace name or ID" }),
  document: DocumentIdentifier.annotate({ description: "Document title or ID" })
}).annotate({ title: "DeleteDocumentParams", description: "Parameters for deleting a document" })

export type DeleteDocumentParams = Schema.Schema.Type<typeof DeleteDocumentParamsSchema>

// --- Teamspace CRUD Schemas ---

export const GetTeamspaceParamsSchema = Schema.Struct({
  teamspace: TeamspaceIdentifier.annotate({ description: "Teamspace name or ID" })
}).annotate({ title: "GetTeamspaceParams", description: "Parameters for getting a single teamspace" })

export type GetTeamspaceParams = Schema.Schema.Type<typeof GetTeamspaceParamsSchema>

export const CreateTeamspaceParamsSchema = Schema.Struct({
  name: NonEmptyString.annotate({ description: "Teamspace name" }),
  description: Schema.optional(Schema.String.annotate({ description: "Teamspace description" })),
  private: Schema.optional(
    Schema.Boolean.annotate({ description: `Whether the teamspace is private (default: ${DEFAULT_PRIVATE})` })
  )
}).annotate({ title: "CreateTeamspaceParams", description: "Parameters for creating a teamspace" })

export type CreateTeamspaceParams = Schema.Schema.Type<typeof CreateTeamspaceParamsSchema>

export const UPDATE_TEAMSPACE_FIELDS = ["name", "description", "archived"] as const satisfies ReadonlyArray<
  "name" | "description" | "archived"
>

export const UpdateTeamspaceParamsSchema = Schema.Struct({
  teamspace: TeamspaceIdentifier.annotate({ description: "Teamspace name or ID" }),
  name: Schema.optional(NonEmptyString.annotate({ description: "New teamspace name" })),
  description: Schema.optional(
    Schema.NullOr(Schema.String).annotate({ description: "New description (null to clear)" })
  ),
  archived: Schema.optional(Schema.Boolean.annotate({ description: "Set archived status" }))
})
  .pipe(
    Schema.check(
      Schema.makeFilter((params) =>
        hasAtLeastOneDefined(params, UPDATE_TEAMSPACE_FIELDS)
          ? undefined
          : atLeastOneUpdateFieldMessage(UPDATE_TEAMSPACE_FIELDS)
      )
    )
  )
  .annotate({
    title: "UpdateTeamspaceParams",
    description: `Parameters for updating a teamspace. ${atLeastOneUpdateFieldMessage(UPDATE_TEAMSPACE_FIELDS)}`
  })

export type UpdateTeamspaceParams = Schema.Schema.Type<typeof UpdateTeamspaceParamsSchema>
assertUpdateFields<UpdateTeamspaceParams>()(["teamspace"], UPDATE_TEAMSPACE_FIELDS)

export const DeleteTeamspaceParamsSchema = Schema.Struct({
  teamspace: TeamspaceIdentifier.annotate({ description: "Teamspace name or ID" })
}).annotate({ title: "DeleteTeamspaceParams", description: "Parameters for deleting a teamspace" })

export type DeleteTeamspaceParams = Schema.Schema.Type<typeof DeleteTeamspaceParamsSchema>
export const GetTeamspaceResultSchema = Schema.Struct({ ...TeamspaceSummarySchema.fields, documents: ListTotal })
export type GetTeamspaceResult = Schema.Schema.Type<typeof GetTeamspaceResultSchema>
export const CreateTeamspaceResultSchema = Schema.Struct({
  id: TeamspaceId,
  name: Schema.String,
  created: Schema.Boolean
})
export type CreateTeamspaceResult = Schema.Schema.Type<typeof CreateTeamspaceResultSchema>
export const UpdateTeamspaceResultSchema = Schema.Struct({ id: TeamspaceId, updated: Schema.Boolean })
export type UpdateTeamspaceResult = Schema.Schema.Type<typeof UpdateTeamspaceResultSchema>
export const DeleteTeamspaceResultSchema = Schema.Struct({ id: TeamspaceId, deleted: Schema.Boolean })
export type DeleteTeamspaceResult = Schema.Schema.Type<typeof DeleteTeamspaceResultSchema>

// --- Inline Comments ---

export const ListInlineCommentsParamsSchema = Schema.Struct({
  teamspace: TeamspaceIdentifier.annotate({ description: "Teamspace name or ID" }),
  document: DocumentIdentifier.annotate({ description: "Document title or ID" }),
  includeReplies: Schema.optional(
    Schema.Boolean.annotate({
      description: `Include thread reply messages for each inline comment (default: ${DEFAULT_INCLUDE_COMMENT_REPLIES})`
    })
  )
}).annotate({
  title: "ListInlineCommentsParams",
  description: "Parameters for listing inline comment threads in a document"
})

export type ListInlineCommentsParams = Schema.Schema.Type<typeof ListInlineCommentsParamsSchema>
export const InlineCommentReplySchema = Schema.Struct({
  id: Schema.String,
  body: Schema.String,
  sender: Schema.optional(Schema.String),
  createdOn: Schema.optional(Schema.Number)
})
export type InlineCommentReply = Schema.Schema.Type<typeof InlineCommentReplySchema>
export const InlineCommentThreadSchema = Schema.Struct({
  threadId: Schema.String,
  text: Schema.String,
  replies: Schema.optional(Schema.Array(InlineCommentReplySchema))
})
export type InlineCommentThread = Schema.Schema.Type<typeof InlineCommentThreadSchema>
export const ListInlineCommentsResultSchema = Schema.Struct({
  comments: Schema.Array(InlineCommentThreadSchema),
  total: ListTotal
})
export type ListInlineCommentsResult = Schema.Schema.Type<typeof ListInlineCommentsResultSchema>

// --- JSON Schemas & Parsers ---

export const listTeamspacesParamsJsonSchema = toDraft07JsonSchema(ListTeamspacesParamsSchema)
export const getTeamspaceParamsJsonSchema = toDraft07JsonSchema(GetTeamspaceParamsSchema)
export const createTeamspaceParamsJsonSchema = toDraft07JsonSchema(CreateTeamspaceParamsSchema)
export const updateTeamspaceParamsJsonSchema = withAtLeastOneRequired(
  toDraft07JsonSchema(UpdateTeamspaceParamsSchema),
  UPDATE_TEAMSPACE_FIELDS
)
export const deleteTeamspaceParamsJsonSchema = toDraft07JsonSchema(DeleteTeamspaceParamsSchema)
export const listDocumentsParamsJsonSchema = toDraft07JsonSchema(ListDocumentsParamsSchema)
export const getDocumentParamsJsonSchema = toDraft07JsonSchema(GetDocumentParamsSchema)
export const createDocumentParamsJsonSchema = toDraft07JsonSchema(CreateDocumentParamsSchema)
const editDocumentGeneratedJsonSchema = toDraft07JsonSchema(EditDocumentParamsSchema)
const isJsonSchemaRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null
/* v8 ignore start -- defensive: the Draft-07 adapter on this Struct-derived schema always yields object properties */
const editDocumentGeneratedProperties =
  isJsonSchemaRecord(editDocumentGeneratedJsonSchema) && isJsonSchemaRecord(editDocumentGeneratedJsonSchema.properties)
    ? editDocumentGeneratedJsonSchema.properties
    : {}
const editDocumentOldTextJsonSchema = isJsonSchemaRecord(editDocumentGeneratedProperties.old_text)
  ? editDocumentGeneratedProperties.old_text
  : {}
/* v8 ignore stop */
export const editDocumentParamsJsonSchema = {
  ...editDocumentGeneratedJsonSchema,
  type: "object",
  properties: {
    ...editDocumentGeneratedProperties,
    old_text: { ...editDocumentOldTextJsonSchema, type: "string", pattern: "\\S" }
  },
  anyOf: [{ required: ["title"] }, { required: ["content"] }, { required: ["old_text", "new_text"] }],
  allOf: [
    { not: { anyOf: [{ required: ["content", "old_text"] }, { required: ["content", "new_text"] }] } },
    { if: { required: ["old_text"] }, then: { required: ["new_text"] } },
    { if: { required: ["new_text"] }, then: { required: ["old_text"] } },
    { if: { required: ["replace_all"] }, then: { required: ["old_text", "new_text"] } }
  ]
}
export const listInlineCommentsParamsJsonSchema = toDraft07JsonSchema(ListInlineCommentsParamsSchema)
export const deleteDocumentParamsJsonSchema = toDraft07JsonSchema(DeleteDocumentParamsSchema)

export const parseListTeamspacesParams = Schema.decodeUnknownEffect(ListTeamspacesParamsSchema)
export const parseGetTeamspaceParams = Schema.decodeUnknownEffect(GetTeamspaceParamsSchema)
export const parseCreateTeamspaceParams = Schema.decodeUnknownEffect(CreateTeamspaceParamsSchema)
export const parseUpdateTeamspaceParams = Schema.decodeUnknownEffect(UpdateTeamspaceParamsSchema)
export const parseDeleteTeamspaceParams = Schema.decodeUnknownEffect(DeleteTeamspaceParamsSchema)
export const parseListDocumentsParams = Schema.decodeUnknownEffect(ListDocumentsParamsSchema)
export const parseGetDocumentParams = Schema.decodeUnknownEffect(GetDocumentParamsSchema)
export const parseCreateDocumentParams = Schema.decodeUnknownEffect(CreateDocumentParamsSchema)
export const parseEditDocumentParams = Schema.decodeUnknownEffect(EditDocumentParamsSchema)
export const parseListInlineCommentsParams = Schema.decodeUnknownEffect(ListInlineCommentsParamsSchema)
export const parseDeleteDocumentParams = Schema.decodeUnknownEffect(DeleteDocumentParamsSchema)
export const CreateDocumentResultSchema = Schema.Struct({ id: DocumentId, title: Schema.String, url: UrlString })
export type CreateDocumentResult = Schema.Schema.Type<typeof CreateDocumentResultSchema>
export const EditDocumentResultSchema = Schema.Struct({ id: DocumentId, updated: Schema.Boolean, url: UrlString })
export type EditDocumentResult = Schema.Schema.Type<typeof EditDocumentResultSchema>
export const DeleteDocumentResultSchema = Schema.Struct({ id: DocumentId, deleted: Schema.Boolean })
export type DeleteDocumentResult = Schema.Schema.Type<typeof DeleteDocumentResultSchema>
