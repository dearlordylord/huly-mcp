import {
  createDocumentParamsJsonSchema,
  createTeamspaceParamsJsonSchema,
  deleteDocumentParamsJsonSchema,
  deleteTeamspaceParamsJsonSchema,
  editDocumentParamsJsonSchema,
  getDocumentParamsJsonSchema,
  getTeamspaceParamsJsonSchema,
  listDocumentsParamsJsonSchema,
  listInlineCommentsParamsJsonSchema,
  listTeamspacesParamsJsonSchema,
  parseCreateDocumentParams,
  parseCreateTeamspaceParams,
  parseDeleteDocumentParams,
  parseDeleteTeamspaceParams,
  parseEditDocumentParams,
  parseGetDocumentParams,
  parseGetTeamspaceParams,
  parseListDocumentsParams,
  parseListInlineCommentsParams,
  parseListTeamspacesParams,
  parseUpdateTeamspaceParams,
  updateTeamspaceParamsJsonSchema
} from "../../domain/schemas.js"
import {
  createDocument,
  createTeamspace,
  deleteDocument,
  deleteTeamspace,
  editDocument,
  getDocument,
  getTeamspace,
  listDocuments,
  listInlineComments,
  listTeamspaces,
  updateTeamspace
} from "../../huly/operations/documents.js"
import { createToolHandler, type RegisteredTool } from "./registry.js"

const CATEGORY = "documents" as const

export const documentTools: ReadonlyArray<RegisteredTool> = [
  {
    name: "list_teamspaces",
    description:
      "List all Huly document teamspaces. Returns teamspaces sorted by name. Supports filtering by archived status.",
    category: CATEGORY,
    inputSchema: listTeamspacesParamsJsonSchema,
    handler: createToolHandler(
      "list_teamspaces",
      parseListTeamspacesParams,
      listTeamspaces
    )
  },
  {
    name: "get_teamspace",
    description:
      "Get details for a Huly document teamspace including document count. Finds by name or ID, including archived teamspaces.",
    category: CATEGORY,
    inputSchema: getTeamspaceParamsJsonSchema,
    handler: createToolHandler(
      "get_teamspace",
      parseGetTeamspaceParams,
      getTeamspace
    )
  },
  {
    name: "create_teamspace",
    description:
      "Create a new Huly document teamspace. Idempotent: returns existing teamspace if one with the same name exists.",
    category: CATEGORY,
    inputSchema: createTeamspaceParamsJsonSchema,
    handler: createToolHandler(
      "create_teamspace",
      parseCreateTeamspaceParams,
      createTeamspace
    )
  },
  {
    name: "update_teamspace",
    description:
      "Update fields on an existing Huly document teamspace. Only provided fields are modified. Set description to null to clear it.",
    category: CATEGORY,
    inputSchema: updateTeamspaceParamsJsonSchema,
    handler: createToolHandler(
      "update_teamspace",
      parseUpdateTeamspaceParams,
      updateTeamspace
    )
  },
  {
    name: "delete_teamspace",
    description: "Permanently delete a Huly document teamspace. This action cannot be undone.",
    category: CATEGORY,
    inputSchema: deleteTeamspaceParamsJsonSchema,
    handler: createToolHandler(
      "delete_teamspace",
      parseDeleteTeamspaceParams,
      deleteTeamspace
    )
  },
  {
    name: "list_documents",
    description:
      "List documents in a Huly teamspace. Returns documents sorted by modification date (newest first). Each result includes a 'url' field pointing to the document in the Huly web app. Supports searching by title substring (titleSearch) and content (contentSearch).",
    category: CATEGORY,
    inputSchema: listDocumentsParamsJsonSchema,
    handler: createToolHandler(
      "list_documents",
      parseListDocumentsParams,
      listDocuments
    )
  },
  {
    name: "get_document",
    description:
      "Retrieve full details for a Huly document including markdown content and a 'url' field pointing to the document in the Huly web app. Use this to view document content and metadata.",
    category: CATEGORY,
    inputSchema: getDocumentParamsJsonSchema,
    handler: createToolHandler(
      "get_document",
      parseGetDocumentParams,
      getDocument
    )
  },
  {
    name: "create_document",
    description:
      "Create a new document in a Huly teamspace. Content supports full markdown including native Mermaid diagrams (```mermaid blocks render interactively in Huly UI). Returns the created document id and a 'url' field pointing to the document in the Huly web app. Use link_document_to_issue to associate the document with a tracker issue.",
    category: CATEGORY,
    inputSchema: createDocumentParamsJsonSchema,
    handler: createToolHandler(
      "create_document",
      parseCreateDocumentParams,
      createDocument
    )
  },
  {
    name: "edit_document",
    description:
      "Edit an existing Huly document. Two content modes (mutually exclusive): (1) 'content' for full replace, (2) 'old_text' + 'new_text' for targeted search-and-replace. Multiple matches error unless replace_all is true. Empty new_text deletes matched text. Also supports renaming via 'title'. Content supports full markdown including native Mermaid diagrams. Returns a 'url' field pointing to the document in the Huly web app.",
    category: CATEGORY,
    inputSchema: editDocumentParamsJsonSchema,
    handler: createToolHandler(
      "edit_document",
      parseEditDocumentParams,
      editDocument
    )
  },
  {
    name: "list_inline_comments",
    description:
      "List inline comment threads from a Huly document. Extracts comments embedded in document content as ProseMirror marks. Each comment includes the highlighted text and thread ID. Set includeReplies=true to also fetch thread reply messages with sender names.",
    category: CATEGORY,
    inputSchema: listInlineCommentsParamsJsonSchema,
    handler: createToolHandler(
      "list_inline_comments",
      parseListInlineCommentsParams,
      listInlineComments
    )
  },
  {
    name: "delete_document",
    description: "Permanently delete a Huly document. This action cannot be undone.",
    category: CATEGORY,
    inputSchema: deleteDocumentParamsJsonSchema,
    handler: createToolHandler(
      "delete_document",
      parseDeleteDocumentParams,
      deleteDocument
    )
  }
]
