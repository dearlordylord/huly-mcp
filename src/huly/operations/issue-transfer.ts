import { Effect } from "effect"
import type { MoveIssueParams } from "../../domain/schemas/issue-movement.js"
import type { MovementIssue, MovementProject } from "../../domain/schemas/issue-movement-state.js"
import type { MoveIssueResult } from "../../domain/schemas/issues-results.js"
import type { HulyClient } from "../client.js"
import type { MovementError } from "./issue-movement-preflight.js"
import { inspectTransferPlan } from "./issue-transfer-preflight.js"
import { transferRetryCall } from "./issue-transfer-retry.js"
import { executeTransferTree } from "./issue-transfer-tree-execution.js"

const guidance = (root: MovementIssue, destination: MovementProject) =>
  `Inspect stable ID with MCP get_issue ${JSON.stringify({ project: destination.identifier, identifier: root._id })} or CLI huly issues get ${destination.identifier} ${root._id} --json. Stable-ID lookup searches the workspace. Do not automatically repeat movement; sequence gaps may remain.`

export const transferIssue = Effect.fn("transferIssue")(function* (
  client: HulyClient["Service"],
  root: MovementIssue,
  parent: MovementIssue | undefined,
  source: MovementProject,
  destination: MovementProject,
  params: MoveIssueParams
): Effect.fn.Return<MoveIssueResult, MovementError> {
  const inspection = guidance(root, destination)
  const preparedResult = yield* Effect.result(inspectTransferPlan(client, root, parent, source, destination, params))
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
    const issueIds = prepared.issueIds ?? [root._id]
    return {
      outcome: "blocked",
      changed: false,
      reason: `${prepared.conflicts.map((entry) => entry.reason).join(" ")} ${prepared.limitation}`,
      discovery: prepared.discovery ?? "incomplete",
      nextCall: transferRetryCall(params, root._id, prepared.conflicts, issueIds),
      conflicts: prepared.conflicts,
      destinationId: destination._id,
      issueIds,
      inspection
    }
  }
  return yield* executeTransferTree(client, prepared, destination, params)
})
