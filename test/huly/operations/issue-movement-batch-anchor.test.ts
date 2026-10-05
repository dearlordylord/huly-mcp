import { it } from "@effect/vitest"
import { Effect, Fiber, Ref, Schema } from "effect"
import { TestClock } from "effect/testing"
import { expect } from "vitest"
import { HulyConnectionError, HulyDataInvalidError } from "../../../src/huly/errors-base.js"
import { HulyClient } from "../../../src/huly/client.js"
import { parseMoveIssueParams } from "../../../src/domain/schemas/issue-movement.js"
import { TransferHistoryRecordSchema } from "../../../src/domain/schemas/issue-transfer.js"
import {
  MovementTransactionsSchema,
  MovementTransactionBatchSchema,
  MovementTransactionInspectionSchema,
  type MovementTransactionProgress
} from "../../../src/huly/issue-movement-transactions.js"
import { moveIssue } from "../../../src/huly/operations/issue-movement.js"
import { assertExists } from "../../../src/utils/assertions.js"
import { transferTreeFixture } from "../../helpers/transfer-tree.js"

const transactionsFrom = (input: unknown) => Schema.decodeUnknownSync(MovementTransactionsSchema)(input)
const batchFrom = (input: unknown) => Schema.decodeUnknownSync(MovementTransactionBatchSchema)(input)
const inspectionFrom = (input: unknown) => Schema.decodeUnknownSync(MovementTransactionInspectionSchema)(input)
const historyFrom = (input: unknown) => Schema.decodeUnknownSync(TransferHistoryRecordSchema)(input)
const scenarios = [
  "acknowledged",
  "reply-lost",
  "no-provenance",
  "repeated-publication",
  "duplicate-record",
  "duplicate-issue",
  "foreign-history",
  "preexisting-history",
  "later-metadata",
  "changed-creator",
  "conflicting-anchors",
  "direct-contradiction",
  "invalid-direct-evidence",
  "invalid-then-empty",
  "invalid-repeat",
  "wrong-scope",
  "transaction-connection-outage"
] as const
for (const scenario of scenarios) {
  it.effect(`single movement batch anchor: ${scenario}`, () =>
    Effect.gen(function* () {
      const f = transferTreeFixture()
      const record = assertExists(f.records[0])
      const snapshot = {
        modifiedOn: record.modifiedOn,
        modifiedBy: record.modifiedBy,
        createdOn: 1,
        createdBy: "old-creator",
        payload: "preserved"
      }
      Object.assign(record, historyFrom({ ...record, snapshot: JSON.stringify(snapshot) }))
      const history = historyFrom({
        _id: "batch-movement-history",
        _class: "activity:class:DocUpdateMessage",
        kind: "history",
        attachedTo: f.root._id,
        attachedToClass: "tracker:class:Issue",
        collection: "docUpdateMessages",
        space: f.destination._id,
        modifiedOn: 20,
        modifiedBy: record.modifiedBy,
        snapshot: "new movement history",
        history: {
          objectId: f.root._id,
          objectClass: "tracker:class:Issue",
          action: "update",
          txId: scenario === "foreign-history" ? "foreign-issue-tx" : "own-issue-tx",
          createdOn: 20,
          createdBy: record.modifiedBy,
          attributeUpdates: JSON.stringify({
            attrKey: "space",
            attrClass: "core:class:Space",
            isMixin: false,
            set: [f.destination._id],
            added: [],
            removed: []
          })
        }
      })
      if (scenario === "preexisting-history") f.records.push(historyFrom({ ...history, space: f.source._id }))
      const commit = assertExists(f.operations.commitTransferTree)
      const params = yield* parseMoveIssueParams(f.input)
      f.state.failCommit = scenario === "reply-lost"
      const evidenceCalls = yield* Ref.make(0)
      const originalTitle = f.child.title
      const operations = {
        ...f.operations,
        inspectMovementTransactions: () =>
          Effect.gen(function* () {
            const call = yield* Ref.updateAndGet(evidenceCalls, (value) => value + 1)
            if (scenario === "transaction-connection-outage")
              return yield* Effect.fail(new HulyConnectionError({ message: "Persisted transaction read unavailable" }))
            if (scenario === "invalid-repeat" && call === 1) {
              f.child.title = originalTitle
              return yield* Effect.fail(
                new HulyDataInvalidError({ operation: "move_issue", entity: "persisted transactions" })
              )
            }
            if (scenario === "invalid-direct-evidence" || (scenario === "invalid-then-empty" && call === 1))
              return yield* Effect.fail(
                new HulyDataInvalidError({ operation: "move_issue", entity: "persisted transactions" })
              )
            return inspectionFrom({ discovery: "incomplete", transactions: [] })
          }),
        commitTransferTree: (write: Parameters<typeof commit>[0], publish?: MovementTransactionProgress) =>
          Effect.gen(function* () {
            const base = transactionsFrom([
              {
                target: "record",
                txId: "own-record-tx",
                transactionClass: "core:class:TxUpdateDoc",
                objectId: record._id,
                objectClass: record._class,
                objectSpace: f.source._id,
                modifiedOn: 10,
                modifiedBy: record.modifiedBy,
                operations: { space: f.destination._id }
              },
              {
                txId: "own-issue-tx",
                transactionClass: "core:class:TxUpdateDoc",
                objectId: f.root._id,
                objectClass: "tracker:class:Issue",
                objectSpace: f.source._id,
                modifiedOn: 10,
                modifiedBy: record.modifiedBy,
                operations: { space: f.destination._id },
                historyAttributes: [{ attrKey: "space", attrClass: "core:class:Space" }]
              },
              ...(scenario === "conflicting-anchors"
                ? [
                    {
                      txId: "own-child-tx",
                      transactionClass: "core:class:TxUpdateDoc",
                      objectId: f.child._id,
                      objectClass: "tracker:class:Issue",
                      objectSpace: f.source._id,
                      modifiedOn: 10,
                      modifiedBy: record.modifiedBy,
                      operations: { space: f.destination._id },
                      historyAttributes: [{ attrKey: "space", attrClass: "core:class:Space" }]
                    }
                  ]
                : [])
            ])
            const transactions =
              scenario === "duplicate-record"
                ? transactionsFrom([...base, assertExists(base[0])])
                : scenario === "duplicate-issue"
                  ? transactionsFrom([...base, assertExists(base[1])])
                  : base
            const batch = batchFrom({
              kind: "single-scoped-apply",
              rootId: write.rootId,
              scope: scenario === "wrong-scope" ? "unrelated-movement-scope" : `issue-transfer:${write.rootId}`,
              transactionIds: transactions.map((value) => value.txId)
            })
            yield* assertExists(publish)(transactions, scenario === "no-provenance" ? undefined : batch)
            if (scenario === "repeated-publication") yield* assertExists(publish)(transactions, batch)
            const mutate = Effect.sync(() => {
              Object.assign(
                record,
                historyFrom({
                  ...record,
                  modifiedOn: scenario === "later-metadata" ? 21 : 20,
                  snapshot: JSON.stringify({
                    ...snapshot,
                    modifiedOn: scenario === "later-metadata" ? 21 : 20,
                    createdBy: scenario === "changed-creator" ? "changed-creator" : snapshot.createdBy
                  })
                })
              )
              if (scenario === "invalid-repeat") f.child.title = "independently changed title"
              if (scenario !== "preexisting-history") f.records.push(history)
              if (scenario === "conflicting-anchors")
                f.records.push(
                  historyFrom({
                    ...history,
                    _id: "child-history",
                    attachedTo: f.child._id,
                    modifiedOn: 21,
                    history: { ...history.history, objectId: f.child._id, txId: "own-child-tx", createdOn: 21 }
                  })
                )
            })
            return yield* commit(write).pipe(Effect.ensuring(mutate))
          })
      }
      const directOperations =
        scenario === "direct-contradiction"
          ? {
              ...operations,
              inspectMovementTransactions: () =>
                Effect.succeed(
                  inspectionFrom({
                    discovery: "complete",
                    transactions: [
                      {
                        txId: "own-record-tx",
                        transactionClass: "core:class:TxUpdateDoc",
                        objectId: record._id,
                        objectClass: record._class,
                        objectSpace: f.source._id,
                        modifiedOn: 21,
                        modifiedBy: record.modifiedBy,
                        operations: { space: f.destination._id }
                      }
                    ]
                  })
                )
            }
          : operations
      const fiber = yield* moveIssue(params).pipe(
        Effect.provide(HulyClient.testLayer(directOperations)),
        Effect.forkChild
      )
      yield* TestClock.adjust("2 seconds")
      const result = yield* Fiber.join(fiber)
      expect(f.state.sent).toBe(1)
      if (scenario === "invalid-repeat") {
        expect(["incomplete", "indeterminate"]).toContain(result.outcome)
        expect(yield* Ref.get(evidenceCalls)).toBeGreaterThan(1)
      } else if (scenario === "acknowledged" || scenario === "transaction-connection-outage")
        expect(result.outcome).toBe("completed")
      else if (scenario === "reply-lost")
        expect(result).toMatchObject({
          outcome: "indeterminate",
          execution: { commit: "reply-lost" },
          verification: { consistency: "consistent" }
        })
      else if (
        scenario === "foreign-history" ||
        scenario === "later-metadata" ||
        scenario === "changed-creator" ||
        scenario === "direct-contradiction"
      )
        expect(result).toMatchObject({ outcome: "incomplete", verification: { consistency: "inconsistent" } })
      else expect(result).toMatchObject({ outcome: "indeterminate", verification: { consistency: "undetermined" } })
    })
  )
}
