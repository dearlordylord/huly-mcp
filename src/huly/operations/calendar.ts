/* eslint-disable max-lines -- calendar operations are cohesive; event CRUD + recurrence + instances form a single domain */
import {
  AccessLevel,
  type Calendar as HulyCalendar,
  type Event as HulyEvent,
  generateEventId,
  type ReccuringEvent as HulyRecurringEvent,
  type ReccuringInstance as HulyRecurringInstance,
  type RecurringRule as HulyRecurringRule,
  type Visibility as HulyVisibility
} from "@hcengineering/calendar"
import type { Channel, Contact, Person } from "@hcengineering/contact"
import {
  type AttachedData,
  type Class,
  type Doc,
  type DocumentUpdate,
  type MarkupBlobRef,
  type Ref,
  SortingOrder,
  type Space
} from "@hcengineering/core"
import { Effect } from "effect"

import type {
  CreateEventParams,
  CreateEventResult,
  CreateRecurringEventParams,
  CreateRecurringEventResult,
  DeleteEventParams,
  DeleteEventResult,
  Event,
  EventInstance,
  EventSummary,
  GetEventParams,
  ListEventInstancesParams,
  ListEventsParams,
  ListRecurringEventsParams,
  Participant,
  RecurringEventSummary,
  RecurringRule,
  UpdateEventParams,
  UpdateEventResult,
  Visibility
} from "../../domain/schemas/calendar.js"
import { Email, EventId, PersonId, PersonName } from "../../domain/schemas/shared.js"
import { HulyClient, type HulyClientError } from "../client.js"
import { EventNotFoundError, RecurringEventNotFoundError } from "../errors.js"
import { clampLimit, toRef } from "./shared.js"

import { calendar, contact, core } from "../huly-plugins.js"

// --- Error types ---

type ListEventsError = HulyClientError
type GetEventError = HulyClientError | EventNotFoundError
type CreateEventError = HulyClientError
type UpdateEventError = HulyClientError | EventNotFoundError
type DeleteEventError = HulyClientError | EventNotFoundError
type ListRecurringEventsError = HulyClientError
type CreateRecurringEventError = HulyClientError
type ListEventInstancesError = HulyClientError | RecurringEventNotFoundError

// --- SDK Type Bridges ---

// SDK: HulyEvent["description"] is a complex union; fetchMarkup expects MarkupBlobRef.
const descriptionAsMarkupRef = (desc: HulyEvent["description"]): MarkupBlobRef => desc as MarkupBlobRef

// SDK: uploadMarkup returns MarkupBlobRef but Event.description expects a different union.
const markupRefAsDescription = (
  ref: MarkupBlobRef | null
  // eslint-disable-next-line no-restricted-syntax -- SDK type mismatch: MarkupBlobRef vs Event.description
): HulyEvent["description"] => ref as unknown as HulyEvent["description"]

// eslint-disable-next-line no-restricted-syntax -- SDK: clearing description requires empty string but type doesn't allow it
const emptyEventDescription = "" as unknown as HulyEvent["description"]

// SDK: Data<Event> requires 'user' but server populates from auth context.
const serverPopulatedUser: HulyEvent["user"] = "" as HulyEvent["user"]

// SDK: Visibility and HulyVisibility are identical string literal unions.
const visibilityToString = (v: HulyVisibility | undefined): Visibility | undefined => v

const stringToVisibility = (v: Visibility | undefined): HulyVisibility | undefined => v

// --- Helpers ---

const SECONDS_PER_MINUTE = 60
const MINUTES_PER_HOUR = 60
const MS_PER_SECOND = 1000
const ONE_HOUR_MS = SECONDS_PER_MINUTE * MINUTES_PER_HOUR * MS_PER_SECOND

const hulyRuleToRule = (rule: HulyRecurringRule): RecurringRule => ({
  freq: rule.freq,
  endDate: rule.endDate,
  count: rule.count,
  interval: rule.interval,
  byDay: rule.byDay,
  byMonthDay: rule.byMonthDay,
  byMonth: rule.byMonth,
  bySetPos: rule.bySetPos,
  wkst: rule.wkst
})

const ruleToHulyRule = (rule: RecurringRule): HulyRecurringRule => {
  const result: HulyRecurringRule = {
    freq: rule.freq
  }

  if (rule.endDate !== undefined) result.endDate = rule.endDate
  if (rule.count !== undefined) result.count = rule.count
  if (rule.interval !== undefined) result.interval = rule.interval
  if (rule.byDay !== undefined) result.byDay = [...rule.byDay]
  if (rule.byMonthDay !== undefined) result.byMonthDay = [...rule.byMonthDay]
  if (rule.byMonth !== undefined) result.byMonth = [...rule.byMonth]
  if (rule.bySetPos !== undefined) result.bySetPos = [...rule.bySetPos]
  if (rule.wkst !== undefined) result.wkst = rule.wkst

  return result
}

const findPersonsByEmails = (
  client: HulyClient["Type"],
  emails: ReadonlyArray<string>
): Effect.Effect<Array<Person>, HulyClientError> =>
  Effect.gen(function*() {
    if (emails.length === 0) return []

    const allChannels = yield* client.findAll<Channel>(
      contact.class.Channel,
      { value: { $in: [...emails] } }
    )

    const personIds = [...new Set(allChannels.map(c => toRef<Person>(c.attachedTo)))]
    if (personIds.length === 0) return []

    const persons = yield* client.findAll<Person>(
      contact.class.Person,
      { _id: { $in: personIds } }
    )

    return persons
  })

const getDefaultCalendar = (
  client: HulyClient["Type"]
): Effect.Effect<HulyCalendar | undefined, HulyClientError> =>
  client.findOne<HulyCalendar>(
    calendar.class.Calendar,
    {}
  )

const buildParticipants = (
  client: HulyClient["Type"],
  participantRefs: ReadonlyArray<Ref<Contact>>
): Effect.Effect<Array<Participant>, HulyClientError> =>
  Effect.gen(function*() {
    if (participantRefs.length === 0) return []

    const persons = yield* client.findAll<Person>(
      contact.class.Person,
      { _id: { $in: participantRefs.map(r => toRef<Person>(r)) } }
    )

    return persons.map(p => ({
      id: PersonId.make(p._id),
      name: PersonName.make(p.name)
    }))
  })

interface ResolvedEventInputs {
  calendarRef: Ref<HulyCalendar>
  participantRefs: Array<Ref<Contact>>
  descriptionRef: MarkupBlobRef | null
}

const resolveEventInputs = (
  client: HulyClient["Type"],
  params: {
    readonly participants?: ReadonlyArray<string> | undefined
    readonly description?: string | undefined
  },
  eventClass: Ref<Class<Doc>>,
  eventId: string
): Effect.Effect<ResolvedEventInputs, HulyClientError> =>
  Effect.gen(function*() {
    const cal = yield* getDefaultCalendar(client)
    const calendarRef = cal?._id ?? toRef<HulyCalendar>("")

    let participantRefs: Array<Ref<Contact>> = []
    if (params.participants && params.participants.length > 0) {
      const persons = yield* findPersonsByEmails(client, params.participants)
      participantRefs = persons.map(p => p._id)
    }

    let descriptionRef: MarkupBlobRef | null = null
    if (params.description && params.description.trim() !== "") {
      descriptionRef = yield* client.uploadMarkup(
        eventClass,
        toRef<Doc>(eventId),
        "description",
        params.description,
        "markdown"
      )
    }

    return { calendarRef, participantRefs, descriptionRef }
  })

// --- Operations ---

export const listEvents = (
  params: ListEventsParams
): Effect.Effect<Array<EventSummary>, ListEventsError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient

    const query: Record<string, unknown> = {}

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

    let description: string | undefined
    if (event.description) {
      description = yield* client.fetchMarkup(
        calendar.class.Event,
        event._id,
        "description",
        descriptionAsMarkupRef(event.description),
        "markdown"
      )
    }

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
      calendarId: event.calendar,
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
    const client = yield* HulyClient

    const event = yield* client.findOne<HulyEvent>(
      calendar.class.Event,
      { eventId: params.eventId }
    )

    if (event === undefined) {
      return yield* new EventNotFoundError({ eventId: params.eventId })
    }

    const updateOps: DocumentUpdate<HulyEvent> = {}
    let descriptionUpdatedInPlace = false

    if (params.title !== undefined) {
      updateOps.title = params.title
    }

    if (params.description !== undefined) {
      if (params.description.trim() === "") {
        updateOps.description = emptyEventDescription
      } else if (event.description) {
        yield* client.updateMarkup(
          calendar.class.Event,
          event._id,
          "description",
          params.description,
          "markdown"
        )
        descriptionUpdatedInPlace = true
      } else {
        const descriptionRef = yield* client.uploadMarkup(
          calendar.class.Event,
          event._id,
          "description",
          params.description,
          "markdown"
        )
        updateOps.description = markupRefAsDescription(descriptionRef)
      }
    }

    if (params.date !== undefined) {
      updateOps.date = params.date
    }

    if (params.dueDate !== undefined) {
      updateOps.dueDate = params.dueDate
    }

    if (params.allDay !== undefined) {
      updateOps.allDay = params.allDay
    }

    if (params.location !== undefined) {
      updateOps.location = params.location
    }

    if (params.visibility !== undefined) {
      const vis = stringToVisibility(params.visibility)
      if (vis !== undefined) {
        updateOps.visibility = vis
      }
    }

    if (Object.keys(updateOps).length === 0 && !descriptionUpdatedInPlace) {
      return { eventId: EventId.make(params.eventId), updated: false }
    }

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

export const listRecurringEvents = (
  params: ListRecurringEventsParams
): Effect.Effect<Array<RecurringEventSummary>, ListRecurringEventsError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient

    const limit = clampLimit(params.limit)

    const events = yield* client.findAll<HulyRecurringEvent>(
      calendar.class.ReccuringEvent,
      {},
      {
        limit,
        sort: { modifiedOn: SortingOrder.Descending }
      }
    )

    const summaries: Array<RecurringEventSummary> = events.map(event => ({
      eventId: EventId.make(event.eventId),
      title: event.title,
      originalStartTime: event.originalStartTime,
      rules: event.rules.map(hulyRuleToRule),
      timeZone: event.timeZone,
      modifiedOn: event.modifiedOn
    }))

    return summaries
  })

export const createRecurringEvent = (
  params: CreateRecurringEventParams
): Effect.Effect<CreateRecurringEventResult, CreateRecurringEventError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient

    const eventId = generateEventId()
    const dueDate = params.dueDate ?? (params.startDate + ONE_HOUR_MS)

    const { calendarRef, descriptionRef, participantRefs } = yield* resolveEventInputs(
      client,
      params,
      calendar.class.ReccuringEvent,
      eventId
    )

    const hulyRules = params.rules.map(ruleToHulyRule)

    const eventData: AttachedData<HulyRecurringEvent> = {
      eventId,
      title: params.title,
      description: markupRefAsDescription(descriptionRef),
      date: params.startDate,
      dueDate,
      allDay: params.allDay ?? false,
      calendar: calendarRef,
      participants: participantRefs,
      externalParticipants: [],
      access: AccessLevel.Owner,
      user: serverPopulatedUser,
      blockTime: false,
      rules: hulyRules,
      exdate: [],
      rdate: [],
      originalStartTime: params.startDate,
      timeZone: params.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
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
      calendar.class.ReccuringEvent,
      toRef<Space>(calendar.space.Calendar),
      toRef<Doc>(calendar.space.Calendar),
      toRef<Class<Doc>>(core.class.Space),
      "events",
      eventData
    )

    return { eventId: EventId.make(eventId) }
  })

export const listEventInstances = (
  params: ListEventInstancesParams
): Effect.Effect<Array<EventInstance>, ListEventInstancesError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient

    const recurringEvent = yield* client.findOne<HulyRecurringEvent>(
      calendar.class.ReccuringEvent,
      { eventId: params.recurringEventId }
    )

    if (recurringEvent === undefined) {
      return yield* new RecurringEventNotFoundError({ eventId: params.recurringEventId })
    }

    const query: Record<string, unknown> = {
      recurringEventId: params.recurringEventId
    }

    if (params.from !== undefined) {
      query.date = { $gte: params.from }
    }

    if (params.to !== undefined) {
      query.dueDate = { $lte: params.to }
    }

    const limit = clampLimit(params.limit)

    const instances = yield* client.findAll<HulyRecurringInstance>(
      calendar.class.ReccuringInstance,
      query,
      {
        limit,
        sort: { date: SortingOrder.Ascending }
      }
    )

    const participantMap = new Map<string, Array<Participant>>()
    if (params.includeParticipants) {
      const allParticipantRefs = [...new Set(instances.flatMap(i => i.participants))]
      if (allParticipantRefs.length > 0) {
        const participants = yield* buildParticipants(client, allParticipantRefs)
        const participantById = new Map(participants.map(p => [p.id, p]))
        for (const instance of instances) {
          const instanceParticipants = instance.participants
            .map(ref => participantById.get(PersonId.make(ref)))
            .filter((p): p is Participant => p !== undefined)
          participantMap.set(instance.eventId, instanceParticipants)
        }
      } else {
        for (const instance of instances) {
          participantMap.set(instance.eventId, [])
        }
      }
    }

    const results: Array<EventInstance> = instances.map(instance => ({
      eventId: EventId.make(instance.eventId),
      recurringEventId: EventId.make(instance.recurringEventId),
      title: instance.title,
      date: instance.date,
      dueDate: instance.dueDate,
      originalStartTime: instance.originalStartTime,
      allDay: instance.allDay,
      location: instance.location,
      visibility: visibilityToString(instance.visibility),
      isCancelled: instance.isCancelled,
      isVirtual: instance.virtual,
      participants: params.includeParticipants ? (participantMap.get(instance.eventId) ?? []) : undefined,
      externalParticipants: instance.externalParticipants
        ? instance.externalParticipants.map(p => Email.make(p))
        : undefined
    }))

    return results
  })
