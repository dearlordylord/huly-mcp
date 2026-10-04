import { Effect, Ref, Schema } from "effect"
import type { MovementProject } from "../../domain/schemas/issue-movement-state.js"
import type { MovementUncertaintyEvidence } from "../../domain/schemas/issue-movement-uncertainty.js"
import { TransferSequenceSchema } from "../../domain/schemas/issue-transfer.js"
import type { IssueId, PositiveInteger } from "../../domain/schemas/shared.js"
import type { HulyClient } from "../client.js"
import { MovementTransportError } from "../movement-transaction-transport.js"

export type MovementExecutionProgress = Ref.Ref<MovementUncertaintyEvidence["execution"] | undefined>
// Internal allocation proof; a missing response never supplies an invented number.
export type TransferTreeAllocation =
  | { readonly status: "allocated"; readonly numbers: ReadonlyArray<PositiveInteger> }
  | {
      readonly status: "refused" | "uncertain"
      readonly numbers: ReadonlyArray<PositiveInteger>
      readonly reason: string
    }
const parseSequence = (input: unknown) => Schema.decodeUnknownOption(TransferSequenceSchema)(input)

export const allocateTransferTree = Effect.fn("transfer.allocateTree")(function* (
  allocate: NonNullable<HulyClient["Service"]["allocateMovementNumber"]>,
  destination: MovementProject,
  issueIds: ReadonlyArray<IssueId>,
  execution: MovementExecutionProgress
): Effect.fn.Return<TransferTreeAllocation> {
  const numbers: Array<PositiveInteger> = []
  const reservations: Array<MovementUncertaintyEvidence["execution"]["reservations"][number]> = []
  for (const issueId of issueIds) {
    yield* Ref.set(execution, {
      phase: "allocation",
      commit: "not-sent",
      reservations: [...reservations, { status: "uncertain", issueId }]
    })
    const allocated = yield* Effect.result(allocate(destination._id))
    if (allocated._tag === "Failure") {
      const refused = allocated.failure instanceof MovementTransportError && allocated.failure.phase === "before-send"
      if (refused)
        yield* Ref.set(
          execution,
          reservations.length === 0
            ? undefined
            : { phase: "allocation", commit: "not-sent", reservations: [...reservations] }
        )
      return {
        status: refused ? "refused" : "uncertain",
        numbers,
        reason: refused
          ? "Sequence request was refused before send. Task batch was not sent; prior confirmed reservations may leave gaps."
          : "Sequence allocation response unavailable; reservation may have occurred. Task batch was not sent; gaps may remain."
      }
    }
    const parsed = parseSequence(allocated.success)
    if (parsed._tag === "None")
      return {
        status: "uncertain",
        numbers,
        reason: "Sequence result is invalid; reservation may have occurred. Task batch was not sent; gaps may remain."
      }
    numbers.push(parsed.value.object.sequence)
    reservations.push({ status: "confirmed", issueId, number: parsed.value.object.sequence })
    yield* Ref.set(execution, { phase: "allocation", commit: "not-sent", reservations: [...reservations] })
  }
  return { status: "allocated", numbers }
})
