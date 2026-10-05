import { isDeepStrictEqual } from "node:util"

import type { MovementIssue as Issue } from "../../domain/schemas/issue-movement-state.js"
import type { DocId, IssueId } from "../../domain/schemas/shared.js"

import { ancestorsOf, descendantsOf, type MovementHierarchy } from "./issue-movement-hierarchy.js"

/**
 * Huly denormalizes every ancestor's id, identifier, title and space into
 * `Issue.parents`. The `attachedTo` chain is the source of truth; `parents` is a
 * cache that Huly's own triggers fail to refresh on some backends (renames and
 * reparents leave descendants stale). Every write path derives `parents` here.
 */
export type IssueAncestry = Issue["parents"]

// Internal write instruction; callers translate it into an SDK update.
export interface AncestryRepair {
  readonly issueId: IssueId
  readonly space: DocId
  readonly parents: IssueAncestry
}

export const canonicalParents = (hierarchy: MovementHierarchy, issue: Issue): IssueAncestry | undefined =>
  ancestorsOf(hierarchy, issue)?.map((parent) => ({
    parentId: parent._id,
    identifier: parent.identifier,
    parentTitle: parent.title,
    space: parent.space
  }))

/** Ancestry repairs for `root` and its whole subtree; unresolvable chains are skipped. */
export const reconcileIssueTree = (hierarchy: MovementHierarchy, root: Issue): ReadonlyArray<AncestryRepair> =>
  descendantsOf(hierarchy, root).flatMap((issue) => {
    const parents = canonicalParents(hierarchy, issue)
    return parents === undefined || isDeepStrictEqual(issue.parents, parents)
      ? []
      : [{ issueId: issue._id, space: issue.space, parents }]
  })
