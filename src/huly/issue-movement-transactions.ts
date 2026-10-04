import { type Effect, Schema } from "effect"
import { SocialIdentityId } from "../domain/schemas/person-administration.js"
import { DocId, IssueId, ObjectClassName, Timestamp } from "../domain/schemas/shared.js"

export const MovementTransactionReceiptSchema = Schema.Struct({
  txId: DocId,
  transactionClass: Schema.Literal(ObjectClassName.make("core:class:TxUpdateDoc")),
  objectId: IssueId,
  objectClass: Schema.Literal(ObjectClassName.make("tracker:class:Issue")),
  objectSpace: DocId,
  modifiedOn: Timestamp,
  modifiedBy: SocialIdentityId,
  operations: Schema.JsonObject
})
export type MovementTransactionReceipt = Schema.Schema.Type<typeof MovementTransactionReceiptSchema>
export const MovementTransactionsSchema = Schema.Array(MovementTransactionReceiptSchema)
export type MovementTransactions = Schema.Schema.Type<typeof MovementTransactionsSchema>
// Internal awaited observer of queued intent, not acknowledgement or durable commit evidence.
export type MovementTransactionProgress = (transactions: MovementTransactions) => Effect.Effect<void>
