import type { RoomLanguage as HulyRoomLanguage } from "@hcengineering/love"
import { JSONSchema, Schema } from "effect"

import type {
  AccountUuid,
  BlurRadius,
  Count,
  DevicePreferenceId,
  ParticipantInfoId,
  PersonId,
  PersonName,
  RoomName,
  SessionId,
  Timestamp as TimestampType,
  VirtualOfficeCoordinate,
  VirtualOfficeDimension
} from "./shared.js"
import {
  DocId,
  EmptyParamsSchema,
  enumValuesDescription,
  FloorId,
  LimitParam,
  MeetingMinutesId,
  NonEmptyString,
  RoomId,
  Timestamp
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

export interface FloorSummary {
  readonly floorId: FloorId
  readonly name: FloorName
  readonly modifiedOn?: TimestampType | undefined
}

export interface RoomSummary {
  readonly roomId: RoomId
  readonly name?: RoomName | undefined
  readonly type: RoomType
  readonly access: RoomAccess
  readonly floorId: FloorId
  readonly position: {
    readonly x: VirtualOfficeCoordinate
    readonly y: VirtualOfficeCoordinate
    readonly width: VirtualOfficeDimension
    readonly height: VirtualOfficeDimension
  }
  readonly language: RoomLanguage
  /** Durable room defaults, not live recording/transcription state. */
  readonly startWithTranscription: boolean
  readonly startWithRecording: boolean
  readonly meetings?: Count | undefined
  readonly messages?: Count | undefined
  readonly modifiedOn?: TimestampType | undefined
}

export interface RoomDetails extends RoomSummary {
  readonly description?: string | undefined
}

export interface OfficeSummary extends RoomSummary {
  readonly personId?: PersonId | undefined
  readonly personName?: PersonName | undefined
}

export interface ActiveRoomInfo {
  readonly roomId: RoomId
  readonly roomName?: RoomName | undefined
  readonly isOffice: boolean
  readonly personIds: ReadonlyArray<PersonId>
}

export interface ActiveParticipantInfo {
  readonly participantInfoId: ParticipantInfoId
  readonly name: PersonName
  readonly personId: PersonId
  readonly roomId: RoomId
  readonly roomName?: RoomName | undefined
  readonly x: VirtualOfficeCoordinate
  readonly y: VirtualOfficeCoordinate
  readonly sessionId?: SessionId | undefined
  readonly account?: AccountUuid | undefined
}

export interface MeetingMinutesSummary {
  readonly meetingMinutesId: MeetingMinutesId
  readonly title: MeetingMinutesTitle
  readonly attachedToId: DocId
  readonly status: MeetingStatus
  readonly createdOn?: TimestampType | undefined
  readonly meetingEnd?: TimestampType | undefined
  readonly transcription?: Count | undefined
  readonly messages?: Count | undefined
  readonly attachments?: Count | undefined
}

export interface MeetingMinutesDetails extends MeetingMinutesSummary {
  readonly description?: string | undefined
}

export interface DevicePreferenceSummary {
  readonly devicePreferenceId: DevicePreferenceId
  readonly micEnabled: boolean
  readonly camEnabled: boolean
  readonly noiseCancellation: boolean
  readonly blurRadius: BlurRadius
}

export interface OfficeDefaultsSummary {
  readonly roomId: RoomId
  readonly name?: RoomName | undefined
  readonly language: RoomLanguage
  readonly startWithTranscription: boolean
  readonly startWithRecording: boolean
}

const ListOfficeFloorsParamsSchema = Schema.Struct({
  limit: Schema.optional(LimitParam.annotations({
    description: "Maximum number of floors to return (default: 50)."
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
    description: "Maximum number of rooms to return (default: 50)."
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
    description: "Maximum number of meeting notes/transcript records (minutes) to return (default: 50)."
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
