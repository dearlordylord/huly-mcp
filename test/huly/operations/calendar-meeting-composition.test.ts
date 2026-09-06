import { describe, it } from "@effect/vitest"
import {
  AccessLevel,
  type Calendar as HulyCalendar,
  type Event as HulyEvent,
  type Schedule as HulySchedule
} from "@hcengineering/calendar"
import type { Employee } from "@hcengineering/contact"
import type { MarkupRef } from "@hcengineering/api-client"
import type { Ref } from "@hcengineering/core"
import { toFindResult } from "@hcengineering/core"
import type { Floor, Meeting, MeetingSchedule, Office, Room } from "@hcengineering/love"
import { RoomAccess, RoomType } from "@hcengineering/love"
import { Cause, Clock, Effect, Exit, Fiber, Layer, Result } from "effect"
import { TestClock } from "effect/testing"
import { expect } from "vitest"

import { sdkFixture } from "../../helpers/huly-sdk.js"

import {
  MeetingRoomFloorIdentifier,
  MeetingRoomIdentifier,
  type MeetingCompositionFailedStep,
  type MeetingRoomLocator
} from "../../../src/domain/schemas/calendar-meeting-rooms.js"
import { ScheduleTitle } from "../../../src/domain/schemas/calendar-schedules.js"
import { CalendarEventTitle } from "../../../src/domain/schemas/calendar.js"
import {
  Count,
  DocId,
  DurationMinutes,
  EventId,
  MinuteOfDay,
  NonEmptyString,
  PositiveDurationMinutes,
  RoomId,
  ScheduleId,
  Timestamp,
  TimeZoneId
} from "../../../src/domain/schemas/shared.js"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import { HulyConnectionError } from "../../../src/huly/errors.js"
import {
  CalendarMeetingTargetNotWritableError,
  EventMeetingMixinMissingError,
  EventSiblingConvergenceError,
  MeetingCompositionMutationError,
  MeetingRoomAssignmentUnsupportedError,
  MeetingRoomIdentifierAmbiguousError,
  MeetingRoomNotFoundError,
  ScheduleMeetingMixinMissingError
} from "../../../src/huly/errors-calendar-meetings.js"
import { calendar, contact, core, love } from "../../../src/huly/huly-plugins.js"
import {
  applyEventMeetingRoomUpdate,
  applyScheduleMeetingRoomUpdate,
  prepareEventMeetingRoomUpdate,
  prepareScheduleMeetingRoomUpdate,
  resolveMeetingRoom,
  snapshotPriorMarkup
} from "../../../src/huly/operations/calendar-meeting-composition.js"
import { readStableEventSiblings } from "../../../src/huly/operations/calendar-meeting-event-read.js"
import { failMeetingComposition } from "../../../src/huly/operations/calendar-meeting-saga-failure.js"
import { snapshotEventUpdate, snapshotScheduleUpdate } from "../../../src/huly/operations/calendar-meeting-snapshots.js"
import { createEvent, createSchedule, updateEvent, updateSchedule } from "../../../src/huly/operations/calendar.js"

type FixtureOverrides<T> = { readonly [K in keyof T]?: T[K] | undefined }

const makeFloor = (id: string, name: string): Floor =>
  sdkFixture<Floor>({
    _id: id,
    _class: love.class.Floor,
    space: core.space.Workspace,
    modifiedBy: "actor",
    modifiedOn: 1,
    name
  })

const makeRoom = (id: string, name: string, floor = "floor-1", overrides?: FixtureOverrides<Room>): Room =>
  sdkFixture<Room>({
    _id: id,
    _class: love.class.Room,
    space: core.space.Workspace,
    modifiedBy: "actor",
    modifiedOn: 1,
    name,
    type: RoomType.Video,
    access: RoomAccess.Open,
    floor,
    width: 2,
    height: 1,
    x: 0,
    y: 0,
    language: "en",
    startWithTranscription: false,
    startWithRecording: false,
    description: null,
    ...overrides
  })

const makeOffice = (id: string, person: string | null): Office =>
  sdkFixture<Office>({
    ...makeRoom(id, "", "floor-1", { type: RoomType.Audio, access: RoomAccess.Knock }),
    _class: love.class.Office,
    person
  })

const makeEvent = (id: string, access: AccessLevel, overrides?: FixtureOverrides<HulyEvent>): HulyEvent =>
  sdkFixture<HulyEvent>({
    _id: id,
    _class: calendar.class.Event,
    space: calendar.space.Calendar,
    modifiedBy: "actor",
    modifiedOn: 1,
    attachedTo: calendar.space.Calendar,
    attachedToClass: core.class.Space,
    collection: "events",
    eventId: "event-group",
    title: "Planning",
    description: "",
    calendar: "calendar-1",
    allDay: false,
    date: 1,
    dueDate: 2,
    participants: [],
    access,
    user: "test-primary-social-id",
    blockTime: false,
    location: "Physical room note",
    ...overrides
  })

const makeMeeting = (event: HulyEvent, room: string): Meeting => sdkFixture<Meeting>({ ...event, room })

const makeSchedule = (overrides?: FixtureOverrides<HulySchedule>): HulySchedule =>
  sdkFixture<HulySchedule>({
    _id: "schedule-1",
    _class: calendar.class.Schedule,
    space: calendar.space.Calendar,
    modifiedBy: "actor",
    modifiedOn: 1,
    owner: "employee-1",
    title: "Office hours",
    meetingDuration: 30,
    meetingInterval: 0,
    availability: {},
    timeZone: "UTC",
    ...overrides
  })

const makeMeetingSchedule = (schedule: HulySchedule, room: string): MeetingSchedule =>
  sdkFixture<MeetingSchedule>({ ...schedule, room })

const makeEmployee = (id = "employee-1"): Employee =>
  sdkFixture<Employee>({
    _id: id,
    _class: contact.mixin.Employee,
    space: "contact:space:Contacts",
    modifiedBy: "actor",
    modifiedOn: 1,
    name: "Caller",
    city: ""
  })

const makeCalendar = (): HulyCalendar =>
  sdkFixture<HulyCalendar>({
    _id: "calendar-1",
    _class: calendar.class.Calendar,
    space: calendar.space.Calendar,
    modifiedBy: "actor",
    modifiedOn: 1,
    name: "Personal",
    hidden: false,
    visibility: "private",
    user: "test-primary-social-id",
    access: AccessLevel.Owner
  })

const locator = (room: string, floor?: string): MeetingRoomLocator => ({
  room: MeetingRoomIdentifier.make(room),
  ...(floor === undefined ? {} : { floor: MeetingRoomFloorIdentifier.make(floor) })
})

const connectionFailure = (message: string) => new HulyConnectionError({ message })

interface TestState {
  readonly calls: Array<{ readonly operation: string; readonly id: string; readonly room?: string }>
  readonly roomByDocument: Map<string, string>
  readonly createdAttributes: Array<Record<string, unknown>>
  readonly events: ReadonlyArray<HulyEvent>
  readonly schedules: ReadonlyArray<HulySchedule>
  eventSiblingReads: number
}

interface LayerConfig {
  readonly floors?: ReadonlyArray<Floor>
  readonly rooms?: ReadonlyArray<Room>
  readonly events?: ReadonlyArray<HulyEvent>
  readonly meetings?: ReadonlyArray<Meeting>
  readonly schedules?: ReadonlyArray<HulySchedule>
  readonly meetingSchedules?: ReadonlyArray<MeetingSchedule>
  readonly employee?: Employee | null
  readonly failUpdateMixinCalls?: ReadonlySet<number>
  readonly failCreateMixinCalls?: ReadonlySet<number>
  readonly failCreateMixin?: boolean
  readonly failEventFindAllCalls?: ReadonlySet<number>
  readonly failMeetingFindAllCalls?: ReadonlySet<number>
  readonly hideEventFindAllCalls?: ReadonlySet<number>
  readonly eventSiblingSnapshots?: ReadonlyArray<ReadonlyArray<HulyEvent>>
  readonly failRemoveDoc?: boolean
  readonly failRemoveDocCalls?: ReadonlySet<number>
  readonly failUpdateDoc?: boolean
  readonly failUpdateDocCalls?: ReadonlySet<number>
  readonly commitThenFailUpdateDocCalls?: ReadonlySet<number>
  readonly failUpdateMarkup?: boolean
  readonly failUpdateMarkupCalls?: ReadonlySet<number>
  readonly failUploadMarkup?: boolean
  readonly spawnEventSiblingOnParticipantUpdate?: boolean
  readonly spawnCreatedParticipantSibling?: boolean
  readonly spawnEventSiblingMeetingRoom?: string
  readonly removeEventSiblingOnParticipantUpdate?: boolean
  readonly growEventSiblingsOnFindAll?: boolean
  readonly commitThenDieAddCollection?: boolean
  readonly commitThenInterruptCreateDoc?: boolean
  readonly dieUpdateMixinCalls?: ReadonlySet<number>
  readonly interruptUpdateMixinCalls?: ReadonlySet<number>
}

const immediateClock: Clock.Clock = {
  currentTimeMillisUnsafe: () => 0,
  currentTimeMillis: Effect.succeed(0),
  currentTimeNanosUnsafe: () => 0n,
  currentTimeNanos: Effect.succeed(0n),
  monotonicTimeNanosUnsafe: () => 0n,
  monotonicTimeNanos: Effect.succeed(0n),
  sleep: () => Effect.void
}

const createLayer = (
  config: LayerConfig
): {
  readonly clientLayer: ReturnType<typeof HulyClient.testLayer>
  readonly layer: ReturnType<typeof HulyClient.testLayer>
  state: TestState
} => {
  const floors = [...(config.floors ?? [makeFloor("floor-1", "Main")])]
  const rooms = [...(config.rooms ?? [])]
  const events = [...(config.events ?? [])]
  const meetings = [...(config.meetings ?? [])]
  const schedules = [...(config.schedules ?? [])]
  const meetingSchedules = [...(config.meetingSchedules ?? [])]
  const employee = config.employee === undefined ? makeEmployee() : config.employee
  const state: TestState = {
    calls: [],
    roomByDocument: new Map([
      ...meetings.map((meeting): readonly [string, string] => [String(meeting._id), String(meeting.room)]),
      ...meetingSchedules.map((schedule): readonly [string, string] => [String(schedule._id), String(schedule.room)])
    ]),
    createdAttributes: [],
    events,
    schedules,
    eventSiblingReads: 0
  }

  let eventFindAllCall = 0
  let meetingFindAllCall = 0
  const findAll = sdkFixture<HulyClientOperations["findAll"]>((_class: unknown, query: unknown) => {
    const q = sdkFixture<{
      readonly eventId?: string
      readonly floor?: string
      readonly name?: string
      readonly _id?: { readonly $in?: ReadonlyArray<string> }
    }>(query)
    if (_class === love.class.Floor) {
      return Effect.succeed(toFindResult(floors.filter((floor) => q.name === undefined || floor.name === q.name)))
    }
    if (_class === love.class.Room) {
      return Effect.succeed(
        toFindResult(
          rooms.filter(
            (room) =>
              (q.name === undefined || room.name === q.name) && (q.floor === undefined || room.floor === q.floor)
          )
        )
      )
    }
    if (_class === calendar.class.Event) {
      eventFindAllCall += 1
      state.eventSiblingReads = eventFindAllCall
      if (config.failEventFindAllCalls?.has(eventFindAllCall) === true) {
        return Effect.fail(connectionFailure(`Event findAll ${eventFindAllCall} failed`))
      }
      if (config.hideEventFindAllCalls?.has(eventFindAllCall) === true) return Effect.succeed(toFindResult([]))
      const configuredSnapshot = config.eventSiblingSnapshots?.[eventFindAllCall - 1]
      if (configuredSnapshot !== undefined) {
        return Effect.succeed(
          toFindResult(configuredSnapshot.filter((event) => q.eventId === undefined || event.eventId === q.eventId))
        )
      }
      if (config.growEventSiblingsOnFindAll === true) {
        events.push(makeEvent(`growing-${eventFindAllCall}`, AccessLevel.Reader))
      }
      return Effect.succeed(
        toFindResult(events.filter((event) => q.eventId === undefined || event.eventId === q.eventId))
      )
    }
    if (_class === love.mixin.Meeting) {
      meetingFindAllCall += 1
      if (config.failMeetingFindAllCalls?.has(meetingFindAllCall) === true) {
        return Effect.fail(connectionFailure(`Meeting findAll ${meetingFindAllCall} failed`))
      }
      const ids = q._id?.$in
      return Effect.succeed(toFindResult(meetings.filter((meeting) => ids === undefined || ids.includes(meeting._id))))
    }
    if (_class === calendar.class.Calendar) return Effect.succeed(toFindResult([makeCalendar()]))
    return Effect.succeed(toFindResult([]))
  })

  const findOne = sdkFixture<HulyClientOperations["findOne"]>((_class: unknown, query: unknown) => {
    const q = sdkFixture<{
      readonly _id?: string
      readonly eventId?: string
      readonly name?: string
      readonly personUuid?: string
    }>(query)
    if (_class === love.class.Floor) return Effect.succeed(floors.find((floor) => floor._id === q._id))
    if (_class === love.class.Room) return Effect.succeed(rooms.find((room) => room._id === q._id))
    if (_class === contact.mixin.Employee) {
      if (q._id !== undefined) return Effect.succeed(employee?._id === q._id ? employee : makeEmployee(q._id))
      return Effect.succeed(employee ?? undefined)
    }
    if (_class === calendar.class.Event) {
      return Effect.succeed(events.find((event) => event.eventId === q.eventId))
    }
    if (_class === calendar.class.Schedule) {
      return Effect.succeed(schedules.find((schedule) => schedule._id === q._id))
    }
    if (_class === love.mixin.MeetingSchedule) {
      return Effect.succeed(meetingSchedules.find((schedule) => schedule._id === q._id))
    }
    if (_class === calendar.class.Calendar) return Effect.succeed(makeCalendar())
    if (_class === calendar.class.PrimaryCalendar) return Effect.succeed(undefined)
    return Effect.succeed(undefined)
  })

  let updateMixinCall = 0
  const updateMixin = sdkFixture<HulyClientOperations["updateMixin"]>(
    (objectId: unknown, _objectClass: unknown, _space: unknown, _mixin: unknown, attributes: unknown) => {
      updateMixinCall += 1
      const room = String(sdkFixture<{ readonly room: unknown }>(attributes).room)
      const id = String(objectId)
      state.calls.push({ operation: "updateMixin", id, room })
      if (config.failUpdateMixinCalls?.has(updateMixinCall) === true) {
        return Effect.fail(connectionFailure(`updateMixin ${updateMixinCall} failed`))
      }
      if (config.dieUpdateMixinCalls?.has(updateMixinCall) === true) {
        return Effect.die(new Error("operator-secret defect"))
      }
      if (config.interruptUpdateMixinCalls?.has(updateMixinCall) === true) return Effect.interrupt
      state.roomByDocument.set(id, room)
      return Effect.succeed({})
    }
  )

  let createMixinCall = 0
  const createMixin = sdkFixture<HulyClientOperations["createMixin"]>(
    (objectId: unknown, _objectClass: unknown, _space: unknown, _mixin: unknown, attributes: unknown) => {
      createMixinCall += 1
      const room = String(sdkFixture<{ readonly room: unknown }>(attributes).room)
      const id = String(objectId)
      state.calls.push({ operation: "createMixin", id, room })
      if (config.failCreateMixin === true || config.failCreateMixinCalls?.has(createMixinCall) === true) {
        return Effect.fail(connectionFailure(`createMixin ${createMixinCall} failed`))
      }
      const event = events.find((candidate) => String(candidate._id) === id)
      if (event !== undefined && !meetings.some((meeting) => String(meeting._id) === id)) {
        meetings.push(makeMeeting(event, room))
        state.roomByDocument.set(id, room)
      }
      return Effect.succeed({})
    }
  )

  let removeDocCall = 0
  const removeDoc = sdkFixture<HulyClientOperations["removeDoc"]>(
    (_class: unknown, _space: unknown, objectId: unknown) => {
      removeDocCall += 1
      const id = String(objectId)
      state.calls.push({ operation: "removeDoc", id })
      if (config.failRemoveDoc === true || config.failRemoveDocCalls?.has(removeDocCall) === true) {
        return Effect.fail(connectionFailure(`removeDoc ${removeDocCall} failed`))
      }
      const eventIndex = events.findIndex((event) => String(event._id) === id)
      if (eventIndex >= 0) events.splice(eventIndex, 1)
      const meetingIndex = meetings.findIndex((meeting) => String(meeting._id) === id)
      if (meetingIndex >= 0) meetings.splice(meetingIndex, 1)
      const scheduleIndex = schedules.findIndex((schedule) => String(schedule._id) === id)
      if (scheduleIndex >= 0) schedules.splice(scheduleIndex, 1)
      state.roomByDocument.delete(id)
      return Effect.succeed({})
    }
  )

  let updateDocCall = 0
  const applyDocumentUpdate = (target: object | undefined, operations: unknown): void => {
    if (target === undefined) return
    const update = sdkFixture<Record<string, unknown> & { readonly $unset?: Record<string, unknown> }>(operations)
    const { $unset, ...direct } = update
    Object.assign(target, direct)
    for (const field of Object.keys($unset ?? {})) Reflect.deleteProperty(target, field)
  }
  const updateDoc = sdkFixture<HulyClientOperations["updateDoc"]>(
    (_class: unknown, _space: unknown, objectId: unknown, operations: unknown) => {
      updateDocCall += 1
      const id = String(objectId)
      state.calls.push({ operation: "updateDoc", id })
      const target =
        _class === calendar.class.Event
          ? events.find((event) => String(event._id) === id)
          : schedules.find((schedule) => String(schedule._id) === id)
      if (config.commitThenFailUpdateDocCalls?.has(updateDocCall) === true) {
        applyDocumentUpdate(target, operations)
        return Effect.fail(connectionFailure(`updateDoc ${updateDocCall} ambiguously committed`))
      }
      if (config.failUpdateDoc === true || config.failUpdateDocCalls?.has(updateDocCall) === true) {
        return Effect.fail(connectionFailure(`updateDoc ${updateDocCall} failed`))
      }
      applyDocumentUpdate(target, operations)
      if (config.spawnEventSiblingOnParticipantUpdate === true && _class === calendar.class.Event) {
        const update = sdkFixture<{ readonly participants?: unknown }>(operations)
        if (update.participants !== undefined && !events.some((event) => String(event._id) === "new-sibling")) {
          const owner = events.find((event) => String(event._id) === id)
          if (owner !== undefined) {
            events.push(
              makeEvent("new-sibling", AccessLevel.Reader, {
                eventId: owner.eventId,
                user: sdkFixture<HulyEvent["user"]>("participant"),
                calendar: owner.calendar
              })
            )
            if (config.spawnEventSiblingMeetingRoom !== undefined) {
              const created = events.find((event) => String(event._id) === "new-sibling")
              if (created !== undefined) meetings.push(makeMeeting(created, config.spawnEventSiblingMeetingRoom))
            }
          }
        }
      }
      if (config.removeEventSiblingOnParticipantUpdate === true && _class === calendar.class.Event) {
        const update = sdkFixture<{ readonly participants?: unknown }>(operations)
        if (update.participants !== undefined) {
          const index = events.findIndex((event) => event.access !== AccessLevel.Owner)
          if (index >= 0) events.splice(index, 1)
        }
      }
      return Effect.succeed({})
    }
  )

  let updateMarkupCall = 0
  const updateMarkup = sdkFixture<HulyClientOperations["updateMarkup"]>((_class: unknown, _objectId: unknown) => {
    updateMarkupCall += 1
    state.calls.push({ operation: "updateMarkup", id: String(_objectId) })
    return config.failUpdateMarkup === true || config.failUpdateMarkupCalls?.has(updateMarkupCall) === true
      ? Effect.fail(connectionFailure(`updateMarkup ${updateMarkupCall} failed`))
      : Effect.succeed(undefined)
  })

  const uploadMarkup = sdkFixture<HulyClientOperations["uploadMarkup"]>((_class: unknown, _objectId: unknown) => {
    state.calls.push({ operation: "uploadMarkup", id: String(_objectId) })
    return config.failUploadMarkup === true
      ? Effect.fail(connectionFailure("uploadMarkup failed"))
      : Effect.succeed(sdkFixture<MarkupRef>("uploaded-markup-ref"))
  })
  const fetchMarkup = sdkFixture<HulyClientOperations["fetchMarkup"]>(() => Effect.succeed("stored markup"))

  const addCollection = sdkFixture<HulyClientOperations["addCollection"]>(
    (
      _class: unknown,
      _space: unknown,
      _attachedTo: unknown,
      _attachedToClass: unknown,
      _collection: unknown,
      attributes: unknown,
      id: unknown
    ) => {
      const eventAttributes = sdkFixture<HulyEvent>(attributes)
      state.createdAttributes.push(sdkFixture<Record<string, unknown>>(eventAttributes))
      state.calls.push({ operation: "addCollection", id: String(id) })
      const created = makeEvent(String(id), eventAttributes.access, eventAttributes)
      events.push(created)
      if (config.spawnCreatedParticipantSibling === true) {
        events.push(
          makeEvent("created-sibling", AccessLevel.Reader, {
            eventId: created.eventId,
            user: sdkFixture<HulyEvent["user"]>("participant"),
            calendar: created.calendar
          })
        )
      }
      if (config.commitThenDieAddCollection === true) return Effect.die(new Error("operator-secret create defect"))
      return Effect.succeed(sdkFixture<Ref<HulyEvent>>(id))
    }
  )

  const createDoc = sdkFixture<HulyClientOperations["createDoc"]>(
    (_class: unknown, _space: unknown, attributes: unknown, id: unknown) => {
      const scheduleAttributes = sdkFixture<HulySchedule>(attributes)
      state.createdAttributes.push(sdkFixture<Record<string, unknown>>(scheduleAttributes))
      state.calls.push({ operation: "createDoc", id: String(id) })
      schedules.push(makeSchedule({ ...scheduleAttributes, _id: sdkFixture<Ref<HulySchedule>>(id) }))
      if (config.commitThenInterruptCreateDoc === true) return Effect.interrupt
      return Effect.succeed(sdkFixture<Ref<HulySchedule>>(id))
    }
  )

  const clientLayer = HulyClient.testLayer({
    addCollection,
    createDoc,
    createMixin,
    fetchMarkup,
    findAll,
    findOne,
    removeDoc,
    updateDoc,
    updateMarkup,
    updateMixin,
    uploadMarkup
  })
  return { clientLayer, layer: Layer.merge(clientLayer, Layer.succeed(Clock.Clock, immediateClock)), state }
}

const withClient = <A, E>(
  layer: ReturnType<typeof HulyClient.testLayer>,
  operation: (client: HulyClient["Service"]) => Effect.Effect<A, E>
): Effect.Effect<A, E> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    return yield* operation(client)
  }).pipe(Effect.provide(layer))

const mutationErrorFromExit = <A, E>(exit: Exit.Exit<A, E>): MeetingCompositionMutationError => {
  if (Exit.isSuccess(exit)) throw new Error("Expected meeting composition failure")
  const failure = Cause.findError(exit.cause)
  if (Result.isFailure(failure) || !(failure.success instanceof MeetingCompositionMutationError)) {
    throw new Error("Expected MeetingCompositionMutationError in failure cause")
  }
  return failure.success
}

describe("calendar meeting-room composition", () => {
  it.effect("resolves IDs first and otherwise requires an exact floor-qualified name", () =>
    Effect.gen(function* () {
      const idWinner = makeRoom("direct-id", "Different", "floor-1")
      const mainFocus = makeRoom("room-main", "Focus", "floor-1")
      const upperFocus = makeRoom("room-upper", "Focus", "floor-2")
      const fixture = createLayer({
        floors: [makeFloor("floor-1", "Main"), makeFloor("floor-2", "Upper")],
        rooms: [idWinner, mainFocus, upperFocus]
      })

      const byId = yield* withClient(fixture.layer, (client) =>
        resolveMeetingRoom(client, locator("direct-id", "missing-floor"))
      )
      const byFloor = yield* withClient(fixture.layer, (client) =>
        resolveMeetingRoom(client, locator("Focus", "Upper"))
      )
      const ambiguous = yield* Effect.flip(
        withClient(fixture.layer, (client) => resolveMeetingRoom(client, locator("Focus name missing")))
      )

      expect(byId._id).toBe("direct-id")
      expect(byFloor._id).toBe("room-upper")
      expect(ambiguous._tag).toBe("MeetingRoomNotFoundError")
    })
  )

  it.effect("reports ambiguous room names and rejects Reception and another person's Office", () =>
    Effect.gen(function* () {
      const duplicateA = makeRoom("duplicate-a", "Focus", "floor-1")
      const duplicateB = makeRoom("duplicate-b", "Focus", "floor-2")
      const reception = makeRoom("reception-custom", "Reception", "floor-1", { type: RoomType.Reception })
      const foreignOffice = makeOffice("office-foreign", "employee-2")
      const fixture = createLayer({ rooms: [duplicateA, duplicateB, reception, foreignOffice] })

      const ambiguous = yield* Effect.flip(
        withClient(fixture.layer, (client) => resolveMeetingRoom(client, locator("Focus")))
      )
      const receptionError = yield* Effect.flip(
        withClient(fixture.layer, (client) => resolveMeetingRoom(client, locator("reception-custom")))
      )
      const officeError = yield* Effect.flip(
        withClient(fixture.layer, (client) => resolveMeetingRoom(client, locator("office-foreign")))
      )

      expect(ambiguous._tag).toBe("MeetingRoomIdentifierAmbiguousError")
      expect(receptionError).toMatchObject({ _tag: "MeetingRoomAssignmentUnsupportedError", reason: "reception" })
      expect(officeError).toMatchObject({
        _tag: "MeetingRoomAssignmentUnsupportedError",
        reason: "office-not-owned-by-caller"
      })
    })
  )

  it.effect("accepts the authenticated caller's personal Office", () =>
    Effect.gen(function* () {
      const fixture = createLayer({ rooms: [makeOffice("office-own", "employee-1")] })
      const room = yield* withClient(fixture.layer, (client) => resolveMeetingRoom(client, locator("office-own")))
      expect(room._id).toBe("office-own")
    })
  )

  it.effect("resolves floor IDs and reports ambiguous or missing floor qualifiers", () =>
    Effect.gen(function* () {
      const fixture = createLayer({
        floors: [
          makeFloor("floor-id", "Exact"),
          makeFloor("duplicate-1", "Duplicate"),
          makeFloor("duplicate-2", "Duplicate")
        ],
        rooms: [makeRoom("room-on-floor", "Focus", "floor-id")]
      })
      const byFloorId = yield* withClient(fixture.layer, (client) =>
        resolveMeetingRoom(client, locator("Focus", "floor-id"))
      )
      const ambiguousFloor = yield* Effect.flip(
        withClient(fixture.layer, (client) => resolveMeetingRoom(client, locator("Focus", "Duplicate")))
      )
      const missingFloor = yield* Effect.flip(
        withClient(fixture.layer, (client) => resolveMeetingRoom(client, locator("Focus", "Missing")))
      )

      expect(byFloorId._id).toBe("room-on-floor")
      expect(ambiguousFloor).toMatchObject({ _tag: "MeetingRoomIdentifierAmbiguousError", field: "floor", matches: 2 })
      expect(missingFloor._tag).toBe("MeetingRoomNotFoundError")
    })
  )

  it.effect("rejects the special Reception, an unassigned Office, and a missing caller Employee", () =>
    Effect.gen(function* () {
      const fixture = createLayer({
        rooms: [
          makeRoom(String(love.ids.Reception), "Reception"),
          makeOffice("office-unassigned", null),
          makeOffice("office-no-employee", "employee-1")
        ]
      })
      const specialReception = yield* Effect.flip(
        withClient(fixture.layer, (client) => resolveMeetingRoom(client, locator(String(love.ids.Reception))))
      )
      const unassignedOffice = yield* Effect.flip(
        withClient(fixture.layer, (client) => resolveMeetingRoom(client, locator("office-unassigned")))
      )
      const noEmployeeFixture = createLayer({ rooms: [makeOffice("office-no-employee", "employee-1")], employee: null })
      const noEmployee = yield* Effect.flip(
        withClient(noEmployeeFixture.layer, (client) => resolveMeetingRoom(client, locator("office-no-employee")))
      )

      expect(specialReception).toMatchObject({ _tag: "MeetingRoomAssignmentUnsupportedError", reason: "reception" })
      expect(unassignedOffice).toMatchObject({
        _tag: "MeetingRoomAssignmentUnsupportedError",
        reason: "office-not-owned-by-caller"
      })
      expect(noEmployee._tag).toBe("PersonNotAnEmployeeError")
    })
  )

  it.effect("requires writable Event access on create while accepting Writer access", () =>
    Effect.gen(function* () {
      const room = makeRoom("room-new", "New")
      const readerFixture = createLayer({ rooms: [room] })
      const readerError = yield* Effect.flip(
        createEvent({
          title: CalendarEventTitle.make("Reader meeting"),
          date: Timestamp.make(1),
          access: "reader",
          meetingRoom: locator("room-new")
        }).pipe(Effect.provide(readerFixture.layer))
      )
      expect(readerError).toMatchObject({
        _tag: "CalendarMeetingTargetNotWritableError",
        reason: "prospective-event-not-writable"
      })
      expect(readerFixture.state.calls).toEqual([])

      const writerFixture = createLayer({ rooms: [room] })
      yield* createEvent({
        title: CalendarEventTitle.make("Writer meeting"),
        date: Timestamp.make(1),
        access: "writer",
        meetingRoom: locator("room-new")
      }).pipe(Effect.provide(writerFixture.layer))
      expect(writerFixture.state.calls.map((call) => call.operation)).toEqual(["addCollection", "createMixin"])
    })
  )

  it.effect("rejects missing or non-writable Event groups and accepts a caller-owned Writer sibling", () =>
    Effect.gen(function* () {
      const room = makeRoom("room-new", "New")
      const missingFixture = createLayer({ rooms: [room] })
      const missing = yield* Effect.flip(
        withClient(missingFixture.layer, (client) =>
          prepareEventMeetingRoomUpdate(client, EventId.make("missing"), locator("room-new"))
        )
      )
      expect(missing._tag).toBe("EventNotFoundError")

      const reader = makeEvent("reader", AccessLevel.Reader)
      const readOnlyFixture = createLayer({ rooms: [room], events: [reader], meetings: [makeMeeting(reader, "old")] })
      const readOnly = yield* Effect.flip(
        withClient(readOnlyFixture.layer, (client) =>
          prepareEventMeetingRoomUpdate(client, EventId.make("event-group"), locator("room-new"))
        )
      )
      expect(readOnly._tag).toBe("CalendarMeetingTargetNotWritableError")

      const foreignWriter = makeEvent("foreign-writer", AccessLevel.Writer, {
        user: sdkFixture<HulyEvent["user"]>("participant"),
        calendar: sdkFixture<Ref<HulyCalendar>>("foreign-calendar")
      })
      const foreignFixture = createLayer({
        rooms: [room],
        events: [foreignWriter],
        meetings: [makeMeeting(foreignWriter, "old")]
      })
      const foreign = yield* Effect.flip(
        withClient(foreignFixture.layer, (client) =>
          prepareEventMeetingRoomUpdate(client, EventId.make("event-group"), locator("room-new"))
        )
      )
      expect(foreign._tag).toBe("CalendarMeetingTargetNotWritableError")

      const foreignOnCallerCalendar = makeEvent("foreign-caller-calendar", AccessLevel.Writer, {
        user: sdkFixture<HulyEvent["user"]>("participant"),
        calendar: sdkFixture<Ref<HulyCalendar>>("calendar-1")
      })
      const foreignCalendarFixture = createLayer({
        rooms: [room],
        events: [foreignOnCallerCalendar],
        meetings: [makeMeeting(foreignOnCallerCalendar, "old")]
      })
      const foreignCalendarError = yield* Effect.flip(
        withClient(foreignCalendarFixture.layer, (client) =>
          prepareEventMeetingRoomUpdate(client, EventId.make("event-group"), locator("room-new"))
        )
      )
      expect(foreignCalendarError._tag).toBe("CalendarMeetingTargetNotWritableError")

      const writer = makeEvent("writer", AccessLevel.Writer)
      const writerFixture = createLayer({ rooms: [room], events: [writer], meetings: [makeMeeting(writer, "old")] })
      const plan = yield* withClient(writerFixture.layer, (client) =>
        prepareEventMeetingRoomUpdate(client, EventId.make("event-group"), locator("room-new"))
      )
      expect(plan.baseTarget._id).toBe("writer")

      const legacyPlan = yield* withClient(writerFixture.layer, (client) => {
        const { getSocialIds, ...legacyClient } = client
        void getSocialIds
        return prepareEventMeetingRoomUpdate(legacyClient, EventId.make("event-group"), locator("room-new"))
      })
      expect(legacyPlan.baseTarget._id).toBe("writer")

      const emptyUser = makeEvent("empty-user", AccessLevel.Owner, { user: sdkFixture<HulyEvent["user"]>("") })
      const calendarOwnedFixture = createLayer({
        rooms: [room],
        events: [emptyUser],
        meetings: [makeMeeting(emptyUser, "old")]
      })
      const calendarOwnedPlan = yield* withClient(calendarOwnedFixture.layer, (client) =>
        prepareEventMeetingRoomUpdate(client, EventId.make("event-group"), locator("room-new"))
      )
      expect(calendarOwnedPlan.baseTarget._id).toBe("empty-user")
    })
  )

  it.effect("prevalidates every Event sibling Meeting before any write", () =>
    Effect.gen(function* () {
      const owner = makeEvent("owner", AccessLevel.Owner)
      const sibling = makeEvent("sibling", AccessLevel.Reader, { user: sdkFixture<HulyEvent["user"]>("participant") })
      const room = makeRoom("room-new", "New")
      const fixture = createLayer({
        rooms: [room],
        events: [owner, sibling],
        meetings: [makeMeeting(owner, "room-old")]
      })

      const error = yield* Effect.flip(
        withClient(fixture.layer, (client) =>
          prepareEventMeetingRoomUpdate(client, EventId.make("event-group"), locator("room-new"))
        )
      )

      expect(error).toMatchObject({ _tag: "EventMeetingMixinMissingError", eventDocumentIds: ["sibling"] })
      expect(fixture.state.calls).toEqual([])
    })
  )

  it.effect("updates non-owner siblings first and the caller-owned Event last", () =>
    Effect.gen(function* () {
      const owner = makeEvent("owner", AccessLevel.Owner)
      const sibling = makeEvent("sibling", AccessLevel.Reader, { user: sdkFixture<HulyEvent["user"]>("participant") })
      const fixture = createLayer({
        rooms: [makeRoom("room-new", "New")],
        events: [owner, sibling],
        meetings: [makeMeeting(owner, "room-old"), makeMeeting(sibling, "room-old")]
      })
      const plan = yield* withClient(fixture.layer, (client) =>
        prepareEventMeetingRoomUpdate(client, EventId.make("event-group"), locator("room-new"))
      )

      yield* withClient(fixture.layer, (client) => applyEventMeetingRoomUpdate(client, plan))

      expect(fixture.state.calls.map((call) => call.id)).toEqual(["sibling", "owner"])
      expect(fixture.state.roomByDocument).toEqual(
        new Map([
          ["owner", "room-new"],
          ["sibling", "room-new"]
        ])
      )
    })
  )

  it.effect("restores every prior sibling room after a mid-operation failure", () =>
    Effect.gen(function* () {
      const owner = makeEvent("owner", AccessLevel.Owner)
      const sibling = makeEvent("sibling", AccessLevel.Reader, { user: sdkFixture<HulyEvent["user"]>("participant") })
      const fixture = createLayer({
        rooms: [makeRoom("room-new", "New")],
        events: [owner, sibling],
        meetings: [makeMeeting(owner, "room-owner-old"), makeMeeting(sibling, "room-sibling-old")],
        failUpdateMixinCalls: new Set([2])
      })
      const plan = yield* withClient(fixture.layer, (client) =>
        prepareEventMeetingRoomUpdate(client, EventId.make("event-group"), locator("room-new"))
      )

      const error = yield* Effect.flip(withClient(fixture.layer, (client) => applyEventMeetingRoomUpdate(client, plan)))

      expect(error).toMatchObject({ _tag: "MeetingCompositionMutationError", recovery: { _tag: "Recovered" } })
      expect(fixture.state.calls.map((call) => `${call.id}:${call.room}`)).toEqual([
        "sibling:room-new",
        "owner:room-new",
        "owner:room-owner-old",
        "sibling:room-sibling-old"
      ])
      expect(fixture.state.roomByDocument.get("owner")).toBe("room-owner-old")
      expect(fixture.state.roomByDocument.get("sibling")).toBe("room-sibling-old")
    })
  )

  it.effect("restores only Event room assignments attempted before a failure", () =>
    Effect.gen(function* () {
      const owner = makeEvent("owner", AccessLevel.Owner)
      const sibling = makeEvent("sibling", AccessLevel.Reader, { user: sdkFixture<HulyEvent["user"]>("participant") })
      const fixture = createLayer({
        rooms: [makeRoom("room-new", "New")],
        events: [owner, sibling],
        meetings: [makeMeeting(owner, "room-owner-old"), makeMeeting(sibling, "room-sibling-old")],
        failUpdateMixinCalls: new Set([1])
      })

      const error = yield* Effect.flip(
        updateEvent({ eventId: EventId.make("event-group"), meetingRoom: locator("room-new") }).pipe(
          Effect.provide(fixture.layer)
        )
      )

      expect(error).toMatchObject({ _tag: "MeetingCompositionMutationError", recovery: { _tag: "Recovered" } })
      expect(fixture.state.calls.map((call) => `${call.id}:${call.room}`)).toEqual([
        "sibling:room-new",
        "sibling:room-sibling-old"
      ])
      expect(fixture.state.roomByDocument.get("owner")).toBe("room-owner-old")
    })
  )

  it.effect("returns typed unconfirmed assignments when restoration also fails", () =>
    Effect.gen(function* () {
      const owner = makeEvent("owner", AccessLevel.Owner)
      const sibling = makeEvent("sibling", AccessLevel.Reader, { user: sdkFixture<HulyEvent["user"]>("participant") })
      const fixture = createLayer({
        rooms: [makeRoom("room-new", "New")],
        events: [owner, sibling],
        meetings: [makeMeeting(owner, "room-old"), makeMeeting(sibling, "room-old")],
        failUpdateMixinCalls: new Set([2, 3])
      })
      const plan = yield* withClient(fixture.layer, (client) =>
        prepareEventMeetingRoomUpdate(client, EventId.make("event-group"), locator("room-new"))
      )

      const error = yield* Effect.flip(withClient(fixture.layer, (client) => applyEventMeetingRoomUpdate(client, plan)))

      expect(error).toMatchObject({
        _tag: "MeetingCompositionMutationError",
        operation: "update_event",
        recovery: {
          _tag: "Unconfirmed",
          residuals: [{ _tag: "RoomAssignment", target: "event", documentId: "owner", expectedRoomId: "room-old" }]
        }
      })
    })
  )

  it.effect("compensates a defect and preserves fatal semantics with sanitized diagnostics", () =>
    Effect.gen(function* () {
      const owner = makeEvent("owner", AccessLevel.Owner)
      const sibling = makeEvent("sibling", AccessLevel.Reader, { user: sdkFixture<HulyEvent["user"]>("participant") })
      const fixture = createLayer({
        rooms: [makeRoom("room-new", "New")],
        events: [owner, sibling],
        meetings: [makeMeeting(owner, "owner-old"), makeMeeting(sibling, "sibling-old")],
        dieUpdateMixinCalls: new Set([2])
      })
      const plan = yield* withClient(fixture.layer, (client) =>
        prepareEventMeetingRoomUpdate(client, EventId.make("event-group"), locator("room-new"))
      )
      const outcome = yield* withClient(fixture.layer, (client) =>
        applyEventMeetingRoomUpdate(client, plan).pipe(Effect.exit)
      )
      const error = mutationErrorFromExit(outcome)

      expect(Exit.hasDies(outcome)).toBe(true)
      expect(error.diagnostics).toEqual([{ _tag: "Defect" }])
      expect(JSON.stringify(error)).not.toContain("operator-secret")
      expect(error.recovery).toEqual({ _tag: "Recovered" })
      expect(fixture.state.roomByDocument.get("owner")).toBe("owner-old")
      expect(fixture.state.roomByDocument.get("sibling")).toBe("sibling-old")
    })
  )

  it.effect("compensates interruption and re-emits the interrupt with a typed recovery record", () =>
    Effect.gen(function* () {
      const owner = makeEvent("owner", AccessLevel.Owner)
      const sibling = makeEvent("sibling", AccessLevel.Reader, { user: sdkFixture<HulyEvent["user"]>("participant") })
      const fixture = createLayer({
        rooms: [makeRoom("room-new", "New")],
        events: [owner, sibling],
        meetings: [makeMeeting(owner, "owner-old"), makeMeeting(sibling, "sibling-old")],
        interruptUpdateMixinCalls: new Set([2])
      })
      const plan = yield* withClient(fixture.layer, (client) =>
        prepareEventMeetingRoomUpdate(client, EventId.make("event-group"), locator("room-new"))
      )
      const outcome = yield* withClient(fixture.layer, (client) =>
        applyEventMeetingRoomUpdate(client, plan).pipe(Effect.exit)
      )
      const error = mutationErrorFromExit(outcome)

      expect(Exit.hasInterrupts(outcome)).toBe(true)
      expect(error.diagnostics).toEqual([{ _tag: "Interruption" }])
      expect(error.recovery).toEqual({ _tag: "Recovered" })
      expect(fixture.state.roomByDocument.get("owner")).toBe("owner-old")
      expect(fixture.state.roomByDocument.get("sibling")).toBe("sibling-old")
    })
  )

  it.effect("continues compensation and preserves a defect raised while restoring state", () =>
    Effect.gen(function* () {
      const owner = makeEvent("owner", AccessLevel.Owner)
      const sibling = makeEvent("sibling", AccessLevel.Reader, { user: sdkFixture<HulyEvent["user"]>("participant") })
      const fixture = createLayer({
        rooms: [makeRoom("room-new", "New")],
        events: [owner, sibling],
        meetings: [makeMeeting(owner, "owner-old"), makeMeeting(sibling, "sibling-old")],
        failUpdateMixinCalls: new Set([2]),
        dieUpdateMixinCalls: new Set([3])
      })
      const plan = yield* withClient(fixture.layer, (client) =>
        prepareEventMeetingRoomUpdate(client, EventId.make("event-group"), locator("room-new"))
      )
      const outcome = yield* withClient(fixture.layer, (client) =>
        applyEventMeetingRoomUpdate(client, plan).pipe(Effect.exit)
      )
      const error = mutationErrorFromExit(outcome)

      expect(Exit.hasDies(outcome)).toBe(true)
      expect(error.diagnostics).toEqual([
        { _tag: "TypedFailure", errorTag: NonEmptyString.make("HulyConnectionError") },
        { _tag: "Defect" }
      ])
      expect(error.recovery).toMatchObject({
        _tag: "Unconfirmed",
        residuals: [{ _tag: "RoomAssignment", documentId: DocId.make("owner") }]
      })
      expect(fixture.state.roomByDocument.get("sibling")).toBe("sibling-old")
    })
  )

  it.effect("creates Event composition without replacing location", () =>
    Effect.gen(function* () {
      const fixture = createLayer({ rooms: [makeRoom("room-new", "New")] })
      const result = yield* createEvent({
        title: CalendarEventTitle.make("Planning"),
        date: Timestamp.make(1),
        location: "Physical room note",
        meetingRoom: locator("room-new")
      }).pipe(Effect.provide(fixture.layer))

      expect(result.eventId).toBeDefined()
      expect(fixture.state.calls.map((call) => call.operation)).toEqual(["addCollection", "createMixin"])
      expect(fixture.state.createdAttributes[0]?.location).toBe("Physical room note")
      expect(fixture.state.createdAttributes[0]?.user).toBe("test-primary-social-id")
      expect(fixture.state.calls[1]?.room).toBe("room-new")
    })
  )

  it.effect("reports typed residual Event cleanup when mixin creation and compensation both fail", () =>
    Effect.gen(function* () {
      const fixture = createLayer({ rooms: [makeRoom("room-new", "New")], failCreateMixin: true, failRemoveDoc: true })
      const error = yield* Effect.flip(
        createEvent({
          title: CalendarEventTitle.make("Planning"),
          date: Timestamp.make(1),
          meetingRoom: locator("room-new")
        }).pipe(Effect.provide(fixture.layer))
      )

      expect(error._tag).toBe("MeetingCompositionMutationError")
      if (error._tag !== "MeetingCompositionMutationError") return
      expect(error.operation).toBe("create_event")
      if (error.recovery._tag !== "Unconfirmed") return
      expect(error.recovery.residuals).toContainEqual({
        _tag: "SiblingSet",
        target: "event",
        eventId: expect.any(String)
      })
      expect(error.recovery.residuals).toContainEqual({
        _tag: "RecordPresence",
        target: "event",
        documentId: expect.any(String),
        expected: "absent"
      })
      expect(fixture.state.calls.map((call) => call.operation)).toEqual(["addCollection", "createMixin", "removeDoc"])
    })
  )

  it.effect("reports typed residual Schedule cleanup when mixin creation and compensation both fail", () =>
    Effect.gen(function* () {
      const fixture = createLayer({ rooms: [makeRoom("room-new", "New")], failCreateMixin: true, failRemoveDoc: true })
      const error = yield* Effect.flip(
        createSchedule({
          title: ScheduleTitle.make("Office hours"),
          meetingDuration: PositiveDurationMinutes.make(30),
          meetingInterval: DurationMinutes.make(0),
          availability: {},
          timeZone: TimeZoneId.make("UTC"),
          meetingRoom: locator("room-new")
        }).pipe(Effect.provide(fixture.layer))
      )

      expect(error).toMatchObject({
        _tag: "MeetingCompositionMutationError",
        operation: "create_schedule",
        failedStep: { _tag: "CreateScheduleMeeting", operation: "create_schedule" },
        recovery: {
          _tag: "Unconfirmed",
          residuals: [{ _tag: "RecordPresence", target: "schedule", expected: "absent" }]
        }
      })
      expect(fixture.state.calls.map((call) => call.operation)).toEqual(["createDoc", "createMixin", "removeDoc"])
    })
  )

  it.effect("distinguishes unconfirmed Event discovery from confirmed Schedule compensation", () =>
    Effect.gen(function* () {
      const room = makeRoom("room-new", "New")
      const eventFixture = createLayer({ rooms: [room], failCreateMixin: true })
      const eventError = yield* Effect.flip(
        createEvent({
          title: CalendarEventTitle.make("Planning"),
          date: Timestamp.make(1),
          meetingRoom: locator("room-new")
        }).pipe(Effect.provide(eventFixture.layer))
      )
      expect(eventError).toMatchObject({
        _tag: "MeetingCompositionMutationError",
        recovery: { _tag: "Unconfirmed", residuals: [{ _tag: "SiblingSet", target: "event" }] }
      })
      expect(eventFixture.state.calls.map((call) => call.operation)).toEqual([
        "addCollection",
        "createMixin",
        "removeDoc"
      ])

      const scheduleFixture = createLayer({ rooms: [room], failCreateMixin: true })
      const scheduleError = yield* Effect.flip(
        createSchedule({
          title: ScheduleTitle.make("Office hours"),
          meetingDuration: PositiveDurationMinutes.make(30),
          meetingInterval: DurationMinutes.make(0),
          availability: {},
          timeZone: TimeZoneId.make("UTC"),
          meetingRoom: locator("room-new")
        }).pipe(Effect.provide(scheduleFixture.layer))
      )
      expect(scheduleError).toMatchObject({ _tag: "MeetingCompositionMutationError", recovery: { _tag: "Recovered" } })
      expect(scheduleFixture.state.calls.map((call) => call.operation)).toEqual([
        "createDoc",
        "createMixin",
        "removeDoc"
      ])
    })
  )

  it.effect("keeps a defecting Event base create inside the compensation boundary", () =>
    Effect.gen(function* () {
      const fixture = createLayer({ rooms: [makeRoom("room-new", "New")], commitThenDieAddCollection: true })
      const outcome = yield* createEvent({
        title: CalendarEventTitle.make("Planning"),
        date: Timestamp.make(1),
        meetingRoom: locator("room-new")
      }).pipe(Effect.provide(fixture.layer), Effect.exit)
      const error = mutationErrorFromExit(outcome)

      expect(Exit.hasDies(outcome)).toBe(true)
      expect(error.failedStep).toEqual({ _tag: "CreateEventBase", operation: "create_event" })
      expect(error.recovery).toMatchObject({
        _tag: "Unconfirmed",
        residuals: [{ _tag: "SiblingSet", target: "event" }]
      })
      expect(fixture.state.events).toHaveLength(0)
      expect(fixture.state.calls.map((call) => call.operation)).toEqual(["addCollection", "removeDoc"])
    })
  )

  it.effect("tracks an ambiguous description upload even when Event base creation never starts", () =>
    Effect.gen(function* () {
      const fixture = createLayer({ rooms: [makeRoom("room-new", "New")], failUploadMarkup: true })
      const error = yield* Effect.flip(
        createEvent({
          title: CalendarEventTitle.make("Planning"),
          description: "Description",
          date: Timestamp.make(1),
          meetingRoom: locator("room-new")
        }).pipe(Effect.provide(fixture.layer))
      )

      expect(error).toMatchObject({
        _tag: "MeetingCompositionMutationError",
        failedStep: { _tag: "CreateEventDescription", operation: "create_event" },
        recovery: { _tag: "Unconfirmed", residuals: [{ _tag: "Markup", risk: "uploaded-markup-may-be-orphaned" }] }
      })
      expect(fixture.state.calls.map((call) => call.operation)).toEqual(["uploadMarkup"])
    })
  )

  it.effect("reports a pre-Event description upload as orphaned when composed creation is compensated", () =>
    Effect.gen(function* () {
      const fixture = createLayer({ rooms: [makeRoom("room-new", "New")], commitThenDieAddCollection: true })
      const outcome = yield* createEvent({
        title: CalendarEventTitle.make("Planning"),
        description: "Uploaded before the Event exists",
        date: Timestamp.make(1),
        meetingRoom: locator("room-new")
      }).pipe(Effect.provide(fixture.layer), Effect.exit)
      const error = mutationErrorFromExit(outcome)

      expect(error.recovery._tag).toBe("Unconfirmed")
      if (error.recovery._tag !== "Unconfirmed") return
      expect(error.recovery.residuals).toContainEqual({
        _tag: "Markup",
        target: "event",
        documentId: expect.any(String),
        risk: "uploaded-markup-may-be-orphaned"
      })
      expect(error.recovery.residuals).toContainEqual({
        _tag: "SiblingSet",
        target: "event",
        eventId: expect.any(String)
      })
      expect(fixture.state.events).toHaveLength(0)
      expect(fixture.state.calls.map((call) => call.operation)).toEqual(["uploadMarkup", "addCollection", "removeDoc"])
    })
  )

  it.effect("keeps an interrupted Schedule base create inside the compensation boundary", () =>
    Effect.gen(function* () {
      const fixture = createLayer({ rooms: [makeRoom("room-new", "New")], commitThenInterruptCreateDoc: true })
      const outcome = yield* createSchedule({
        title: ScheduleTitle.make("Office hours"),
        meetingDuration: PositiveDurationMinutes.make(30),
        meetingInterval: DurationMinutes.make(0),
        availability: {},
        timeZone: TimeZoneId.make("UTC"),
        meetingRoom: locator("room-new")
      }).pipe(Effect.provide(fixture.layer), Effect.exit)
      const error = mutationErrorFromExit(outcome)

      expect(Exit.hasInterrupts(outcome)).toBe(true)
      expect(error.failedStep).toEqual({ _tag: "CreateScheduleBase", operation: "create_schedule" })
      expect(error.recovery).toEqual({ _tag: "Recovered" })
      expect(fixture.state.schedules).toHaveLength(0)
      expect(fixture.state.calls.map((call) => call.operation)).toEqual(["createDoc", "removeDoc"])
    })
  )

  it.effect("restores Event siblings when a later base Event update fails", () =>
    Effect.gen(function* () {
      const owner = makeEvent("owner", AccessLevel.Owner)
      const sibling = makeEvent("sibling", AccessLevel.Reader, { user: sdkFixture<HulyEvent["user"]>("participant") })
      const fixture = createLayer({
        rooms: [makeRoom("room-new", "New")],
        events: [owner, sibling],
        meetings: [makeMeeting(owner, "room-old"), makeMeeting(sibling, "room-old")],
        failUpdateDoc: true
      })

      const error = yield* Effect.flip(
        updateEvent({
          eventId: EventId.make("event-group"),
          title: CalendarEventTitle.make("Changed"),
          meetingRoom: locator("room-new")
        }).pipe(Effect.provide(fixture.layer))
      )

      expect(error).toMatchObject({
        _tag: "MeetingCompositionMutationError",
        recovery: { _tag: "Unconfirmed", residuals: [{ _tag: "BaseFields", target: "event", documentId: "owner" }] }
      })
      expect(fixture.state.calls.map((call) => `${call.operation}:${call.id}:${call.room ?? ""}`)).toEqual([
        "updateMixin:sibling:room-new",
        "updateMixin:owner:room-new",
        "updateDoc:owner:",
        "updateDoc:owner:",
        "updateMixin:owner:room-old",
        "updateMixin:sibling:room-old"
      ])
      expect(fixture.state.roomByDocument.get("owner")).toBe("room-old")
      expect(fixture.state.roomByDocument.get("sibling")).toBe("room-old")
    })
  )

  it.effect("defers markup, reconciles a participant sibling, and compensates every side effect", () =>
    Effect.gen(function* () {
      const owner = makeEvent("owner", AccessLevel.Owner, {
        description: sdkFixture<HulyEvent["description"]>("existing-markup-ref")
      })
      const sibling = makeEvent("sibling", AccessLevel.Reader, { user: sdkFixture<HulyEvent["user"]>("participant") })
      const fixture = createLayer({
        rooms: [makeRoom("room-new", "New")],
        events: [owner, sibling],
        meetings: [makeMeeting(owner, "room-old"), makeMeeting(sibling, "room-old")],
        spawnEventSiblingOnParticipantUpdate: true,
        failUpdateMarkup: true
      })

      const error = yield* Effect.flip(
        updateEvent({
          eventId: EventId.make("event-group"),
          title: CalendarEventTitle.make("Changed"),
          description: "Updated markup",
          participants: [],
          meetingRoom: locator("room-new")
        }).pipe(Effect.provide(fixture.layer))
      )

      expect(error).toMatchObject({ _tag: "MeetingCompositionMutationError", recovery: { _tag: "Unconfirmed" } })
      if (error._tag !== "MeetingCompositionMutationError") return
      if (error.recovery._tag !== "Unconfirmed") return
      expect(error.recovery.residuals).toContainEqual({
        _tag: "SiblingSet",
        target: "event",
        eventId: EventId.make("event-group")
      })
      expect(fixture.state.calls.map((call) => `${call.operation}:${call.id}:${call.room ?? ""}`)).toEqual([
        "updateMixin:sibling:room-new",
        "updateMixin:owner:room-new",
        "updateDoc:owner:",
        "createMixin:new-sibling:room-new",
        "updateMarkup:owner:",
        "updateMarkup:owner:",
        "updateDoc:owner:",
        "updateMixin:owner:room-old",
        "updateMixin:sibling:room-old"
      ])
      expect(fixture.state.roomByDocument.get("owner")).toBe("room-old")
      expect(fixture.state.roomByDocument.get("sibling")).toBe("room-old")
      expect(fixture.state.roomByDocument.get("new-sibling")).toBe("room-new")
    })
  )

  it.effect("returns a non-meeting Event base-update failure directly", () =>
    Effect.gen(function* () {
      const event = makeEvent("owner", AccessLevel.Owner)
      const fixture = createLayer({ events: [event], failUpdateDoc: true })
      const error = yield* Effect.flip(
        updateEvent({ eventId: EventId.make("event-group"), title: CalendarEventTitle.make("Changed") }).pipe(
          Effect.provide(fixture.layer)
        )
      )

      expect(error._tag).toBe("HulyConnectionError")
      expect(fixture.state.calls.map((call) => call.operation)).toEqual(["updateDoc"])
    })
  )

  it.effect("updates all Event timing and presentation fields through the extracted write module", () =>
    Effect.gen(function* () {
      const event = makeEvent("owner", AccessLevel.Owner)
      const fixture = createLayer({ events: [event] })

      yield* updateEvent({
        eventId: EventId.make("event-group"),
        title: CalendarEventTitle.make("Changed"),
        date: Timestamp.make(10),
        dueDate: Timestamp.make(20),
        allDay: true,
        location: "Updated location",
        visibility: "private",
        reminders: [Timestamp.make(15)],
        access: "writer",
        timeZone: TimeZoneId.make("America/Montreal"),
        blockTime: true
      }).pipe(Effect.provide(fixture.layer))

      expect(fixture.state.calls.map((call) => call.operation)).toEqual(["updateDoc"])
    })
  )

  it.effect("creates and updates caller-owned MeetingSchedule composition", () =>
    Effect.gen(function* () {
      const room = makeRoom("room-new", "New")
      const createFixture = createLayer({ rooms: [room] })
      const created = yield* createSchedule({
        title: ScheduleTitle.make("Office hours"),
        meetingDuration: PositiveDurationMinutes.make(30),
        meetingInterval: DurationMinutes.make(0),
        availability: { monday: [{ start: MinuteOfDay.make(540), end: MinuteOfDay.make(600) }] },
        timeZone: TimeZoneId.make("UTC"),
        meetingRoom: locator("room-new")
      }).pipe(Effect.provide(createFixture.layer))

      expect(created.scheduleId).toBeDefined()
      expect(createFixture.state.calls.map((call) => call.operation)).toEqual(["createDoc", "createMixin"])

      const schedule = makeSchedule()
      const updateFixture = createLayer({
        rooms: [room],
        schedules: [schedule],
        meetingSchedules: [makeMeetingSchedule(schedule, "room-old")]
      })
      yield* updateSchedule({ scheduleId: ScheduleId.make("schedule-1"), meetingRoom: locator("room-new") }).pipe(
        Effect.provide(updateFixture.layer)
      )
      expect(updateFixture.state.roomByDocument.get("schedule-1")).toBe("room-new")
      expect(updateFixture.state.calls.map((call) => call.operation)).toEqual(["updateMixin"])
    })
  )

  it.effect("prevalidates missing and foreign-owned Schedules", () =>
    Effect.gen(function* () {
      const room = makeRoom("room-new", "New")
      const missingFixture = createLayer({ rooms: [room] })
      const missing = yield* Effect.flip(
        withClient(missingFixture.layer, (client) =>
          prepareScheduleMeetingRoomUpdate(client, ScheduleId.make("missing"), locator("room-new"))
        )
      )
      expect(missing._tag).toBe("ScheduleNotFoundError")

      const foreign = makeSchedule({ owner: sdkFixture<Ref<Employee>>("employee-2") })
      const foreignFixture = createLayer({ rooms: [room], schedules: [foreign] })
      const foreignError = yield* Effect.flip(
        withClient(foreignFixture.layer, (client) =>
          prepareScheduleMeetingRoomUpdate(client, ScheduleId.make("schedule-1"), locator("room-new"))
        )
      )
      expect(foreignError).toMatchObject({
        _tag: "CalendarMeetingTargetNotWritableError",
        reason: "schedule-owned-by-another-employee"
      })

      const createFixture = createLayer({ rooms: [room] })
      const createError = yield* Effect.flip(
        createSchedule({
          owner: "employee-2",
          title: ScheduleTitle.make("Foreign"),
          meetingDuration: PositiveDurationMinutes.make(30),
          meetingInterval: DurationMinutes.make(0),
          availability: {},
          timeZone: TimeZoneId.make("UTC"),
          meetingRoom: locator("room-new")
        }).pipe(Effect.provide(createFixture.layer))
      )
      expect(createError._tag).toBe("CalendarMeetingTargetNotWritableError")
      expect(createFixture.state.calls).toEqual([])
    })
  )

  it.effect("returns typed unconfirmed Schedule restoration after a failed room update", () =>
    Effect.gen(function* () {
      const schedule = makeSchedule()
      const fixture = createLayer({
        rooms: [makeRoom("room-new", "New")],
        schedules: [schedule],
        meetingSchedules: [makeMeetingSchedule(schedule, "room-old")],
        failUpdateMixinCalls: new Set([1, 2])
      })
      const plan = yield* withClient(fixture.layer, (client) =>
        prepareScheduleMeetingRoomUpdate(client, ScheduleId.make("schedule-1"), locator("room-new"))
      )
      const error = yield* Effect.flip(
        withClient(fixture.layer, (client) => applyScheduleMeetingRoomUpdate(client, plan))
      )

      expect(error).toMatchObject({
        _tag: "MeetingCompositionMutationError",
        operation: "update_schedule",
        recovery: {
          _tag: "Unconfirmed",
          residuals: [
            { _tag: "RoomAssignment", target: "schedule", documentId: "schedule-1", expectedRoomId: "room-old" }
          ]
        }
      })
    })
  )

  it.effect("rejects an ordinary Schedule and restores its room when a later base update fails", () =>
    Effect.gen(function* () {
      const schedule = makeSchedule()
      const room = makeRoom("room-new", "New")
      const ordinaryFixture = createLayer({ rooms: [room], schedules: [schedule] })
      const ordinaryError = yield* Effect.flip(
        updateSchedule({ scheduleId: ScheduleId.make("schedule-1"), meetingRoom: locator("room-new") }).pipe(
          Effect.provide(ordinaryFixture.layer)
        )
      )
      expect(ordinaryError._tag).toBe("ScheduleMeetingMixinMissingError")
      expect(ordinaryFixture.state.calls).toEqual([])

      const restoreFixture = createLayer({
        rooms: [room],
        schedules: [schedule],
        meetingSchedules: [makeMeetingSchedule(schedule, "room-old")],
        failUpdateDoc: true
      })
      const updateError = yield* Effect.flip(
        updateSchedule({
          scheduleId: ScheduleId.make("schedule-1"),
          title: ScheduleTitle.make("Changed"),
          meetingRoom: locator("room-new")
        }).pipe(Effect.provide(restoreFixture.layer))
      )

      expect(updateError).toMatchObject({
        _tag: "MeetingCompositionMutationError",
        recovery: {
          _tag: "Unconfirmed",
          residuals: [{ _tag: "BaseFields", target: "schedule", documentId: "schedule-1" }]
        }
      })
      expect(restoreFixture.state.calls.map((call) => `${call.operation}:${call.room ?? ""}`)).toEqual([
        "updateMixin:room-new",
        "updateDoc:",
        "updateDoc:",
        "updateMixin:room-old"
      ])
      expect(restoreFixture.state.roomByDocument.get("schedule-1")).toBe("room-old")
    })
  )

  it.effect("uses a caller Writer as the base target while ordering a foreign actual Owner last and first", () =>
    Effect.gen(function* () {
      const foreignOwner = makeEvent("foreign-owner", AccessLevel.Owner, {
        user: sdkFixture<HulyEvent["user"]>("participant")
      })
      const callerWriter = makeEvent("caller-writer", AccessLevel.Writer)
      const fixture = createLayer({
        rooms: [makeRoom("room-new", "New")],
        events: [foreignOwner, callerWriter],
        meetings: [makeMeeting(foreignOwner, "owner-old"), makeMeeting(callerWriter, "writer-old")],
        failUpdateDocCalls: new Set([1])
      })

      const error = yield* Effect.flip(
        updateEvent({
          eventId: EventId.make("event-group"),
          title: CalendarEventTitle.make("Changed"),
          meetingRoom: locator("room-new")
        }).pipe(Effect.provide(fixture.layer))
      )

      expect(error).toMatchObject({ _tag: "MeetingCompositionMutationError", recovery: { _tag: "Recovered" } })
      expect(fixture.state.calls.map((call) => `${call.operation}:${call.id}:${call.room ?? ""}`)).toEqual([
        "updateMixin:caller-writer:room-new",
        "updateMixin:foreign-owner:room-new",
        "updateDoc:caller-writer:",
        "updateDoc:caller-writer:",
        "updateMixin:foreign-owner:owner-old",
        "updateMixin:caller-writer:writer-old"
      ])
    })
  )

  it.effect("restores an ambiguously committed Event base update", () =>
    Effect.gen(function* () {
      const owner = makeEvent("owner", AccessLevel.Owner)
      const fixture = createLayer({
        rooms: [makeRoom("room-new", "New")],
        events: [owner],
        meetings: [makeMeeting(owner, "room-old")],
        commitThenFailUpdateDocCalls: new Set([1])
      })

      const error = yield* Effect.flip(
        updateEvent({
          eventId: EventId.make("event-group"),
          title: CalendarEventTitle.make("Changed"),
          meetingRoom: locator("room-new")
        }).pipe(Effect.provide(fixture.layer))
      )

      expect(error).toMatchObject({ _tag: "MeetingCompositionMutationError", recovery: { _tag: "Recovered" } })
      expect(fixture.state.events[0]?.title).toBe("Planning")
      expect(fixture.state.roomByDocument.get("owner")).toBe("room-old")
    })
  )

  it.effect("recovers when recurring sibling reconciliation cannot be read", () =>
    Effect.gen(function* () {
      const owner = makeEvent("owner", AccessLevel.Owner)
      const fixture = createLayer({
        rooms: [makeRoom("room-new", "New")],
        events: [owner],
        meetings: [makeMeeting(owner, "room-old")],
        failEventFindAllCalls: new Set([6])
      })

      const error = yield* Effect.flip(
        updateEvent({ eventId: EventId.make("event-group"), participants: [], meetingRoom: locator("room-new") }).pipe(
          Effect.provide(fixture.layer)
        )
      )

      expect(error).toMatchObject({ _tag: "MeetingCompositionMutationError", recovery: { _tag: "Recovered" } })
      expect(fixture.state.roomByDocument.get("owner")).toBe("room-old")
    })
  )

  it.effect("reports a late Event sibling when reconciliation fails before attribution", () =>
    Effect.gen(function* () {
      const owner = makeEvent("owner", AccessLevel.Owner)
      const fixture = createLayer({
        rooms: [makeRoom("room-new", "New")],
        events: [owner],
        meetings: [makeMeeting(owner, "room-old")],
        spawnEventSiblingOnParticipantUpdate: true,
        failEventFindAllCalls: new Set([6])
      })

      const error = yield* Effect.flip(
        updateEvent({ eventId: EventId.make("event-group"), participants: [], meetingRoom: locator("room-new") }).pipe(
          Effect.provide(fixture.layer)
        )
      )

      expect(error).toMatchObject({
        _tag: "MeetingCompositionMutationError",
        recovery: { _tag: "Unconfirmed", residuals: [{ _tag: "SiblingSet", target: "event", eventId: "event-group" }] }
      })
      expect(fixture.state.events.map((event) => String(event._id))).toEqual(["owner", "new-sibling"])
      expect(fixture.state.calls.some((call) => call.operation === "removeDoc")).toBe(false)
    })
  )

  it.effect("does not delete an unattributed participant sibling when its Meeting creation fails", () =>
    Effect.gen(function* () {
      const owner = makeEvent("owner", AccessLevel.Owner)
      const fixture = createLayer({
        rooms: [makeRoom("room-new", "New")],
        events: [owner],
        meetings: [makeMeeting(owner, "room-old")],
        spawnEventSiblingOnParticipantUpdate: true,
        failCreateMixinCalls: new Set([1])
      })

      const error = yield* Effect.flip(
        updateEvent({
          eventId: EventId.make("event-group"),
          title: CalendarEventTitle.make("Changed"),
          participants: [],
          meetingRoom: locator("room-new")
        }).pipe(Effect.provide(fixture.layer))
      )

      expect(error).toMatchObject({
        _tag: "MeetingCompositionMutationError",
        recovery: { _tag: "Unconfirmed", residuals: [{ _tag: "SiblingSet", target: "event" }] }
      })
      expect(fixture.state.events.map((event) => String(event._id))).toEqual(["owner", "new-sibling"])
      expect(fixture.state.events[0]?.title).toBe("Planning")
      expect(fixture.state.calls.some((call) => call.operation === "removeDoc")).toBe(false)
    })
  )

  it.effect("reports upload orphan risk when new Event markup upload fails", () =>
    Effect.gen(function* () {
      const owner = makeEvent("owner", AccessLevel.Owner, { description: "" })
      const fixture = createLayer({
        rooms: [makeRoom("room-new", "New")],
        events: [owner],
        meetings: [makeMeeting(owner, "room-old")],
        failUploadMarkup: true
      })

      const error = yield* Effect.flip(
        updateEvent({
          eventId: EventId.make("event-group"),
          description: "New markup",
          meetingRoom: locator("room-new")
        }).pipe(Effect.provide(fixture.layer))
      )

      expect(error).toMatchObject({
        _tag: "MeetingCompositionMutationError",
        recovery: { _tag: "Unconfirmed", residuals: [{ _tag: "Markup", risk: "uploaded-markup-may-be-orphaned" }] }
      })
    })
  )

  it.effect("accumulates simultaneous markup, base, sibling, and room recovery failures", () =>
    Effect.gen(function* () {
      const owner = makeEvent("owner", AccessLevel.Owner, {
        description: sdkFixture<HulyEvent["description"]>("existing-markup-ref")
      })
      const sibling = makeEvent("sibling", AccessLevel.Reader, { user: sdkFixture<HulyEvent["user"]>("participant") })
      const fixture = createLayer({
        rooms: [makeRoom("room-new", "New")],
        events: [owner, sibling],
        meetings: [makeMeeting(owner, "owner-old"), makeMeeting(sibling, "sibling-old")],
        spawnEventSiblingOnParticipantUpdate: true,
        failUpdateMarkup: true,
        failUpdateDocCalls: new Set([2]),
        failUpdateMixinCalls: new Set([3, 4])
      })

      const error = yield* Effect.flip(
        updateEvent({
          eventId: EventId.make("event-group"),
          title: CalendarEventTitle.make("Changed"),
          description: "Changed markup",
          participants: [],
          meetingRoom: locator("room-new")
        }).pipe(Effect.provide(fixture.layer))
      )

      expect(error._tag).toBe("MeetingCompositionMutationError")
      if (error._tag !== "MeetingCompositionMutationError" || error.recovery._tag !== "Unconfirmed") return
      expect(new Set(error.recovery.residuals.map((residual) => residual._tag))).toEqual(
        new Set(["Markup", "BaseFields", "SiblingSet", "RoomAssignment"])
      )
      expect(error.recovery.residuals.filter((residual) => residual._tag === "RoomAssignment")).toHaveLength(2)
      expect(fixture.state.calls.some((call) => call.operation === "removeDoc")).toBe(false)
    })
  )

  it.effect("restores an ambiguously committed Schedule base update", () =>
    Effect.gen(function* () {
      const schedule = makeSchedule()
      const fixture = createLayer({
        rooms: [makeRoom("room-new", "New")],
        schedules: [schedule],
        meetingSchedules: [makeMeetingSchedule(schedule, "room-old")],
        commitThenFailUpdateDocCalls: new Set([1])
      })

      const error = yield* Effect.flip(
        updateSchedule({
          scheduleId: ScheduleId.make("schedule-1"),
          title: ScheduleTitle.make("Changed"),
          meetingRoom: locator("room-new")
        }).pipe(Effect.provide(fixture.layer))
      )

      expect(error).toMatchObject({ _tag: "MeetingCompositionMutationError", recovery: { _tag: "Recovered" } })
      expect(fixture.state.schedules[0]?.title).toBe("Office hours")
      expect(fixture.state.roomByDocument.get("schedule-1")).toBe("room-old")
    })
  )

  it.effect("creates a Meeting mixin for every participant sibling discovered after Event creation", () =>
    Effect.gen(function* () {
      const fixture = createLayer({ rooms: [makeRoom("room-new", "New")], spawnCreatedParticipantSibling: true })

      yield* createEvent({
        title: CalendarEventTitle.make("Planning"),
        date: Timestamp.make(1),
        meetingRoom: locator("room-new")
      }).pipe(Effect.provide(fixture.layer))

      expect(fixture.state.calls.filter((call) => call.operation === "createMixin").map((call) => call.id)).toEqual([
        expect.any(String),
        "created-sibling"
      ])
      expect(fixture.state.roomByDocument.get("created-sibling")).toBe("room-new")
    })
  )

  it.effect("cleans up a created Event when sibling reconciliation cannot be read", () =>
    Effect.gen(function* () {
      const fixture = createLayer({ rooms: [makeRoom("room-new", "New")], failEventFindAllCalls: new Set([1]) })

      const error = yield* Effect.flip(
        createEvent({
          title: CalendarEventTitle.make("Planning"),
          date: Timestamp.make(1),
          meetingRoom: locator("room-new")
        }).pipe(Effect.provide(fixture.layer))
      )

      expect(error).toMatchObject({
        _tag: "MeetingCompositionMutationError",
        recovery: { _tag: "Unconfirmed", residuals: [{ _tag: "SiblingSet", target: "event" }] }
      })
      expect(fixture.state.events).toHaveLength(0)
    })
  )

  it.effect("recovers when the Meeting read for a new recurring sibling fails", () =>
    Effect.gen(function* () {
      const owner = makeEvent("owner", AccessLevel.Owner)
      const fixture = createLayer({
        rooms: [makeRoom("room-new", "New")],
        events: [owner],
        meetings: [makeMeeting(owner, "room-old")],
        spawnEventSiblingOnParticipantUpdate: true,
        failMeetingFindAllCalls: new Set([2])
      })

      const error = yield* Effect.flip(
        updateEvent({ eventId: EventId.make("event-group"), participants: [], meetingRoom: locator("room-new") }).pipe(
          Effect.provide(fixture.layer)
        )
      )

      expect(error).toMatchObject({
        _tag: "MeetingCompositionMutationError",
        recovery: { _tag: "Unconfirmed", residuals: [{ _tag: "SiblingSet", target: "event" }] }
      })
      expect(fixture.state.events.map((event) => String(event._id))).toEqual(["owner", "new-sibling"])
      expect(fixture.state.calls.some((call) => call.operation === "removeDoc")).toBe(false)
    })
  )

  it.effect("updates an already-triggered Meeting on a new recurring sibling", () =>
    Effect.gen(function* () {
      const owner = makeEvent("owner", AccessLevel.Owner)
      const fixture = createLayer({
        rooms: [makeRoom("room-new", "New")],
        events: [owner],
        meetings: [makeMeeting(owner, "room-old")],
        spawnEventSiblingOnParticipantUpdate: true,
        spawnEventSiblingMeetingRoom: "trigger-room"
      })

      yield* updateEvent({
        eventId: EventId.make("event-group"),
        participants: [],
        meetingRoom: locator("room-new")
      }).pipe(Effect.provide(fixture.layer))

      expect(fixture.state.calls).toContainEqual({ operation: "updateMixin", id: "new-sibling", room: "room-new" })
    })
  )

  it.effect("restores an ambiguously committed Event markup reference and reports its orphan risk", () =>
    Effect.gen(function* () {
      const owner = makeEvent("owner", AccessLevel.Owner, { description: "" })
      const fixture = createLayer({
        rooms: [makeRoom("room-new", "New")],
        events: [owner],
        meetings: [makeMeeting(owner, "room-old")],
        commitThenFailUpdateDocCalls: new Set([1])
      })

      const error = yield* Effect.flip(
        updateEvent({
          eventId: EventId.make("event-group"),
          description: "New markup",
          meetingRoom: locator("room-new")
        }).pipe(Effect.provide(fixture.layer))
      )

      expect(error).toMatchObject({
        _tag: "MeetingCompositionMutationError",
        recovery: { _tag: "Unconfirmed", residuals: [{ _tag: "Markup", risk: "uploaded-markup-may-be-orphaned" }] }
      })
      expect(fixture.state.events[0]?.description).toBe("")
      expect(fixture.state.calls.filter((call) => call.operation === "updateDoc")).toHaveLength(2)
    })
  )

  it.effect("reports both markup risks when an ambiguous Event reference cannot be restored", () =>
    Effect.gen(function* () {
      const owner = makeEvent("owner", AccessLevel.Owner, { description: "" })
      const fixture = createLayer({
        rooms: [makeRoom("room-new", "New")],
        events: [owner],
        meetings: [makeMeeting(owner, "room-old")],
        commitThenFailUpdateDocCalls: new Set([1]),
        failUpdateDocCalls: new Set([2])
      })

      const error = yield* Effect.flip(
        updateEvent({
          eventId: EventId.make("event-group"),
          description: "New markup",
          meetingRoom: locator("room-new")
        }).pipe(Effect.provide(fixture.layer))
      )

      expect(error._tag).toBe("MeetingCompositionMutationError")
      if (error._tag !== "MeetingCompositionMutationError" || error.recovery._tag !== "Unconfirmed") return
      const markupResiduals = error.recovery.residuals.filter((residual) => residual._tag === "Markup")
      expect(markupResiduals).toHaveLength(2)
      expect(new Set(markupResiduals.map((residual) => residual.risk))).toEqual(
        new Set(["uploaded-markup-may-be-orphaned", "content-not-restored"])
      )
      expect(fixture.state.events[0]?.description).toBe("uploaded-markup-ref")
    })
  )

  it.effect("reports every original sibling as unconfirmed when recovery readback fails", () =>
    Effect.gen(function* () {
      const owner = makeEvent("owner", AccessLevel.Owner)
      const sibling = makeEvent("sibling", AccessLevel.Reader, { user: sdkFixture<HulyEvent["user"]>("participant") })
      const fixture = createLayer({
        rooms: [makeRoom("room-new", "New")],
        events: [owner, sibling],
        meetings: [makeMeeting(owner, "owner-old"), makeMeeting(sibling, "sibling-old")],
        failEventFindAllCalls: new Set([6, 7])
      })

      const error = yield* Effect.flip(
        updateEvent({ eventId: EventId.make("event-group"), meetingRoom: locator("room-new") }).pipe(
          Effect.provide(fixture.layer)
        )
      )

      expect(error._tag).toBe("MeetingCompositionMutationError")
      if (error._tag !== "MeetingCompositionMutationError" || error.recovery._tag !== "Unconfirmed") return
      expect(error.recovery.residuals).toContainEqual({
        _tag: "SiblingSet",
        target: "event",
        eventId: EventId.make("event-group")
      })
      expect(error.recovery.residuals.filter((residual) => residual._tag === "RecordPresence")).toHaveLength(2)
    })
  )

  it.effect("reports one sibling-set residual when a tracked late sibling cannot be read during recovery", () =>
    Effect.gen(function* () {
      const owner = makeEvent("owner", AccessLevel.Owner)
      const fixture = createLayer({
        rooms: [makeRoom("room-new", "New")],
        events: [owner],
        meetings: [makeMeeting(owner, "owner-old")],
        spawnEventSiblingOnParticipantUpdate: true,
        failCreateMixinCalls: new Set([1]),
        failEventFindAllCalls: new Set([11])
      })

      const error = yield* Effect.flip(
        updateEvent({ eventId: EventId.make("event-group"), participants: [], meetingRoom: locator("room-new") }).pipe(
          Effect.provide(fixture.layer)
        )
      )

      expect(error._tag).toBe("MeetingCompositionMutationError")
      if (error._tag !== "MeetingCompositionMutationError" || error.recovery._tag !== "Unconfirmed") return
      expect(error.recovery.residuals.filter((residual) => residual._tag === "SiblingSet")).toHaveLength(1)
      expect(error.recovery.residuals.filter((residual) => residual._tag === "RecordPresence")).toHaveLength(1)
    })
  )

  it.effect("reports a recurring sibling deleted by the base update as unconfirmed", () =>
    Effect.gen(function* () {
      const owner = makeEvent("owner", AccessLevel.Owner)
      const sibling = makeEvent("sibling", AccessLevel.Reader, { user: sdkFixture<HulyEvent["user"]>("participant") })
      const fixture = createLayer({
        rooms: [makeRoom("room-new", "New")],
        events: [owner, sibling],
        meetings: [makeMeeting(owner, "owner-old"), makeMeeting(sibling, "sibling-old")],
        removeEventSiblingOnParticipantUpdate: true
      })

      const error = yield* Effect.flip(
        updateEvent({ eventId: EventId.make("event-group"), participants: [], meetingRoom: locator("room-new") }).pipe(
          Effect.provide(fixture.layer)
        )
      )

      expect(error._tag).toBe("MeetingCompositionMutationError")
      if (error._tag !== "MeetingCompositionMutationError" || error.recovery._tag !== "Unconfirmed") return
      expect(error.recovery.residuals).toContainEqual({
        _tag: "SiblingSet",
        target: "event",
        eventId: EventId.make("event-group")
      })
      expect(error.recovery.residuals).toContainEqual({
        _tag: "RecordPresence",
        target: "event",
        documentId: DocId.make("sibling"),
        expected: "present"
      })
      expect(error.recovery.residuals.filter((residual) => residual._tag === "RecordPresence")).toHaveLength(2)
    })
  )

  it.effect("updates existing Event markup successfully after room and base reconciliation", () =>
    Effect.gen(function* () {
      const owner = makeEvent("owner", AccessLevel.Owner, {
        description: sdkFixture<HulyEvent["description"]>("existing-markup-ref")
      })
      const fixture = createLayer({
        rooms: [makeRoom("room-new", "New")],
        events: [owner],
        meetings: [makeMeeting(owner, "room-old")]
      })

      yield* updateEvent({
        eventId: EventId.make("event-group"),
        description: "Changed markup",
        meetingRoom: locator("room-new")
      }).pipe(Effect.provide(fixture.layer))

      expect(fixture.state.calls.at(-1)).toMatchObject({ operation: "updateMarkup", id: "owner" })
    })
  )

  it.effect("cleans up a known Event while leaving sibling exhaustiveness unconfirmed", () =>
    Effect.gen(function* () {
      const fixture = createLayer({
        rooms: [makeRoom("room-new", "New")],
        failCreateMixin: true,
        hideEventFindAllCalls: new Set([1, 2])
      })

      const error = yield* Effect.flip(
        createEvent({
          title: CalendarEventTitle.make("Planning"),
          date: Timestamp.make(1),
          meetingRoom: locator("room-new")
        }).pipe(Effect.provide(fixture.layer))
      )

      expect(error).toMatchObject({
        _tag: "MeetingCompositionMutationError",
        recovery: { _tag: "Unconfirmed", residuals: [{ _tag: "SiblingSet", target: "event" }] }
      })
      expect(fixture.state.events).toHaveLength(0)
    })
  )

  it.effect("continues observing after identical snapshots and includes a delayed sibling", () =>
    Effect.gen(function* () {
      const owner = makeEvent("owner", AccessLevel.Owner)
      const delayed = makeEvent("delayed", AccessLevel.Reader, { user: sdkFixture<HulyEvent["user"]>("participant") })
      const fixture = createLayer({
        eventSiblingSnapshots: [[owner], [owner], [owner, delayed], [owner, delayed], [owner, delayed]]
      })
      const fiber = yield* Effect.forkChild(
        withClient(fixture.clientLayer, (client) =>
          readStableEventSiblings(client, EventId.make("event-group"), [DocId.make("owner")])
        ),
        { startImmediately: true }
      )
      yield* TestClock.adjust("2 seconds")
      const events = yield* Fiber.join(fiber)

      expect(events.map((event) => String(event._id))).toEqual(["owner", "delayed"])
      expect(fixture.state.eventSiblingReads).toBe(5)
    })
  )

  it.effect("fails after the bounded Event sibling observation window when no quiet point is reached", () =>
    Effect.gen(function* () {
      const fixture = createLayer({ growEventSiblingsOnFindAll: true })
      const fiber = yield* Effect.forkChild(
        Effect.flip(
          withClient(fixture.clientLayer, (client) => readStableEventSiblings(client, EventId.make("event-group")))
        ),
        { startImmediately: true }
      )
      yield* TestClock.adjust("2 seconds")
      const error = yield* Fiber.join(fiber)
      expect(error).toMatchObject({ _tag: "EventSiblingConvergenceError", eventId: "event-group", reads: 5 })
      expect(fixture.state.eventSiblingReads).toBe(5)
    })
  )

  it.effect("rejects a quiet Event snapshot that omits expected membership", () =>
    Effect.gen(function* () {
      const fixture = createLayer({ eventSiblingSnapshots: [[], [], [], [], []] })
      const fiber = yield* Effect.forkChild(
        Effect.flip(
          withClient(fixture.clientLayer, (client) =>
            readStableEventSiblings(client, EventId.make("event-group"), [DocId.make("expected-owner")])
          )
        ),
        { startImmediately: true }
      )
      yield* TestClock.adjust("2 seconds")
      const error = yield* Fiber.join(fiber)

      expect(error).toMatchObject({ _tag: "EventSiblingConvergenceError", reads: 5 })
      expect(fixture.state.eventSiblingReads).toBe(5)
    })
  )

  it("covers meeting composition error messages and recovery variants", () => {
    const roomLocator = locator("Focus", "Main")
    const errors = [
      new MeetingRoomNotFoundError({ locator: roomLocator }),
      new MeetingRoomNotFoundError({ locator: locator("Focus") }),
      new MeetingRoomIdentifierAmbiguousError({
        field: "room",
        identifier: MeetingRoomIdentifier.make("Focus"),
        matches: Count.make(2)
      }),
      new MeetingRoomIdentifierAmbiguousError({
        field: "floor",
        identifier: MeetingRoomIdentifier.make("Main"),
        matches: Count.make(2)
      }),
      new MeetingRoomAssignmentUnsupportedError({ roomId: RoomId.make("r1"), reason: "reception" }),
      new MeetingRoomAssignmentUnsupportedError({ roomId: RoomId.make("r2"), reason: "office-not-owned-by-caller" }),
      new CalendarMeetingTargetNotWritableError({
        failure: { _tag: "Schedule", targetId: DocId.make("s1"), reason: "schedule-owned-by-another-employee" }
      }),
      new CalendarMeetingTargetNotWritableError({
        failure: { _tag: "Event", targetId: DocId.make("e1"), reason: "prospective-event-not-writable" }
      }),
      new CalendarMeetingTargetNotWritableError({
        failure: { _tag: "Event", targetId: DocId.make("e2"), reason: "caller-owned-writable-event-not-found" }
      }),
      new EventMeetingMixinMissingError({ eventId: EventId.make("g1"), eventDocumentIds: [DocId.make("e1")] }),
      new EventSiblingConvergenceError({ eventId: EventId.make("g2"), reads: Count.make(5) }),
      new ScheduleMeetingMixinMissingError({ scheduleId: ScheduleId.make("s1") }),
      new MeetingCompositionMutationError({
        failedStep: { _tag: "UpdateEventBase", operation: "update_event" },
        diagnostics: [{ _tag: "TypedFailure", errorTag: NonEmptyString.make("HulyConnectionError") }],
        recovery: { _tag: "Recovered" }
      }),
      new MeetingCompositionMutationError({
        failedStep: { _tag: "UpdateEventBase", operation: "update_event" },
        diagnostics: [{ _tag: "Defect" }],
        recovery: {
          _tag: "Unconfirmed",
          residuals: [{ _tag: "BaseFields", target: "event", documentId: DocId.make("e1") }]
        }
      })
    ]
    expect(errors.map((error) => error.message)).toHaveLength(errors.length)
    expect(errors.every((error) => error.message.length > 0)).toBe(true)
  })

  it.effect("retains only sanitized originating diagnostics for typed and irregular failures", () =>
    Effect.gen(function* () {
      const failedStep: MeetingCompositionFailedStep = { _tag: "UpdateEventBase", operation: "update_event" }
      const connection = yield* Effect.flip(
        failMeetingComposition(
          failedStep,
          Cause.fail(new HulyConnectionError({ message: "operator-secret", diagnostic: { operation: "updateDoc" } })),
          []
        )
      )
      const irregular = yield* Effect.flip(failMeetingComposition(failedStep, Cause.fail("operator-secret"), []))
      const empty = yield* Effect.flip(failMeetingComposition(failedStep, Cause.empty, []))

      expect(connection.diagnostics).toEqual([{ _tag: "HulyConnection", diagnostic: { operation: "updateDoc" } }])
      expect(irregular.diagnostics).toEqual([
        { _tag: "TypedFailure", errorTag: NonEmptyString.make("ExpectedFailure") }
      ])
      expect(empty.diagnostics).toEqual([{ _tag: "UnknownFailure" }])
      expect(JSON.stringify([connection, irregular, empty])).not.toContain("operator-secret")
    })
  )

  it("snapshots only touched Event and Schedule fields", () => {
    const sparseEvent = makeEvent("sparse", AccessLevel.Owner, {
      externalParticipants: undefined,
      location: undefined,
      reminders: undefined,
      timeZone: undefined,
      visibility: undefined
    })
    const completeEvent = makeEvent("complete", AccessLevel.Owner, {
      externalParticipants: ["person@example.com"],
      location: "Desk",
      reminders: [1],
      timeZone: "UTC",
      visibility: "private"
    })
    const sparseSchedule = makeSchedule({ calendar: undefined, description: undefined })
    const completeSchedule = makeSchedule({
      calendar: sdkFixture<Ref<HulyCalendar>>("calendar-1"),
      description: "Description"
    })
    expect(snapshotEventUpdate(sparseEvent, { title: "Changed", location: "Changed" })).toEqual({
      title: sparseEvent.title,
      $unset: { location: "" }
    })
    expect(snapshotEventUpdate(completeEvent, { location: "Changed" })).toEqual({ location: "Desk" })
    expect(snapshotEventUpdate(completeEvent, { $unset: { location: "" } })).toEqual({ location: "Desk" })
    expect(snapshotScheduleUpdate(sparseSchedule, { title: "Changed", description: "Changed" })).toEqual({
      title: sparseSchedule.title,
      $unset: { description: "" }
    })
    expect(snapshotScheduleUpdate(completeSchedule, { description: "Changed" })).toEqual({ description: "Description" })
  })

  it.effect("reports an unconfirmed sibling set when failed Event creation cleanup cannot read siblings", () =>
    Effect.gen(function* () {
      const fixture = createLayer({
        rooms: [makeRoom("room-new", "New")],
        failCreateMixin: true,
        failEventFindAllCalls: new Set([1])
      })
      const error = yield* Effect.flip(
        createEvent({
          title: CalendarEventTitle.make("Planning"),
          date: Timestamp.make(1),
          meetingRoom: locator("room-new")
        }).pipe(Effect.provide(fixture.layer))
      )
      expect(error).toMatchObject({
        recovery: { _tag: "Unconfirmed", residuals: [{ _tag: "SiblingSet", target: "event" }] }
      })
      expect(fixture.state.events).toHaveLength(0)
    })
  )

  it.effect("restores prior markup when the forward markup update alone fails", () =>
    Effect.gen(function* () {
      const owner = makeEvent("owner", AccessLevel.Owner, {
        description: sdkFixture<HulyEvent["description"]>("existing-markup-ref")
      })
      const fixture = createLayer({
        rooms: [makeRoom("room-new", "New")],
        events: [owner],
        meetings: [makeMeeting(owner, "room-old")],
        failUpdateMarkupCalls: new Set([1])
      })
      const error = yield* Effect.flip(
        updateEvent({
          eventId: EventId.make("event-group"),
          description: "Changed markup",
          meetingRoom: locator("room-new")
        }).pipe(Effect.provide(fixture.layer))
      )
      expect(error).toMatchObject({ _tag: "MeetingCompositionMutationError", recovery: { _tag: "Recovered" } })
      expect(fixture.state.calls.filter((call) => call.operation === "updateMarkup")).toHaveLength(2)
    })
  )

  it.effect("returns no prior markup snapshot for an empty Event description", () =>
    Effect.gen(function* () {
      const event = makeEvent("owner", AccessLevel.Owner, { description: "" })
      const fixture = createLayer({ events: [event] })
      const snapshot = yield* withClient(fixture.layer, (client) => snapshotPriorMarkup(client, event, "markdown"))
      expect(snapshot).toBeUndefined()
    })
  )

  it.effect("fetches a prior markup snapshot for an existing Event description", () =>
    Effect.gen(function* () {
      const event = makeEvent("owner", AccessLevel.Owner, {
        description: sdkFixture<HulyEvent["description"]>("existing-markup-ref")
      })
      const fixture = createLayer({ events: [event] })
      const snapshot = yield* withClient(fixture.layer, (client) => snapshotPriorMarkup(client, event, "markdown"))
      expect(snapshot).toBe("stored markup")
    })
  )

  it.effect("commits a combined Schedule room and base-field update", () =>
    Effect.gen(function* () {
      const schedule = makeSchedule()
      const fixture = createLayer({
        rooms: [makeRoom("room-new", "New")],
        schedules: [schedule],
        meetingSchedules: [makeMeetingSchedule(schedule, "room-old")]
      })
      yield* updateSchedule({
        scheduleId: ScheduleId.make("schedule-1"),
        title: ScheduleTitle.make("Changed"),
        meetingRoom: locator("room-new")
      }).pipe(Effect.provide(fixture.layer))
      expect(fixture.state.schedules[0]?.title).toBe("Changed")
      expect(fixture.state.roomByDocument.get("schedule-1")).toBe("room-new")
    })
  )
})
