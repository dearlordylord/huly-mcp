import type { RoomLanguage as HulyRoomLanguage } from "@hcengineering/love"
import { JSONSchema, Schema } from "effect"

import {
  AccountUuid,
  BlurRadius,
  Count,
  DEFAULT_LIMIT,
  DevicePreferenceId,
  DocId,
  EmptyParamsSchema,
  enumValuesDescription,
  FloorId,
  LimitParam,
  MeetingMinutesId,
  NonEmptyString,
  ParticipantInfoId,
  PersonId,
  PersonName,
  RoomId,
  RoomName,
  SessionId,
  Timestamp,
  Timestamp as TimestampType,
  VirtualOfficeCoordinate,
  VirtualOfficeDimension
} from "./shared.js"

export const FloorName = NonEmptyString.pipe(Schema.brand("FloorName")).annotations({
  identifier: "FloorName",
  title: "FloorName",
  description: "Non-empty virtual-office floor name."
})
export type FloorName = Schema.Schema.Type<typeof FloorName>

export const MeetingMinutesTitle = NonEmptyString.pipe(Schema.brand("MeetingMinutesTitle")).annotations({
  identifier: "MeetingMinutesTitle",
  title: "MeetingMinutesTitle",
  description: "Non-empty meeting-minutes title."
})
export type MeetingMinutesTitle = Schema.Schema.Type<typeof MeetingMinutesTitle>

// MCP-normalized labels for numeric @hcengineering/love RoomAccess values.
const RoomAccessValues = ["open", "knock", "dnd"] as const
export type RoomAccess = typeof RoomAccessValues[number]

// MCP-normalized labels for numeric @hcengineering/love RoomType values.
const RoomTypeValues = ["video", "audio", "reception"] as const
export type RoomType = typeof RoomTypeValues[number]

// MCP-normalized labels for numeric @hcengineering/love MeetingStatus values.
export type MeetingStatus = "active" | "finished"

const RoomLanguageValues = [
  "bg",
  "ca",
  "zh",
  "zh-TW",
  "zh-HK",
  "cs",
  "da",
  "nl",
  "en",
  "en-US",
  "en-AU",
  "en-GB",
  "en-NZ",
  "en-IN",
  "et",
  "fi",
  "nl-BE",
  "fr",
  "fr-CA",
  "de",
  "de-CH",
  "el",
  "hi",
  "hu",
  "id",
  "it",
  "ja",
  "ko",
  "lv",
  "lt",
  "ms",
  "no",
  "pl",
  "pt",
  "pt-BR",
  "pt-PT",
  "ro",
  "ru",
  "sk",
  "es",
  "es-419",
  "sv",
  "th",
  "tr",
  "uk",
  "vi"
] as const
type RoomLanguageValue = typeof RoomLanguageValues[number]
type ExactRoomLanguageValues = [HulyRoomLanguage] extends [RoomLanguageValue]
  ? [RoomLanguageValue] extends [HulyRoomLanguage] ? true : never
  : never
const exactRoomLanguageValues = <T extends true>(value: T): T => value
exactRoomLanguageValues<ExactRoomLanguageValues>(true)

export const RoomLanguageSchema = Schema.Literal(...RoomLanguageValues).annotations({
  title: "RoomLanguage",
  description: `Virtual office room language tag: ${enumValuesDescription(RoomLanguageValues)}`
})

export type RoomLanguage = Schema.Schema.Type<typeof RoomLanguageSchema>

export const RoomAccessSchema = Schema.Literal(...RoomAccessValues).annotations({
  title: "RoomAccess",
  description: `Virtual office room access mode: ${enumValuesDescription(RoomAccessValues)}`
})

export const RoomTypeSchema = Schema.Literal(...RoomTypeValues).annotations({
  title: "RoomType",
  description: `Virtual office room type: ${enumValuesDescription(RoomTypeValues)}`
})
export const FloorSummarySchema = Schema.Struct({
  floorId: FloorId,
  name: FloorName,
  modifiedOn: Schema.optional(TimestampType)
})
export type FloorSummary = Schema.Schema.Type<typeof FloorSummarySchema>
export const RoomSummarySchema = Schema.Struct({
  roomId: RoomId,
  name: Schema.optional(RoomName),
  type: RoomTypeSchema,
  access: RoomAccessSchema,
  floorId: FloorId,
  position: Schema.Struct({
    x: VirtualOfficeCoordinate,
    y: VirtualOfficeCoordinate,
    width: VirtualOfficeDimension,
    height: VirtualOfficeDimension
  }),
  language: RoomLanguageSchema,
  startWithTranscription: Schema.Boolean,
  startWithRecording: Schema.Boolean,
  meetings: Schema.optional(Count),
  messages: Schema.optional(Count),
  modifiedOn: Schema.optional(TimestampType)
})
export type RoomSummary = Schema.Schema.Type<typeof RoomSummarySchema>
export const RoomDetailsSchema = Schema.Struct({
  ...RoomSummarySchema.fields,
  description: Schema.optional(Schema.String)
})
export type RoomDetails = Schema.Schema.Type<typeof RoomDetailsSchema>
export const OfficeSummarySchema = Schema.Struct({
  ...RoomSummarySchema.fields,
  personId: Schema.optional(PersonId),
  personName: Schema.optional(PersonName)
})
export type OfficeSummary = Schema.Schema.Type<typeof OfficeSummarySchema>
export const OfficeDetailsSchema = Schema.Struct({
  ...RoomDetailsSchema.fields,
  personId: Schema.optional(PersonId),
  personName: Schema.optional(PersonName)
})
export type OfficeDetails = Schema.Schema.Type<typeof OfficeDetailsSchema>
export const ActiveRoomInfoSchema = Schema.Struct({
  roomId: RoomId,
  roomName: Schema.optional(RoomName),
  isOffice: Schema.Boolean,
  personIds: Schema.Array(PersonId)
})
export type ActiveRoomInfo = Schema.Schema.Type<typeof ActiveRoomInfoSchema>
export const ActiveParticipantInfoSchema = Schema.Struct({
  participantInfoId: ParticipantInfoId,
  name: PersonName,
  personId: PersonId,
  roomId: RoomId,
  roomName: Schema.optional(RoomName),
  x: VirtualOfficeCoordinate,
  y: VirtualOfficeCoordinate,
  sessionId: Schema.optional(SessionId),
  account: Schema.optional(AccountUuid)
})
export type ActiveParticipantInfo = Schema.Schema.Type<typeof ActiveParticipantInfoSchema>
export const MeetingMinutesSummarySchema = Schema.Struct({
  meetingMinutesId: MeetingMinutesId,
  title: MeetingMinutesTitle,
  attachedToId: DocId,
  status: Schema.Literal("active", "finished"),
  createdOn: Schema.optional(TimestampType),
  meetingEnd: Schema.optional(TimestampType),
  transcription: Schema.optional(Count),
  messages: Schema.optional(Count),
  attachments: Schema.optional(Count)
})
export type MeetingMinutesSummary = Schema.Schema.Type<typeof MeetingMinutesSummarySchema>
export const MeetingMinutesDetailsSchema = Schema.Struct({
  ...MeetingMinutesSummarySchema.fields,
  description: Schema.optional(Schema.String)
})
export type MeetingMinutesDetails = Schema.Schema.Type<typeof MeetingMinutesDetailsSchema>
export const DevicePreferenceSummarySchema = Schema.Struct({
  devicePreferenceId: DevicePreferenceId,
  micEnabled: Schema.Boolean,
  camEnabled: Schema.Boolean,
  noiseCancellation: Schema.Boolean,
  blurRadius: BlurRadius
})
export type DevicePreferenceSummary = Schema.Schema.Type<typeof DevicePreferenceSummarySchema>
export const OfficeDefaultsSummarySchema = Schema.Struct({
  roomId: RoomId,
  name: Schema.optional(RoomName),
  language: RoomLanguageSchema,
  startWithTranscription: Schema.Boolean,
  startWithRecording: Schema.Boolean
})
export type OfficeDefaultsSummary = Schema.Schema.Type<typeof OfficeDefaultsSummarySchema>

const ListOfficeFloorsParamsSchema = Schema.Struct({
  limit: Schema.optional(LimitParam.annotations({
    description: `Maximum number of floors to return (default: ${DEFAULT_LIMIT}).`
  }))
}).annotations({
  title: "ListOfficeFloorsParams",
  description: "List virtual office floors."
})
export type ListOfficeFloorsParams = Schema.Schema.Type<typeof ListOfficeFloorsParamsSchema>

const GetOfficeFloorParamsSchema = Schema.Struct({
  floorId: FloorId.annotations({
    description: "Virtual office floor ID."
  })
}).annotations({
  title: "GetOfficeFloorParams",
  description: "Get one virtual office floor by ID."
})
export type GetOfficeFloorParams = Schema.Schema.Type<typeof GetOfficeFloorParamsSchema>

export const ListOfficeRoomsParamsSchema = Schema.Struct({
  floorId: Schema.optional(FloorId.annotations({
    description: "Optional floor ID filter."
  })),
  limit: Schema.optional(LimitParam.annotations({
    description: `Maximum number of rooms to return (default: ${DEFAULT_LIMIT}).`
  }))
}).annotations({
  title: "ListOfficeRoomsParams",
  description: "List virtual office rooms."
})
export type ListOfficeRoomsParams = Schema.Schema.Type<typeof ListOfficeRoomsParamsSchema>

export const GetOfficeRoomParamsSchema = Schema.Struct({
  roomId: RoomId.annotations({
    description: "Virtual office room ID."
  })
}).annotations({
  title: "GetOfficeRoomParams",
  description: "Get one virtual office room by ID."
})
export type GetOfficeRoomParams = Schema.Schema.Type<typeof GetOfficeRoomParamsSchema>

const ListOfficesParamsSchema = ListOfficeRoomsParamsSchema.annotations({
  title: "ListOfficesParams",
  description: "List personal office rooms."
})
export type ListOfficesParams = Schema.Schema.Type<typeof ListOfficesParamsSchema>

const GetOfficeParamsSchema = GetOfficeRoomParamsSchema.annotations({
  title: "GetOfficeParams",
  description: "Get one personal office room by ID."
})
export type GetOfficeParams = Schema.Schema.Type<typeof GetOfficeParamsSchema>

const ListActiveRoomInfoParamsSchema = EmptyParamsSchema.annotations({
  title: "ListActiveRoomInfoParams",
  description: "List active transient room occupancy summaries."
})
export type ListActiveRoomInfoParams = Schema.Schema.Type<typeof ListActiveRoomInfoParamsSchema>

export const ListActiveRoomParticipantsParamsSchema = Schema.Struct({
  roomId: Schema.optional(RoomId.annotations({
    description: "Optional room ID filter."
  }))
}).annotations({
  title: "ListActiveRoomParticipantsParams",
  description: "List active transient participant positions in virtual office rooms."
})
export type ListActiveRoomParticipantsParams = Schema.Schema.Type<typeof ListActiveRoomParticipantsParamsSchema>

export const ListMeetingMinutesParamsSchema = Schema.Struct({
  attachedToId: Schema.optional(DocId.annotations({
    description:
      "Optional room or meeting document ID that the meeting notes/transcript record (minutes) is attached to."
  })),
  from: Schema.optional(Timestamp.annotations({
    description: "Created-on lower bound timestamp."
  })),
  to: Schema.optional(Timestamp.annotations({
    description: "Created-on upper bound timestamp."
  })),
  limit: Schema.optional(LimitParam.annotations({
    description: `Maximum number of meeting notes/transcript records (minutes) to return (default: ${DEFAULT_LIMIT}).`
  }))
}).annotations({
  title: "ListMeetingMinutesParams",
  description: "List meeting notes/transcript records (minutes)."
})
export type ListMeetingMinutesParams = Schema.Schema.Type<typeof ListMeetingMinutesParamsSchema>

export const GetMeetingMinutesParamsSchema = Schema.Struct({
  meetingMinutesId: MeetingMinutesId.annotations({
    description: "Meeting notes/transcript record ID (meeting minutes ID)."
  })
}).annotations({
  title: "GetMeetingMinutesParams",
  description: "Get one meeting notes/transcript record (minutes) by ID."
})
export type GetMeetingMinutesParams = Schema.Schema.Type<typeof GetMeetingMinutesParamsSchema>

const ListDevicePreferencesParamsSchema = EmptyParamsSchema.annotations({
  title: "ListDevicePreferencesParams",
  description: "List readable virtual office media device preferences."
})
export type ListDevicePreferencesParams = Schema.Schema.Type<typeof ListDevicePreferencesParamsSchema>

const ListOfficeDefaultsParamsSchema = EmptyParamsSchema.annotations({
  title: "ListOfficeDefaultsParams",
  description: "List room-level recording/transcription/language defaults."
})
export type ListOfficeDefaultsParams = Schema.Schema.Type<typeof ListOfficeDefaultsParamsSchema>

export const listOfficeFloorsParamsJsonSchema = JSONSchema.make(ListOfficeFloorsParamsSchema)
export const getOfficeFloorParamsJsonSchema = JSONSchema.make(GetOfficeFloorParamsSchema)
export const listOfficeRoomsParamsJsonSchema = JSONSchema.make(ListOfficeRoomsParamsSchema)
export const getOfficeRoomParamsJsonSchema = JSONSchema.make(GetOfficeRoomParamsSchema)
export const listOfficesParamsJsonSchema = JSONSchema.make(ListOfficesParamsSchema)
export const getOfficeParamsJsonSchema = JSONSchema.make(GetOfficeParamsSchema)
export const listActiveRoomInfoParamsJsonSchema = JSONSchema.make(ListActiveRoomInfoParamsSchema)
export const listActiveRoomParticipantsParamsJsonSchema = JSONSchema.make(ListActiveRoomParticipantsParamsSchema)
export const listMeetingMinutesParamsJsonSchema = JSONSchema.make(ListMeetingMinutesParamsSchema)
export const getMeetingMinutesParamsJsonSchema = JSONSchema.make(GetMeetingMinutesParamsSchema)
export const listDevicePreferencesParamsJsonSchema = JSONSchema.make(ListDevicePreferencesParamsSchema)
export const listOfficeDefaultsParamsJsonSchema = JSONSchema.make(ListOfficeDefaultsParamsSchema)

export const parseListOfficeFloorsParams = Schema.decodeUnknown(ListOfficeFloorsParamsSchema)
export const parseGetOfficeFloorParams = Schema.decodeUnknown(GetOfficeFloorParamsSchema)
export const parseListOfficeRoomsParams = Schema.decodeUnknown(ListOfficeRoomsParamsSchema)
export const parseGetOfficeRoomParams = Schema.decodeUnknown(GetOfficeRoomParamsSchema)
export const parseListOfficesParams = Schema.decodeUnknown(ListOfficesParamsSchema)
export const parseGetOfficeParams = Schema.decodeUnknown(GetOfficeParamsSchema)
export const parseListActiveRoomInfoParams = Schema.decodeUnknown(ListActiveRoomInfoParamsSchema)
export const parseListActiveRoomParticipantsParams = Schema.decodeUnknown(ListActiveRoomParticipantsParamsSchema)
export const parseListMeetingMinutesParams = Schema.decodeUnknown(ListMeetingMinutesParamsSchema)
export const parseGetMeetingMinutesParams = Schema.decodeUnknown(GetMeetingMinutesParamsSchema)
export const parseListDevicePreferencesParams = Schema.decodeUnknown(ListDevicePreferencesParamsSchema)
export const parseListOfficeDefaultsParams = Schema.decodeUnknown(ListOfficeDefaultsParamsSchema)

export const ListOfficeFloorsResultSchema = Schema.Array(FloorSummarySchema)
export const GetOfficeFloorResultSchema = FloorSummarySchema
export const ListOfficeRoomsResultSchema = Schema.Array(RoomSummarySchema)
export const GetOfficeRoomResultSchema = RoomDetailsSchema
export const ListOfficesResultSchema = Schema.Array(OfficeSummarySchema)
export const GetOfficeResultSchema = OfficeDetailsSchema
export const ListActiveRoomInfoResultSchema = Schema.Array(ActiveRoomInfoSchema)
export const ListActiveRoomParticipantsResultSchema = Schema.Array(ActiveParticipantInfoSchema)
export const ListMeetingMinutesResultSchema = Schema.Array(MeetingMinutesSummarySchema)
export const GetMeetingMinutesResultSchema = MeetingMinutesDetailsSchema
export const ListDevicePreferencesResultSchema = Schema.Array(DevicePreferenceSummarySchema)
export const ListOfficeDefaultsResultSchema = Schema.Array(OfficeDefaultsSummarySchema)
