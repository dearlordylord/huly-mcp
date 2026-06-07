/**
 * Edit document operation for Huly MCP server.
 *
 * NOT SDK PARITY — see EditDocumentParamsSchema in domain/schemas/documents.ts
 * for the full design rationale.
 *
 * @module
 */
import type { DocumentUpdate } from "@hcengineering/core"
import type { Document as HulyDocument } from "@hcengineering/document"
import { Effect } from "effect"

import type { EditDocumentParams } from "../../domain/schemas.js"
import { EDIT_DOCUMENT_UPDATE_FIELD_GROUPS, type EditDocumentResult } from "../../domain/schemas/documents.js"
import { Count, DocumentId } from "../../domain/schemas/shared.js"
import type { HulyClient, HulyClientError } from "../client.js"
import {
  DocumentEditModeError,
  DocumentEmptyContentError,
  type DocumentNotFoundError,
  type DocumentReferenceError,
  DocumentTextMultipleMatchesError,
  DocumentTextNotFoundError,
  type IssueNotFoundError,
  NoUpdateFieldsError,
  type PersonIdentifierAmbiguousError,
  type PersonNotFoundError,
  type ProjectNotFoundError,
  type TeamspaceNotFoundError
} from "../errors.js"
import { buildDocumentUrlFromConfig } from "../url-builders.js"
import { renderDocumentContentForWrite } from "./document-native-references.js"
import { findTeamspaceAndDocument } from "./documents-shared.js"

import { documentPlugin } from "../huly-plugins.js"

type EditDocumentError =
  | HulyClientError
  | TeamspaceNotFoundError
  | DocumentNotFoundError
  | DocumentTextNotFoundError
  | DocumentTextMultipleMatchesError
  | DocumentEmptyContentError
  | DocumentEditModeError
  | DocumentReferenceError
  | ProjectNotFoundError
  | IssueNotFoundError
  | PersonIdentifierAmbiguousError
  | PersonNotFoundError
  | NoUpdateFieldsError

export const editDocument = (
  params: EditDocumentParams
): Effect.Effect<EditDocumentResult, EditDocumentError, HulyClient> =>
  Effect.gen(function*() {
    const hasTitleOrContent = params.title !== undefined || params.content !== undefined
    const hasOldText = params.old_text !== undefined
    const hasNewText = params.new_text !== undefined
    const hasSearchReplace = hasOldText && hasNewText

    if (params.content !== undefined && (hasOldText || hasNewText)) {
      return yield* new DocumentEditModeError({
        reason: "content cannot be combined with old_text or new_text"
      })
    }

    if (hasOldText !== hasNewText) {
      return yield* new DocumentEditModeError({
        reason: "old_text and new_text must be provided together"
      })
    }

    if (hasOldText && params.old_text.trim() === "") {
      return yield* new DocumentEditModeError({
        reason: "old_text must be non-empty"
      })
    }

    if (params.replace_all !== undefined && !hasSearchReplace) {
      return yield* new DocumentEditModeError({
        reason: "replace_all requires both old_text and new_text"
      })
    }

    if (!hasTitleOrContent && !hasSearchReplace) {
      return yield* new NoUpdateFieldsError({
        operation: "edit_document",
        fields: EDIT_DOCUMENT_UPDATE_FIELD_GROUPS
      })
    }

    const { client, doc, teamspace } = yield* findTeamspaceAndDocument(params)

    const updateOps: DocumentUpdate<HulyDocument> = {}

    if (params.title !== undefined) {
      updateOps.title = params.title
    }

    // Mode 1: Full content replace
    if (params.content !== undefined) {
      if (params.content.trim() === "") {
        updateOps.content = null
      } else if (doc.content) {
        const renderedContent = yield* renderDocumentContentForWrite(params.content)
        yield* client.updateMarkup(
          documentPlugin.class.Document,
          doc._id,
          "content",
          renderedContent.markup,
          renderedContent.format
        )
      } else {
        const renderedContent = yield* renderDocumentContentForWrite(params.content)
        const contentMarkupRef = yield* client.uploadMarkup(
          documentPlugin.class.Document,
          doc._id,
          "content",
          renderedContent.markup,
          renderedContent.format
        )
        updateOps.content = contentMarkupRef
      }
    }

    // Mode 2: Search-and-replace
    if (params.old_text !== undefined && params.new_text !== undefined) {
      if (!doc.content) {
        return yield* new DocumentEmptyContentError({ identifier: params.document })
      }

      const currentContent: string = yield* client.fetchMarkup(
        doc._class,
        doc._id,
        "content",
        doc.content,
        "markdown"
      )

      const occurrences = countOccurrences(currentContent, params.old_text)

      if (occurrences === 0) {
        return yield* new DocumentTextNotFoundError({ searchText: params.old_text })
      }

      if (occurrences > 1 && !params.replace_all) {
        return yield* new DocumentTextMultipleMatchesError({
          searchText: params.old_text,
          matchCount: Count.make(occurrences)
        })
      }

      // Use indexOf+slice for single replace to avoid $& replacement-pattern
      // injection in String.prototype.replace. split/join is safe for replace_all.
      const idx = currentContent.indexOf(params.old_text)
      const newContent = params.replace_all
        ? currentContent.split(params.old_text).join(params.new_text)
        : currentContent.substring(0, idx) + params.new_text + currentContent.substring(idx + params.old_text.length)

      const renderedContent = yield* renderDocumentContentForWrite(newContent)

      yield* client.updateMarkup(
        documentPlugin.class.Document,
        doc._id,
        "content",
        renderedContent.markup,
        renderedContent.format
      )
    }

    const finalTitle = updateOps.title ?? doc.title
    const url = buildDocumentUrlFromConfig(client.workbenchUrlConfig, finalTitle, DocumentId.make(doc._id))

    if (Object.keys(updateOps).length > 0) {
      yield* client.updateDoc(
        documentPlugin.class.Document,
        teamspace._id,
        doc._id,
        updateOps
      )
    }

    return { id: DocumentId.make(doc._id), updated: true, url }
  })

const countOccurrences = (text: string, search: string): number => {
  let count = 0
  let pos = text.indexOf(search)
  while (pos !== -1) {
    count++
    pos = text.indexOf(search, pos + search.length)
  }
  return count
}
