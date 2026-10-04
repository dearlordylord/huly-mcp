import { HulyDataInvalidError } from "../errors-base.js"
import {
  movementBatchAnchor,
  type MovementBatchAnchor,
  type MovementBatchVerification
} from "./issue-movement-batch-anchor.js"
import { movementRecordProof } from "./issue-movement-record-proof.js"
import { movementHistoryMatches } from "./issue-movement-history.js"
import type {
  MovementTransactionBatch,
  MovementTransactionInspection,
  MovementTransactions
} from "../issue-movement-transactions.js"
import { observeTransferForest } from "../issue-transfer-forest-observation.js"
import type { TransferForestEntry } from "../issue-transfer-forest-state.js"
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
  transactions: MovementTransactions = [],
  batchContext?: MovementBatchVerification
): Effect.fn.Return<RecordObservation> {
  if (client.inspectTransferRecords === undefined && client.inspectTransferForest === undefined)
    return { records: [], problems: [], limitations: ["Owned-record verifier is unavailable."] }
  const { batch, persisted } = yield* inspectTransactionEvidence(client, transactions, batchContext)
  const entries = new Map<TransferForestEntry["ownerId"], TransferForestEntry>()
  const owners = [
    ...new Set([...prepared.tasks.map((task) => task.issue._id), ...observed.map((issue) => issue.hierarchy._id)])
  ]
  const observeOwner = (entry: TransferForestEntry) =>
    Effect.gen(function* () {
      entries.set(entry.ownerId, entry)
      yield* publish(projectRecordObservations([...entries.values()], prepared, write, transactions, persisted, batch))
    })
  yield* observeTransferForest(
    client,
    owners,
    observed.map((issue) => issue.hierarchy),
    observeOwner
  )
  return projectRecordObservations([...entries.values()], prepared, write, transactions, persisted, batch)
})

const inspectOwnerRecords = (
  inspection: TransferInspection,
  previous: ReadonlyArray<TransferSupportedRecord>,
  destinationId: TransferTreeWrite["tasks"][number]["destinationId"] | undefined,
  transactions: MovementTransactions,
  persisted: MovementTransactionInspection | undefined,
  anchor: MovementBatchAnchor | undefined
): RecordObservation => {
  const records: Array<RecordObservation["records"][number]> = []
  const problems: Array<string> = []
  const limitations: Array<string> = []
  for (const record of inspection.records) {
    const route = observedRecord(record)
    if (route._tag === "Some") records.push(route.value)
    else limitations.push(`Record route of ${record._id} is unavailable.`)
    const expected = previous.find((value) => value._id === record._id)
    const decision = recordPreservationDecision(record, expected, destinationId, transactions, persisted, anchor)
    if (decision.status === "changed") problems.push(decision.problem)
    if (decision.status === "unavailable") limitations.push(decision.limitation)
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
// Internal mutually exclusive decision from parsed observation and transaction evidence.
type RecordPreservationDecision =
  | { readonly status: "preserved" }
  | { readonly status: "changed"; readonly problem: string }
  | { readonly status: "unavailable"; readonly limitation: string }
const recordPreservationDecision = (
  record: TransferRecord,
  expected: TransferSupportedRecord | undefined,
  destinationId: TransferTreeWrite["tasks"][number]["destinationId"] | undefined,
  transactions: MovementTransactions,
  persisted: MovementTransactionInspection | undefined,
  anchor: MovementBatchAnchor | undefined
): RecordPreservationDecision => {
  if (expected === undefined) {
    if (movementHistoryMatches(record, transactions, destinationId)) return { status: "preserved" }
    return { status: "changed", problem: `Unexpected owned record ${record._id} was observed after preflight.` }
  }
  if (destinationId === undefined)
    return { status: "changed", problem: `Record ${record._id} belongs to an unplanned task.` }
  if (record.kind === "unsupported") return unsupportedRecordDecision(record, expected, destinationId)
  const proof = movementRecordProof(record, expected, destinationId, transactions, persisted, anchor)
  if (proof === "preserved") return { status: "preserved" }
  if (proof === "unavailable")
    return {
      status: "unavailable",
      limitation: `Own migration metadata of record ${record._id} could not be authenticated.`
    }
  return {
    status: "changed",
    problem: `Observed protected payload or ownership of record ${record._id} differs from approved state.`
  }
}

const unsupportedRecordDecision = (
  current: Extract<TransferRecord, { readonly kind: "unsupported" }>,
  expected: TransferSupportedRecord,
  destinationId: TransferTreeWrite["tasks"][number]["destinationId"]
): RecordPreservationDecision =>
  current.space !== destinationId || current.attachedTo !== expected.attachedTo || current._class !== expected._class
    ? {
        status: "changed",
        problem: `Observed ownership or project of record ${current._id} differs from approved state.`
      }
    : { status: "preserved" }

const projectRecordObservations = (
  entries: ReadonlyArray<TransferForestEntry>,
  prepared: TransferPlan,
  write: TransferTreeWrite,
  transactions: MovementTransactions,
  persisted: MovementTransactionInspection | undefined,
  batch: MovementTransactionBatch | undefined
): RecordObservation => {
  const inspections = entries.flatMap((entry) => (entry.status === "observed" ? [entry.inspection] : []))
  const anchor = movementBatchAnchor(
    inspections,
    prepared.tasks.flatMap((task) => task.records),
    write.tasks[0]?.destinationId,
    transactions,
    batch,
    write.rootId
  )
  const proofs = entries.map((entry) => {
    if (entry.status === "unavailable")
      return { records: [], problems: [], limitations: [`Record closure of ${entry.ownerId} could not be read.`] }
    const task = prepared.tasks.find((value) => value.issue._id === entry.ownerId)
    const planned = write.tasks.find((value) => value.issueId === entry.ownerId)
    return inspectOwnerRecords(
      entry.inspection,
      task?.records ?? [],
      planned?.destinationId,
      transactions,
      persisted,
      anchor
    )
  })
  return {
    records: proofs.flatMap((value) => value.records),
    problems: proofs.flatMap((value) => value.problems),
    limitations: proofs.flatMap((value) => value.limitations)
  }
}

// Internal read outcome keeps invalid evidence distinct from absent or unavailable transaction logs.
const inspectTransactionEvidence = Effect.fn("transfer.inspectTransactionEvidence")(function* (
  client: HulyClient["Service"],
  transactions: MovementTransactions,
  context: MovementBatchVerification | undefined
): Effect.fn.Return<{
  readonly persisted: MovementTransactionInspection | undefined
  readonly batch: MovementTransactionBatch | undefined
}> {
  const recordIntents = transactions.filter((value) => "target" in value)
  const inspect = client.inspectMovementTransactions
  if (recordIntents.length === 0 || inspect === undefined) return { persisted: undefined, batch: batchPayload(context) }
  const result = yield* Effect.result(inspect(recordIntents))
  if (result._tag === "Success") return { persisted: result.success, batch: batchPayload(context) }
  if (result.failure instanceof HulyDataInvalidError) {
    if (context !== undefined) yield* context.invalidate
    return { persisted: undefined, batch: undefined }
  }
  return { persisted: undefined, batch: batchPayload(context) }
})

const batchPayload = (context: MovementBatchVerification | undefined) => context?.batch
