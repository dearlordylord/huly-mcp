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
  CreateRecurringEventParams,
  DeleteEventParams,
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
  Visibility
} from "../../domain/schemas/calendar.js"
import { HulyClient, type HulyClientError } from "../client.js"
import { EventNotFoundError, RecurringEventNotFoundError } from "../errors.js"

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/consistent-type-imports -- CJS interop
const calendar = require("@hcengineering/calendar").default as typeof import("@hcengineering/calendar").default
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/consistent-type-imports -- CJS interop
const contact = require("@hcengineering/contact").default as typeof import("@hcengineering/contact").default
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/consistent-type-imports -- CJS interop
const core = require("@hcengineering/core").default as typeof import("@hcengineering/core").default

// --- Error types ---

export type ListEventsError = HulyClientError
export type GetEventError = HulyClientError | EventNotFoundError
export type CreateEventError = HulyClientError
export type UpdateEventError = HulyClientError | EventNotFoundError
export type DeleteEventError = HulyClientError | EventNotFoundError
export type ListRecurringEventsError = HulyClientError
export type CreateRecurringEventError = HulyClientError
export type ListEventInstancesError = HulyClientError | RecurringEventNotFoundError

// --- Helpers ---

const ONE_HOUR_MS = 60 * 60 * 1000

const visibilityToString = (v: HulyVisibility | undefined): Visibility | undefined => {
  if (v === undefined) return undefined
  return v as Visibility
}

const stringToVisibility = (v: Visibility | undefined): HulyVisibility | undefined => {
  if (v === undefined) return undefined
  return v as HulyVisibility
}

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
      { value: { $in: emails as Array<string> } }
    )

    const personIds = [...new Set(allChannels.map(c => c.attachedTo as Ref<Person>))]
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
      { _id: { $in: participantRefs as Array<Ref<Person>> } }
    )

    return persons.map(p => ({
      id: String(p._id),
      name: p.name
    }))
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

    const limit = Math.min(params.limit ?? 50, 200)

    const events = yield* client.findAll<HulyEvent>(
      calendar.class.Event,
      query,
      {
        limit,
        sort: { date: SortingOrder.Ascending }
      }
    )

    const summaries: Array<EventSummary> = events.map(event => ({
      eventId: event.eventId,
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
        event.description as MarkupBlobRef,
        "markdown"
      )
    }

    const result: Event = {
      eventId: event.eventId,
      title: event.title,
      description,
      date: event.date,
      dueDate: event.dueDate,
      allDay: event.allDay,
      location: event.location,
      visibility: visibilityToString(event.visibility),
      participants,
      externalParticipants: event.externalParticipants,
      calendarId: event.calendar ? String(event.calendar) : undefined,
      modifiedOn: event.modifiedOn,
      createdOn: event.createdOn
    }

    return result
  })

export interface CreateEventResult {
  eventId: string
}

export const createEvent = (
  params: CreateEventParams
): Effect.Effect<CreateEventResult, CreateEventError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient

    const cal = yield* getDefaultCalendar(client)
    // Huly API: empty string as calendar ref when no calendar found
    const calendarRef = cal?._id ?? ("" as Ref<HulyCalendar>)

    const eventId = generateEventId()
    const dueDate = params.dueDate ?? (params.date + ONE_HOUR_MS)

    let participantRefs: Array<Ref<Contact>> = []
    if (params.participants && params.participants.length > 0) {
      const persons = yield* findPersonsByEmails(client, params.participants)
      participantRefs = persons.map(p => p._id as unknown as Ref<Contact>)
    }

    let descriptionRef: MarkupBlobRef | null = null
    if (params.description && params.description.trim() !== "") {
      descriptionRef = yield* client.uploadMarkup(
        calendar.class.Event,
        eventId as unknown as Ref<Doc>,
        "description",
        params.description,
        "markdown"
      )
    }

    const eventData: AttachedData<HulyEvent> = {
      eventId,
      title: params.title,
      description: descriptionRef as unknown as HulyEvent["description"],
      date: params.date,
      dueDate,
      allDay: params.allDay ?? false,
      calendar: calendarRef,
      participants: participantRefs,
      externalParticipants: [],
      access: AccessLevel.Owner,
      // Huly API: empty string for user field (server populates from auth)
      user: "" as HulyEvent["user"],
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
      calendar.space.Calendar as Ref<Space>,
      calendar.space.Calendar as unknown as Ref<Doc>,
      core.class.Space as Ref<Class<Doc>>,
      "events",
      eventData
    )

    return { eventId }
  })

export interface UpdateEventResult {
  eventId: string
  updated: boolean
}

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
        updateOps.description = "" as unknown as HulyEvent["description"]
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
        updateOps.description = descriptionRef as unknown as HulyEvent["description"]
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
      return { eventId: params.eventId, updated: false }
    }

    if (Object.keys(updateOps).length > 0) {
      yield* client.updateDoc(
        calendar.class.Event,
        event.space,
        event._id,
        updateOps
      )
    }

    return { eventId: params.eventId, updated: true }
  })

export interface DeleteEventResult {
  eventId: string
  deleted: boolean
}

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

    return { eventId: params.eventId, deleted: true }
  })

export const listRecurringEvents = (
  params: ListRecurringEventsParams
): Effect.Effect<Array<RecurringEventSummary>, ListRecurringEventsError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient

    const limit = Math.min(params.limit ?? 50, 200)

    const events = yield* client.findAll<HulyRecurringEvent>(
      calendar.class.ReccuringEvent,
      {},
      {
        limit,
        sort: { modifiedOn: SortingOrder.Descending }
      }
    )

    const summaries: Array<RecurringEventSummary> = events.map(event => ({
      eventId: event.eventId,
      title: event.title,
      originalStartTime: event.originalStartTime,
      rules: event.rules.map(hulyRuleToRule),
      timeZone: event.timeZone,
      modifiedOn: event.modifiedOn
    }))

    return summaries
  })

export interface CreateRecurringEventResult {
  eventId: string
}

export const createRecurringEvent = (
  params: CreateRecurringEventParams
): Effect.Effect<CreateRecurringEventResult, CreateRecurringEventError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient

    const cal = yield* getDefaultCalendar(client)
    // Huly API: empty string as calendar ref when no calendar found
    const calendarRef = cal?._id ?? ("" as Ref<HulyCalendar>)

    const eventId = generateEventId()
    const dueDate = params.dueDate ?? (params.startDate + ONE_HOUR_MS)

    let participantRefs: Array<Ref<Contact>> = []
    if (params.participants && params.participants.length > 0) {
      const persons = yield* findPersonsByEmails(client, params.participants)
      participantRefs = persons.map(p => p._id as unknown as Ref<Contact>)
    }

    let descriptionRef: MarkupBlobRef | null = null
    if (params.description && params.description.trim() !== "") {
      descriptionRef = yield* client.uploadMarkup(
        calendar.class.ReccuringEvent,
        eventId as unknown as Ref<Doc>,
        "description",
        params.description,
        "markdown"
      )
    }

    const hulyRules = params.rules.map(ruleToHulyRule)

    const eventData: AttachedData<HulyRecurringEvent> = {
      eventId,
      title: params.title,
      description: descriptionRef as unknown as HulyRecurringEvent["description"],
      date: params.startDate,
      dueDate,
      allDay: params.allDay ?? false,
      calendar: calendarRef,
      participants: participantRefs,
      externalParticipants: [],
      access: AccessLevel.Owner,
      // Huly API: empty string for user field (server populates from auth)
      user: "" as HulyRecurringEvent["user"],
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
      calendar.space.Calendar as Ref<Space>,
      calendar.space.Calendar as unknown as Ref<Doc>,
      core.class.Space as Ref<Class<Doc>>,
      "events",
      eventData
    )

    return { eventId }
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

    const limit = Math.min(params.limit ?? 50, 200)

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
            .map(ref => participantById.get(String(ref)))
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
      eventId: instance.eventId,
      recurringEventId: instance.recurringEventId,
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
    }))

    return results
  })
