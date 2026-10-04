import type { Issue } from "@hcengineering/tracker"
import { Effect, Schema } from "effect"
import { MovementIssueSchema, type MovementIssue } from "../../domain/schemas/issue-movement-state.js"
import { Count } from "../../domain/schemas/shared.js"
import type { HulyClient } from "../client.js"
import { HulyDataInvalidError } from "../errors-base.js"
import { tracker } from "../huly-plugins.js"
import type { MovementError } from "./issue-movement-preflight.js"
import { hulyQuery } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"
import { discoverTransferTree, MAX_TRANSFER_TASKS, type TransferTree } from "./issue-transfer-tree.js"

const TreeRowsSchema = Schema.Struct({ rows: Schema.Array(Schema.Unknown), total: Schema.Unknown })
const parseRows = (input: unknown) =>
  Schema.decodeUnknownEffect(TreeRowsSchema)(input).pipe(
    Effect.mapError((cause) => new HulyDataInvalidError({ operation: "move_issue", entity: "tree attachments", cause }))
  )

const parseAttachmentRows = (inputs: ReadonlyArray<unknown>) => {
  const rows: Array<MovementIssue> = []
  const reasons: Array<string> = []
  for (const input of inputs) {
    const issue = Schema.decodeUnknownOption(MovementIssueSchema)(input)
    if (issue._tag === "None")
      reasons.push("An attached task payload is invalid; usable siblings are inspected independently.")
    else rows.push(issue.value)
  }
  return { rows, reasons }
}

const attachmentDiscoveryProblem = (totalInput: unknown, rawCount: number, capacity: boolean): string | undefined => {
  const total = Schema.decodeUnknownOption(Count)(totalInput)
  return total._tag === "None" || total.value !== rawCount || capacity
    ? `Attachment discovery is incomplete or exceeds the ${MAX_TRANSFER_TASKS}-task safety limit; no prefix can move.`
    : undefined
}

const discoveredTreeResult = (tree: TransferTree, reasons: ReadonlyArray<string>): TransferTree =>
  reasons.length === 0 ? tree : { complete: false, issues: tree.issues, reasons: [...new Set(reasons)] }

export const inspectTransferTree = Effect.fn("transfer.inspectTree")(function* (
  client: HulyClient["Service"],
  root: MovementIssue
): Effect.fn.Return<TransferTree, MovementError> {
  const inventory = [root]
  const reasons: Array<string> = []
  const visited = new Set([root._id])
  let pending: ReadonlyArray<MovementIssue> = [root]
  while (pending.length > 0) {
    // No space predicate: foreign-project descendants are inconsistency evidence.
    const raw = yield* client.findAll<Issue>(
      tracker.class.Issue,
      hulyQuery<Issue>({ attachedTo: { $in: pending.map((issue) => toRef<Issue>(issue._id)) } }),
      { limit: MAX_TRANSFER_TASKS + 1, total: true }
    )
    const parsed = yield* parseRows({ rows: raw, total: raw.total })
    const observation = parseAttachmentRows(parsed.rows)
    reasons.push(...observation.reasons)
    const { rows } = observation
    const capacity = inventory.length + rows.length > MAX_TRANSFER_TASKS
    const problem = attachmentDiscoveryProblem(parsed.total, parsed.rows.length, capacity)
    if (problem !== undefined) reasons.push(problem)
    inventory.push(...rows.slice(0, MAX_TRANSFER_TASKS - inventory.length))
    const tree = discoverTransferTree(root, inventory)
    if (!tree.complete) reasons.push(...tree.reasons)
    if (capacity) return discoveredTreeResult(tree, reasons)
    pending = rows.filter((issue) => !visited.has(issue._id))
    for (const issue of pending) visited.add(issue._id)
  }
  return discoveredTreeResult(discoverTransferTree(root, inventory), reasons)
})
