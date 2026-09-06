import { Schema } from "effect"

import { toDraft07JsonSchema } from "./json-schema.js"
import {
  assertUpdateFields,
  atLeastOneUpdateFieldMessage,
  FloorId,
  hasAtLeastOneDefined,
  NonEmptyString,
  RoomId,
  RoomName,
  withAtLeastOneRequired
} from "./shared.js"
import { FloorName, RoomAccessSchema, RoomLanguageSchema, RoomSummarySchema } from "./virtual-office.js"

export const FloorIdentifier = NonEmptyString.pipe(Schema.brand("FloorIdentifier")).annotate({
  identifier: "FloorIdentifier",
  title: "FloorIdentifier",
  description: "Exact virtual-office floor ID or exact floor name. Names must resolve unambiguously."
})
export type FloorIdentifier = Schema.Schema.Type<typeof FloorIdentifier>

export const OfficeRoomKindValues = ["video", "audio", "reception", "office"] as const
export const OfficeRoomKindSchema = Schema.Literals(OfficeRoomKindValues).annotate({
  title: "OfficeRoomKind",
  description: "Room kind. Office creates the native Office class; all other values create the native Room class."
})
export type OfficeRoomKind = Schema.Schema.Type<typeof OfficeRoomKindSchema>

export const CreateOfficeFloorParamsSchema = Schema.Struct({
  name: FloorName.annotateKey({ description: "Nonblank floor name." })
}).annotate({ title: "CreateOfficeFloorParams", description: "Create one durable virtual-office floor." })
export type CreateOfficeFloorParams = Schema.Schema.Type<typeof CreateOfficeFloorParamsSchema>

const CreateNamedOfficeRoomParamsSchema = Schema.Struct({
  floor: FloorIdentifier.annotateKey({ description: "Exact floor ID or exact unambiguous floor name." }),
  kind: Schema.Literals(["video", "audio", "reception"]),
  name: RoomName.annotateKey({ description: "Nonblank room name." })
})

const CreatePersonalOfficeParamsSchema = Schema.Struct({
  floor: FloorIdentifier.annotateKey({ description: "Exact floor ID or exact unambiguous floor name." }),
  kind: Schema.Literal("office")
})

export const CreateOfficeRoomParamsSchema = Schema.Union([
  CreateNamedOfficeRoomParamsSchema,
  CreatePersonalOfficeParamsSchema
]).annotate({
  title: "CreateOfficeRoomParams",
  description:
    "Create a video, audio, reception, or personal office on a resolved floor. Named rooms require name; offices use the native empty name and server-owned person=null assignment."
})
export type CreateOfficeRoomParams = Schema.Schema.Type<typeof CreateOfficeRoomParamsSchema>

export const OfficeSettingsDefaultsSchema = Schema.Struct({
  defaultStartWithTranscription: Schema.optionalKey(Schema.Boolean),
  defaultStartWithRecording: Schema.optionalKey(Schema.Boolean)
}).annotate({
  title: "OfficeSettingsDefaults",
  description: "The optional boolean video defaults projected from native OfficeSettings data."
})
export type OfficeSettingsDefaults = Schema.Schema.Type<typeof OfficeSettingsDefaultsSchema>

export const UPDATE_OFFICE_ROOM_FIELDS = [
  "name",
  "description",
  "access",
  "startWithTranscription",
  "startWithRecording"
] as const

export const UpdateOfficeRoomParamsSchema = Schema.Struct({
  roomId: RoomId.annotateKey({ description: "Exact Room or Office ID." }),
  name: Schema.optionalKey(RoomName.annotateKey({ description: "New nonblank room name." })),
  description: Schema.optionalKey(
    Schema.NullOr(Schema.String).annotateKey({
      description: "Replacement Markdown description; null or blank clears it."
    })
  ),
  access: Schema.optionalKey(
    RoomAccessSchema.annotateKey({
      description: "Access mode. Offices accept knock or dnd; other rooms also accept open."
    })
  ),
  startWithTranscription: Schema.optionalKey(
    Schema.Boolean.annotateKey({ description: "Durable default for future room sessions only." })
  ),
  startWithRecording: Schema.optionalKey(
    Schema.Boolean.annotateKey({ description: "Durable default for future room sessions only." })
  )
})
  .pipe(
    Schema.check(
      Schema.makeFilter((params) =>
        hasAtLeastOneDefined(params, UPDATE_OFFICE_ROOM_FIELDS)
          ? undefined
          : atLeastOneUpdateFieldMessage(UPDATE_OFFICE_ROOM_FIELDS)
      )
    )
  )
  .annotate({
    title: "UpdateOfficeRoomParams",
    description:
      "Update only durable editable Room settings. Floor, geometry, person, language, active session state, and ACL fields are not accepted."
  })
export type UpdateOfficeRoomParams = Schema.Schema.Type<typeof UpdateOfficeRoomParamsSchema>
assertUpdateFields<UpdateOfficeRoomParams>()(["roomId"], UPDATE_OFFICE_ROOM_FIELDS)

export const CreateOfficeFloorResultSchema = Schema.Struct({ floorId: FloorId, name: FloorName }).annotate({
  title: "CreateOfficeFloorResult"
})
export type CreateOfficeFloorResult = Schema.Schema.Type<typeof CreateOfficeFloorResultSchema>

const CreateOfficeRoomResultFields = {
  roomId: RoomId,
  floorId: FloorId,
  access: RoomAccessSchema,
  position: RoomSummarySchema.fields.position,
  language: RoomLanguageSchema,
  startWithTranscription: Schema.Boolean,
  startWithRecording: Schema.Boolean
} as const

const CreateNamedOfficeRoomResultSchema = Schema.Struct({
  ...CreateOfficeRoomResultFields,
  kind: Schema.Literals(["video", "audio", "reception"]),
  name: RoomName
})

const CreatePersonalOfficeResultSchema = Schema.Struct({
  ...CreateOfficeRoomResultFields,
  kind: Schema.Literal("office"),
  name: Schema.optionalKey(Schema.Never)
})

export const CreateOfficeRoomResultSchema = Schema.Union([
  CreateNamedOfficeRoomResultSchema,
  CreatePersonalOfficeResultSchema
]).annotate({
  title: "CreateOfficeRoomResult",
  description: "Creation result. Named rooms always include name; personal offices never include name."
})
export type CreateOfficeRoomResult = Schema.Schema.Type<typeof CreateOfficeRoomResultSchema>

export const UpdateOfficeRoomResultSchema = Schema.Struct({
  roomId: RoomId,
  updatedFields: Schema.Array(Schema.Literals(UPDATE_OFFICE_ROOM_FIELDS))
}).annotate({ title: "UpdateOfficeRoomResult" })
export type UpdateOfficeRoomResult = Schema.Schema.Type<typeof UpdateOfficeRoomResultSchema>

export const createOfficeFloorParamsJsonSchema = toDraft07JsonSchema(CreateOfficeFloorParamsSchema)
export const createOfficeRoomParamsJsonSchema = toDraft07JsonSchema(CreateOfficeRoomParamsSchema)
export const updateOfficeRoomParamsJsonSchema = withAtLeastOneRequired(
  toDraft07JsonSchema(UpdateOfficeRoomParamsSchema),
  UPDATE_OFFICE_ROOM_FIELDS
)

export const parseCreateOfficeFloorParams = Schema.decodeUnknownEffect(CreateOfficeFloorParamsSchema, {
  onExcessProperty: "error"
})
export const parseCreateOfficeRoomParams = Schema.decodeUnknownEffect(CreateOfficeRoomParamsSchema, {
  onExcessProperty: "error"
})
export const parseUpdateOfficeRoomParams = Schema.decodeUnknownEffect(UpdateOfficeRoomParamsSchema, {
  onExcessProperty: "error"
})
