import { isDeepStrictEqual } from "node:util"
import type { Issue } from "@hcengineering/tracker"
import { Effect, Option, Schema } from "effect"
import { MovementIssueSchema, type MovementIssue } from "../../domain/schemas/issue-movement-state.js"
import type { MovementUncertaintyEvidence } from "../../domain/schemas/issue-movement-uncertainty.js"
import { TransferIssueSchema, type TransferIssue } from "../../domain/schemas/issue-transfer.js"
import type { TransferTreeWrite } from "../../domain/schemas/issue-transfer-tree.js"
import type { HulyClient } from "../client.js"
import { tracker } from "../huly-plugins.js"
import { hulyQuery } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"
import { movementNoParent } from "./issue-movement-hierarchy.js"

// Internal paired observation: each schema owns its independent parsed projection.
export interface ObservedIssue {
  readonly hierarchy: MovementIssue
  readonly protectedIssue: TransferIssue
}
const parseObservedIssue = (input: unknown): Option.Option<ObservedIssue> =>
  Option.gen(function* () {
    const hierarchy = yield* Schema.decodeUnknownOption(MovementIssueSchema)(input)
    const protectedIssue = yield* Schema.decodeUnknownOption(TransferIssueSchema)(input)
    return { hierarchy, protectedIssue }
  })
type Observation = Extract<MovementUncertaintyEvidence["verification"], { readonly status: "observed" }>
export const observedTask = ({ hierarchy: issue, protectedIssue }: ObservedIssue): Observation["tasks"][number] => ({
  issueId: issue._id,
  projectId: issue.space,
  parentId: issue.attachedTo === movementNoParent ? null : issue.attachedTo,
  identifier: issue.identifier,
  number: protectedIssue.number
})
// Internal proof accumulates only completed boundary observations and their limitations.
export interface TaskObservation {
  readonly observed: ReadonlyArray<ObservedIssue>
  readonly absentIssueIds: ReadonlyArray<TransferTreeWrite["rootId"]>
  readonly limitations: ReadonlyArray<string>
}
export const observeTransferTasks = Effect.fn("transfer.observeTasks")(function* (
  client: HulyClient["Service"],
  issueIds: ReadonlyArray<TransferTreeWrite["rootId"]>
): Effect.fn.Return<TaskObservation> {
  const observed: Array<ObservedIssue> = []
  const absentIssueIds: Array<TransferTreeWrite["rootId"]> = []
  const limitations: Array<string> = []
  for (const issueId of issueIds) {
    const read = yield* Effect.result(
      client.findOne<Issue>(tracker.class.Issue, hulyQuery<Issue>({ _id: toRef<Issue>(issueId) }))
    )
    if (read._tag === "Failure") {
      limitations.push(`Current task ${issueId} could not be read.`)
      continue
    }
    if (read.success === undefined) {
      absentIssueIds.push(issueId)
      continue
    }
    const parsed = parseObservedIssue(read.success)
    if (parsed._tag === "None") limitations.push(`Current payload of ${issueId} could not be parsed.`)
    else observed.push(parsed.value)
  }
  return { observed, absentIssueIds, limitations }
})

export const observedTaskProblem = (
  observed: ReadonlyArray<ObservedIssue>,
  write: TransferTreeWrite
): ReadonlyArray<string> => {
  const problems: Array<string> = []
  for (const current of observed) {
    const task = write.tasks.find((task) => task.issueId === current.hierarchy._id)
    if (task === undefined) continue
    if (!destinationMatches(current.hierarchy, task))
      problems.push(`Task ${task.issueId} differs from its planned destination or ancestry.`)
    const expected = { ...task.expectedIssue, number: task.number, rank: task.rank }
    for (const change of task.attributeChanges ?? []) expected[change.field] = change.to
    if (
      !isDeepStrictEqual(expected, current.protectedIssue) ||
      current.hierarchy.title !== task.expectedHierarchy.title
    )
      problems.push(`Protected payload of ${task.issueId} differs from approved final values.`)
  }
  return problems
}
const destinationMatches = (current: MovementIssue, task: TransferTreeWrite["tasks"][number]) =>
  current.space === task.destinationId &&
  current.identifier === task.identifier &&
  current.attachedTo === task.parentId &&
  isDeepStrictEqual(current.parents, task.finalParents) &&
  current.estimation === task.expectedHierarchy.estimation &&
  current.reportedTime === task.expectedHierarchy.reportedTime
