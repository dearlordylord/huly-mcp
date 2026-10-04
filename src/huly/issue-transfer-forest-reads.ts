import type { ActivityReference } from "@hcengineering/activity"
import type { AttachedDoc, Doc, TxOperations } from "@hcengineering/core"
import { Effect } from "effect"
import { type DocId, ListTotal, type ObjectClassName } from "../domain/schemas/shared.js"
import { HulyDataInvalidError, makeOperationConnectionError } from "./errors-base.js"
import { type DiscoveryState, type RecordDiscoveryLimits, type Visit } from "./issue-transfer-discovery.js"
import { OwnershipSchema, parseTransferBoundary, referenceOwner } from "./issue-transfer-records.js"
import { hulyQuery } from "./operations/query-helpers.js"
import { toClassRef, toRef } from "./operations/sdk-boundary.js"

// Request-local traversal metadata; SDK rows and totals retain their boundary codecs.
export interface ForestVisit {
  readonly state: DiscoveryState
  readonly visit: Visit
  readonly collections: ReadonlyMap<string, ObjectClassName>
  readonly representatives: ReadonlyArray<ObjectClassName>
}

const chargeRead = (visits: ReadonlyArray<ForestVisit>, limits: RecordDiscoveryLimits) => {
  const admitted = new Map<DiscoveryState, boolean>()
  const exhausted: Array<DiscoveryState> = []
  for (const { state } of visits) {
    if (admitted.has(state)) continue
    const allowed = !state.incomplete && state.queries < limits.queries
    admitted.set(state, allowed)
    if (allowed) state.queries++
    else if (!state.incomplete) exhausted.push(state)
  }
  return { active: visits.filter(({ state }) => admitted.get(state)), exhausted }
}

const readOwners = Effect.fn("transfer.readForestOwners")(function* (
  client: TxOperations,
  cls: ObjectClassName,
  ownerIds: ReadonlyArray<DocId>,
  limits: RecordDiscoveryLimits,
  outgoing: boolean
) {
  const ids = ownerIds.map((id) => toRef<Doc>(id))
  const first = ids[0]
  const ownerQuery = ids.length === 1 && first !== undefined ? first : { $in: ids }
  const rows = yield* Effect.tryPromise({
    try: () =>
      outgoing
        ? client.findAll<ActivityReference>(
            toClassRef<ActivityReference>(cls),
            hulyQuery<ActivityReference>({ srcDocId: ownerQuery }),
            { limit: limits.result, total: true }
          )
        : client.findAll<AttachedDoc>(
            toClassRef<AttachedDoc>(cls),
            hulyQuery<AttachedDoc>({ attachedTo: ownerQuery }),
            { limit: limits.result, total: true }
          ),
    catch: (cause) => makeOperationConnectionError("findAll", cause)
  })
  const total = yield* parseTransferBoundary(ListTotal, rows.total)
  const partition = new Map<DocId, Array<AttachedDoc>>(ownerIds.map((id) => [id, []]))
  for (const row of rows) {
    const owner = outgoing
      ? yield* referenceOwner(row)
      : { _id: (yield* parseTransferBoundary(OwnershipSchema, row)).attachedTo }
    const owned = partition.get(owner._id)
    if (owned === undefined)
      return yield* Effect.fail(
        new HulyDataInvalidError({
          operation: "move_issue",
          entity: "forest ownership",
          cause: "A collection row belongs to an unrequested owner."
        })
      )
    owned.push(row)
  }
  return { partition, complete: total === rows.length && rows.length < limits.result }
})

const readIndividualOwners = Effect.fn("transfer.readIndividualForestOwners")(function* (
  client: TxOperations,
  cls: ObjectClassName,
  active: ReadonlyArray<ForestVisit>,
  ownerIds: ReadonlyArray<DocId>,
  limits: RecordDiscoveryLimits,
  outgoing: boolean
) {
  const exhausted: Array<DiscoveryState> = []
  const replies: Array<{ target: ForestVisit; rows: ReadonlyArray<AttachedDoc>; complete: boolean }> = []
  for (const id of ownerIds) {
    const fallback = chargeRead(
      active.filter(({ visit }) => visit.owner._id === id),
      limits
    )
    exhausted.push(...fallback.exhausted)
    const members = fallback.active
    if (members.length === 0) continue
    const single = yield* readOwners(client, cls, [id], limits, outgoing)
    for (const target of members)
      replies.push({ target, rows: single.partition.get(id) ?? [], complete: single.complete })
  }
  return { replies, exhausted }
})

export const readForestClass = Effect.fn("transfer.readForestClass")(function* (
  client: TxOperations,
  cls: ObjectClassName,
  visits: ReadonlyArray<ForestVisit>,
  limits: RecordDiscoveryLimits,
  outgoing = false
) {
  const { active, exhausted } = chargeRead(visits, limits)
  if (active.length === 0) return { replies: [], exhausted }
  const ownerIds = [...new Set(active.map(({ visit }) => visit.owner._id))]
  const grouped = yield* readOwners(client, cls, ownerIds, limits, outgoing)
  if (grouped.complete || ownerIds.length === 1)
    return {
      replies: active.map((target) => ({
        target,
        rows: grouped.partition.get(target.visit.owner._id) ?? [],
        complete: grouped.complete
      })),
      exhausted
    }
  const fallback = yield* readIndividualOwners(client, cls, active, ownerIds, limits, outgoing)
  return { replies: fallback.replies, exhausted: [...exhausted, ...fallback.exhausted] }
})
