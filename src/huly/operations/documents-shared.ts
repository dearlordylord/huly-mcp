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
  readonly preferId?: true
}

const findUniqueByNameOrId = Effect.fn("Documents.findUniqueByNameOrId")(function* <T extends Doc, E>(
  client: HulyClient["Service"],
  objectClass: Ref<Class<T>>,
  byName: StrictDocumentQuery<T>,
  byId: StrictDocumentQuery<T>,
  onAmbiguous: (matches: Count) => E,
  preferId = false
): Effect.fn.Return<T | undefined, HulyClientError | E> {
  const [first, second] = preferId ? [byId, byName] : [byName, byId]
  const primary = yield* client.findAll<T>(objectClass, hulyQuery(first))
  const candidates = primary.length > 0 ? primary : yield* client.findAll<T>(objectClass, hulyQuery(second))
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
            (matches) => options.onAmbiguous({ type: "teamspace", identifier: params.teamspace }, matches),
            options.preferId
          )

    if (teamspace === undefined) {
      return yield* new TeamspaceNotFoundError({ identifier: params.teamspace })
    }

    const doc = yield* findDocumentInTeamspace(
      client,
      teamspace,
      params.teamspace,
      params.document,
      options === undefined
        ? undefined
        : {
            preferId: options.preferId === true,
            onAmbiguous: (matches) =>
              options.onAmbiguous(
                { type: "document", identifier: params.document, teamspace: params.teamspace },
                matches
              )
          }
    )

    return { client, teamspace, doc }
  })
}

export const findDocumentInTeamspace = Effect.fn("Documents.findDocumentInTeamspace")(function* <E = never>(
  client: HulyClient["Service"],
  teamspace: HulyTeamspace,
  teamspaceIdentifier: TeamspaceIdentifier,
  document: DocumentIdentifier,
  options?: { readonly preferId: boolean; readonly onAmbiguous: (matches: Count) => E }
): Effect.fn.Return<HulyDocument, DocumentNotFoundError | HulyClientError | E> {
  const byTitle = { space: teamspace._id, title: document }
  const byId = { space: teamspace._id, _id: toRef<HulyDocument>(document) }
  const objectClass = documentPlugin.class.Document
  const found =
    options === undefined
      ? yield* findByNameOrId(client, objectClass, byTitle, byId)
      : yield* findUniqueByNameOrId(client, objectClass, byTitle, byId, options.onAmbiguous, options.preferId)
  if (found === undefined) {
    return yield* new DocumentNotFoundError({ identifier: document, teamspace: teamspaceIdentifier })
  }
  return found
})

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
