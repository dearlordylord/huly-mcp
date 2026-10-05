import { isDeepStrictEqual } from "node:util"
import type { Issue } from "@hcengineering/tracker"
import type { ActivityReference } from "@hcengineering/activity"
import type { AttachedDoc, Doc, TxOperations } from "@hcengineering/core"
import { Array as EffectArray, Effect, Schema } from "effect"
import {
  AutomaticHistoryClass,
  TransferInspectionSchema,
  type TransferInspection,
  type TransferRecord,
  type TransferWrite
} from "../domain/schemas/issue-transfer.js"
import { type DocId, ListTotal, ObjectClassName } from "../domain/schemas/shared.js"
import type { HulyClientError } from "./client.js"
import { HulyDataInvalidError, makeOperationConnectionError } from "./errors-base.js"
import { activity, core, tracker } from "./huly-plugins.js"
import { MovementIssueSchema, type MovementIssue } from "../domain/schemas/issue-movement-state.js"
import {
  OwnershipSchema,
  RecordOwnerSchema,
  parseTransferBoundary,
  parseTransferRecord,
  referenceOwner,
  type RecordOwner
} from "./issue-transfer-records.js"
import { hulyQuery } from "./operations/query-helpers.js"
import { toClassRef, toRef } from "./operations/sdk-boundary.js"
import { groupTransferClassQueries } from "./issue-transfer-class-groups.js"
import { OWNER_CLASS_READ_CONCURRENCY, readAttachedClassWindow } from "./issue-transfer-class-reads.js"

const readModel = <A>(read: () => A): Effect.Effect<A, HulyDataInvalidError> =>
  Effect.try({
    try: read,
    catch: (cause) => new HulyDataInvalidError({ operation: "move_issue", entity: "record model", cause })
  })

const CollectionTypeSchema = Schema.Struct({ of: ObjectClassName })
export const DEFAULT_RECORD_DISCOVERY_LIMITS = { records: 10_000, queries: 10_000, depth: 32, result: 10_001 }
// Internal traversal policy; no serialized payload crosses this seam.
export interface RecordDiscoveryLimits {
  readonly records: number
  readonly queries: number
  readonly depth: number
  readonly result: number
}
export interface Visit {
  readonly owner: RecordOwner
  readonly path: ReadonlyArray<DocId>
}
export interface DiscoveryState {
  readonly tree: ReadonlyMap<string, MovementIssue>
  readonly records: Map<DocId, TransferRecord>
  readonly queue: Array<Visit>
  readonly blockers: Set<string>
  readonly classes: Set<ObjectClassName>
  queries: number
  incomplete: boolean
}
export const refuse = (state: DiscoveryState, reason: string) => {
  state.incomplete = true
  state.blockers.add(reason)
}

export const inspectTransferRecords = Effect.fn("transfer.inspectRecords")(function* (
  client: TxOperations,
  issueId: TransferWrite["issueId"],
  limits: RecordDiscoveryLimits = DEFAULT_RECORD_DISCOVERY_LIMITS,
  tree: ReadonlyArray<MovementIssue> = []
): Effect.fn.Return<TransferInspection, HulyClientError | HulyDataInvalidError> {
  const root = yield* inspectRuntimeRoot(client, issueId)
  const state = makeDiscoveryState(root, tree)
  while (state.queue.length > 0 && !state.incomplete) {
    const visit = state.queue.shift()
    if (visit === undefined) break
    yield* inspectOwner(client, state, visit, limits)
  }
  return yield* discoveryInspection(state)
})

export const makeDiscoveryState = (root: RecordOwner, tree: ReadonlyArray<MovementIssue>): DiscoveryState => ({
  tree: new Map(tree.map((issue) => [issue._id, issue])),
  records: new Map(),
  classes: new Set(),
  queue: [{ owner: root, path: [root._id] }],
  blockers: new Set(),
  queries: 0,
  incomplete: false
})

export const discoveryInspection = (state: DiscoveryState) =>
  parseTransferBoundary(TransferInspectionSchema, {
    discovery: state.incomplete ? "incomplete" : "complete",
    records: [...state.records.values()],
    classes: [...state.classes],
    blockers: [...state.blockers],
    limitation:
      "Model-derived recursive ownership discovery; audited comments/threads, attachments/photos/embeddings, labels, time reports, activity/replies/reactions and immutable history. ActivityReference routing follows its source; incoming independent references and referenced documents remain in place. Unknown classes/collection edges or exhausted limits refuse before writes."
  })

const inspectOwner = Effect.fn("transfer.inspectOwner")(function* (
  client: TxOperations,
  state: DiscoveryState,
  visit: Visit,
  limits: RecordDiscoveryLimits
): Effect.fn.Return<void, HulyClientError | HulyDataInvalidError> {
  const { collections, representatives } = yield* prepareOwnerClasses(client, state, visit)
  yield* inspectClassCollections(client, state, visit, limits, collections, representatives)
  if (state.incomplete) return
  if (!admitQuery(state, limits)) return
  const refs = yield* Effect.tryPromise({
    try: () =>
      client.findAll<ActivityReference>(
        activity.class.ActivityReference,
        hulyQuery<ActivityReference>({ srcDocId: toRef<Doc>(visit.owner._id) }),
        { limit: limits.result, total: true }
      ),
    catch: (cause) => makeOperationConnectionError("findAll", cause)
  })
  const total = yield* parseTransferBoundary(ListTotal, refs.total)
  if (
    !completeResult(state, refs.length, total, limits, ObjectClassName.make(String(activity.class.ActivityReference)))
  )
    return
  for (const row of refs) yield* inspectRow(client, state, visit, row, collections, limits, true)
})

export const prepareOwnerClasses = Effect.fn("transfer.prepareOwnerClasses")(function* (
  client: TxOperations,
  state: DiscoveryState,
  visit: Visit
) {
  const hierarchy = client.getHierarchy()
  const collections = yield* ownerCollections(client, visit.owner)
  const classes = new Set([
    ...collections.values(),
    ...(yield* parseTransferBoundary(
      Schema.Array(ObjectClassName),
      yield* readModel(() =>
        hierarchy.getDescendants(core.class.AttachedDoc).filter((cls) => hierarchy.findDomain(cls) !== undefined)
      )
    ))
  ])
  for (const cls of classes) state.classes.add(cls)
  const representatives = yield* readModel(() =>
    groupTransferClassQueries([...classes], {
      isMixin: (cls) => hierarchy.isMixin(toClassRef<Doc>(cls)),
      findDomain: (cls) => hierarchy.findDomain(toClassRef<Doc>(cls)),
      isDerived: (cls, ancestor) => hierarchy.isDerived(toClassRef<Doc>(cls), toClassRef<Doc>(ancestor))
    })
  )
  return { collections, representatives }
})

const admitClassWindow = (
  state: DiscoveryState,
  limits: RecordDiscoveryLimits,
  classes: ReadonlyArray<ObjectClassName>
) => {
  const admitted: Array<ObjectClassName> = []
  for (const cls of classes) {
    state.classes.add(cls)
    if (state.queries >= limits.queries) break
    state.queries++
    admitted.push(cls)
  }
  return admitted
}

const inspectClassCollections = Effect.fn("transfer.inspectClassCollections")(function* (
  client: TxOperations,
  state: DiscoveryState,
  visit: Visit,
  limits: RecordDiscoveryLimits,
  collections: ReadonlyMap<string, ObjectClassName>,
  classes: ReadonlyArray<ObjectClassName>
): Effect.fn.Return<void, HulyClientError | HulyDataInvalidError> {
  for (const chunk of EffectArray.chunksOf(classes, OWNER_CLASS_READ_CONCURRENCY)) {
    const window = admitClassWindow(state, limits, chunk)
    const replies = yield* readAttachedClassWindow(client, visit.owner, window, limits.result)
    for (const { cls, result } of replies) {
      const rows = yield* Effect.fromResult(result)
      const total = yield* parseTransferBoundary(ListTotal, rows.total)
      if (!completeResult(state, rows.length, total, limits, cls)) return
      for (const row of rows) yield* inspectRow(client, state, visit, row, collections, limits, false)
      if (state.incomplete) return
    }
    if (window.length < chunk.length) {
      refuse(state, "Owned-record query limit exhausted.")
      return
    }
  }
})

export const admitQuery = (state: DiscoveryState, limits: RecordDiscoveryLimits) => {
  if (state.queries >= limits.queries) {
    refuse(state, "Owned-record query limit exhausted.")
    return false
  }
  state.queries++
  return true
}
export const completeResult = (
  state: DiscoveryState,
  length: number,
  total: ListTotal,
  limits: RecordDiscoveryLimits,
  cls: ObjectClassName
) => {
  if (total !== length || length >= limits.result) {
    refuse(state, `Incomplete collection discovery for ${cls}.`)
    return false
  }
  return true
}

export const inspectRow = Effect.fn("transfer.inspectRecordEdge")(function* (
  client: TxOperations,
  state: DiscoveryState,
  visit: Visit,
  row: AttachedDoc,
  collections: ReadonlyMap<string, ObjectClassName>,
  limits: RecordDiscoveryLimits,
  outgoing: boolean
): Effect.fn.Return<void, HulyDataInvalidError> {
  const ownership = yield* parseTransferBoundary(OwnershipSchema, row)
  if (
    state.tree.size > 0 &&
    (yield* readModel(() => client.getHierarchy().isDerived(toClassRef<Doc>(ownership._class), tracker.class.Issue)))
  ) {
    yield* readModel(() => auditAttachedEdge(client, state, visit.owner, ownership, collections))
    yield* inspectTaskEdge(state, visit.owner, row)
    return
  }
  const reference = ownership._class === String(activity.class.ActivityReference)
  const owner = reference ? yield* referenceOwner(row) : visit.owner
  if (reference && owner._id !== visit.owner._id) return // Incoming independent source owns its own routing.
  if (outgoing && !reference) {
    state.blockers.add(`Unsupported reference subclass ${ownership._class} (${ownership._id}).`)
    return
  }
  yield* readModel(() => auditEdge(client, state, visit, ownership, owner, collections, reference))
  const record = yield* parseTransferRecord(row, owner)
  registerRecord(state, visit, record, limits)
})

const inspectTaskEdge = Effect.fn("transfer.inspectTaskEdge")(function* (
  state: DiscoveryState,
  owner: RecordOwner,
  row: AttachedDoc
): Effect.fn.Return<void, HulyDataInvalidError> {
  const current = yield* parseTransferBoundary(MovementIssueSchema, row)
  const expected = state.tree.get(current._id)
  if (expected === undefined || !state.tree.has(owner._id)) {
    refuse(state, `Uninspected task ownership edge ${current._id} under ${owner._id}; rebuild the complete tree.`)
    return
  }
  if (
    current.attachedTo !== owner._id ||
    current.attachedToClass !== String(tracker.class.Issue) ||
    current.collection !== "subIssues" ||
    !isDeepStrictEqual(current, expected)
  )
    refuse(state, `Changed or invalid task ownership edge ${current._id}; inspect hierarchy before retry.`)
})

const declaredEdge = (
  client: TxOperations,
  collections: ReadonlyMap<string, ObjectClassName>,
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
): Effect.fn.Return<ReadonlyMap<string, ObjectClassName>, HulyDataInvalidError> {
  const hierarchy = client.getHierarchy()
  const attributes = yield* readModel(() => hierarchy.getAllAttributes(toClassRef<Doc>(owner._class)))
  const collections = new Map<string, ObjectClassName>()
  for (const [key, attribute] of attributes) {
    if (!(yield* readModel(() => hierarchy.isDerived(attribute.type._class, core.class.Collection)))) continue
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
  collections: ReadonlyMap<string, ObjectClassName>,
  reference: boolean
) => {
  if (reference) {
    if (owner._class !== visit.owner._class)
      state.blockers.add(`Inconsistent reference source class on ${ownership._id}.`)
    return
  }
  auditAttachedEdge(client, state, visit.owner, ownership, collections)
}

const auditAttachedEdge = (
  client: TxOperations,
  state: DiscoveryState,
  owner: RecordOwner,
  ownership: Schema.Schema.Type<typeof OwnershipSchema>,
  collections: ReadonlyMap<string, ObjectClassName>
) => {
  const hierarchy = client.getHierarchy()
  if (ownership.attachedTo !== owner._id) state.blockers.add(`Conflicting ownership parent on ${ownership._id}.`)
  if (!hierarchy.isDerived(toClassRef<Doc>(owner._class), toClassRef<Doc>(ownership.attachedToClass)))
    state.blockers.add(`Conflicting ownership class on ${ownership._id}.`)
  if (!declaredEdge(client, collections, ownership))
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

const inspectRuntimeRoot = Effect.fn("transfer.inspectRuntimeRoot")(function* (
  client: TxOperations,
  issueId: TransferWrite["issueId"]
): Effect.fn.Return<RecordOwner, HulyClientError | HulyDataInvalidError> {
  const raw = yield* Effect.tryPromise({
    try: () => client.findOne<Issue>(tracker.class.Issue, hulyQuery<Issue>({ _id: toRef<Issue>(issueId) })),
    catch: (cause) => makeOperationConnectionError("findOne", cause)
  })
  const root = yield* parseTransferBoundary(RecordOwnerSchema, raw)
  if (root._id !== issueId)
    return yield* Effect.fail(
      new HulyDataInvalidError({
        operation: "move_issue",
        entity: "transfer root",
        cause: "Runtime root identity changed during inspection."
      })
    )
  return root
})
