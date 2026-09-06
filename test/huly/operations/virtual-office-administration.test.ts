import { describe, it } from "@effect/vitest"
import type { Blob, Class, Data, Doc, DocumentQuery, DocumentUpdate, Ref, Space } from "@hcengineering/core"
import type { Floor, Office, Room } from "@hcengineering/love"
import { RoomAccess, RoomType } from "@hcengineering/love"
import type { OfficeSettings } from "@hcengineering/setting"
import { Effect, Schema } from "effect"
import { expect } from "vitest"

import {
  CreateOfficeFloorParamsSchema,
  CreateOfficeRoomParamsSchema,
  UpdateOfficeRoomParamsSchema
} from "../../../src/domain/schemas/virtual-office-administration.js"
import type { HulyClientOperations } from "../../../src/huly/client.js"
import { HulyClient } from "../../../src/huly/client.js"
import { SocialIdentityId } from "../../../src/domain/schemas/person-administration.js"
import { NonEmptyString } from "../../../src/domain/schemas/shared.js"
import { core, love, setting } from "../../../src/huly/huly-plugins.js"
import { toCorePersonId, toRef } from "../../../src/huly/operations/sdk-boundary.js"
import { documentForTestClass, findResultForTestClass, sdkFixture } from "../../helpers/huly-sdk.js"
import {
  createOfficeFloor,
  createOfficeRoom,
  updateOfficeRoom
} from "../../../src/huly/operations/virtual-office-administration.js"

type FixtureOverrides<T> = Readonly<Partial<T>>

interface CreatedDocCapture {
  readonly objectClass: unknown
  readonly space: unknown
  readonly data: unknown
  readonly id: unknown
}

interface UpdatedDocCapture {
  readonly objectClass: unknown
  readonly space: unknown
  readonly id: unknown
  readonly update: unknown
}

interface MarkupCapture {
  readonly id: unknown
  readonly markup: string
}

interface Captures {
  readonly created: Array<CreatedDocCapture>
  readonly updated: Array<UpdatedDocCapture>
  readonly uploadedMarkup: Array<MarkupCapture>
  readonly updatedMarkup: Array<MarkupCapture>
  settingsLookups: number
}

const newCaptures = (): Captures => ({
  created: [],
  updated: [],
  uploadedMarkup: [],
  updatedMarkup: [],
  settingsLookups: 0
})

const fixtureRef = <T extends Doc>(id: string) => toRef<T>(NonEmptyString.make(id))
const fixturePersonId = (id: string) => toCorePersonId(SocialIdentityId.make(id))

const makeFloor = (overrides?: FixtureOverrides<Floor>): Floor => ({
  _id: fixtureRef<Floor>("floor-1"),
  _class: love.class.Floor,
  space: core.space.Workspace,
  modifiedOn: 2,
  createdOn: 1,
  modifiedBy: fixturePersonId("user"),
  createdBy: fixturePersonId("user"),
  name: "Main",
  ...overrides
})

const makeRoom = (overrides?: FixtureOverrides<Room>): Room => ({
  _id: fixtureRef<Room>("room-1"),
  _class: love.class.Room,
  space: core.space.Workspace,
  modifiedOn: 2,
  createdOn: 1,
  modifiedBy: fixturePersonId("user"),
  createdBy: fixturePersonId("user"),
  name: "Focus",
  type: RoomType.Video,
  access: RoomAccess.Open,
  floor: fixtureRef<Floor>("floor-1"),
  width: 2,
  height: 1,
  x: 0,
  y: 0,
  language: "en",
  startWithRecording: false,
  startWithTranscription: false,
  description: null,
  ...overrides
})

const makeOffice = (overrides?: FixtureOverrides<Office>): Office => ({
  _id: fixtureRef<Office>("office-1"),
  _class: love.class.Office,
  space: core.space.Workspace,
  modifiedOn: 2,
  createdOn: 1,
  modifiedBy: fixturePersonId("user"),
  createdBy: fixturePersonId("user"),
  name: "",
  type: RoomType.Audio,
  access: RoomAccess.Knock,
  floor: fixtureRef<Floor>("floor-1"),
  width: 2,
  height: 1,
  x: 0,
  y: 0,
  language: "en",
  startWithRecording: false,
  startWithTranscription: false,
  description: null,
  person: null,
  ...overrides
})

const makeOfficeSettings = (overrides?: FixtureOverrides<OfficeSettings>): OfficeSettings => ({
  _id: fixtureRef<OfficeSettings>("office-settings"),
  _class: setting.class.OfficeSettings,
  space: core.space.Workspace,
  modifiedOn: 2,
  createdOn: 1,
  modifiedBy: fixturePersonId("user"),
  createdBy: fixturePersonId("user"),
  enabled: true,
  defaultStartWithTranscription: true,
  defaultStartWithRecording: true,
  ...overrides
})

const queryId = (query: { readonly _id?: unknown }): unknown => query._id

const makeLayer = (config?: {
  readonly floors?: ReadonlyArray<Floor>
  readonly rooms?: ReadonlyArray<Room>
  readonly settings?: OfficeSettings
  readonly captures?: Captures
}) => {
  const floors = config?.floors ?? [makeFloor()]
  const rooms = config?.rooms ?? []
  const settings = config?.settings
  const captures = config?.captures ?? newCaptures()

  const findAll: HulyClientOperations["findAll"] = <T extends Doc>(
    objectClass: Ref<Class<T>>,
    _query: DocumentQuery<T>
  ) => {
    if (objectClass === love.class.Floor) {
      return Effect.succeed(findResultForTestClass<T>(floors))
    }
    if (objectClass === love.class.Room) {
      return Effect.succeed(findResultForTestClass<T>(rooms))
    }
    return Effect.succeed(findResultForTestClass<T>([]))
  }

  const findOne: HulyClientOperations["findOne"] = <T extends Doc>(
    objectClass: Ref<Class<T>>,
    query: DocumentQuery<T>
  ) => {
    if (objectClass === setting.class.OfficeSettings) {
      captures.settingsLookups += 1
      return Effect.succeed(documentForTestClass<T>(settings))
    }
    if (objectClass === love.class.Room) {
      return Effect.succeed(documentForTestClass<T>(rooms.find((room) => room._id === queryId(query))))
    }
    return Effect.succeed(undefined)
  }

  const createDoc: HulyClientOperations["createDoc"] = <T extends Doc>(
    objectClass: Ref<Class<T>>,
    space: Ref<Space>,
    data: Data<T>,
    id?: Ref<T>
  ) => {
    captures.created.push({ objectClass, space, data, id })
    return Effect.succeed(id ?? fixtureRef<T>("generated"))
  }

  const updateDoc: HulyClientOperations["updateDoc"] = <T extends Doc>(
    objectClass: Ref<Class<T>>,
    space: Ref<Space>,
    id: Ref<T>,
    update: DocumentUpdate<T>
  ) => {
    captures.updated.push({ objectClass, space, id, update })
    return Effect.succeed({})
  }

  const uploadMarkup: HulyClientOperations["uploadMarkup"] = (_objectClass, id, _attribute, markup: string) => {
    captures.uploadedMarkup.push({ id, markup })
    return Effect.succeed(fixtureRef<Blob>("room-description"))
  }

  const updateMarkup: HulyClientOperations["updateMarkup"] = (_objectClass, id, _attribute, markup: string) => {
    captures.updatedMarkup.push({ id, markup })
    return Effect.void
  }

  return HulyClient.testLayer({ findAll, findOne, createDoc, updateDoc, uploadMarkup, updateMarkup })
}

const createFloorParams = (name: string) => Schema.decodeUnknownSync(CreateOfficeFloorParamsSchema)({ name })
const createRoomParams = (input: unknown) => Schema.decodeUnknownSync(CreateOfficeRoomParamsSchema)(input)
const updateRoomParams = (input: unknown) => Schema.decodeUnknownSync(UpdateOfficeRoomParamsSchema)(input)

describe("virtual-office administration operations", () => {
  it.effect("creates a native workspace Floor and returns its generated identity", () =>
    Effect.gen(function* () {
      const captures = newCaptures()
      const result = yield* createOfficeFloor(createFloorParams("Second floor")).pipe(
        Effect.provide(makeLayer({ captures }))
      )

      expect(result).toEqual({ floorId: captures.created[0]?.id, name: "Second floor" })
      expect(captures.created).toHaveLength(1)
      expect(captures.created[0]).toMatchObject({
        objectClass: love.class.Floor,
        space: core.space.Workspace,
        data: { name: "Second floor" }
      })
    })
  )

  it.effect("resolves a floor name, chooses free space, and inherits typed video defaults", () =>
    Effect.gen(function* () {
      const captures = newCaptures()
      const result = yield* createOfficeRoom(createRoomParams({ floor: "Main", kind: "video", name: "Planning" })).pipe(
        Effect.provide(makeLayer({ rooms: [makeRoom()], settings: makeOfficeSettings(), captures }))
      )

      expect(result).toMatchObject({
        floorId: "floor-1",
        kind: "video",
        name: "Planning",
        access: "open",
        position: { x: 3, y: 0, width: 2, height: 1 },
        language: "en",
        startWithTranscription: true,
        startWithRecording: true
      })
      expect(captures.settingsLookups).toBe(1)
      expect(captures.created[0]).toMatchObject({
        objectClass: love.class.Room,
        data: {
          name: "Planning",
          floor: "floor-1",
          type: RoomType.Video,
          access: RoomAccess.Open,
          x: 3,
          y: 0,
          width: 2,
          height: 1,
          language: "en",
          startWithTranscription: true,
          startWithRecording: true,
          description: null
        }
      })
    })
  )

  it.effect("derives native audio, reception, and personal-office defaults without loading video settings", () =>
    Effect.gen(function* () {
      const audioCaptures = newCaptures()
      const receptionCaptures = newCaptures()
      const officeCaptures = newCaptures()

      const audio = yield* createOfficeRoom(createRoomParams({ floor: "floor-1", kind: "audio", name: "Voice" })).pipe(
        Effect.provide(makeLayer({ captures: audioCaptures }))
      )
      const reception = yield* createOfficeRoom(
        createRoomParams({ floor: "floor-1", kind: "reception", name: "Welcome" })
      ).pipe(Effect.provide(makeLayer({ captures: receptionCaptures })))
      const office = yield* createOfficeRoom(createRoomParams({ floor: "floor-1", kind: "office" })).pipe(
        Effect.provide(makeLayer({ captures: officeCaptures }))
      )

      expect(audio).toMatchObject({ kind: "audio", access: "open", startWithTranscription: false })
      expect(audioCaptures.created[0]).toMatchObject({ data: { type: RoomType.Audio, access: RoomAccess.Open } })
      expect(reception).toMatchObject({ kind: "reception", access: "open", startWithRecording: false })
      expect(receptionCaptures.created[0]).toMatchObject({
        data: { type: RoomType.Reception, access: RoomAccess.Open }
      })
      expect(office).toMatchObject({ kind: "office", access: "knock" })
      expect(officeCaptures.created[0]).toMatchObject({
        objectClass: love.class.Office,
        data: { name: "", type: RoomType.Audio, access: RoomAccess.Knock, person: null }
      })
      expect(audioCaptures.settingsLookups + receptionCaptures.settingsLookups + officeCaptures.settingsLookups).toBe(0)
    })
  )

  it.effect("prioritizes exact floor IDs and reports missing or ambiguous names", () =>
    Effect.gen(function* () {
      const idFloor = makeFloor({ _id: fixtureRef<Floor>("Main"), name: "Other" })
      const duplicateOne = makeFloor({ _id: fixtureRef<Floor>("floor-2"), name: "Duplicate" })
      const duplicateTwo = makeFloor({ _id: fixtureRef<Floor>("floor-3"), name: "Duplicate" })
      const captures = newCaptures()

      const byId = yield* createOfficeRoom(createRoomParams({ floor: "Main", kind: "audio", name: "ID wins" })).pipe(
        Effect.provide(makeLayer({ floors: [idFloor, makeFloor()], captures }))
      )
      const missing = yield* Effect.flip(
        createOfficeRoom(createRoomParams({ floor: "Missing", kind: "audio", name: "Nope" })).pipe(
          Effect.provide(makeLayer({ floors: [] }))
        )
      )
      const ambiguous = yield* Effect.flip(
        createOfficeRoom(createRoomParams({ floor: "Duplicate", kind: "audio", name: "Nope" })).pipe(
          Effect.provide(makeLayer({ floors: [duplicateOne, duplicateTwo] }))
        )
      )

      expect(byId.floorId).toBe("Main")
      expect(missing._tag).toBe("OfficeFloorNotFoundError")
      expect(ambiguous).toMatchObject({ _tag: "OfficeFloorIdentifierAmbiguousError", matches: 2 })
    })
  )

  it.effect("updates only focused durable settings and uploads a new Markdown description", () =>
    Effect.gen(function* () {
      const captures = newCaptures()
      const result = yield* updateOfficeRoom(
        updateRoomParams({
          roomId: "room-1",
          name: "Renamed",
          description: "See **plan**",
          access: "dnd",
          startWithTranscription: true,
          startWithRecording: true
        })
      ).pipe(Effect.provide(makeLayer({ rooms: [makeRoom()], captures })))

      expect(result.updatedFields).toEqual([
        "name",
        "description",
        "access",
        "startWithTranscription",
        "startWithRecording"
      ])
      expect(captures.uploadedMarkup).toHaveLength(1)
      expect(captures.updatedMarkup).toHaveLength(0)
      expect(captures.updated[0]?.update).toEqual({
        name: "Renamed",
        access: RoomAccess.DND,
        startWithTranscription: true,
        startWithRecording: true,
        description: "room-description"
      })
      expect(captures.updated[0]?.update).not.toHaveProperty("floor")
      expect(captures.updated[0]?.update).not.toHaveProperty("person")
    })
  )

  it.effect("updates existing markup in place and clears descriptions without touching ACLs", () =>
    Effect.gen(function* () {
      const markupCaptures = newCaptures()
      const clearCaptures = newCaptures()
      const existing = makeRoom({ description: fixtureRef<Blob>("existing-description") })

      yield* updateOfficeRoom(updateRoomParams({ roomId: "room-1", description: "Replacement" })).pipe(
        Effect.provide(makeLayer({ rooms: [existing], captures: markupCaptures }))
      )
      yield* updateOfficeRoom(updateRoomParams({ roomId: "room-1", description: null })).pipe(
        Effect.provide(makeLayer({ rooms: [existing], captures: clearCaptures }))
      )

      expect(markupCaptures.updatedMarkup).toHaveLength(1)
      expect(markupCaptures.updated).toHaveLength(0)
      expect(clearCaptures.updated[0]?.update).toEqual({ description: null })
      expect(clearCaptures.updated[0]?.update).not.toHaveProperty("acl")
    })
  )

  it.effect("enforces personal-office access, protected reception naming, and room existence", () =>
    Effect.gen(function* () {
      const officeCaptures = newCaptures()
      const receptionCaptures = newCaptures()
      const missingCaptures = newCaptures()

      const officeError = yield* Effect.flip(
        updateOfficeRoom(updateRoomParams({ roomId: "office-1", access: "open" })).pipe(
          Effect.provide(makeLayer({ rooms: [makeOffice()], captures: officeCaptures }))
        )
      )
      const receptionError = yield* Effect.flip(
        updateOfficeRoom(updateRoomParams({ roomId: String(love.ids.Reception), name: "Changed" })).pipe(
          Effect.provide(makeLayer({ rooms: [makeRoom({ _id: love.ids.Reception })], captures: receptionCaptures }))
        )
      )
      const missingError = yield* Effect.flip(
        updateOfficeRoom(updateRoomParams({ roomId: "missing", access: "knock" })).pipe(
          Effect.provide(makeLayer({ captures: missingCaptures }))
        )
      )

      expect(officeError._tag).toBe("OfficeRoomAccessUnsupportedError")
      expect(receptionError._tag).toBe("OfficeRoomProtectedError")
      expect(missingError._tag).toBe("RoomNotFoundError")
      expect(officeCaptures.updated).toHaveLength(0)
      expect(receptionCaptures.updated).toHaveLength(0)
      expect(missingCaptures.updated).toHaveLength(0)
    })
  )

  it.effect("uses false video defaults when workspace settings or their optional values are absent", () =>
    Effect.gen(function* () {
      const missingCaptures = newCaptures()
      const missing = yield* createOfficeRoom(
        createRoomParams({ floor: "floor-1", kind: "video", name: "No settings" })
      ).pipe(Effect.provide(makeLayer({ captures: missingCaptures })))

      const settingsWithoutDefaults = sdkFixture<OfficeSettings>({
        _id: fixtureRef<OfficeSettings>("office-settings-without-defaults"),
        _class: setting.class.OfficeSettings,
        space: core.space.Workspace,
        modifiedOn: 2,
        createdOn: 1,
        modifiedBy: fixturePersonId("user"),
        createdBy: fixturePersonId("user"),
        enabled: true
      })
      const optionalCaptures = newCaptures()
      const optional = yield* createOfficeRoom(
        createRoomParams({ floor: "floor-1", kind: "video", name: "Optional defaults" })
      ).pipe(Effect.provide(makeLayer({ settings: settingsWithoutDefaults, captures: optionalCaptures })))

      expect(missing).toMatchObject({ startWithRecording: false, startWithTranscription: false })
      expect(optional).toMatchObject({ startWithRecording: false, startWithTranscription: false })
      expect(missingCaptures.settingsLookups).toBe(1)
      expect(optionalCaptures.settingsLookups).toBe(1)
    })
  )

  it.effect("rejects malformed workspace video defaults before creating a room", () =>
    Effect.gen(function* () {
      const captures = newCaptures()
      const malformedSettings = Object.assign(makeOfficeSettings(), { defaultStartWithRecording: "yes" })
      const error = yield* Effect.flip(
        createOfficeRoom(createRoomParams({ floor: "floor-1", kind: "video", name: "Invalid defaults" })).pipe(
          Effect.provide(makeLayer({ settings: malformedSettings, captures }))
        )
      )

      expect(error).toMatchObject({
        _tag: "OfficeSettingsMalformedError",
        reason: "recording and transcription defaults must be boolean values"
      })
      expect(captures.created).toEqual([])
    })
  )

  it.effect("updates a scalar room field without invoking description storage", () =>
    Effect.gen(function* () {
      const captures = newCaptures()
      const result = yield* updateOfficeRoom(updateRoomParams({ roomId: "room-1", name: "Quiet focus" })).pipe(
        Effect.provide(makeLayer({ rooms: [makeRoom()], captures }))
      )

      expect(result).toEqual({ roomId: "room-1", updatedFields: ["name"] })
      expect(captures.updated[0]?.update).toEqual({ name: "Quiet focus" })
      expect(captures.uploadedMarkup).toEqual([])
      expect(captures.updatedMarkup).toEqual([])
    })
  )
})
