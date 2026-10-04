import { it } from "@effect/vitest"
import { Effect, Fiber, Schema } from "effect"
import { TestClock } from "effect/testing"
import { expect } from "vitest"
import { HulyAuthError } from "../../../src/huly/errors-base.js"
import { HulyClient } from "../../../src/huly/client.js"
import { parseMoveIssueParams } from "../../../src/domain/schemas/issue-movement.js"
import { TransferHistoryRecordSchema } from "../../../src/domain/schemas/issue-transfer.js"
import {
  MovementTransactionsSchema,
  MovementTransactionInspectionSchema,
  type MovementTransactionProgress
} from "../../../src/huly/issue-movement-transactions.js"
import { moveIssue } from "../../../src/huly/operations/issue-movement.js"
import { assertExists } from "../../../src/utils/assertions.js"
import { transferTreeFixture } from "../../helpers/transfer-tree.js"

const parseTransactions = (input: unknown) => Schema.decodeUnknownSync(MovementTransactionsSchema)(input)
const parseInspection = (input: unknown) => Schema.decodeUnknownSync(MovementTransactionInspectionSchema)(input)
const parseRecord = (input: unknown) => Schema.decodeUnknownSync(TransferHistoryRecordSchema)(input)
const scenarios = [
  "acknowledged",
  "other-author",
  "reply-lost",
  "missing-transaction",
  "read-outage",
  "wrong-author",
  "wrong-operations",
  "wrong-tx",
  "duplicate-evidence",
  "wrong-class",
  "wrong-source",
  "later-edit",
  "changed-created",
  "changed-content",
  "opaque-wrong-route"
] as const
for (const scenario of scenarios) {
  it.effect(`owned-record migration metadata: ${scenario}`, () =>
    Effect.gen(function* () {
      const f = transferTreeFixture()
      const record = assertExists(f.records[0])
      const snapshot = {
        modifiedOn: record.modifiedOn,
        modifiedBy: record.modifiedBy,
        createdOn: 1,
        createdBy: "original-author",
        content: "protected"
      }
      Object.assign(
        record,
        parseRecord({
          ...record,
          snapshot: scenario === "opaque-wrong-route" ? "opaque protected history" : JSON.stringify(snapshot)
        })
      )
      const commit = assertExists(f.operations.commitTransferTree)
      const params = yield* parseMoveIssueParams(f.input)
      const transactions = parseTransactions([
        {
          target: "record",
          txId: "record-migration-tx",
          transactionClass: "core:class:TxUpdateDoc",
          objectId: record._id,
          objectClass: record._class,
          objectSpace: record.space,
          modifiedOn: 10,
          modifiedBy: scenario === "other-author" ? "current-caller" : record.modifiedBy,
          operations: { space: f.destination._id }
        }
      ])
      const intent = assertExists(transactions[0])
      const { modifiedOn: _queuedTime, ...rawIntent } = intent
      const initialInspection = parseInspection({
        discovery: scenario === "missing-transaction" ? "incomplete" : "complete",
        transactions:
          scenario === "missing-transaction"
            ? []
            : [
                {
                  ...rawIntent,
                  txId: scenario === "wrong-tx" ? "different-tx" : intent.txId,
                  objectClass: scenario === "wrong-class" ? "chunter:class:ChatMessage" : intent.objectClass,
                  objectSpace: scenario === "wrong-source" ? f.destination._id : intent.objectSpace,
                  modifiedOn: 20,
                  modifiedBy: scenario === "wrong-author" ? "different-author" : intent.modifiedBy,
                  operations: scenario === "wrong-operations" ? { space: f.source._id } : intent.operations
                }
              ]
      })
      const persisted =
        scenario === "duplicate-evidence"
          ? parseInspection({
              ...initialInspection,
              transactions: [...initialInspection.transactions, assertExists(initialInspection.transactions[0])]
            })
          : initialInspection
      f.state.failCommit = scenario === "reply-lost"
      const operations = {
        ...f.operations,
        inspectMovementTransactions: () =>
          scenario === "read-outage"
            ? Effect.fail(new HulyAuthError({ message: "Transaction read unavailable" }))
            : Effect.succeed(persisted),
        commitTransferTree: (write: Parameters<typeof commit>[0], publish?: MovementTransactionProgress) =>
          Effect.gen(function* () {
            yield* assertExists(publish)(transactions)
            const update = Effect.sync(() =>
              Object.assign(
                record,
                parseRecord({
                  ...record,
                  modifiedOn: scenario === "later-edit" ? 21 : 20,
                  modifiedBy: intent.modifiedBy,
                  collection: scenario === "opaque-wrong-route" ? "different-collection" : record.collection,
                  snapshot:
                    scenario === "opaque-wrong-route"
                      ? "opaque protected history"
                      : JSON.stringify({
                          ...snapshot,
                          modifiedOn: scenario === "later-edit" ? 21 : 20,
                          modifiedBy: intent.modifiedBy,
                          createdBy: scenario === "changed-created" ? "changed-creator" : snapshot.createdBy,
                          content: scenario === "changed-content" ? "changed" : snapshot.content
                        })
                })
              )
            )
            return yield* commit(write).pipe(Effect.ensuring(update))
          })
      }
      const fiber = yield* moveIssue(params).pipe(Effect.provide(HulyClient.testLayer(operations)), Effect.forkChild)
      yield* TestClock.adjust("2 seconds")
      const result = yield* Fiber.join(fiber)
      expect(f.state.sent).toBe(1)
      if (scenario === "acknowledged" || scenario === "other-author") expect(result.outcome).toBe("completed")
      else if (scenario === "reply-lost") {
        expect(result.outcome).toBe("indeterminate")
        expect(result).toMatchObject({
          verification: { consistency: "consistent" },
          execution: { commit: "reply-lost" }
        })
      } else if (
        scenario === "missing-transaction" ||
        scenario === "read-outage" ||
        scenario === "wrong-author" ||
        scenario === "wrong-operations" ||
        scenario === "wrong-tx" ||
        scenario === "duplicate-evidence" ||
        scenario === "wrong-class" ||
        scenario === "wrong-source"
      ) {
        expect(result.outcome).toBe("indeterminate")
        expect(result).toMatchObject({ verification: { consistency: "undetermined" } })
      } else {
        expect(result.outcome).toBe("incomplete")
        expect(result).toMatchObject({ verification: { consistency: "inconsistent" } })
      }
    })
  )
}
