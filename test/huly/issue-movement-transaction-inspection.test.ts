import type { Doc, DocumentQuery, FindOptions, TxOperations } from "@hcengineering/core"
import { it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { expect } from "vitest"
import { DocId, UNKNOWN_TOTAL } from "../../src/domain/schemas/shared.js"
import {
  inspectMovementTransactions,
  MOVEMENT_TRANSACTION_READ_BATCH_SIZE
} from "../../src/huly/issue-movement-transaction-inspection.js"
import {
  MovementRecordTransactionReceiptSchema,
  type MovementRecordTransactionReceipt,
  type MovementTransactions
} from "../../src/huly/issue-movement-transactions.js"
import { findResult, sdkFixture } from "../helpers/huly-sdk.js"

const querySchema = Schema.Struct({ _id: Schema.Struct({ $in: Schema.Array(DocId) }) })
const intent = (index: number): MovementRecordTransactionReceipt =>
  Schema.decodeUnknownSync(MovementRecordTransactionReceiptSchema)({
    target: "record",
    txId: `transaction-${index}`,
    transactionClass: "core:class:TxUpdateDoc",
    objectId: `record-${index}`,
    objectClass: "attachment:class:Attachment",
    objectSpace: "source",
    modifiedOn: 10,
    modifiedBy: "mover",
    operations: { space: "destination" }
  })
const stored = (queued: MovementTransactions[number]) => ({
  _id: queued.txId,
  _class: queued.transactionClass,
  objectId: queued.objectId,
  objectClass: queued.objectClass,
  objectSpace: queued.objectSpace,
  modifiedOn: 20,
  modifiedBy: queued.modifiedBy,
  operations: queued.operations
})
const fixture = (queued: MovementTransactions) => {
  const rows = queued.map(stored)
  const calls: Array<{ ids: ReadonlyArray<DocId>; limit: number | undefined; total: boolean | undefined }> = []
  const state = { unknownTotal: false, incompleteTotal: false, fail: false, writes: 0 }
  const client = sdkFixture<TxOperations>({
    findAll: async (_class: unknown, query: DocumentQuery<Doc>, options?: FindOptions<Doc>) => {
      const rawQuery: unknown = query
      const ids = Schema.decodeUnknownSync(querySchema)(rawQuery)._id.$in
      calls.push({ ids, limit: options?.limit, total: options?.total })
      if (state.fail) throw new TransactionReadFailure({})
      const result = findResult(rows.filter((row) => ids.includes(row._id)).map((row) => sdkFixture<Doc>(row)))
      if (state.unknownTotal) result.total = UNKNOWN_TOTAL
      if (state.incompleteTotal) result.total = result.length + 1
      return result
    },
    tx: async () => {
      state.writes++
      return {}
    }
  })
  return { client, rows, calls, state }
}
class TransactionReadFailure extends Schema.TaggedError<TransactionReadFailure>()("TransactionReadFailure", {}) {}

it.effect("reads exact queued IDs in bounded windows and retains actual server metadata", () =>
  Effect.gen(function* () {
    const queued = Array.from({ length: MOVEMENT_TRANSACTION_READ_BATCH_SIZE + 1 }, (_, index) => intent(index))
    const f = fixture(queued)
    const result = yield* inspectMovementTransactions(f.client, queued)
    expect(result.discovery).toBe("complete")
    expect(result.transactions).toHaveLength(queued.length)
    expect(result.transactions.every((tx) => tx.modifiedOn === 20 && tx.modifiedBy === "mover")).toBe(true)
    expect(f.calls).toHaveLength(2)
    expect(f.calls.flatMap((call) => call.ids)).toEqual(queued.map((tx) => tx.txId))
    expect(
      f.calls.every(
        (call) =>
          call.ids.length <= MOVEMENT_TRANSACTION_READ_BATCH_SIZE &&
          call.limit === call.ids.length + 1 &&
          call.total === true
      )
    ).toBe(true)
    expect(f.state.writes).toBe(0)
  })
)

for (const incomplete of ["missing", "unknown-total", "truncated-total"]) {
  it.effect(`retains parsed server facts while marking ${incomplete} inspection incomplete`, () =>
    Effect.gen(function* () {
      const queued = [intent(0), intent(1)]
      const f = fixture(queued)
      if (incomplete === "missing") f.rows.pop()
      else if (incomplete === "unknown-total") f.state.unknownTotal = true
      else f.state.incompleteTotal = true
      const result = yield* inspectMovementTransactions(f.client, queued)
      expect(result.discovery).toBe("incomplete")
      expect(result.transactions.map((tx) => tx.txId)).toEqual(f.rows.map((row) => row._id))
      expect(f.state.writes).toBe(0)
    })
  )
}

for (const field of ["_id", "_class", "objectId", "objectClass", "objectSpace", "modifiedBy", "operations"]) {
  it.effect(`refuses persisted ${field} tampering instead of normalizing an unrelated write`, () =>
    Effect.gen(function* () {
      const queued = [intent(0)]
      const f = fixture(queued)
      const row = f.rows[0]
      expect(row).toBeDefined()
      if (row === undefined) return
      const malicious = { ...row, [field]: field === "operations" ? { space: "other" } : "other" }
      const client = sdkFixture<TxOperations>({ findAll: async () => findResult([sdkFixture<Doc>(malicious)]) })
      const result = yield* inspectMovementTransactions(client, queued).pipe(Effect.result)
      expect(result._tag).toBe("Failure")
      if (result._tag === "Failure") expect(result.failure._tag).toBe("HulyDataInvalidError")
    })
  )
}

it.effect("rejects duplicate returned transactions and duplicate queued intents", () =>
  Effect.gen(function* () {
    const queued = [intent(0)]
    const f = fixture(queued)
    const row = f.rows[0]
    if (row === undefined) return
    f.rows.push(row)
    const repeated = yield* inspectMovementTransactions(f.client, queued).pipe(Effect.result)
    expect(repeated._tag).toBe("Failure")
    const ambiguous = yield* inspectMovementTransactions(f.client, [...queued, ...queued]).pipe(Effect.result)
    expect(ambiguous._tag).toBe("Failure")
    expect(f.calls).toHaveLength(1)
  })
)

it.effect("propagates read unavailability and performs no read for empty intent", () =>
  Effect.gen(function* () {
    const queued = [intent(0)]
    const f = fixture(queued)
    expect(yield* inspectMovementTransactions(f.client, [])).toEqual({ discovery: "complete", transactions: [] })
    expect(f.calls).toEqual([])
    f.state.fail = true
    const result = yield* inspectMovementTransactions(f.client, queued).pipe(Effect.result)
    expect(result._tag).toBe("Failure")
    expect(f.state.writes).toBe(0)
  })
)
