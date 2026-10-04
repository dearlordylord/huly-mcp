import type { Issue, Project } from "@hcengineering/tracker"
import type { ProjectType, TaskType } from "@hcengineering/task"
import { Effect, Schema } from "effect"
import {
  TransferIssueSchema,
  TransferProjectSchema,
  TransferWorkflowSchema,
  TransferKindSchema,
  type TransferIssue,
  type TransferConflict
} from "../../domain/schemas/issue-transfer.js"
import type { MovementIssue, MovementProject } from "../../domain/schemas/issue-movement-state.js"
import type { HulyClient } from "../client.js"
import { task, tracker } from "../huly-plugins.js"
import { hulyQuery } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"
import type { MovementError } from "./issue-movement-preflight.js"
import { parseTransferSnapshot, transferConflict } from "./issue-transfer-preflight-values.js"

const projectConflicts = (
  client: HulyClient["Service"],
  root: MovementIssue,
  source: Schema.Schema.Type<typeof TransferProjectSchema>,
  destination: Schema.Schema.Type<typeof TransferProjectSchema>
) => {
  const conflicts: Array<TransferConflict> = []
  if (source.type !== destination.type)
    conflicts.push(
      transferConflict(
        root,
        "workflow",
        "Requires equal project types. Select a destination with the source project type; no kind/status conversion is available."
      )
    )
  if (destination.archived) conflicts.push(transferConflict(root, "authorization", "Destination project is archived."))
  if (source.restricted || destination.restricted)
    conflicts.push(
      transferConflict(
        root,
        "authorization",
        "Restricted project permissions are unsupported in this slice; select unrestricted projects."
      )
    )
  if (destination.private && !destination.members.includes(client.getAccountUuid()))
    conflicts.push(
      transferConflict(
        root,
        "authorization",
        "Private destination project membership is required. Movement never grants membership."
      )
    )
  return conflicts
}

// Internal observation proof: absence is distinct from a failed concrete-parent read.
type TransferParentObservation =
  | { readonly status: "absent" }
  | { readonly status: "available"; readonly issue: TransferIssue }
  | { readonly status: "unavailable" }

const inspectTransferParent = Effect.fn("transfer.inspectParent")(function* (
  client: HulyClient["Service"],
  parent: MovementIssue | undefined
): Effect.fn.Return<TransferParentObservation> {
  if (parent === undefined) return { status: "absent" }
  const observation = yield* Effect.result(
    Effect.gen(function* () {
      return yield* parseTransferSnapshot(
        TransferIssueSchema,
        yield* client.findOne<Issue>(tracker.class.Issue, hulyQuery<Issue>({ _id: toRef<Issue>(parent._id) }))
      )
    })
  )
  return observation._tag === "Success"
    ? { status: "available", issue: observation.success }
    : { status: "unavailable" }
})

const workflowConflicts = (
  root: MovementIssue,
  parent: TransferParentObservation,
  issue: TransferIssue,
  projectType: Schema.Schema.Type<typeof TransferProjectSchema>["type"],
  workflow: Schema.Schema.Type<typeof TransferWorkflowSchema>,
  kind: Schema.Schema.Type<typeof TransferKindSchema>
) => {
  const conflicts: Array<TransferConflict> = []
  if (!workflow.tasks.includes(issue.kind) || kind.parent !== projectType)
    conflicts.push(
      transferConflict(
        root,
        "workflow",
        `Kind ${issue.kind} is unsupported. Select a project supporting the current kind.`
      )
    )
  if (
    !kind.statuses.includes(issue.status) ||
    !workflow.statuses.some((status) => status._id === issue.status && status.taskType === issue.kind)
  )
    conflicts.push(
      transferConflict(
        root,
        "workflow",
        `Status ${issue.status} is unsupported for kind ${issue.kind}. Select a compatible destination; status cannot be cleared or converted.`
      )
    )
  return parent.status === "unavailable"
    ? conflicts
    : [...conflicts, ...parentKindConflicts(root, parent.status === "available" ? parent.issue : undefined, kind)]
}

const parentKindConflicts = (
  root: MovementIssue,
  parent: TransferIssue | undefined,
  kind: Schema.Schema.Type<typeof TransferKindSchema>
) => {
  const conflicts: Array<TransferConflict> = []
  if (parent === undefined && kind.kind === "subtask")
    conflicts.push(transferConflict(root, "workflow", "This kind requires a destination parent."))
  if (parent !== undefined && kind.kind === "task")
    conflicts.push(transferConflict(root, "workflow", "This kind must remain at project top level."))
  if (parent !== undefined && kind.allowedAsChildOf !== undefined && !kind.allowedAsChildOf.includes(parent.kind))
    conflicts.push(
      transferConflict(root, "workflow", `Kind is not allowed under destination parent kind ${parent.kind}.`)
    )
  return conflicts
}

const availableWorkflowConflicts = (
  root: MovementIssue,
  parent: TransferParentObservation,
  issue: TransferIssue,
  projectType: Schema.Schema.Type<typeof TransferProjectSchema>["type"],
  workflow: Schema.Schema.Type<typeof TransferWorkflowSchema> | undefined,
  kind: Schema.Schema.Type<typeof TransferKindSchema> | undefined
) =>
  workflow === undefined || kind === undefined
    ? [
        transferConflict(
          root,
          "workflow",
          "Destination workflow metadata unavailable; select a project supporting the current kind and status."
        )
      ]
    : workflowConflicts(root, parent, issue, projectType, workflow, kind)

export const inspectTransferWorkflow = Effect.fn("transfer.inspectWorkflow")(function* (
  client: HulyClient["Service"],
  root: MovementIssue,
  parent: MovementIssue | undefined,
  source: MovementProject,
  destination: MovementProject
): Effect.fn.Return<
  { readonly protectedIssue: TransferIssue; readonly conflicts: ReadonlyArray<TransferConflict> },
  MovementError
> {
  const raw = yield* client.findOne<Issue>(tracker.class.Issue, hulyQuery<Issue>({ _id: toRef<Issue>(root._id) }))
  const protectedIssue = yield* parseTransferSnapshot(TransferIssueSchema, raw)
  const sourceData = yield* parseTransferSnapshot(
    TransferProjectSchema,
    yield* client.findOne<Project>(tracker.class.Project, hulyQuery<Project>({ _id: toRef<Project>(source._id) }))
  )
  const destinationData = yield* parseTransferSnapshot(
    TransferProjectSchema,
    yield* client.findOne<Project>(tracker.class.Project, hulyQuery<Project>({ _id: toRef<Project>(destination._id) }))
  )
  const workflow = yield* parseTransferSnapshot(
    Schema.UndefinedOr(TransferWorkflowSchema),
    yield* client.findOne<ProjectType>(
      task.class.ProjectType,
      hulyQuery<ProjectType>({ _id: toRef<ProjectType>(destinationData.type) })
    )
  )
  const kind = yield* parseTransferSnapshot(
    Schema.UndefinedOr(TransferKindSchema),
    yield* client.findOne<TaskType>(
      task.class.TaskType,
      hulyQuery<TaskType>({ _id: toRef<TaskType>(protectedIssue.kind) })
    )
  )
  const parentObservation = yield* inspectTransferParent(client, parent)
  const conflicts = [
    ...projectConflicts(client, root, sourceData, destinationData),
    ...availableWorkflowConflicts(root, parentObservation, protectedIssue, destinationData.type, workflow, kind)
  ]
  if (parentObservation.status === "unavailable")
    conflicts.push(
      transferConflict(
        root,
        "discovery",
        "Parent protected payload is unavailable; this task's independently parsed attributes and workflow remain inspected."
      )
    )
  if (raw?.modifiedOn !== root.modifiedOn)
    conflicts.push(transferConflict(root, "discovery", "Root changed during inspection."))
  return { protectedIssue, conflicts }
})
