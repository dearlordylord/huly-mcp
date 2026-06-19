import { type Ref, SortingOrder } from "@hcengineering/core"
import type {
  Document as HulyDocument,
  DocumentSnapshot as HulyDocumentSnapshot,
  Teamspace as HulyTeamspace
} from "@hcengineering/document"
import { Effect } from "effect"

import type {
  DocumentSnapshot,
  DocumentSnapshotSummary,
  GetDocumentSnapshotParams,
  GetDocumentSnapshotResult,
  ListDocumentSnapshotsParams,
  ListDocumentSnapshotsResult
} from "../../domain/schemas/document-snapshots.js"
import { DocumentMarkdown, DocumentSnapshotId, DocumentSnapshotTitle } from "../../domain/schemas/document-snapshots.js"
import { DocumentId, TeamspaceId, Timestamp } from "../../domain/schemas/shared.js"
import { isSingle } from "../../utils/assertions.js"
import type { HulyClient, HulyClientError } from "../client.js"
import type { DocumentContentCorruptedError, DocumentNotFoundError, TeamspaceNotFoundError } from "../errors.js"
import { HulyError } from "../errors.js"
import { documentPlugin } from "../huly-plugins.js"
import { listTotal } from "./counts.js"
import { findTeamspaceAndDocument } from "./documents-shared.js"
import { clampLimit, hulyQuery, type StrictDocumentQuery } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"

type DocumentSnapshotDoc = HulyDocumentSnapshot & {
  readonly attachedTo: Ref<HulyDocument>
}

type ListDocumentSnapshotsError =
  | HulyClientError
  | TeamspaceNotFoundError
  | DocumentNotFoundError

type GetDocumentSnapshotError =
  | ListDocumentSnapshotsError
  | DocumentContentCorruptedError
  | HulyError

const snapshotSummary = (
  snapshot: DocumentSnapshotDoc,
  doc: HulyDocument,
  teamspaceId: Ref<HulyTeamspace>
): DocumentSnapshotSummary => ({
  snapshotId: DocumentSnapshotId.make(snapshot._id),
  documentId: DocumentId.make(doc._id),
  teamspaceId: TeamspaceId.make(teamspaceId),
  title: DocumentSnapshotTitle.make(snapshot.title),
  parentDocumentId: DocumentId.make(snapshot.parent),
  createdOn: snapshot.createdOn === undefined ? undefined : Timestamp.make(snapshot.createdOn),
  modifiedOn: Timestamp.make(snapshot.modifiedOn)
})

const snapshotResult = (
  snapshot: DocumentSnapshotDoc,
  doc: HulyDocument,
  teamspaceId: Ref<HulyTeamspace>,
  markdown: string
): DocumentSnapshot => ({
  ...snapshotSummary(snapshot, doc, teamspaceId),
  markdown: DocumentMarkdown.make(markdown)
})

const findSnapshotByIdentifier = (
  client: HulyClient["Type"],
  doc: HulyDocument,
  identifier: GetDocumentSnapshotParams["snapshot"]
): Effect.Effect<DocumentSnapshotDoc, HulyClientError | HulyError> =>
  Effect.gen(function*() {
    const byId = yield* client.findOne<DocumentSnapshotDoc>(
      documentPlugin.class.DocumentSnapshot,
      hulyQuery<DocumentSnapshotDoc>({ attachedTo: doc._id, _id: toRef<DocumentSnapshotDoc>(identifier) })
    )
    if (byId !== undefined) return byId

    const titleMatches = yield* client.findAll<DocumentSnapshotDoc>(
      documentPlugin.class.DocumentSnapshot,
      hulyQuery<DocumentSnapshotDoc>({ attachedTo: doc._id, title: identifier }),
      { limit: 2 }
    )
    if (isSingle(titleMatches)) return titleMatches[0]
    if (titleMatches.length > 1) {
      return yield* new HulyError({
        message:
          `Multiple snapshots on document '${doc.title}' have title '${identifier}'. Use the snapshotId from list_document_snapshots.`
      })
    }

    const createdOn = Number(identifier)
    const dateMatches = Number.isSafeInteger(createdOn)
      ? yield* client.findAll<DocumentSnapshotDoc>(
        documentPlugin.class.DocumentSnapshot,
        hulyQuery<DocumentSnapshotDoc>({ attachedTo: doc._id, createdOn }),
        { limit: 2 }
      )
      : []
    if (isSingle(dateMatches)) return dateMatches[0]
    if (dateMatches.length > 1) {
      return yield* new HulyError({
        message:
          `Multiple snapshots on document '${doc.title}' have createdOn '${identifier}'. Use the snapshotId from list_document_snapshots.`
      })
    }

    return yield* new HulyError({
      message: `Snapshot '${identifier}' was not found on document '${doc.title}'.`
    })
  })

export const listDocumentSnapshots = (
  params: ListDocumentSnapshotsParams
): Effect.Effect<ListDocumentSnapshotsResult, ListDocumentSnapshotsError, HulyClient> =>
  Effect.gen(function*() {
    const { client, doc, teamspace } = yield* findTeamspaceAndDocument(params)
    const limit = clampLimit(params.limit)
    const query: StrictDocumentQuery<DocumentSnapshotDoc> = { attachedTo: doc._id }
    const snapshots = yield* client.findAll<DocumentSnapshotDoc>(
      documentPlugin.class.DocumentSnapshot,
      hulyQuery(query),
      { limit, sort: { createdOn: SortingOrder.Descending }, total: true }
    )

    return {
      snapshots: snapshots.map((snapshot) => snapshotSummary(snapshot, doc, teamspace._id)),
      total: listTotal(snapshots.total)
    }
  })

export const getDocumentSnapshot = (
  params: GetDocumentSnapshotParams
): Effect.Effect<GetDocumentSnapshotResult, GetDocumentSnapshotError, HulyClient> =>
  Effect.gen(function*() {
    const { client, doc, teamspace } = yield* findTeamspaceAndDocument(params)
    const snapshot = yield* findSnapshotByIdentifier(client, doc, params.snapshot)
    const markdown = yield* client.fetchMarkup(
      documentPlugin.class.DocumentSnapshot,
      snapshot._id,
      "content",
      snapshot.content,
      "markdown"
    )

    return snapshotResult(snapshot, doc, teamspace._id, markdown)
  })
