import { Effect } from "effect"
import type { IssueId } from "../domain/schemas/shared.js"
import type { MovementIssue } from "../domain/schemas/issue-movement-state.js"
import type { HulyClient } from "./client.js"
import type {
  TransferForestEntry,
  TransferForestInspection,
  TransferForestProgress
} from "./issue-transfer-forest-state.js"

type ForestClient = HulyClient["Service"]

const inspectLegacyRoots = Effect.fn("transfer.inspectLegacyRoots")(function* (
  inspect: NonNullable<ForestClient["inspectTransferRecords"]>,
  roots: ReadonlyArray<IssueId>,
  tree: ReadonlyArray<MovementIssue>,
  publish: TransferForestProgress
): Effect.fn.Return<void> {
  for (const ownerId of roots) {
    const result = yield* Effect.result(inspect(ownerId, tree))
    yield* publish(
      result._tag === "Success"
        ? { status: "observed", ownerId, inspection: result.success }
        : { status: "unavailable", ownerId, reason: "inspection-unavailable" }
    )
  }
})

const inspectForestRoots = Effect.fn("transfer.inspectForestRoots")(function* (
  client: ForestClient,
  roots: ReadonlyArray<IssueId>,
  tree: ReadonlyArray<MovementIssue>,
  publish: TransferForestProgress
): Effect.fn.Return<void> {
  if (client.inspectTransferForest !== undefined) {
    const result = yield* Effect.result(client.inspectTransferForest(roots, tree, publish))
    if (result._tag === "Success") {
      for (const entry of result.success) yield* publish(entry)
    }
  } else if (client.inspectTransferRecords !== undefined) {
    yield* inspectLegacyRoots(client.inspectTransferRecords, roots, tree, publish)
  }
})

export const observeTransferForest = Effect.fn("transfer.observeForest")(function* (
  client: ForestClient,
  roots: ReadonlyArray<IssueId>,
  tree: ReadonlyArray<MovementIssue>,
  publish: TransferForestProgress
): Effect.fn.Return<TransferForestInspection> {
  const entries = new Map<IssueId, TransferForestEntry>()
  const record: TransferForestProgress = (entry) =>
    Effect.gen(function* () {
      if (!roots.includes(entry.ownerId) || entries.has(entry.ownerId)) return
      entries.set(entry.ownerId, entry)
      yield* publish(entry)
    })
  yield* inspectForestRoots(client, roots, tree, record)
  const ordered: Array<TransferForestEntry> = []
  for (const ownerId of roots) {
    const entry: TransferForestEntry = entries.get(ownerId) ?? {
      status: "unavailable",
      ownerId,
      reason: "inspection-unavailable"
    }
    if (!entries.has(ownerId)) yield* record(entry)
    ordered.push(entry)
  }
  return ordered
})
