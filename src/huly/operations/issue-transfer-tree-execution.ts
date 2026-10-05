import type { MovementTransactions } from "../issue-movement-transactions.js"
import type { VerificationProof } from "./issue-transfer-verification-proof.js"
import { publishVerification, interruptVerification } from "./issue-transfer-verification-progress.js"
import { isDeepStrictEqual } from "node:util"
import type { Issue, Project } from "@hcengineering/tracker"
import { SortingOrder } from "@hcengineering/core"
import { Cause, Effect, Schedule, Ref } from "effect"
import type { MoveIssueParams } from "../../domain/schemas/issue-movement.js"
import type { MovementProject } from "../../domain/schemas/issue-movement-state.js"
import type { MovementUncertaintyEvidence } from "../../domain/schemas/issue-movement-uncertainty.js"
import type { TransferTreeWrite } from "../../domain/schemas/issue-transfer-tree.js"
import type { MoveIssueResult } from "../../domain/schemas/issues-results.js"
import type { HulyClient } from "../client.js"
import { tracker } from "../huly-plugins.js"
import type { MovementError } from "./issue-movement-preflight.js"
import { inspectTransferPlan, type TransferPlan } from "./issue-transfer-preflight.js"
import { planTransferTreeWrites, writeRepairsAncestry } from "./issue-transfer-tree-planning.js"
import { verifyTransferTree, type TransferTreeVerification } from "./issue-transfer-tree-verification.js"
import { hulyQuery } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"
import { TRANSFER_DISCOVERY_BUDGET, TRANSFER_EXECUTION_BUDGET } from "./issue-transfer-tree.js"
import { allocateTransferTree } from "./issue-transfer-tree-allocation.js"
import { transferTreeRefusal, completedTransferTreeResult } from "./issue-transfer-tree-results.js"
import {
  capturedMovementBatch,
  stoppedResult,
  observeFailure,
  failedCommit,
  type MovementBatchCapture,
  type ExecutionProgress
} from "./issue-transfer-tree-recovery.js"
import { movementNoParent } from "./issue-movement-hierarchy.js"

const reinspect = Effect.fn("transfer.reinspectTree")(function* (
  client: HulyClient["Service"],
  prepared: TransferPlan,
  destination: MovementProject,
  params: MoveIssueParams
): Effect.fn.Return<TransferPlan | undefined, MovementError> {
  const { parent, root, source } = prepared.plan
  const current = yield* inspectTransferPlan(client, root, parent, source, destination, params)
  return "conflicts" in current || !isDeepStrictEqual(current, prepared) ? undefined : current
})

export const executeTransferTree = Effect.fn("transfer.executeTree")(function* (
  client: HulyClient["Service"],
  prepared: TransferPlan,
  destination: MovementProject,
  params: MoveIssueParams
): Effect.fn.Return<MoveIssueResult, MovementError> {
  const progress: ExecutionProgress = {
    transactions: yield* Ref.make<MovementTransactions>([]),
    batch: yield* Ref.make<MovementBatchCapture>({ status: "awaiting" }),
    execution: yield* Ref.make<MovementUncertaintyEvidence["execution"] | undefined>(undefined),
    verification: yield* Ref.make<TransferTreeVerification>({ status: "not-attempted" }),
    verificationFacts: yield* Ref.make<VerificationProof | undefined>(undefined)
  }
  const result = yield* Effect.result(
    executeWithinBudget(client, prepared, destination, params, progress).pipe(Effect.timeout(TRANSFER_EXECUTION_BUDGET))
  )
  if (result._tag === "Success") return result.success
  return yield* interruptedExecution(prepared, destination, progress)
})

const interruptedExecution = Effect.fn("transfer.interruptedExecution")(function* (
  prepared: TransferPlan,
  destination: MovementProject,
  progress: ExecutionProgress
): Effect.fn.Return<MoveIssueResult> {
  const execution = yield* Ref.get(progress.execution)
  const verification =
    execution?.phase === "verification"
      ? yield* interruptVerification(
          progress.verification,
          progress.verificationFacts,
          "Movement deadline interrupted remaining verification reads."
        )
      : yield* Ref.get(progress.verification)
  return yield* stoppedResult(
    execution?.phase === "verification" &&
      verification.status === "observed" &&
      verification.consistency === "inconsistent"
      ? "incomplete"
      : "indeterminate",
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
  const planned = admittedPlan(admission, prepared)
  const allocation =
    admission.mode === "same-project"
      ? { status: "allocated" as const, numbers: planned.tasks.map((task) => task.protectedIssue.number) }
      : yield* allocateTransferTree(
          admission.allocate,
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
  const write = planTransferTreeWrites(planned, destination, allocation.numbers, admission.lastRank)
  if (write === undefined)
    return yield* stoppedResult(
      "incomplete",
      "Identifier plan is incomplete or duplicate; task batch was not sent.",
      prepared,
      destination,
      progress
    )
  return yield* executePlannedWrite(client, prepared, destination, params, progress, write, admission)
})

const executePlannedWrite = Effect.fn("transfer.executePlannedWrite")(function* (
  client: HulyClient["Service"],
  prepared: TransferPlan,
  destination: MovementProject,
  params: MoveIssueParams,
  progress: ExecutionProgress,
  write: TransferTreeWrite,
  admission: ReadyAdmission
): Effect.fn.Return<MoveIssueResult, MovementError> {
  if (admission.mode === "same-project") {
    const { plan } = admission.inspected
    if (plan.root.attachedTo === (plan.parent?._id ?? movementNoParent) && !writeRepairsAncestry(write))
      return yield* finishVerification(client, prepared, destination, write, progress)
    return yield* commitAndVerify(client, prepared, destination, write, progress, admission.commit)
  }
  const presend = yield* Effect.result(reinspect(client, prepared, destination, params))
  if (presend._tag === "Failure")
    return yield* stoppedResult(
      "indeterminate",
      "Pre-send inspection unavailable; task batch was not sent. Prior allocations may leave gaps.",
      prepared,
      destination,
      progress
    )
  if (presend.success === undefined) {
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

type ReadyAdmission = {
  readonly status: "ready"
  readonly commit: NonNullable<HulyClient["Service"]["commitTransferTree"]>
} & (
  | { readonly mode: "same-project"; readonly lastRank: undefined; readonly inspected: TransferPlan }
  | {
      readonly mode: "cross-project"
      readonly lastRank: string | undefined
      readonly allocate: NonNullable<HulyClient["Service"]["allocateMovementNumber"]>
    }
)
// The same-project proof remains current through pure planning; allocation expires the cross-project proof.
const admittedPlan = (admission: ReadyAdmission, prepared: TransferPlan): TransferPlan =>
  admission.mode === "same-project" ? admission.inspected : prepared

type Admission = ReadyAdmission | { readonly status: "blocked"; readonly reason: string }
const admissionFailureReason = (failure: MovementError | Cause.TimeoutError): string =>
  Cause.isTimeoutError(failure)
    ? "Pre-allocation inspection exceeded its deadline; no allocation or task writes performed."
    : "Pre-allocation inspection unavailable; no allocation or task writes performed."

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
  const admission = yield* Effect.result(
    reinspect(client, prepared, destination, params).pipe(Effect.timeout(TRANSFER_DISCOVERY_BUDGET))
  )
  if (admission._tag === "Failure") return { status: "blocked", reason: admissionFailureReason(admission.failure) }
  if (admission.success === undefined)
    return {
      status: "blocked",
      reason:
        "Task, ownership or hierarchy snapshots changed before allocation; inspect stable IDs and rebuild the call."
    }
  if (destination._id === prepared.plan.source._id)
    return { status: "ready", mode: "same-project", lastRank: undefined, inspected: admission.success, commit }
  const allocate = client.allocateMovementNumber
  if (allocate === undefined)
    return {
      status: "blocked",
      reason: "Single-send sequence adapter is unavailable; no allocation or task writes performed."
    }
  const last = yield* Effect.result(
    client.findOne<Issue>(tracker.class.Issue, hulyQuery<Issue>({ space: toRef<Project>(destination._id) }), {
      sort: { rank: SortingOrder.Descending }
    })
  )
  return last._tag === "Failure"
    ? { status: "blocked", reason: "Destination ordering inspection failed before writes." }
    : { status: "ready", mode: "cross-project", lastRank: last.success?.rank, commit, allocate }
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
  yield* Ref.set<MovementUncertaintyEvidence["execution"] | undefined>(progress.execution, {
    phase: "commit",
    commit: "sent",
    reservations
  })
  const committed = yield* Effect.result(
    commit(write, (transactions, batch) =>
      Effect.gen(function* () {
        yield* Ref.set(progress.transactions, transactions)
        yield* Ref.update<MovementBatchCapture>(progress.batch, (current) =>
          current.status === "awaiting" ? { status: "captured", batch } : { status: "repeated" }
        )
      })
    )
  )
  if (committed._tag === "Failure")
    return yield* failedCommit(client, prepared, destination, write, progress, committed.failure, reservations)
  if (committed.success === "condition-not-met") {
    yield* Ref.set<MovementUncertaintyEvidence["execution"] | undefined>(progress.execution, {
      phase: "commit",
      commit: "refused",
      reservations
    })
    yield* observeFailure(client, prepared, destination, write, progress)
    return yield* stoppedResult(
      "incomplete",
      "Scoped conditions refused the task batch; inspect concurrent state before a new call.",
      prepared,
      destination,
      progress
    )
  }
  yield* Ref.set<MovementUncertaintyEvidence["execution"] | undefined>(progress.execution, {
    phase: "verification",
    commit: "acknowledged",
    reservations
  })
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
    verifyTransferTree(
      client,
      prepared,
      destination,
      write,
      (observed) => publishVerification(progress.verification, progress.verificationFacts, observed),
      yield* Ref.get(progress.transactions),
      yield* capturedMovementBatch(progress)
    ).pipe(
      Effect.tap((value) =>
        value.status === "unavailable"
          ? interruptVerification(progress.verification, progress.verificationFacts, value.reason).pipe(Effect.asVoid)
          : Effect.void
      ),
      Effect.repeat({
        schedule: Schedule.spaced("200 millis"),
        times: 4,
        while: (value) => value.status === "observed" && value.consistency !== "consistent"
      })
    )
  )
  if (result._tag === "Failure") {
    const verification = yield* interruptVerification(
      progress.verification,
      progress.verificationFacts,
      "Post-send verification read failed or exceeded the deadline."
    )
    return yield* stoppedResult(
      verification.status === "observed" && verification.consistency === "inconsistent"
        ? "incomplete"
        : "indeterminate",
      "Verification reads unavailable; no automatic retry or rollback attempted.",
      prepared,
      destination,
      progress
    )
  }
  const observed = yield* Ref.get(progress.verification)
  if (observed.status === "observed" && observed.consistency === "inconsistent")
    return yield* stoppedResult("incomplete", observed.reason, prepared, destination, progress)
  if (observed.status !== "observed" || observed.completeness !== "complete")
    return yield* stoppedResult(
      "indeterminate",
      "Complete verification is unavailable; inspect current stable IDs.",
      prepared,
      destination,
      progress
    )
  return completedTransferTreeResult(client, prepared, destination, write)
})
