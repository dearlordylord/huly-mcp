import { makeRank } from "@hcengineering/rank"
import type { MovementIssue, MovementProject } from "../../domain/schemas/issue-movement-state.js"
import type { TransferTreeWrite } from "../../domain/schemas/issue-transfer-tree.js"
import { IssueIdentifier, NonEmptyString, type PositiveInteger } from "../../domain/schemas/shared.js"
import type { TransferPlan } from "./issue-transfer-preflight.js"
import { transferTreeParent } from "./issue-transfer-tree.js"
import { movementNoParent } from "./issue-movement-hierarchy.js"

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
  const finalTasks: Array<TransferTreeWrite["tasks"][number]> = []
  for (const task of tasks) {
    const parents = plannedAncestry(task, tasks, ancestors)
    if (parents === undefined) return undefined
    finalTasks.push({ ...task, finalParents: parents })
  }
  return { rootId, tasks: finalTasks, ancestors }
}

const plannedAncestry = (
  task: TransferTreeWrite["tasks"][number],
  tasks: TransferTreeWrite["tasks"],
  ancestors: ReadonlyArray<MovementIssue>
): MovementIssue["parents"] | undefined => {
  const parents: Array<MovementIssue["parents"][number]> = []
  const visited = new Set([task.issueId])
  let parentId = task.parentId
  while (parentId !== movementNoParent) {
    if (visited.has(parentId)) return undefined
    visited.add(parentId)
    const moved = tasks.find((candidate) => candidate.issueId === parentId)
    const existing = ancestors.find((candidate) => candidate._id === parentId)
    if (moved === undefined && existing === undefined) return undefined
    if (moved !== undefined) {
      parents.push({
        parentId,
        identifier: moved.identifier,
        parentTitle: moved.expectedHierarchy.title,
        space: moved.destinationId
      })
      parentId = moved.parentId
    } else if (existing !== undefined) {
      parents.push({ parentId, identifier: existing.identifier, parentTitle: existing.title, space: existing.space })
      parentId = existing.attachedTo
    }
  }
  return parents
}
