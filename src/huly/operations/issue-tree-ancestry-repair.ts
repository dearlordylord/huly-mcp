import type { Space } from "@hcengineering/core"
import type { Issue as SdkIssue } from "@hcengineering/tracker"
import { Effect } from "effect"

import { type MovementIssue, parseMovementIssue } from "../../domain/schemas/issue-movement-state.js"
import type { HulyClient, HulyClientError } from "../client.js"
import { HulyDataInvalidError } from "../errors-base.js"
import { tracker } from "../huly-plugins.js"
import { movementHierarchy, movementNoParent } from "./issue-movement-hierarchy.js"
import { reconcileIssueTree } from "./issue-tree-reconciliation.js"
import { hulyQuery } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"

const LINEAGE_LIMIT = 1_000

type RepairError = HulyClientError | HulyDataInvalidError

// Internal outcome; update_issue renders an incomplete repair as an agent warning.
export type AncestryRepairOutcome =
  | { readonly _tag: "Repaired"; readonly repaired: number }
  | { readonly _tag: "Incomplete"; readonly reason: string }

const parseLineageIssue = (input: SdkIssue | undefined) =>
  parseMovementIssue(input).pipe(
    Effect.mapError(
      (cause) => new HulyDataInvalidError({ operation: "update_issue", entity: "issue hierarchy", cause })
    )
  )

const loadAncestors = Effect.fn("issues.loadAncestors")(function* (
  client: HulyClient["Service"],
  issue: MovementIssue
): Effect.fn.Return<ReadonlyArray<MovementIssue> | undefined, RepairError> {
  const ancestors: Array<MovementIssue> = []
  const seen = new Set([issue._id])
  let next = issue.attachedTo
  while (next !== movementNoParent) {
    if (seen.has(next) || ancestors.length >= LINEAGE_LIMIT) return undefined
    seen.add(next)
    const raw = yield* client.findOne<SdkIssue>(
      tracker.class.Issue,
      hulyQuery<SdkIssue>({ _id: toRef<SdkIssue>(next) })
    )
    if (raw === undefined) return undefined
    const ancestor = yield* parseLineageIssue(raw)
    ancestors.push(ancestor)
    next = ancestor.attachedTo
  }
  return ancestors
})

// Walks `attachedTo` level by level; Huly's `parents.parentId` filter is not reliable on every backend.
const loadDescendants = Effect.fn("issues.loadDescendants")(function* (
  client: HulyClient["Service"],
  issue: MovementIssue
): Effect.fn.Return<ReadonlyArray<MovementIssue> | undefined, RepairError> {
  const descendants: Array<MovementIssue> = []
  let frontier: ReadonlyArray<MovementIssue> = [issue]
  while (frontier.length > 0) {
    const children = yield* client.findAll<SdkIssue>(
      tracker.class.Issue,
      hulyQuery<SdkIssue>({ attachedTo: { $in: frontier.map((parent) => toRef<SdkIssue>(parent._id)) } }),
      { limit: LINEAGE_LIMIT + 1, total: true }
    )
    if (children.total !== children.length || descendants.length + children.length > LINEAGE_LIMIT) return undefined
    frontier = yield* Effect.forEach(children, parseLineageIssue)
    descendants.push(...frontier)
  }
  return descendants
})

/**
 * Rewrites `parents` for `issue` and its subtree from the `attachedTo` chain.
 * `observed` overrides fields just written to `issue`, since Huly reads may lag the write.
 */
export const repairIssueTreeAncestry = Effect.fn("issues.repairTreeAncestry")(function* (
  client: HulyClient["Service"],
  issueId: SdkIssue["_id"],
  observed: Partial<Pick<MovementIssue, "title">>
): Effect.fn.Return<AncestryRepairOutcome, RepairError> {
  const raw = yield* client.findOne<SdkIssue>(tracker.class.Issue, hulyQuery<SdkIssue>({ _id: issueId }))
  if (raw === undefined) return { _tag: "Incomplete", reason: "Issue is not readable after update." }
  const issue = { ...(yield* parseLineageIssue(raw)), ...observed }
  const ancestors = yield* loadAncestors(client, issue)
  if (ancestors === undefined) return { _tag: "Incomplete", reason: "Ancestor chain is unreadable or cyclic." }
  const descendants = yield* loadDescendants(client, issue)
  if (descendants === undefined)
    return { _tag: "Incomplete", reason: `Subtree exceeds ${LINEAGE_LIMIT} issues or discovery is incomplete.` }
  const repairs = reconcileIssueTree(movementHierarchy([...ancestors, issue, ...descendants]), issue)
  yield* Effect.forEach(
    repairs,
    (repair) =>
      client.updateDoc(tracker.class.Issue, toRef<Space>(repair.space), toRef<SdkIssue>(repair.issueId), {
        parents: repair.parents.map((parent) => ({
          parentId: toRef<SdkIssue>(parent.parentId),
          parentTitle: parent.parentTitle,
          identifier: parent.identifier,
          space: toRef<Space>(parent.space)
        }))
      }),
    { discard: true }
  )
  return { _tag: "Repaired", repaired: repairs.length }
})
