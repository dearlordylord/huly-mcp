import { channel, hasSubscribers } from "node:diagnostics_channel"
import { Schema } from "effect"

export const RESIDENT_RESPONSE_CHANNEL = "huly.resident-response-ownership"
export const ResidentResponseObservation = Schema.Struct({
  request: Schema.Natural,
  event: Schema.Literals(["Started", "Progress", "OwnReply", "ForeignReply", "End"]),
  accepted: Schema.Boolean
})
export type ResidentResponseObservation = Schema.Schema.Type<typeof ResidentResponseObservation>

// An absent ordinal suppresses notification-only instrumentation; it is not a
// serialized observation. Published ordinals never contain wire ids or payloads.
type ObservationInput = Omit<ResidentResponseObservation, "request"> & { readonly request: number | undefined }

export const observeResidentResponse = (observation: ObservationInput): void => {
  if (observation.request === undefined || !hasSubscribers(RESIDENT_RESPONSE_CHANNEL)) return
  channel(RESIDENT_RESPONSE_CHANNEL).publish(
    Schema.encodeSync(ResidentResponseObservation)({ ...observation, request: observation.request })
  )
}
