import { describe, it } from "@effect/vitest"
import type { Person } from "@hcengineering/contact"
import type { MarkupBlobRef, PersonId as HulyPersonId, Ref, Space } from "@hcengineering/core"
import { toFindResult } from "@hcengineering/core"
import type {
  DevicesPreference,
  Floor,
  MeetingMinutes,
  Office,
  ParticipantInfo,
  Room,
  RoomInfo
} from "@hcengineering/love"
import { MeetingStatus, RoomAccess, RoomType } from "@hcengineering/love"
import { Effect } from "effect"
import { expect } from "vitest"

import { DocId, FloorId, type MeetingMinutesId, type RoomId, Timestamp } from "../../../src/domain/schemas/shared.js"
import type { HulyClientOperations } from "../../../src/huly/client.js"
import { HulyClient } from "../../../src/huly/client.js"
import { contact, love } from "../../../src/huly/huly-plugins.js"
import {
  getMeetingMinutes,
  getOffice,
  getOfficeFloor,
  getOfficeRoom,
  listActiveRoomInfo,
  listActiveRoomParticipants,
  listDevicePreferences,
  listMeetingMinutes,
  listOfficeDefaults,
  listOfficeFloors,
  listOfficeRooms,
  listOffices
} from "../../../src/huly/operations/virtual-office.js"

/* eslint-disable no-restricted-syntax, @typescript-eslint/consistent-type-assertions -- tests build SDK-branded fixture values */

const roomId = (id: string): RoomId => id as RoomId
const minutesId = (id: string): MeetingMinutesId => id as MeetingMinutesId
const floorId = (id: string) => FloorId.make(id)

type FixtureOverrides<T> = {
  readonly [K in keyof T]?: T[K] | undefined
}

const makeFloor = (overrides?: FixtureOverrides<Floor>): Floor =>
  ({
    _id: "floor-1" as Ref<Floor>,
    _class: love.class.Floor,
    space: "love:space:Office" as Ref<Space>,
    modifiedOn: 2,
    createdOn: 1,
    createdBy: "user" as HulyPersonId,
    name: "Main",
    ...overrides
  }) as Floor

const makeRoom = (overrides?: FixtureOverrides<Room>): Room =>
  ({
    _id: "room-1" as Ref<Room>,
    _class: love.class.Room,
    space: "love:space:Office" as Ref<Space>,
    modifiedOn: 2,
    createdOn: 1,
    createdBy: "user" as HulyPersonId,
    name: "Focus",
    type: RoomType.Video,
    access: RoomAccess.Open,
    floor: "floor-1" as Ref<Floor>,
    width: 10,
    height: 12,
    x: 1,
    y: 2,
    language: "en",
    startWithRecording: false,
    startWithTranscription: true,
    description: "room-desc" as MarkupBlobRef,
    ...overrides
  }) as Room

const makeOffice = (overrides?: FixtureOverrides<Office>): Office =>
  ({
    ...makeRoom({ _id: "office-1" as Ref<Room>, name: "Alice Office" }),
    _class: love.class.Office,
    person: "person-1" as Ref<Person>,
    ...overrides
  }) as Office

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

const makeMinutes = (overrides?: FixtureOverrides<MeetingMinutes>): MeetingMinutes =>
  ({
    _id: "minutes-1" as Ref<MeetingMinutes>,
    _class: love.class.MeetingMinutes,
    space: "love:space:Minutes" as Ref<Space>,
    modifiedOn: 2,
    createdOn: 100,
    createdBy: "user" as HulyPersonId,
    attachedTo: "room-1" as Ref<Room>,
    attachedToClass: love.class.Room,
    collection: "meetings",
    title: "Daily sync",
    description: "minutes-desc" as MarkupBlobRef,
    status: MeetingStatus.Active,
    meetingEnd: 200,
    transcription: 3,
    ...overrides
  }) as MeetingMinutes

const makeLayer = (config?: {
  readonly floors?: ReadonlyArray<Floor>
  readonly rooms?: ReadonlyArray<Room>
  readonly offices?: ReadonlyArray<Office>
  readonly persons?: ReadonlyArray<Person>
  readonly roomInfos?: ReadonlyArray<RoomInfo>
  readonly participants?: ReadonlyArray<ParticipantInfo>
  readonly minutes?: ReadonlyArray<MeetingMinutes>
  readonly preferences?: ReadonlyArray<DevicesPreference>
}) => {
  const floors = config?.floors ?? [makeFloor()]
  const rooms = config?.rooms ?? [makeRoom()]
  const offices = config?.offices ?? [makeOffice()]
  const persons = config?.persons ?? [makePerson()]
  const roomInfos = config?.roomInfos ?? []
  const participants = config?.participants ?? []
  const minutes = config?.minutes ?? [makeMinutes()]
  const preferences = config?.preferences ?? []

  const findAll: HulyClientOperations["findAll"] = ((_class: unknown) => {
    if (_class === love.class.Floor) return Effect.succeed(toFindResult([...floors]))
    if (_class === love.class.Room) return Effect.succeed(toFindResult([...rooms]))
    if (_class === love.class.Office) return Effect.succeed(toFindResult([...offices]))
    if (_class === contact.class.Person) return Effect.succeed(toFindResult([...persons]))
    if (_class === love.class.RoomInfo) return Effect.succeed(toFindResult([...roomInfos]))
    if (_class === love.class.ParticipantInfo) return Effect.succeed(toFindResult([...participants]))
    if (_class === love.class.MeetingMinutes) return Effect.succeed(toFindResult([...minutes]))
    if (_class === love.class.DevicesPreference) return Effect.succeed(toFindResult([...preferences]))
    return Effect.succeed(toFindResult([]))
  }) as HulyClientOperations["findAll"]

  const findOne: HulyClientOperations["findOne"] = ((_class: unknown, query: unknown) => {
    const q = query as Record<string, unknown>
    if (_class === love.class.Floor) return Effect.succeed(floors.find((floor) => floor._id === q._id))
    if (_class === love.class.Room) return Effect.succeed(rooms.find((room) => room._id === q._id))
    if (_class === love.class.Office) return Effect.succeed(offices.find((office) => office._id === q._id))
    if (_class === love.class.MeetingMinutes) {
      return Effect.succeed(minutes.find((item) => item._id === q._id))
    }
    return Effect.succeed(undefined)
  }) as HulyClientOperations["findOne"]

  const fetchMarkup: HulyClientOperations["fetchMarkup"] =
    ((_class: unknown, _id: unknown, _attr: unknown, ref: unknown) =>
      Effect.succeed(ref === "room-desc" ? "Room description" : "Meeting notes")) as HulyClientOperations["fetchMarkup"]

  return HulyClient.testLayer({ fetchMarkup, findAll, findOne })
}

describe("virtual office operations", () => {
  it.effect("lists floors and rooms with enum strings", () =>
    Effect.gen(function*() {
      const floors = yield* listOfficeFloors({}).pipe(Effect.provide(makeLayer()))
      const rooms = yield* listOfficeRooms({}).pipe(Effect.provide(makeLayer()))

      expect(floors[0].name).toBe("Main")
      expect(rooms[0].type).toBe("video")
      expect(rooms[0].access).toBe("open")
    }))

  it.effect("omits optional floor and room counters when Huly leaves them unset", () =>
    Effect.gen(function*() {
      const floors = yield* listOfficeFloors({}).pipe(
        Effect.provide(makeLayer({ floors: [makeFloor({ modifiedOn: undefined })] }))
      )
      const rooms = yield* listOfficeRooms({}).pipe(
        Effect.provide(makeLayer({
          rooms: [makeRoom({ meetings: undefined, messages: undefined, modifiedOn: undefined })]
        }))
      )

      expect(floors[0].modifiedOn).toBeUndefined()
      expect(rooms[0].meetings).toBeUndefined()
      expect(rooms[0].messages).toBeUndefined()
      expect(rooms[0].modifiedOn).toBeUndefined()
    }))

  it.effect("gets a floor and maps alternate room enum values", () =>
    Effect.gen(function*() {
      const floor = yield* getOfficeFloor({ floorId: floorId("floor-1") }).pipe(Effect.provide(makeLayer()))
      const rooms = yield* listOfficeRooms({ floorId: floorId("floor-1") }).pipe(
        Effect.provide(makeLayer({
          rooms: [
            makeRoom({ _id: "room-2" as Ref<Room>, type: RoomType.Audio, access: RoomAccess.Knock }),
            makeRoom({ _id: "room-3" as Ref<Room>, type: RoomType.Reception, access: RoomAccess.DND })
          ]
        }))
      )

      expect(floor.name).toBe("Main")
      expect(rooms.map((room) => room.type)).toEqual(["audio", "reception"])
      expect(rooms.map((room) => room.access)).toEqual(["knock", "dnd"])
    }))

  it.effect("fails for missing floors and rooms", () =>
    Effect.gen(function*() {
      const floorError = yield* Effect.flip(
        getOfficeFloor({ floorId: floorId("missing-floor") }).pipe(Effect.provide(makeLayer({ floors: [] })))
      )
      const roomError = yield* Effect.flip(
        getOfficeRoom({ roomId: roomId("missing-room") }).pipe(Effect.provide(makeLayer({ rooms: [] })))
      )

      expect(floorError._tag).toBe("FloorNotFoundError")
      expect(roomError._tag).toBe("RoomNotFoundError")
    }))

  it.effect("gets room description", () =>
    Effect.gen(function*() {
      const room = yield* getOfficeRoom({ roomId: roomId("room-1") }).pipe(Effect.provide(makeLayer()))

      expect(room.description).toBe("Room description")
    }))

  it.effect("does not fetch room markup when description is empty", () =>
    Effect.gen(function*() {
      const room = yield* getOfficeRoom({ roomId: roomId("room-1") }).pipe(
        Effect.provide(makeLayer({ rooms: [makeRoom({ description: null })] }))
      )

      expect(room.description).toBeUndefined()
    }))

  it.effect("lists offices with assigned person names", () =>
    Effect.gen(function*() {
      const offices = yield* listOffices({}).pipe(Effect.provide(makeLayer()))

      expect(offices[0].personId).toBe("person-1")
      expect(offices[0].personName).toBe("Alice")
    }))

  it.effect("gets offices and handles unassigned offices", () =>
    Effect.gen(function*() {
      const assigned = yield* getOffice({ roomId: roomId("office-1") }).pipe(Effect.provide(makeLayer()))
      const unassignedOffice = makeOffice({ person: null, description: null })
      const unresolvedPersonOffice = makeOffice({ person: "person-1" as Ref<Person>, description: null })
      const unnamedOffice = makeOffice({ name: "", description: null })
      const unassignedList = yield* listOffices({ floorId: floorId("floor-1") }).pipe(
        Effect.provide(makeLayer({ offices: [unassignedOffice], persons: [] }))
      )
      const unassignedDetails = yield* getOffice({ roomId: roomId("office-1") }).pipe(
        Effect.provide(makeLayer({ offices: [unassignedOffice], persons: [] }))
      )
      const unresolvedPersonList = yield* listOffices({ floorId: floorId("floor-1") }).pipe(
        Effect.provide(makeLayer({ offices: [unresolvedPersonOffice], persons: [] }))
      )
      const unnamedList = yield* listOffices({ floorId: floorId("floor-1") }).pipe(
        Effect.provide(makeLayer({ offices: [unnamedOffice] }))
      )

      expect(assigned.description).toBe("Room description")
      expect(unassignedList[0].personId).toBeUndefined()
      expect(unassignedList[0].personName).toBeUndefined()
      expect(unassignedDetails.description).toBeUndefined()
      expect(unresolvedPersonList[0].personId).toBe("person-1")
      expect(unresolvedPersonList[0].personName).toBeUndefined()
      expect(unnamedList[0].name).toBeUndefined()
    }))

  it.effect("fails for missing offices", () =>
    Effect.gen(function*() {
      const error = yield* Effect.flip(
        getOffice({ roomId: roomId("missing-office") }).pipe(Effect.provide(makeLayer({ offices: [] })))
      )

      expect(error._tag).toBe("RoomNotFoundError")
    }))

  it.effect("handles empty active room discovery", () =>
    Effect.gen(function*() {
      const activeRooms = yield* listActiveRoomInfo({}).pipe(Effect.provide(makeLayer({ roomInfos: [] })))
      const participants = yield* listActiveRoomParticipants({ roomId: roomId("room-1") }).pipe(
        Effect.provide(makeLayer({ participants: [] }))
      )

      expect(activeRooms).toEqual([])
      expect(participants).toEqual([])
    }))

  it.effect("maps active room and participant info", () =>
    Effect.gen(function*() {
      const activeRooms = yield* listActiveRoomInfo({}).pipe(
        Effect.provide(makeLayer({
          roomInfos: [{
            _id: "info-1" as Ref<RoomInfo>,
            _class: love.class.RoomInfo,
            space: "transient" as Ref<Space>,
            modifiedOn: 1,
            createdOn: 1,
            createdBy: "user" as HulyPersonId,
            room: "room-1" as Ref<Room>,
            isOffice: false,
            persons: ["person-1" as Ref<Person>]
          } as RoomInfo]
        }))
      )
      const participants = yield* listActiveRoomParticipants({}).pipe(
        Effect.provide(makeLayer({
          participants: [{
            _id: "participant-1" as Ref<ParticipantInfo>,
            _class: love.class.ParticipantInfo,
            space: "transient" as Ref<Space>,
            modifiedOn: 1,
            createdOn: 1,
            createdBy: "user" as HulyPersonId,
            name: "Alice",
            person: "person-1" as Ref<Person>,
            room: "room-1" as Ref<Room>,
            x: 3,
            y: 4,
            sessionId: "session-1",
            account: "00000000-0000-4000-8000-000000000001" as HulyPersonId
          } as unknown as ParticipantInfo]
        }))
      )
      const anonymousParticipants = yield* listActiveRoomParticipants({ roomId: roomId("room-1") }).pipe(
        Effect.provide(makeLayer({
          participants: [{
            _id: "participant-2" as Ref<ParticipantInfo>,
            _class: love.class.ParticipantInfo,
            space: "transient" as Ref<Space>,
            modifiedOn: 1,
            createdOn: 1,
            createdBy: "user" as HulyPersonId,
            name: "Guest",
            person: "person-2" as Ref<Person>,
            room: "room-1" as Ref<Room>,
            x: 5,
            y: 6,
            sessionId: null,
            account: null
          } as ParticipantInfo]
        }))
      )
      const missingRoomInfo = yield* listActiveRoomInfo({}).pipe(
        Effect.provide(makeLayer({
          rooms: [],
          roomInfos: [{
            _id: "info-2" as Ref<RoomInfo>,
            _class: love.class.RoomInfo,
            space: "transient" as Ref<Space>,
            modifiedOn: 1,
            createdOn: 1,
            createdBy: "user" as HulyPersonId,
            room: "room-1" as Ref<Room>,
            isOffice: false,
            persons: []
          } as unknown as RoomInfo]
        }))
      )
      const missingRoomParticipants = yield* listActiveRoomParticipants({}).pipe(
        Effect.provide(makeLayer({
          rooms: [],
          participants: [{
            _id: "participant-3" as Ref<ParticipantInfo>,
            _class: love.class.ParticipantInfo,
            space: "transient" as Ref<Space>,
            modifiedOn: 1,
            createdOn: 1,
            createdBy: "user" as HulyPersonId,
            name: "No Room",
            person: "person-1" as Ref<Person>,
            room: "room-1" as Ref<Room>,
            x: 0,
            y: 0,
            sessionId: null,
            account: null
          } as ParticipantInfo]
        }))
      )

      expect(activeRooms[0].roomName).toBe("Focus")
      expect(participants[0].sessionId).toBe("session-1")
      expect(participants[0].account).toBe("00000000-0000-4000-8000-000000000001")
      expect(anonymousParticipants[0].sessionId).toBeUndefined()
      expect(anonymousParticipants[0].account).toBeUndefined()
      expect(missingRoomInfo[0].roomName).toBeUndefined()
      expect(missingRoomParticipants[0].roomName).toBeUndefined()
    }))

  it.effect("lists and gets meeting minutes", () =>
    Effect.gen(function*() {
      const list = yield* listMeetingMinutes({}).pipe(Effect.provide(makeLayer()))
      const details = yield* getMeetingMinutes({ meetingMinutesId: minutesId("minutes-1") }).pipe(
        Effect.provide(makeLayer())
      )

      expect(list[0].status).toBe("active")
      expect(details.description).toBe("Meeting notes")
    }))

  it.effect("filters meeting minutes, maps finished status, and handles empty descriptions", () =>
    Effect.gen(function*() {
      const fromList = yield* listMeetingMinutes({ attachedToId: DocId.make("room-1"), from: Timestamp.make(50) }).pipe(
        Effect.provide(makeLayer({ minutes: [makeMinutes({ status: MeetingStatus.Finished })] }))
      )
      const toList = yield* listMeetingMinutes({ to: Timestamp.make(150) }).pipe(Effect.provide(makeLayer()))
      const details = yield* getMeetingMinutes({ meetingMinutesId: minutesId("minutes-1") }).pipe(
        Effect.provide(makeLayer({ minutes: [makeMinutes({ description: null })] }))
      )

      expect(fromList[0].status).toBe("finished")
      expect(toList[0].meetingEnd).toBe(200)
      expect(details.description).toBeUndefined()
    }))

  it.effect("fails for missing meeting minutes", () =>
    Effect.gen(function*() {
      const error = yield* Effect.flip(
        getMeetingMinutes({ meetingMinutesId: minutesId("missing-minutes") }).pipe(
          Effect.provide(makeLayer({ minutes: [] }))
        )
      )

      expect(error._tag).toBe("MeetingMinutesNotFoundError")
    }))

  it.effect("lists device preferences and office defaults", () =>
    Effect.gen(function*() {
      const preferences = yield* listDevicePreferences({}).pipe(
        Effect.provide(makeLayer({
          preferences: [{
            _id: "pref-1" as Ref<DevicesPreference>,
            _class: love.class.DevicesPreference,
            space: "preference:space" as Ref<Space>,
            modifiedOn: 1,
            createdOn: 1,
            createdBy: "user" as HulyPersonId,
            attachedTo: "user" as Ref<DevicesPreference>,
            blurRadius: 8,
            camEnabled: true,
            micEnabled: false,
            noiseCancellation: true
          } as unknown as DevicesPreference]
        }))
      )
      const defaults = yield* listOfficeDefaults({}).pipe(Effect.provide(makeLayer()))

      expect(preferences[0].noiseCancellation).toBe(true)
      expect(defaults[0].startWithTranscription).toBe(true)
    }))
})
