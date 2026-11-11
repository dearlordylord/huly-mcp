/**
 * Move document operation for Huly MCP server.
 *
 * A document's place in the teamspace tree is its `parent` reference, ordered among
 * siblings by `rank`.
 *
 * @module
 */
import { type Ref, SortingOrder } from "@hcengineering/core"
import type { Document as HulyDocument, Teamspace as HulyTeamspace } from "@hcengineering/document"
import { makeRank } from "@hcengineering/rank"
import { Effect } from "effect"

import type { MoveDocumentParams, MoveDocumentResult } from "../../domain/schemas/document-move.js"
import { DocumentId } from "../../domain/schemas/shared.js"
import type { HulyClient, HulyClientError } from "../client.js"
import { DocumentMoveCycleError, type DocumentNotFoundError, type TeamspaceNotFoundError } from "../errors.js"
import { buildDocumentUrlFromConfig } from "../url-builders.js"
import { findDocumentInTeamspace, findTeamspaceAndDocument } from "./documents-shared.js"
import { hulyQuery } from "./query-helpers.js"

import { documentPlugin } from "../huly-plugins.js"

type MoveDocumentError = HulyClientError | TeamspaceNotFoundError | DocumentNotFoundError | DocumentMoveCycleError

/**
 * Whether `candidate` is the document `ancestorId` or lies beneath it. Walks up the
 * candidate's ancestors; `visited` stops the walk on pre-existing parent cycles.
 */
const isSelfOrDescendant = (
  client: HulyClient["Service"],
  teamspace: HulyTeamspace,
  ancestorId: Ref<HulyDocument>,
  candidate: HulyDocument,
  visited: ReadonlySet<Ref<HulyDocument>> = new Set<Ref<HulyDocument>>()
): Effect.Effect<boolean, HulyClientError> => {
  if (candidate._id === ancestorId) return Effect.succeed(true)
  if (candidate.parent === documentPlugin.ids.NoParent || visited.has(candidate.parent)) return Effect.succeed(false)
  return client
    .findOne<HulyDocument>(
      documentPlugin.class.Document,
      hulyQuery<HulyDocument>({ space: teamspace._id, _id: candidate.parent })
    )
    .pipe(
      Effect.flatMap((parent) =>
        parent === undefined
          ? Effect.succeed(false)
          : isSelfOrDescendant(client, teamspace, ancestorId, parent, new Set([...visited, candidate._id]))
      )
    )
}

const lastRankUnder = (
  client: HulyClient["Service"],
  teamspace: HulyTeamspace,
  parent: Ref<HulyDocument>
): Effect.Effect<string | undefined, HulyClientError> =>
  client
    .findOne<HulyDocument>(documentPlugin.class.Document, hulyQuery<HulyDocument>({ space: teamspace._id, parent }), {
      sort: { rank: SortingOrder.Descending }
    })
    .pipe(Effect.map((sibling) => sibling?.rank))

export const moveDocument = (
  params: MoveDocumentParams
): Effect.Effect<MoveDocumentResult, MoveDocumentError, HulyClient> =>
  Effect.gen(function* () {
    const { client, doc, teamspace } = yield* findTeamspaceAndDocument(params)
    const target =
      params.parent === null
        ? undefined
        : yield* findDocumentInTeamspace(client, teamspace, params.teamspace, params.parent)

    if (target !== undefined && (yield* isSelfOrDescendant(client, teamspace, doc._id, target))) {
      return yield* new DocumentMoveCycleError({
        identifier: params.document,
        parent: target.title,
        teamspace: params.teamspace
      })
    }

    const targetRef = target?._id ?? documentPlugin.ids.NoParent
    const moved = doc.parent !== targetRef
    if (moved) {
      const rank = makeRank(yield* lastRankUnder(client, teamspace, targetRef), undefined)
      yield* client.updateDoc(documentPlugin.class.Document, teamspace._id, doc._id, { parent: targetRef, rank })
    }

    const id = DocumentId.make(doc._id)
    return {
      id,
      parent: target === undefined ? null : DocumentId.make(target._id),
      moved,
      url: buildDocumentUrlFromConfig(client.workbenchUrlConfig, doc.title, id)
    }
  })
