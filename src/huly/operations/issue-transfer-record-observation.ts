import { movementHistoryMatches } from "./issue-movement-history.js"
import type { MovementTransactions } from "../issue-movement-transactions.js"
import { observeTransferForest } from "../issue-transfer-forest-observation.js"
import type { TransferForestEntry } from "../issue-transfer-forest-state.js"
import { isDeepStrictEqual } from "node:util"
import { Effect, Schema } from "effect"
import {
  MovementObservedRecordSchema,
  type MovementUncertaintyEvidence
} from "../../domain/schemas/issue-movement-uncertainty.js"
import type {
  TransferInspection,
  TransferRecord,
  TransferSupportedRecord
} from "../../domain/schemas/issue-transfer.js"
import type { TransferTreeWrite } from "../../domain/schemas/issue-transfer-tree.js"
import type { HulyClient } from "../client.js"
import type { TransferPlan } from "./issue-transfer-preflight.js"
import type { ObservedIssue } from "./issue-transfer-task-observation.js"

// Internal inspection proof; public routes remain schema-owned actual observations.
export interface RecordObservation {
  readonly records: Extract<MovementUncertaintyEvidence["verification"], { readonly status: "observed" }>["records"]
  readonly problems: ReadonlyArray<string>
  readonly limitations: ReadonlyArray<string>
}
const parseObservedRecord = (input: unknown) => Schema.decodeUnknownOption(MovementObservedRecordSchema)(input)
const observedRecord = (record: TransferRecord) =>
  parseObservedRecord({
    recordId: record._id,
    objectClass: record._class,
    projectId: record.space,
    attachedTo: record.attachedTo,
    attachedToClass: record.attachedToClass,
    collection: record.collection
  })

export const observeTransferRecords = Effect.fn("transfer.observeRecords")(function* (
  client: HulyClient["Service"],
  prepared: TransferPlan,
  write: TransferTreeWrite,
  observed: ReadonlyArray<ObservedIssue>,
  publish: (observation: RecordObservation) => Effect.Effect<void>,
  transactions: MovementTransactions = []
): Effect.fn.Return<RecordObservation> {
  if (client.inspectTransferRecords === undefined && client.inspectTransferForest === undefined)
    return { records: [], problems: [], limitations: ["Owned-record verifier is unavailable."] }
  const records: Array<RecordObservation["records"][number]> = []
  const problems: Array<string> = []
  const limitations: Array<string> = []
  const owners = [
    ...new Set([...prepared.tasks.map((task) => task.issue._id), ...observed.map((issue) => issue.hierarchy._id)])
  ]
  const observeOwner = Effect.fn("transfer.observeOwner")(function* (
    entry: TransferForestEntry
  ): Effect.fn.Return<void> {
    const issueId = entry.ownerId
    if (entry.status === "unavailable") {
      limitations.push(`Record closure of ${issueId} could not be read.`)
    } else {
      const task = prepared.tasks.find((value) => value.issue._id === issueId)
      const planned = write.tasks.find((value) => value.issueId === issueId)
      const ownerProof = inspectOwnerRecords(
        entry.inspection,
        task?.records ?? [],
        planned?.destinationId,
        transactions
      )
      records.push(...ownerProof.records)
      problems.push(...ownerProof.problems)
      limitations.push(...ownerProof.limitations)
    }
    yield* publish({ records: [...records], problems: [...problems], limitations: [...limitations] })
  })
  yield* observeTransferForest(
    client,
    owners,
    observed.map((issue) => issue.hierarchy),
    observeOwner
  )
  return { records, problems, limitations }
})

const inspectOwnerRecords = (
  inspection: TransferInspection,
  previous: ReadonlyArray<TransferSupportedRecord>,
  destinationId: TransferTreeWrite["tasks"][number]["destinationId"] | undefined,
  transactions: MovementTransactions
): RecordObservation => {
  const records: Array<RecordObservation["records"][number]> = []
  const problems: Array<string> = []
  const limitations: Array<string> = []
  for (const record of inspection.records) {
    const route = observedRecord(record)
    if (route._tag === "Some") records.push(route.value)
    else limitations.push(`Record route of ${record._id} is unavailable.`)
    const expected = previous.find((value) => value._id === record._id)
    const problem =
      expected === undefined && movementHistoryMatches(record, transactions, destinationId)
        ? undefined
        : presentRecordProblem(record, expected, destinationId)
    if (problem !== undefined) problems.push(problem)
    if (record.kind === "unsupported") limitations.push(`Protected payload of record ${record._id} is unavailable.`)
  }
  const completeness = inspectRecordCompleteness(inspection, previous)
  return {
    records,
    problems: [...problems, ...completeness.problems],
    limitations: [...limitations, ...completeness.limitations]
  }
}
const inspectRecordCompleteness = (
  inspection: TransferInspection,
  previous: ReadonlyArray<TransferSupportedRecord>
) => {
  if (inspection.discovery === "incomplete")
    return { problems: [], limitations: ["Owned-record closure is incomplete.", ...inspection.blockers] }
  const missing = previous.filter((record) => !inspection.records.some((value) => value._id === record._id))
  return {
    problems: [
      ...missing.map((record) => `Owned record ${record._id} is absent from its complete owner closure.`),
      ...inspection.blockers
    ],
    limitations: []
  }
}
const presentRecordProblem = (
  current: TransferRecord,
  expected: TransferSupportedRecord | undefined,
  destinationId: TransferTreeWrite["tasks"][number]["destinationId"] | undefined
): string | undefined => {
  if (expected === undefined) return `Unexpected owned record ${current._id} was observed after preflight.`
  if (destinationId === undefined) return `Record ${current._id} belongs to an unplanned task.`
  if (current.kind === "unsupported")
    return current.space !== destinationId ||
      current.attachedTo !== expected.attachedTo ||
      current._class !== expected._class
      ? `Observed ownership or project of record ${current._id} differs from approved state.`
      : undefined
  return isDeepStrictEqual(current, { ...expected, space: destinationId })
    ? undefined
    : `Observed protected payload or ownership of record ${current._id} differs from approved state.`
}
