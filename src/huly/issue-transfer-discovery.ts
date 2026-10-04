import { isDeepStrictEqual } from "node:util"
import type { ActivityReference } from "@hcengineering/activity"
import type { AttachedDoc, Doc, TxOperations } from "@hcengineering/core"
import { Effect, Schema } from "effect"
import {
  AutomaticHistoryClass,
  TransferInspectionSchema,
  type TransferInspection,
  type TransferRecord,
  type TransferWrite
} from "../domain/schemas/issue-transfer.js"
import { ObjectClassName } from "../domain/schemas/shared.js"
import type { HulyClientError } from "./client.js"
import { type HulyDataInvalidError, makeOperationConnectionError } from "./errors-base.js"
import { activity, core, tracker } from "./huly-plugins.js"
import {
  OwnershipSchema,
  parseTransferBoundary,
  parseTransferRecord,
  referenceOwner,
  type RecordOwner
} from "./issue-transfer-records.js"
import { hulyQuery } from "./operations/query-helpers.js"
import { toClassRef, toRef } from "./operations/sdk-boundary.js"

const CollectionTypeSchema = Schema.Struct({ of: ObjectClassName })
const DEFAULT_LIMITS = { records: 10_000, queries: 10_000, depth: 32, result: 10_001 }
// Internal traversal policy; no serialized payload crosses this seam.
export interface RecordDiscoveryLimits {
  readonly records: number
  readonly queries: number
  readonly depth: number
  readonly result: number
}
interface Visit {
  readonly owner: RecordOwner
  readonly path: ReadonlyArray<string>
}
interface DiscoveryState {
  readonly records: Map<string, TransferRecord>
  readonly queue: Array<Visit>
  readonly blockers: Set<string>
  readonly classes: Set<string>
  queries: number
  incomplete: boolean
}
const refuse = (state: DiscoveryState, reason: string) => {
  state.incomplete = true
  state.blockers.add(reason)
}

export const inspectTransferRecords = Effect.fn("transfer.inspectRecords")(function* (
  client: TxOperations,
  issueId: TransferWrite["issueId"],
  limits: RecordDiscoveryLimits = DEFAULT_LIMITS
): Effect.fn.Return<TransferInspection, HulyClientError | HulyDataInvalidError> {
  const root = { _id: issueId, _class: ObjectClassName.make(String(tracker.class.Issue)) }
  const state: DiscoveryState = {
    records: new Map(),
    classes: new Set(),
    queue: [{ owner: root, path: [issueId] }],
    blockers: new Set(),
    queries: 0,
    incomplete: false
  }
  while (state.queue.length > 0 && !state.incomplete) {
    const visit = state.queue.shift()
    if (visit === undefined) break
    yield* inspectOwner(client, state, visit, limits)
  }
  return yield* parseTransferBoundary(TransferInspectionSchema, {
    discovery: state.incomplete ? "incomplete" : "complete",
    records: [...state.records.values()],
    classes: [...state.classes],
    blockers: [...state.blockers],
    limitation:
      "Model-derived recursive ownership discovery; audited comments/threads, attachments/photos/embeddings, labels, time reports, activity/replies/reactions and immutable history. ActivityReference routing follows its source; incoming independent references and referenced documents remain in place. Unknown classes/collection edges or exhausted limits refuse before writes."
  })
})

const inspectOwner = Effect.fn("transfer.inspectOwner")(function* (
  client: TxOperations,
  state: DiscoveryState,
  visit: Visit,
  limits: RecordDiscoveryLimits
): Effect.fn.Return<void, HulyClientError | HulyDataInvalidError> {
  const hierarchy = client.getHierarchy()
  const collections = yield* ownerCollections(client, visit.owner)
  const classes = new Set([
    ...collections.values(),
    ...hierarchy.getDescendants(core.class.AttachedDoc).filter((cls) => hierarchy.findDomain(cls) !== undefined)
  ])
  for (const cls of classes) {
    state.classes.add(cls)
    if (!admitQuery(state, limits)) return
    const rows = yield* Effect.tryPromise({
      try: () =>
        client.findAll<AttachedDoc>(
          toClassRef<AttachedDoc>(cls),
          hulyQuery<AttachedDoc>({ attachedTo: toRef<Doc>(visit.owner._id) }),
          { limit: limits.result }
        ),
      catch: (cause) => makeOperationConnectionError("findAll", cause)
    })
    if (!completeResult(state, rows.length, rows.total, limits, cls)) return
    for (const row of rows) yield* inspectRow(client, state, visit, row, collections, limits, false)
  }
  if (!admitQuery(state, limits)) return
  const refs = yield* Effect.tryPromise({
    try: () =>
      client.findAll<ActivityReference>(
        activity.class.ActivityReference,
        hulyQuery<ActivityReference>({ srcDocId: toRef<Doc>(visit.owner._id) }),
        { limit: limits.result }
      ),
    catch: (cause) => makeOperationConnectionError("findAll", cause)
  })
  if (!completeResult(state, refs.length, refs.total, limits, "source references")) return
  for (const row of refs) yield* inspectRow(client, state, visit, row, collections, limits, true)
})

const admitQuery = (state: DiscoveryState, limits: RecordDiscoveryLimits) => {
  if (state.queries >= limits.queries) {
    refuse(state, "Owned-record query limit exhausted.")
    return false
  }
  state.queries++
  return true
}
const completeResult = (
  state: DiscoveryState,
  length: number,
  total: number,
  limits: RecordDiscoveryLimits,
  cls: string
) => {
  if (total > length || length >= limits.result) {
    refuse(state, `Incomplete collection discovery for ${cls}.`)
    return false
  }
  return true
}

const inspectRow = Effect.fn("transfer.inspectRecordEdge")(function* (
  client: TxOperations,
  state: DiscoveryState,
  visit: Visit,
  row: AttachedDoc,
  collections: ReadonlyMap<string, string>,
  limits: RecordDiscoveryLimits,
  outgoing: boolean
): Effect.fn.Return<void, HulyDataInvalidError> {
  const ownership = yield* parseTransferBoundary(OwnershipSchema, row)
  const reference = ownership._class === String(activity.class.ActivityReference)
  const owner = reference ? yield* referenceOwner(row) : visit.owner
  if (reference && owner._id !== visit.owner._id) return // Incoming independent source owns its own routing.
  if (outgoing && !reference) {
    state.blockers.add(`Unsupported reference subclass ${ownership._class}.`)
    return
  }
  auditEdge(client, state, visit, ownership, owner, collections, reference)
  const record = yield* parseTransferRecord(row, owner)
  registerRecord(state, visit, record, limits)
})

const declaredEdge = (
  client: TxOperations,
  collections: ReadonlyMap<string, string>,
  record: Schema.Schema.Type<typeof OwnershipSchema>
) => {
  if (record._class === AutomaticHistoryClass && record.collection === "docUpdateMessages") return true
  const declared = collections.get(record.collection)
  return (
    declared !== undefined && client.getHierarchy().isDerived(toClassRef<Doc>(record._class), toClassRef<Doc>(declared))
  )
}

const ownerCollections = Effect.fn("transfer.modelCollections")(function* (
  client: TxOperations,
  owner: RecordOwner
): Effect.fn.Return<ReadonlyMap<string, string>, HulyDataInvalidError> {
  const hierarchy = client.getHierarchy()
  const attributes = hierarchy.getAllAttributes(toClassRef<Doc>(owner._class))
  const collections = new Map<string, string>()
  for (const [key, attribute] of attributes) {
    if (!hierarchy.isDerived(attribute.type._class, core.class.Collection)) continue
    const collection = yield* parseTransferBoundary(CollectionTypeSchema, attribute.type)
    collections.set(key, collection.of)
  }
  return collections
})

const auditEdge = (
  client: TxOperations,
  state: DiscoveryState,
  visit: Visit,
  ownership: Schema.Schema.Type<typeof OwnershipSchema>,
  owner: RecordOwner,
  collections: ReadonlyMap<string, string>,
  reference: boolean
) => {
  const hierarchy = client.getHierarchy()
  if (reference && owner._class !== visit.owner._class)
    state.blockers.add(`Inconsistent reference source class on ${ownership._id}.`)
  if (
    !reference &&
    !hierarchy.isDerived(toClassRef<Doc>(visit.owner._class), toClassRef<Doc>(ownership.attachedToClass))
  )
    state.blockers.add(`Conflicting ownership class on ${ownership._id}.`)
  if (!reference && !declaredEdge(client, collections, ownership))
    state.blockers.add(`Unsupported collection edge ${ownership.collection} on ${ownership._id}.`)
}

const registerRecord = (state: DiscoveryState, visit: Visit, record: TransferRecord, limits: RecordDiscoveryLimits) => {
  if (visit.path.includes(record._id)) {
    state.blockers.add(`Owned-record cycle at ${record._id}.`)
    return
  }
  const previous = state.records.get(record._id)
  if (previous !== undefined) {
    if (!isDeepStrictEqual(previous, record)) state.blockers.add(`Conflicting snapshots for record ${record._id}.`)
    return
  }
  if (state.records.size >= limits.records) {
    refuse(state, "Owned-record global limit exhausted.")
    return
  }
  state.records.set(record._id, record)
  if (record.kind === "unsupported") state.blockers.add(`Unsupported owned record ${record._id} (${record._class}).`)
  if (visit.path.length >= limits.depth) {
    refuse(state, `Owned-record depth limit exhausted at ${record._id}.`)
    return
  }
  state.queue.push({ owner: { _id: record._id, _class: record._class }, path: [...visit.path, record._id] })
}
