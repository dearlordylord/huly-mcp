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

const indexTransferAttachments = (inventory: ReadonlyArray<MovementIssue>) => {
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
  return { children, reasons }
}

// Internal traversal accumulator: mutation is local to the deterministic walk.
interface TransferTraversal {
  readonly issues: Array<MovementIssue>
  readonly visited: Set<IssueId>
  readonly reasons: Array<string>
}

const appendTransferChild = (root: MovementIssue, child: MovementIssue, traversal: TransferTraversal): boolean => {
  if (traversal.visited.has(child._id)) {
    traversal.reasons.push(`Cycle or duplicate traversal at ${child._id}; inspect attachments before retry.`)
    return false
  }
  traversal.visited.add(child._id)
  if (child.space !== root.space)
    traversal.reasons.push(`Descendant ${child._id} is in another project; inspect partially moved tree before retry.`)
  if (traversal.issues.length >= MAX_TRANSFER_TASKS) {
    traversal.reasons.push(`Tree exceeds the supported ${MAX_TRANSFER_TASKS}-task response limit; no prefix can move.`)
    return true
  }
  traversal.issues.push(child)
  return false
}

export const discoverTransferTree = (root: MovementIssue, inventory: ReadonlyArray<MovementIssue>): TransferTree => {
  const { children, reasons } = indexTransferAttachments(inventory)
  const traversal: TransferTraversal = { issues: [root], visited: new Set([root._id]), reasons }
  for (const parent of traversal.issues) {
    for (const child of children.get(parent._id) ?? []) {
      if (appendTransferChild(root, child, traversal)) return { complete: false, issues: traversal.issues, reasons }
    }
  }
  return reasons.length === 0
    ? { complete: true, issues: traversal.issues }
    : { complete: false, issues: traversal.issues, reasons }
}

export const transferTreeParent = (
  issue: MovementIssue,
  root: MovementIssue,
  destinationParent: MovementIssue | undefined
): IssueId => (issue._id === root._id ? (destinationParent?._id ?? movementNoParent) : issue.attachedTo)
