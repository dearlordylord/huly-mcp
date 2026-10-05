import { isDeepStrictEqual } from "node:util"

import { makeRank } from "@hcengineering/rank"
import type { MovementIssue, MovementProject } from "../../domain/schemas/issue-movement-state.js"
import type { TransferTreeWrite } from "../../domain/schemas/issue-transfer-tree.js"
import { IssueIdentifier, NonEmptyString, type PositiveInteger } from "../../domain/schemas/shared.js"
import type { TransferPlan } from "./issue-transfer-preflight.js"
import { transferTreeParent } from "./issue-transfer-tree.js"
import { movementHierarchy } from "./issue-movement-hierarchy.js"
import { canonicalParents } from "./issue-tree-reconciliation.js"

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
    const sameProject = destination._id === prepared.plan.source._id
    const rank = sameProject ? task.protectedIssue.rank : NonEmptyString.make(makeRank(previousRank, undefined))
    tasks.push({
      issueId: task.issue._id,
      sourceId: prepared.plan.source._id,
      destinationId: destination._id,
      previousParent: task.issue.attachedTo,
      parentId: transferTreeParent(task.issue, prepared.plan.root, prepared.plan.parent),
      modifiedOn: task.issue.modifiedOn,
      number,
      identifier: sameProject ? task.issue.identifier : IssueIdentifier.make(`${destination.identifier}-${number}`),
      rank,
      records: task.records,
      recordClasses: task.recordClasses,
      treeIssueIds: prepared.tasks.map((snapshot) => snapshot.issue._id),
      attributeChanges: prepared.attributeChanges.filter((change) => change.issueId === task.issue._id),
      expectedIssue: task.protectedIssue,
      expectedHierarchy: task.issue,
      finalParents: []
    })
    previousRank = rank
  }
  const movedIds = new Set(tasks.map((task) => task.issueId))
  const ancestors = [
    ...new Map(
      prepared.plan.relevant.filter((issue) => !movedIds.has(issue._id)).map((issue) => [issue._id, issue])
    ).values()
  ]
  return finalizeAncestry(prepared.plan.root._id, tasks, ancestors)
}

const finalizeAncestry = (
  rootId: TransferTreeWrite["rootId"],
  tasks: TransferTreeWrite["tasks"],
  ancestors: TransferTreeWrite["ancestors"]
): TransferTreeWrite | undefined => {
  const planned = tasks.map(plannedIssue)
  const hierarchy = movementHierarchy([...ancestors, ...planned])
  const finalTasks: Array<TransferTreeWrite["tasks"][number]> = []
  for (const [index, task] of tasks.entries()) {
    const issue = planned[index]
    const parents = issue === undefined ? undefined : canonicalParents(hierarchy, issue)
    if (parents === undefined) return undefined
    finalTasks.push({ ...task, finalParents: parents })
  }
  return { rootId, tasks: finalTasks, ancestors }
}

const plannedIssue = (task: TransferTreeWrite["tasks"][number]): MovementIssue => ({
  ...task.expectedHierarchy,
  attachedTo: task.parentId,
  identifier: task.identifier,
  space: task.destinationId
})

/** True when the plan rewrites a stale `parents` cache even if no task changes placement. */
export const writeRepairsAncestry = (write: TransferTreeWrite): boolean =>
  write.tasks.some((task) => !isDeepStrictEqual(task.expectedHierarchy.parents, task.finalParents))
