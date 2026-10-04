import { projectVerification, type VerificationProof } from "./issue-transfer-verification-proof.js"
import { Effect } from "effect"
import type { MovementProject } from "../../domain/schemas/issue-movement-state.js"
import type { MovementUncertaintyEvidence } from "../../domain/schemas/issue-movement-uncertainty.js"
import type { TransferTreeWrite } from "../../domain/schemas/issue-transfer-tree.js"
import type { HulyClient } from "../client.js"
import { descendantsOf, hierarchyProblem, movementHierarchy } from "./issue-movement-hierarchy.js"
import { inspectMovementClosureState, inspectMovementProject, type MovementError } from "./issue-movement-preflight.js"
import type { TransferPlan } from "./issue-transfer-preflight.js"
import {
  observeTransferTasks,
  observedTask,
  observedTaskProblem,
  type TaskObservation
} from "./issue-transfer-task-observation.js"
import { observeTransferRecords, type RecordObservation } from "./issue-transfer-record-observation.js"

export type TransferTreeVerification = MovementUncertaintyEvidence["verification"]
export const verifyTransferTree = Effect.fn("transfer.verifyTree")(function* (
  client: HulyClient["Service"],
  prepared: TransferPlan,
  destination: MovementProject,
  write: TransferTreeWrite,
  publish: (observation: VerificationProof) => Effect.Effect<void> = () => Effect.void
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
  const hierarchyProblem = hierarchyProblemAfterMove(prepared, hierarchy, write)
  const currentRoot = hierarchy.byId.get(write.rootId)
  const currentTree = currentRoot === undefined ? [] : descendantsOf(hierarchy, currentRoot)
  const observedIds = [
    ...new Set([...write.tasks.map((task) => task.issueId), ...currentTree.map((issue) => issue._id)])
  ]
  let taskProof: TaskObservation = { observed: [], absentIssueIds: [], limitations: [] }
  let recordProof: RecordObservation = { records: [], problems: [], limitations: [] }
  const progress = () =>
    makeProof(hierarchyProblem, taskProof, recordProof, write, {
      problems: [],
      limitations: ["Further verification observations remain unavailable."]
    })
  yield* publish(progress())
  taskProof = yield* observeTransferTasks(client, observedIds, (observation) => {
    taskProof = observation
    return publish(progress())
  })
  recordProof = yield* observeTransferRecords(client, prepared, write, taskProof.observed, (observation) => {
    recordProof = observation
    return publish(progress())
  })
  const closure = yield* observeClosure(client, hierarchy, prepared)
  const proof = makeProof(hierarchyProblem, taskProof, recordProof, write, closure)
  yield* publish(proof)
  return projectVerification(proof)
})

const makeProof = (
  hierarchyProblem: string | undefined,
  taskProof: TaskObservation,
  recordProof: RecordObservation,
  write: TransferTreeWrite,
  closure: { readonly problems: ReadonlyArray<string>; readonly limitations: ReadonlyArray<string> }
): VerificationProof => ({
  tasks: taskProof.observed.map(observedTask),
  records: recordProof.records,
  absentIssueIds: taskProof.absentIssueIds,
  problems: [
    ...(hierarchyProblem === undefined ? [] : [hierarchyProblem]),
    ...taskProof.absentIssueIds.map((id) => `Inspected task ${id} is absent.`),
    ...observedTaskProblem(taskProof.observed, write),
    ...recordProof.problems,
    ...closure.problems
  ],
  limitations: [...taskProof.limitations, ...recordProof.limitations, ...closure.limitations],
  historicalProblems: []
})

const observeClosure = Effect.fn("transfer.observeClosure")(function* (
  client: HulyClient["Service"],
  hierarchy: ReturnType<typeof movementHierarchy>,
  prepared: TransferPlan
): Effect.fn.Return<{ readonly problems: ReadonlyArray<string>; readonly limitations: ReadonlyArray<string> }> {
  const read = yield* Effect.result(inspectMovementClosureState(client, hierarchy, prepared.plan.relevant))
  if (read._tag === "Failure")
    return { problems: [], limitations: ["Descendant closure could not be read completely."] }
  const problem = read.success
  if (problem === undefined) return { problems: [], limitations: [] }
  return problem.state === "unavailable"
    ? { problems: [], limitations: [problem.message] }
    : { problems: [problem.message], limitations: [] }
})
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
