import { it } from "@effect/vitest"
import { Effect, Fiber, Schema } from "effect"
import { TestClock } from "effect/testing"
import { expect } from "vitest"
import { HulyClient } from "../../../src/huly/client.js"
import {
  MovementTransactionsSchema,
  type MovementTransactionProgress,
  type MovementTransactionReceipt
} from "../../../src/huly/issue-movement-transactions.js"
import type { DocId } from "../../../src/domain/schemas/shared.js"
import { TransferHistoryRecordSchema } from "../../../src/domain/schemas/issue-transfer.js"
import { parseMoveIssueParams } from "../../../src/domain/schemas/issue-movement.js"
import { moveIssue } from "../../../src/huly/operations/issue-movement.js"
import { assertExists } from "../../../src/utils/assertions.js"
import { transferTreeFixture } from "../../helpers/transfer-tree.js"

const parseTransactions = (input: unknown) => Schema.decodeUnknownSync(MovementTransactionsSchema)(input)
const parseHistory = (input: unknown) => Schema.decodeUnknownSync(TransferHistoryRecordSchema)(input)

const scenarios = [
  "acknowledged",
  "same-project",
  "array-delta",
  "reply-lost",
  "no-receipt",
  "different-tx",
  "different-value",
  "different-author",
  "different-time",
  "different-object",
  "different-collection",
  "different-attribute-class",
  "different-created-author",
  "different-created-time",
  "different-update-collection",
  "unexpected-prev-value"
] as const
type HistoryScenario = (typeof scenarios)[number]

for (const scenario of scenarios) {
  it.effect(`movement history correlation: ${scenario}`, () =>
    Effect.gen(function* () {
      const f = transferTreeFixture()
      const commit = assertExists(f.operations.commitTransferTree)
      f.state.failCommit = scenario === "reply-lost"
      const params = yield* parseMoveIssueParams(
        scenario === "same-project" ? { issue: f.input.issue, destination: { parent: null } } : f.input
      )
      const operations = {
        ...f.operations,
        commitTransferTree: (write: Parameters<typeof commit>[0], publish?: MovementTransactionProgress) =>
          Effect.gen(function* () {
            const transactions = parseTransactions(
              write.tasks.map((task) => ({
                txId: `movement-tx-${task.issueId}`,
                transactionClass: "core:class:TxUpdateDoc",
                objectId: task.issueId,
                objectClass: "tracker:class:Issue",
                objectSpace: task.sourceId,
                modifiedOn: 1,
                modifiedBy: "author",
                operations: scenario === "array-delta" ? { parents: task.finalParents } : { attachedTo: task.parentId },
                historyAttributes: [
                  { attrKey: scenario === "array-delta" ? "parents" : "attachedTo", attrClass: "tracker:class:Issue" }
                ]
              }))
            )
            if (scenario !== "no-receipt") yield* assertExists(publish)(transactions)
            const root = assertExists(transactions.find((tx) => tx.objectId === write.rootId))
            const addHistory = Effect.sync(() => {
              f.records.push(makeHistory(root, assertExists(write.tasks[0]).destinationId, scenario))
            })
            return yield* commit(write).pipe(Effect.ensuring(addHistory))
          })
      }
      const fiber = yield* moveIssue(params).pipe(Effect.provide(HulyClient.testLayer(operations)), Effect.forkChild)
      yield* TestClock.adjust("2 seconds")
      const result = yield* Fiber.join(fiber)
      if (scenario === "acknowledged" || scenario === "same-project" || scenario === "array-delta")
        expect(result.outcome).toBe("completed")
      else if (scenario === "reply-lost") {
        expect(result.outcome).toBe("indeterminate")
        if (result.outcome !== "indeterminate") throw new Error("Expected uncertain commit reply")
        expect(result.execution).toMatchObject({ phase: "commit", commit: "reply-lost" })
        expect(result.verification).toMatchObject({ completeness: "complete", consistency: "consistent" })
      } else {
        expect(result.outcome).toBe("incomplete")
        if (result.outcome !== "incomplete") throw new Error("Expected unrelated history refusal")
        expect(result.verification).toMatchObject({ consistency: "inconsistent" })
      }
      expect(f.state.sent).toBe(1)
    })
  )
}

const makeHistory = (transaction: MovementTransactionReceipt, destinationId: DocId, scenario: HistoryScenario) =>
  parseHistory({
    _id: "movement-history",
    _class: "activity:class:DocUpdateMessage",
    kind: "history",
    space: destinationId,
    attachedTo: transaction.objectId,
    attachedToClass: transaction.objectClass,
    collection: scenario === "different-collection" ? "comments" : "docUpdateMessages",
    snapshot: "New server-generated movement history",
    modifiedOn: scenario === "different-time" ? transaction.modifiedOn + 1 : transaction.modifiedOn,
    modifiedBy: scenario === "different-author" ? "later-author" : transaction.modifiedBy,
    history: {
      txId: scenario === "different-tx" ? "later-transaction" : transaction.txId,
      objectId: scenario === "different-object" ? "different-task" : transaction.objectId,
      objectClass: transaction.objectClass,
      action: "update",
      createdOn: scenario === "different-created-time" ? transaction.modifiedOn + 1 : transaction.modifiedOn,
      createdBy: scenario === "different-created-author" ? "other-author" : transaction.modifiedBy,
      ...(scenario === "different-update-collection" ? { updateCollection: "subIssues" } : {}),
      attributeUpdates: JSON.stringify({
        attrKey: scenario === "array-delta" ? "parents" : "attachedTo",
        attrClass: scenario === "different-attribute-class" ? "core:class:TypeString" : transaction.objectClass,
        isMixin: false,
        set:
          scenario === "array-delta"
            ? transaction.operations["parents"]
            : [scenario === "different-value" ? "unrelated-parent" : transaction.operations["attachedTo"]],
        added: [],
        removed: [],
        ...(scenario === "unexpected-prev-value" ? { prevValue: "unrelated-parent" } : {})
      })
    }
  })
