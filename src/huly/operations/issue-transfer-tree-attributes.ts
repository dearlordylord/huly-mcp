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

const unavailableTaskConsent = (
  discoveredIssue: MovementIssue,
  resolution: NonNullable<MoveIssueParams["resolutions"]>[number]
): TransferConflict => ({
  code: "invalid-resolution",
  issueId: resolution.issueId,
  identifier: discoveredIssue.identifier,
  reason:
    "This task's protected payload is unavailable; its expected value and replacement consent cannot be admitted. Reinspect the stable task ID before retry."
})

const inspectTreeResolutions = (
  root: MovementIssue,
  tasks: ReadonlyArray<TransferTaskSnapshot>,
  discovered: ReadonlyArray<MovementIssue>,
  resolutions: MoveIssueParams["resolutions"]
): Array<TransferConflict> => {
  const conflicts: Array<TransferConflict> = []
  const parsedIds = new Set(tasks.map((task) => task.issue._id))
  const seen = new Set<string>()
  for (const resolution of resolutions ?? []) {
    const key = `${resolution.issueId}:${resolution.field}`
    const discoveredIssue = discovered.find((issue) => issue._id === resolution.issueId)
    if (seen.has(key) || discoveredIssue === undefined)
      conflicts.push({
        code: "invalid-resolution",
        issueId: root._id,
        identifier: root.identifier,
        reason: `Duplicate or out-of-tree resolution ${key}. Consent applies only to the addressed task and expected value.`
      })
    if (discoveredIssue !== undefined && !parsedIds.has(resolution.issueId))
      conflicts.push(unavailableTaskConsent(discoveredIssue, resolution))
    seen.add(key)
  }
  return conflicts
}

export const resolveTransferTreeAttributes = (
  root: MovementIssue,
  tasks: ReadonlyArray<TransferTaskSnapshot>,
  inventories: ReadonlyArray<AttributeInventory>,
  resolutions: MoveIssueParams["resolutions"],
  discovered: ReadonlyArray<MovementIssue> = tasks.map((task) => task.issue)
) => {
  const conflicts = inspectTreeResolutions(root, tasks, discovered, resolutions)
  const changes: Array<TransferAttributeChange> = []
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
