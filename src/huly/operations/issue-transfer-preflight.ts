import { inspectTransferWorkflow } from "./issue-transfer-workflow.js"
import { parseTransferSnapshot, transferConflict } from "./issue-transfer-preflight-values.js"
import { movementNoParent } from "./issue-movement-hierarchy.js"
import { inspectTransferAttributes } from "./issue-transfer-attribute-inspection.js"
import { isDeepStrictEqual } from "node:util"
import { resolveTransferTreeAttributes, type TransferTaskSnapshot } from "./issue-transfer-tree-attributes.js"
import { inspectTransferTree } from "./issue-transfer-tree-inspection.js"
import { MAX_TRANSFER_RECORDS, MAX_TRANSFER_CONFLICT_ENTRIES } from "./issue-transfer-tree.js"
import type { TransferAttributeChange } from "../../domain/schemas/issue-transfer-attributes.js"
import type { Issue } from "@hcengineering/tracker"
import { Effect } from "effect"
import type { MoveIssueParams } from "../../domain/schemas/issue-movement.js"
import {
  TransferIssueSchema,
  type TransferInspection,
  type TransferConflict,
  type TransferIssue,
  type TransferSupportedRecord
} from "../../domain/schemas/issue-transfer.js"
import type { MovementIssue, MovementProject } from "../../domain/schemas/issue-movement-state.js"
import type { HulyClient } from "../client.js"
import { tracker } from "../huly-plugins.js"
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
      conflicts.push(transferConflict(root, "discovery", `Issue changed during inspection: ${issue._id}.`))
    const problem = hierarchyProblem(hierarchy, issue)
    if (problem !== undefined) conflicts.push(transferConflict(root, "discovery", problem))
  }
  return conflicts
}

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
      conflicts: [transferConflict(root, "discovery", "Transfer adapter unavailable; no writes performed.")],
      limitation: "Inspection unavailable."
    }
  const sourceHierarchy = yield* inspectMovementProject(client, root)
  const destinationHierarchy =
    destination._id === root.space
      ? sourceHierarchy
      : yield* inspectMovementProject(client, { ...root, space: destination._id })
  if (sourceHierarchy === undefined || destinationHierarchy === undefined)
    return {
      conflicts: [transferConflict(root, "discovery", "Incomplete project discovery.")],
      limitation: "No complete conflict inventory."
    }
  const hierarchy = movementHierarchy(
    destination._id === root.space
      ? sourceHierarchy.issues
      : [...sourceHierarchy.issues, ...destinationHierarchy.issues]
  )
  const discovered = yield* inspectTransferTree(client, root)
  return {
    hierarchy,
    tree: discovered.issues,
    relevant: [...discovered.issues, ...related(hierarchy, root, parent)],
    discoveryReasons: discovered.complete ? [] : discovered.reasons
  }
})

const inspectSameProjectTask = Effect.fn("movement.inspectProtectedTask")(function* (
  client: HulyClient["Service"],
  issue: MovementIssue,
  destination: MovementProject,
  satisfied: boolean
): Effect.fn.Return<
  { readonly protectedIssue: TransferIssue; readonly conflicts: ReadonlyArray<TransferConflict> },
  MovementError
> {
  const raw = yield* client.findOne<Issue>(tracker.class.Issue, hulyQuery<Issue>({ _id: toRef<Issue>(issue._id) }))
  const protectedIssue = yield* parseTransferSnapshot(TransferIssueSchema, raw)
  return {
    protectedIssue,
    conflicts:
      satisfied && issue.identifier !== `${destination.identifier}-${protectedIssue.number}`
        ? [
            transferConflict(
              issue,
              "unsupported-structure",
              "Satisfied destination identifier disagrees with the task number; inspect actual state before retry."
            )
          ]
        : []
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
    const workflow = yield* Effect.result(
      source._id === destination._id
        ? inspectSameProjectTask(client, issue, destination, root.attachedTo === (parent?._id ?? movementNoParent))
        : inspectTransferWorkflow(client, issue, taskParent, source, destination)
    )
    const records = yield* Effect.result(inspectRecords(issue._id, tree))
    if (records._tag === "Failure")
      conflicts.push(transferConflict(issue, "discovery", "Owned-record observation is unavailable for this task."))
    else conflicts.push(...ownedRecordConflicts(issue, records.success))
    if (workflow._tag === "Failure") {
      conflicts.push(
        transferConflict(
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
      conflicts: [transferConflict(root, "discovery", "Transfer adapter unavailable; no writes performed.")],
      limitation: "Inspection unavailable."
    }
  const context = yield* inspectTransferContext(client, root, parent, destination)
  if ("conflicts" in context) return context
  const { hierarchy, tree, relevant } = context
  const closureProblem =
    context.discoveryReasons.length === 0 ? yield* inspectMovementClosure(client, hierarchy, relevant) : undefined
  const preserveSameProjectAttributes = source._id === destination._id && params.resolutions === undefined
  const inventories = preserveSameProjectAttributes
    ? undefined
    : yield* inspectTransferAttributes(client, source, destination)
  const inspectedTasks = yield* inspectTransferTasks(client, inspectRecords, tree, root, parent, source, destination)
  const { tasks } = inspectedTasks
  const conflicts = [
    ...context.discoveryReasons.map((reason) => transferConflict(root, "discovery", reason)),
    ...hierarchyConflicts(root, hierarchy, relevant),
    ...inspectedTasks.conflicts
  ]
  const attributes =
    inventories === undefined
      ? { changes: [], conflicts: [], complete: true }
      : resolveTransferTreeAttributes(root, tasks, inventories, params.resolutions, tree)
  conflicts.push(...attributes.conflicts)
  if (closureProblem !== undefined) conflicts.push(transferConflict(root, "discovery", closureProblem))
  const capacityProblem = transferCapacityProblem(tasks, conflicts)
  if (capacityProblem !== undefined)
    return {
      issueIds: tree.map((issue) => issue._id),
      conflicts: [transferConflict(root, "discovery", capacityProblem)],
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
      conflicts: [transferConflict(root, "discovery", "Root snapshot is unavailable.")],
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
    ? [transferConflict(root, "discovery", "Incomplete owned-record discovery; no complete conflict inventory.")]
    : []),
  ...records.records
    .filter((record) => record.kind === "unsupported")
    .map((record) =>
      transferConflict(root, "unsupported-structure", `Unsupported owned record ${record._id} (${record._class}).`)
    ),
  ...records.blockers.map((reason) => transferConflict(root, "unsupported-structure", reason)),
  ...records.records
    .filter((record) => record.space !== root.space)
    .map((record) =>
      transferConflict(
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
