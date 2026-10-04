import type { Issue } from "@hcengineering/tracker"
import type { AttachedDoc, TxOperations } from "@hcengineering/core"
import { Array as EffectArray, Effect, type Result } from "effect"
import type { MovementIssue } from "../domain/schemas/issue-movement-state.js"
import { type DocId, type IssueId, ObjectClassName, UNKNOWN_TOTAL } from "../domain/schemas/shared.js"
import { HulyDataInvalidError, makeOperationConnectionError } from "./errors-base.js"
import { activity, tracker } from "./huly-plugins.js"
import {
  completeResult,
  DEFAULT_RECORD_DISCOVERY_LIMITS,
  discoveryInspection,
  inspectRow,
  makeDiscoveryState,
  prepareOwnerClasses,
  refuse,
  type DiscoveryState,
  type RecordDiscoveryLimits
} from "./issue-transfer-discovery.js"
import { OWNER_CLASS_READ_CONCURRENCY } from "./issue-transfer-class-reads.js"
import { readForestClass, type ForestVisit } from "./issue-transfer-forest-reads.js"
import { RecordOwnerSchema, parseTransferBoundary } from "./issue-transfer-records.js"
import {
  TransferForestEntrySchema,
  TransferForestInspectionSchema,
  type TransferForestEntry,
  type TransferForestProgress
} from "./issue-transfer-forest-state.js"
import { hulyQuery } from "./operations/query-helpers.js"
import { toRef } from "./operations/sdk-boundary.js"

export const FOREST_OWNER_BATCH_SIZE = 4

const seedRoot = Effect.fn("transfer.seedForestRoot")(function* (
  client: TxOperations,
  ownerId: IssueId,
  tree: ReadonlyArray<MovementIssue>
) {
  const raw = yield* Effect.tryPromise({
    try: () => client.findOne<Issue>(tracker.class.Issue, hulyQuery<Issue>({ _id: toRef<Issue>(ownerId) })),
    catch: (cause) => makeOperationConnectionError("findOne", cause)
  })
  if (raw === undefined) return undefined
  const owner = yield* parseTransferBoundary(RecordOwnerSchema, raw)
  if (owner._id !== ownerId)
    return yield* Effect.fail(
      new HulyDataInvalidError({
        operation: "move_issue",
        entity: "forest root",
        cause: "Runtime root identity changed during inspection."
      })
    )
  return makeDiscoveryState(owner, tree)
})

const prepareFrontier = Effect.fn("transfer.prepareForestFrontier")(function* (
  client: TxOperations,
  states: ReadonlyMap<IssueId, DiscoveryState>
) {
  const frontier: Array<ForestVisit> = []
  for (const state of states.values()) {
    if (state.incomplete) continue
    while (state.queue.length > 0 && frontier.length < FOREST_OWNER_BATCH_SIZE) {
      const visit = state.queue.shift()
      if (visit === undefined) break
      const prepared = yield* Effect.result(prepareOwnerClasses(client, state, visit))
      if (prepared._tag === "Failure") {
        refuse(state, "Owned-record model observation is unavailable.")
        break
      }
      frontier.push({ state, visit, ...prepared.success })
    }
    if (frontier.length === FOREST_OWNER_BATCH_SIZE) break
  }
  return frontier
})

type ForestReadResult = Result.Result<
  Effect.Success<ReturnType<typeof readForestClass>>,
  Effect.Error<ReturnType<typeof readForestClass>>
>

const auditRows = Effect.fn("transfer.auditForestRows")(function* (
  client: TxOperations,
  target: ForestVisit,
  rows: ReadonlyArray<AttachedDoc>,
  limits: RecordDiscoveryLimits,
  outgoing: boolean
) {
  for (const row of rows) {
    const parsed = yield* Effect.result(
      inspectRow(client, target.state, target.visit, row, target.collections, limits, outgoing)
    )
    if (parsed._tag === "Failure") refuse(target.state, "Owned-record payload or ownership observation is unavailable.")
    if (target.state.incomplete) break
  }
})

const auditClassResult = Effect.fn("transfer.auditForestClassResult")(function* (
  client: TxOperations,
  cls: ObjectClassName,
  visits: ReadonlyArray<ForestVisit>,
  result: ForestReadResult,
  limits: RecordDiscoveryLimits,
  outgoing: boolean
) {
  if (result._tag === "Failure") {
    for (const { state } of visits) refuse(state, "Owned-record collection observation is unavailable.")
    return
  }
  for (const { complete, rows, target } of result.success.replies) {
    if (target.state.incomplete) continue
    if (!complete) {
      completeResult(target.state, rows.length, UNKNOWN_TOTAL, limits, cls)
      continue
    }
    yield* auditRows(client, target, rows, limits, outgoing)
  }
  for (const state of result.success.exhausted) refuse(state, "Owned-record query limit exhausted.")
})

const inspectFrontier = Effect.fn("transfer.inspectForestFrontier")(function* (
  client: TxOperations,
  frontier: ReadonlyArray<ForestVisit>,
  limits: RecordDiscoveryLimits
) {
  const classes = [...new Set(frontier.flatMap(({ representatives }) => representatives))]
  for (const window of EffectArray.chunksOf(classes, OWNER_CLASS_READ_CONCURRENCY)) {
    // SDK reads overlap, but row auditing retains original representative order.
    const replies = yield* Effect.forEach(
      window,
      (cls) =>
        Effect.gen(function* () {
          const visits = frontier.filter((target) => !target.state.incomplete && target.representatives.includes(cls))
          return { cls, visits, result: yield* Effect.result(readForestClass(client, cls, visits, limits)) }
        }),
      { concurrency: OWNER_CLASS_READ_CONCURRENCY }
    )
    for (const { cls, result, visits } of replies) yield* auditClassResult(client, cls, visits, result, limits, false)
  }
  const outgoing = frontier.filter(({ state }) => !state.incomplete)
  const cls = ObjectClassName.make(String(activity.class.ActivityReference))
  const result = yield* Effect.result(readForestClass(client, cls, outgoing, limits, true))
  yield* auditClassResult(client, cls, outgoing, result, limits, true)
})

type ForestEntryEmitter = (input: unknown) => Effect.Effect<void, HulyDataInvalidError>

const seedStates = Effect.fn("transfer.seedForestStates")(function* (
  client: TxOperations,
  roots: ReadonlyArray<IssueId>,
  tree: ReadonlyArray<MovementIssue>,
  states: Map<IssueId, DiscoveryState>,
  emit: ForestEntryEmitter
) {
  for (const ids of EffectArray.chunksOf([...new Set(roots)], FOREST_OWNER_BATCH_SIZE)) {
    const seeded = yield* Effect.forEach(
      ids,
      (id) =>
        seedRoot(client, id, tree).pipe(
          Effect.result,
          Effect.map((result) => ({ id, result }))
        ),
      { concurrency: OWNER_CLASS_READ_CONCURRENCY }
    )
    for (const { id, result } of seeded) {
      if (result._tag === "Failure")
        yield* emit({ status: "unavailable", ownerId: id, reason: "inspection-unavailable" })
      else if (result.success === undefined)
        yield* emit({ status: "unavailable", ownerId: id, reason: "owner-unavailable" })
      else states.set(id, result.success)
    }
  }
})

const settleStates = Effect.fn("transfer.settleForestStates")(function* (
  states: Map<IssueId, DiscoveryState>,
  emit: ForestEntryEmitter
) {
  for (const [ownerId, state] of states) {
    if (!state.incomplete && state.queue.length > 0) continue
    const inspection = yield* discoveryInspection(state)
    yield* emit({ status: "observed", ownerId, inspection })
    states.delete(ownerId)
  }
})

const auditForestOwnership = (states: ReadonlyMap<IssueId, DiscoveryState>, recordRoots: Map<DocId, IssueId>) => {
  for (const [ownerId, state] of states) {
    for (const record of state.records.values()) {
      const previous = recordRoots.get(record._id)
      if (previous !== undefined && previous !== ownerId) {
        const reason = `Ambiguous forest ownership on record ${record._id}.`
        state.blockers.add(reason)
        states.get(previous)?.blockers.add(reason)
      } else recordRoots.set(record._id, ownerId)
    }
  }
}

export const inspectTransferForest = Effect.fn("transfer.inspectForest")(function* (
  client: TxOperations,
  roots: ReadonlyArray<IssueId>,
  tree: ReadonlyArray<MovementIssue> = [],
  publish?: TransferForestProgress,
  limits: RecordDiscoveryLimits = DEFAULT_RECORD_DISCOVERY_LIMITS
) {
  const states = new Map<IssueId, DiscoveryState>()
  const entries = new Map<IssueId, TransferForestEntry>()
  const recordRoots = new Map<DocId, IssueId>()
  const emit = Effect.fn("transfer.publishForestOwner")(function* (input: unknown) {
    const entry = yield* parseTransferBoundary(TransferForestEntrySchema, input)
    entries.set(entry.ownerId, entry)
    if (publish !== undefined) yield* publish(entry)
  })
  for (const batch of EffectArray.chunksOf([...new Set(roots)], FOREST_OWNER_BATCH_SIZE)) {
    yield* seedStates(client, batch, tree, states, emit)
    while (states.size > 0) {
      const frontier = yield* prepareFrontier(client, states)
      yield* inspectFrontier(client, frontier, limits)
      auditForestOwnership(states, recordRoots)
      yield* settleStates(states, emit)
    }
  }
  return yield* parseTransferBoundary(
    TransferForestInspectionSchema,
    roots.flatMap((id) => {
      const entry = entries.get(id)
      return entry === undefined ? [] : [entry]
    })
  )
})
