import type { MoveIssueParams } from "../../domain/schemas/issue-movement.js"
import type { MovementIssue } from "../../domain/schemas/issue-movement-state.js"
import type { TransferConflict, TransferIssue } from "../../domain/schemas/issue-transfer.js"
import type {
  TransferAttributeChange,
  TransferAttributeField,
  TransferAttributeValue
} from "../../domain/schemas/issue-transfer-attributes.js"

// Parsed internal snapshots; resolution never performs I/O or mutates the task.
export interface AttributeInventory {
  readonly field: TransferAttributeField
  readonly source: ReadonlyArray<TransferAttributeValue>
  readonly destination: ReadonlyArray<TransferAttributeValue>
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
  const { destination, field, source } = inventory
  const from = issue[field] ?? null
  const sourceName = source.find((value) => value._id === from)?.label
  const conflict: ConflictFactory = (code, reason) => ({
    code,
    issueId: root._id,
    identifier: root.identifier,
    field,
    from,
    ...(sourceName === undefined ? {} : { sourceName }),
    candidates: destination,
    clearingAllowed: true,
    reason
  })
  if (from === null && resolution === undefined) return undefined
  if (!inventory.complete)
    return conflict(
      "discovery",
      `Incomplete ${field} inventory; the 1,000-value per-project response limit or invalid/truncated SDK data prevents a uniqueness proof and complete candidates. No writes permitted.`
    )
  if (resolution !== undefined) return resolveExplicit(root, inventory, from, resolution, conflict)
  return resolveAutomatic(root, inventory, from, sourceName, conflict)
}

const resolveExplicit = (
  root: MovementIssue,
  inventory: AttributeInventory,
  from: TransferIssue["component"],
  resolution: Resolution,
  conflict: ConflictFactory
): AttributeDecision => {
  if (resolution.from !== from)
    return conflict(
      "stale-resolution",
      `Stale ${inventory.field} resolution: expected ${resolution.from}; current value is ${from ?? "null/unset"}. Rebuild consent from current state.`
    )
  const replacement = inventory.destination.find((value) => value._id === resolution.to)
  if (resolution.to !== null && replacement === undefined)
    return conflict(
      "invalid-resolution",
      `Replacement ${resolution.to} is not a valid destination ${inventory.field}. Use a candidate ID or null.`
    )
  if (resolution.to === from) return undefined
  return explicitChange(root, inventory.field, resolution.from, replacement, resolution)
}

const explicitChange = (
  root: MovementIssue,
  field: TransferAttributeField,
  from: NonNullable<TransferIssue["component"]>,
  replacement: TransferAttributeValue | undefined,
  resolution: Resolution
): TransferAttributeChange => ({
  issueId: root._id,
  field,
  from,
  to: replacement?._id ?? null,
  reason: resolution.to === null ? "explicit-clear" : "explicit-replacement"
})

const resolveAutomatic = (
  root: MovementIssue,
  inventory: AttributeInventory,
  from: TransferIssue["component"],
  sourceName: string | undefined,
  conflict: ConflictFactory
): AttributeDecision => {
  if (from == null || inventory.destination.some((value) => value._id === from)) return undefined
  const matches = sourceName === undefined ? [] : inventory.destination.filter((value) => value.label === sourceName)
  const match = matches.length === 1 ? matches[0] : undefined
  if (match !== undefined)
    return { issueId: root._id, field: inventory.field, from, to: match._id, reason: "exact-name" }
  return conflict(
    "attribute",
    `Unresolved ${inventory.field}. Retry the original destination with resolutions [{issueId:'${root._id}',field:'${inventory.field}',from:'${from}',to:<candidate stable ID or null>}]. Matching is literal and unique; create missing values separately if desired.`
  )
}
