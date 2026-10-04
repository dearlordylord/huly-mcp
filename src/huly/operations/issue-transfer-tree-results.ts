import type { MovementProject } from "../../domain/schemas/issue-movement-state.js"
import type { TransferTreeWrite } from "../../domain/schemas/issue-transfer-tree.js"
import type { MoveIssueResult } from "../../domain/schemas/issues-results.js"
import { DocId, UrlString } from "../../domain/schemas/shared.js"
import { movementNoParent } from "./issue-movement-hierarchy.js"
import type { TransferPlan } from "./issue-transfer-preflight.js"
import { transferTreeKnownRecordIds, transferTreeOwnedRecordGuidance } from "./issue-transfer-tree-recovery.js"
import type { HulyClient } from "../client.js"

export const transferTreeInspectionGuidance = (prepared: TransferPlan, destination: MovementProject) =>
  `Inspect every stable ID before retry: ${prepared.plan.tree.map((issue) => `MCP get_issue ${JSON.stringify({ project: destination.identifier, identifier: issue._id })}; CLI huly issues get ${destination.identifier} ${issue._id} --json`).join("; ")}. Stable-ID lookup searches the workspace. Do not automatically repeat movement; reserved numbers may leave gaps. ${transferTreeOwnedRecordGuidance(prepared, destination)}`

export const transferTreeFailure = (
  outcome: "incomplete" | "indeterminate",
  reason: string,
  prepared: TransferPlan,
  destination: MovementProject
): MoveIssueResult => ({
  outcome,
  reason,
  recordIds: transferTreeKnownRecordIds(prepared),
  issueIds: prepared.plan.tree.map((issue) => issue._id),
  inspection: transferTreeInspectionGuidance(prepared, destination)
})

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
  outcome: "completed",
  changed: true,
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
