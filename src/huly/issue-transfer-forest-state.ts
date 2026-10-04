import { type Effect, Schema } from "effect"
import { IssueId } from "../domain/schemas/shared.js"
import { TransferInspectionSchema } from "../domain/schemas/issue-transfer.js"

export const TransferForestEntrySchema = Schema.Union([
  Schema.Struct({ status: Schema.Literal("observed"), ownerId: IssueId, inspection: TransferInspectionSchema }),
  Schema.Struct({
    status: Schema.Literal("unavailable"),
    ownerId: IssueId,
    reason: Schema.Literals(["inspection-unavailable", "owner-unavailable", "conflicting-owner-observation"])
  })
])
export type TransferForestEntry = Schema.Schema.Type<typeof TransferForestEntrySchema>
export const TransferForestInspectionSchema = Schema.Array(TransferForestEntrySchema)
export type TransferForestInspection = Schema.Schema.Type<typeof TransferForestInspectionSchema>
// Internal request-local observer. Publish each owner only after its inspection settles,
// including a terminal incomplete inspection. Identical terminal repeats are allowed;
// partial prefixes and later refinements violate this completed-owner contract.
// Payloads are owned by TransferForestEntrySchema.
export type TransferForestProgress = (entry: TransferForestEntry) => Effect.Effect<void>
