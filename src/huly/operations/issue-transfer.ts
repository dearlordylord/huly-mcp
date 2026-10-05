import { movementStableIdReadInstructions } from "./issue-movement-recovery.js"
import { Effect } from "effect"
import type { MoveIssueParams } from "../../domain/schemas/issue-movement.js"
import type { MovementIssue, MovementProject } from "../../domain/schemas/issue-movement-state.js"
import type { MoveIssueResult } from "../../domain/schemas/issues-results.js"
import type { HulyClient } from "../client.js"
import type { MovementError } from "./issue-movement-preflight.js"
import { inspectTransferPlan } from "./issue-transfer-preflight.js"
import { transferRetryCall } from "./issue-transfer-retry.js"
import { executeTransferTree } from "./issue-transfer-tree-execution.js"
import { TRANSFER_DISCOVERY_BUDGET } from "./issue-transfer-tree.js"

export const transferIssue = Effect.fn("transferIssue")(function* (
  client: HulyClient["Service"],
  root: MovementIssue,
  parent: MovementIssue | undefined,
  source: MovementProject,
  destination: MovementProject,
  params: MoveIssueParams
): Effect.fn.Return<MoveIssueResult, MovementError> {
  const inspection = movementStableIdReadInstructions(source, [root._id])
  const preparedResult = yield* Effect.result(
    inspectTransferPlan(client, root, parent, source, destination, params).pipe(
      Effect.timeout(TRANSFER_DISCOVERY_BUDGET)
    )
  )
  if (preparedResult._tag === "Failure")
    return {
      outcome: "blocked",
      changed: false,
      discovery: "incomplete",
      destinationId: destination._id,
      reason: `Pre-write inspection failed: ${preparedResult.failure.message}`,
      issueIds: [root._id],
      inspection
    }
  const prepared = preparedResult.success
  if ("conflicts" in prepared) {
    const issueIds = [...new Set([root._id, ...(prepared.issueIds ?? [])])]
    return {
      outcome: "blocked",
      changed: false,
      reason: `${prepared.conflicts.map((entry) => entry.reason).join(" ")} ${prepared.limitation}`,
      discovery: prepared.discovery ?? "incomplete",
      ...(prepared.destinationParentId === undefined
        ? { nextCall: transferRetryCall(params, root._id, prepared.conflicts, issueIds) }
        : {}),
      conflicts: prepared.conflicts,
      destinationId: destination._id,
      ...(prepared.destinationParentId === undefined ? {} : { destinationParentId: prepared.destinationParentId }),
      issueIds,
      inspection: movementStableIdReadInstructions(source, issueIds)
    }
  }
  return yield* executeTransferTree(client, prepared, destination, params)
})
