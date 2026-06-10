/**
 * Read-only virtual office and meeting discovery operations.
 *
 * @module
 */
import type { Person } from "@hcengineering/contact"
import type { Doc, Ref } from "@hcengineering/core"
import { SortingOrder } from "@hcengineering/core"
import type {
  DevicesPreference,
  Floor,
  MeetingMinutes,
  Office,
  ParticipantInfo,
  Room,
  RoomInfo
} from "@hcengineering/love"
import {
  MeetingStatus as HulyMeetingStatus,
  RoomAccess as HulyRoomAccess,
  RoomType as HulyRoomType
} from "@hcengineering/love"
import { Effect } from "effect"

import {
  AccountUuid,
  BlurRadius,
  Count,
  DevicePreferenceId,
  DocId,
  FloorId,
  MeetingMinutesId,
  ParticipantInfoId,
  PersonId,
  PersonName,
  RoomId,
  RoomName,
  SessionId,
  Timestamp,
  VirtualOfficeCoordinate,
  VirtualOfficeDimension
} from "../../domain/schemas/shared.js"
import type {
  ActiveParticipantInfo,
  ActiveRoomInfo,
  DevicePreferenceSummary,
  FloorSummary,
  GetMeetingMinutesParams,
  GetOfficeFloorParams,
  GetOfficeParams,
  GetOfficeRoomParams,
  ListActiveRoomInfoParams,
  ListActiveRoomParticipantsParams,
  ListDevicePreferencesParams,
  ListMeetingMinutesParams,
  ListOfficeDefaultsParams,
  ListOfficeFloorsParams,
  ListOfficeRoomsParams,
  ListOfficesParams,
  MeetingMinutesDetails,
  MeetingMinutesSummary,
  MeetingStatus,
  OfficeDefaultsSummary,
  OfficeSummary,
  RoomAccess,
  RoomDetails,
  RoomSummary,
  RoomType
} from "../../domain/schemas/virtual-office.js"
import { FloorName, MeetingMinutesTitle } from "../../domain/schemas/virtual-office.js"
import { HulyClient, type HulyClientError } from "../client.js"
import { FloorNotFoundError, MeetingMinutesNotFoundError, RoomNotFoundError } from "../errors.js"
import { contact, love } from "../huly-plugins.js"
import { hulyNonEmptyTextOrFallback } from "./non-empty-text.js"
import { clampLimit, hulyQuery, type StrictDocumentQuery } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"

type ListOfficeFloorsError = HulyClientError
type GetOfficeFloorError = HulyClientError | FloorNotFoundError
type ListOfficeRoomsError = HulyClientError
type GetOfficeRoomError = HulyClientError | RoomNotFoundError
type ListOfficesError = HulyClientError
type GetOfficeError = HulyClientError | RoomNotFoundError
type ListActiveRoomInfoError = HulyClientError
type ListActiveRoomParticipantsError = HulyClientError
type ListMeetingMinutesError = HulyClientError
type GetMeetingMinutesError = HulyClientError | MeetingMinutesNotFoundError
type ListDevicePreferencesError = HulyClientError
type ListOfficeDefaultsError = HulyClientError

const ROOM_ACCESS_TO_STRING = {
  [HulyRoomAccess.Open]: "open",
  [HulyRoomAccess.Knock]: "knock",
  [HulyRoomAccess.DND]: "dnd"
} as const satisfies Record<HulyRoomAccess, RoomAccess>

const ROOM_TYPE_TO_STRING = {
  [HulyRoomType.Video]: "video",
  [HulyRoomType.Audio]: "audio",
  [HulyRoomType.Reception]: "reception"
} as const satisfies Record<HulyRoomType, RoomType>

const MEETING_STATUS_TO_STRING = {
  [HulyMeetingStatus.Active]: "active",
  [HulyMeetingStatus.Finished]: "finished"
} as const satisfies Record<HulyMeetingStatus, MeetingStatus>

type ExactMappedValues<M extends Readonly<Record<PropertyKey, string>>, Expected extends string> =
  Exclude<M[keyof M], Expected> extends never ? Exclude<Expected, M[keyof M]> extends never ? true : never : never

const exactMappedValues = <T extends true>(_value: T): void => {}

exactMappedValues<ExactMappedValues<typeof ROOM_ACCESS_TO_STRING, RoomAccess>>(true)
exactMappedValues<ExactMappedValues<typeof ROOM_TYPE_TO_STRING, RoomType>>(true)
exactMappedValues<ExactMappedValues<typeof MEETING_STATUS_TO_STRING, MeetingStatus>>(true)

const roomAccessToString = (access: HulyRoomAccess): RoomAccess => ROOM_ACCESS_TO_STRING[access]
const roomTypeToString = (type: HulyRoomType): RoomType => ROOM_TYPE_TO_STRING[type]
const meetingStatusToString = (status: HulyMeetingStatus): MeetingStatus => MEETING_STATUS_TO_STRING[status]

const optionalTimestamp = (value: number | undefined) => value === undefined ? undefined : Timestamp.make(value)

const optionalCount = (value: number | undefined) => value === undefined ? undefined : Count.make(value)

const optionalRoomName = (value: string | undefined): RoomName | undefined => {
  const trimmed = value?.trim() ?? ""
  return trimmed === "" ? undefined : RoomName.make(trimmed)
}

const optionalPersonName = (value: string | undefined) => value === undefined ? undefined : PersonName.make(value)

const UNTITLED_FLOOR = FloorName.make("Untitled Floor")
const UNTITLED_MEETING_MINUTES = MeetingMinutesTitle.make("Untitled Meeting Minutes")

const floorName = (name: string): FloorName => hulyNonEmptyTextOrFallback(FloorName, name, UNTITLED_FLOOR)

const meetingMinutesTitle = (title: string): MeetingMinutesTitle =>
  hulyNonEmptyTextOrFallback(MeetingMinutesTitle, title, UNTITLED_MEETING_MINUTES)

const summarizeFloor = (floor: Floor): FloorSummary => ({
  floorId: FloorId.make(floor._id),
  name: floorName(floor.name),
  modifiedOn: optionalTimestamp(floor.modifiedOn)
})

const summarizeRoom = (room: Room): RoomSummary => ({
  roomId: RoomId.make(room._id),
  name: optionalRoomName(room.name),
  type: roomTypeToString(room.type),
  access: roomAccessToString(room.access),
  floorId: FloorId.make(room.floor),
  position: {
    x: VirtualOfficeCoordinate.make(room.x),
    y: VirtualOfficeCoordinate.make(room.y),
    width: VirtualOfficeDimension.make(room.width),
    height: VirtualOfficeDimension.make(room.height)
  },
  language: room.language,
  startWithTranscription: room.startWithTranscription,
  startWithRecording: room.startWithRecording,
  meetings: optionalCount(room.meetings),
  messages: optionalCount(room.messages),
  modifiedOn: optionalTimestamp(room.modifiedOn)
})

const lookupRooms = (
  client: HulyClient["Type"],
  roomIds: ReadonlyArray<Ref<Room>>
): Effect.Effect<Map<Ref<Room>, Room>, HulyClientError> =>
  Effect.gen(function*() {
    const unique = [...new Set(roomIds)]
    if (unique.length === 0) return new Map()
    const rooms = yield* client.findAll<Room>(
      love.class.Room,
      hulyQuery<Room>({ _id: { $in: unique } })
    )
    return new Map(rooms.map((room) => [room._id, room]))
  })

const lookupPersons = (
  client: HulyClient["Type"],
  personIds: ReadonlyArray<Ref<Person>>
): Effect.Effect<Map<Ref<Person>, Person>, HulyClientError> =>
  Effect.gen(function*() {
    const unique = [...new Set(personIds)]
    if (unique.length === 0) return new Map()
    const persons = yield* client.findAll<Person>(
      contact.class.Person,
      hulyQuery<Person>({ _id: { $in: unique } })
    )
    return new Map(persons.map((person) => [person._id, person]))
  })

const roomDescription = (
  client: HulyClient["Type"],
  room: Room
): Effect.Effect<string | undefined, HulyClientError> =>
  // Huly uses null for an absent markup reference; the MCP surface exposes absent descriptions as undefined.
  room.description === null
    ? Effect.succeed(undefined)
    : client.fetchMarkup(love.class.Room, room._id, "description", room.description, "markdown")

const minutesDescription = (
  client: HulyClient["Type"],
  minutes: MeetingMinutes
): Effect.Effect<string | undefined, HulyClientError> =>
  // Huly uses null for an absent markup reference; the MCP surface exposes absent descriptions as undefined.
  minutes.description === null
    ? Effect.succeed(undefined)
    : client.fetchMarkup(love.class.MeetingMinutes, minutes._id, "description", minutes.description, "markdown")

const summarizeOffice = (
  office: Office,
  persons: ReadonlyMap<Ref<Person>, Person>
): OfficeSummary => ({
  ...summarizeRoom(office),
  personId: office.person === null ? undefined : PersonId.make(office.person),
  personName: office.person === null ? undefined : optionalPersonName(persons.get(office.person)?.name)
})

const summarizeMinutes = (minutes: MeetingMinutes): MeetingMinutesSummary => ({
  meetingMinutesId: MeetingMinutesId.make(minutes._id),
  title: meetingMinutesTitle(minutes.title),
  attachedToId: DocId.make(minutes.attachedTo),
  status: meetingStatusToString(minutes.status),
  createdOn: optionalTimestamp(minutes.createdOn),
  meetingEnd: optionalTimestamp(minutes.meetingEnd),
  transcription: optionalCount(minutes.transcription),
  messages: optionalCount(minutes.messages),
  attachments: optionalCount(minutes.attachments)
})

export const listOfficeFloors = (
  params: ListOfficeFloorsParams
): Effect.Effect<Array<FloorSummary>, ListOfficeFloorsError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const floors = yield* client.findAll<Floor>(
      love.class.Floor,
      hulyQuery<Floor>({}),
      { limit: clampLimit(params.limit), sort: { name: SortingOrder.Ascending } }
    )
    return floors.map(summarizeFloor)
  })

export const getOfficeFloor = (
  params: GetOfficeFloorParams
): Effect.Effect<FloorSummary, GetOfficeFloorError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const floor = yield* client.findOne<Floor>(
      love.class.Floor,
      hulyQuery<Floor>({ _id: toRef<Floor>(params.floorId) })
    )
    if (floor === undefined) return yield* new FloorNotFoundError({ floorId: params.floorId })
    return summarizeFloor(floor)
  })

export const listOfficeRooms = (
  params: ListOfficeRoomsParams
): Effect.Effect<Array<RoomSummary>, ListOfficeRoomsError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const query: StrictDocumentQuery<Room> = {}
    if (params.floorId !== undefined) query.floor = toRef<Floor>(params.floorId)
    const rooms = yield* client.findAll<Room>(
      love.class.Room,
      hulyQuery(query),
      { limit: clampLimit(params.limit), sort: { name: SortingOrder.Ascending } }
    )
    return rooms.map(summarizeRoom)
  })

export const getOfficeRoom = (
  params: GetOfficeRoomParams
): Effect.Effect<RoomDetails, GetOfficeRoomError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const room = yield* client.findOne<Room>(
      love.class.Room,
      hulyQuery<Room>({ _id: toRef<Room>(params.roomId) })
    )
    if (room === undefined) return yield* new RoomNotFoundError({ roomId: params.roomId })
    return {
      ...summarizeRoom(room),
      description: yield* roomDescription(client, room)
    }
  })

export const listOffices = (
  params: ListOfficesParams
): Effect.Effect<Array<OfficeSummary>, ListOfficesError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const query: StrictDocumentQuery<Office> = {}
    if (params.floorId !== undefined) query.floor = toRef<Floor>(params.floorId)
    const offices = yield* client.findAll<Office>(
      love.class.Office,
      hulyQuery(query),
      { limit: clampLimit(params.limit), sort: { name: SortingOrder.Ascending } }
    )
    const persons = yield* lookupPersons(
      client,
      offices.flatMap((office) => office.person === null ? [] : [office.person])
    )
    return offices.map((office) => summarizeOffice(office, persons))
  })

export const getOffice = (
  params: GetOfficeParams
): Effect.Effect<RoomDetails & OfficeSummary, GetOfficeError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const office = yield* client.findOne<Office>(
      love.class.Office,
      hulyQuery<Office>({ _id: toRef<Office>(params.roomId) })
    )
    if (office === undefined) return yield* new RoomNotFoundError({ roomId: params.roomId })
    const persons = yield* lookupPersons(client, office.person === null ? [] : [office.person])
    return {
      ...summarizeOffice(office, persons),
      description: yield* roomDescription(client, office)
    }
  })

export const listActiveRoomInfo = (
  _params: ListActiveRoomInfoParams
): Effect.Effect<Array<ActiveRoomInfo>, ListActiveRoomInfoError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const infos = yield* client.findAll<RoomInfo>(love.class.RoomInfo, hulyQuery<RoomInfo>({}))
    const rooms = yield* lookupRooms(client, infos.map((info) => info.room))
    return infos.map((info) => ({
      roomId: RoomId.make(info.room),
      roomName: optionalRoomName(rooms.get(info.room)?.name),
      isOffice: info.isOffice,
      personIds: info.persons.map((person) => PersonId.make(person))
    }))
  })

export const listActiveRoomParticipants = (
  params: ListActiveRoomParticipantsParams
): Effect.Effect<Array<ActiveParticipantInfo>, ListActiveRoomParticipantsError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const query: StrictDocumentQuery<ParticipantInfo> = {}
    if (params.roomId !== undefined) query.room = toRef<Room>(params.roomId)
    const participants = yield* client.findAll<ParticipantInfo>(
      love.class.ParticipantInfo,
      hulyQuery(query),
      { sort: { name: SortingOrder.Ascending } }
    )
    const rooms = yield* lookupRooms(client, participants.map((participant) => participant.room))
    return participants.map((participant) => ({
      participantInfoId: ParticipantInfoId.make(participant._id),
      name: PersonName.make(participant.name),
      personId: PersonId.make(participant.person),
      roomId: RoomId.make(participant.room),
      roomName: optionalRoomName(rooms.get(participant.room)?.name),
      x: VirtualOfficeCoordinate.make(participant.x),
      y: VirtualOfficeCoordinate.make(participant.y),
      sessionId: participant.sessionId === null ? undefined : SessionId.make(participant.sessionId),
      account: participant.account === null ? undefined : AccountUuid.make(participant.account)
    }))
  })

export const listMeetingMinutes = (
  params: ListMeetingMinutesParams
): Effect.Effect<Array<MeetingMinutesSummary>, ListMeetingMinutesError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const query: StrictDocumentQuery<MeetingMinutes> = {}
    if (params.attachedToId !== undefined) query.attachedTo = toRef<Doc>(params.attachedToId)
    if (params.from !== undefined || params.to !== undefined) {
      query.createdOn = {
        ...(params.from === undefined ? {} : { $gte: params.from }),
        ...(params.to === undefined ? {} : { $lte: params.to })
      }
    }
    const minutes = yield* client.findAll<MeetingMinutes>(
      love.class.MeetingMinutes,
      hulyQuery(query),
      { limit: clampLimit(params.limit), sort: { createdOn: SortingOrder.Descending } }
    )
    return minutes.map(summarizeMinutes)
  })

export const getMeetingMinutes = (
  params: GetMeetingMinutesParams
): Effect.Effect<MeetingMinutesDetails, GetMeetingMinutesError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const minutes = yield* client.findOne<MeetingMinutes>(
      love.class.MeetingMinutes,
      hulyQuery<MeetingMinutes>({ _id: toRef<MeetingMinutes>(params.meetingMinutesId) })
    )
    if (minutes === undefined) {
      return yield* new MeetingMinutesNotFoundError({ meetingMinutesId: params.meetingMinutesId })
    }
    return {
      ...summarizeMinutes(minutes),
      description: yield* minutesDescription(client, minutes)
    }
  })

export const listDevicePreferences = (
  _params: ListDevicePreferencesParams
): Effect.Effect<Array<DevicePreferenceSummary>, ListDevicePreferencesError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const preferences = yield* client.findAll<DevicesPreference>(
      love.class.DevicesPreference,
      hulyQuery<DevicesPreference>({})
    )
    return preferences.map((preference) => ({
      devicePreferenceId: DevicePreferenceId.make(preference._id),
      micEnabled: preference.micEnabled,
      camEnabled: preference.camEnabled,
      noiseCancellation: preference.noiseCancellation,
      blurRadius: BlurRadius.make(preference.blurRadius)
    }))
  })

export const listOfficeDefaults = (
  _params: ListOfficeDefaultsParams
): Effect.Effect<Array<OfficeDefaultsSummary>, ListOfficeDefaultsError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const rooms = yield* client.findAll<Room>(
      love.class.Room,
      hulyQuery<Room>({}),
      { sort: { name: SortingOrder.Ascending } }
    )
    return rooms.map((room) => ({
      roomId: RoomId.make(room._id),
      name: optionalRoomName(room.name),
      language: room.language,
      startWithTranscription: room.startWithTranscription,
      startWithRecording: room.startWithRecording
    }))
  })
