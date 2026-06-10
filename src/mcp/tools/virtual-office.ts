import {
  getMeetingMinutesParamsJsonSchema,
  getOfficeFloorParamsJsonSchema,
  getOfficeParamsJsonSchema,
  getOfficeRoomParamsJsonSchema,
  listActiveRoomInfoParamsJsonSchema,
  listActiveRoomParticipantsParamsJsonSchema,
  listDevicePreferencesParamsJsonSchema,
  listMeetingMinutesParamsJsonSchema,
  listOfficeDefaultsParamsJsonSchema,
  listOfficeFloorsParamsJsonSchema,
  listOfficeRoomsParamsJsonSchema,
  listOfficesParamsJsonSchema,
  parseGetMeetingMinutesParams,
  parseGetOfficeFloorParams,
  parseGetOfficeParams,
  parseGetOfficeRoomParams,
  parseListActiveRoomInfoParams,
  parseListActiveRoomParticipantsParams,
  parseListDevicePreferencesParams,
  parseListMeetingMinutesParams,
  parseListOfficeDefaultsParams,
  parseListOfficeFloorsParams,
  parseListOfficeRoomsParams,
  parseListOfficesParams
} from "../../domain/schemas/virtual-office.js"
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
} from "../../huly/operations/virtual-office.js"
import { createToolHandler, type RegisteredTool } from "./registry.js"

const CATEGORY = "virtual-office" as const

export const virtualOfficeTools: ReadonlyArray<RegisteredTool> = [
  {
    name: "list_office_floors",
    description: "List virtual office floors.",
    category: CATEGORY,
    inputSchema: listOfficeFloorsParamsJsonSchema,
    handler: createToolHandler("list_office_floors", parseListOfficeFloorsParams, listOfficeFloors)
  },
  {
    name: "get_office_floor",
    description: "Get one virtual office floor by floorId.",
    category: CATEGORY,
    inputSchema: getOfficeFloorParamsJsonSchema,
    handler: createToolHandler("get_office_floor", parseGetOfficeFloorParams, getOfficeFloor)
  },
  {
    name: "list_office_rooms",
    description:
      "List virtual office rooms, including access mode, type, floor, floor-plan position/size, language, and recording/transcription defaults.",
    category: CATEGORY,
    inputSchema: listOfficeRoomsParamsJsonSchema,
    handler: createToolHandler("list_office_rooms", parseListOfficeRoomsParams, listOfficeRooms)
  },
  {
    name: "get_office_room",
    description: "Get one virtual office room by roomId, including description when readable.",
    category: CATEGORY,
    inputSchema: getOfficeRoomParamsJsonSchema,
    handler: createToolHandler("get_office_room", parseGetOfficeRoomParams, getOfficeRoom)
  },
  {
    name: "list_offices",
    description: "List personal office rooms and their assigned people when readable.",
    category: CATEGORY,
    inputSchema: listOfficesParamsJsonSchema,
    handler: createToolHandler("list_offices", parseListOfficesParams, listOffices)
  },
  {
    name: "get_office",
    description: "Get one personal office room by roomId, including assigned person and description when readable.",
    category: CATEGORY,
    inputSchema: getOfficeParamsJsonSchema,
    handler: createToolHandler("get_office", parseGetOfficeParams, getOffice)
  },
  {
    name: "list_active_room_info",
    description: "List transient active room occupancy summaries.",
    category: CATEGORY,
    inputSchema: listActiveRoomInfoParamsJsonSchema,
    handler: createToolHandler("list_active_room_info", parseListActiveRoomInfoParams, listActiveRoomInfo)
  },
  {
    name: "list_active_room_participants",
    description: "List transient active virtual-office participants and positions, optionally filtered by roomId.",
    category: CATEGORY,
    inputSchema: listActiveRoomParticipantsParamsJsonSchema,
    handler: createToolHandler(
      "list_active_room_participants",
      parseListActiveRoomParticipantsParams,
      listActiveRoomParticipants
    )
  },
  {
    name: "list_meeting_minutes",
    description: "List meeting notes/transcript records (minutes) by optional attachment target and created-on range.",
    category: CATEGORY,
    inputSchema: listMeetingMinutesParamsJsonSchema,
    handler: createToolHandler("list_meeting_minutes", parseListMeetingMinutesParams, listMeetingMinutes)
  },
  {
    name: "get_meeting_minutes",
    description:
      "Get one meeting notes/transcript record (minutes) by meetingMinutesId, including description when readable.",
    category: CATEGORY,
    inputSchema: getMeetingMinutesParamsJsonSchema,
    handler: createToolHandler("get_meeting_minutes", parseGetMeetingMinutesParams, getMeetingMinutes)
  },
  {
    name: "list_device_preferences",
    description: "List readable virtual-office media device preferences.",
    category: CATEGORY,
    inputSchema: listDevicePreferencesParamsJsonSchema,
    handler: createToolHandler("list_device_preferences", parseListDevicePreferencesParams, listDevicePreferences)
  },
  {
    name: "list_office_defaults",
    description: "List room-level language, default recording, and default transcription settings.",
    category: CATEGORY,
    inputSchema: listOfficeDefaultsParamsJsonSchema,
    handler: createToolHandler("list_office_defaults", parseListOfficeDefaultsParams, listOfficeDefaults)
  }
]
