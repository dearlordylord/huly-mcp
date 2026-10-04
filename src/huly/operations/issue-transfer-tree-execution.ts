import { isDeepStrictEqual } from "node:util"
import type { Issue, Project } from "@hcengineering/tracker"
import { SortingOrder } from "@hcengineering/core"
import { Effect, Schedule, Ref } from "effect"
import type { MoveIssueParams } from "../../domain/schemas/issue-movement.js"
import type { MovementProject } from "../../domain/schemas/issue-movement-state.js"
import type { TransferTreeWrite } from "../../domain/schemas/issue-transfer-tree.js"
import type { MoveIssueResult } from "../../domain/schemas/issues-results.js"
import type { HulyClient, HulyClientError } from "../client.js"
import type { HulyConditionalWriteResult } from "../../domain/schemas/shared.js"
import { tracker } from "../huly-plugins.js"
import type { MovementError } from "./issue-movement-preflight.js"
import { inspectTransferPlan, type TransferPlan } from "./issue-transfer-preflight.js"
import { planTransferTreeWrites } from "./issue-transfer-tree-planning.js"
import { verifyTransferTree } from "./issue-transfer-tree-verification.js"
import { hulyQuery } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"
import { TRANSFER_DISCOVERY_BUDGET, TRANSFER_EXECUTION_BUDGET } from "./issue-transfer-tree.js"
import { allocateTransferTree } from "./issue-transfer-tree-allocation.js"
import { transferTreeFailure, transferTreeRefusal, completedTransferTreeResult } from "./issue-transfer-tree-results.js"

type ExecutionPhase = "inspection" | "allocation" | "commit" | "verification"

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
  const phase = yield* Ref.make<ExecutionPhase>("inspection")
  const result = yield* Effect.result(
    executeTreeWithinBudget(client, prepared, destination, params, phase).pipe(
      Effect.timeout(TRANSFER_EXECUTION_BUDGET)
    )
  )
  if (result._tag === "Success") return result.success
  const stopped = yield* Ref.get(phase)
  return stopped === "inspection"
    ? transferTreeRefusal(
        "Execution inspection deadline or read failed before any allocation; no writes performed.",
        prepared,
        destination
      )
    : transferTreeFailure(
        "indeterminate",
        `${stopped} deadline or response unavailable; effects may have occurred. Inspect every stable ID before retry.`,
        prepared,
        destination
      )
})

const executeTreeWithinBudget = Effect.fn("transfer.executeTreeWithinBudget")(function* (
  client: HulyClient["Service"],
  prepared: TransferPlan,
  destination: MovementProject,
  params: MoveIssueParams,
  phase: Ref.Ref<ExecutionPhase>
): Effect.fn.Return<MoveIssueResult, MovementError> {
  const admission = yield* inspectExecutionAdmission(client, prepared, destination, params)
  if (admission.status === "blocked") return transferTreeRefusal(admission.reason, prepared, destination)
  yield* Ref.set(phase, "allocation")
  const allocation = yield* allocateTransferTree(client, destination, prepared.tasks.length)
  if (allocation.status === "uncertain")
    return transferTreeFailure("indeterminate", allocation.reason, prepared, destination)
  const write = planTransferTreeWrites(prepared, destination, allocation.numbers, admission.lastRank)
  if (write === undefined)
    return transferTreeFailure(
      "incomplete",
      "Reserved identifiers are incomplete or duplicate; task batch was not sent. Gaps may remain.",
      prepared,
      destination
    )
  const presend = yield* Effect.result(
    reinspect(client, prepared, destination, params).pipe(Effect.timeout(TRANSFER_DISCOVERY_BUDGET))
  )
  if (presend._tag === "Failure")
    return transferTreeFailure(
      "indeterminate",
      "Pre-send inspection is unavailable after allocation; task batch was not sent.",
      prepared,
      destination
    )
  if (!presend.success)
    return transferTreeFailure(
      "incomplete",
      "Tree or protected snapshots changed after allocation; task batch was not sent. Gaps may remain.",
      prepared,
      destination
    )
  return yield* commitAndVerifyTree(client, prepared, destination, write, phase)
})

type ExecutionAdmission =
  | { readonly status: "ready"; readonly lastRank: string | undefined }
  | { readonly status: "blocked"; readonly reason: string }
const inspectExecutionAdmission = Effect.fn("transfer.inspectExecutionAdmission")(function* (
  client: HulyClient["Service"],
  prepared: TransferPlan,
  destination: MovementProject,
  params: MoveIssueParams
): Effect.fn.Return<ExecutionAdmission, MovementError> {
  if (client.commitTransferTree === undefined)
    return { status: "blocked", reason: "Complete-tree batch adapter is unavailable; no writes performed." }
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
  if (admission._tag === "Failure" || !admission.success)
    return {
      status: "blocked",
      reason: "Tree or protected snapshots changed before allocation; rebuild the request from current stable IDs."
    }
  return { status: "ready", lastRank: last.success?.rank }
})

const commitAndVerifyTree = Effect.fn("transfer.commitAndVerifyTree")(function* (
  client: HulyClient["Service"],
  prepared: TransferPlan,
  destination: MovementProject,
  write: TransferTreeWrite,
  phase: Ref.Ref<ExecutionPhase>
): Effect.fn.Return<MoveIssueResult, MovementError> {
  yield* Ref.set(phase, "commit")
  const committed = yield* Effect.result(sendTransferTree(client, write))
  if (committed._tag === "Failure")
    return transferTreeFailure(
      "indeterminate",
      "Commit response unavailable; tree movement effects may have occurred. Reserved numbers may leave gaps.",
      prepared,
      destination
    )
  if (committed.success === "condition-not-met")
    return transferTreeFailure(
      "incomplete",
      "SDK refused tree commit conditions after allocation; reserved numbers may leave gaps.",
      prepared,
      destination
    )
  yield* Ref.set(phase, "verification")
  const verification = yield* verifyTransferTree(client, prepared, destination, write).pipe(
    Effect.repeat({
      schedule: Schedule.spaced("200 millis"),
      times: 4,
      while: (value) => value.status === "inconsistent"
    }),
    Effect.result
  )
  if (verification._tag === "Failure")
    return transferTreeFailure(
      "indeterminate",
      "Post-send verification reads are unavailable; inspect every stable task ID before retry.",
      prepared,
      destination
    )
  if (verification.success.status === "unavailable")
    return transferTreeFailure("indeterminate", verification.success.reason, prepared, destination)
  if (verification.success.status === "inconsistent")
    return transferTreeFailure("incomplete", verification.success.reason, prepared, destination)
  return completedTransferTreeResult(client, prepared, destination, write)
})

const sendTransferTree = (
  client: HulyClient["Service"],
  write: TransferTreeWrite
): Effect.Effect<HulyConditionalWriteResult, HulyClientError> => {
  if (client.commitTransferTree !== undefined) return client.commitTransferTree(write)
  return Effect.succeed("condition-not-met")
}
