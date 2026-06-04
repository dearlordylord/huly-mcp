/**
 * Shared teamspace/document-lookup helpers.
 *
 * Extracted from documents.ts so documents-edit.ts and documents-inline-comments.ts
 * can resolve a teamspace/document without importing documents.ts, which would form
 * an import cycle (documents → documents-edit/documents-inline-comments → documents).
 *
 * @module
 */
import type { MarkupFormat } from "@hcengineering/api-client"
import type { Blob } from "@hcengineering/core"
import type { Document as HulyDocument, Teamspace as HulyTeamspace } from "@hcengineering/document"
import { Effect } from "effect"

import type { DocumentIdentifier, TeamspaceIdentifier } from "../../domain/schemas/shared.js"
import { HulyClient, type HulyClientError } from "../client.js"
import { DocumentContentCorruptedError, DocumentNotFoundError, TeamspaceNotFoundError } from "../errors.js"
import { findByNameOrId, hulyQuery, type StrictDocumentQuery } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"

import { core, documentPlugin } from "../huly-plugins.js"

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

const documentContentAttr = "content"
const documentContentCorrupted = (
  identifier: DocumentIdentifier,
  causeMessage: string
): DocumentContentCorruptedError => new DocumentContentCorruptedError({ identifier, causeMessage })

const documentContentBlobExists = (
  client: HulyClient["Type"],
  contentRef: NonNullable<HulyDocument["content"]>
): Effect.Effect<boolean, HulyClientError> =>
  client.findOne<Blob>(
    core.class.Blob,
    hulyQuery<Blob>({ _id: toRef<Blob>(contentRef) })
  ).pipe(Effect.map((blob) => blob !== undefined))

export const fetchReadableDocumentContent = (
  params: {
    readonly client: HulyClient["Type"]
    readonly doc: HulyDocument
    readonly identifier: DocumentIdentifier
    readonly format: MarkupFormat
  }
): Effect.Effect<string | undefined, HulyClientError | DocumentContentCorruptedError> => {
  if (!params.doc.content) {
    return Effect.succeed(undefined)
  }
  const contentRef = params.doc.content

  return params.client.fetchMarkup(
    params.doc._class,
    params.doc._id,
    documentContentAttr,
    contentRef,
    params.format
  ).pipe(
    Effect.flatMap((content) =>
      content === ""
        ? documentContentBlobExists(params.client, contentRef).pipe(
          Effect.flatMap((exists) =>
            exists
              ? Effect.succeed(content)
              : Effect.fail(
                documentContentCorrupted(params.identifier, "Document.content references a missing markup blob.")
              )
          )
        )
        : Effect.succeed(content)
    )
  )
}
