import { isDeepStrictEqual } from "node:util"
import { Option, Schema } from "effect"
import type { TransferHistoryRecord, TransferRecord } from "../../domain/schemas/issue-transfer.js"
import { ObjectClassName, type DocId } from "../../domain/schemas/shared.js"
import type { MovementTransactionReceipt, MovementTransactions } from "../issue-movement-transactions.js"

const MovementHistoryUpdatesSchema = Schema.Struct({
  attrKey: Schema.Literals([
    "attachedTo",
    "parents",
    "space",
    "number",
    "identifier",
    "rank",
    "component",
    "milestone"
  ]),
  attrClass: ObjectClassName,
  isMixin: Schema.Literal(false),
  set: Schema.Array(Schema.Json),
  added: Schema.Array(Schema.Never),
  removed: Schema.Array(Schema.Never),
  prevValue: Schema.optionalKey(Schema.Never)
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
  if (transaction === undefined || "target" in transaction) return false
  if (!historyIdentityMatches(record, transaction, destinationId) || !historyMetadataMatches(record, transaction))
    return false
  const updates = parseUpdates(history.attributeUpdates)
  if (Option.isNone(updates)) return false
  return historyDeltaMatches(updates.value, transaction)
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
  record.modifiedBy === transaction.modifiedBy &&
  record.history.createdOn === record.modifiedOn &&
  record.history.createdBy === transaction.modifiedBy &&
  record.history.updateCollection === undefined

const historyDeltaMatches = (
  changed: Schema.Schema.Type<typeof MovementHistoryUpdatesSchema>,
  transaction: MovementTransactionReceipt
): boolean => {
  const metadata = transaction.historyAttributes.find((attribute) => attribute.attrKey === changed.attrKey)
  if (metadata?.attrClass !== changed.attrClass) return false
  const value = transaction.operations[changed.attrKey]
  if (value === undefined) return false
  return isDeepStrictEqual(changed.set, Array.isArray(value) ? value : [value])
}
