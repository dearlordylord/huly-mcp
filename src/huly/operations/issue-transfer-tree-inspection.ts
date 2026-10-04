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

const TreeRowsSchema = Schema.Struct({ rows: Schema.Array(MovementIssueSchema), total: Count })
const parseRows = (input: unknown) =>
  Schema.decodeUnknownEffect(TreeRowsSchema)(input).pipe(
    Effect.mapError((cause) => new HulyDataInvalidError({ operation: "move_issue", entity: "tree attachments", cause }))
  )

export const inspectTransferTree = Effect.fn("transfer.inspectTree")(function* (
  client: HulyClient["Service"],
  root: MovementIssue
): Effect.fn.Return<TransferTree, MovementError> {
  const inventory = [root]
  let pending: ReadonlyArray<MovementIssue> = [root]
  while (pending.length > 0) {
    // No space predicate: foreign-project descendants are inconsistency evidence.
    const raw = yield* client.findAll<Issue>(
      tracker.class.Issue,
      hulyQuery<Issue>({ attachedTo: { $in: pending.map((issue) => toRef<Issue>(issue._id)) } }),
      { limit: MAX_TRANSFER_TASKS + 1, total: true }
    )
    const parsed = yield* parseRows({ rows: raw, total: raw.total })
    if (parsed.total !== parsed.rows.length || inventory.length + parsed.rows.length > MAX_TRANSFER_TASKS)
      return {
        complete: false,
        issues: inventory,
        reasons: [
          `Attachment discovery is incomplete or exceeds the ${MAX_TRANSFER_TASKS}-task safety limit; no prefix can move.`
        ]
      }
    inventory.push(...parsed.rows)
    const tree = discoverTransferTree(root, inventory)
    if (!tree.complete) return tree
    pending = parsed.rows
  }
  return discoverTransferTree(root, inventory)
})
