import { Result, Schema } from "effect"
import { parseMovementHistoryAttributes } from "./issue-movement-history-attributes.js"
import { HulyDataInvalidError } from "./errors-base.js"
import { MovementTransactionsSchema, type MovementTransactions } from "./issue-movement-transactions.js"
import type { Issue } from "@hcengineering/tracker"
import type { TxOperations } from "@hcengineering/core"
import type { TransferTreeTaskWrite, TransferTreeWrite } from "../domain/schemas/issue-transfer-tree.js"
import { HulyTransactionScope, type HulyConditionalWriteResult } from "../domain/schemas/shared.js"
import { core, tracker } from "./huly-plugins.js"
import { queueTransferRootCounts, queueTransferTask } from "./issue-transfer-adapter.js"
import { hulyQuery } from "./operations/query-helpers.js"
import { toRef, toClassRef } from "./operations/sdk-boundary.js"

export const commitTransferTree = async (
  client: TxOperations,
  write: TransferTreeWrite,
  publishQueuedTransactions?: (transactions: MovementTransactions) => Promise<void>
): Promise<Result.Result<HulyConditionalWriteResult, HulyDataInvalidError>> => {
  const apply = client.apply(HulyTransactionScope.make(`issue-transfer:${write.rootId}`))
  const root = write.tasks.find((task) => task.issueId === write.rootId)
  if (root === undefined) return Result.succeed("condition-not-met")
  const ids = write.tasks.map((task) => toRef<Issue>(task.issueId))
  apply.notMatch(tracker.class.Issue, hulyQuery<Issue>({ attachedTo: { $in: ids }, _id: { $nin: ids } }))
  for (const ancestor of write.ancestors)
    apply.match(
      tracker.class.Issue,
      hulyQuery<Issue>({
        _id: toRef<Issue>(ancestor._id),
        space: toRef(ancestor.space),
        attachedTo: toRef(ancestor.attachedTo),
        modifiedOn: ancestor.modifiedOn,
        estimation: ancestor.estimation,
        reportedTime: ancestor.reportedTime,
        subIssues: ancestor.subIssues
      })
    )
  for (const task of write.tasks) {
    matchProtectedTask(apply, task)
    await queueTransferTask(apply, task, task.finalParents)
  }
  await queueRemovedAncestorInformation(apply, write)
  await queueTransferRootCounts(apply, root)
  if (publishQueuedTransactions !== undefined) {
    const parsed = parseQueuedTransactions(client, apply)
    if (Result.isFailure(parsed)) return Result.fail(parsed.failure)
    await publishQueuedTransactions(parsed.success)
  }
  return Result.succeed((await apply.commit()).result ? "applied" : "condition-not-met")
}

const queueRemovedAncestorInformation = async (
  apply: ReturnType<TxOperations["apply"]>,
  write: TransferTreeWrite
): Promise<void> => {
  for (const ancestor of write.ancestors) {
    const removed = write.tasks
      .filter(
        (task) =>
          task.expectedHierarchy.parents.some((parent) => parent.parentId === ancestor._id) &&
          !task.finalParents.some((parent) => parent.parentId === ancestor._id)
      )
      .map((task) => toRef<Issue>(task.issueId))
    // SDK DocumentUpdate supports an exact childInfo element predicate. Queue
    // every removed ID in the same atomic apply; no broad replacement of childInfo.
    for (const childId of removed)
      await apply.updateDoc(tracker.class.Issue, toRef(ancestor.space), toRef<Issue>(ancestor._id), {
        $pull: { childInfo: { childId } }
      })
  }
}

const matchProtectedTask = (apply: ReturnType<TxOperations["apply"]>, task: TransferTreeTaskWrite) => {
  const original = task.expectedIssue
  apply.match(
    tracker.class.Issue,
    hulyQuery<Issue>({
      _id: toRef<Issue>(task.issueId),
      kind: toRef(original.kind),
      status: toRef(original.status),
      number: original.number,
      rank: original.rank,
      estimation: task.expectedHierarchy.estimation,
      reportedTime: task.expectedHierarchy.reportedTime,
      subIssues: task.expectedHierarchy.subIssues,
      attachedToClass: toClassRef(task.expectedHierarchy.attachedToClass),
      collection: task.expectedHierarchy.collection,
      component:
        original.component === undefined
          ? { $exists: false }
          : original.component === null
            ? null
            : toRef(original.component),
      milestone:
        original.milestone === undefined
          ? { $exists: false }
          : original.milestone === null
            ? null
            : toRef(original.milestone)
    })
  )
}

const parseQueuedTransactions = (
  client: TxOperations,
  apply: ReturnType<TxOperations["apply"]>
): Result.Result<MovementTransactions, HulyDataInvalidError> => {
  const input: unknown = apply.txes
    .filter((tx) => tx._class === core.class.TxUpdateDoc && tx.objectClass === tracker.class.Issue)
    .map((tx) => ({
      txId: tx._id,
      transactionClass: tx._class,
      objectId: tx.objectId,
      objectClass: tx.objectClass,
      objectSpace: tx.objectSpace,
      modifiedOn: tx.modifiedOn,
      modifiedBy: tx.modifiedBy,
      operations: Reflect.get(tx, "operations")
    }))
  const raw = Schema.decodeUnknownResult(
    Schema.Array(
      Schema.Struct({
        txId: Schema.Unknown,
        transactionClass: Schema.Unknown,
        objectId: Schema.Unknown,
        objectClass: Schema.Unknown,
        objectSpace: Schema.Unknown,
        modifiedOn: Schema.Unknown,
        modifiedBy: Schema.Unknown,
        operations: Schema.JsonObject
      })
    )
  )(input)
  if (Result.isFailure(raw))
    return Result.fail(new HulyDataInvalidError({ operation: "move_issue", entity: "queued movement transactions" }))
  const receipts = []
  for (const tx of raw.success) {
    const attributes = parseMovementHistoryAttributes(client.getHierarchy(), tx.operations)
    if (Result.isFailure(attributes)) return Result.fail(attributes.failure)
    receipts.push({ ...tx, historyAttributes: attributes.success })
  }
  const receiptsInput: unknown = receipts
  return Schema.decodeUnknownResult(MovementTransactionsSchema)(receiptsInput).pipe(
    Result.mapError(() => new HulyDataInvalidError({ operation: "move_issue", entity: "queued movement transactions" }))
  )
}
