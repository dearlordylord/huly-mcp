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
import type { Blob, Class, Doc, Ref } from "@hcengineering/core"
import type { Document as HulyDocument, Teamspace as HulyTeamspace } from "@hcengineering/document"
import { Effect } from "effect"

import { Count, type DocumentIdentifier, type TeamspaceIdentifier } from "../../domain/schemas/shared.js"
import { HulyClient, type HulyClientError } from "../client.js"
import { DocumentContentCorruptedError, DocumentNotFoundError, TeamspaceNotFoundError } from "../errors.js"
import { findByNameOrId, hulyQuery, type StrictDocumentQuery } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"

import { core, documentPlugin } from "../huly-plugins.js"

export const findTeamspace = (
  identifier: TeamspaceIdentifier,
  opts?: { includeArchived?: boolean }
): Effect.Effect<
  { client: HulyClient["Service"]; teamspace: HulyTeamspace },
  TeamspaceNotFoundError | HulyClientError,
  HulyClient
> =>
  Effect.gen(function* () {
    const client = yield* HulyClient

    const nameQuery: StrictDocumentQuery<HulyTeamspace> = { name: identifier }
    const idQuery: StrictDocumentQuery<HulyTeamspace> = { _id: toRef<HulyTeamspace>(identifier) }
    if (!opts?.includeArchived) {
      nameQuery.archived = false
      idQuery.archived = false
    }

    const teamspace = yield* findByNameOrId(client, documentPlugin.class.Teamspace, nameQuery, idQuery)

    if (teamspace === undefined) {
      return yield* new TeamspaceNotFoundError({ identifier })
    }

    return { client, teamspace }
  })

type TeamspaceDocumentResolution = {
  readonly client: HulyClient["Service"]
  readonly teamspace: HulyTeamspace
  readonly doc: HulyDocument
}

export type TeamspaceDocumentAmbiguousTarget =
  | { readonly type: "teamspace"; readonly identifier: TeamspaceIdentifier }
  | { readonly type: "document"; readonly identifier: DocumentIdentifier; readonly teamspace: TeamspaceIdentifier }

export interface FindTeamspaceAndDocumentOptions<AmbiguityError> {
  /**
   * Convert an ambiguous exact-name/ID match into the caller's domain error.
   * The callback is required whenever the extended resolver contract is used;
   * the one-argument overload preserves the historical first-match behavior.
   */
  readonly onAmbiguous: (target: TeamspaceDocumentAmbiguousTarget, matches: Count) => AmbiguityError
}

const findUniqueByNameOrId = Effect.fn("Documents.findUniqueByNameOrId")(function* <T extends Doc, E>(
  client: HulyClient["Service"],
  objectClass: Ref<Class<T>>,
  primaryQuery: StrictDocumentQuery<T>,
  fallbackQuery: StrictDocumentQuery<T>,
  onAmbiguous: (matches: Count) => E
): Effect.fn.Return<T | undefined, HulyClientError | E> {
  const primary = yield* client.findAll<T>(objectClass, hulyQuery(primaryQuery))
  const candidates = primary.length > 0 ? primary : yield* client.findAll<T>(objectClass, hulyQuery(fallbackQuery))
  if (candidates.length > 1) {
    return yield* Effect.fail(onAmbiguous(Count.make(candidates.length)))
  }
  return candidates[0]
})

export function findTeamspaceAndDocument(params: {
  readonly teamspace: TeamspaceIdentifier
  readonly document: DocumentIdentifier
}): Effect.Effect<
  TeamspaceDocumentResolution,
  TeamspaceNotFoundError | DocumentNotFoundError | HulyClientError,
  HulyClient
>
export function findTeamspaceAndDocument<AmbiguityError>(
  params: { readonly teamspace: TeamspaceIdentifier; readonly document: DocumentIdentifier },
  options: FindTeamspaceAndDocumentOptions<AmbiguityError>
): Effect.Effect<
  TeamspaceDocumentResolution,
  TeamspaceNotFoundError | DocumentNotFoundError | HulyClientError | AmbiguityError,
  HulyClient
>
export function findTeamspaceAndDocument<AmbiguityError>(
  params: { readonly teamspace: TeamspaceIdentifier; readonly document: DocumentIdentifier },
  options?: FindTeamspaceAndDocumentOptions<AmbiguityError>
): Effect.Effect<
  TeamspaceDocumentResolution,
  TeamspaceNotFoundError | DocumentNotFoundError | HulyClientError | AmbiguityError,
  HulyClient
> {
  return Effect.gen(function* () {
    const client = yield* HulyClient
    const teamspace =
      options === undefined
        ? (yield* findTeamspace(params.teamspace)).teamspace
        : yield* findUniqueByNameOrId(
            client,
            documentPlugin.class.Teamspace,
            { name: params.teamspace, archived: false },
            { _id: toRef<HulyTeamspace>(params.teamspace), archived: false },
            (matches) => options.onAmbiguous({ type: "teamspace", identifier: params.teamspace }, matches)
          )

    if (teamspace === undefined) {
      return yield* new TeamspaceNotFoundError({ identifier: params.teamspace })
    }

    const doc =
      options === undefined
        ? yield* findByNameOrId(
            client,
            documentPlugin.class.Document,
            { space: teamspace._id, title: params.document },
            { space: teamspace._id, _id: toRef<HulyDocument>(params.document) }
          )
        : yield* findUniqueByNameOrId(
            client,
            documentPlugin.class.Document,
            { space: teamspace._id, title: params.document },
            { space: teamspace._id, _id: toRef<HulyDocument>(params.document) },
            (matches) =>
              options.onAmbiguous(
                { type: "document", identifier: params.document, teamspace: params.teamspace },
                matches
              )
          )

    if (doc === undefined) {
      return yield* new DocumentNotFoundError({ identifier: params.document, teamspace: params.teamspace })
    }

    return { client, teamspace, doc }
  })
}

const documentContentAttr = "content"
const documentContentCorrupted = (
  identifier: DocumentIdentifier,
  causeMessage: string
): DocumentContentCorruptedError => new DocumentContentCorruptedError({ identifier, causeMessage })

const documentContentBlobExists = (
  client: HulyClient["Service"],
  contentRef: NonNullable<HulyDocument["content"]>
): Effect.Effect<boolean, HulyClientError> =>
  client
    .findOne<Blob>(core.class.Blob, hulyQuery<Blob>({ _id: toRef<Blob>(contentRef) }))
    .pipe(Effect.map((blob) => blob !== undefined))

export const fetchReadableDocumentContent = (params: {
  readonly client: HulyClient["Service"]
  readonly doc: HulyDocument
  readonly identifier: DocumentIdentifier
  readonly format: MarkupFormat
}): Effect.Effect<string | undefined, HulyClientError | DocumentContentCorruptedError> => {
  if (!params.doc.content) {
    return Effect.succeed(undefined)
  }
  const contentRef = params.doc.content

  return params.client
    .fetchMarkup(params.doc._class, params.doc._id, documentContentAttr, contentRef, params.format)
    .pipe(
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
