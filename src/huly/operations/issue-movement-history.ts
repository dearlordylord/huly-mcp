import { isDeepStrictEqual } from "node:util"
import { Option, Schema } from "effect"
import type { TransferHistoryRecord, TransferRecord } from "../../domain/schemas/issue-transfer.js"
import { NonEmptyString, ObjectClassName, type DocId } from "../../domain/schemas/shared.js"
import type { MovementTransactionReceipt, MovementTransactions } from "../issue-movement-transactions.js"

const MovementHistoryUpdatesSchema = Schema.Struct({
  attrKey: NonEmptyString,
  attrClass: ObjectClassName,
  isMixin: Schema.Literal(false),
  set: Schema.Array(Schema.Json),
  added: Schema.Array(Schema.Json),
  removed: Schema.Array(Schema.Json),
  prevValue: Schema.optionalKey(Schema.Json)
})
const parseUpdates = Schema.decodeUnknownOption(Schema.fromJsonString(MovementHistoryUpdatesSchema))

export const movementHistoryMatches = (
  record: TransferRecord,
  transactions: MovementTransactions,
  destinationId: DocId | undefined
): boolean => {
  if (record.kind !== "history" || destinationId === undefined) return false
  const history = record.history
  const transaction = transactions.find((value) => value.txId === history.txId)
  if (transaction === undefined) return false
  if (!historyIdentityMatches(record, transaction, destinationId) || !historyMetadataMatches(record, transaction))
    return false
  const updates = parseUpdates(history.attributeUpdates)
  if (Option.isNone(updates)) return false
  const changed = updates.value
  const value = transaction.operations[changed.attrKey]
  if (value === undefined || changed.added.length > 0 || changed.removed.length > 0) return false
  return isDeepStrictEqual(changed.set, Array.isArray(value) ? value : [value])
}

const historyIdentityMatches = (
  record: TransferHistoryRecord,
  transaction: MovementTransactionReceipt,
  destinationId: DocId
): boolean =>
  record.history.action === "update" &&
  record.history.objectId === transaction.objectId &&
  record.history.objectClass === transaction.objectClass &&
  record.attachedTo === transaction.objectId &&
  record.attachedToClass === transaction.objectClass &&
  record.space === destinationId

const historyMetadataMatches = (record: TransferHistoryRecord, transaction: MovementTransactionReceipt): boolean =>
  record.collection === "docUpdateMessages" &&
  record.modifiedOn === transaction.modifiedOn &&
  record.modifiedBy === transaction.modifiedBy
