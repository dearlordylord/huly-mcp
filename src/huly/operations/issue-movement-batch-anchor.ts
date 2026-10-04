import type { TransferInspection, TransferSupportedRecord } from "../../domain/schemas/issue-transfer.js"
import { HulyTransactionScope, type DocId, type IssueId, type Timestamp } from "../../domain/schemas/shared.js"
import { SocialIdentityId } from "../../domain/schemas/person-administration.js"
import type { MovementTransactionBatch, MovementTransactions } from "../issue-movement-transactions.js"
import { core } from "../huly-plugins.js"
import { movementHistoryMatches } from "./issue-movement-history.js"

// Internal projection of authenticated parsed history from this request's one queued apply batch.
export interface MovementBatchAnchor {
  readonly modifiedOn: Timestamp
  readonly modifiedBy: SocialIdentityId
}
export const movementBatchAnchor = (
  inspections: ReadonlyArray<TransferInspection>,
  previous: ReadonlyArray<TransferSupportedRecord>,
  destinationId: DocId | undefined,
  transactions: MovementTransactions,
  batch: MovementTransactionBatch | undefined,
  rootId: IssueId
): MovementBatchAnchor | undefined => {
  if (!trustedMovementBatch(transactions, batch, rootId)) return undefined
  const histories = inspections
    .flatMap((inspection) => inspection.records)
    .filter((record) => {
      if (record.kind !== "history" || previous.some((value) => value._id === record._id)) return false
      if (!movementHistoryMatches(record, transactions, destinationId)) return false
      return transactions.filter((value) => value.txId === record.history.txId).length === 1
    })
  const first = histories[0]
  if (first === undefined || first.modifiedBy === SocialIdentityId.make(core.account.System)) return undefined
  if (!histories.every((record) => record.modifiedOn === first.modifiedOn && record.modifiedBy === first.modifiedBy))
    return undefined
  return { modifiedOn: first.modifiedOn, modifiedBy: first.modifiedBy }
}
const trustedMovementBatch = (
  transactions: MovementTransactions,
  batch: MovementTransactionBatch | undefined,
  rootId: IssueId
): boolean => {
  if (batch === undefined || batch.rootId !== rootId) return false
  if (batch.scope !== HulyTransactionScope.make(`issue-transfer:${rootId}`)) return false
  const ids = new Set(transactions.map((transaction) => transaction.txId))
  if (ids.size !== transactions.length || ids.size !== batch.transactionIds.length) return false
  return new Set(batch.transactionIds).size === ids.size && batch.transactionIds.every((id) => ids.has(id))
}
