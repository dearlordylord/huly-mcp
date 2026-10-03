import type { MovementIssue as Issue } from "../../domain/schemas/issue-movement-state.js"
import { IssueId, ObjectClassName } from "../../domain/schemas/shared.js"

import { tracker } from "../huly-plugins.js"

const LAST_ANCESTOR = -1
export const movementNoParent = IssueId.make(String(tracker.ids.NoParent))

// Internal projections of SDK documents; these are not serialized payload contracts.
export interface MovementHierarchy {
  readonly issues: ReadonlyArray<Issue>
  readonly byId: ReadonlyMap<IssueId, Issue>
}

export const movementHierarchy = (issues: ReadonlyArray<Issue>): MovementHierarchy => ({
  issues,
  byId: new Map(issues.map((issue) => [issue._id, issue]))
})

export const ancestorsOf = (hierarchy: MovementHierarchy, issue: Issue): ReadonlyArray<Issue> | undefined => {
  const ancestors: Array<Issue> = []
  const visited = new Set([issue._id])
  for (const current of ancestorsWithRoot(hierarchy, issue)) {
    if (visited.has(current._id)) return undefined
    visited.add(current._id)
    ancestors.push(current)
  }
  const last = ancestors.at(LAST_ANCESTOR) ?? issue
  return last.attachedTo === movementNoParent ? ancestors : undefined
}

function* ancestorsWithRoot(hierarchy: MovementHierarchy, issue: Issue): Generator<Issue> {
  const seen = new Set<IssueId>()
  let current = hierarchy.byId.get(issue.attachedTo)
  while (current !== undefined && !seen.has(current._id)) {
    seen.add(current._id)
    yield current
    current = hierarchy.byId.get(current.attachedTo)
  }
  if (current !== undefined) yield current
}

export const descendantsOf = (hierarchy: MovementHierarchy, root: Issue): ReadonlyArray<Issue> => {
  const discovered = new Map([[root._id, root]])
  const pending = [root]
  for (const parent of pending) {
    for (const child of hierarchy.issues.filter((issue) => issue.attachedTo === parent._id)) {
      if (discovered.has(child._id)) continue
      discovered.set(child._id, child)
      pending.push(child)
    }
  }
  return [...discovered.values()]
}

const sameParents = (actual: Issue["parents"], expected: ReadonlyArray<Issue>): boolean =>
  actual.length === expected.length &&
  actual.every((info, index) => {
    const parent = expected[index]
    return (
      parent !== undefined &&
      info.parentId === parent._id &&
      info.identifier === parent.identifier &&
      info.parentTitle === parent.title &&
      info.space === parent.space
    )
  })

const childInformationMatches = (hierarchy: MovementHierarchy, issue: Issue): boolean => {
  const descendants = descendantsOf(hierarchy, issue).filter((child) => child._id !== issue._id)
  return (
    issue.childInfo.length === descendants.length &&
    descendants.every((child) =>
      issue.childInfo.some(
        (info) =>
          info.childId === child._id && info.estimation === child.estimation && info.reportedTime === child.reportedTime
      )
    )
  )
}

export const hierarchyProblem = (hierarchy: MovementHierarchy, issue: Issue): string | undefined => {
  const ancestors = ancestorsOf(hierarchy, issue)
  if (ancestors === undefined) return `Missing ancestor or cycle at ${issue._id}`
  if (issue.attachedToClass !== ObjectClassName.make(String(tracker.class.Issue)) || issue.collection !== "subIssues") {
    return `Invalid collection attachment at ${issue._id}`
  }
  if (!sameParents(issue.parents, ancestors)) return `Inconsistent ancestry at ${issue._id}`
  const children = hierarchy.issues.filter((child) => child.attachedTo === issue._id)
  if (children.length !== issue.subIssues) return `Inconsistent child count at ${issue._id}`
  if (!childInformationMatches(hierarchy, issue)) return `Inconsistent time/estimation aggregate at ${issue._id}`
  return undefined
}
