import { Schema } from "effect"
import { subscribe, unsubscribe } from "node:diagnostics_channel"

import {
  HTTP_ADMISSION_CHANNEL,
  type HttpAdmissionObservation,
  HttpAdmissionObservationSchema
} from "../../src/mcp/http-admission-observations.js"

export const subscribeHttpAdmissionObservations = (
  forward: (observation: HttpAdmissionObservation) => void,
  onError: (error: unknown) => void
): (() => void) => {
  const receive = (input: unknown): void => {
    try {
      forward(Schema.decodeUnknownSync(HttpAdmissionObservationSchema)(input))
    } catch (error) {
      // Node rethrows subscriber exceptions outside publish(); report them through the owning test instead.
      onError(error)
    }
  }
  subscribe(HTTP_ADMISSION_CHANNEL, receive)
  return () => unsubscribe(HTTP_ADMISSION_CHANNEL, receive)
}
