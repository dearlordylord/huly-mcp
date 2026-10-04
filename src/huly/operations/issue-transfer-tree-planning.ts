import { makeRank } from "@hcengineering/rank"
import type { MovementProject } from "../../domain/schemas/issue-movement-state.js"
import type { TransferTreeWrite } from "../../domain/schemas/issue-transfer-tree.js"
import { IssueIdentifier, NonEmptyString, type PositiveInteger } from "../../domain/schemas/shared.js"
import type { TransferPlan } from "./issue-transfer-preflight.js"
import { transferTreeParent } from "./issue-transfer-tree.js"

export const planTransferTreeWrites = (
  prepared: TransferPlan,
  destination: MovementProject,
  numbers: ReadonlyArray<PositiveInteger>,
  lastRank: string | undefined
): TransferTreeWrite | undefined => {
  if (numbers.length !== prepared.tasks.length || new Set(numbers).size !== numbers.length) return undefined
  const tasks: Array<TransferTreeWrite["tasks"][number]> = []
  let previousRank = lastRank
  for (const [index, task] of prepared.tasks.entries()) {
    const number = numbers[index]
    if (number === undefined) return undefined
    const rank = NonEmptyString.make(makeRank(previousRank, undefined))
    tasks.push({
      issueId: task.issue._id,
      sourceId: prepared.plan.source._id,
      destinationId: destination._id,
      previousParent: task.issue.attachedTo,
      parentId: transferTreeParent(task.issue, prepared.plan.root, prepared.plan.parent),
      modifiedOn: task.issue.modifiedOn,
      number,
      identifier: IssueIdentifier.make(`${destination.identifier}-${number}`),
      rank,
      records: task.records,
      recordClasses: task.recordClasses,
      attributeChanges: prepared.attributeChanges.filter((change) => change.issueId === task.issue._id),
      expectedIssue: task.protectedIssue,
      expectedHierarchy: task.issue
    })
    previousRank = rank
  }
  const movedIds = new Set(tasks.map((task) => task.issueId))
  return {
    rootId: prepared.plan.root._id,
    tasks,
    ancestors: [
      ...new Map(
        prepared.plan.relevant.filter((issue) => !movedIds.has(issue._id)).map((issue) => [issue._id, issue])
      ).values()
    ]
  }
}
