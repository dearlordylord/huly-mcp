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

const TreeRowsSchema = Schema.Struct({ rows: Schema.Array(Schema.Unknown), total: Count })
const parseRows = (input: unknown) =>
  Schema.decodeUnknownEffect(TreeRowsSchema)(input).pipe(
    Effect.mapError((cause) => new HulyDataInvalidError({ operation: "move_issue", entity: "tree attachments", cause }))
  )

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
    const rows: Array<MovementIssue> = []
    for (const input of parsed.rows) {
      const issue = Schema.decodeUnknownOption(MovementIssueSchema)(input)
      if (issue._tag === "None")
        reasons.push("An attached task payload is invalid; usable siblings are inspected independently.")
      else rows.push(issue.value)
    }
    const capacity = inventory.length + rows.length > MAX_TRANSFER_TASKS
    if (parsed.total !== parsed.rows.length || capacity)
      reasons.push(
        `Attachment discovery is incomplete or exceeds the ${MAX_TRANSFER_TASKS}-task safety limit; no prefix can move.`
      )
    inventory.push(...rows.slice(0, MAX_TRANSFER_TASKS - inventory.length))
    const tree = discoverTransferTree(root, inventory)
    if (!tree.complete) reasons.push(...tree.reasons)
    if (capacity) return { complete: false, issues: tree.issues, reasons: [...new Set(reasons)] }
    pending = rows.filter((issue) => !visited.has(issue._id))
    for (const issue of pending) visited.add(issue._id)
  }
  const tree = discoverTransferTree(root, inventory)
  return reasons.length === 0 ? tree : { complete: false, issues: tree.issues, reasons: [...new Set(reasons)] }
})
