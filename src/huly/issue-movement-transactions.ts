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
export const MovementRecordTransactionReceiptSchema = Schema.Struct({
  target: Schema.Literal("record"),
  txId: DocId,
  transactionClass: Schema.Literal(ObjectClassName.make("core:class:TxUpdateDoc")),
  objectId: DocId,
  objectClass: ObjectClassName.check(
    Schema.makeFilter((value) => value !== ObjectClassName.make("tracker:class:Issue"), {
      message: "Record transaction must target an owned record class."
    })
  ),
  objectSpace: DocId,
  modifiedOn: Timestamp,
  modifiedBy: SocialIdentityId,
  operations: Schema.JsonObject
})
export type MovementRecordTransactionReceipt = Schema.Schema.Type<typeof MovementRecordTransactionReceiptSchema>
export const PersistedMovementTransactionSchema = Schema.Struct({
  txId: DocId,
  transactionClass: Schema.Literal(ObjectClassName.make("core:class:TxUpdateDoc")),
  objectId: DocId,
  objectClass: ObjectClassName,
  objectSpace: DocId,
  modifiedOn: Timestamp,
  modifiedBy: SocialIdentityId,
  operations: Schema.JsonObject
})
export type PersistedMovementTransaction = Schema.Schema.Type<typeof PersistedMovementTransactionSchema>
export const MovementTransactionInspectionSchema = Schema.Struct({
  discovery: Schema.Literals(["complete", "incomplete"]),
  transactions: Schema.Array(PersistedMovementTransactionSchema)
})
export type MovementTransactionInspection = Schema.Schema.Type<typeof MovementTransactionInspectionSchema>
export const MovementTransactionsSchema = Schema.Array(
  Schema.Union([MovementTransactionReceiptSchema, MovementRecordTransactionReceiptSchema])
)
export type MovementTransactions = Schema.Schema.Type<typeof MovementTransactionsSchema>
// Internal awaited observer of queued intent, not acknowledgement or durable commit evidence.
export type MovementTransactionProgress = (transactions: MovementTransactions) => Effect.Effect<void>
