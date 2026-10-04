import { type Effect, Schema } from "effect"
import { SocialIdentityId } from "../domain/schemas/person-administration.js"
import { DocId, IssueId, NonEmptyString, ObjectClassName, Timestamp } from "../domain/schemas/shared.js"

export const MovementHistoryAttributeSchema = Schema.Struct({ attrKey: NonEmptyString, attrClass: ObjectClassName })
export type MovementHistoryAttribute = Schema.Schema.Type<typeof MovementHistoryAttributeSchema>

export const MovementTransactionReceiptSchema = Schema.Struct({
  txId: DocId,
  transactionClass: Schema.Literal(ObjectClassName.make("core:class:TxUpdateDoc")),
  objectId: IssueId,
  objectClass: Schema.Literal(ObjectClassName.make("tracker:class:Issue")),
  objectSpace: DocId,
  // Queued client time is intent metadata; Huly normalizes committed time on the server.
  modifiedOn: Timestamp,
  modifiedBy: SocialIdentityId,
  operations: Schema.JsonObject,
  historyAttributes: Schema.Array(MovementHistoryAttributeSchema)
})
export type MovementTransactionReceipt = Schema.Schema.Type<typeof MovementTransactionReceiptSchema>
export const MovementTransactionsSchema = Schema.Array(MovementTransactionReceiptSchema)
export type MovementTransactions = Schema.Schema.Type<typeof MovementTransactionsSchema>
// Internal awaited observer of queued intent, not acknowledgement or durable commit evidence.
export type MovementTransactionProgress = (transactions: MovementTransactions) => Effect.Effect<void>
