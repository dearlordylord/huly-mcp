import { isDeepStrictEqual } from "node:util"
import type { Issue } from "@hcengineering/tracker"
import { Effect, Option, Schema } from "effect"
import {
  MovementIssueSchema,
  type MovementIssue,
  type MovementProject
} from "../../domain/schemas/issue-movement-state.js"
import {
  MovementObservedRecordSchema,
  type MovementUncertaintyEvidence
} from "../../domain/schemas/issue-movement-uncertainty.js"
import { TransferIssueSchema, type TransferRecord, type TransferIssue } from "../../domain/schemas/issue-transfer.js"
import type { TransferTreeWrite } from "../../domain/schemas/issue-transfer-tree.js"
import type { HulyClient } from "../client.js"
import { tracker } from "../huly-plugins.js"
import { descendantsOf, hierarchyProblem, movementHierarchy } from "./issue-movement-hierarchy.js"
import { inspectMovementClosureState, inspectMovementProject, type MovementError } from "./issue-movement-preflight.js"
import type { TransferPlan } from "./issue-transfer-preflight.js"
import { hulyQuery } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"
import { movementNoParent } from "./issue-movement-hierarchy.js"

export type TransferTreeVerification = MovementUncertaintyEvidence["verification"]
// Internal paired observation: each schema owns its independent parsed projection.
interface ObservedIssue {
  readonly hierarchy: MovementIssue
  readonly protectedIssue: TransferIssue
}
const parseObservedIssue = (input: unknown): Option.Option<ObservedIssue> =>
  Option.gen(function* () {
    const hierarchy = yield* Schema.decodeUnknownOption(MovementIssueSchema)(input)
    const protectedIssue = yield* Schema.decodeUnknownOption(TransferIssueSchema)(input)
    return { hierarchy, protectedIssue }
  })
type Observation = Extract<TransferTreeVerification, { readonly status: "observed" }>
const observedTask = ({ hierarchy: issue, protectedIssue }: ObservedIssue): Observation["tasks"][number] => ({
  issueId: issue._id,
  projectId: issue.space,
  parentId: issue.attachedTo === movementNoParent ? null : issue.attachedTo,
  identifier: issue.identifier,
  number: protectedIssue.number
})
const parseObservedRecord = (input: unknown) => Schema.decodeUnknownOption(MovementObservedRecordSchema)(input)
const observedRecord = (record: TransferRecord) =>
  parseObservedRecord({
    recordId: record._id,
    objectClass: record._class,
    projectId: record.space,
    attachedTo: record.attachedTo,
    attachedToClass: record.attachedToClass,
    collection: record.collection
  })

export const verifyTransferTree = Effect.fn("transfer.verifyTree")(function* (
  client: HulyClient["Service"],
  prepared: TransferPlan,
  destination: MovementProject,
  write: TransferTreeWrite
): Effect.fn.Return<TransferTreeVerification, MovementError> {
  const source = yield* inspectMovementProject(client, prepared.plan.root)
  const target =
    destination._id === prepared.plan.source._id
      ? source
      : yield* inspectMovementProject(client, { ...prepared.plan.root, space: destination._id })
  if (source === undefined || target === undefined)
    return { status: "unavailable", reason: "Complete post-write project inventory is unavailable." }
  const hierarchy = movementHierarchy(
    destination._id === prepared.plan.source._id ? source.issues : [...source.issues, ...target.issues]
  )
  const currentRoot = hierarchy.byId.get(write.rootId)
  const currentTree = currentRoot === undefined ? [] : descendantsOf(hierarchy, currentRoot)
  const observedIds = [
    ...new Set([...write.tasks.map((task) => task.issueId), ...currentTree.map((issue) => issue._id)])
  ]
  const observed: Array<ObservedIssue> = []
  for (const issueId of observedIds) {
    const read = yield* Effect.result(
      client.findOne<Issue>(tracker.class.Issue, hulyQuery<Issue>({ _id: toRef<Issue>(issueId) }))
    )
    if (read._tag === "Failure")
      return {
        status: "observed",
        completeness: "incomplete",
        consistency: "undetermined",
        reason: `Current task ${issueId} could not be read.`,
        tasks: observed.map(observedTask),
        records: []
      }
    if (read.success === undefined) continue
    const parsed = parseObservedIssue(read.success)
    if (parsed._tag === "None")
      return {
        status: "observed",
        completeness: "incomplete",
        consistency: "undetermined",
        reason: `Current payload of ${issueId} could not be parsed.`,
        tasks: observed.map(observedTask),
        records: []
      }
    observed.push(parsed.value)
  }
  const knownTaskProblem = taskProblem(observed, write)
  const records = yield* inspectRecords(client, prepared, observed)
  const tasks = observed.map(observedTask)
  if (records.status === "unavailable")
    return {
      status: "observed",
      completeness: "incomplete",
      consistency: knownTaskProblem === undefined ? "undetermined" : "inconsistent",
      reason: knownTaskProblem === undefined ? records.reason : `${knownTaskProblem} ${records.reason}`,
      tasks,
      records: records.observed
    }
  const closure = yield* inspectMovementClosureState(client, hierarchy, prepared.plan.relevant)
  if (closure?.state === "unavailable")
    return {
      status: "observed",
      completeness: "incomplete",
      consistency: knownTaskProblem === undefined ? "undetermined" : "inconsistent",
      reason: knownTaskProblem === undefined ? closure.message : `${knownTaskProblem} ${closure.message}`,
      tasks,
      records: records.observed
    }
  const reason =
    knownTaskProblem ?? hierarchyProblemAfterMove(prepared, hierarchy, write) ?? closure?.message ?? records.reason
  return reason === undefined
    ? { status: "observed", completeness: "complete", consistency: "consistent", tasks, records: records.observed }
    : {
        status: "observed",
        completeness: "complete",
        consistency: "inconsistent",
        reason,
        tasks,
        records: records.observed
      }
})

const taskProblem = (observed: ReadonlyArray<ObservedIssue>, write: TransferTreeWrite): string | undefined => {
  for (const task of write.tasks) {
    const current = observed.find((issue) => issue.hierarchy._id === task.issueId)
    if (current === undefined) return `Inspected task ${task.issueId} is absent.`
    if (!destinationMatches(current.hierarchy, task))
      return `Task ${task.issueId} differs from its planned destination or ancestry.`
    const protectedIssue = current.protectedIssue
    const expected = { ...task.expectedIssue, number: task.number, rank: task.rank }
    for (const change of task.attributeChanges ?? []) expected[change.field] = change.to
    if (!isDeepStrictEqual(expected, protectedIssue) || current.hierarchy.title !== task.expectedHierarchy.title)
      return `Protected payload of ${task.issueId} differs from approved final values.`
  }
  return undefined
}
const destinationMatches = (current: MovementIssue, task: TransferTreeWrite["tasks"][number]) =>
  current.space === task.destinationId &&
  current.identifier === task.identifier &&
  current.attachedTo === task.parentId &&
  isDeepStrictEqual(current.parents, task.finalParents) &&
  current.estimation === task.expectedHierarchy.estimation &&
  current.reportedTime === task.expectedHierarchy.reportedTime

const hierarchyProblemAfterMove = (
  prepared: TransferPlan,
  hierarchy: ReturnType<typeof movementHierarchy>,
  write: TransferTreeWrite
): string | undefined => {
  const root = hierarchy.byId.get(write.rootId)
  if (root === undefined || descendantsOf(hierarchy, root).length !== write.tasks.length)
    return "Observed descendant closure differs from the complete planned tree."
  for (const previous of prepared.plan.relevant) {
    const current = hierarchy.byId.get(previous._id)
    if (current === undefined) return `Affected ancestor/task ${previous._id} is absent.`
    const problem = hierarchyProblem(hierarchy, current)
    if (problem !== undefined) return problem
  }
  return undefined
}

// Internal inspection proof; observed locations are schema-owned public evidence.
type RecordObservation =
  | { readonly status: "available"; readonly observed: Observation["records"]; readonly reason: string | undefined }
  | { readonly status: "unavailable"; readonly observed: Observation["records"]; readonly reason: string }
const inspectRecords = Effect.fn("transfer.observeRecords")(function* (
  client: HulyClient["Service"],
  prepared: TransferPlan,
  observed: ReadonlyArray<ObservedIssue>
): Effect.fn.Return<RecordObservation, MovementError> {
  const inspect = client.inspectTransferRecords
  if (inspect === undefined)
    return { status: "unavailable", observed: [], reason: "Owned-record verifier is unavailable." }
  const records: Array<Observation["records"][number]> = []
  const problems: Array<string> = []
  const owners = [
    ...new Set([...prepared.tasks.map((task) => task.issue._id), ...observed.map((issue) => issue.hierarchy._id)])
  ]
  for (const issueId of owners) {
    const read = yield* Effect.result(
      inspect(
        issueId,
        observed.map((issue) => issue.hierarchy)
      )
    )
    if (read._tag === "Failure")
      return { status: "unavailable", observed: records, reason: `Record closure of ${issueId} could not be read.` }
    const current = read.success
    for (const record of current.records) {
      const route = observedRecord(record)
      if (route._tag === "None")
        return { status: "unavailable", observed: records, reason: `Record route of ${record._id} is unavailable.` }
      records.push(route.value)
    }
    if (current.discovery === "incomplete")
      return { status: "unavailable", observed: records, reason: `Record closure of ${issueId} is incomplete.` }
    const task = prepared.tasks.find((value) => value.issue._id === issueId)
    const issue = observed.find((value) => value.hierarchy._id === issueId)
    if (task === undefined || !recordPayloadsMatch(task.records, current.records, issue?.hierarchy.space))
      problems.push(`Owned records of ${issueId} changed after inspection.`)
    if (current.blockers.length > 0) problems.push(...current.blockers)
  }
  return { status: "available", observed: records, reason: problems.length === 0 ? undefined : problems.join(" ") }
})
const recordPayloadsMatch = (
  previous: TransferPlan["records"],
  current: ReadonlyArray<TransferRecord>,
  projectId: MovementProject["_id"] | undefined
) =>
  previous.length === current.length &&
  previous.every((record) => current.some((value) => isDeepStrictEqual(value, { ...record, space: projectId })))
