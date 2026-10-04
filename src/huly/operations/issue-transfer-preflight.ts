import { inspectTransferAttributes } from "./issue-transfer-attribute-inspection.js"
import { isDeepStrictEqual } from "node:util"
import { resolveTransferTreeAttributes, type TransferTaskSnapshot } from "./issue-transfer-tree-attributes.js"
import { inspectTransferTree } from "./issue-transfer-tree-inspection.js"
import { MAX_TRANSFER_RECORDS, MAX_TRANSFER_CONFLICT_ENTRIES } from "./issue-transfer-tree.js"
import type { TransferAttributeChange } from "../../domain/schemas/issue-transfer-attributes.js"
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
  type TransferIssue,
  type TransferSupportedRecord
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
  readonly attributeChanges: ReadonlyArray<TransferAttributeChange>
  readonly protectedIssue: TransferIssue
  readonly records: ReadonlyArray<TransferSupportedRecord>
  readonly recordClasses: TransferInspection["classes"]
  readonly tasks: ReadonlyArray<
    TransferTaskSnapshot & {
      readonly records: ReadonlyArray<TransferSupportedRecord>
      readonly recordClasses: TransferInspection["classes"]
    }
  >
}
export interface TransferRefusal {
  readonly issueIds?: ReadonlyArray<MovementIssue["_id"]>
  readonly conflicts: ReadonlyArray<TransferConflict>
  readonly discovery?: TransferInspection["discovery"]
  readonly limitation: TransferInspection["limitation"]
}
const parse = <A, R>(
  schema: Schema.ConstraintDecoder<A, R>,
  input: unknown
): Effect.Effect<A, HulyDataInvalidError, R> =>
  Schema.decodeUnknownEffect(schema)(input).pipe(
    Effect.mapError(
      (cause) => new HulyDataInvalidError({ operation: "move_issue", entity: "transfer preflight", cause })
    )
  )
const conflict = (
  root: MovementIssue,
  code: Exclude<TransferConflict["code"], "attribute" | "stale-resolution">,
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
  for (const issue of relevant) {
    const observed = hierarchy.byId.get(issue._id)
    if (observed === undefined || !isDeepStrictEqual(observed, issue))
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
  if (destination.private && !destination.members.includes(client.getAccountUuid()))
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
  destination: MovementProject
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
  const parentObservation =
    parent === undefined
      ? undefined
      : yield* Effect.result(
          Effect.gen(function* () {
            return yield* parse(
              TransferIssueSchema,
              yield* client.findOne<Issue>(tracker.class.Issue, hulyQuery<Issue>({ _id: toRef<Issue>(parent._id) }))
            )
          })
        )
  const parentIssue = parentObservation?._tag === "Success" ? parentObservation.success : undefined
  const conflicts = [
    ...projectConflicts(client, root, sourceData, destinationData),
    ...availableWorkflowConflicts(root, parentIssue, protectedIssue, destinationData.type, workflow, kind)
  ]
  if (parentObservation?._tag === "Failure")
    conflicts.push(
      conflict(
        root,
        "discovery",
        "Parent protected payload is unavailable; this task's independently parsed attributes and workflow remain inspected."
      )
    )
  if (raw?.modifiedOn !== root.modifiedOn)
    conflicts.push(conflict(root, "discovery", "Root changed during inspection."))
  return { protectedIssue, conflicts }
})

interface TransferContext {
  readonly hierarchy: MovementHierarchy
  readonly tree: ReadonlyArray<MovementIssue>
  readonly relevant: ReadonlyArray<MovementIssue>
  readonly discoveryReasons: ReadonlyArray<string>
}
const inspectTransferContext = Effect.fn("transfer.inspectContext")(function* (
  client: HulyClient["Service"],
  root: MovementIssue,
  parent: MovementIssue | undefined,
  destination: MovementProject
): Effect.fn.Return<TransferContext | TransferRefusal, MovementError> {
  if (client.commitTransferTree === undefined)
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
  const discovered = yield* inspectTransferTree(client, root)
  return {
    hierarchy,
    tree: discovered.issues,
    relevant: [...discovered.issues, ...related(hierarchy, root, parent)],
    discoveryReasons: discovered.complete ? [] : discovered.reasons
  }
})

const inspectTransferTasks = Effect.fn("transfer.inspectTasks")(function* (
  client: HulyClient["Service"],
  inspectRecords: NonNullable<HulyClient["Service"]["inspectTransferRecords"]>,
  tree: ReadonlyArray<MovementIssue>,
  root: MovementIssue,
  parent: MovementIssue | undefined,
  source: MovementProject,
  destination: MovementProject
): Effect.fn.Return<
  { readonly tasks: TransferPlan["tasks"]; readonly conflicts: ReadonlyArray<TransferConflict> },
  MovementError
> {
  const tasks: Array<TransferPlan["tasks"][number]> = []
  const conflicts: Array<TransferConflict> = []
  for (const issue of tree) {
    const taskParent = issue._id === root._id ? parent : tree.find((candidate) => candidate._id === issue.attachedTo)
    const workflow = yield* Effect.result(inspectWorkflow(client, issue, taskParent, source, destination))
    const records = yield* Effect.result(inspectRecords(issue._id, tree))
    if (records._tag === "Failure")
      conflicts.push(conflict(issue, "discovery", "Owned-record observation is unavailable for this task."))
    else conflicts.push(...ownedRecordConflicts(issue, records.success))
    if (workflow._tag === "Failure") {
      conflicts.push(
        conflict(
          issue,
          "discovery",
          "Protected payload/workflow observation is unavailable for this task; independently inspectable siblings remain included."
        )
      )
      continue
    }
    conflicts.push(...workflow.success.conflicts)
    tasks.push({
      issue,
      protectedIssue: workflow.success.protectedIssue,
      recordClasses: records._tag === "Success" ? records.success.classes : [],
      records:
        records._tag === "Success" ? records.success.records.filter((record) => record.kind !== "unsupported") : []
    })
  }
  return { tasks, conflicts }
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
  if (inspectRecords === undefined)
    return {
      conflicts: [conflict(root, "discovery", "Transfer adapter unavailable; no writes performed.")],
      limitation: "Inspection unavailable."
    }
  const context = yield* inspectTransferContext(client, root, parent, destination)
  if ("conflicts" in context) return context
  const { hierarchy, tree, relevant } = context
  const closureProblem =
    context.discoveryReasons.length === 0 ? yield* inspectMovementClosure(client, hierarchy, relevant) : undefined
  const inventories = yield* inspectTransferAttributes(client, source, destination)
  const inspectedTasks = yield* inspectTransferTasks(client, inspectRecords, tree, root, parent, source, destination)
  const { tasks } = inspectedTasks
  const conflicts = [
    ...context.discoveryReasons.map((reason) => conflict(root, "discovery", reason)),
    ...hierarchyConflicts(root, hierarchy, relevant),
    ...inspectedTasks.conflicts
  ]
  const attributes = resolveTransferTreeAttributes(root, tasks, inventories, params.resolutions, tree)
  conflicts.push(...attributes.conflicts)
  if (closureProblem !== undefined) conflicts.push(conflict(root, "discovery", closureProblem))
  const capacityProblem = transferCapacityProblem(tasks, conflicts)
  if (capacityProblem !== undefined)
    return {
      issueIds: tree.map((issue) => issue._id),
      conflicts: [conflict(root, "discovery", capacityProblem)],
      discovery: "incomplete",
      limitation:
        "Response/execution safety limits prevent a complete supported plan. No task prefix or writes are permitted."
    }
  if (conflicts.length > 0)
    return {
      issueIds: tree.map((issue) => issue._id),
      conflicts,
      discovery: combinedDiscovery(
        attributes.complete,
        context.discoveryReasons.length === 0 ? "complete" : "incomplete",
        conflicts
      ),
      limitation: "Every discovered task is inspected independently; incomplete discovery is reported explicitly."
    }
  const rootTask = tasks.find((task) => task.issue._id === root._id)
  if (rootTask === undefined)
    return {
      conflicts: [conflict(root, "discovery", "Root snapshot is unavailable.")],
      limitation: "No writes performed."
    }
  return {
    plan: { root, parent, source, tree, relevant },
    tasks,
    attributeChanges: attributes.changes,
    protectedIssue: rootTask.protectedIssue,
    recordClasses: [...new Set(tasks.flatMap((task) => task.recordClasses))],
    records: tasks.flatMap((task) => task.records)
  }
})

const transferCapacityProblem = (
  tasks: TransferPlan["tasks"],
  conflicts: ReadonlyArray<TransferConflict>
): string | undefined => {
  const records = tasks.flatMap((task) => task.records)
  if (records.length > MAX_TRANSFER_RECORDS)
    return `Tree exceeds the supported ${MAX_TRANSFER_RECORDS}-owned-record execution limit.`
  if (new Set(records.map((record) => record._id)).size !== records.length)
    return "A supporting record appears under multiple task closures; inspect ownership before retry."
  const entries = conflicts.reduce(
    (count, entry) => count + 1 + ("candidates" in entry ? entry.candidates.length : 0),
    0
  )
  return entries > MAX_TRANSFER_CONFLICT_ENTRIES
    ? `Complete conflicts/candidates exceed the supported ${MAX_TRANSFER_CONFLICT_ENTRIES}-entry response limit; no truncated conflict inventory is returned.`
    : undefined
}

const ownedRecordConflicts = (root: MovementIssue, records: TransferInspection): ReadonlyArray<TransferConflict> => [
  ...(records.discovery === "incomplete"
    ? [conflict(root, "discovery", "Incomplete owned-record discovery; no complete conflict inventory.")]
    : []),
  ...records.records
    .filter((record) => record.kind === "unsupported")
    .map((record) =>
      conflict(root, "unsupported-structure", `Unsupported owned record ${record._id} (${record._class}).`)
    ),
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

const combinedDiscovery = (
  attributesComplete: boolean,
  records: TransferInspection["discovery"],
  conflicts: ReadonlyArray<TransferConflict>
): TransferInspection["discovery"] =>
  attributesComplete &&
  records === "complete" &&
  conflicts.every((entry) => entry.code !== "unsupported-structure" && entry.code !== "discovery")
    ? "complete"
    : "incomplete"
