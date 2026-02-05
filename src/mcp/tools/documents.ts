import {
  createDocumentParamsJsonSchema,
  deleteDocumentParamsJsonSchema,
  getDocumentParamsJsonSchema,
  listDocumentsParamsJsonSchema,
  listTeamspacesParamsJsonSchema,
  parseCreateDocumentParams,
  parseDeleteDocumentParams,
  parseGetDocumentParams,
  parseListDocumentsParams,
  parseListTeamspacesParams,
  parseUpdateDocumentParams,
  updateDocumentParamsJsonSchema
} from "../../domain/schemas.js"
import {
  createDocument,
  deleteDocument,
  getDocument,
  listDocuments,
  listTeamspaces,
  updateDocument
} from "../../huly/operations/documents.js"
import { createToolHandler, type RegisteredTool } from "./registry.js"

const CATEGORY = "Documents" as const

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
      (params) => listTeamspaces(params)
    )
  },
  {
    name: "list_documents",
    description:
      "List documents in a Huly teamspace. Returns documents sorted by modification date (newest first). Supports searching by title substring (titleSearch) and content (contentSearch).",
    category: CATEGORY,
    inputSchema: listDocumentsParamsJsonSchema,
    handler: createToolHandler(
      "list_documents",
      parseListDocumentsParams,
      (params) => listDocuments(params)
    )
  },
  {
    name: "get_document",
    description:
      "Retrieve full details for a Huly document including markdown content. Use this to view document content and metadata.",
    category: CATEGORY,
    inputSchema: getDocumentParamsJsonSchema,
    handler: createToolHandler(
      "get_document",
      parseGetDocumentParams,
      (params) => getDocument(params)
    )
  },
  {
    name: "create_document",
    description:
      "Create a new document in a Huly teamspace. Content supports markdown formatting. Returns the created document id.",
    category: CATEGORY,
    inputSchema: createDocumentParamsJsonSchema,
    handler: createToolHandler(
      "create_document",
      parseCreateDocumentParams,
      (params) => createDocument(params)
    )
  },
  {
    name: "update_document",
    description:
      "Update fields on an existing Huly document. Only provided fields are modified. Content updates support markdown.",
    category: CATEGORY,
    inputSchema: updateDocumentParamsJsonSchema,
    handler: createToolHandler(
      "update_document",
      parseUpdateDocumentParams,
      (params) => updateDocument(params)
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
      (params) => deleteDocument(params)
    )
  }
]
