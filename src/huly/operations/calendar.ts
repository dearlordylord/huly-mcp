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
import { type Event as HulyEvent, generateEventId } from "@hcengineering/calendar"
import type { AttachedData, Class, Doc, DocumentQuery, DocumentUpdate, Space } from "@hcengineering/core"
import { SortingOrder } from "@hcengineering/core"
import { Effect } from "effect"

import type {
  CalendarSummary,
  CreateEventParams,
  CreateEventResult,
  DeleteEventParams,
  DeleteEventResult,
  Event,
  EventSummary,
  GetEventParams,
  ListCalendarsParams,
  ListEventsParams,
  UpdateEventParams,
  UpdateEventResult
} from "../../domain/schemas/calendar.js"
import { CalendarEventTitle, CalendarName, UPDATE_EVENT_FIELDS } from "../../domain/schemas/calendar.js"
import { CalendarId, Email, EventId, PersonId, Timestamp, TimeZoneId } from "../../domain/schemas/shared.js"
import { HulyClient, type HulyClientError } from "../client.js"
import type {
  CalendarNotAccessibleError,
  NoUpdateFieldsError,
  PersonIdentifierAmbiguousError,
  PersonNotFoundError
} from "../errors.js"
import { EventNotFoundError } from "../errors.js"
import { calendar, core } from "../huly-plugins.js"
import { lookupEventRooms } from "./calendar-meeting-rooms.js"
import {
  accessToString,
  buildParticipants,
  descriptionAsMarkupRef,
  emptyEventDescription,
  findWritableCalendars,
  getDefaultCalendarRef,
  markupRefAsDescription,
  ONE_HOUR_MS,
  resolveCalendarRef,
  resolveEventInputs,
  resolveParticipantLocators,
  serverPopulatedUser,
  stringToAccess,
  toWritableCalendarAccess,
  visibilityToString
} from "./calendar-shared.js"
import { hulyNonEmptyTextOrFallback } from "./non-empty-text.js"
import { clampLimit } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"
import { mergeUpdateEntries, requireUpdateFields } from "./update-guards.js"

// Re-export recurring operations for barrel consumers
export { createRecurringEvent, listEventInstances, listRecurringEvents } from "./calendar-recurring.js"
export { createSchedule, deleteSchedule, getSchedule, listSchedules, updateSchedule } from "./calendar-schedules.js"

// --- Error types ---

type ListEventsError = HulyClientError
type ListCalendarsError = HulyClientError
type GetEventError = HulyClientError | EventNotFoundError
type CreateEventError =
  | HulyClientError
  | CalendarNotAccessibleError
  | PersonIdentifierAmbiguousError
  | PersonNotFoundError
type UpdateEventError =
  | HulyClientError
  | NoUpdateFieldsError
  | EventNotFoundError
  | CalendarNotAccessibleError
  | PersonIdentifierAmbiguousError
  | PersonNotFoundError
type DeleteEventError = HulyClientError | EventNotFoundError

// --- Operations ---

const uniqueRefs = <T>(values: ReadonlyArray<T>): Array<T> => [...new Set(values)]

const uniqueEmails = (values: ReadonlyArray<string>): Array<Email> =>
  [...new Set(values)].map((value) => Email.make(value))

const nonEmptyString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() !== "" ? value : undefined

const optionalTimestamp = (value: number | undefined) => value === undefined ? undefined : Timestamp.make(value)

const optionalTimeZoneId = (value: string | undefined) => value === undefined ? undefined : TimeZoneId.make(value)

const UNTITLED_EVENT = CalendarEventTitle.make("Untitled Event")
const UNTITLED_CALENDAR = CalendarName.make("Untitled Calendar")

const eventTitle = (title: string): CalendarEventTitle =>
  hulyNonEmptyTextOrFallback(CalendarEventTitle, title, UNTITLED_EVENT)

const calendarName = (name: string): CalendarName => hulyNonEmptyTextOrFallback(CalendarName, name, UNTITLED_CALENDAR)

export const listEvents = (
  params: ListEventsParams
): Effect.Effect<Array<EventSummary>, ListEventsError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient

    const query: DocumentQuery<HulyEvent> = {}

    if (params.from !== undefined) {
      query.date = { $gte: params.from }
    }

    if (params.to !== undefined) {
      query.dueDate = { $lte: params.to }
    }

    const limit = clampLimit(params.limit)

    const events = yield* client.findAll<HulyEvent>(
      calendar.class.Event,
      query,
      {
        limit,
        sort: { date: SortingOrder.Ascending }
      }
    )
    const meetingRooms = yield* lookupEventRooms(client, events)

    const summaries: Array<EventSummary> = events.flatMap(event => {
      const eventId = nonEmptyString(event.eventId) ?? nonEmptyString(event._id)
      if (eventId === undefined) return []
      const calendarId = nonEmptyString(event.calendar)
      return [{
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
      }]
    })

    return summaries
  })

export const listCalendars = (
  _params: ListCalendarsParams
): Effect.Effect<Array<CalendarSummary>, ListCalendarsError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient

    const calendars = yield* findWritableCalendars(client)
    const primaryCalendarRef = yield* getDefaultCalendarRef(client)

    return calendars.flatMap(cal => {
      const access = toWritableCalendarAccess(cal.access)
      if (access === undefined) return []
      return [{
        calendarId: CalendarId.make(cal._id),
        name: calendarName(cal.name),
        hidden: cal.hidden,
        visibility: visibilityToString(cal.visibility) ?? "private",
        user: PersonId.make(cal.user),
        access,
        isPrimary: cal._id === primaryCalendarRef
      }]
    })
  })

export const getEvent = (
  params: GetEventParams
): Effect.Effect<Event, GetEventError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient

    const event = yield* client.findOne<HulyEvent>(
      calendar.class.Event,
      { eventId: params.eventId }
    )

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
      externalParticipants: (event.externalParticipants || []).map(p => Email.make(p)),
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

export const createEvent = (
  params: CreateEventParams
): Effect.Effect<CreateEventResult, CreateEventError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient

    const eventId = generateEventId()
    const dueDate = params.dueDate ?? (params.date + ONE_HOUR_MS)

    const { calendarRef, descriptionRef, participantRefs } = yield* resolveEventInputs(
      client,
      params,
      calendar.class.Event,
      eventId
    )

    const eventData: AttachedData<HulyEvent> = {
      eventId,
      title: params.title,
      description: markupRefAsDescription(descriptionRef),
      date: params.date,
      dueDate,
      allDay: params.allDay ?? false,
      calendar: calendarRef,
      participants: participantRefs,
      access: stringToAccess(params.access ?? "owner"),
      user: serverPopulatedUser,
      blockTime: params.blockTime ?? false
    }

    if (params.externalParticipants !== undefined) {
      eventData.externalParticipants = [...params.externalParticipants]
    } else {
      eventData.externalParticipants = []
    }

    if (params.reminders !== undefined) {
      eventData.reminders = [...params.reminders]
    }

    if (params.location !== undefined) {
      eventData.location = params.location
    }

    if (params.visibility !== undefined) {
      eventData.visibility = params.visibility
    }

    if (params.timeZone !== undefined) {
      eventData.timeZone = params.timeZone
    }

    yield* client.addCollection(
      calendar.class.Event,
      toRef<Space>(calendar.space.Calendar),
      toRef<Doc>(calendar.space.Calendar),
      toRef<Class<Doc>>(core.class.Space),
      "events",
      eventData
    )

    return { eventId: EventId.make(eventId) }
  })

export const updateEvent = (
  params: UpdateEventParams
): Effect.Effect<UpdateEventResult, UpdateEventError, HulyClient> =>
  Effect.gen(function*() {
    yield* requireUpdateFields("update_event", params, UPDATE_EVENT_FIELDS)

    const client = yield* HulyClient

    const event = yield* client.findOne<HulyEvent>(
      calendar.class.Event,
      { eventId: params.eventId }
    )

    if (event === undefined) {
      return yield* new EventNotFoundError({ eventId: params.eventId })
    }

    type UpdateEventField = typeof UPDATE_EVENT_FIELDS[number]
    type UpdateEventEntry = Effect.Effect<DocumentUpdate<HulyEvent>, UpdateEventError>
    type UpdateEventEntries = Record<UpdateEventField, UpdateEventEntry>
    const updateEntries = {
      title: Effect.succeed(params.title === undefined ? {} : { title: params.title }),
      description: Effect.gen(function*() {
        if (params.description === undefined) return {}
        if (params.description === null || params.description.trim() === "") {
          return { description: emptyEventDescription }
        }
        if (event.description) {
          yield* client.updateMarkup(calendar.class.Event, event._id, "description", params.description, "markdown")
          return {}
        }
        const descriptionRef = yield* client.uploadMarkup(
          calendar.class.Event,
          event._id,
          "description",
          params.description,
          "markdown"
        )
        return { description: markupRefAsDescription(descriptionRef) }
      }),
      date: Effect.succeed(params.date === undefined ? {} : { date: params.date }),
      dueDate: Effect.succeed(params.dueDate === undefined ? {} : { dueDate: params.dueDate }),
      allDay: Effect.succeed(params.allDay === undefined ? {} : { allDay: params.allDay }),
      location: Effect.succeed(
        params.location === undefined ? {} : params.location === null ? { $unset: { location: "" } } : {
          location: params.location
        }
      ),
      visibility: Effect.succeed(
        params.visibility === undefined ? {} : { visibility: params.visibility }
      ),
      participants: Effect.gen(function*() {
        if (params.participants === undefined) return {}
        const participants = yield* resolveParticipantLocators(client, params.participants)
        return { participants }
      }),
      addParticipants: Effect.gen(function*() {
        if (params.addParticipants === undefined) return {}
        const participants = yield* resolveParticipantLocators(client, params.addParticipants)
        return { participants: uniqueRefs([...event.participants, ...participants]) }
      }),
      removeParticipants: Effect.gen(function*() {
        if (params.removeParticipants === undefined) return {}
        const participants = yield* resolveParticipantLocators(client, params.removeParticipants)
        const remove = new Set(participants)
        return { participants: event.participants.filter((participant) => !remove.has(participant)) }
      }),
      externalParticipants: Effect.succeed(
        params.externalParticipants === undefined ? {} : { externalParticipants: [...params.externalParticipants] }
      ),
      addExternalParticipants: Effect.succeed(
        params.addExternalParticipants === undefined
          ? {}
          : {
            externalParticipants: uniqueEmails([
              ...(event.externalParticipants ?? []),
              ...params.addExternalParticipants
            ])
          }
      ),
      removeExternalParticipants: Effect.succeed(
        params.removeExternalParticipants === undefined
          ? {}
          : {
            externalParticipants: (event.externalParticipants ?? []).filter((email) =>
              !params.removeExternalParticipants?.includes(Email.make(email))
            )
          }
      ),
      reminders: Effect.succeed(params.reminders === undefined ? {} : { reminders: [...params.reminders] }),
      access: Effect.succeed(params.access === undefined ? {} : { access: stringToAccess(params.access) }),
      timeZone: Effect.succeed(params.timeZone === undefined ? {} : { timeZone: params.timeZone }),
      blockTime: Effect.succeed(params.blockTime === undefined ? {} : { blockTime: params.blockTime }),
      calendarId: Effect.gen(function*() {
        if (params.calendarId === undefined) return {}
        const target = yield* resolveCalendarRef(client, params.calendarId)
        return { calendar: target }
      }),
      calendarName: Effect.gen(function*() {
        if (params.calendarName === undefined) return {}
        const target = yield* resolveCalendarRef(client, undefined, params.calendarName)
        return { calendar: target }
      })
    } satisfies UpdateEventEntries
    const updateOps: DocumentUpdate<HulyEvent> = mergeUpdateEntries(yield* Effect.all(Object.values(updateEntries)))

    if (Object.keys(updateOps).length > 0) {
      yield* client.updateDoc(
        calendar.class.Event,
        event.space,
        event._id,
        updateOps
      )
    }

    return { eventId: EventId.make(params.eventId), updated: true }
  })

export const deleteEvent = (
  params: DeleteEventParams
): Effect.Effect<DeleteEventResult, DeleteEventError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient

    const event = yield* client.findOne<HulyEvent>(
      calendar.class.Event,
      { eventId: params.eventId }
    )

    if (event === undefined) {
      return yield* new EventNotFoundError({ eventId: params.eventId })
    }

    yield* client.removeDoc(
      calendar.class.Event,
      event.space,
      event._id
    )

    return { eventId: EventId.make(params.eventId), deleted: true }
  })
