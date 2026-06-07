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
import {
  AccessLevel,
  type Calendar as HulyCalendar,
  type Event as HulyEvent,
  generateEventId
} from "@hcengineering/calendar"
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
  UpdateEventResult,
  WritableCalendarAccess
} from "../../domain/schemas/calendar.js"
import { UPDATE_EVENT_FIELDS } from "../../domain/schemas/calendar.js"
import { CalendarId, Email, EventId, PersonId } from "../../domain/schemas/shared.js"
import { HulyClient, type HulyClientError } from "../client.js"
import type { CalendarNotAccessibleError, NoUpdateFieldsError } from "../errors.js"
import { EventNotFoundError } from "../errors.js"
import { calendar, core } from "../huly-plugins.js"
import {
  buildParticipants,
  descriptionAsMarkupRef,
  emptyEventDescription,
  findWritableCalendars,
  getDefaultCalendarRef,
  markupRefAsDescription,
  ONE_HOUR_MS,
  resolveEventInputs,
  serverPopulatedUser,
  stringToVisibility,
  visibilityToString
} from "./calendar-shared.js"
import { clampLimit } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"
import { type DirectUpdateEntry, mergeUpdateEntries, requireUpdateFields } from "./update-guards.js"

// Re-export recurring operations for barrel consumers
export { createRecurringEvent, listEventInstances, listRecurringEvents } from "./calendar-recurring.js"

// --- Error types ---

type ListEventsError = HulyClientError
type ListCalendarsError = HulyClientError
type GetEventError = HulyClientError | EventNotFoundError
type CreateEventError = HulyClientError | CalendarNotAccessibleError
type UpdateEventError = HulyClientError | NoUpdateFieldsError | EventNotFoundError
type DeleteEventError = HulyClientError | EventNotFoundError

// --- Operations ---

const CALENDAR_ACCESS_TO_WRITABLE = {
  [AccessLevel.FreeBusyReader]: undefined,
  [AccessLevel.Reader]: undefined,
  [AccessLevel.Writer]: "writer",
  [AccessLevel.Owner]: "owner"
} satisfies Record<HulyCalendar["access"], WritableCalendarAccess | undefined>

type MappedWritableCalendarAccess = Exclude<
  typeof CALENDAR_ACCESS_TO_WRITABLE[keyof typeof CALENDAR_ACCESS_TO_WRITABLE],
  undefined
>
type ExactWritableCalendarAccessMapping = [WritableCalendarAccess] extends [MappedWritableCalendarAccess]
  ? [MappedWritableCalendarAccess] extends [WritableCalendarAccess] ? true : never
  : never

const exactWritableCalendarAccessMapping = <T extends true>(value: T): T => value
exactWritableCalendarAccessMapping<ExactWritableCalendarAccessMapping>(true)

const toWritableCalendarAccess = (access: HulyCalendar["access"]): WritableCalendarAccess | undefined =>
  CALENDAR_ACCESS_TO_WRITABLE[access]

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

    const summaries: Array<EventSummary> = events.map(event => ({
      eventId: EventId.make(event.eventId),
      title: event.title,
      date: event.date,
      dueDate: event.dueDate,
      allDay: event.allDay,
      location: event.location,
      modifiedOn: event.modifiedOn
    }))

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
        name: cal.name,
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
      title: event.title,
      description,
      date: event.date,
      dueDate: event.dueDate,
      allDay: event.allDay,
      location: event.location,
      visibility: visibilityToString(event.visibility),
      participants,
      externalParticipants: (event.externalParticipants || []).map(p => Email.make(p)),
      calendarId: CalendarId.make(event.calendar),
      modifiedOn: event.modifiedOn,
      createdOn: event.createdOn
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
      externalParticipants: [],
      access: AccessLevel.Owner,
      user: serverPopulatedUser,
      blockTime: false
    }

    if (params.location !== undefined) {
      eventData.location = params.location
    }

    if (params.visibility !== undefined) {
      const vis = stringToVisibility(params.visibility)
      if (vis !== undefined) {
        eventData.visibility = vis
      }
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
    type UpdateEventEntries = {
      readonly [Field in UpdateEventField]: Effect.Effect<
        DirectUpdateEntry<UpdateEventField, DocumentUpdate<HulyEvent>, Field>,
        HulyClientError
      >
    }
    const updateEntries = {
      title: Effect.succeed(params.title === undefined ? {} : { title: params.title }),
      description: Effect.gen(function*() {
        if (params.description === undefined) return {}
        if (params.description.trim() === "") return { description: emptyEventDescription }
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
      location: Effect.succeed(params.location === undefined ? {} : { location: params.location }),
      visibility: Effect.succeed(
        params.visibility === undefined
          ? {}
          : (() => {
            const visibility = stringToVisibility(params.visibility)
            return visibility === undefined ? {} : { visibility }
          })()
      )
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
