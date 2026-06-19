import { assertAt, assertExists } from "../../../src/utils/assertions.js"
/* eslint-disable @typescript-eslint/consistent-type-assertions -- tests build SDK-branded fixture values */
import { describe, it } from "@effect/vitest"
import type { Calendar as HulyCalendar, Schedule as HulySchedule } from "@hcengineering/calendar"
import { AccessLevel } from "@hcengineering/calendar"
import type { Employee, Person } from "@hcengineering/contact"
import type { Data, Doc, PersonId as HulyPersonId, Ref, Space } from "@hcengineering/core"
import { toFindResult } from "@hcengineering/core"
import type { MeetingSchedule as HulyMeetingSchedule, Room as HulyRoom } from "@hcengineering/love"
import { Effect } from "effect"
import { expect } from "vitest"

import { ScheduleTitle } from "../../../src/domain/schemas/calendar-schedules.js"
import { CalendarName } from "../../../src/domain/schemas/calendar.js"
import {
  CalendarId,
  DurationMinutes,
  MinuteOfDay,
  PositiveDurationMinutes,
  type ScheduleId,
  TimeZoneId
} from "../../../src/domain/schemas/shared.js"
import type { HulyClientOperations } from "../../../src/huly/client.js"
import { HulyClient } from "../../../src/huly/client.js"
import { calendar, contact, love } from "../../../src/huly/huly-plugins.js"
import {
  createSchedule,
  deleteSchedule,
  getSchedule,
  listSchedules,
  updateSchedule
} from "../../../src/huly/operations/calendar.js"

const scheduleId = (id: string): ScheduleId => id as ScheduleId
const scheduleTitle = ScheduleTitle.make

type FixtureOverrides<T> = {
  readonly [K in keyof T]?: T[K] | undefined
}

const makeCalendar = (overrides?: FixtureOverrides<HulyCalendar>): HulyCalendar =>
  ({
    _id: "cal-1" as Ref<HulyCalendar>,
    _class: calendar.class.Calendar,
    space: calendar.space.Calendar as Ref<Space>,
    modifiedOn: 1,
    createdOn: 1,
    createdBy: "user" as HulyPersonId,
    name: "Personal",
    hidden: false,
    visibility: "private",
    user: "person-1" as HulyPersonId,
    access: AccessLevel.Owner,
    ...overrides
  }) as HulyCalendar

const makePerson = (overrides?: FixtureOverrides<Person>): Person =>
  ({
    _id: "person-1" as Ref<Person>,
    _class: contact.class.Person,
    space: "contact:space:Contacts" as Ref<Space>,
    modifiedOn: 1,
    createdOn: 1,
    createdBy: "user" as HulyPersonId,
    name: "Alice",
    city: "",
    ...overrides
  }) as Person

const makeSchedule = (overrides?: FixtureOverrides<HulySchedule>): HulySchedule =>
  ({
    _id: "schedule-1" as Ref<HulySchedule>,
    _class: calendar.class.Schedule,
    space: calendar.space.Calendar as Ref<Space>,
    modifiedOn: 20,
    createdOn: 10,
    createdBy: "user" as HulyPersonId,
    owner: "person-1" as Ref<Employee>,
    title: "Office hours",
    description: "Book time",
    meetingDuration: 30,
    meetingInterval: 15,
    availability: { 1: [{ start: 540, end: 1020 }] },
    timeZone: "America/New_York",
    calendar: "cal-1" as Ref<HulyCalendar>,
    ...overrides
  }) as HulySchedule

const makeRoom = (overrides?: FixtureOverrides<HulyRoom>): HulyRoom =>
  ({
    _id: "room-1" as Ref<HulyRoom>,
    _class: love.class.Room,
    space: "love:space:Office" as Ref<Space>,
    modifiedOn: 1,
    createdOn: 1,
    createdBy: "user" as HulyPersonId,
    name: "Focus",
    ...overrides
  }) as HulyRoom

const makeMeetingSchedule = (overrides?: FixtureOverrides<HulyMeetingSchedule>): HulyMeetingSchedule =>
  ({
    ...makeSchedule(),
    _class: love.mixin.MeetingSchedule,
    room: "room-1" as Ref<HulyRoom>,
    ...overrides
  }) as HulyMeetingSchedule

const createLayer = (config: {
  readonly schedules?: ReadonlyArray<HulySchedule>
  readonly meetingSchedules?: ReadonlyArray<HulyMeetingSchedule>
  readonly calendars?: ReadonlyArray<HulyCalendar>
  readonly persons?: ReadonlyArray<Person>
  readonly rooms?: ReadonlyArray<HulyRoom>
  readonly captureCreate?: { attributes?: Data<HulySchedule> }
  readonly captureUpdate?: { operations?: Record<string, unknown> }
  readonly captureRemove?: { id?: string }
}) => {
  const schedules = config.schedules ?? []
  const meetingSchedules = config.meetingSchedules ?? []
  const calendars = config.calendars ?? [makeCalendar()]
  const persons = config.persons ?? [makePerson()]
  const rooms = config.rooms ?? []

  const findAll: HulyClientOperations["findAll"] = ((_class: unknown) => {
    if (_class === calendar.class.Schedule) return Effect.succeed(toFindResult([...schedules]))
    if (_class === love.mixin.MeetingSchedule) return Effect.succeed(toFindResult([...meetingSchedules]))
    if (_class === contact.class.Person) return Effect.succeed(toFindResult([...persons]))
    if (_class === love.class.Room) return Effect.succeed(toFindResult([...rooms]))
    return Effect.succeed(toFindResult([]))
  }) as HulyClientOperations["findAll"]

  const findOne: HulyClientOperations["findOne"] = ((_class: unknown, query: unknown) => {
    const q = query as Record<string, unknown>
    if (_class === calendar.class.Schedule) {
      return Effect.succeed(schedules.find((schedule) => schedule._id === q._id))
    }
    if (_class === calendar.class.Calendar) {
      return Effect.succeed(
        q.name === undefined ? calendars.find((cal) => cal._id === q._id) : calendars.find((cal) => cal.name === q.name)
      )
    }
    if (_class === contact.mixin.Employee) {
      return Effect.succeed(persons.find((person) => person._id === q._id || q.personUuid !== undefined))
    }
    return Effect.succeed(undefined)
  }) as HulyClientOperations["findOne"]

  const createDoc: HulyClientOperations["createDoc"] = ((_class: unknown, _space: unknown, attributes: unknown) => {
    if (config.captureCreate) config.captureCreate.attributes = attributes as Data<HulySchedule>
    return Effect.succeed("schedule-new" as Ref<Doc>)
  }) as HulyClientOperations["createDoc"]

  const updateDoc: HulyClientOperations["updateDoc"] =
    ((_class: unknown, _space: unknown, _id: unknown, ops: unknown) => {
      if (config.captureUpdate) config.captureUpdate.operations = ops as Record<string, unknown>
      return Effect.succeed({})
    }) as HulyClientOperations["updateDoc"]

  const removeDoc: HulyClientOperations["removeDoc"] = ((_class: unknown, _space: unknown, id: unknown) => {
    if (config.captureRemove) config.captureRemove.id = String(id)
    return Effect.succeed({})
  }) as HulyClientOperations["removeDoc"]

  return HulyClient.testLayer({ createDoc, findAll, findOne, removeDoc, updateDoc })
}

describe("calendar schedules", () => {
  it.effect("lists schedule summaries with owner and calendar", () =>
    Effect.gen(function*() {
      const result = yield* listSchedules({}).pipe(Effect.provide(createLayer({ schedules: [makeSchedule()] })))

      expect(result).toHaveLength(1)
      expect(assertAt(result, 0).scheduleId).toBe("schedule-1")
      expect(assertAt(result, 0).owner.name).toBe("Alice")
      expect(assertAt(result, 0).calendarId).toBe("cal-1")
    }))

  it.effect("lists owner-filtered room-aware schedules", () =>
    Effect.gen(function*() {
      const { calendar: _calendar, ...scheduleWithoutCalendar } = makeSchedule()
      const result = yield* listSchedules({ owner: "person-1" }).pipe(
        Effect.provide(createLayer({
          schedules: [scheduleWithoutCalendar],
          meetingSchedules: [makeMeetingSchedule({ calendar: undefined })],
          rooms: [makeRoom()]
        }))
      )

      expect(assertAt(result, 0).owner.name).toBe("Alice")
      expect(assertAt(result, 0).calendarId).toBeUndefined()
      expect(assertAt(result, 0).meetingRoom).toEqual({ roomId: "room-1", name: "Focus" })
    }))

  it.effect("lists no schedules without querying room details", () =>
    Effect.gen(function*() {
      const result = yield* listSchedules({}).pipe(Effect.provide(createLayer({ schedules: [] })))

      expect(result).toEqual([])
    }))

  it.effect("lists schedules without meeting schedule room mixins", () =>
    Effect.gen(function*() {
      const result = yield* listSchedules({}).pipe(
        Effect.provide(createLayer({ schedules: [makeSchedule()], meetingSchedules: [] }))
      )

      expect(assertAt(result, 0).meetingRoom).toBeUndefined()
    }))

  it.effect("keeps missing room names absent in room-aware schedules", () =>
    Effect.gen(function*() {
      const { calendar: _calendar, ...scheduleWithoutCalendar } = makeSchedule()
      const result = yield* listSchedules({ owner: "person-1" }).pipe(
        Effect.provide(createLayer({
          schedules: [scheduleWithoutCalendar],
          meetingSchedules: [makeMeetingSchedule({ calendar: undefined })],
          rooms: []
        }))
      )

      expect(assertAt(result, 0).meetingRoom).toEqual({ roomId: "room-1", name: undefined })
    }))

  it.effect("falls back to owner id when participant hydration misses", () =>
    Effect.gen(function*() {
      const result = yield* listSchedules({}).pipe(
        Effect.provide(createLayer({ schedules: [makeSchedule()], persons: [] }))
      )

      expect(assertAt(result, 0).owner.id).toBe("person-1")
      expect(assertAt(result, 0).owner.name).toBeUndefined()
    }))

  it.effect("gets schedule details with availability", () =>
    Effect.gen(function*() {
      const result = yield* getSchedule({ scheduleId: scheduleId("schedule-1") }).pipe(
        Effect.provide(createLayer({ schedules: [makeSchedule()] }))
      )

      expect(result.description).toBe("Book time")
      const mondayAvailability = result.availability["monday"]
      expect(mondayAvailability).toBeDefined()
      expect(mondayAvailability?.[0]?.start).toBe(540)
    }))

  it.effect("rejects invalid Huly schedule availability on read", () =>
    Effect.gen(function*() {
      const invalidSchedule = makeSchedule({
        availability: { 7: [{ start: 600, end: 600 }] } as HulySchedule["availability"]
      })
      const error = yield* Effect.flip(
        getSchedule({ scheduleId: scheduleId("schedule-1") }).pipe(
          Effect.provide(createLayer({ schedules: [invalidSchedule] }))
        )
      )

      expect(error._tag).toBe("HulyConnectionError")
    }))

  it.effect("rejects malformed Huly schedule availability slot containers on read", () =>
    Effect.gen(function*() {
      const malformedAvailability: unknown = { 1: null }
      const invalidSchedule = makeSchedule({
        availability: malformedAvailability as HulySchedule["availability"]
      })
      const error = yield* Effect.flip(
        getSchedule({ scheduleId: scheduleId("schedule-1") }).pipe(
          Effect.provide(createLayer({ schedules: [invalidSchedule] }))
        )
      )

      expect(error._tag).toBe("HulyConnectionError")
    }))

  it.effect("hides Huly's empty-string schedule description clear sentinel on read", () =>
    Effect.gen(function*() {
      const result = yield* getSchedule({ scheduleId: scheduleId("schedule-1") }).pipe(
        Effect.provide(createLayer({
          schedules: [makeSchedule({ description: "" })]
        }))
      )

      expect(result.description).toBeUndefined()
    }))

  it.effect("omits optional schedule timestamps when Huly leaves them unset", () =>
    Effect.gen(function*() {
      const result = yield* getSchedule({ scheduleId: scheduleId("schedule-1") }).pipe(
        Effect.provide(createLayer({
          schedules: [makeSchedule({ createdOn: undefined, modifiedOn: undefined })]
        }))
      )

      expect(result.createdOn).toBeUndefined()
      expect(result.modifiedOn).toBeUndefined()
    }))

  it.effect("fails when schedule is missing", () =>
    Effect.gen(function*() {
      const getError = yield* Effect.flip(
        getSchedule({ scheduleId: scheduleId("missing") }).pipe(Effect.provide(createLayer({ schedules: [] })))
      )
      const updateError = yield* Effect.flip(
        updateSchedule({ scheduleId: scheduleId("missing"), title: scheduleTitle("Nope") }).pipe(
          Effect.provide(createLayer({ schedules: [] }))
        )
      )
      const deleteError = yield* Effect.flip(
        deleteSchedule({ scheduleId: scheduleId("missing") }).pipe(Effect.provide(createLayer({ schedules: [] })))
      )

      expect(getError._tag).toBe("ScheduleNotFoundError")
      expect(updateError._tag).toBe("ScheduleNotFoundError")
      expect(deleteError._tag).toBe("ScheduleNotFoundError")
    }))

  it.effect("creates schedule with owner default and calendar name", () =>
    Effect.gen(function*() {
      const captureCreate: { attributes?: Data<HulySchedule> } = {}
      const result = yield* createSchedule({
        title: scheduleTitle("Consulting"),
        meetingDuration: PositiveDurationMinutes.make(45),
        meetingInterval: DurationMinutes.make(10),
        availability: { tuesday: [{ start: MinuteOfDay.make(600), end: MinuteOfDay.make(900) }] },
        timeZone: TimeZoneId.make("UTC"),
        calendarName: CalendarName.make("Personal")
      }).pipe(Effect.provide(createLayer({ captureCreate })))

      expect(result.scheduleId).toBe("schedule-new")
      expect(captureCreate.attributes?.calendar).toBe("cal-1")
      const createdAvailability = assertExists(assertExists(captureCreate.attributes).availability)
      expect(assertAt(assertExists(createdAvailability[2]), 0).end).toBe(900)
    }))

  it.effect("creates schedule with description and no calendar target", () =>
    Effect.gen(function*() {
      const captureCreate: { attributes?: Data<HulySchedule> } = {}
      yield* createSchedule({
        title: scheduleTitle("No calendar"),
        description: "Public booking page",
        meetingDuration: PositiveDurationMinutes.make(30),
        meetingInterval: DurationMinutes.make(0),
        availability: { friday: [] },
        timeZone: TimeZoneId.make("UTC")
      }).pipe(Effect.provide(createLayer({ captureCreate })))

      expect(captureCreate.attributes?.description).toBe("Public booking page")
      expect(captureCreate.attributes?.calendar).toBeUndefined()
      const createdAvailability = assertExists(assertExists(captureCreate.attributes).availability)
      expect(assertExists(createdAvailability[5])).toEqual([])
    }))

  it.effect("updates schedule calendar target and clears description", () =>
    Effect.gen(function*() {
      const captureUpdate: { operations?: Record<string, unknown> } = {}
      yield* updateSchedule({
        scheduleId: scheduleId("schedule-1"),
        description: null,
        calendarName: CalendarName.make("Personal")
      }).pipe(Effect.provide(createLayer({ schedules: [makeSchedule()], captureUpdate })))

      expect(captureUpdate.operations).toEqual({ description: "", calendar: "cal-1" })
    }))

  it.effect("updates only the schedule title", () =>
    Effect.gen(function*() {
      const captureUpdate: { operations?: Record<string, unknown> } = {}
      yield* updateSchedule({
        scheduleId: scheduleId("schedule-1"),
        title: scheduleTitle("Focused")
      }).pipe(Effect.provide(createLayer({ schedules: [makeSchedule()], captureUpdate })))

      expect(captureUpdate.operations).toEqual({ title: "Focused" })
    }))

  it.effect("updates every writable schedule field", () =>
    Effect.gen(function*() {
      const captureUpdate: { operations?: Record<string, unknown> } = {}
      yield* updateSchedule({
        scheduleId: scheduleId("schedule-1"),
        owner: "person-1",
        title: scheduleTitle("Updated"),
        description: "Updated description",
        meetingDuration: PositiveDurationMinutes.make(60),
        meetingInterval: DurationMinutes.make(5),
        availability: { wednesday: [{ start: MinuteOfDay.make(480), end: MinuteOfDay.make(720) }] },
        timeZone: TimeZoneId.make("Europe/London"),
        calendarId: CalendarId.make("cal-1")
      }).pipe(Effect.provide(createLayer({ schedules: [makeSchedule()], captureUpdate })))

      expect(captureUpdate.operations).toEqual({
        owner: "person-1",
        title: "Updated",
        description: "Updated description",
        meetingDuration: 60,
        meetingInterval: 5,
        availability: { 3: [{ start: 480, end: 720 }] },
        timeZone: "Europe/London",
        calendar: "cal-1"
      })
    }))

  it.effect("fails when schedule calendar name is not accessible", () =>
    Effect.gen(function*() {
      const error = yield* Effect.flip(
        updateSchedule({
          scheduleId: scheduleId("schedule-1"),
          calendarName: CalendarName.make("Missing")
        }).pipe(Effect.provide(createLayer({ schedules: [makeSchedule()] })))
      )

      expect(error._tag).toBe("CalendarNotAccessibleError")
    }))

  it.effect("deletes schedule by id", () =>
    Effect.gen(function*() {
      const captureRemove: { id?: string } = {}
      const result = yield* deleteSchedule({ scheduleId: scheduleId("schedule-1") }).pipe(
        Effect.provide(createLayer({ schedules: [makeSchedule()], captureRemove }))
      )

      expect(result.deleted).toBe(true)
      expect(captureRemove.id).toBe("schedule-1")
    }))
})
