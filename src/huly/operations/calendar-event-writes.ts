/** Calendar Event create/update workflows, including optional meeting-room composition. */
import { type Event as HulyEvent, generateEventId } from "@hcengineering/calendar"
import type { AttachedData, Class, Doc, DocumentUpdate, MarkupBlobRef, Ref, Space } from "@hcengineering/core"
import { generateId } from "@hcengineering/core"
import type { Room } from "@hcengineering/love"
import { Effect } from "effect"

import type { CreateEventResult, UpdateEventResult } from "../../domain/schemas/calendar-results.js"
import type { CreateEventParams, UpdateEventParams } from "../../domain/schemas/calendar.js"
import { DEFAULT_EVENT_ALL_DAY, UPDATE_EVENT_FIELDS } from "../../domain/schemas/calendar.js"
import { Email, EventId } from "../../domain/schemas/shared.js"
import { HulyClient, type HulyClientError } from "../client.js"
import type {
  CalendarMeetingTargetNotWritableError,
  CalendarNotAccessibleError,
  NoUpdateFieldsError,
  PersonIdentifierAmbiguousError,
  PersonNotFoundError
} from "../errors.js"
import { EventNotFoundError } from "../errors.js"
import { calendar, core } from "../huly-plugins.js"
import {
  createEventMeetingComposition,
  type CreateEventMeetingCompositionError,
  type DeferredEventMarkup,
  type EventMeetingMutationError,
  ensureProspectiveMeetingEventWritable,
  executeEventMeetingMutation,
  type MeetingRoomResolutionError,
  type PrepareEventMeetingRoomUpdateError,
  prepareEventMeetingRoomUpdate,
  resolveMeetingRoom,
  snapshotPriorMarkup
} from "./calendar-meeting-composition.js"
import type { EventMeetingRoomUpdatePlan } from "./calendar-meeting-resolution.js"
import {
  emptyEventDescription,
  markupRefAsDescription,
  ONE_HOUR_MS,
  resolveCalendarRef,
  resolveEventInputs,
  resolveEventReferences,
  type ResolvedEventReferences,
  resolveParticipantLocators,
  stringToAccess
} from "./calendar-shared.js"
import { renderMarkdownPreservingNativeReferences } from "./native-reference-markup.js"
import { hulyQuery } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"
import { mergeUpdateEntries, requireUpdateFields } from "./update-guards.js"
import { snapshotEventUpdate } from "./calendar-meeting-snapshots.js"

const resolveCreateMeetingRoom = Effect.fn("Calendar.resolveCreateMeetingRoom")(function* (
  client: HulyClient["Service"],
  locator: NonNullable<CreateEventParams["meetingRoom"]>,
  eventId: EventId,
  access: ReturnType<typeof stringToAccess>
): Effect.fn.Return<Room, MeetingRoomResolutionError | CalendarMeetingTargetNotWritableError> {
  yield* ensureProspectiveMeetingEventWritable(eventId, access)
  return yield* resolveMeetingRoom(client, locator)
})

type ResolveCreateEventInputsError =
  | HulyClientError
  | CalendarNotAccessibleError
  | PersonIdentifierAmbiguousError
  | PersonNotFoundError
  | MeetingRoomResolutionError
  | CalendarMeetingTargetNotWritableError
type CreateEventError = ResolveCreateEventInputsError | CreateEventMeetingCompositionError
type UpdateEventError =
  | HulyClientError
  | NoUpdateFieldsError
  | EventNotFoundError
  | CalendarNotAccessibleError
  | PersonIdentifierAmbiguousError
  | PersonNotFoundError
  | PrepareEventMeetingRoomUpdateError
  | EventMeetingMutationError

type EventUpdateTarget =
  | { readonly _tag: "Ordinary"; readonly event: HulyEvent }
  | { readonly _tag: "Meeting"; readonly event: HulyEvent; readonly plan: EventMeetingRoomUpdatePlan }

const prepareEventUpdateTarget = Effect.fn("Calendar.prepareEventUpdateTarget")(function* (
  client: HulyClient["Service"],
  params: UpdateEventParams
): Effect.fn.Return<EventUpdateTarget, HulyClientError | EventNotFoundError | PrepareEventMeetingRoomUpdateError> {
  if (params.meetingRoom !== undefined) {
    const plan = yield* prepareEventMeetingRoomUpdate(client, params.eventId, params.meetingRoom)
    return { _tag: "Meeting", event: plan.baseTarget, plan }
  }
  const event = yield* client.findOne<HulyEvent>(
    calendar.class.Event,
    hulyQuery<HulyEvent>({ eventId: params.eventId })
  )
  if (event === undefined) return yield* new EventNotFoundError({ eventId: params.eventId })
  return { _tag: "Ordinary", event }
})

const uniqueRefs = <T>(values: ReadonlyArray<T>): Array<T> => [...new Set(values)]
const uniqueEmails = (values: ReadonlyArray<string>): Array<Email> =>
  [...new Set(values)].map((value) => Email.make(value))

const applyEventOptionalFields = (eventData: AttachedData<HulyEvent>, params: CreateEventParams): void => {
  eventData.externalParticipants = params.externalParticipants === undefined ? [] : [...params.externalParticipants]
  if (params.reminders !== undefined) eventData.reminders = [...params.reminders]
  if (params.location !== undefined) eventData.location = params.location
  if (params.visibility !== undefined) eventData.visibility = params.visibility
  if (params.timeZone !== undefined) eventData.timeZone = params.timeZone
}

type UpdateEventField = (typeof UPDATE_EVENT_FIELDS)[number]
type UpdateEventEntry = Effect.Effect<DocumentUpdate<HulyEvent>, UpdateEventError>
type UpdateEventEntries = Record<UpdateEventField, UpdateEventEntry>

const eventDescriptionEntry = (
  client: HulyClient["Service"],
  event: HulyEvent,
  description: UpdateEventParams["description"],
  deferMarkup: boolean
): UpdateEventEntry =>
  Effect.gen(function* () {
    if (description === undefined) return {}
    if (description === null || description.trim() === "") return { description: emptyEventDescription }
    const rendered = renderMarkdownPreservingNativeReferences(description, client.markupUrlConfig)
    if (event.description) {
      if (deferMarkup) return {}
      yield* client.updateMarkup(calendar.class.Event, event._id, "description", rendered.markup, rendered.format)
      return {}
    }
    if (deferMarkup) return {}
    const descriptionRef = yield* client.uploadMarkup(
      calendar.class.Event,
      event._id,
      "description",
      rendered.markup,
      rendered.format
    )
    return { description: markupRefAsDescription(descriptionRef) }
  })

const deferredEventDescription = Effect.fn("Calendar.prepareDeferredEventDescription")(function* (
  client: HulyClient["Service"],
  event: HulyEvent,
  description: UpdateEventParams["description"],
  markupUrlConfig: HulyClient["Service"]["markupUrlConfig"]
): Effect.fn.Return<DeferredEventMarkup | undefined, HulyClientError> {
  if (description === undefined || description === null || description.trim() === "") return undefined
  const rendered = renderMarkdownPreservingNativeReferences(description, markupUrlConfig)
  const previousMarkup = yield* snapshotPriorMarkup(client, event, rendered.format)
  return previousMarkup === undefined
    ? { mode: "upload", markup: rendered.markup, format: rendered.format }
    : { mode: "update", markup: rendered.markup, format: rendered.format, previousMarkup }
})

const eventParticipantUpdateEntries = (
  client: HulyClient["Service"],
  event: HulyEvent,
  params: UpdateEventParams
): Pick<UpdateEventEntries, "addParticipants" | "participants" | "removeParticipants"> => ({
  participants: Effect.gen(function* () {
    if (params.participants === undefined) return {}
    return { participants: yield* resolveParticipantLocators(client, params.participants) }
  }),
  addParticipants: Effect.gen(function* () {
    if (params.addParticipants === undefined) return {}
    const participants = yield* resolveParticipantLocators(client, params.addParticipants)
    return { participants: uniqueRefs([...event.participants, ...participants]) }
  }),
  removeParticipants: Effect.gen(function* () {
    if (params.removeParticipants === undefined) return {}
    const remove = new Set(yield* resolveParticipantLocators(client, params.removeParticipants))
    return { participants: event.participants.filter((participant) => !remove.has(participant)) }
  })
})

const eventExternalParticipantUpdateEntries = (
  event: HulyEvent,
  params: UpdateEventParams
): Pick<UpdateEventEntries, "addExternalParticipants" | "externalParticipants" | "removeExternalParticipants"> => ({
  externalParticipants: Effect.succeed(
    params.externalParticipants === undefined ? {} : { externalParticipants: [...params.externalParticipants] }
  ),
  addExternalParticipants: Effect.succeed(
    params.addExternalParticipants === undefined
      ? {}
      : {
          externalParticipants: uniqueEmails([...(event.externalParticipants ?? []), ...params.addExternalParticipants])
        }
  ),
  removeExternalParticipants: Effect.succeed(
    params.removeExternalParticipants === undefined
      ? {}
      : {
          externalParticipants: (event.externalParticipants ?? []).filter(
            (email) => !params.removeExternalParticipants?.includes(Email.make(email))
          )
        }
  )
})

const eventCalendarUpdateEntries = (
  client: HulyClient["Service"],
  params: UpdateEventParams
): Pick<UpdateEventEntries, "calendarId" | "calendarName"> => ({
  calendarId: Effect.gen(function* () {
    if (params.calendarId === undefined) return {}
    return { calendar: yield* resolveCalendarRef(client, params.calendarId) }
  }),
  calendarName: Effect.gen(function* () {
    if (params.calendarName === undefined) return {}
    return { calendar: yield* resolveCalendarRef(client, undefined, params.calendarName) }
  })
})

const eventTimingUpdateEntries = (
  params: UpdateEventParams
): Pick<UpdateEventEntries, "allDay" | "blockTime" | "date" | "dueDate"> => ({
  date: Effect.succeed(params.date === undefined ? {} : { date: params.date }),
  dueDate: Effect.succeed(params.dueDate === undefined ? {} : { dueDate: params.dueDate }),
  allDay: Effect.succeed(params.allDay === undefined ? {} : { allDay: params.allDay }),
  blockTime: Effect.succeed(params.blockTime === undefined ? {} : { blockTime: params.blockTime })
})

const eventPresentationUpdateEntries = (
  params: UpdateEventParams
): Pick<UpdateEventEntries, "access" | "location" | "reminders" | "timeZone" | "title" | "visibility"> => ({
  title: Effect.succeed(params.title === undefined ? {} : { title: params.title }),
  location: Effect.succeed(
    params.location === undefined
      ? {}
      : params.location === null
        ? { $unset: { location: "" } }
        : { location: params.location }
  ),
  visibility: Effect.succeed(params.visibility === undefined ? {} : { visibility: params.visibility }),
  reminders: Effect.succeed(params.reminders === undefined ? {} : { reminders: [...params.reminders] }),
  access: Effect.succeed(params.access === undefined ? {} : { access: stringToAccess(params.access) }),
  timeZone: Effect.succeed(params.timeZone === undefined ? {} : { timeZone: params.timeZone })
})

const eventUpdateEntries = (
  client: HulyClient["Service"],
  event: HulyEvent,
  params: UpdateEventParams,
  deferMarkup = false
): UpdateEventEntries => {
  const timing = eventTimingUpdateEntries(params)
  const presentation = eventPresentationUpdateEntries(params)
  const participants = eventParticipantUpdateEntries(client, event, params)
  const externalParticipants = eventExternalParticipantUpdateEntries(event, params)
  const calendars = eventCalendarUpdateEntries(client, params)
  return {
    title: presentation.title,
    description: eventDescriptionEntry(client, event, params.description, deferMarkup),
    date: timing.date,
    dueDate: timing.dueDate,
    allDay: timing.allDay,
    location: presentation.location,
    visibility: presentation.visibility,
    participants: participants.participants,
    addParticipants: participants.addParticipants,
    removeParticipants: participants.removeParticipants,
    externalParticipants: externalParticipants.externalParticipants,
    addExternalParticipants: externalParticipants.addExternalParticipants,
    removeExternalParticipants: externalParticipants.removeExternalParticipants,
    reminders: presentation.reminders,
    access: presentation.access,
    timeZone: presentation.timeZone,
    blockTime: timing.blockTime,
    calendarId: calendars.calendarId,
    calendarName: calendars.calendarName,
    meetingRoom: Effect.succeed({})
  }
}

const createBaseEvent = (
  client: HulyClient["Service"],
  eventData: AttachedData<HulyEvent>,
  eventDocumentId: Ref<HulyEvent> | undefined
) => {
  const eventSpace = toRef<Space>(calendar.space.Calendar)
  return eventDocumentId === undefined
    ? client.addCollection(
        calendar.class.Event,
        eventSpace,
        toRef<Doc>(calendar.space.Calendar),
        toRef<Class<Doc>>(core.class.Space),
        "events",
        eventData
      )
    : client.addCollection(
        calendar.class.Event,
        eventSpace,
        toRef<Doc>(calendar.space.Calendar),
        toRef<Class<Doc>>(core.class.Space),
        "events",
        eventData,
        eventDocumentId
      )
}

interface OrdinaryCreateEventInputs extends ResolvedEventReferences {
  readonly _tag: "Ordinary"
  readonly descriptionRef: MarkupBlobRef | null
}

interface MeetingCreateEventInputs extends ResolvedEventReferences {
  readonly _tag: "Meeting"
  readonly eventDocumentId: Ref<HulyEvent>
  readonly room: Room
  readonly description: ReturnType<typeof renderMarkdownPreservingNativeReferences> | undefined
}

type CreateEventInputs = OrdinaryCreateEventInputs | MeetingCreateEventInputs

const resolveCreateEventInputs = Effect.fn("Calendar.resolveCreateEventInputs")(function* (
  client: HulyClient["Service"],
  params: CreateEventParams,
  eventId: ReturnType<typeof generateEventId>,
  access: ReturnType<typeof stringToAccess>
): Effect.fn.Return<CreateEventInputs, ResolveCreateEventInputsError> {
  const meetingRoomLocator = params.meetingRoom
  if (meetingRoomLocator === undefined) {
    return yield* resolveEventInputs(client, params, calendar.class.Event, eventId).pipe(
      Effect.map((resolved): OrdinaryCreateEventInputs => ({ _tag: "Ordinary", ...resolved }))
    )
  }
  const eventDocumentId = generateId<HulyEvent>()
  const room = yield* resolveCreateMeetingRoom(client, meetingRoomLocator, EventId.make(eventId), access)
  const references = yield* resolveEventReferences(client, params)
  const description =
    params.description === undefined || params.description.trim() === ""
      ? undefined
      : renderMarkdownPreservingNativeReferences(params.description, client.markupUrlConfig)
  return { _tag: "Meeting", eventDocumentId, room, description, ...references }
})

export const createEvent = Effect.fn("Calendar.createEvent")(function* (
  params: CreateEventParams
): Effect.fn.Return<CreateEventResult, CreateEventError, HulyClient> {
  const client = yield* HulyClient
  const eventId = generateEventId()
  const dueDate = params.dueDate ?? params.date + ONE_HOUR_MS
  const access = stringToAccess(params.access ?? "owner")
  const inputs = yield* resolveCreateEventInputs(client, params, eventId, access)
  const eventData: AttachedData<HulyEvent> = {
    eventId,
    title: params.title,
    description: inputs._tag === "Ordinary" ? markupRefAsDescription(inputs.descriptionRef) : emptyEventDescription,
    date: params.date,
    dueDate,
    allDay: params.allDay ?? DEFAULT_EVENT_ALL_DAY,
    calendar: inputs.calendarRef,
    participants: inputs.participantRefs,
    access,
    // Native Calendar creation writes the caller's primary social identity;
    // the server does not replace an empty sentinel on locally created Events.
    user: client.getPrimarySocialId(),
    blockTime: params.blockTime ?? false
  }
  applyEventOptionalFields(eventData, params)

  if (inputs._tag === "Ordinary") yield* createBaseEvent(client, eventData, undefined)
  else {
    yield* createEventMeetingComposition(client, {
      eventDocumentId: inputs.eventDocumentId,
      eventId: EventId.make(eventId),
      space: toRef<Space>(calendar.space.Calendar),
      room: inputs.room._id,
      ...(inputs.description === undefined ? {} : { description: inputs.description }),
      createBase: (description) => createBaseEvent(client, { ...eventData, description }, inputs.eventDocumentId)
    })
  }
  return { eventId: EventId.make(eventId) }
})

export const updateEvent = Effect.fn("Calendar.updateEvent")(function* (
  params: UpdateEventParams
): Effect.fn.Return<UpdateEventResult, UpdateEventError, HulyClient> {
  yield* requireUpdateFields("update_event", params, UPDATE_EVENT_FIELDS)
  const client = yield* HulyClient
  const target = yield* prepareEventUpdateTarget(client, params)
  const event = target.event

  const deferredDescription =
    target._tag === "Ordinary"
      ? undefined
      : yield* deferredEventDescription(client, event, params.description, client.markupUrlConfig)
  const updateEntries = eventUpdateEntries(client, event, params, target._tag === "Meeting")
  const updateOps: DocumentUpdate<HulyEvent> = mergeUpdateEntries(yield* Effect.all(Object.values(updateEntries)))

  if (target._tag === "Ordinary") {
    if (Object.keys(updateOps).length > 0)
      yield* client.updateDoc(calendar.class.Event, event.space, event._id, updateOps)
    return { eventId: EventId.make(params.eventId), updated: true }
  }

  yield* executeEventMeetingMutation(client, {
    plan: target.plan,
    update: updateOps,
    inverse: snapshotEventUpdate(event, updateOps),
    ...(deferredDescription === undefined ? {} : { deferredMarkup: deferredDescription })
  })

  return { eventId: EventId.make(params.eventId), updated: true }
})
