import { Effect, Schema } from "effect"
import type { TransferConflict } from "../../domain/schemas/issue-transfer.js"
import type { MovementIssue } from "../../domain/schemas/issue-movement-state.js"
import { HulyDataInvalidError } from "../errors-base.js"

export const parseTransferSnapshot = <A, R>(
  schema: Schema.ConstraintDecoder<A, R>,
  input: unknown
): Effect.Effect<A, HulyDataInvalidError, R> =>
  Schema.decodeUnknownEffect(schema)(input).pipe(
    Effect.mapError(
      (cause) => new HulyDataInvalidError({ operation: "move_issue", entity: "transfer preflight", cause })
    )
  )
export const transferConflict = (
  root: MovementIssue,
  code: Exclude<TransferConflict["code"], "attribute" | "stale-resolution">,
  reason: TransferConflict["reason"]
): TransferConflict => ({ code, issueId: root._id, identifier: root.identifier, reason })
