import type { Event as HulyEvent, Schedule as HulySchedule } from "@hcengineering/calendar"
import type { Employee } from "@hcengineering/contact"
import type { Data, Ref, TxOperations } from "@hcengineering/core"
import type { Floor, Meeting, MeetingSchedule, Room } from "@hcengineering/love"
import { Schema, SchemaIssue } from "effect"
import { createRequire } from "node:module"
import { setTimeout as delay } from "node:timers/promises"
import { parseArgs } from "node:util"

import { ScheduleTitle } from "../src/domain/schemas/calendar-schedules.js"
import { CalendarAccessSchema, CalendarEventTitle } from "../src/domain/schemas/calendar.js"
import {
  CalendarId,
  Count,
  DocId,
  EventId,
  FloorId,
  NonEmptyString,
  type AccountUuid,
  PersonId,
  RoomId,
  RoomName,
  ScheduleId
} from "../src/domain/schemas/shared.js"
import { FloorName } from "../src/domain/schemas/virtual-office.js"
import { calendar, contact, core, love } from "../src/huly/huly-plugins.js"
import { hulyQuery } from "../src/huly/operations/query-helpers.js"
import { toAccountUuid, toRef } from "../src/huly/operations/sdk-boundary.js"
import { connectIntegrationHuly } from "./integration-huly-client.js"

const require = createRequire(import.meta.url)
// eslint-disable-next-line @typescript-eslint/consistent-type-imports, no-restricted-syntax -- CJS runtime boundary: Core utilities are unavailable as named ESM exports under tsx.
const coreSdk = require("@hcengineering/core") as typeof import("@hcengineering/core")
// eslint-disable-next-line @typescript-eslint/consistent-type-imports, no-restricted-syntax -- CJS runtime boundary: Love enums are unavailable as named ESM exports under tsx.
const loveSdk = require("@hcengineering/love") as typeof import("@hcengineering/love")
const { generateId } = coreSdk
const { RoomAccess, RoomType } = loveSdk

const NODE_ARGUMENT_OFFSET = 2
const MAX_POLL_ATTEMPTS = 40
const POLL_INTERVAL_MS = 250
const POLL_ATTEMPT_TIMEOUT_MS = 5_000
const ROOM_WIDTH = 2
const ROOM_HEIGHT = 1
const EXPECTED_SIBLING_EVENT_COUNT = 2
const EXPECTED_FIXTURE_ROOM_COUNT = 2

const SetupArgsSchema = Schema.Struct({ mode: Schema.Literal("setup"), fixture: NonEmptyString })
const InspectEventArgsSchema = Schema.Struct({
  mode: Schema.Literal("inspect-event"),
  eventId: EventId,
  eventTitle: CalendarEventTitle,
  roomId: RoomId,
  location: NonEmptyString,
  expectSibling: Schema.optionalKey(Schema.Boolean)
})
const InspectScheduleArgsSchema = Schema.Struct({
  mode: Schema.Literal("inspect-schedule"),
  scheduleId: ScheduleId,
  scheduleTitle: ScheduleTitle,
  roomId: RoomId
})
const CleanupArgsSchema = Schema.Struct({
  mode: Schema.Literal("cleanup"),
  floorName: FloorName,
  roomOneName: RoomName,
  roomTwoName: RoomName,
  eventTitle: CalendarEventTitle,
  scheduleTitle: ScheduleTitle,
  floorId: Schema.optionalKey(FloorId),
  roomOneId: Schema.optionalKey(RoomId),
  roomTwoId: Schema.optionalKey(RoomId),
  eventId: Schema.optionalKey(EventId),
  scheduleId: Schema.optionalKey(ScheduleId)
})
const CliArgsSchema = Schema.Union([
  SetupArgsSchema,
  InspectEventArgsSchema,
  InspectScheduleArgsSchema,
  CleanupArgsSchema
])

const SetupResultSchema = Schema.Struct({
  floorId: FloorId,
  floorName: FloorName,
  roomOneId: RoomId,
  roomOneName: RoomName,
  roomTwoId: RoomId,
  roomTwoName: RoomName
})
const EventStateSchema = Schema.Struct({
  eventId: EventId,
  eventDocumentIds: Schema.Array(DocId),
  identities: Schema.Array(
    Schema.Struct({
      documentId: DocId,
      access: CalendarAccessSchema,
      user: PersonId,
      calendarId: CalendarId,
      modifiedBy: PersonId,
      createdBy: Schema.optionalKey(PersonId)
    })
  ),
  siblingCount: Count,
  meetingCount: Count,
  ownerCount: Count,
  roomId: RoomId,
  locationPreserved: Schema.Boolean
})
const ScheduleStateSchema = Schema.Struct({ scheduleId: ScheduleId, meetingScheduleCount: Count, roomId: RoomId })
const CleanupResultSchema = Schema.Struct({
  eventAbsent: Schema.Boolean,
  scheduleAbsent: Schema.Boolean,
  roomsAbsent: Schema.Boolean,
  floorAbsent: Schema.Boolean
})

const decodeCliArgs = Schema.decodeUnknownSync(CliArgsSchema)
const decodeSetupResult = Schema.decodeUnknownSync(SetupResultSchema)
const decodeEventState = Schema.decodeUnknownSync(EventStateSchema)
const decodeScheduleState = Schema.decodeUnknownSync(ScheduleStateSchema)

type CliArgs = Schema.Schema.Type<typeof CliArgsSchema>
type SetupArgs = Schema.Schema.Type<typeof SetupArgsSchema>
type InspectEventArgs = Schema.Schema.Type<typeof InspectEventArgsSchema>
type InspectScheduleArgs = Schema.Schema.Type<typeof InspectScheduleArgsSchema>
type CleanupArgs = Schema.Schema.Type<typeof CleanupArgsSchema>
type SetupResult = Schema.Schema.Type<typeof SetupResultSchema>
type EventState = Schema.Schema.Type<typeof EventStateSchema>
type ScheduleState = Schema.Schema.Type<typeof ScheduleStateSchema>

const parseCliArgs = (): CliArgs =>
  decodeCliArgs(
    parseArgs({
      args: process.argv.slice(NODE_ARGUMENT_OFFSET),
      options: {
        mode: { type: "string" },
        fixture: { type: "string" },
        eventId: { type: "string" },
        eventTitle: { type: "string" },
        scheduleId: { type: "string" },
        scheduleTitle: { type: "string" },
        roomId: { type: "string" },
        location: { type: "string" },
        expectSibling: { type: "boolean" },
        floorId: { type: "string" },
        floorName: { type: "string" },
        roomOneId: { type: "string" },
        roomOneName: { type: "string" },
        roomTwoId: { type: "string" },
        roomTwoName: { type: "string" }
      }
    }).values
  )

interface IntegrationIdentity {
  readonly accountUuid: AccountUuid
  readonly primarySocialId: PersonId
}

const withFreshClient = async <A>(
  use: (client: TxOperations, identity: IntegrationIdentity) => Promise<A>
): Promise<A> => {
  const { accountUuid, client, primarySocialId } = await connectIntegrationHuly()
  try {
    return await use(client, { accountUuid, primarySocialId })
  } finally {
    await client.close()
  }
}

const withAttemptTimeout = <A>(description: string, operation: Promise<A>): Promise<A> =>
  new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`Timed out during one fresh-client attempt for ${description}.`)),
      POLL_ATTEMPT_TIMEOUT_MS
    )
    void operation.then(
      (value) => {
        clearTimeout(timeout)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timeout)
        reject(error)
      }
    )
  })

const pollFor = async <A>(
  description: string,
  read: (client: TxOperations, identity: IntegrationIdentity) => Promise<A | undefined>
): Promise<A> => {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
    const value = await withAttemptTimeout(description, withFreshClient(read))
    if (value !== undefined) return value
    await delay(POLL_INTERVAL_MS)
  }
  throw new Error(`Timed out waiting for ${description}.`)
}

const waitUntil = async (
  description: string,
  predicate: (client: TxOperations, identity: IntegrationIdentity) => Promise<boolean>
): Promise<void> => {
  await pollFor(description, async (client, identity) => ((await predicate(client, identity)) ? true : undefined))
}

const roomData = (floor: Ref<Floor>, name: RoomName, x: number): Data<Room> => ({
  floor,
  name,
  x,
  y: 0,
  width: ROOM_WIDTH,
  height: ROOM_HEIGHT,
  type: RoomType.Video,
  access: RoomAccess.Open,
  language: "en",
  startWithTranscription: false,
  startWithRecording: false,
  description: null
})

const setup = async (args: SetupArgs): Promise<SetupResult> => {
  const floorId = generateId<Floor>()
  const roomOneId = generateId<Room>()
  const roomTwoId = generateId<Room>()
  const floorName = FloorName.make(`MCP Meeting Floor ${args.fixture}`)
  const roomOneName = RoomName.make(`MCP Meeting Room A ${args.fixture}`)
  const roomTwoName = RoomName.make(`MCP Meeting Room B ${args.fixture}`)

  await withFreshClient(async (client) => {
    await client.createDoc(love.class.Floor, core.space.Workspace, { name: floorName }, floorId)
    await client.createDoc(love.class.Room, core.space.Workspace, roomData(floorId, roomOneName, 0), roomOneId)
    await client.createDoc(love.class.Room, core.space.Workspace, roomData(floorId, roomTwoName, ROOM_WIDTH), roomTwoId)
  })

  return pollFor("meeting-room fixture visibility", async (client) => {
    const floor = await client.findOne<Floor>(love.class.Floor, hulyQuery<Floor>({ _id: floorId }))
    const rooms = await client.findAll<Room>(love.class.Room, hulyQuery<Room>({ _id: { $in: [roomOneId, roomTwoId] } }))
    if (floor?.name !== floorName || rooms.length !== EXPECTED_FIXTURE_ROOM_COUNT) return undefined
    if (!rooms.every((room) => room.floor === floorId)) return undefined
    return decodeSetupResult({ floorId, floorName, roomOneId, roomOneName, roomTwoId, roomTwoName })
  })
}

const inspectEvent = async (args: InspectEventArgs): Promise<EventState> =>
  pollFor(`Event '${args.eventId}' meeting composition`, async (client) => {
    const events = await client.findAll<HulyEvent>(
      calendar.class.Event,
      hulyQuery<HulyEvent>({ eventId: args.eventId })
    )
    const minimumCount = args.expectSibling === true ? EXPECTED_SIBLING_EVENT_COUNT : 1
    if (events.length < minimumCount || events.some((event) => event.title !== args.eventTitle)) return undefined
    const meetings = await client.findAll<Meeting>(
      love.mixin.Meeting,
      hulyQuery<Meeting>({ _id: { $in: events.map((event) => toRef<Meeting>(event._id)) } })
    )
    const locationPreserved = events.every((event) => event.location === args.location)
    if (meetings.length !== events.length || meetings.some((meeting) => String(meeting.room) !== args.roomId)) {
      return undefined
    }
    if (!locationPreserved) return undefined
    return decodeEventState({
      eventId: args.eventId,
      eventDocumentIds: events.map((event) => event._id),
      identities: events.map((event) => ({
        documentId: event._id,
        access: event.access,
        user: event.user,
        calendarId: event.calendar,
        modifiedBy: event.modifiedBy,
        ...(event.createdBy === undefined ? {} : { createdBy: event.createdBy })
      })),
      siblingCount: events.length,
      meetingCount: meetings.length,
      ownerCount: events.filter((event) => event.access === "owner").length,
      roomId: args.roomId,
      locationPreserved
    })
  })

const inspectSchedule = async (args: InspectScheduleArgs): Promise<ScheduleState> =>
  pollFor(`Schedule '${args.scheduleId}' meeting composition`, async (client) => {
    const schedule = await client.findOne<HulySchedule>(
      calendar.class.Schedule,
      hulyQuery<HulySchedule>({ _id: toRef<HulySchedule>(args.scheduleId) })
    )
    if (schedule?.title !== args.scheduleTitle) return undefined
    const meeting = await client.findOne<MeetingSchedule>(
      love.mixin.MeetingSchedule,
      hulyQuery<MeetingSchedule>({ _id: toRef<MeetingSchedule>(args.scheduleId) })
    )
    if (meeting === undefined || String(meeting.room) !== args.roomId) return undefined
    return decodeScheduleState({ scheduleId: args.scheduleId, meetingScheduleCount: 1, roomId: args.roomId })
  })

const findEventsForCleanup = async (
  client: TxOperations,
  args: CleanupArgs,
  identity: IntegrationIdentity
): Promise<ReadonlyArray<HulyEvent>> => {
  const events =
    args.eventId === undefined
      ? await client.findAll<HulyEvent>(calendar.class.Event, hulyQuery<HulyEvent>({ title: args.eventTitle }))
      : await client.findAll<HulyEvent>(calendar.class.Event, hulyQuery<HulyEvent>({ eventId: args.eventId }))
  if (events.some((event) => event.title !== args.eventTitle)) {
    throw new Error("Refusing to remove mismatched Event fixture.")
  }
  if (args.eventId === undefined && new Set(events.map((event) => event.eventId)).size > 1) {
    throw new Error("Refusing to remove ambiguous Event fixture title across multiple recurrence groups.")
  }
  if (
    args.eventId === undefined &&
    events.length > 0 &&
    !events.some((event) => event.access === "owner" && String(event.user) === String(identity.primarySocialId))
  ) {
    throw new Error("Refusing to remove an Event fixture without a caller-owned authoritative Owner sibling.")
  }
  return events
}

const findScheduleForCleanup = async (
  client: TxOperations,
  args: CleanupArgs,
  identity: IntegrationIdentity
): Promise<HulySchedule | undefined> => {
  const schedule =
    args.scheduleId !== undefined
      ? await client.findOne<HulySchedule>(
          calendar.class.Schedule,
          hulyQuery<HulySchedule>({ _id: toRef<HulySchedule>(args.scheduleId) })
        )
      : await client
          .findAll<HulySchedule>(calendar.class.Schedule, hulyQuery<HulySchedule>({ title: args.scheduleTitle }))
          .then((schedules) => {
            if (schedules.length > 1) throw new Error("Refusing to remove ambiguous Schedule fixture title.")
            return schedules[0]
          })
  if (schedule === undefined) return undefined
  const owner = await client.findOne<Employee>(
    contact.mixin.Employee,
    hulyQuery<Employee>({ personUuid: toAccountUuid(identity.accountUuid) })
  )
  if (owner === undefined || String(schedule.owner) !== String(owner._id)) {
    throw new Error("Refusing to remove a Schedule fixture not owned by the authenticated employee.")
  }
  return schedule
}

const findFloor = async (client: TxOperations, args: CleanupArgs): Promise<Floor | undefined> => {
  if (args.floorId !== undefined) {
    const floor = await client.findOne<Floor>(love.class.Floor, hulyQuery<Floor>({ _id: toRef<Floor>(args.floorId) }))
    if (floor !== undefined && floor.name !== args.floorName)
      throw new Error("Refusing to remove mismatched Floor fixture.")
    return floor
  }
  const floors = await client.findAll<Floor>(love.class.Floor, hulyQuery<Floor>({ name: args.floorName }))
  if (floors.length > 1) throw new Error("Refusing to remove ambiguous Floor fixture.")
  return floors[0]
}

const findRoom = async (
  client: TxOperations,
  id: RoomId | undefined,
  name: RoomName,
  floor: Floor | undefined
): Promise<Room | undefined> => {
  const rooms =
    id === undefined
      ? await client.findAll<Room>(love.class.Room, hulyQuery<Room>({ name }))
      : [await client.findOne<Room>(love.class.Room, hulyQuery<Room>({ _id: toRef<Room>(id) }))].filter(
          (room): room is Room => room !== undefined
        )
  if (rooms.length > 1) throw new Error(`Refusing to remove ambiguous Room fixture '${name}'.`)
  const room = rooms[0]
  if (room !== undefined && (room.name !== name || (floor !== undefined && room.floor !== floor._id))) {
    throw new Error(`Refusing to remove mismatched Room fixture '${name}'.`)
  }
  return room
}

const removeCalendarDocuments = async (
  client: TxOperations,
  args: CleanupArgs,
  identity: IntegrationIdentity
): Promise<void> => {
  const events = await findEventsForCleanup(client, args, identity)
  const ordered = [...events].sort(
    (left, right) => (left.access === "owner" ? 1 : 0) - (right.access === "owner" ? 1 : 0)
  )
  for (const event of ordered) await client.removeDoc(event._class, event.space, event._id)

  const schedule = await findScheduleForCleanup(client, args, identity)
  if (schedule !== undefined) {
    if (schedule.title !== args.scheduleTitle) throw new Error("Refusing to remove mismatched Schedule fixture.")
    await client.removeDoc(schedule._class, schedule.space, schedule._id)
  }
}

const cleanup = async (args: CleanupArgs) => {
  await withFreshClient((client, identity) => removeCalendarDocuments(client, args, identity))
  await waitUntil("calendar meeting documents cleanup", async (client, identity) => {
    const events = await findEventsForCleanup(client, args, identity)
    const schedule = await findScheduleForCleanup(client, args, identity)
    return events.length === 0 && schedule === undefined
  })

  await withFreshClient(async (client) => {
    const floor = await findFloor(client, args)
    const roomOne = await findRoom(client, args.roomOneId, args.roomOneName, floor)
    const roomTwo = await findRoom(client, args.roomTwoId, args.roomTwoName, floor)
    if (roomOne !== undefined) await client.removeDoc(roomOne._class, roomOne.space, roomOne._id)
    if (roomTwo !== undefined) await client.removeDoc(roomTwo._class, roomTwo.space, roomTwo._id)
    if (floor !== undefined) await client.removeDoc(floor._class, floor.space, floor._id)
  })

  await waitUntil("meeting-room fixture cleanup", async (client) => {
    const floor = await findFloor(client, args)
    const roomOne = await findRoom(client, args.roomOneId, args.roomOneName, floor)
    const roomTwo = await findRoom(client, args.roomTwoId, args.roomTwoName, floor)
    return floor === undefined && roomOne === undefined && roomTwo === undefined
  })
  return { eventAbsent: true, scheduleAbsent: true, roomsAbsent: true, floorAbsent: true }
}

const main = async (): Promise<string> => {
  const args = parseCliArgs()
  switch (args.mode) {
    case "setup":
      return JSON.stringify(Schema.encodeUnknownSync(SetupResultSchema)(await setup(args)))
    case "inspect-event":
      return JSON.stringify(Schema.encodeUnknownSync(EventStateSchema)(await inspectEvent(args)))
    case "inspect-schedule":
      return JSON.stringify(Schema.encodeUnknownSync(ScheduleStateSchema)(await inspectSchedule(args)))
    case "cleanup":
      return JSON.stringify(Schema.encodeUnknownSync(CleanupResultSchema)(await cleanup(args)))
  }
}

void main().then(
  (output) => {
    // eslint-disable-next-line no-console -- stdout is this integration helper's JSON result boundary.
    console.log(output)
  },
  (error: unknown) => {
    // eslint-disable-next-line no-console -- stderr is this integration helper's failure boundary.
    console.error(Schema.isSchemaError(error) ? SchemaIssue.makeFormatterDefault()(error.issue) : error)
    process.exitCode = 1
  }
)
