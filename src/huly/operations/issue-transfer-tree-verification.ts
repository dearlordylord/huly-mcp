import { isDeepStrictEqual } from "node:util"
import type { Issue } from "@hcengineering/tracker"
import { Effect, Schema } from "effect"
import type { MovementIssue, MovementProject } from "../../domain/schemas/issue-movement-state.js"
import { TransferIssueSchema } from "../../domain/schemas/issue-transfer.js"
import type { TransferTreeTaskWrite, TransferTreeWrite } from "../../domain/schemas/issue-transfer-tree.js"
import type { HulyClient } from "../client.js"
import { tracker } from "../huly-plugins.js"
import {
  descendantsOf,
  hierarchyProblem,
  movementHierarchy,
  type MovementHierarchy
} from "./issue-movement-hierarchy.js"
import { inspectMovementClosure, inspectMovementProject, type MovementError } from "./issue-movement-preflight.js"
import type { TransferPlan } from "./issue-transfer-preflight.js"
import { hulyQuery } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"

// Internal observation proof. Protocol evidence schemas are owned by issue 311.
export type TransferTreeVerification =
  | { readonly status: "consistent"; readonly tasks: ReadonlyArray<MovementIssue> }
  | { readonly status: "inconsistent"; readonly tasks: ReadonlyArray<MovementIssue>; readonly reason: string }
  | { readonly status: "unavailable"; readonly reason: string }

const parseIssue = (input: unknown) => Schema.decodeUnknownOption(TransferIssueSchema)(input)

export const verifyTransferTree = Effect.fn("transfer.verifyTree")(function* (
  client: HulyClient["Service"],
  prepared: TransferPlan,
  destination: MovementProject,
  write: TransferTreeWrite
): Effect.fn.Return<TransferTreeVerification, MovementError> {
  const source = yield* inspectMovementProject(client, prepared.plan.root)
  const target = yield* inspectMovementProject(client, { ...prepared.plan.root, space: destination._id })
  if (source === undefined || target === undefined)
    return { status: "unavailable", reason: "Complete post-write project inventory is unavailable." }
  const hierarchy = movementHierarchy([...source.issues, ...target.issues])
  const tasks = write.tasks.flatMap((task) => {
    const current = hierarchy.byId.get(task.issueId)
    return current === undefined ? [] : [current]
  })
  const inconsistent = (reason: string): TransferTreeVerification => ({ status: "inconsistent", tasks, reason })
  if (tasks.length !== write.tasks.length) return inconsistent("Some inspected tasks are absent from both projects.")
  const taskProblem = yield* inspectTreeTasks(client, hierarchy, destination, write)
  if (taskProblem !== undefined) return inconsistent(taskProblem)
  const hierarchyState = treeHierarchyProblem(prepared, hierarchy, write)
  if (hierarchyState !== undefined) return inconsistent(hierarchyState)
  const closureProblem = yield* inspectMovementClosure(client, hierarchy, prepared.plan.relevant)
  if (closureProblem !== undefined) return inconsistent(closureProblem)
  return yield* inspectTreeRecords(client, prepared, destination, tasks)
})

const taskDestinationMatches = (
  current: MovementIssue | undefined,
  destination: MovementProject,
  task: TransferTreeTaskWrite
) =>
  current !== undefined &&
  current.space === destination._id &&
  current.identifier === task.identifier &&
  current.attachedTo === task.parentId &&
  isDeepStrictEqual(current.parents, task.finalParents)

const inspectTreeTasks = Effect.fn("transfer.inspectTreeTasks")(function* (
  client: HulyClient["Service"],
  hierarchy: MovementHierarchy,
  destination: MovementProject,
  write: TransferTreeWrite
): Effect.fn.Return<string | undefined, MovementError> {
  for (const task of write.tasks) {
    const current = hierarchy.byId.get(task.issueId)
    if (!taskDestinationMatches(current, destination, task))
      return `Task ${task.issueId} does not satisfy its planned destination, identifier and parent.`
    const preservation = yield* inspectTaskPreservation(client, task)
    if (preservation !== undefined) return preservation
  }
  return undefined
})

const treeHierarchyProblem = (
  prepared: TransferPlan,
  hierarchy: MovementHierarchy,
  write: TransferTreeWrite
): string | undefined => {
  const root = hierarchy.byId.get(write.rootId)
  if (root === undefined || descendantsOf(hierarchy, root).length !== write.tasks.length)
    return "Observed descendant closure differs from the complete planned tree."
  for (const issue of prepared.plan.relevant) {
    const current = hierarchy.byId.get(issue._id)
    if (current === undefined) return `Affected ancestor/task ${issue._id} is absent.`
    const problem = hierarchyProblem(hierarchy, current)
    if (problem !== undefined) return problem
  }
  return undefined
}

const inspectTaskPreservation = Effect.fn("transfer.inspectTaskPreservation")(function* (
  client: HulyClient["Service"],
  task: TransferTreeTaskWrite
): Effect.fn.Return<string | undefined, MovementError> {
  const raw = yield* client.findOne<Issue>(tracker.class.Issue, hulyQuery<Issue>({ _id: toRef<Issue>(task.issueId) }))
  const parsed = parseIssue(raw)
  if (parsed._tag === "None") return `Protected payload of ${task.issueId} is absent or invalid.`
  const expected = { ...task.expectedIssue, number: task.number, rank: task.rank }
  for (const change of task.attributeChanges ?? []) expected[change.field] = change.to
  return isDeepStrictEqual(expected, parsed.value) && raw?.title === task.expectedHierarchy.title
    ? undefined
    : `Protected payload of ${task.issueId} differs from approved final values.`
})

const inspectTreeRecords = Effect.fn("transfer.inspectTreeRecords")(function* (
  client: HulyClient["Service"],
  prepared: TransferPlan,
  destination: MovementProject,
  tasks: ReadonlyArray<MovementIssue>
): Effect.fn.Return<TransferTreeVerification, MovementError> {
  const inspect = client.inspectTransferRecords
  if (inspect === undefined) return { status: "unavailable", reason: "Owned-record verifier is unavailable." }
  for (const task of prepared.tasks) {
    const current = yield* inspect(task.issue._id, tasks)
    if (current.discovery === "incomplete")
      return { status: "unavailable", reason: `Record closure of ${task.issue._id} is incomplete.` }
    if (
      current.blockers.length > 0 ||
      current.records.length !== task.records.length ||
      !task.records.every((record) =>
        current.records.some((observed) => isDeepStrictEqual(observed, { ...record, space: destination._id }))
      )
    )
      return {
        status: "inconsistent",
        tasks,
        reason: `Owned records of ${task.issue._id} differ from their approved destination payloads.`
      }
  }
  return { status: "consistent", tasks }
})
