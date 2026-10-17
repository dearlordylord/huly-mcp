import { channel } from "node:diagnostics_channel"
import { Schema } from "effect"
import { expect, it } from "vitest"

import {
  observeResidentResponse,
  RESIDENT_RESPONSE_CHANNEL,
  ResidentResponseObservation
} from "../../src/resident/response-observations.js"

it("publishes response ordinals only to active subscribers and suppresses notifications", () => {
  const observed: Array<ResidentResponseObservation> = []
  const subscriber = (value: unknown) => observed.push(Schema.decodeUnknownSync(ResidentResponseObservation)(value))
  const diagnostic = channel(RESIDENT_RESPONSE_CHANNEL)
  diagnostic.subscribe(subscriber)
  try {
    observeResidentResponse({ request: undefined, event: "Started", accepted: true })
    observeResidentResponse({ request: 1, event: "OwnReply", accepted: true })
    expect(observed).toEqual([{ request: 1, event: "OwnReply", accepted: true }])
  } finally {
    diagnostic.unsubscribe(subscriber)
  }
  observeResidentResponse({ request: 2, event: "End", accepted: true })
  expect(observed).toHaveLength(1)
})
