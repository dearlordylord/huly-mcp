import { Effect } from "effect"
import type { MovementProject } from "../../domain/schemas/issue-movement-state.js"
import type { MovementUncertaintyEvidence } from "../../domain/schemas/issue-movement-uncertainty.js"
import type { TransferTreeWrite } from "../../domain/schemas/issue-transfer-tree.js"
import type { HulyClient } from "../client.js"
import { descendantsOf, hierarchyProblem, movementHierarchy } from "./issue-movement-hierarchy.js"
import { inspectMovementClosureState, inspectMovementProject, type MovementError } from "./issue-movement-preflight.js"
import type { TransferPlan } from "./issue-transfer-preflight.js"
import { observeTransferTasks, observedTask, observedTaskProblem } from "./issue-transfer-task-observation.js"
import { observeTransferRecords } from "./issue-transfer-record-observation.js"

export type TransferTreeVerification = MovementUncertaintyEvidence["verification"]
type Observation = Extract<TransferTreeVerification, { readonly status: "observed" }>
// Internal proof separates independently established contradictions from unavailable observations.
interface VerificationProof {
  readonly tasks: Observation["tasks"]
  readonly records: Observation["records"]
  readonly absentIssueIds: ReadonlyArray<TransferTreeWrite["rootId"]>
  readonly problems: ReadonlyArray<string>
  readonly limitations: ReadonlyArray<string>
}

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
  const hierarchyProblem = hierarchyProblemAfterMove(prepared, hierarchy, write)
  const currentRoot = hierarchy.byId.get(write.rootId)
  const currentTree = currentRoot === undefined ? [] : descendantsOf(hierarchy, currentRoot)
  const observedIds = [
    ...new Set([...write.tasks.map((task) => task.issueId), ...currentTree.map((issue) => issue._id)])
  ]
  const taskProof = yield* observeTransferTasks(client, observedIds)
  const recordProof = yield* observeTransferRecords(client, prepared, write, taskProof.observed)
  const closure = yield* observeClosure(client, hierarchy, prepared)
  return projectVerification({
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
    limitations: [...taskProof.limitations, ...recordProof.limitations, ...closure.limitations]
  })
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
const projectVerification = (proof: VerificationProof): Observation => {
  const { tasks, records } = proof
  const absence = proof.absentIssueIds.length === 0 ? {} : { absentIssueIds: proof.absentIssueIds }
  const inconsistent = proof.problems.length > 0
  const reason = [...proof.problems, ...proof.limitations].join(" ")
  if (proof.limitations.length > 0) {
    return inconsistent
      ? {
          status: "observed",
          completeness: "incomplete",
          consistency: "inconsistent",
          reason,
          tasks,
          records,
          ...absence
        }
      : { status: "observed", completeness: "incomplete", consistency: "undetermined", reason, tasks, records }
  }
  return inconsistent
    ? { status: "observed", completeness: "complete", consistency: "inconsistent", reason, tasks, records, ...absence }
    : { status: "observed", completeness: "complete", consistency: "consistent", tasks, records }
}

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
