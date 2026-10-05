import { transferTreeKnownRecordIds, transferTreeOwnedRecordGuidance } from "./issue-transfer-owned-recovery.js"
import type { MovementUncertaintyEvidence } from "../../domain/schemas/issue-movement-uncertainty.js"
import { movementRecoveryInstructions, movementFailureResult } from "./issue-movement-recovery.js"
import type { MovementProject } from "../../domain/schemas/issue-movement-state.js"
import type { TransferTreeWrite } from "../../domain/schemas/issue-transfer-tree.js"
import type { MoveIssueResult } from "../../domain/schemas/issues-results.js"
import { DocId, UrlString } from "../../domain/schemas/shared.js"
import { movementNoParent } from "./issue-movement-hierarchy.js"
import type { TransferPlan } from "./issue-transfer-preflight.js"
import { writeRepairsAncestry } from "./issue-transfer-tree-planning.js"
import type { HulyClient } from "../client.js"

export const transferTreeInspectionGuidance = (prepared: TransferPlan, destination: MovementProject) =>
  movementRecoveryInstructions(prepared.plan, destination)

export const transferTreeFailure = (
  outcome: "incomplete" | "indeterminate",
  reason: string,
  prepared: TransferPlan,
  destination: MovementProject,
  evidence: Pick<MovementUncertaintyEvidence, "execution" | "verification">
): MoveIssueResult => {
  const failure = movementFailureResult(outcome, reason, prepared.plan, destination, evidence)
  return {
    ...failure,
    recordIds: transferTreeKnownRecordIds(prepared),
    inspection: `${failure.inspection} ${transferTreeOwnedRecordGuidance(prepared, destination)}`
  }
}

export const transferTreeRefusal = (
  reason: string,
  prepared: TransferPlan,
  destination: MovementProject
): MoveIssueResult => ({
  outcome: "blocked",
  changed: false,
  discovery: "incomplete",
  destinationId: destination._id,
  reason,
  issueIds: prepared.plan.tree.map((issue) => issue._id),
  inspection: transferTreeInspectionGuidance(prepared, destination)
})

export const completedTransferTreeResult = (
  client: HulyClient["Service"],
  prepared: TransferPlan,
  destination: MovementProject,
  write: TransferTreeWrite
): MoveIssueResult => ({
  ...(prepared.plan.root.space === destination._id &&
  prepared.plan.root.attachedTo === (prepared.plan.parent?._id ?? movementNoParent) &&
  !writeRepairsAncestry(write)
    ? ({ outcome: "no-op", changed: false } as const)
    : ({ outcome: "completed", changed: true } as const)),
  issueId: prepared.plan.root._id,
  projectId: DocId.make(destination._id),
  parentId: prepared.plan.parent?._id ?? null,
  attributeChanges: prepared.attributeChanges,
  tasks: write.tasks.map((task) => ({
    issueId: task.issueId,
    previousIdentifier: task.expectedHierarchy.identifier,
    identifier: task.identifier,
    parentId: task.parentId === movementNoParent ? null : task.parentId,
    url: UrlString.make(
      `${client.workbenchUrlConfig.baseUrl.replace(/\/+$/, "")}/workbench/${client.workbenchUrlConfig.workspaceUrlSlug}/tracker/${encodeURIComponent(task.identifier)}`
    )
  }))
})
