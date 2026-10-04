import { isDeepStrictEqual } from "node:util"
import { Option, Schema } from "effect"
import type { TransferSupportedRecord } from "../../domain/schemas/issue-transfer.js"
import type { DocId } from "../../domain/schemas/shared.js"
import type {
  MovementRecordTransactionReceipt,
  MovementTransactionInspection,
  MovementTransactions
} from "../issue-movement-transactions.js"

const LAST_ENTRY = -1
const parseSnapshot = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.JsonObject))
// Internal proof decision; receipt and document payloads are schema-owned at their boundaries.
export type MovementRecordProof = "preserved" | "changed" | "unavailable"

export const movementRecordProof = (
  current: TransferSupportedRecord,
  expected: TransferSupportedRecord,
  destinationId: DocId,
  queued: MovementTransactions,
  persisted: MovementTransactionInspection | undefined
): MovementRecordProof => {
  if (isDeepStrictEqual(current, { ...expected, space: destinationId })) return "preserved"
  const before = parseSnapshot(expected.snapshot)
  const after = parseSnapshot(current.snapshot)
  if (Option.isNone(before) || Option.isNone(after)) return "unavailable"
  if (!protectedRecordMatches(current, expected, destinationId, before.value, after.value)) return "changed"
  if (current.modifiedOn === expected.modifiedOn && isDeepStrictEqual(before.value, after.value)) return "preserved"
  if (!snapshotMetadataMatches(after.value, current)) return "changed"
  return committedRecordTime(current, expected, destinationId, queued, persisted)
}
const committedRecordTime = (
  current: TransferSupportedRecord,
  expected: TransferSupportedRecord,
  destinationId: DocId,
  queued: MovementTransactions,
  persisted: MovementTransactionInspection | undefined
): MovementRecordProof => {
  const intents = queued
    .filter((value): value is MovementRecordTransactionReceipt => "target" in value)
    .filter((value) => value.objectId === expected._id)
  const intent = intents.at(LAST_ENTRY)
  if (intent === undefined || persisted === undefined) return "unavailable"
  if (!queuedRecordMatches(intent, expected, destinationId)) return "unavailable"
  const transaction = persisted.transactions.find((value) => value.txId === intent.txId)
  if (transaction === undefined) return "unavailable"
  const { modifiedOn: _queuedTime, target: _target, ...identity } = intent
  const { modifiedOn: serverTime, ...committedIdentity } = transaction
  if (!isDeepStrictEqual(identity, committedIdentity)) return "unavailable"
  return current.modifiedOn === serverTime && current.modifiedBy === transaction.modifiedBy ? "preserved" : "changed"
}
const protectedRecordMatches = (
  current: TransferSupportedRecord,
  expected: TransferSupportedRecord,
  destinationId: DocId,
  before: Schema.Schema.Type<typeof Schema.JsonObject>,
  after: Schema.Schema.Type<typeof Schema.JsonObject>
): boolean => {
  const { modifiedBy: _beforeAuthor, modifiedOn: _beforeTime, ...beforePayload } = before
  const { modifiedBy: _afterAuthor, modifiedOn: _afterTime, ...afterPayload } = after
  const { modifiedBy: _oldAuthor, modifiedOn: _oldTime, snapshot: _beforeSnapshot, ...beforeRoute } = expected
  const { modifiedBy: _newAuthor, modifiedOn: _newTime, snapshot: _afterSnapshot, ...afterRoute } = current
  return (
    isDeepStrictEqual(beforePayload, afterPayload) &&
    isDeepStrictEqual(afterRoute, { ...beforeRoute, space: destinationId })
  )
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
