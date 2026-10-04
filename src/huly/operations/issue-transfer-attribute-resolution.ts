import type { MoveIssueParams } from "../../domain/schemas/issue-movement.js"
import type { MovementIssue } from "../../domain/schemas/issue-movement-state.js"
import type { TransferConflict, TransferIssue } from "../../domain/schemas/issue-transfer.js"
import {
  MAX_SUPPORTED_ATTRIBUTE_VALUES,
  type TransferAttributeChange,
  type TransferComponentValue,
  type TransferMilestoneValue
} from "../../domain/schemas/issue-transfer-attributes.js"

// Parsed internal snapshots; resolution never performs I/O or mutates the task.
export type AttributeInventory =
  | {
      readonly field: "component"
      readonly source: ReadonlyArray<TransferComponentValue>
      readonly destination: ReadonlyArray<TransferComponentValue>
      readonly complete: boolean
    }
  | {
      readonly field: "milestone"
      readonly source: ReadonlyArray<TransferMilestoneValue>
      readonly destination: ReadonlyArray<TransferMilestoneValue>
      readonly complete: boolean
    }
export const resolveTransferAttributes = (
  root: MovementIssue,
  issue: TransferIssue,
  inventories: ReadonlyArray<AttributeInventory>,
  resolutions: MoveIssueParams["resolutions"]
) => {
  const conflicts: Array<TransferConflict> = []
  const changes: Array<TransferAttributeChange> = []
  const supplied = resolutions ?? []
  const seen = new Set<string>()
  for (const resolution of supplied) {
    const key = `${resolution.issueId}:${resolution.field}`
    if (seen.has(key) || resolution.issueId !== root._id)
      conflicts.push({
        code: "invalid-resolution",
        issueId: root._id,
        identifier: root.identifier,
        reason: `Duplicate or out-of-tree resolution ${key}. Consent must address one field on a moved task.`
      })
    seen.add(key)
  }
  for (const inventory of inventories) {
    const result = resolveField(
      root,
      issue,
      inventory,
      supplied.find((entry) => entry.issueId === root._id && entry.field === inventory.field)
    )
    if (result !== undefined) {
      if ("code" in result) conflicts.push(result)
      else changes.push(result)
    }
  }
  return { conflicts, changes, complete: inventories.every((inventory) => inventory.complete) }
}

type Resolution = NonNullable<MoveIssueParams["resolutions"]>[number]
type AttributeDecision = TransferConflict | TransferAttributeChange | undefined
type ConflictFactory = (
  code: "attribute" | "stale-resolution" | "invalid-resolution" | "discovery",
  reason: string
) => TransferConflict

const resolveField = (
  root: MovementIssue,
  issue: TransferIssue,
  inventory: AttributeInventory,
  resolution: Resolution | undefined
): AttributeDecision => {
  const { field, source } = inventory
  const from = issue[field] ?? null
  const sourceName = source.find((value) => value._id === from)?.label
  const conflict: ConflictFactory = (code, reason) => attributeConflict(root, inventory, from, sourceName, code, reason)
  if (from === null) return absentDecision(inventory, resolution, conflict)
  const stale = staleDecision(inventory, from, resolution, conflict)
  if (stale !== undefined) return stale
  if (!inventory.complete)
    return conflict(
      "discovery",
      `Incomplete ${field} inventory; the ${MAX_SUPPORTED_ATTRIBUTE_VALUES}-value per-project response limit or invalid/truncated SDK data prevents a uniqueness proof and complete candidates. No writes permitted.`
    )
  if (resolution !== undefined) return resolveExplicit(root, inventory, from, resolution, conflict)
  return resolveAutomatic(root, inventory, from, sourceName, conflict)
}

const attributeConflict = (
  root: MovementIssue,
  inventory: AttributeInventory,
  from: TransferIssue["component"],
  sourceName: string | undefined,
  code: Parameters<ConflictFactory>[0],
  reason: string
): TransferConflict => {
  const identity = { issueId: root._id, identifier: root.identifier, reason }
  if (from == null) {
    return inventory.field === "component"
      ? {
          ...identity,
          code: "stale-resolution",
          from: null,
          clearingAllowed: false,
          field: inventory.field,
          candidates: inventory.destination
        }
      : {
          ...identity,
          code: "stale-resolution",
          from: null,
          clearingAllowed: false,
          field: inventory.field,
          candidates: inventory.destination
        }
  }
  const current = { ...identity, code, from, ...(sourceName === undefined ? {} : { sourceName }) }
  return inventory.field === "component"
    ? { ...current, clearingAllowed: true, field: inventory.field, candidates: inventory.destination }
    : { ...current, clearingAllowed: true, field: inventory.field, candidates: inventory.destination }
}

const resolveExplicit = (
  root: MovementIssue,
  inventory: AttributeInventory,
  from: TransferIssue["component"],
  resolution: Resolution,
  conflict: ConflictFactory
): AttributeDecision => {
  if (resolution.to === null)
    return { issueId: root._id, field: inventory.field, from: resolution.from, to: null, reason: "explicit-clear" }
  const replacement = inventory.destination.find((value) => value._id === resolution.to)
  if (replacement === undefined)
    return conflict(
      "invalid-resolution",
      `Replacement ${resolution.to} is not a valid destination ${inventory.field}. Use a candidate ID or null.`
    )
  if (resolution.to === from) return undefined
  return {
    issueId: root._id,
    field: inventory.field,
    from: resolution.from,
    to: replacement._id,
    reason: "explicit-replacement"
  }
}

const resolveAutomatic = (
  root: MovementIssue,
  inventory: AttributeInventory,
  from: NonNullable<TransferIssue["component"]>,
  sourceName: string | undefined,
  conflict: ConflictFactory
): AttributeDecision => {
  if (inventory.destination.some((value) => value._id === from)) return undefined
  const matches = sourceName === undefined ? [] : inventory.destination.filter((value) => value.label === sourceName)
  const match = matches.length === 1 ? matches[0] : undefined
  if (match !== undefined)
    return { issueId: root._id, field: inventory.field, from, to: match._id, reason: "exact-name" }
  return conflict(
    "attribute",
    `Unresolved ${inventory.field}. Retry the original destination with resolutions [{issueId:'${root._id}',field:'${inventory.field}',from:'${from}',to:<candidate stable ID or null>}]. Matching is literal and unique; create missing values separately if desired.`
  )
}

const staleGuidance = (
  field: AttributeInventory["field"],
  expected: Resolution["from"],
  from: TransferIssue["component"]
) =>
  from == null
    ? `Stale ${field} resolution: expected ${expected}; current value is null/unset. Omit this resolution on retry; absent fields require no consent and from cannot be null. nextCall omits the obsolete decision.`
    : `Stale ${field} resolution: expected ${expected}; current value is ${from}. nextCall omits the obsolete decision. If still needed, add fresh consent with this current from ID and a valid destination to ID or null.`

const staleDecision = (
  inventory: AttributeInventory,
  from: TransferIssue["component"],
  resolution: Resolution | undefined,
  conflict: ConflictFactory
): TransferConflict | undefined =>
  resolution !== undefined && resolution.from !== from
    ? conflict("stale-resolution", staleGuidance(inventory.field, resolution.from, from))
    : undefined

const absentDecision = (
  inventory: AttributeInventory,
  resolution: Resolution | undefined,
  conflict: ConflictFactory
): AttributeDecision =>
  resolution === undefined
    ? undefined
    : conflict("stale-resolution", staleGuidance(inventory.field, resolution.from, null))
