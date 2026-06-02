/**
 * Shared teamspace/document-lookup helpers.
 *
 * Extracted from documents.ts so documents-edit.ts and documents-inline-comments.ts
 * can resolve a teamspace/document without importing documents.ts, which would form
 * an import cycle (documents → documents-edit/documents-inline-comments → documents).
 *
 * @module
 */
import type { Document as HulyDocument, Teamspace as HulyTeamspace } from "@hcengineering/document"
import { Effect } from "effect"

import type { DocumentIdentifier, TeamspaceIdentifier } from "../../domain/schemas/shared.js"
import { HulyClient, type HulyClientError } from "../client.js"
import { DocumentNotFoundError, TeamspaceNotFoundError } from "../errors.js"
import { findByNameOrId, type StrictDocumentQuery } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"

import { documentPlugin } from "../huly-plugins.js"

export const findTeamspace = (
  identifier: TeamspaceIdentifier,
  opts?: { includeArchived?: boolean }
): Effect.Effect<
  { client: HulyClient["Type"]; teamspace: HulyTeamspace },
  TeamspaceNotFoundError | HulyClientError,
  HulyClient
> =>
  Effect.gen(function*() {
    const client = yield* HulyClient

    const nameQuery: StrictDocumentQuery<HulyTeamspace> = { name: identifier }
    const idQuery: StrictDocumentQuery<HulyTeamspace> = { _id: toRef<HulyTeamspace>(identifier) }
    if (!opts?.includeArchived) {
      nameQuery.archived = false
      idQuery.archived = false
    }

    const teamspace = yield* findByNameOrId(
      client,
      documentPlugin.class.Teamspace,
      nameQuery,
      idQuery
    )

    if (teamspace === undefined) {
      return yield* new TeamspaceNotFoundError({ identifier })
    }

    return { client, teamspace }
  })

export const findTeamspaceAndDocument = (
  params: {
    readonly teamspace: TeamspaceIdentifier
    readonly document: DocumentIdentifier
  }
): Effect.Effect<
  { client: HulyClient["Type"]; teamspace: HulyTeamspace; doc: HulyDocument },
  TeamspaceNotFoundError | DocumentNotFoundError | HulyClientError,
  HulyClient
> =>
  Effect.gen(function*() {
    const { client, teamspace } = yield* findTeamspace(params.teamspace)

    const doc = yield* findByNameOrId(
      client,
      documentPlugin.class.Document,
      { space: teamspace._id, title: params.document },
      { space: teamspace._id, _id: toRef<HulyDocument>(params.document) }
    )

    if (doc === undefined) {
      return yield* new DocumentNotFoundError({
        identifier: params.document,
        teamspace: params.teamspace
      })
    }

    return { client, teamspace, doc }
  })
