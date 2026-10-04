import type { MovementProject } from "../../domain/schemas/issue-movement-state.js"
import type { MovementUncertaintyEvidence } from "../../domain/schemas/issue-movement-uncertainty.js"
import type { MoveIssueResult } from "../../domain/schemas/issues-results.js"
import type { IssueId } from "../../domain/schemas/shared.js"
import type { MovementPlan } from "./issue-movement-preflight.js"

export const movementRecoveryInstructions = (
  plan: MovementPlan,
  destination: MovementProject,
  issueIds: ReadonlyArray<IssueId> = plan.tree.map((issue) => issue._id)
) =>
  `Inspect every stable ID before retry: ${issueIds
    .map(
      (issueId) =>
        `MCP get_issue ${JSON.stringify({ project: destination.identifier, identifier: issueId })}; CLI huly issues get ${destination.identifier} ${issueId} --json`
    )
    .join(
      "; "
    )}. Stable-ID lookup searches the workspace and returns each task's current project. Historical identifier mappings are not reconstructed from uncertain replies. Do not automatically repeat movement or roll back subsequent edits; reserved numbers may leave gaps.`

export const movementFailureResult = (
  outcome: "incomplete" | "indeterminate",
  reason: Extract<MoveIssueResult, { readonly outcome: "incomplete" | "indeterminate" }>["reason"],
  plan: MovementPlan,
  destination: MovementProject,
  evidence: Pick<MovementUncertaintyEvidence, "execution" | "verification">
): MoveIssueResult => {
  const issueIds = [
    ...new Set([
      ...plan.tree.map((issue) => issue._id),
      ...(evidence.verification.status === "observed" ? evidence.verification.tasks.map((task) => task.issueId) : [])
    ])
  ]
  return {
    outcome,
    reason,
    issueIds,
    destination: { projectId: destination._id, parentId: plan.parent?._id ?? null },
    discovery: { status: "complete" },
    ...evidence,
    inspection: movementRecoveryInstructions(plan, destination, issueIds)
  }
}
