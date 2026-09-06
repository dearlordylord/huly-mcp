import { AccessLevel, type Event as HulyEvent, type Schedule as HulySchedule } from "@hcengineering/calendar"
import type { Employee } from "@hcengineering/contact"
import type { Ref } from "@hcengineering/core"
import type { Floor, Meeting as HulyMeeting, MeetingSchedule as HulyMeetingSchedule, Room } from "@hcengineering/love"
import { isOffice, RoomType } from "@hcengineering/love"
import { Effect } from "effect"

import type { MeetingRoomLocator } from "../../domain/schemas/calendar-meeting-rooms.js"
import { Count, DocId, type EventId, RoomId, type ScheduleId } from "../../domain/schemas/shared.js"
import { assertFirst } from "../../utils/assertions.js"
import type { HulyClient, HulyClientError } from "../client.js"
import {
  CalendarMeetingTargetNotWritableError,
  EventMeetingMixinMissingError,
  type EventSiblingConvergenceError,
  EventNotFoundError,
  MeetingRoomAssignmentUnsupportedError,
  MeetingRoomIdentifierAmbiguousError,
  MeetingRoomNotFoundError,
  type PersonNotAnEmployeeError,
  PersonNotAnEmployeeError as PersonNotEmployee,
  ScheduleMeetingMixinMissingError,
  ScheduleNotFoundError
} from "../errors.js"
import { calendar, contact, love } from "../huly-plugins.js"
import { readStableEventSiblings } from "./calendar-meeting-event-read.js"
import { findCallerCalendars } from "./calendar-shared.js"
import { hulyQuery, type StrictDocumentQuery } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"

export type MeetingRoomResolutionError =
  | HulyClientError
  | PersonNotAnEmployeeError
  | MeetingRoomNotFoundError
  | MeetingRoomIdentifierAmbiguousError
  | MeetingRoomAssignmentUnsupportedError

export type PrepareEventMeetingRoomUpdateError =
  | MeetingRoomResolutionError
  | EventNotFoundError
  | CalendarMeetingTargetNotWritableError
  | EventMeetingMixinMissingError
  | EventSiblingConvergenceError

export type PrepareScheduleMeetingRoomUpdateError =
  | MeetingRoomResolutionError
  | ScheduleNotFoundError
  | CalendarMeetingTargetNotWritableError
  | ScheduleMeetingMixinMissingError

export interface EventRoomAssignment {
  readonly event: HulyEvent
  readonly previousRoom: Ref<Room>
}

export interface EventMeetingRoomUpdatePlan {
  readonly eventId: EventId
  readonly baseTarget: HulyEvent
  readonly assignments: ReadonlyArray<EventRoomAssignment>
  readonly room: Room
}

export interface ScheduleMeetingRoomUpdatePlan {
  readonly schedule: HulySchedule
  readonly previousRoom: Ref<Room>
  readonly room: Room
}

const authenticatedEmployee = Effect.fn("CalendarMeeting.authenticatedEmployee")(function* (
  client: HulyClient["Service"]
): Effect.fn.Return<Ref<Employee>, HulyClientError | PersonNotAnEmployeeError> {
  const employee = yield* client.findOne<Employee>(
    contact.mixin.Employee,
    hulyQuery<Employee>({ personUuid: client.getAccountUuid() })
  )
  if (employee === undefined) return yield* new PersonNotEmployee({ identifier: "authenticated user" })
  return employee._id
})

const resolveFloor = Effect.fn("CalendarMeeting.resolveFloor")(function* (
  client: HulyClient["Service"],
  locator: MeetingRoomLocator
): Effect.fn.Return<Floor | undefined, HulyClientError | MeetingRoomIdentifierAmbiguousError> {
  if (locator.floor === undefined) return undefined
  const byId = yield* client.findOne<Floor>(love.class.Floor, hulyQuery<Floor>({ _id: toRef<Floor>(locator.floor) }))
  if (byId !== undefined) return byId
  const matches = yield* client.findAll<Floor>(love.class.Floor, hulyQuery<Floor>({ name: locator.floor }))
  if (matches.length > 1) {
    return yield* new MeetingRoomIdentifierAmbiguousError({
      field: "floor",
      identifier: locator.floor,
      matches: Count.make(matches.length)
    })
  }
  return matches[0]
})

const findRoomByName = Effect.fn("CalendarMeeting.findRoomByName")(function* (
  client: HulyClient["Service"],
  locator: MeetingRoomLocator
): Effect.fn.Return<Room, HulyClientError | MeetingRoomIdentifierAmbiguousError | MeetingRoomNotFoundError> {
  const floor = yield* resolveFloor(client, locator)
  if (locator.floor !== undefined && floor === undefined) return yield* new MeetingRoomNotFoundError({ locator })
  const query: StrictDocumentQuery<Room> = { name: locator.room }
  if (floor !== undefined) query.floor = floor._id
  const matches = yield* client.findAll<Room>(love.class.Room, hulyQuery(query))
  if (matches.length === 0) return yield* new MeetingRoomNotFoundError({ locator })
  if (matches.length > 1) {
    return yield* new MeetingRoomIdentifierAmbiguousError({
      field: "room",
      identifier: locator.room,
      matches: Count.make(matches.length)
    })
  }
  return assertFirst(matches)
})

const ensureAssignmentSupported = Effect.fn("CalendarMeeting.ensureAssignmentSupported")(function* (
  client: HulyClient["Service"],
  room: Room
): Effect.fn.Return<void, HulyClientError | PersonNotAnEmployeeError | MeetingRoomAssignmentUnsupportedError> {
  const roomId = RoomId.make(room._id)
  if (room._id === love.ids.Reception || room.type === RoomType.Reception) {
    return yield* new MeetingRoomAssignmentUnsupportedError({ roomId, reason: "reception" })
  }
  if (!isOffice(room)) return
  const employee = yield* authenticatedEmployee(client)
  if (room.person === null || String(room.person) !== String(employee)) {
    return yield* new MeetingRoomAssignmentUnsupportedError({ roomId, reason: "office-not-owned-by-caller" })
  }
})

export const resolveMeetingRoom = Effect.fn("CalendarMeeting.resolveRoom")(function* (
  client: HulyClient["Service"],
  locator: MeetingRoomLocator
): Effect.fn.Return<Room, MeetingRoomResolutionError> {
  const byId = yield* client.findOne<Room>(love.class.Room, hulyQuery<Room>({ _id: toRef<Room>(locator.room) }))
  const room = byId ?? (yield* findRoomByName(client, locator))
  yield* ensureAssignmentSupported(client, room)
  return room
})

const callerOwnsEvent = (
  client: HulyClient["Service"],
  event: HulyEvent,
  callerCalendarIds: ReadonlySet<string>
): boolean => {
  const identities = new Set([client.getPrimarySocialId(), ...(client.getSocialIds?.() ?? [])].map(String))
  const authoritativeUser = String(event.user).trim()
  return authoritativeUser === "" ? callerCalendarIds.has(String(event.calendar)) : identities.has(authoritativeUser)
}

const findBaseTarget = (
  client: HulyClient["Service"],
  events: ReadonlyArray<HulyEvent>,
  callerCalendarIds: ReadonlySet<string>
): HulyEvent | undefined =>
  events.find((event) => event.access === AccessLevel.Owner && callerOwnsEvent(client, event, callerCalendarIds)) ??
  events.find((event) => event.access === AccessLevel.Writer && callerOwnsEvent(client, event, callerCalendarIds))

export const ensureProspectiveMeetingEventWritable = Effect.fn("CalendarMeeting.ensureProspectiveEventWritable")(
  function* (eventId: EventId, access: AccessLevel): Effect.fn.Return<void, CalendarMeetingTargetNotWritableError> {
    if (access === AccessLevel.Owner || access === AccessLevel.Writer) return
    return yield* new CalendarMeetingTargetNotWritableError({
      failure: { _tag: "Event", targetId: DocId.make(eventId), reason: "prospective-event-not-writable" }
    })
  }
)

export const ensureProspectiveMeetingScheduleOwned = Effect.fn("CalendarMeeting.ensureProspectiveScheduleOwned")(
  function* (
    client: HulyClient["Service"],
    scheduleId: Ref<HulySchedule>,
    owner: Ref<Employee>
  ): Effect.fn.Return<void, HulyClientError | PersonNotAnEmployeeError | CalendarMeetingTargetNotWritableError> {
    const currentEmployee = yield* authenticatedEmployee(client)
    if (String(owner) !== String(currentEmployee)) {
      return yield* new CalendarMeetingTargetNotWritableError({
        failure: { _tag: "Schedule", targetId: DocId.make(scheduleId), reason: "schedule-owned-by-another-employee" }
      })
    }
  }
)

export const prepareEventMeetingRoomUpdate = Effect.fn("CalendarMeeting.prepareEventUpdate")(function* (
  client: HulyClient["Service"],
  eventId: EventId,
  locator: MeetingRoomLocator
): Effect.fn.Return<EventMeetingRoomUpdatePlan, PrepareEventMeetingRoomUpdateError> {
  const events = yield* readStableEventSiblings(client, eventId)
  if (events.length === 0) return yield* new EventNotFoundError({ eventId })
  const callerCalendars = yield* findCallerCalendars(client)
  const baseTarget = findBaseTarget(client, events, new Set(callerCalendars.map((entry) => String(entry._id))))
  if (baseTarget === undefined) {
    return yield* new CalendarMeetingTargetNotWritableError({
      failure: { _tag: "Event", targetId: DocId.make(eventId), reason: "caller-owned-writable-event-not-found" }
    })
  }
  const meetings = yield* client.findAll<HulyMeeting>(
    love.mixin.Meeting,
    hulyQuery<HulyMeeting>({ _id: { $in: events.map((event) => toRef<HulyMeeting>(event._id)) } })
  )
  const byEventId = new Map(meetings.map((meeting) => [String(meeting._id), meeting]))
  const missing = events.filter((event) => !byEventId.has(String(event._id))).map((event) => DocId.make(event._id))
  if (missing.length > 0) return yield* new EventMeetingMixinMissingError({ eventId, eventDocumentIds: missing })
  const room = yield* resolveMeetingRoom(client, locator)
  return {
    eventId,
    baseTarget,
    room,
    assignments: events.map((event) => ({
      event,
      previousRoom: assertFirst(meetings.filter((meeting) => String(meeting._id) === String(event._id))).room
    }))
  }
})

export const prepareScheduleMeetingRoomUpdate = Effect.fn("CalendarMeeting.prepareScheduleUpdate")(function* (
  client: HulyClient["Service"],
  scheduleId: ScheduleId,
  locator: MeetingRoomLocator
): Effect.fn.Return<ScheduleMeetingRoomUpdatePlan, PrepareScheduleMeetingRoomUpdateError> {
  const schedule = yield* client.findOne<HulySchedule>(
    calendar.class.Schedule,
    hulyQuery<HulySchedule>({ _id: toRef<HulySchedule>(scheduleId) })
  )
  if (schedule === undefined) return yield* new ScheduleNotFoundError({ scheduleId })
  const employee = yield* authenticatedEmployee(client)
  if (String(schedule.owner) !== String(employee)) {
    return yield* new CalendarMeetingTargetNotWritableError({
      failure: { _tag: "Schedule", targetId: DocId.make(schedule._id), reason: "schedule-owned-by-another-employee" }
    })
  }
  const meeting = yield* client.findOne<HulyMeetingSchedule>(
    love.mixin.MeetingSchedule,
    hulyQuery<HulyMeetingSchedule>({ _id: toRef<HulyMeetingSchedule>(schedule._id) })
  )
  if (meeting === undefined) return yield* new ScheduleMeetingMixinMissingError({ scheduleId })
  return { schedule, previousRoom: meeting.room, room: yield* resolveMeetingRoom(client, locator) }
})
