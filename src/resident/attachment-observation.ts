import type { Count } from "../domain/schemas/shared.js"
import type { AttachmentCloseReason, ResidentFailureEvent } from "../telemetry/events.js"
import { reportTelemetry } from "../telemetry/events.js"
import type { TelemetryOperations } from "../telemetry/telemetry.js"

const NANOS_PER_MILLISECOND = 1_000_000

// Internal lifecycle capability. Its ID is unrelated to admission credentials.
export const makeAttachmentObservation = (telemetry: TelemetryOperations, id: string, startedAt: bigint) => {
  let admitted = false
  let active = false
  let closed = false
  let closingReason: AttachmentCloseReason = "unknown"
  const incidents = new Set<string>()
  const context = {
    id,
    observeActivity: () => {
      if (!admitted || active || closed) return
      active = true
      reportTelemetry(() =>
        telemetry.residentAttachment({ phase: "activity_observed", attachment_id: id, first_activity: "tool_call" })
      )
    }
  }
  return {
    context,
    admitted: (retained: Count) => {
      admitted = true
      reportTelemetry(() =>
        telemetry.residentAttachment({ phase: "admitted", attachment_id: id, retained_attachments: retained })
      )
    },
    closing: (reason: AttachmentCloseReason) => {
      if (closingReason === "unknown") closingReason = reason
    },
    closed: (now: bigint) => {
      if (!admitted || closed) return
      closed = true
      reportTelemetry(() =>
        telemetry.residentAttachment({
          phase: "closed",
          attachment_id: id,
          duration_ms: Number(now - startedAt) / NANOS_PER_MILLISECOND,
          reason: closingReason
        })
      )
    },
    failure: (event: Extract<ResidentFailureEvent, { readonly stage: "work" | "cleanup" }>) => {
      const { reason, stage } = event
      const incident = `${stage}:${reason}`
      if (stage === "cleanup" && incidents.has(incident)) return
      if (stage === "cleanup") incidents.add(incident)
      reportTelemetry(() => telemetry.residentFailure({ ...event, attachment_id: id }))
    }
  }
}
export type AttachmentObservation = ReturnType<typeof makeAttachmentObservation>
