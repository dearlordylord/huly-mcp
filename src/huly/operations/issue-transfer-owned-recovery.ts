import type { MovementProject } from "../../domain/schemas/issue-movement-state.js"
import { TransferOwnedClasses } from "../../domain/schemas/issue-transfer.js"
import { tracker } from "../huly-plugins.js"
import type { TransferPlan } from "./issue-transfer-preflight.js"

// Known preflight IDs are recovery targets, not claims about observed post-write state.
export const transferTreeKnownRecordIds = (prepared: TransferPlan) => [
  ...new Set(prepared.tasks.flatMap((task) => task.records.map((record) => record._id)))
]

export const transferTreeOwnedRecordGuidance = (prepared: TransferPlan, destination: MovementProject) => {
  const projects = [...new Set([prepared.plan.source.identifier, destination.identifier])]
  const calls = prepared.tasks.flatMap(({ issue, records }) => {
    const object = { objectId: issue._id, objectClass: String(tracker.class.Issue) }
    return [
      `MCP list_activity ${JSON.stringify(object)}`,
      `MCP list_attachments ${JSON.stringify(object)}`,
      ...projects.flatMap((project) => [
        `MCP list_comments ${JSON.stringify({ project, issueIdentifier: issue._id })}`,
        `MCP get_time_report ${JSON.stringify({ project, identifier: issue._id })}`
      ]),
      ...records
        .filter(
          (record) =>
            record._class === TransferOwnedClasses.ChatMessage || record._class === TransferOwnedClasses.ThreadMessage
        )
        .map((record) => `MCP list_attachments ${JSON.stringify({ objectId: record._id, objectClass: record._class })}`)
    ]
  })
  return `Known owned stable record IDs: ${transferTreeKnownRecordIds(prepared).join(", ")}. Inspect supporting records with ${calls.join("; ")}. These IDs came from preflight. Task reads reveal the current project; project-scoped record reads are supplied for both source and destination because the outcome is uncertain. Inspect current state before retry.`
}
