/**
 * Calendar domain operations — one-time event CRUD + barrel re-export.
 *
 * Split into:
 * - calendar-shared: shared helpers (SDK bridges, participant resolution, etc.)
 * - calendar (this file): one-time event CRUD (list, get, create, update, delete)
 * - calendar-recurring: recurring event ops (list, create, list instances)
 *
 * @module
 */
import type { Event as HulyEvent } from "@hcengineering/calendar"
import type { DocumentQuery } from "@hcengineering/core"
import { SortingOrder } from "@hcengineering/core"
import { Effect } from "effect"

import type { DeleteEventResult } from "../../domain/schemas/calendar-results.js"
import type {
  CalendarSummary,
  DeleteEventParams,
  Event,
  EventSummary,
  GetEventParams,
  ListCalendarsParams,
  ListEventsParams
} from "../../domain/schemas/calendar.js"
import { CalendarEventTitle, CalendarName } from "../../domain/schemas/calendar.js"
import { CalendarId, Email, EventId, PersonId, Timestamp, TimeZoneId } from "../../domain/schemas/shared.js"
import { HulyClient, type HulyClientError } from "../client.js"
import type { Diagnostics } from "../diagnostics.js"
import { EventNotFoundError } from "../errors.js"
import { calendar } from "../huly-plugins.js"
import { lookupEventRooms } from "./calendar-meeting-rooms.js"
import {
  accessToString,
  buildParticipants,
  descriptionAsMarkupRef,
  findWritableCalendars,
  getDefaultCalendarRef,
  toWritableCalendarAccess,
  visibilityToString
} from "./calendar-shared.js"
import { hulyNonEmptyTextOrFallback } from "./non-empty-text.js"
import { clampLimit } from "./query-helpers.js"

// Re-export recurring operations for barrel consumers
export { createRecurringEvent, listEventInstances, listRecurringEvents } from "./calendar-recurring.js"
export { createEvent, updateEvent } from "./calendar-event-writes.js"
export { createSchedule, deleteSchedule, getSchedule, listSchedules, updateSchedule } from "./calendar-schedules.js"
export { listCalendarSettings, setPrimaryCalendar, updateCalendarSettings } from "./calendar-settings.js"

// --- Error types ---

type ListEventsError = HulyClientError
type ListCalendarsError = HulyClientError
type GetEventError = HulyClientError | EventNotFoundError
type DeleteEventError = HulyClientError | EventNotFoundError

// --- Operations ---

const nonEmptyString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() !== "" ? value : undefined

const optionalTimestamp = (value: number | undefined) => (value === undefined ? undefined : Timestamp.make(value))

const optionalTimeZoneId = (value: string | undefined) => (value === undefined ? undefined : TimeZoneId.make(value))

const UNTITLED_EVENT = CalendarEventTitle.make("Untitled Event")
const UNTITLED_CALENDAR = CalendarName.make("Untitled Calendar")

const eventTitle = (title: string): CalendarEventTitle =>
  hulyNonEmptyTextOrFallback(CalendarEventTitle, title, UNTITLED_EVENT)

const calendarName = (name: string): CalendarName => hulyNonEmptyTextOrFallback(CalendarName, name, UNTITLED_CALENDAR)

export const listEvents = (
  params: ListEventsParams
): Effect.Effect<Array<EventSummary>, ListEventsError, HulyClient | Diagnostics> =>
  Effect.gen(function* () {
    const client = yield* HulyClient

    const query: DocumentQuery<HulyEvent> = {}

    if (params.from !== undefined) {
      query.date = { $gte: params.from }
    }

    if (params.to !== undefined) {
      query.dueDate = { $lte: params.to }
    }

    const limit = clampLimit(params.limit)

    const events = yield* client.findAll<HulyEvent>(calendar.class.Event, query, {
      limit,
      sort: { date: SortingOrder.Ascending }
    })
    const meetingRooms = yield* lookupEventRooms(client, events)

    const summaries: Array<EventSummary> = events.flatMap((event) => {
      const eventId = nonEmptyString(event.eventId) ?? nonEmptyString(event._id)
      if (eventId === undefined) return []
      const calendarId = nonEmptyString(event.calendar)
      return [
        {
          eventId: EventId.make(eventId),
          title: eventTitle(event.title),
          date: Timestamp.make(event.date),
          dueDate: Timestamp.make(event.dueDate),
          allDay: event.allDay,
          location: event.location,
          calendarId: calendarId === undefined ? undefined : CalendarId.make(calendarId),
          timeZone: optionalTimeZoneId(event.timeZone),
          blockTime: event.blockTime,
          meetingRoom: meetingRooms.get(String(event._id)),
          modifiedOn: optionalTimestamp(event.modifiedOn)
        }
      ]
    })

    return summaries
  })

export const listCalendars = (
  _params: ListCalendarsParams
): Effect.Effect<Array<CalendarSummary>, ListCalendarsError, HulyClient> =>
  Effect.gen(function* () {
    const client = yield* HulyClient

    const calendars = yield* findWritableCalendars(client)
    const primaryCalendarRef = yield* getDefaultCalendarRef(client)

    return calendars.flatMap((cal) => {
      const access = toWritableCalendarAccess(cal.access)
      if (access === undefined) return []
      return [
        {
          calendarId: CalendarId.make(cal._id),
          name: calendarName(cal.name),
          hidden: cal.hidden,
          visibility: visibilityToString(cal.visibility) ?? "private",
          user: PersonId.make(cal.user),
          access,
          isPrimary: cal._id === primaryCalendarRef
        }
      ]
    })
  })

export const getEvent = (params: GetEventParams): Effect.Effect<Event, GetEventError, HulyClient | Diagnostics> =>
  Effect.gen(function* () {
    const client = yield* HulyClient

    const event = yield* client.findOne<HulyEvent>(calendar.class.Event, { eventId: params.eventId })

    if (event === undefined) {
      return yield* new EventNotFoundError({ eventId: params.eventId })
    }

    const participants = yield* buildParticipants(client, event.participants)
    const meetingRooms = yield* lookupEventRooms(client, [event])

    const description: string | undefined = event.description
      ? yield* client.fetchMarkup(
          calendar.class.Event,
          event._id,
          "description",
          descriptionAsMarkupRef(event.description),
          "markdown"
        )
      : undefined

    const result: Event = {
      eventId: EventId.make(event.eventId),
      title: eventTitle(event.title),
      description,
      date: Timestamp.make(event.date),
      dueDate: Timestamp.make(event.dueDate),
      allDay: event.allDay,
      location: event.location,
      visibility: visibilityToString(event.visibility),
      participants,
      externalParticipants: (event.externalParticipants || []).map((p) => Email.make(p)),
      reminders: event.reminders?.map((reminder) => Timestamp.make(reminder)),
      access: accessToString(event.access),
      timeZone: optionalTimeZoneId(event.timeZone),
      blockTime: event.blockTime,
      calendarId: CalendarId.make(event.calendar),
      meetingRoom: meetingRooms.get(String(event._id)),
      modifiedOn: optionalTimestamp(event.modifiedOn),
      createdOn: optionalTimestamp(event.createdOn)
    }

    return result
  })

export const deleteEvent = (
  params: DeleteEventParams
): Effect.Effect<DeleteEventResult, DeleteEventError, HulyClient> =>
  Effect.gen(function* () {
    const client = yield* HulyClient

    const event = yield* client.findOne<HulyEvent>(calendar.class.Event, { eventId: params.eventId })

    if (event === undefined) {
      return yield* new EventNotFoundError({ eventId: params.eventId })
    }

    yield* client.removeDoc(calendar.class.Event, event.space, event._id)

    return { eventId: EventId.make(params.eventId), deleted: true }
  })
