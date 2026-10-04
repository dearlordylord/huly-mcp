import type { MovementBatchAnchor } from "./issue-movement-batch-anchor.js"
import { isDeepStrictEqual } from "node:util"
import { Option, Schema } from "effect"
import type { TransferSupportedRecord } from "../../domain/schemas/issue-transfer.js"
import type { DocId } from "../../domain/schemas/shared.js"
import type {
  MovementRecordTransactionReceipt,
  MovementTransactionInspection,
  MovementTransactions
} from "../issue-movement-transactions.js"

const parseSnapshot = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.JsonObject))
// Internal proof decision; receipt and document payloads are schema-owned at their boundaries.
export type MovementRecordProof = "preserved" | "changed" | "unavailable"

export const movementRecordProof = (
  current: TransferSupportedRecord,
  expected: TransferSupportedRecord,
  destinationId: DocId,
  queued: MovementTransactions,
  persisted: MovementTransactionInspection | undefined,
  anchor?: MovementBatchAnchor
): MovementRecordProof => {
  if (isDeepStrictEqual(current, { ...expected, space: destinationId })) return "preserved"
  if (!protectedRouteMatches(current, expected, destinationId)) return "changed"
  if (!hasQueuedRecordIntent(queued, expected)) return "changed"
  return changedMetadataProof(current, expected, destinationId, queued, persisted, anchor)
}
const changedMetadataProof = (
  current: TransferSupportedRecord,
  expected: TransferSupportedRecord,
  destinationId: DocId,
  queued: MovementTransactions,
  persisted: MovementTransactionInspection | undefined,
  anchor: MovementBatchAnchor | undefined
): MovementRecordProof => {
  const before = parseSnapshot(expected.snapshot)
  const after = parseSnapshot(current.snapshot)
  if (Option.isNone(before) || Option.isNone(after))
    return current.snapshot === expected.snapshot ? "unavailable" : "changed"
  if (!protectedSnapshotMatches(before.value, after.value)) return "changed"
  if (!snapshotMetadataMatches(after.value, current)) return "changed"
  return committedRecordTime(current, expected, destinationId, queued, persisted, anchor)
}
const committedRecordTime = (
  current: TransferSupportedRecord,
  expected: TransferSupportedRecord,
  destinationId: DocId,
  queued: MovementTransactions,
  persisted: MovementTransactionInspection | undefined,
  anchor: MovementBatchAnchor | undefined
): MovementRecordProof => {
  const intents = queued
    .filter((value): value is MovementRecordTransactionReceipt => "target" in value)
    .filter((value) => value.objectId === expected._id)
  const intent = intents.length === 1 ? intents[0] : undefined
  if (intent === undefined) return "unavailable"
  if (!queuedRecordMatches(intent, expected, destinationId)) return "unavailable"
  return committedMetadataProof(current, intent, persisted, anchor)
}
const committedMetadataProof = (
  current: TransferSupportedRecord,
  intent: MovementRecordTransactionReceipt,
  persisted: MovementTransactionInspection | undefined,
  anchor: MovementBatchAnchor | undefined
): MovementRecordProof => {
  const matches = persisted?.transactions.filter((value) => value.txId === intent.txId) ?? []
  if (matches.length === 0) return anchoredRecordMetadata(current, intent, anchor)
  const transaction = uniqueCommittedTransaction(matches)
  if (transaction === undefined) return "unavailable"
  const { modifiedOn: _queuedTime, target: _target, ...identity } = intent
  const { modifiedOn: serverTime, ...committedIdentity } = transaction
  if (!isDeepStrictEqual(identity, committedIdentity)) return "unavailable"
  return current.modifiedOn === serverTime && current.modifiedBy === transaction.modifiedBy ? "preserved" : "changed"
}
const protectedSnapshotMatches = (
  before: Schema.Schema.Type<typeof Schema.JsonObject>,
  after: Schema.Schema.Type<typeof Schema.JsonObject>
): boolean => {
  const { modifiedBy: _beforeAuthor, modifiedOn: _beforeTime, ...beforePayload } = before
  const { modifiedBy: _afterAuthor, modifiedOn: _afterTime, ...afterPayload } = after
  return isDeepStrictEqual(beforePayload, afterPayload)
}

const queuedRecordMatches = (
  intent: MovementRecordTransactionReceipt,
  expected: TransferSupportedRecord,
  destinationId: DocId
): boolean =>
  isDeepStrictEqual(intent.operations, { space: destinationId }) &&
  intent.objectClass === expected._class &&
  intent.objectSpace === expected.space
const snapshotMetadataMatches = (
  snapshot: Schema.Schema.Type<typeof Schema.JsonObject>,
  current: TransferSupportedRecord
): boolean => snapshot["modifiedOn"] === current.modifiedOn && snapshot["modifiedBy"] === current.modifiedBy

const uniqueCommittedTransaction = (matches: MovementTransactionInspection["transactions"]) =>
  matches.length === 1 ? matches[0] : undefined
const anchoredRecordMetadata = (
  current: TransferSupportedRecord,
  intent: MovementRecordTransactionReceipt,
  anchor: MovementBatchAnchor | undefined
): MovementRecordProof => {
  if (anchor === undefined || anchor.modifiedBy !== intent.modifiedBy) return "unavailable"
  return current.modifiedOn === anchor.modifiedOn && current.modifiedBy === intent.modifiedBy ? "preserved" : "changed"
}
