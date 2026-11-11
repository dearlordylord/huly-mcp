import { Schema } from "effect"

import { toDraft07JsonSchema } from "./json-schema.js"
import { DocumentId, DocumentIdentifier, TeamspaceIdentifier, UrlString } from "./shared.js"

export const MoveDocumentParamsSchema = Schema.Struct({
  teamspace: TeamspaceIdentifier.annotate({ description: "Teamspace name or ID" }),
  document: DocumentIdentifier.annotate({ description: "Title or ID of the document to move" }),
  parent: Schema.NullOr(DocumentIdentifier).annotate({
    description:
      "New parent document title or ID in the same teamspace, or null to move the document to the teamspace root"
  })
}).annotate({ title: "MoveDocumentParams", description: "Parameters for moving a document to another parent" })

export type MoveDocumentParams = Schema.Schema.Type<typeof MoveDocumentParamsSchema>

export const MoveDocumentResultSchema = Schema.Struct({
  id: DocumentId,
  parent: Schema.NullOr(DocumentId),
  moved: Schema.Boolean,
  url: UrlString
})
export type MoveDocumentResult = Schema.Schema.Type<typeof MoveDocumentResultSchema>

export const moveDocumentParamsJsonSchema = toDraft07JsonSchema(MoveDocumentParamsSchema)
export const parseMoveDocumentParams = Schema.decodeUnknownEffect(MoveDocumentParamsSchema)
