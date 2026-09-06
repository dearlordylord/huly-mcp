import { Schema } from "effect"

import { AccountUuid, DocumentId, TeamspaceId } from "../../domain/schemas/shared.js"

export const TeamspaceProjectionSchema = Schema.Struct({
  _id: TeamspaceId,
  name: Schema.String,
  archived: Schema.Boolean,
  members: Schema.Array(AccountUuid)
})
export type TeamspaceProjection = Schema.Schema.Type<typeof TeamspaceProjectionSchema>
export const decodeTeamspaceProjection = Schema.decodeUnknownResult(TeamspaceProjectionSchema)

export const DocumentProjectionSchema = Schema.Struct({
  _id: DocumentId,
  space: TeamspaceId,
  title: Schema.String,
  lockedBy: Schema.optionalKey(Schema.NullOr(AccountUuid))
})
export type DocumentProjection = Schema.Schema.Type<typeof DocumentProjectionSchema>
export const decodeDocumentProjection = Schema.decodeUnknownResult(DocumentProjectionSchema)
