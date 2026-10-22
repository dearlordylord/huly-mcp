import { Schema } from "effect"

import { Count } from "../domain/schemas/shared.js"

export const RuntimeModeSchema = Schema.Literals(["stdio", "http", "resident", "cli"])
export type RuntimeMode = Schema.Schema.Type<typeof RuntimeModeSchema>
export const ToolStatusSchema = Schema.Literals(["success", "error", "cancelled", "rejected"])
export type ToolStatus = Schema.Schema.Type<typeof ToolStatusSchema>
export const AttachmentIdSchema = Schema.String.check(Schema.isUUID())
export const AttachmentCloseReasonSchema = Schema.Literals(["release", "lease_expired", "backend_shutdown", "unknown"])
export type AttachmentCloseReason = Schema.Schema.Type<typeof AttachmentCloseReasonSchema>

const attachmentFields = { attachment_id: AttachmentIdSchema }
export const ResidentAttachmentEventSchema = Schema.Union([
  Schema.Struct({ ...attachmentFields, phase: Schema.Literal("admitted"), retained_attachments: Count }),
  Schema.Struct({
    ...attachmentFields,
    phase: Schema.Literal("activity_observed"),
    first_activity: Schema.Literal("tool_call")
  }),
  Schema.Struct({
    ...attachmentFields,
    phase: Schema.Literal("closed"),
    duration_ms: Schema.Number,
    reason: AttachmentCloseReasonSchema
  })
])
export type ResidentAttachmentEvent = Schema.Schema.Type<typeof ResidentAttachmentEventSchema>
const failureFields = { attachment_id: Schema.optionalKey(AttachmentIdSchema) }
export const ResidentFailureEventSchema = Schema.Union([
  Schema.Struct({
    ...failureFields,
    stage: Schema.Literal("admission"),
    reason: Schema.Literals(["capacity", "closing", "unknown", "pending", "failed"])
  }),
  Schema.Struct({
    ...failureFields,
    stage: Schema.Literal("compatibility"),
    reason: Schema.Literals(["capacity", "unknown", "mismatch", "encoding", "entropy", "input"])
  }),
  Schema.Struct({ ...failureFields, stage: Schema.Literal("work"), reason: Schema.Literals(["capacity", "closing"]) }),
  Schema.Struct({ ...failureFields, stage: Schema.Literal("cleanup"), reason: Schema.Literals(["pending", "failed"]) }),
  Schema.Struct({
    ...failureFields,
    stage: Schema.Literals(["startup", "backend", "native_channel"]),
    reason: Schema.Literal("failed")
  })
])
export type ResidentFailureEvent = Schema.Schema.Type<typeof ResidentFailureEventSchema>

/** Analytics is best-effort, including sinks supplied by alternate embeddings. */
export const reportTelemetry = (report: () => void): void => {
  try {
    report()
  } catch {
    return
  }
}
