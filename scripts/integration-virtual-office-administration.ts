import type { Floor, ParticipantInfo, Room } from "@hcengineering/love"
import type { OfficeSettings } from "@hcengineering/setting"
import type { TxOperations } from "@hcengineering/core"
import { Schema } from "effect"
import { createRequire } from "node:module"
import { setTimeout as delay } from "node:timers/promises"
import { parseArgs } from "node:util"

import {
  Count,
  FloorId,
  ObjectClassName,
  RoomId,
  RoomName,
  VirtualOfficeCoordinate,
  VirtualOfficeDimension
} from "../src/domain/schemas/shared.js"
import { FloorName, RoomAccessSchema, RoomLanguageSchema } from "../src/domain/schemas/virtual-office.js"
import { core, love, setting } from "../src/huly/huly-plugins.js"
import { hulyQuery } from "../src/huly/operations/query-helpers.js"
import { toRef } from "../src/huly/operations/sdk-boundary.js"
import { connectIntegrationHuly } from "./integration-huly-client.js"

const require = createRequire(import.meta.url)
// eslint-disable-next-line @typescript-eslint/consistent-type-imports, no-restricted-syntax -- CJS runtime boundary: Love declares named enums that are unavailable as ESM exports under the integration tsx runner.
const loveSdk = require("@hcengineering/love") as typeof import("@hcengineering/love")
const { RoomAccess, RoomType } = loveSdk

const NODE_ARGUMENT_OFFSET = 2
const MAX_POLL_ATTEMPTS = 30
const POLL_INTERVAL_MS = 250
const EXPECTED_ROOM_WIDTH = 2
const EXPECTED_ROOM_HEIGHT = 1

const InspectArgsSchema = Schema.Struct({
  mode: Schema.Literal("inspect"),
  floorId: FloorId,
  roomId: RoomId,
  floorName: FloorName,
  roomName: RoomName
})
const CleanupArgsSchema = Schema.Struct({
  mode: Schema.Literal("cleanup"),
  floorId: Schema.optionalKey(FloorId),
  roomId: Schema.optionalKey(RoomId),
  floorName: FloorName,
  roomName: RoomName,
  updatedRoomName: Schema.optionalKey(RoomName)
})
const CliArgsSchema = Schema.Union([InspectArgsSchema, CleanupArgsSchema])

const FixtureStateSchema = Schema.Struct({
  floorId: FloorId,
  floorName: FloorName,
  roomId: RoomId,
  roomName: RoomName,
  roomClass: ObjectClassName,
  kind: Schema.Literal("video"),
  access: RoomAccessSchema,
  position: Schema.Struct({
    x: VirtualOfficeCoordinate,
    y: VirtualOfficeCoordinate,
    width: VirtualOfficeDimension,
    height: VirtualOfficeDimension
  }),
  language: RoomLanguageSchema,
  startWithTranscription: Schema.Boolean,
  startWithRecording: Schema.Boolean,
  participantCount: Count
})
const CleanupFailureReasonSchema = Schema.Literals([
  "targets-not-visible",
  "room-absence-unconfirmed",
  "floor-absence-unconfirmed"
])

const CleanupConfirmedResultSchema = Schema.Struct({
  status: Schema.Literal("confirmed"),
  removedRoom: Schema.Boolean,
  removedFloor: Schema.Boolean,
  roomAbsent: Schema.Literal(true),
  floorAbsent: Schema.Literal(true)
})

const CleanupUnconfirmedResultSchema = Schema.Struct({
  status: Schema.Literal("unconfirmed"),
  reason: CleanupFailureReasonSchema,
  removedRoom: Schema.Boolean,
  removedFloor: Schema.Boolean,
  roomAbsent: Schema.Boolean,
  floorAbsent: Schema.Boolean
})

const CleanupResultSchema = Schema.Union([CleanupConfirmedResultSchema, CleanupUnconfirmedResultSchema])
const decodeCliArgs = Schema.decodeUnknownSync(CliArgsSchema)
const decodeFixtureState = Schema.decodeUnknownSync(FixtureStateSchema)

type CliArgs = Schema.Schema.Type<typeof CliArgsSchema>
type InspectArgs = Schema.Schema.Type<typeof InspectArgsSchema>
type CleanupArgs = Schema.Schema.Type<typeof CleanupArgsSchema>
type FixtureState = Schema.Schema.Type<typeof FixtureStateSchema>
type CleanupResult = Schema.Schema.Type<typeof CleanupResultSchema>

const confirmedCleanup = (removedRoom: boolean, removedFloor: boolean): CleanupResult => ({
  status: "confirmed",
  removedRoom,
  removedFloor,
  roomAbsent: true,
  floorAbsent: true
})

const unconfirmedCleanup = (
  reason: Schema.Schema.Type<typeof CleanupFailureReasonSchema>,
  removedRoom: boolean,
  removedFloor: boolean,
  roomAbsent: boolean,
  floorAbsent: boolean
): CleanupResult => ({ status: "unconfirmed", reason, removedRoom, removedFloor, roomAbsent, floorAbsent })

const parseCliArgs = (): CliArgs =>
  decodeCliArgs(
    parseArgs({
      args: process.argv.slice(NODE_ARGUMENT_OFFSET),
      options: {
        mode: { type: "string" },
        floorId: { type: "string" },
        roomId: { type: "string" },
        floorName: { type: "string" },
        roomName: { type: "string" },
        updatedRoomName: { type: "string" }
      }
    }).values
  )

const requireEqual = (field: string, actual: unknown, expected: unknown): void => {
  if (actual !== expected) {
    throw new Error(
      `Virtual-office fixture ${field} mismatch: expected ${String(expected)}, received ${String(actual)}.`
    )
  }
}

const roomNameMatches = (args: CleanupArgs | InspectArgs, room: Room): boolean =>
  room.name === args.roomName || ("updatedRoomName" in args && room.name === args.updatedRoomName)

const requireFixtureRoomName = (args: CleanupArgs | InspectArgs, room: Room): void => {
  if (!roomNameMatches(args, room)) {
    throw new Error(`Virtual-office fixture room name mismatch: received '${room.name}'.`)
  }
}

const findFloor = async (client: TxOperations, args: CleanupArgs | InspectArgs): Promise<Floor | undefined> => {
  if (args.floorId !== undefined) {
    const floor = await client.findOne<Floor>(love.class.Floor, hulyQuery<Floor>({ _id: toRef<Floor>(args.floorId) }))
    if (floor !== undefined) requireEqual("floor name", floor.name, args.floorName)
    return floor
  }

  const floors = await client.findAll<Floor>(love.class.Floor, hulyQuery<Floor>({ name: args.floorName }))
  if (floors.length > 1) {
    throw new Error(`Refusing to clean ${String(floors.length)} floors named '${args.floorName}'.`)
  }
  const [floor] = floors
  return floor
}

const findRoom = async (
  client: TxOperations,
  args: CleanupArgs | InspectArgs,
  floor: Floor | undefined
): Promise<Room | undefined> => {
  if (args.roomId !== undefined) {
    const room = await client.findOne<Room>(love.class.Room, hulyQuery<Room>({ _id: toRef<Room>(args.roomId) }))
    if (room !== undefined) {
      requireFixtureRoomName(args, room)
      if (floor !== undefined) requireEqual("room floor", room.floor, floor._id)
      if (floor === undefined && args.floorId !== undefined) requireEqual("room floor", room.floor, args.floorId)
    }
    return room
  }
  if (floor === undefined) return undefined

  const rooms = (await client.findAll<Room>(love.class.Room, hulyQuery<Room>({ floor: floor._id }))).filter((room) =>
    roomNameMatches(args, room)
  )
  if (rooms.length > 1) {
    throw new Error(`Refusing to clean ${String(rooms.length)} rooms named '${args.roomName}' on the fixture floor.`)
  }
  const [room] = rooms
  return room
}

const inspectVisibleFixture = async (client: TxOperations, args: InspectArgs): Promise<FixtureState | undefined> => {
  const floor = await findFloor(client, args)
  if (floor === undefined) return undefined
  const room = await findRoom(client, args, floor)
  if (room === undefined) return undefined

  requireEqual("room class", room._class, love.class.Room)
  requireEqual("room type", room.type, RoomType.Video)
  requireEqual("room access", room.access, RoomAccess.Open)
  requireEqual("room x", room.x, 0)
  requireEqual("room y", room.y, 0)
  requireEqual("room width", room.width, EXPECTED_ROOM_WIDTH)
  requireEqual("room height", room.height, EXPECTED_ROOM_HEIGHT)
  requireEqual("room language", room.language, "en")

  const settings = await client.findOne<OfficeSettings>(setting.class.OfficeSettings, hulyQuery<OfficeSettings>({}))
  requireEqual("transcription default", room.startWithTranscription, settings?.defaultStartWithTranscription ?? false)
  requireEqual("recording default", room.startWithRecording, settings?.defaultStartWithRecording ?? false)

  const participants = await client.findAll<ParticipantInfo>(
    love.class.ParticipantInfo,
    hulyQuery<ParticipantInfo>({ room: room._id })
  )
  return decodeFixtureState({
    floorId: floor._id,
    floorName: floor.name,
    roomId: room._id,
    roomName: room.name,
    roomClass: room._class,
    kind: "video",
    access: "open",
    position: { x: room.x, y: room.y, width: room.width, height: room.height },
    language: room.language,
    startWithTranscription: room.startWithTranscription,
    startWithRecording: room.startWithRecording,
    participantCount: participants.length
  })
}

const POLL_ATTEMPT_TIMEOUT_MS = 1_000

interface CleanupTargets {
  readonly floor: Floor | undefined
  readonly room: Room | undefined
}

interface RoomRemoval {
  readonly roomId: RoomId | undefined
  readonly removedRoom: boolean
}

interface FloorRemoval {
  readonly floorId: FloorId | undefined
  readonly removedFloor: boolean
}

const withAttemptTimeout = <A>(description: string, operation: Promise<A>): Promise<A> =>
  new Promise((resolve, reject) => {
    const timeout = globalThis.setTimeout(
      () => reject(new Error(`Timed out during one fresh-client attempt for ${description}.`)),
      POLL_ATTEMPT_TIMEOUT_MS
    )
    void operation.then(
      (value) => {
        globalThis.clearTimeout(timeout)
        resolve(value)
      },
      (error: unknown) => {
        globalThis.clearTimeout(timeout)
        reject(error)
      }
    )
  })

const withFreshClient = async <A>(use: (client: TxOperations) => Promise<A>): Promise<A> => {
  const { client } = await connectIntegrationHuly()
  try {
    return await use(client)
  } finally {
    await client.close()
  }
}

const retryableInspectionAttempt = <A>(attempt: Promise<A>): Promise<A | undefined> =>
  attempt.catch((cause: unknown) => {
    if (cause instanceof Error && cause.message.startsWith("Timed out during one fresh-client attempt"))
      return undefined
    throw cause
  })

const pollForInspection = async (args: InspectArgs): Promise<FixtureState> => {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
    const state = await retryableInspectionAttempt(
      withAttemptTimeout(
        `virtual-office fixture room '${args.roomId}'`,
        withFreshClient((client) => inspectVisibleFixture(client, args))
      )
    )
    if (state !== undefined) return state
    await delay(POLL_INTERVAL_MS)
  }
  throw new Error(`Timed out waiting for virtual-office fixture room '${args.roomId}'.`)
}

const readCleanupTargets = async (client: TxOperations, args: CleanupArgs): Promise<CleanupTargets> => {
  const floor = await findFloor(client, args)
  const room = await findRoom(client, args, floor)
  return { floor, room }
}

const cleanupTargetsReady = (args: CleanupArgs, targets: CleanupTargets): boolean =>
  (args.floorId === undefined || targets.floor !== undefined) &&
  (args.roomId === undefined || targets.room !== undefined)

const resolveCleanupTargets = async (args: CleanupArgs): Promise<CleanupTargets> => {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
    const targets = await withAttemptTimeout(
      `virtual-office cleanup targets for '${args.floorName}'`,
      withFreshClient((client) => readCleanupTargets(client, args))
    ).catch(() => ({ floor: undefined, room: undefined }))
    if (cleanupTargetsReady(args, targets)) return targets
    await delay(POLL_INTERVAL_MS)
  }
  return withFreshClient((client) => readCleanupTargets(client, args)).catch(() => ({
    floor: undefined,
    room: undefined
  }))
}

const cleanupVisibility = (
  args: CleanupArgs,
  targets: CleanupTargets
): { readonly floor: boolean; readonly room: boolean } => ({
  floor: args.floorId === undefined || targets.floor !== undefined,
  room: args.roomId === undefined || targets.room !== undefined
})

const removeRoom = async (client: TxOperations, room: Room | undefined): Promise<RoomRemoval> => {
  if (room === undefined) return { roomId: undefined, removedRoom: false }
  requireEqual("cleanup room class", room._class, love.class.Room)
  requireEqual("cleanup room type", room.type, RoomType.Video)
  const participants = await client.findAll<ParticipantInfo>(
    love.class.ParticipantInfo,
    hulyQuery<ParticipantInfo>({ room: room._id })
  )
  if (participants.length > 0) {
    throw new Error(`Refusing to remove occupied fixture room '${room._id}'.`)
  }
  await client.removeDoc(room._class, room.space, room._id)
  return { roomId: RoomId.make(room._id), removedRoom: true }
}

const removeFloor = async (client: TxOperations, floor: Floor | undefined): Promise<FloorRemoval> => {
  if (floor === undefined) return { floorId: undefined, removedFloor: false }
  const rooms = await client.findAll<Room>(love.class.Room, hulyQuery<Room>({ floor: floor._id }))
  if (rooms.length > 0) {
    throw new Error(`Refusing to remove fixture floor '${floor._id}' while it still contains rooms.`)
  }
  await client.removeDoc(love.class.Floor, core.space.Workspace, floor._id)
  return { floorId: FloorId.make(floor._id), removedFloor: true }
}

const roomIsPresent = async (client: TxOperations, args: CleanupArgs, roomId: RoomId | undefined): Promise<boolean> => {
  if (roomId !== undefined) {
    const room = await client.findOne<Room>(love.class.Room, hulyQuery<Room>({ _id: toRef<Room>(roomId) }))
    return room !== undefined
  }
  const floor = await findFloor(client, args)
  return (await findRoom(client, args, floor)) !== undefined
}

const floorIsPresent = async (
  client: TxOperations,
  args: CleanupArgs,
  floorId: FloorId | undefined
): Promise<boolean> => {
  if (floorId !== undefined) {
    const floor = await client.findOne<Floor>(love.class.Floor, hulyQuery<Floor>({ _id: toRef<Floor>(floorId) }))
    return floor !== undefined
  }
  return (await findFloor(client, args)) !== undefined
}

const pollUntilAbsent = async (
  description: string,
  isPresent: (client: TxOperations) => Promise<boolean>
): Promise<boolean> => {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
    const present = await withAttemptTimeout(description, withFreshClient(isPresent)).catch(() => true)
    if (!present) return true
    await delay(POLL_INTERVAL_MS)
  }
  return false
}

const cleanup = async (args: CleanupArgs): Promise<CleanupResult> => {
  const targets = await resolveCleanupTargets(args)
  const visibility = cleanupVisibility(args, targets)
  if (!visibility.floor || !visibility.room) {
    console.error("Virtual-office cleanup timed out before every known fixture ID became visible; markers retained.")
    return unconfirmedCleanup("targets-not-visible", false, false, false, false)
  }

  const roomRemoval = await withFreshClient((client) => removeRoom(client, targets.room))
  const roomAbsent = await pollUntilAbsent(`room '${roomRemoval.roomId ?? args.roomName}' cleanup`, (client) =>
    roomIsPresent(client, args, roomRemoval.roomId)
  )
  if (!roomAbsent) {
    console.error("Virtual-office Room absence was not confirmed by fresh readback; markers retained.")
    return unconfirmedCleanup("room-absence-unconfirmed", roomRemoval.removedRoom, false, false, false)
  }

  const floorRemoval = await withFreshClient((client) => removeFloor(client, targets.floor))
  const floorAbsent = await pollUntilAbsent(`floor '${floorRemoval.floorId ?? args.floorName}' cleanup`, (client) =>
    floorIsPresent(client, args, floorRemoval.floorId)
  )
  if (!floorAbsent) {
    console.error("Virtual-office Floor absence was not confirmed by fresh readback; markers retained.")
    return unconfirmedCleanup(
      "floor-absence-unconfirmed",
      roomRemoval.removedRoom,
      floorRemoval.removedFloor,
      true,
      false
    )
  }
  return confirmedCleanup(roomRemoval.removedRoom, floorRemoval.removedFloor)
}

const main = async (): Promise<string> => {
  const args = parseCliArgs()
  if (args.mode === "inspect") {
    return JSON.stringify(Schema.encodeUnknownSync(FixtureStateSchema)(await pollForInspection(args)))
  }
  const result = await cleanup(args)
  if (!result.roomAbsent || !result.floorAbsent) process.exitCode = 1
  return JSON.stringify(Schema.encodeUnknownSync(CleanupResultSchema)(result))
}

void main().then(
  (output) => {
    // eslint-disable-next-line no-console -- stdout is this integration helper's JSON result boundary.
    console.log(output)
  },
  (cause) => {
    // eslint-disable-next-line no-console -- stderr is this integration helper's failure boundary.
    console.error(cause)
    // eslint-disable-next-line functional/immutable-data -- process exit status is the script boundary.
    process.exitCode = 1
  }
)
