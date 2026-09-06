import type { Data, DocumentUpdate, Ref } from "@hcengineering/core"
import { generateId } from "@hcengineering/core"
import type { Floor, Office, Room } from "@hcengineering/love"
import { getFreePosition, isOffice, RoomAccess as HulyRoomAccess, RoomType as HulyRoomType } from "@hcengineering/love"
import type { OfficeSettings } from "@hcengineering/setting"
import { Effect, Schema } from "effect"

import {
  type CreateOfficeFloorParams,
  type CreateOfficeFloorResult,
  type CreateOfficeRoomParams,
  type CreateOfficeRoomResult,
  type OfficeRoomKind,
  OfficeSettingsDefaultsSchema,
  UPDATE_OFFICE_ROOM_FIELDS,
  type UpdateOfficeRoomParams,
  type UpdateOfficeRoomResult
} from "../../domain/schemas/virtual-office-administration.js"
import { FloorId, RoomId, VirtualOfficeCoordinate, VirtualOfficeDimension } from "../../domain/schemas/shared.js"
import { HulyClient, type HulyClientError } from "../client.js"
import {
  OfficeRoomAccessUnsupportedError,
  OfficeRoomProtectedError,
  OfficeSettingsMalformedError,
  type NoUpdateFieldsError,
  RoomNotFoundError
} from "../errors.js"
import { core, love, setting } from "../huly-plugins.js"
import { renderMarkdownPreservingNativeReferences } from "./native-reference-markup.js"
import { hulyQuery } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"
import { mergeUpdateEntries, requireUpdateFields } from "./update-guards.js"
import { mcpRoomAccessToNative, nativeRoomAccessToMcp } from "./virtual-office-room-mapping.js"
import { resolveOfficeFloor, type OfficeFloorResolutionError } from "./virtual-office-administration-shared.js"

type CreateOfficeRoomError = HulyClientError | OfficeFloorResolutionError | OfficeSettingsMalformedError
type UpdateOfficeRoomError =
  | HulyClientError
  | NoUpdateFieldsError
  | OfficeRoomAccessUnsupportedError
  | OfficeRoomProtectedError
  | RoomNotFoundError

interface WorkspaceVideoDefaults {
  readonly startWithTranscription: boolean
  readonly startWithRecording: boolean
}

interface InitialRoomSettings extends WorkspaceVideoDefaults {
  readonly type: HulyRoomType
  readonly access: HulyRoomAccess
}

const ROOM_WIDTH = 2
const ROOM_HEIGHT = 1
const ROOM_LANGUAGE = "en" as const

const HULY_ROOM_TYPE_BY_KIND = {
  video: HulyRoomType.Video,
  audio: HulyRoomType.Audio,
  reception: HulyRoomType.Reception,
  office: HulyRoomType.Audio
} as const satisfies Record<OfficeRoomKind, HulyRoomType>

const noWorkspaceVideoDefaults: WorkspaceVideoDefaults = { startWithTranscription: false, startWithRecording: false }

const parseOfficeSettingsDefaults = Effect.fn("VirtualOffice.parseOfficeSettingsDefaults")(function* (
  value: unknown
): Effect.fn.Return<WorkspaceVideoDefaults, OfficeSettingsMalformedError> {
  const defaults = yield* Schema.decodeUnknownEffect(OfficeSettingsDefaultsSchema)(value).pipe(
    Effect.mapError(
      () => new OfficeSettingsMalformedError({ reason: "recording and transcription defaults must be boolean values" })
    )
  )
  return {
    startWithTranscription: defaults.defaultStartWithTranscription ?? false,
    startWithRecording: defaults.defaultStartWithRecording ?? false
  }
})

const loadWorkspaceVideoDefaults = Effect.fn("VirtualOffice.loadWorkspaceVideoDefaults")(function* (
  client: HulyClient["Service"],
  kind: OfficeRoomKind
): Effect.fn.Return<WorkspaceVideoDefaults, HulyClientError | OfficeSettingsMalformedError> {
  if (kind !== "video") return noWorkspaceVideoDefaults
  const defaults = yield* client.findOne<OfficeSettings>(setting.class.OfficeSettings, hulyQuery<OfficeSettings>({}))
  return defaults === undefined ? noWorkspaceVideoDefaults : yield* parseOfficeSettingsDefaults(defaults)
})

const initialRoomSettings = (kind: OfficeRoomKind, workspaceDefaults: WorkspaceVideoDefaults): InitialRoomSettings => ({
  type: HULY_ROOM_TYPE_BY_KIND[kind],
  access: kind === "office" ? HulyRoomAccess.Knock : HulyRoomAccess.Open,
  startWithTranscription: kind === "video" ? workspaceDefaults.startWithTranscription : false,
  startWithRecording: kind === "video" ? workspaceDefaults.startWithRecording : false
})

const baseRoomData = (
  floor: Ref<Floor>,
  position: { readonly x: number; readonly y: number },
  settings: InitialRoomSettings
): Data<Room> => ({
  name: "",
  floor,
  x: position.x,
  y: position.y,
  width: ROOM_WIDTH,
  height: ROOM_HEIGHT,
  type: settings.type,
  access: settings.access,
  language: ROOM_LANGUAGE,
  startWithTranscription: settings.startWithTranscription,
  startWithRecording: settings.startWithRecording,
  description: null
})

const createNativeRoom = Effect.fn("VirtualOffice.createNativeRoom")(function* (
  client: HulyClient["Service"],
  params: CreateOfficeRoomParams,
  floor: Floor,
  position: { readonly x: number; readonly y: number },
  settings: InitialRoomSettings
): Effect.fn.Return<RoomId, HulyClientError> {
  const common = baseRoomData(floor._id, position, settings)
  if (params.kind === "office") {
    const officeId = generateId<Office>()
    const data: Data<Office> = { ...common, person: null }
    yield* client.createDoc(love.class.Office, core.space.Workspace, data, officeId)
    return RoomId.make(officeId)
  }

  const roomId = generateId<Room>()
  yield* client.createDoc(love.class.Room, core.space.Workspace, { ...common, name: params.name }, roomId)
  return RoomId.make(roomId)
})

export const createOfficeFloor = Effect.fn("VirtualOffice.createFloor")(function* (
  params: CreateOfficeFloorParams
): Effect.fn.Return<CreateOfficeFloorResult, HulyClientError, HulyClient> {
  const client = yield* HulyClient
  const floorId = generateId<Floor>()
  yield* client.createDoc(love.class.Floor, core.space.Workspace, { name: params.name }, floorId)
  return { floorId: FloorId.make(floorId), name: params.name }
})

export const createOfficeRoom = Effect.fn("VirtualOffice.createRoom")(function* (
  params: CreateOfficeRoomParams
): Effect.fn.Return<CreateOfficeRoomResult, CreateOfficeRoomError, HulyClient> {
  const client = yield* HulyClient
  const floor = yield* resolveOfficeFloor(client, params.floor)
  const floorRooms = yield* client.findAll<Room>(love.class.Room, hulyQuery<Room>({ floor: floor._id }))
  const position = getFreePosition([...floorRooms], ROOM_WIDTH, ROOM_HEIGHT)
  const workspaceDefaults = yield* loadWorkspaceVideoDefaults(client, params.kind)
  const settings = initialRoomSettings(params.kind, workspaceDefaults)
  const roomId = yield* createNativeRoom(client, params, floor, position, settings)

  const commonResult = {
    roomId,
    floorId: FloorId.make(floor._id),
    access: nativeRoomAccessToMcp(settings.access),
    position: {
      x: VirtualOfficeCoordinate.make(position.x),
      y: VirtualOfficeCoordinate.make(position.y),
      width: VirtualOfficeDimension.make(ROOM_WIDTH),
      height: VirtualOfficeDimension.make(ROOM_HEIGHT)
    },
    language: ROOM_LANGUAGE,
    startWithTranscription: settings.startWithTranscription,
    startWithRecording: settings.startWithRecording
  }
  return params.kind === "office"
    ? { ...commonResult, kind: "office" }
    : { ...commonResult, kind: params.kind, name: params.name }
})

const descriptionUpdate = Effect.fn("VirtualOffice.descriptionUpdate")(function* (
  client: HulyClient["Service"],
  room: Room,
  description: UpdateOfficeRoomParams["description"]
): Effect.fn.Return<DocumentUpdate<Room>, HulyClientError> {
  if (description === undefined) return {}
  if (description === null || description.trim() === "") return { description: null }

  const rendered = renderMarkdownPreservingNativeReferences(description, client.markupUrlConfig)
  if (room.description !== null) {
    yield* client.updateMarkup(room._class, room._id, "description", rendered.markup, rendered.format)
    return {}
  }

  const descriptionRef = yield* client.uploadMarkup(
    room._class,
    room._id,
    "description",
    rendered.markup,
    rendered.format
  )
  return { description: descriptionRef }
})

const ensureRoomUpdateAllowed = (
  room: Room,
  params: UpdateOfficeRoomParams
): Effect.Effect<void, OfficeRoomAccessUnsupportedError | OfficeRoomProtectedError> => {
  const roomId = RoomId.make(room._id)
  if (params.name !== undefined && room._id === love.ids.Reception) {
    return Effect.fail(new OfficeRoomProtectedError({ roomId, field: "name" }))
  }
  if (params.access === "open" && isOffice(room)) {
    return Effect.fail(new OfficeRoomAccessUnsupportedError({ roomId, access: params.access }))
  }
  return Effect.void
}

const scalarRoomUpdates = (params: UpdateOfficeRoomParams): ReadonlyArray<DocumentUpdate<Room>> => [
  params.name === undefined ? {} : { name: params.name },
  params.access === undefined ? {} : { access: mcpRoomAccessToNative(params.access) },
  params.startWithTranscription === undefined ? {} : { startWithTranscription: params.startWithTranscription },
  params.startWithRecording === undefined ? {} : { startWithRecording: params.startWithRecording }
]

export const updateOfficeRoom = Effect.fn("VirtualOffice.updateRoom")(function* (
  params: UpdateOfficeRoomParams
): Effect.fn.Return<UpdateOfficeRoomResult, UpdateOfficeRoomError, HulyClient> {
  yield* requireUpdateFields("update_office_room", params, UPDATE_OFFICE_ROOM_FIELDS)
  const client = yield* HulyClient
  const room = yield* client.findOne<Room>(love.class.Room, hulyQuery<Room>({ _id: toRef<Room>(params.roomId) }))
  if (room === undefined) return yield* new RoomNotFoundError({ roomId: params.roomId })
  yield* ensureRoomUpdateAllowed(room, params)

  const description = yield* descriptionUpdate(client, room, params.description)
  const update = mergeUpdateEntries([...scalarRoomUpdates(params), description])
  if (Reflect.ownKeys(update).length > 0) {
    yield* client.updateDoc(room._class, room.space, room._id, update)
  }

  return {
    roomId: RoomId.make(room._id),
    updatedFields: UPDATE_OFFICE_ROOM_FIELDS.filter((field) => params[field] !== undefined)
  }
})
