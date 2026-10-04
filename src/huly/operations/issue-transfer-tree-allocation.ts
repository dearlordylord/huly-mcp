import type { Project } from "@hcengineering/tracker"
import { Effect, Schema } from "effect"
import type { MovementProject } from "../../domain/schemas/issue-movement-state.js"
import { TransferSequenceSchema } from "../../domain/schemas/issue-transfer.js"
import type { PositiveInteger } from "../../domain/schemas/shared.js"
import type { HulyClient } from "../client.js"
import { core, tracker } from "../huly-plugins.js"
import { toRef } from "./sdk-boundary.js"

// Internal allocation evidence; uncertain replies never manufacture a number.
export type TransferTreeAllocation =
  | { readonly status: "allocated"; readonly numbers: ReadonlyArray<PositiveInteger> }
  | { readonly status: "uncertain"; readonly numbers: ReadonlyArray<PositiveInteger>; readonly reason: string }
const parseSequence = (input: unknown) => Schema.decodeUnknownOption(TransferSequenceSchema)(input)

export const allocateTransferTree = Effect.fn("transfer.allocateTree")(function* (
  client: HulyClient["Service"],
  destination: MovementProject,
  count: number
): Effect.fn.Return<TransferTreeAllocation> {
  const numbers: Array<PositiveInteger> = []
  for (let index = 0; index < count; index++) {
    const allocated = yield* Effect.result(
      client.updateDoc(
        tracker.class.Project,
        core.space.Space,
        toRef<Project>(destination._id),
        { $inc: { sequence: 1 } },
        true
      )
    )
    if (allocated._tag === "Failure")
      return {
        status: "uncertain",
        numbers,
        reason: "Sequence allocation response unavailable; reservations may have occurred. Task batch was not sent."
      }
    const parsed = parseSequence(allocated.success)
    if (parsed._tag === "None")
      return {
        status: "uncertain",
        numbers,
        reason: "Sequence allocation returned no valid number; reservations may have occurred. Task batch was not sent."
      }
    numbers.push(parsed.value.object.sequence)
  }
  return { status: "allocated", numbers }
})
