import type { Issue, Project } from "@hcengineering/tracker"
import type { ProjectType, TaskType } from "@hcengineering/task"
import { Effect, Schema } from "effect"
import type { MoveIssueParams } from "../../domain/schemas/issue-movement.js"
import {
  TransferIssueSchema,
  TransferProjectSchema,
  TransferWorkflowSchema,
  TransferKindSchema,
  type TransferInspection,
  type TransferConflict,
  type TransferIssue
} from "../../domain/schemas/issue-transfer.js"
import type { MovementIssue, MovementProject } from "../../domain/schemas/issue-movement-state.js"
import { HulyDataInvalidError } from "../errors-base.js"
import type { HulyClient } from "../client.js"
import { task, tracker } from "../huly-plugins.js"
import { toRef } from "./sdk-boundary.js"
import { hulyQuery } from "./query-helpers.js"
import { ancestorsOf, hierarchyProblem, movementHierarchy, type MovementHierarchy } from "./issue-movement-hierarchy.js"
import {
  inspectMovementClosure,
  inspectMovementProject,
  type MovementError,
  type MovementPlan
} from "./issue-movement-preflight.js"

// Internal proof carrying parsed snapshots; it is not an I/O payload.
export interface TransferPlan {
  readonly plan: MovementPlan
  readonly protectedIssue: TransferIssue
  readonly records: TransferInspection
}
export interface TransferRefusal {
  readonly conflicts: ReadonlyArray<TransferConflict>
  readonly limitation: TransferInspection["limitation"]
}
const parse = <S extends Schema.Top>(schema: S, input: unknown) =>
  Schema.decodeUnknownEffect(schema)(input).pipe(
    Effect.mapError(
      (cause) => new HulyDataInvalidError({ operation: "move_issue", entity: "transfer preflight", cause })
    )
  )
const conflict = (
  root: MovementIssue,
  code: TransferConflict["code"],
  reason: TransferConflict["reason"]
): TransferConflict => ({ code, issueId: root._id, identifier: root.identifier, reason })
const related = (hierarchy: MovementHierarchy, root: MovementIssue, parent: MovementIssue | undefined) => [
  root,
  ...(ancestorsOf(hierarchy, root) ?? []),
  ...(parent === undefined ? [] : [parent, ...(ancestorsOf(hierarchy, parent) ?? [])])
]

const hierarchyConflicts = (
  root: MovementIssue,
  hierarchy: MovementHierarchy,
  relevant: ReadonlyArray<MovementIssue>
) => {
  const conflicts: Array<TransferConflict> = []
  if (hierarchy.issues.some((issue) => issue.attachedTo === root._id))
    conflicts.push(
      conflict(
        root,
        "unsupported-structure",
        "Only leaf issues can cross projects in this slice; descendants are unsupported."
      )
    )
  for (const issue of relevant) {
    const observed = hierarchy.byId.get(issue._id)
    if (observed === undefined || observed.modifiedOn !== issue.modifiedOn)
      conflicts.push(conflict(root, "discovery", `Issue changed during inspection: ${issue._id}.`))
    const problem = hierarchyProblem(hierarchy, issue)
    if (problem !== undefined) conflicts.push(conflict(root, "discovery", problem))
  }
  return conflicts
}

const projectConflicts = (
  client: HulyClient["Service"],
  root: MovementIssue,
  source: Schema.Schema.Type<typeof TransferProjectSchema>,
  destination: Schema.Schema.Type<typeof TransferProjectSchema>
) => {
  const conflicts: Array<TransferConflict> = []
  if (source.type !== destination.type)
    conflicts.push(
      conflict(
        root,
        "workflow",
        "Requires equal project types. Select a destination with the source project type; no kind/status conversion is available."
      )
    )
  if (destination.archived) conflicts.push(conflict(root, "authorization", "Destination project is archived."))
  if (source.restricted || destination.restricted)
    conflicts.push(
      conflict(
        root,
        "authorization",
        "Restricted project permissions are unsupported in this slice; select unrestricted projects."
      )
    )
  if (destination.private && !destination.members.includes(String(client.getAccountUuid())))
    conflicts.push(
      conflict(
        root,
        "authorization",
        "Private destination project membership is required. Movement never grants membership."
      )
    )
  return conflicts
}

const workflowConflicts = (
  root: MovementIssue,
  parent: TransferIssue | undefined,
  issue: TransferIssue,
  projectType: Schema.Schema.Type<typeof TransferProjectSchema>["type"],
  workflow: Schema.Schema.Type<typeof TransferWorkflowSchema>,
  kind: Schema.Schema.Type<typeof TransferKindSchema>
) => {
  const conflicts: Array<TransferConflict> = []
  if (!workflow.tasks.includes(issue.kind) || kind.parent !== projectType)
    conflicts.push(
      conflict(root, "workflow", `Kind ${issue.kind} is unsupported. Select a project supporting the current kind.`)
    )
  if (
    !kind.statuses.includes(issue.status) ||
    !workflow.statuses.some((status) => status._id === issue.status && status.taskType === issue.kind)
  )
    conflicts.push(
      conflict(
        root,
        "workflow",
        `Status ${issue.status} is unsupported for kind ${issue.kind}. Select a compatible destination; status cannot be cleared or converted.`
      )
    )
  return [...conflicts, ...parentKindConflicts(root, parent, kind)]
}

const parentKindConflicts = (
  root: MovementIssue,
  parent: TransferIssue | undefined,
  kind: Schema.Schema.Type<typeof TransferKindSchema>
) => {
  const conflicts: Array<TransferConflict> = []
  if (parent === undefined && kind.kind === "subtask")
    conflicts.push(conflict(root, "workflow", "This kind requires a destination parent."))
  if (parent !== undefined && kind.kind === "task")
    conflicts.push(conflict(root, "workflow", "This kind must remain at project top level."))
  if (parent !== undefined && kind.allowedAsChildOf !== undefined && !kind.allowedAsChildOf.includes(parent.kind))
    conflicts.push(conflict(root, "workflow", `Kind is not allowed under destination parent kind ${parent.kind}.`))
  return conflicts
}

const attributeConflicts = (root: MovementIssue, issue: TransferIssue, params: MoveIssueParams) => {
  const conflicts: Array<TransferConflict> = []
  if (issue.component != null)
    conflicts.push(
      conflict(
        root,
        "unsupported-attribute",
        `Unsupported component reference ${issue.component}; component resolution is deferred.`
      )
    )
  if (issue.milestone != null)
    conflicts.push(
      conflict(
        root,
        "unsupported-attribute",
        `Unsupported milestone reference ${issue.milestone}; milestone resolution is deferred.`
      )
    )
  if (params.resolutions !== undefined)
    conflicts.push(
      conflict(
        root,
        "invalid-resolution",
        "Resolutions are unsupported for this compatible-leaf slice; omit resolutions."
      )
    )
  return conflicts
}

const availableWorkflowConflicts = (
  root: MovementIssue,
  parent: TransferIssue | undefined,
  issue: TransferIssue,
  projectType: Schema.Schema.Type<typeof TransferProjectSchema>["type"],
  workflow: Schema.Schema.Type<typeof TransferWorkflowSchema> | undefined,
  kind: Schema.Schema.Type<typeof TransferKindSchema> | undefined
) =>
  workflow === undefined || kind === undefined
    ? [
        conflict(
          root,
          "workflow",
          "Destination workflow metadata unavailable; select a project supporting the current kind and status."
        )
      ]
    : workflowConflicts(root, parent, issue, projectType, workflow, kind)

const inspectWorkflow = Effect.fn("transfer.inspectWorkflow")(function* (
  client: HulyClient["Service"],
  root: MovementIssue,
  parent: MovementIssue | undefined,
  source: MovementProject,
  destination: MovementProject,
  params: MoveIssueParams
): Effect.fn.Return<
  { readonly protectedIssue: TransferIssue; readonly conflicts: ReadonlyArray<TransferConflict> },
  MovementError
> {
  const raw = yield* client.findOne<Issue>(tracker.class.Issue, hulyQuery<Issue>({ _id: toRef<Issue>(root._id) }))
  const protectedIssue = yield* parse(TransferIssueSchema, raw)
  const sourceData = yield* parse(
    TransferProjectSchema,
    yield* client.findOne<Project>(tracker.class.Project, hulyQuery<Project>({ _id: toRef<Project>(source._id) }))
  )
  const destinationData = yield* parse(
    TransferProjectSchema,
    yield* client.findOne<Project>(tracker.class.Project, hulyQuery<Project>({ _id: toRef<Project>(destination._id) }))
  )
  const workflow = yield* parse(
    Schema.UndefinedOr(TransferWorkflowSchema),
    yield* client.findOne<ProjectType>(
      task.class.ProjectType,
      hulyQuery<ProjectType>({ _id: toRef<ProjectType>(destinationData.type) })
    )
  )
  const kind = yield* parse(
    Schema.UndefinedOr(TransferKindSchema),
    yield* client.findOne<TaskType>(
      task.class.TaskType,
      hulyQuery<TaskType>({ _id: toRef<TaskType>(protectedIssue.kind) })
    )
  )
  const parentIssue =
    parent === undefined
      ? undefined
      : yield* parse(
          TransferIssueSchema,
          yield* client.findOne<Issue>(tracker.class.Issue, hulyQuery<Issue>({ _id: toRef<Issue>(parent._id) }))
        )
  const conflicts = [
    ...projectConflicts(client, root, sourceData, destinationData),
    ...availableWorkflowConflicts(root, parentIssue, protectedIssue, destinationData.type, workflow, kind),
    ...attributeConflicts(root, protectedIssue, params)
  ]
  if (raw?.modifiedOn !== root.modifiedOn)
    conflicts.push(conflict(root, "discovery", "Root changed during inspection."))
  return { protectedIssue, conflicts }
})

export const inspectTransferPlan = Effect.fn("transfer.inspectPlan")(function* (
  client: HulyClient["Service"],
  root: MovementIssue,
  parent: MovementIssue | undefined,
  source: MovementProject,
  destination: MovementProject,
  params: MoveIssueParams
): Effect.fn.Return<TransferPlan | TransferRefusal, MovementError> {
  const inspectRecords = client.inspectTransferRecords
  if (inspectRecords === undefined || client.commitTransfer === undefined)
    return {
      conflicts: [conflict(root, "discovery", "Transfer adapter unavailable; no writes performed.")],
      limitation: "Inspection unavailable."
    }
  const sourceHierarchy = yield* inspectMovementProject(client, root)
  const destinationHierarchy = yield* inspectMovementProject(client, { ...root, space: destination._id })
  if (sourceHierarchy === undefined || destinationHierarchy === undefined)
    return {
      conflicts: [conflict(root, "discovery", "Incomplete project discovery.")],
      limitation: "No complete conflict inventory."
    }
  const hierarchy = movementHierarchy([...sourceHierarchy.issues, ...destinationHierarchy.issues])
  const relevant = related(hierarchy, root, parent)
  const closureProblem = yield* inspectMovementClosure(client, hierarchy, relevant)
  const workflow = yield* inspectWorkflow(client, root, parent, source, destination, params)
  const records = yield* inspectRecords(root._id)
  const conflicts = [
    ...hierarchyConflicts(root, hierarchy, relevant),
    ...workflow.conflicts,
    ...records.blockers.map((reason) => conflict(root, "unsupported-structure", reason)),
    ...records.records
      .filter((record) => record.space !== root.space)
      .map((record) =>
        conflict(
          root,
          "discovery",
          `Owned record ${record._id} is already in another project; inspect inconsistent movement state.`
        )
      )
  ]
  if (closureProblem !== undefined) conflicts.push(conflict(root, "discovery", closureProblem))
  if (conflicts.length > 0) return { conflicts, limitation: records.limitation }
  return { plan: { root, parent, source, tree: [root], relevant }, protectedIssue: workflow.protectedIssue, records }
})
