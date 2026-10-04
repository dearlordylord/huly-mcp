import { isDeepStrictEqual } from "node:util"
import type { Issue, Project } from "@hcengineering/tracker"
import { SortingOrder } from "@hcengineering/core"
import { Effect, Schedule, Ref } from "effect"
import type { MoveIssueParams } from "../../domain/schemas/issue-movement.js"
import type { MovementProject } from "../../domain/schemas/issue-movement-state.js"
import type { MovementUncertaintyEvidence } from "../../domain/schemas/issue-movement-uncertainty.js"
import type { TransferTreeWrite } from "../../domain/schemas/issue-transfer-tree.js"
import type { MoveIssueResult } from "../../domain/schemas/issues-results.js"
import type { HulyClient } from "../client.js"
import { tracker } from "../huly-plugins.js"
import type { MovementError } from "./issue-movement-preflight.js"
import { inspectTransferPlan, type TransferPlan } from "./issue-transfer-preflight.js"
import { planTransferTreeWrites } from "./issue-transfer-tree-planning.js"
import { verifyTransferTree, type TransferTreeVerification } from "./issue-transfer-tree-verification.js"
import { hulyQuery } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"
import { TRANSFER_DISCOVERY_BUDGET, TRANSFER_EXECUTION_BUDGET } from "./issue-transfer-tree.js"
import { allocateTransferTree } from "./issue-transfer-tree-allocation.js"
import { transferTreeRefusal, completedTransferTreeResult } from "./issue-transfer-tree-results.js"
import { stoppedResult, observeFailure, failedCommit, type ExecutionProgress } from "./issue-transfer-tree-recovery.js"
import { movementNoParent } from "./issue-movement-hierarchy.js"

const reinspect = Effect.fn("transfer.reinspectTree")(function* (
  client: HulyClient["Service"],
  prepared: TransferPlan,
  destination: MovementProject,
  params: MoveIssueParams
): Effect.fn.Return<boolean, MovementError> {
  const { root, parent, source } = prepared.plan
  const current = yield* inspectTransferPlan(client, root, parent, source, destination, params)
  return !("conflicts" in current) && isDeepStrictEqual(current, prepared)
})

export const executeTransferTree = Effect.fn("transfer.executeTree")(function* (
  client: HulyClient["Service"],
  prepared: TransferPlan,
  destination: MovementProject,
  params: MoveIssueParams
): Effect.fn.Return<MoveIssueResult, MovementError> {
  const progress: ExecutionProgress = {
    execution: yield* Ref.make<MovementUncertaintyEvidence["execution"] | undefined>(undefined),
    verification: yield* Ref.make<TransferTreeVerification>({ status: "not-attempted" })
  }
  const result = yield* Effect.result(
    executeWithinBudget(client, prepared, destination, params, progress).pipe(Effect.timeout(TRANSFER_EXECUTION_BUDGET))
  )
  if (result._tag === "Success") return result.success
  return yield* stoppedResult(
    "indeterminate",
    "Movement deadline or response unavailable; inspect every stable ID before retry.",
    prepared,
    destination,
    progress
  )
})

const executeWithinBudget = Effect.fn("transfer.executeWithinBudget")(function* (
  client: HulyClient["Service"],
  prepared: TransferPlan,
  destination: MovementProject,
  params: MoveIssueParams,
  progress: ExecutionProgress
): Effect.fn.Return<MoveIssueResult, MovementError> {
  const admission = yield* inspectAdmission(client, prepared, destination, params)
  if (admission.status === "blocked") return transferTreeRefusal(admission.reason, prepared, destination)
  const sameProject = destination._id === prepared.plan.source._id
  const allocation = sameProject
    ? { status: "allocated" as const, numbers: prepared.tasks.map((task) => task.protectedIssue.number) }
    : yield* allocateTransferTree(
        client,
        destination,
        prepared.tasks.map((task) => task.issue._id),
        progress.execution
      )
  if (allocation.status !== "allocated")
    return yield* stoppedResult(
      allocation.status === "refused" ? "incomplete" : "indeterminate",
      allocation.reason,
      prepared,
      destination,
      progress
    )
  const write = planTransferTreeWrites(prepared, destination, allocation.numbers, admission.lastRank)
  if (write === undefined)
    return yield* stoppedResult(
      "incomplete",
      "Identifier plan is incomplete or duplicate; task batch was not sent. Reserved numbers may leave gaps.",
      prepared,
      destination,
      progress
    )
  const noOp = sameProject && prepared.plan.root.attachedTo === (prepared.plan.parent?._id ?? movementNoParent)
  if (noOp) return yield* finishVerification(client, prepared, destination, write, progress)
  const presend = yield* Effect.result(
    reinspect(client, prepared, destination, params).pipe(Effect.timeout(TRANSFER_DISCOVERY_BUDGET))
  )
  if (presend._tag === "Failure")
    return yield* stoppedResult(
      "indeterminate",
      "Pre-send inspection unavailable; task batch was not sent. Prior allocations may leave gaps.",
      prepared,
      destination,
      progress
    )
  if (!presend.success) {
    yield* observeFailure(client, prepared, destination, write, progress)
    return yield* stoppedResult(
      "incomplete",
      "Task, ownership or hierarchy snapshots changed before send. Task batch was not sent; prior allocations may leave gaps.",
      prepared,
      destination,
      progress
    )
  }
  return yield* commitAndVerify(client, prepared, destination, write, progress, admission.commit)
})

type Admission =
  | {
      readonly status: "ready"
      readonly lastRank: string | undefined
      readonly commit: NonNullable<HulyClient["Service"]["commitTransferTree"]>
    }
  | { readonly status: "blocked"; readonly reason: string }
const inspectAdmission = Effect.fn("transfer.inspectAdmission")(function* (
  client: HulyClient["Service"],
  prepared: TransferPlan,
  destination: MovementProject,
  params: MoveIssueParams
): Effect.fn.Return<Admission, MovementError> {
  const commit = client.commitTransferTree
  if (commit === undefined)
    return {
      status: "blocked",
      reason: "Complete scoped tree adapter is unavailable; no allocation or task writes performed."
    }
  const last = yield* Effect.result(
    client.findOne<Issue>(tracker.class.Issue, hulyQuery<Issue>({ space: toRef<Project>(destination._id) }), {
      sort: { rank: SortingOrder.Descending }
    })
  )
  if (last._tag === "Failure")
    return { status: "blocked", reason: "Destination ordering inspection failed before writes." }
  const admission = yield* Effect.result(
    reinspect(client, prepared, destination, params).pipe(Effect.timeout(TRANSFER_DISCOVERY_BUDGET))
  )
  return admission._tag === "Failure" || !admission.success
    ? {
        status: "blocked",
        reason:
          "Task, ownership or hierarchy snapshots changed before allocation; inspect stable IDs and rebuild the call."
      }
    : { status: "ready", lastRank: last.success?.rank, commit }
})

const commitAndVerify = Effect.fn("transfer.commitAndVerify")(function* (
  client: HulyClient["Service"],
  prepared: TransferPlan,
  destination: MovementProject,
  write: TransferTreeWrite,
  progress: ExecutionProgress,
  commit: NonNullable<HulyClient["Service"]["commitTransferTree"]>
): Effect.fn.Return<MoveIssueResult, MovementError> {
  const reservations = (yield* Ref.get(progress.execution))?.reservations ?? []
  yield* Ref.set(progress.execution, { phase: "commit", commit: "sent", reservations })
  const committed = yield* Effect.result(commit(write))
  if (committed._tag === "Failure")
    return yield* failedCommit(client, prepared, destination, write, progress, committed.failure, reservations)
  if (committed.success === "condition-not-met") {
    yield* Ref.set(progress.execution, { phase: "commit", commit: "refused", reservations })
    yield* observeFailure(client, prepared, destination, write, progress)
    return yield* stoppedResult(
      "incomplete",
      "Scoped conditions refused the task batch. Prior allocations may leave gaps; inspect concurrent state before a new call.",
      prepared,
      destination,
      progress
    )
  }
  yield* Ref.set(progress.execution, { phase: "verification", commit: "acknowledged", reservations })
  return yield* finishVerification(client, prepared, destination, write, progress)
})

const finishVerification = Effect.fn("transfer.finishVerification")(function* (
  client: HulyClient["Service"],
  prepared: TransferPlan,
  destination: MovementProject,
  write: TransferTreeWrite,
  progress: ExecutionProgress
): Effect.fn.Return<MoveIssueResult> {
  const result = yield* Effect.result(
    verifyTransferTree(client, prepared, destination, write).pipe(
      Effect.tap((value) => Ref.set(progress.verification, value)),
      Effect.repeat({
        schedule: Schedule.spaced("200 millis"),
        times: 4,
        while: (value) => value.status === "observed" && value.consistency === "inconsistent"
      })
    )
  )
  if (result._tag === "Failure") {
    yield* Ref.set(progress.verification, { status: "unavailable", reason: "Post-send verification read failed." })
    return yield* stoppedResult(
      "indeterminate",
      "Verification reads unavailable; no automatic retry or rollback attempted.",
      prepared,
      destination,
      progress
    )
  }
  const observed = result.success
  if (observed.status !== "observed" || observed.completeness !== "complete")
    return yield* stoppedResult(
      "indeterminate",
      "Complete verification is unavailable; inspect current stable IDs.",
      prepared,
      destination,
      progress
    )
  if (observed.consistency === "inconsistent")
    return yield* stoppedResult("incomplete", observed.reason, prepared, destination, progress)
  return completedTransferTreeResult(client, prepared, destination, write)
})
