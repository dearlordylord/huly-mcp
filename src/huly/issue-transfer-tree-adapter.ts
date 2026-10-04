import type { Issue } from "@hcengineering/tracker"
import type { TxOperations } from "@hcengineering/core"
import type { TransferTreeTaskWrite, TransferTreeWrite } from "../domain/schemas/issue-transfer-tree.js"
import { HulyTransactionScope, type HulyConditionalWriteResult } from "../domain/schemas/shared.js"
import { tracker } from "./huly-plugins.js"
import { queueTransferRootCounts, queueTransferTask } from "./issue-transfer-adapter.js"
import { hulyQuery } from "./operations/query-helpers.js"
import { toRef } from "./operations/sdk-boundary.js"

export const commitTransferTree = async (
  client: TxOperations,
  write: TransferTreeWrite
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
    await queueTransferTask(apply, task)
  }
  await queueTransferRootCounts(apply, root)
  return (await apply.commit()).result ? "applied" : "condition-not-met"
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
