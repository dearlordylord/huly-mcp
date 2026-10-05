import type { Doc, TxOperations, TxUpdateDoc } from "@hcengineering/core"
import { Array as EffectArray, Effect, Schema } from "effect"
import { isDeepStrictEqual } from "node:util"
import { type DocId, ListTotal } from "../domain/schemas/shared.js"
import { HulyDataInvalidError, makeOperationConnectionError } from "./errors-base.js"
import { core } from "./huly-plugins.js"
import {
  MovementTransactionInspectionSchema,
  PersistedMovementTransactionSchema,
  type MovementTransactionInspection,
  type MovementTransactions,
  type PersistedMovementTransaction
} from "./issue-movement-transactions.js"
import { parseTransferBoundary } from "./issue-transfer-records.js"
import { hulyQuery } from "./operations/query-helpers.js"
import { toRef } from "./operations/sdk-boundary.js"

export const MOVEMENT_TRANSACTION_READ_BATCH_SIZE = 256
const RawPersistedTransactionSchema = Schema.Struct({
  _id: PersistedMovementTransactionSchema.fields.txId,
  _class: PersistedMovementTransactionSchema.fields.transactionClass,
  objectId: PersistedMovementTransactionSchema.fields.objectId,
  objectClass: PersistedMovementTransactionSchema.fields.objectClass,
  objectSpace: PersistedMovementTransactionSchema.fields.objectSpace,
  modifiedOn: PersistedMovementTransactionSchema.fields.modifiedOn,
  modifiedBy: PersistedMovementTransactionSchema.fields.modifiedBy,
  operations: PersistedMovementTransactionSchema.fields.operations
})
const invalidEvidence = () =>
  new HulyDataInvalidError({ operation: "move_issue", entity: "persisted movement transactions" })
const matchesIntent = (actual: PersistedMovementTransaction, intent: MovementTransactions[number]) =>
  actual.transactionClass === intent.transactionClass &&
  actual.objectId === intent.objectId &&
  actual.objectClass === intent.objectClass &&
  actual.objectSpace === intent.objectSpace &&
  actual.modifiedBy === intent.modifiedBy &&
  isDeepStrictEqual(actual.operations, intent.operations)

const readBatch = Effect.fn("movement.readTransactionBatch")(function* (
  client: TxOperations,
  batch: MovementTransactions
) {
  const ids = batch.map((intent) => toRef<TxUpdateDoc<Doc>>(intent.txId))
  const limit = ids.length + 1
  const rows = yield* Effect.tryPromise({
    try: () =>
      client.findAll<TxUpdateDoc<Doc>>(core.class.TxUpdateDoc, hulyQuery<TxUpdateDoc<Doc>>({ _id: { $in: ids } }), {
        limit,
        total: true
      }),
    catch: (cause) => makeOperationConnectionError("findAll", cause)
  })
  const total = yield* parseTransferBoundary(ListTotal, rows.total)
  const input: unknown = rows
  const parsed = yield* parseTransferBoundary(Schema.Array(RawPersistedTransactionSchema), input)
  const transactions: PersistedMovementTransaction[] = []
  const seen = new Set<DocId>()
  for (const raw of parsed) {
    const actual = {
      txId: raw._id,
      transactionClass: raw._class,
      objectId: raw.objectId,
      objectClass: raw.objectClass,
      objectSpace: raw.objectSpace,
      modifiedOn: raw.modifiedOn,
      modifiedBy: raw.modifiedBy,
      operations: raw.operations
    }
    const intent = batch.find((queued) => queued.txId === actual.txId)
    if (intent === undefined || seen.has(actual.txId) || !matchesIntent(actual, intent))
      return yield* Effect.fail(invalidEvidence())
    seen.add(actual.txId)
    transactions.push(actual)
  }
  return { transactions, complete: total === rows.length && rows.length < limit && seen.size === batch.length }
})

export const inspectMovementTransactions = Effect.fn("movement.inspectTransactions")(function* (
  client: TxOperations,
  queued: MovementTransactions
): Effect.fn.Return<
  MovementTransactionInspection,
  HulyDataInvalidError | ReturnType<typeof makeOperationConnectionError>
> {
  if (new Set(queued.map((intent) => intent.txId)).size !== queued.length) return yield* Effect.fail(invalidEvidence())
  const transactions: PersistedMovementTransaction[] = []
  let complete = true
  for (const batch of EffectArray.chunksOf(queued, MOVEMENT_TRANSACTION_READ_BATCH_SIZE)) {
    const result = yield* readBatch(client, batch)
    transactions.push(...result.transactions)
    complete &&= result.complete
  }
  return yield* parseTransferBoundary(MovementTransactionInspectionSchema, {
    discovery: complete ? "complete" : "incomplete",
    transactions
  })
})
