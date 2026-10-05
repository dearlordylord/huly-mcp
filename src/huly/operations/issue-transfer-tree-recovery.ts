import type { MovementBatchVerification } from "./issue-movement-batch-anchor.js"
import type { MovementTransactionBatch, MovementTransactions } from "../issue-movement-transactions.js"
import {
  publishVerification,
  interruptVerification,
  type VerificationFactsRef
} from "./issue-transfer-verification-progress.js"
import { Effect, Ref } from "effect"
import type { HulyClient } from "../client.js"
import type { MovementWriteError } from "../movement-write-client.js"
import { MovementTransportError } from "../movement-transaction-transport.js"
import type { MovementProject } from "../../domain/schemas/issue-movement-state.js"
import type { MovementUncertaintyEvidence } from "../../domain/schemas/issue-movement-uncertainty.js"
import type { TransferTreeWrite } from "../../domain/schemas/issue-transfer-tree.js"
import type { MoveIssueResult } from "../../domain/schemas/issues-results.js"
import type { TransferPlan } from "./issue-transfer-preflight.js"
import type { MovementExecutionProgress } from "./issue-transfer-tree-allocation.js"
import { verifyTransferTree, type TransferTreeVerification } from "./issue-transfer-tree-verification.js"
import { transferTreeFailure, transferTreeRefusal } from "./issue-transfer-tree-results.js"
import { TRANSFER_DISCOVERY_BUDGET } from "./issue-transfer-tree.js"

// Internal publication state prevents multiple callbacks from claiming one batch.
export type MovementBatchCapture =
  | { readonly status: "awaiting" }
  | { readonly status: "captured"; readonly batch: MovementTransactionBatch | undefined }
  | { readonly status: "repeated" }
  | { readonly status: "invalid-evidence" }
export const capturedMovementBatch = (progress: ExecutionProgress): Effect.Effect<MovementBatchVerification> =>
  Effect.succeed({
    batch: Ref.get(progress.batch).pipe(Effect.map((value) => (value.status === "captured" ? value.batch : undefined))),
    invalidate: Ref.set(progress.batch, { status: "invalid-evidence" })
  })
// Request-local progress proof; no durable state or replay protocol is introduced.
export interface ExecutionProgress {
  readonly transactions: Ref.Ref<MovementTransactions>
  readonly batch: Ref.Ref<MovementBatchCapture>
  readonly execution: MovementExecutionProgress
  readonly verification: Ref.Ref<TransferTreeVerification>
  readonly verificationFacts: VerificationFactsRef
}

export const stoppedResult = Effect.fn("transfer.stoppedResult")(function* (
  outcome: "incomplete" | "indeterminate",
  reason: string,
  prepared: TransferPlan,
  destination: MovementProject,
  progress: ExecutionProgress
): Effect.fn.Return<MoveIssueResult> {
  const execution = yield* Ref.get(progress.execution)
  return execution === undefined
    ? transferTreeRefusal(`${reason} No move-related write was sent.`, prepared, destination)
    : transferTreeFailure(outcome, reason, prepared, destination, {
        execution,
        verification: yield* Ref.get(progress.verification)
      })
})

export const observeFailure = Effect.fn("transfer.observeFailure")(function* (
  client: HulyClient["Service"],
  prepared: TransferPlan,
  destination: MovementProject,
  write: TransferTreeWrite,
  progress: ExecutionProgress
): Effect.fn.Return<void> {
  const observed = yield* Effect.result(
    verifyTransferTree(
      client,
      prepared,
      destination,
      write,
      (observed) => publishVerification(progress.verification, progress.verificationFacts, observed),
      yield* Ref.get(progress.transactions),
      yield* capturedMovementBatch(progress)
    ).pipe(Effect.timeout(TRANSFER_DISCOVERY_BUDGET))
  )
  if (observed._tag === "Failure")
    yield* interruptVerification(
      progress.verification,
      progress.verificationFacts,
      "Current task/ownership/hierarchy state could not be read completely."
    )
  else if (observed.success.status === "unavailable")
    yield* interruptVerification(progress.verification, progress.verificationFacts, observed.success.reason)
})

export const failedCommit = Effect.fn("transfer.failedCommit")(function* (
  client: HulyClient["Service"],
  prepared: TransferPlan,
  destination: MovementProject,
  write: TransferTreeWrite,
  progress: ExecutionProgress,
  error: MovementWriteError,
  reservations: MovementUncertaintyEvidence["execution"]["reservations"]
): Effect.fn.Return<MoveIssueResult> {
  const noSend = error instanceof MovementTransportError && error.phase === "before-send"
  const beforeSendState: MovementUncertaintyEvidence["execution"] | undefined =
    reservations.length === 0 ? undefined : { phase: "allocation", commit: "not-sent", reservations }
  yield* Ref.set<MovementUncertaintyEvidence["execution"] | undefined>(
    progress.execution,
    noSend ? beforeSendState : { phase: "commit", commit: "reply-lost", reservations }
  )
  yield* observeFailure(client, prepared, destination, write, progress)
  return yield* stoppedResult(
    noSend ? "incomplete" : "indeterminate",
    noSend
      ? "Commit failed before send; task batch was not sent. Prior allocations may leave gaps."
      : "Commit reply unavailable; effects may have occurred. No resend or rollback attempted; reserved numbers may leave gaps.",
    prepared,
    destination,
    progress
  )
})
