/**
 * Calendar schedule operations.
 *
 * @module
 */
import type {
  Calendar as HulyCalendar,
  Schedule as HulySchedule,
  ScheduleAvailability as HulyScheduleAvailability
} from "@hcengineering/calendar"
import type { Data, DocumentUpdate, Ref, Space } from "@hcengineering/core"
import { SortingOrder } from "@hcengineering/core"
import type { MeetingSchedule as HulyMeetingSchedule, Room as HulyRoom } from "@hcengineering/love"
import { Effect } from "effect"

import type {
  CreateScheduleParams,
  CreateScheduleResult,
  DeleteScheduleParams,
  DeleteScheduleResult,
  GetScheduleParams,
  HulyDecodedScheduleAvailability,
  HulyScheduleWeekdayKey,
  ListSchedulesParams,
  ScheduleAvailability,
  ScheduleAvailabilitySlot,
  ScheduleDetails,
  ScheduleSummary,
  ScheduleWeekday,
  UpdateScheduleParams,
  UpdateScheduleResult
} from "../../domain/schemas/calendar-schedules.js"
import {
  HulyScheduleWeekdayKeyValues,
  parseHulyScheduleAvailability as decodeHulyScheduleAvailabilitySchema,
  ScheduleTitle,
  ScheduleWeekdayValues,
  UPDATE_SCHEDULE_FIELDS
} from "../../domain/schemas/calendar-schedules.js"
import type { Participant, RoomReference } from "../../domain/schemas/calendar.js"
import {
  CalendarId,
  DurationMinutes,
  PersonId,
  PositiveDurationMinutes,
  RoomId,
  RoomName,
  ScheduleId,
  Timestamp,
  TimeZoneId
} from "../../domain/schemas/shared.js"
import { HulyClient, type HulyClientError } from "../client.js"
import type {
  CalendarNotAccessibleError,
  NoUpdateFieldsError,
  PersonIdentifierAmbiguousError,
  PersonNotAnEmployeeError,
  PersonNotFoundError
} from "../errors.js"
import { HulyConnectionError, ScheduleNotFoundError } from "../errors.js"
import { calendar, love } from "../huly-plugins.js"
import { buildParticipants, resolveCalendarRef } from "./calendar-shared.js"
import { hulyNonEmptyTextOrFallback } from "./non-empty-text.js"
import { resolveTodoOwner } from "./planner-shared.js"
import { clampLimit, hulyQuery, type StrictDocumentQuery } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"
import { mergeUpdateEntries, requireUpdateFields } from "./update-guards.js"

type ListSchedulesError =
  | HulyClientError
  | PersonIdentifierAmbiguousError
  | PersonNotFoundError
  | PersonNotAnEmployeeError
type GetScheduleError = HulyClientError | ScheduleNotFoundError
type CreateScheduleError =
  | HulyClientError
  | CalendarNotAccessibleError
  | PersonIdentifierAmbiguousError
  | PersonNotFoundError
  | PersonNotAnEmployeeError
type UpdateScheduleError =
  | HulyClientError
  | CalendarNotAccessibleError
  | NoUpdateFieldsError
  | ScheduleNotFoundError
  | PersonIdentifierAmbiguousError
  | PersonNotFoundError
  | PersonNotAnEmployeeError
type DeleteScheduleError = HulyClientError | ScheduleNotFoundError

const SCHEDULE_WEEKDAY_TO_HULY_INDEX = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6
} as const satisfies Record<ScheduleWeekday, number>

const HULY_INDEX_TO_SCHEDULE_WEEKDAY = {
  "0": "sunday",
  "1": "monday",
  "2": "tuesday",
  "3": "wednesday",
  "4": "thursday",
  "5": "friday",
  "6": "saturday"
} as const satisfies Record<HulyScheduleWeekdayKey, ScheduleWeekday>

const availabilityToHuly = (availability: ScheduleAvailability): HulyScheduleAvailability => {
  const result: HulyScheduleAvailability = {}
  for (const day of ScheduleWeekdayValues) {
    const slots = availability[day]
    if (slots !== undefined) {
      result[SCHEDULE_WEEKDAY_TO_HULY_INDEX[day]] = slots.map((slot) => ({ start: slot.start, end: slot.end }))
    }
  }
  return result
}

const hulyAvailabilityToSchedule = (availability: HulyDecodedScheduleAvailability): ScheduleAvailability => {
  const result: Partial<Record<ScheduleWeekday, ReadonlyArray<ScheduleAvailabilitySlot>>> = {}
  for (const hulyDay of HulyScheduleWeekdayKeyValues) {
    const slots = availability[hulyDay]
    if (slots !== undefined) {
      result[HULY_INDEX_TO_SCHEDULE_WEEKDAY[hulyDay]] = slots
    }
  }
  return result
}

const parseHulyScheduleAvailability = (availability: unknown) =>
  decodeHulyScheduleAvailabilitySchema(availability).pipe(
    Effect.map(hulyAvailabilityToSchedule),
    Effect.mapError((parseError) =>
      new HulyConnectionError({
        message: `Calendar schedule availability failed schema validation: ${parseError.message}`,
        cause: parseError
      })
    )
  )

const optionalTimestamp = (value: number | undefined) => value === undefined ? undefined : Timestamp.make(value)

const optionalDescription = (value: string | undefined): string | undefined =>
  value === undefined || value.trim() === "" ? undefined : value

const optionalRoomName = (value: string | undefined): RoomName | undefined => {
  const trimmed = value?.trim() ?? ""
  return trimmed === "" ? undefined : RoomName.make(trimmed)
}

const UNTITLED_SCHEDULE = ScheduleTitle.make("Untitled Schedule")

const scheduleTitle = (title: string): ScheduleTitle =>
  hulyNonEmptyTextOrFallback(ScheduleTitle, title, UNTITLED_SCHEDULE)

const lookupMeetingScheduleRooms = (
  client: HulyClient["Type"],
  schedules: ReadonlyArray<HulySchedule>
): Effect.Effect<ReadonlyMap<string, RoomReference>, HulyClientError> =>
  Effect.gen(function*() {
    const scheduleIds = schedules.map((schedule) => toRef<HulyMeetingSchedule>(schedule._id))
    if (scheduleIds.length === 0) return new Map()
    const meetingSchedules = yield* client.findAll<HulyMeetingSchedule>(
      love.mixin.MeetingSchedule,
      hulyQuery<HulyMeetingSchedule>({ _id: { $in: scheduleIds } })
    )
    const roomIds = [...new Set(meetingSchedules.map((schedule) => schedule.room))]
    if (roomIds.length === 0) return new Map()
    const rooms = yield* client.findAll<HulyRoom>(
      love.class.Room,
      hulyQuery<HulyRoom>({ _id: { $in: roomIds } })
    )
    const roomsById = new Map(rooms.map((room) => [room._id, room]))
    return new Map(meetingSchedules.map((schedule) => [
      String(schedule._id),
      {
        roomId: RoomId.make(schedule.room),
        name: optionalRoomName(roomsById.get(schedule.room)?.name)
      }
    ]))
  })

const summarizeSchedule = (
  schedule: HulySchedule,
  owner: Participant,
  rooms: ReadonlyMap<string, RoomReference>
): ScheduleSummary => ({
  scheduleId: ScheduleId.make(schedule._id),
  title: scheduleTitle(schedule.title),
  owner,
  meetingDuration: PositiveDurationMinutes.make(schedule.meetingDuration),
  meetingInterval: DurationMinutes.make(schedule.meetingInterval),
  timeZone: TimeZoneId.make(schedule.timeZone),
  calendarId: schedule.calendar === undefined ? undefined : CalendarId.make(schedule.calendar),
  meetingRoom: rooms.get(String(schedule._id)),
  modifiedOn: optionalTimestamp(schedule.modifiedOn)
})

const scheduleDetails = (
  schedule: HulySchedule,
  owner: Participant,
  rooms: ReadonlyMap<string, RoomReference>
): Effect.Effect<ScheduleDetails, HulyClientError> =>
  Effect.map(parseHulyScheduleAvailability(schedule.availability), (availability) => ({
    ...summarizeSchedule(schedule, owner, rooms),
    description: optionalDescription(schedule.description),
    availability,
    createdOn: optionalTimestamp(schedule.createdOn)
  }))

const buildOwner = (
  client: HulyClient["Type"],
  schedule: HulySchedule
): Effect.Effect<Participant, HulyClientError> =>
  Effect.map(
    buildParticipants(client, [schedule.owner]),
    (owners) => owners[0] ?? { id: PersonId.make(schedule.owner) }
  )

export const listSchedules = (
  params: ListSchedulesParams
): Effect.Effect<Array<ScheduleSummary>, ListSchedulesError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const query: StrictDocumentQuery<HulySchedule> = {}
    if (params.owner !== undefined) {
      query.owner = yield* resolveTodoOwner(client, params.owner)
    }
    const schedules = yield* client.findAll<HulySchedule>(
      calendar.class.Schedule,
      hulyQuery(query),
      {
        limit: clampLimit(params.limit),
        sort: { modifiedOn: SortingOrder.Descending }
      }
    )
    const rooms = yield* lookupMeetingScheduleRooms(client, schedules)
    return yield* Effect.all(schedules.map((schedule) =>
      Effect.map(buildOwner(client, schedule), (owner) => summarizeSchedule(schedule, owner, rooms))
    ))
  })

export const getSchedule = (
  params: GetScheduleParams
): Effect.Effect<ScheduleDetails, GetScheduleError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const schedule = yield* client.findOne<HulySchedule>(
      calendar.class.Schedule,
      hulyQuery<HulySchedule>({ _id: toRef<HulySchedule>(params.scheduleId) })
    )
    if (schedule === undefined) return yield* new ScheduleNotFoundError({ scheduleId: params.scheduleId })
    const rooms = yield* lookupMeetingScheduleRooms(client, [schedule])
    const owner = yield* buildOwner(client, schedule)
    return yield* scheduleDetails(schedule, owner, rooms)
  })

export const createSchedule = (
  params: CreateScheduleParams
): Effect.Effect<CreateScheduleResult, CreateScheduleError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const owner = yield* resolveTodoOwner(client, params.owner)
    const calendarRef: Ref<HulyCalendar> | undefined =
      params.calendarId === undefined && params.calendarName === undefined
        ? undefined
        : yield* resolveCalendarRef(client, params.calendarId, params.calendarName)

    const data: Data<HulySchedule> = {
      owner,
      title: params.title,
      meetingDuration: params.meetingDuration,
      meetingInterval: params.meetingInterval,
      availability: availabilityToHuly(params.availability),
      timeZone: params.timeZone
    }
    if (params.description !== undefined) data.description = params.description
    if (calendarRef !== undefined) data.calendar = calendarRef

    const scheduleId = yield* client.createDoc(
      calendar.class.Schedule,
      toRef<Space>(calendar.space.Calendar),
      data
    )
    return { scheduleId: ScheduleId.make(scheduleId) }
  })

export const updateSchedule = (
  params: UpdateScheduleParams
): Effect.Effect<UpdateScheduleResult, UpdateScheduleError, HulyClient> =>
  Effect.gen(function*() {
    yield* requireUpdateFields("update_schedule", params, UPDATE_SCHEDULE_FIELDS)
    const client = yield* HulyClient
    const schedule = yield* client.findOne<HulySchedule>(
      calendar.class.Schedule,
      hulyQuery<HulySchedule>({ _id: toRef<HulySchedule>(params.scheduleId) })
    )
    if (schedule === undefined) return yield* new ScheduleNotFoundError({ scheduleId: params.scheduleId })

    type UpdateScheduleField = typeof UPDATE_SCHEDULE_FIELDS[number]
    type UpdateScheduleEntry = Effect.Effect<DocumentUpdate<HulySchedule>, UpdateScheduleError>
    type UpdateScheduleEntries = Record<UpdateScheduleField, UpdateScheduleEntry>
    const entries = {
      owner: Effect.gen(function*() {
        if (params.owner === undefined) return {}
        return { owner: yield* resolveTodoOwner(client, params.owner) }
      }),
      title: Effect.succeed(params.title === undefined ? {} : { title: params.title }),
      description: Effect.succeed(
        // Huly Schedule ignores `$unset` for this field; write the SDK's empty-string clear value for MCP `null`.
        params.description === undefined ? {} : { description: params.description ?? "" }
      ),
      meetingDuration: Effect.succeed(
        params.meetingDuration === undefined ? {} : { meetingDuration: params.meetingDuration }
      ),
      meetingInterval: Effect.succeed(
        params.meetingInterval === undefined ? {} : { meetingInterval: params.meetingInterval }
      ),
      availability: Effect.succeed(
        params.availability === undefined ? {} : { availability: availabilityToHuly(params.availability) }
      ),
      timeZone: Effect.succeed(params.timeZone === undefined ? {} : { timeZone: params.timeZone }),
      calendarId: Effect.gen(function*() {
        if (params.calendarId === undefined) return {}
        return { calendar: yield* resolveCalendarRef(client, params.calendarId) }
      }),
      calendarName: Effect.gen(function*() {
        if (params.calendarName === undefined) return {}
        return { calendar: yield* resolveCalendarRef(client, undefined, params.calendarName) }
      })
    } satisfies UpdateScheduleEntries

    const updateOps = mergeUpdateEntries(yield* Effect.all(Object.values(entries)))
    yield* client.updateDoc(calendar.class.Schedule, schedule.space, schedule._id, updateOps)
    return { scheduleId: params.scheduleId, updated: true }
  })

export const deleteSchedule = (
  params: DeleteScheduleParams
): Effect.Effect<DeleteScheduleResult, DeleteScheduleError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const schedule = yield* client.findOne<HulySchedule>(
      calendar.class.Schedule,
      hulyQuery<HulySchedule>({ _id: toRef<HulySchedule>(params.scheduleId) })
    )
    if (schedule === undefined) return yield* new ScheduleNotFoundError({ scheduleId: params.scheduleId })
    yield* client.removeDoc(calendar.class.Schedule, schedule.space, schedule._id)
    return { scheduleId: params.scheduleId, deleted: true }
  })
