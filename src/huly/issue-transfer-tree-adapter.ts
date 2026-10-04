import { Option, Schema } from "effect"
import { HulyDataInvalidError } from "./errors-base.js"
import { MovementTransactionsSchema, type MovementTransactions } from "./issue-movement-transactions.js"
import type { Issue } from "@hcengineering/tracker"
import type { TxOperations } from "@hcengineering/core"
import type { TransferTreeTaskWrite, TransferTreeWrite } from "../domain/schemas/issue-transfer-tree.js"
import { HulyTransactionScope, type HulyConditionalWriteResult } from "../domain/schemas/shared.js"
import { tracker } from "./huly-plugins.js"
import { queueTransferRootCounts, queueTransferTask } from "./issue-transfer-adapter.js"
import { hulyQuery } from "./operations/query-helpers.js"
import { toRef, toClassRef } from "./operations/sdk-boundary.js"

export const commitTransferTree = async (
  client: TxOperations,
  write: TransferTreeWrite,
  publishQueuedTransactions?: (transactions: MovementTransactions) => Promise<void>
): Promise<HulyConditionalWriteResult> => {
  const apply = client.apply(HulyTransactionScope.make(`issue-transfer:${write.rootId}`))
  const root = write.tasks.find((task) => task.issueId === write.rootId)
  if (root === undefined) return "condition-not-met"
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
  if (publishQueuedTransactions !== undefined) await publishQueuedTransactions(parseQueuedTransactions(apply))
  return (await apply.commit()).result ? "applied" : "condition-not-met"
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

const parseQueuedTransactions = (apply: ReturnType<TxOperations["apply"]>): MovementTransactions => {
  const input: unknown = apply.txes
    .filter((tx) => String(tx._class) === "core:class:TxUpdateDoc" && String(tx.objectClass) === "tracker:class:Issue")
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
  const parsed = Schema.decodeUnknownOption(MovementTransactionsSchema)(input)
  if (Option.isNone(parsed))
    throw new HulyDataInvalidError({ operation: "move_issue", entity: "queued movement transactions" })
  return parsed.value
}
