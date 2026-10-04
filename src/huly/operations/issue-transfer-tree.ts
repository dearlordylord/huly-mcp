import type { MovementIssue } from "../../domain/schemas/issue-movement-state.js"
import type { IssueId } from "../../domain/schemas/shared.js"
import { movementNoParent } from "./issue-movement-hierarchy.js"

// One response must contain every mapping and conflict; never transfer a prefix.
export const MAX_TRANSFER_TASKS = 1000
export const MAX_TRANSFER_RECORDS = 10_000
export const MAX_TRANSFER_CONFLICT_ENTRIES = 10_000
export const TRANSFER_DISCOVERY_BUDGET = "10 seconds"
export const TRANSFER_EXECUTION_BUDGET = "30 seconds"

// Internal deterministic inspection result; boundary rows are already schema parsed.
export type TransferTree =
  | { readonly complete: true; readonly issues: ReadonlyArray<MovementIssue> }
  | { readonly complete: false; readonly issues: ReadonlyArray<MovementIssue>; readonly reasons: ReadonlyArray<string> }

export const discoverTransferTree = (root: MovementIssue, inventory: ReadonlyArray<MovementIssue>): TransferTree => {
  const reasons: Array<string> = []
  const children = new Map<IssueId, Array<MovementIssue>>()
  const ids = new Set<IssueId>()
  for (const issue of inventory) {
    if (ids.has(issue._id)) reasons.push(`Duplicate issue snapshot ${issue._id}; inspect stable IDs before retry.`)
    ids.add(issue._id)
    const siblings = children.get(issue.attachedTo) ?? []
    siblings.push(issue)
    children.set(issue.attachedTo, siblings)
  }
  const issues = [root]
  const visited = new Set([root._id])
  for (const parent of issues) {
    for (const child of children.get(parent._id) ?? []) {
      if (visited.has(child._id)) {
        reasons.push(`Cycle or duplicate traversal at ${child._id}; inspect attachments before retry.`)
        continue
      }
      visited.add(child._id)
      if (child.space !== root.space)
        reasons.push(`Descendant ${child._id} is in another project; inspect partially moved tree before retry.`)
      if (issues.length >= MAX_TRANSFER_TASKS)
        return {
          complete: false,
          issues,
          reasons: [
            ...reasons,
            `Tree exceeds the supported ${MAX_TRANSFER_TASKS}-task response limit; no prefix can move.`
          ]
        }
      issues.push(child)
    }
  }
  return reasons.length === 0 ? { complete: true, issues } : { complete: false, issues, reasons }
}

export const transferTreeParent = (
  issue: MovementIssue,
  root: MovementIssue,
  destinationParent: MovementIssue | undefined
): IssueId => (issue._id === root._id ? (destinationParent?._id ?? movementNoParent) : issue.attachedTo)
