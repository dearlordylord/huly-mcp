import { type Ref, SortingOrder } from "@hcengineering/core"
import type { Document as HulyDocument, Teamspace as HulyTeamspace } from "@hcengineering/document"
import { makeRank } from "@hcengineering/rank"
import { Effect } from "effect"

import type { MoveDocumentParams, MoveDocumentResult } from "../../domain/schemas/document-move.js"
import { DocumentId } from "../../domain/schemas/shared.js"
import type { HulyClient } from "../client.js"
import { documentMoveParent, type DocumentMoveDestination } from "../document-move-adapter.js"
import {
  DocumentMoveConflictError,
  DocumentMoveCycleError,
  DocumentMoveTargetAmbiguousError,
  HulyDataInvalidError,
  HulyError
} from "../errors.js"
import { documentPlugin } from "../huly-plugins.js"
import { buildDocumentUrlFromConfig } from "../url-builders.js"
import { findDocumentInTeamspace, findTeamspaceAndDocument } from "./documents-shared.js"
import { hulyQuery } from "./query-helpers.js"

const parentChain = Effect.fn("Documents.parentChain")(function* (
  client: HulyClient["Service"],
  space: Ref<HulyTeamspace>,
  source: HulyDocument,
  target: HulyDocument,
  params: MoveDocumentParams & { readonly parent: NonNullable<MoveDocumentParams["parent"]> }
) {
  const visited = new Set<Ref<HulyDocument>>()
  let current: HulyDocument | undefined = target
  while (current !== undefined && !visited.has(current._id)) {
    if (current._id === source._id) {
      return yield* new DocumentMoveCycleError({
        identifier: params.document,
        parent: params.parent,
        teamspace: params.teamspace
      })
    }
    visited.add(current._id)
    if (current.parent === documentPlugin.ids.NoParent) {
      return Array.from(visited).reduceRight<DocumentMoveDestination>(
        (parent, id) => ({ type: "nested", id, parent }),
        { type: "root" }
      )
    }
    current = yield* client.findOne<HulyDocument>(
      documentPlugin.class.Document,
      hulyQuery<HulyDocument>({ space, _id: current.parent })
    )
  }
  return yield* new HulyDataInvalidError({ operation: "move_document", entity: "document parent chain" })
})

const resolveDestination = Effect.fn("Documents.resolveMoveDestination")(function* (
  client: HulyClient["Service"],
  teamspace: HulyTeamspace,
  doc: HulyDocument,
  params: MoveDocumentParams & { readonly parent: NonNullable<MoveDocumentParams["parent"]> }
) {
  const target = yield* findDocumentInTeamspace(client, teamspace, params.teamspace, params.parent, {
    preferId: true,
    onAmbiguous: (matches) =>
      new DocumentMoveTargetAmbiguousError({ target: { type: "parent", identifier: params.parent }, matches })
  })
  if (target._id === doc._id) {
    return yield* new DocumentMoveCycleError({
      identifier: params.document,
      parent: params.parent,
      teamspace: params.teamspace
    })
  }
  return target
})

const writeMove = Effect.fn("Documents.writeMove")(function* (
  client: HulyClient["Service"],
  space: Ref<HulyTeamspace>,
  doc: HulyDocument,
  destination: DocumentMoveDestination,
  params: MoveDocumentParams
) {
  const parent = documentMoveParent(destination)
  const lastSibling = yield* client.findOne<HulyDocument>(
    documentPlugin.class.Document,
    hulyQuery<HulyDocument>({ space, parent }),
    { sort: { rank: SortingOrder.Descending } }
  )
  const rank = makeRank(lastSibling?.rank, undefined)
  if (rank === lastSibling?.rank) {
    return yield* new HulyError({
      message:
        "The destination siblings have reached the maximum rank. Reorder the destination siblings in Huly before retrying."
    })
  }
  const result = yield* client
    .commitDocumentMove({ space, source: { _id: doc._id, parent: doc.parent }, destination, rank })
    .pipe(Effect.catchTag("MovementTransportError", (error) => Effect.fail(new HulyError({ message: error.reason }))))
  if (result === "condition-not-met") {
    return yield* new DocumentMoveConflictError({ identifier: params.document, teamspace: params.teamspace })
  }
})

export const moveDocument = Effect.fn("Documents.moveDocument")(function* (params: MoveDocumentParams) {
  const { client, doc, teamspace } = yield* findTeamspaceAndDocument(params, {
    preferId: true,
    onAmbiguous: (target, matches) => new DocumentMoveTargetAmbiguousError({ target, matches })
  })
  const parent = params.parent
  const target = parent === null ? undefined : yield* resolveDestination(client, teamspace, doc, { ...params, parent })
  const targetRef = target?._id ?? documentPlugin.ids.NoParent
  const moved = doc.parent !== targetRef
  if (moved) {
    const destination: DocumentMoveDestination =
      target === undefined || parent === null
        ? { type: "root" }
        : yield* parentChain(client, teamspace._id, doc, target, { ...params, parent })
    yield* writeMove(client, teamspace._id, doc, destination, params)
  }

  const id = DocumentId.make(doc._id)
  return {
    id,
    parent: target === undefined ? null : DocumentId.make(target._id),
    moved,
    url: buildDocumentUrlFromConfig(client.workbenchUrlConfig, doc.title, id)
  } satisfies MoveDocumentResult
})
