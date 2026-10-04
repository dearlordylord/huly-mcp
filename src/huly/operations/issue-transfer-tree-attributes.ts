import type { MoveIssueParams } from "../../domain/schemas/issue-movement.js"
import type { MovementIssue } from "../../domain/schemas/issue-movement-state.js"
import type { TransferConflict, TransferIssue } from "../../domain/schemas/issue-transfer.js"
import type { TransferAttributeChange } from "../../domain/schemas/issue-transfer-attributes.js"
import { resolveTransferAttributes, type AttributeInventory } from "./issue-transfer-attribute-resolution.js"

// Internal pairing of independently parsed hierarchy and protected issue snapshots.
export interface TransferTaskSnapshot {
  readonly issue: MovementIssue
  readonly protectedIssue: TransferIssue
}

export const resolveTransferTreeAttributes = (
  root: MovementIssue,
  tasks: ReadonlyArray<TransferTaskSnapshot>,
  inventories: ReadonlyArray<AttributeInventory>,
  resolutions: MoveIssueParams["resolutions"]
) => {
  const conflicts: Array<TransferConflict> = []
  const changes: Array<TransferAttributeChange> = []
  const ids = new Set(tasks.map((task) => task.issue._id))
  const seen = new Set<string>()
  for (const resolution of resolutions ?? []) {
    const key = `${resolution.issueId}:${resolution.field}`
    if (seen.has(key) || !ids.has(resolution.issueId))
      conflicts.push({
        code: "invalid-resolution",
        issueId: root._id,
        identifier: root.identifier,
        reason: `Duplicate or out-of-tree resolution ${key}. Consent applies only to the addressed task and expected value.`
      })
    seen.add(key)
  }
  for (const task of tasks) {
    const resolved = resolveTransferAttributes(
      task.issue,
      task.protectedIssue,
      inventories,
      resolutions?.filter((resolution) => resolution.issueId === task.issue._id)
    )
    conflicts.push(...resolved.conflicts)
    changes.push(...resolved.changes)
  }
  return { conflicts, changes, complete: inventories.every((inventory) => inventory.complete) }
}
