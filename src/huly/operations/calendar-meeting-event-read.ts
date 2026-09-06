import type { Event as HulyEvent } from "@hcengineering/calendar"
import { Effect, Schedule } from "effect"

import { Count, type DocId, type EventId } from "../../domain/schemas/shared.js"
import type { HulyClient, HulyClientError } from "../client.js"
import { EventSiblingConvergenceError } from "../errors.js"
import { calendar } from "../huly-plugins.js"
import { hulyQuery } from "./query-helpers.js"

const EVENT_SIBLING_OBSERVATION_READS = 5
const EVENT_SIBLING_QUIET_READS = 3
const EVENT_SIBLING_POLL_INTERVAL = "500 millis"

// HulyClient owns one live SDK session and exposes no fresh-session read. Early
// identical snapshots therefore do not end observation; the final three reads
// must remain quiet across the full bounded two-second window.

type EventSetSignature = string

const eventSetSignature = (events: ReadonlyArray<HulyEvent>): EventSetSignature =>
  events
    .map((event) => String(event._id))
    .sort()
    .join("\u0000")

export const readStableEventSiblings = Effect.fn("CalendarMeeting.readStableEventSiblings")(function* (
  client: HulyClient["Service"],
  eventId: EventId,
  expectedDocumentIds: ReadonlyArray<DocId> = []
): Effect.fn.Return<ReadonlyArray<HulyEvent>, HulyClientError | EventSiblingConvergenceError> {
  const signatures: Array<EventSetSignature> = []
  const poll = Effect.suspend(() =>
    client.findAll<HulyEvent>(calendar.class.Event, hulyQuery<HulyEvent>({ eventId }))
  ).pipe(
    Effect.map((events) => {
      signatures.push(eventSetSignature(events))
      return events
    })
  )
  const result = yield* poll.pipe(
    Effect.repeat({
      schedule: Schedule.spaced(EVENT_SIBLING_POLL_INTERVAL),
      times: EVENT_SIBLING_OBSERVATION_READS - 1
    })
  )
  const finalSignature = eventSetSignature(result)
  const quiet = signatures.slice(-EVENT_SIBLING_QUIET_READS).every((signature) => signature === finalSignature)
  const observedIds = new Set(result.map((event) => String(event._id)))
  const expectedObserved = expectedDocumentIds.every((documentId) => observedIds.has(String(documentId)))
  if (!quiet || !expectedObserved) {
    return yield* new EventSiblingConvergenceError({ eventId, reads: Count.make(EVENT_SIBLING_OBSERVATION_READS) })
  }
  return result
})
