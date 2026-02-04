/**
 * Document domain operations for Huly MCP server.
 *
 * Provides typed operations for querying and managing documents and teamspaces from Huly platform.
 * Operations use HulyClient service and return typed domain objects.
 *
 * @module
 */
import {
  type Data,
  type DocumentUpdate,
  generateId,
  type MarkupBlobRef,
  type Ref,
  SortingOrder
} from "@hcengineering/core"
import type { Document as HulyDocument, Teamspace as HulyTeamspace } from "@hcengineering/document"
import { makeRank } from "@hcengineering/rank"
import { Effect } from "effect"

import type {
  CreateDocumentParams,
  DeleteDocumentParams,
  Document,
  DocumentSummary,
  GetDocumentParams,
  ListDocumentsParams,
  ListDocumentsResult,
  ListTeamspacesParams,
  ListTeamspacesResult,
  TeamspaceSummary,
  UpdateDocumentParams
} from "../../domain/schemas.js"
import { HulyClient, type HulyClientError } from "../client.js"
import { DocumentNotFoundError, TeamspaceNotFoundError } from "../errors.js"

// Import plugin objects at runtime (CommonJS modules)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const documentPlugin = require("@hcengineering/document").default as typeof import("@hcengineering/document").default

export type ListTeamspacesError = HulyClientError

export type ListDocumentsError =
  | HulyClientError
  | TeamspaceNotFoundError

export type GetDocumentError =
  | HulyClientError
  | TeamspaceNotFoundError
  | DocumentNotFoundError

export type CreateDocumentError =
  | HulyClientError
  | TeamspaceNotFoundError

export type UpdateDocumentError =
  | HulyClientError
  | TeamspaceNotFoundError
  | DocumentNotFoundError

export type DeleteDocumentError =
  | HulyClientError
  | TeamspaceNotFoundError
  | DocumentNotFoundError

// --- Helpers ---

/**
 * Find a teamspace by name or ID.
 */
const findTeamspace = (
  identifier: string
): Effect.Effect<
  { client: HulyClient["Type"]; teamspace: HulyTeamspace },
  TeamspaceNotFoundError | HulyClientError,
  HulyClient
> =>
  Effect.gen(function*() {
    const client = yield* HulyClient

    // Try to find by name first
    let teamspace = yield* client.findOne<HulyTeamspace>(
      documentPlugin.class.Teamspace,
      { name: identifier, archived: false }
    )

    // If not found by name, try by ID
    if (teamspace === undefined) {
      teamspace = yield* client.findOne<HulyTeamspace>(
        documentPlugin.class.Teamspace,
        { _id: identifier as Ref<HulyTeamspace> }
      )
    }

    if (teamspace === undefined) {
      return yield* new TeamspaceNotFoundError({ identifier })
    }

    return { client, teamspace }
  })

/**
 * Find a teamspace and document.
 */
const findTeamspaceAndDocument = (
  params: { teamspace: string; document: string }
): Effect.Effect<
  { client: HulyClient["Type"]; teamspace: HulyTeamspace; doc: HulyDocument },
  TeamspaceNotFoundError | DocumentNotFoundError | HulyClientError,
  HulyClient
> =>
  Effect.gen(function*() {
    const { client, teamspace } = yield* findTeamspace(params.teamspace)

    // Try to find by title first
    let doc = yield* client.findOne<HulyDocument>(
      documentPlugin.class.Document,
      {
        space: teamspace._id,
        title: params.document
      }
    )

    // If not found by title, try by ID
    if (doc === undefined) {
      doc = yield* client.findOne<HulyDocument>(
        documentPlugin.class.Document,
        {
          space: teamspace._id,
          _id: params.document as Ref<HulyDocument>
        }
      )
    }

    if (doc === undefined) {
      return yield* new DocumentNotFoundError({
        identifier: params.document,
        teamspace: params.teamspace
      })
    }

    return { client, teamspace, doc }
  })

// --- Operations ---

/**
 * List teamspaces.
 * Results sorted by name ascending.
 */
export const listTeamspaces = (
  params: ListTeamspacesParams
): Effect.Effect<ListTeamspacesResult, ListTeamspacesError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient

    const query: Record<string, unknown> = {}
    if (!params.includeArchived) {
      query.archived = false
    }

    const limit = Math.min(params.limit ?? 50, 200)

    const teamspaces = yield* client.findAll<HulyTeamspace>(
      documentPlugin.class.Teamspace,
      query,
      {
        limit,
        sort: {
          name: SortingOrder.Ascending
        }
      }
    )

    const total = teamspaces.total ?? teamspaces.length

    const summaries: Array<TeamspaceSummary> = teamspaces.map((ts) => ({
      id: String(ts._id),
      name: ts.name,
      description: ts.description || undefined,
      archived: ts.archived,
      private: ts.private
    }))

    return {
      teamspaces: summaries,
      total
    }
  })

/**
 * List documents in a teamspace.
 * Results sorted by name ascending.
 */
export const listDocuments = (
  params: ListDocumentsParams
): Effect.Effect<ListDocumentsResult, ListDocumentsError, HulyClient> =>
  Effect.gen(function*() {
    const { client, teamspace } = yield* findTeamspace(params.teamspace)

    const limit = Math.min(params.limit ?? 50, 200)

    const documents = yield* client.findAll<HulyDocument>(
      documentPlugin.class.Document,
      {
        space: teamspace._id
      },
      {
        limit,
        sort: {
          modifiedOn: SortingOrder.Descending
        }
      }
    )

    const total = documents.total ?? documents.length

    const summaries: Array<DocumentSummary> = documents.map((doc) => ({
      id: String(doc._id),
      title: doc.title,
      teamspace: teamspace.name,
      modifiedOn: doc.modifiedOn
    }))

    return {
      documents: summaries,
      total
    }
  })

/**
 * Get a single document with full content.
 *
 * Looks up document by title or ID within the specified teamspace.
 * Returns full document including:
 * - Content rendered as markdown
 * - All metadata
 */
export const getDocument = (
  params: GetDocumentParams
): Effect.Effect<Document, GetDocumentError, HulyClient> =>
  Effect.gen(function*() {
    const { client, doc, teamspace } = yield* findTeamspaceAndDocument({
      teamspace: params.teamspace,
      document: params.document
    })

    let content: string | undefined
    if (doc.content) {
      content = yield* client.fetchMarkup(
        doc._class,
        doc._id,
        "content",
        doc.content,
        "markdown"
      )
    }

    const result: Document = {
      id: String(doc._id),
      title: doc.title,
      content,
      teamspace: teamspace.name,
      modifiedOn: doc.modifiedOn,
      createdOn: doc.createdOn
    }

    return result
  })

// --- Create Document Operation ---

/**
 * Result of createDocument operation.
 */
export interface CreateDocumentResult {
  id: string
  title: string
}

/**
 * Create a new document in a teamspace.
 *
 * Creates document with:
 * - Title (required)
 * - Content (optional, markdown supported)
 *
 * @param params - Create document parameters
 * @returns Created document id and title
 * @throws TeamspaceNotFoundError if teamspace doesn't exist
 */
export const createDocument = (
  params: CreateDocumentParams
): Effect.Effect<CreateDocumentResult, CreateDocumentError, HulyClient> =>
  Effect.gen(function*() {
    const { client, teamspace } = yield* findTeamspace(params.teamspace)

    const documentId: Ref<HulyDocument> = generateId()

    // Fetch rank of the last document to insert after
    const lastDoc = yield* client.findOne<HulyDocument>(
      documentPlugin.class.Document,
      { space: teamspace._id },
      { sort: { rank: SortingOrder.Descending } }
    )
    const rank = makeRank(lastDoc?.rank, undefined)

    let contentMarkupRef: MarkupBlobRef | null = null
    if (params.content !== undefined && params.content.trim() !== "") {
      contentMarkupRef = yield* client.uploadMarkup(
        documentPlugin.class.Document,
        documentId,
        "content",
        params.content,
        "markdown"
      )
    }

    const documentData: Data<HulyDocument> = {
      title: params.title,
      content: contentMarkupRef,
      parent: documentPlugin.ids.NoParent,
      rank
    }

    yield* client.createDoc(
      documentPlugin.class.Document,
      teamspace._id,
      documentData,
      documentId
    )

    return { id: String(documentId), title: params.title }
  })

// --- Update Document Operation ---

/**
 * Result of updateDocument operation.
 */
export interface UpdateDocumentResult {
  id: string
  updated: boolean
}

/**
 * Update an existing document in a teamspace.
 *
 * Updates only provided fields:
 * - title: New title
 * - content: New markdown content (uploaded via uploadMarkup)
 *
 * @param params - Update document parameters
 * @returns Updated document id and success flag
 * @throws TeamspaceNotFoundError if teamspace doesn't exist
 * @throws DocumentNotFoundError if document doesn't exist
 */
export const updateDocument = (
  params: UpdateDocumentParams
): Effect.Effect<UpdateDocumentResult, UpdateDocumentError, HulyClient> =>
  Effect.gen(function*() {
    const { client, doc, teamspace } = yield* findTeamspaceAndDocument(params)

    const updateOps: DocumentUpdate<HulyDocument> = {}

    if (params.title !== undefined) {
      updateOps.title = params.title
    }

    if (params.content !== undefined) {
      if (params.content.trim() === "") {
        updateOps.content = null
      } else {
        const contentMarkupRef = yield* client.uploadMarkup(
          documentPlugin.class.Document,
          doc._id,
          "content",
          params.content,
          "markdown"
        )
        updateOps.content = contentMarkupRef
      }
    }

    if (Object.keys(updateOps).length === 0) {
      return { id: String(doc._id), updated: false }
    }

    yield* client.updateDoc(
      documentPlugin.class.Document,
      teamspace._id,
      doc._id,
      updateOps
    )

    return { id: String(doc._id), updated: true }
  })

// --- Delete Document Operation ---

/**
 * Result of deleteDocument operation.
 */
export interface DeleteDocumentResult {
  id: string
  deleted: boolean
}

/**
 * Delete a document from a teamspace.
 *
 * Permanently removes the document. This operation cannot be undone.
 *
 * @param params - Delete document parameters
 * @returns Deleted document id and success flag
 * @throws TeamspaceNotFoundError if teamspace doesn't exist
 * @throws DocumentNotFoundError if document doesn't exist
 */
export const deleteDocument = (
  params: DeleteDocumentParams
): Effect.Effect<DeleteDocumentResult, DeleteDocumentError, HulyClient> =>
  Effect.gen(function*() {
    const { client, doc, teamspace } = yield* findTeamspaceAndDocument(params)

    yield* client.removeDoc(
      documentPlugin.class.Document,
      teamspace._id,
      doc._id
    )

    return { id: String(doc._id), deleted: true }
  })
