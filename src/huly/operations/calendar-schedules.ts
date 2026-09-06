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
import type { Employee } from "@hcengineering/contact"
import type { Data, DocumentUpdate, Ref, Space } from "@hcengineering/core"
import { generateId, SortingOrder } from "@hcengineering/core"
import type { MeetingSchedule as HulyMeetingSchedule } from "@hcengineering/love"
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
  ScheduleId,
  Timestamp,
  TimeZoneId
} from "../../domain/schemas/shared.js"
import { HulyClient, type HulyClientError } from "../client.js"
import type { Diagnostics } from "../diagnostics.js"
import type {
  CalendarMeetingTargetNotWritableError,
  CalendarNotAccessibleError,
  NoUpdateFieldsError,
  PersonIdentifierAmbiguousError,
  PersonNotAnEmployeeError,
  PersonNotFoundError
} from "../errors.js"
import { HulyDataInvalidError, ScheduleNotFoundError } from "../errors.js"
import { calendar, love } from "../huly-plugins.js"
import {
  createScheduleMeetingComposition,
  type CreateMeetingCompositionError,
  ensureProspectiveMeetingScheduleOwned,
  executeScheduleMeetingMutation,
  type MeetingRoomResolutionError,
  type PrepareScheduleMeetingRoomUpdateError,
  prepareScheduleMeetingRoomUpdate,
  resolveMeetingRoom,
  type ScheduleMeetingMutationError
} from "./calendar-meeting-composition.js"
import { lookupMeetingRoomReferences } from "./calendar-meeting-rooms.js"
import { buildParticipants, resolveCalendarRef } from "./calendar-shared.js"
import { hulyNonEmptyTextOrFallback } from "./non-empty-text.js"
import { resolveTodoOwner } from "./planner-shared.js"
import { snapshotScheduleUpdate } from "./calendar-meeting-snapshots.js"
import { clampLimit, hulyQuery, type StrictDocumentQuery } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"
import { mergeUpdateEntries, requireUpdateFields } from "./update-guards.js"

type ListSchedulesError =
  | HulyClientError
  | HulyDataInvalidError
  | PersonIdentifierAmbiguousError
  | PersonNotFoundError
  | PersonNotAnEmployeeError
type GetScheduleError = HulyClientError | HulyDataInvalidError | ScheduleNotFoundError
type CreateScheduleError =
  | HulyClientError
  | CalendarNotAccessibleError
  | PersonIdentifierAmbiguousError
  | PersonNotFoundError
  | PersonNotAnEmployeeError
  | MeetingRoomResolutionError
  | CreateMeetingCompositionError
  | CalendarMeetingTargetNotWritableError
type UpdateScheduleError =
  | HulyClientError
  | HulyDataInvalidError
  | CalendarNotAccessibleError
  | NoUpdateFieldsError
  | ScheduleNotFoundError
  | PersonIdentifierAmbiguousError
  | PersonNotFoundError
  | PersonNotAnEmployeeError
  | PrepareScheduleMeetingRoomUpdateError
  | ScheduleMeetingMutationError
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
    Effect.mapError(
      (parseError) =>
        new HulyDataInvalidError({
          operation: "readCalendarSchedule",
          entity: "calendar schedule availability",
          cause: parseError
        })
    )
  )

const optionalTimestamp = (value: number | undefined) => (value === undefined ? undefined : Timestamp.make(value))

const optionalDescription = (value: string | undefined): string | undefined =>
  value === undefined || value.trim() === "" ? undefined : value

const UNTITLED_SCHEDULE = ScheduleTitle.make("Untitled Schedule")

const scheduleTitle = (title: string): ScheduleTitle =>
  hulyNonEmptyTextOrFallback(ScheduleTitle, title, UNTITLED_SCHEDULE)

const lookupMeetingScheduleRooms = (
  client: HulyClient["Service"],
  schedules: ReadonlyArray<HulySchedule>
): Effect.Effect<ReadonlyMap<string, RoomReference>, HulyClientError, Diagnostics> =>
  Effect.gen(function* () {
    const scheduleIds = schedules.map((schedule) => toRef<HulyMeetingSchedule>(schedule._id))
    if (scheduleIds.length === 0) return new Map()
    const meetingSchedules = yield* client.findAll<HulyMeetingSchedule>(
      love.mixin.MeetingSchedule,
      hulyQuery<HulyMeetingSchedule>({ _id: { $in: scheduleIds } })
    )
    return yield* lookupMeetingRoomReferences(client, meetingSchedules)
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
): Effect.Effect<ScheduleDetails, HulyClientError | HulyDataInvalidError> =>
  Effect.map(parseHulyScheduleAvailability(schedule.availability), (availability) => ({
    ...summarizeSchedule(schedule, owner, rooms),
    description: optionalDescription(schedule.description),
    availability,
    createdOn: optionalTimestamp(schedule.createdOn)
  }))

const buildOwner = (
  client: HulyClient["Service"],
  schedule: HulySchedule
): Effect.Effect<Participant, HulyClientError> =>
  Effect.map(
    buildParticipants(client, [schedule.owner]),
    (owners) => owners[0] ?? { id: PersonId.make(schedule.owner) }
  )

export const listSchedules = (
  params: ListSchedulesParams
): Effect.Effect<Array<ScheduleSummary>, ListSchedulesError, HulyClient | Diagnostics> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const query: StrictDocumentQuery<HulySchedule> = {}
    if (params.owner !== undefined) {
      query.owner = yield* resolveTodoOwner(client, params.owner)
    }
    const schedules = yield* client.findAll<HulySchedule>(calendar.class.Schedule, hulyQuery(query), {
      limit: clampLimit(params.limit),
      sort: { modifiedOn: SortingOrder.Descending }
    })
    const rooms = yield* lookupMeetingScheduleRooms(client, schedules)
    return yield* Effect.all(
      schedules.map((schedule) =>
        Effect.map(buildOwner(client, schedule), (owner) => summarizeSchedule(schedule, owner, rooms))
      )
    )
  })

export const getSchedule = (
  params: GetScheduleParams
): Effect.Effect<ScheduleDetails, GetScheduleError, HulyClient | Diagnostics> =>
  Effect.gen(function* () {
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

const resolveOptionalScheduleCalendar = (
  client: HulyClient["Service"],
  params: CreateScheduleParams
): Effect.Effect<Ref<HulyCalendar> | undefined, CalendarNotAccessibleError | HulyClientError> =>
  params.calendarId === undefined && params.calendarName === undefined
    ? Effect.succeed(undefined)
    : resolveCalendarRef(client, params.calendarId, params.calendarName)

const createScheduleData = (
  params: CreateScheduleParams,
  owner: Ref<Employee>,
  calendarRef: Ref<HulyCalendar> | undefined
): Data<HulySchedule> => {
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
  return data
}

type UpdateScheduleField = (typeof UPDATE_SCHEDULE_FIELDS)[number]
type UpdateScheduleEntry = Effect.Effect<DocumentUpdate<HulySchedule>, UpdateScheduleError>
type UpdateScheduleEntries = Record<UpdateScheduleField, UpdateScheduleEntry>

const updateScheduleEntries = (client: HulyClient["Service"], params: UpdateScheduleParams): UpdateScheduleEntries => ({
  owner: Effect.gen(function* () {
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
  calendarId: Effect.gen(function* () {
    if (params.calendarId === undefined) return {}
    return { calendar: yield* resolveCalendarRef(client, params.calendarId) }
  }),
  calendarName: Effect.gen(function* () {
    if (params.calendarName === undefined) return {}
    return { calendar: yield* resolveCalendarRef(client, undefined, params.calendarName) }
  }),
  meetingRoom: Effect.succeed({})
})

export const createSchedule = Effect.fn("Calendar.createSchedule")(function* (
  params: CreateScheduleParams
): Effect.fn.Return<CreateScheduleResult, CreateScheduleError, HulyClient> {
  const client = yield* HulyClient
  const scheduleId = generateId<HulySchedule>()
  const owner = yield* resolveTodoOwner(client, params.owner)
  const meetingRoomLocator = params.meetingRoom
  const meetingRoom =
    meetingRoomLocator === undefined
      ? undefined
      : yield* Effect.gen(function* () {
          yield* ensureProspectiveMeetingScheduleOwned(client, scheduleId, owner)
          return yield* resolveMeetingRoom(client, meetingRoomLocator)
        })
  const calendarRef = yield* resolveOptionalScheduleCalendar(client, params)
  const data = createScheduleData(params, owner, calendarRef)

  const scheduleSpace = toRef<Space>(calendar.space.Calendar)
  const createdScheduleId =
    meetingRoom === undefined
      ? yield* client.createDoc(calendar.class.Schedule, scheduleSpace, data, scheduleId)
      : yield* createScheduleMeetingComposition(client, {
          scheduleId,
          space: scheduleSpace,
          room: meetingRoom._id,
          createBase: () => client.createDoc(calendar.class.Schedule, scheduleSpace, data, scheduleId)
        })
  return { scheduleId: ScheduleId.make(createdScheduleId) }
})

export const updateSchedule = Effect.fn("Calendar.updateSchedule")(function* (
  params: UpdateScheduleParams
): Effect.fn.Return<UpdateScheduleResult, UpdateScheduleError, HulyClient> {
  yield* requireUpdateFields("update_schedule", params, UPDATE_SCHEDULE_FIELDS)
  const client = yield* HulyClient
  const meetingPlan =
    params.meetingRoom === undefined
      ? undefined
      : yield* prepareScheduleMeetingRoomUpdate(client, params.scheduleId, params.meetingRoom)
  const schedule =
    meetingPlan?.schedule ??
    (yield* client.findOne<HulySchedule>(
      calendar.class.Schedule,
      hulyQuery<HulySchedule>({ _id: toRef<HulySchedule>(params.scheduleId) })
    ))
  if (schedule === undefined) return yield* new ScheduleNotFoundError({ scheduleId: params.scheduleId })

  const entries = updateScheduleEntries(client, params)
  const updateOps = mergeUpdateEntries(yield* Effect.all(Object.values(entries)))
  if (meetingPlan === undefined) {
    if (Reflect.ownKeys(updateOps).length > 0) {
      yield* client.updateDoc(calendar.class.Schedule, schedule.space, schedule._id, updateOps)
    }
  } else {
    yield* executeScheduleMeetingMutation(client, {
      plan: meetingPlan,
      update: updateOps,
      inverse: snapshotScheduleUpdate(schedule, updateOps)
    })
  }
  return { scheduleId: params.scheduleId, updated: true }
})

export const deleteSchedule = (
  params: DeleteScheduleParams
): Effect.Effect<DeleteScheduleResult, DeleteScheduleError, HulyClient> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const schedule = yield* client.findOne<HulySchedule>(
      calendar.class.Schedule,
      hulyQuery<HulySchedule>({ _id: toRef<HulySchedule>(params.scheduleId) })
    )
    if (schedule === undefined) return yield* new ScheduleNotFoundError({ scheduleId: params.scheduleId })
    yield* client.removeDoc(calendar.class.Schedule, schedule.space, schedule._id)
    return { scheduleId: params.scheduleId, deleted: true }
  })
