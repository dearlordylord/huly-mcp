import {
  createOfficeFloorParamsJsonSchema,
  CreateOfficeFloorResultSchema,
  createOfficeRoomParamsJsonSchema,
  CreateOfficeRoomResultSchema,
  parseCreateOfficeFloorParams,
  parseCreateOfficeRoomParams,
  parseUpdateOfficeRoomParams,
  updateOfficeRoomParamsJsonSchema,
  UpdateOfficeRoomResultSchema
} from "../../domain/schemas/virtual-office-administration.js"
import {
  getMeetingMinutesParamsJsonSchema,
  GetMeetingMinutesResultSchema,
  getOfficeFloorParamsJsonSchema,
  GetOfficeFloorResultSchema,
  getOfficeParamsJsonSchema,
  GetOfficeResultSchema,
  getOfficeRoomParamsJsonSchema,
  GetOfficeRoomResultSchema,
  listActiveRoomInfoParamsJsonSchema,
  ListActiveRoomInfoResultSchema,
  listActiveRoomParticipantsParamsJsonSchema,
  ListActiveRoomParticipantsResultSchema,
  listDevicePreferencesParamsJsonSchema,
  ListDevicePreferencesResultSchema,
  listMeetingMinutesParamsJsonSchema,
  ListMeetingMinutesResultSchema,
  listOfficeDefaultsParamsJsonSchema,
  ListOfficeDefaultsResultSchema,
  listOfficeFloorsParamsJsonSchema,
  ListOfficeFloorsResultSchema,
  listOfficeRoomsParamsJsonSchema,
  ListOfficeRoomsResultSchema,
  listOfficesParamsJsonSchema,
  ListOfficesResultSchema,
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
  createOfficeFloor,
  createOfficeRoom,
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
  listOffices,
  updateOfficeRoom
} from "../../huly/operations/virtual-office.js"
import { defineTool, type RegisteredTool } from "./registry.js"

const CATEGORY = "virtual-office" as const

export const virtualOfficeTools = [
  defineTool(
    {
      name: "list_office_floors",
      description: "List virtual office floors.",
      category: CATEGORY,
      inputSchema: listOfficeFloorsParamsJsonSchema,
      resultSchema: ListOfficeFloorsResultSchema
    },
    parseListOfficeFloorsParams,
    listOfficeFloors
  ),
  defineTool(
    {
      name: "get_office_floor",
      description: "Get one virtual office floor by floorId.",
      category: CATEGORY,
      inputSchema: getOfficeFloorParamsJsonSchema,
      resultSchema: GetOfficeFloorResultSchema
    },
    parseGetOfficeFloorParams,
    getOfficeFloor
  ),
  defineTool(
    {
      name: "create_office_floor",
      description:
        "Create one durable virtual-office Floor with a nonblank name. Returns the generated floorId immediately. Floor rename and deletion are intentionally unavailable.",
      category: CATEGORY,
      inputSchema: createOfficeFloorParamsJsonSchema,
      resultSchema: CreateOfficeFloorResultSchema
    },
    parseCreateOfficeFloorParams,
    createOfficeFloor
  ),
  defineTool(
    {
      name: "list_office_rooms",
      description:
        "List virtual office rooms, including access mode, type, floor, floor-plan position/size, language, and recording/transcription defaults.",
      category: CATEGORY,
      inputSchema: listOfficeRoomsParamsJsonSchema,
      resultSchema: ListOfficeRoomsResultSchema
    },
    parseListOfficeRoomsParams,
    listOfficeRooms
  ),
  defineTool(
    {
      name: "get_office_room",
      description: "Get one virtual office room by roomId, including description when readable.",
      category: CATEGORY,
      inputSchema: getOfficeRoomParamsJsonSchema,
      resultSchema: GetOfficeRoomResultSchema
    },
    parseGetOfficeRoomParams,
    getOfficeRoom
  ),
  defineTool(
    {
      name: "create_office_room",
      description:
        "Create one durable video, audio, reception, or personal office on a Floor resolved from an exact ID or unambiguous exact name. Video/audio/reception require a nonblank name; office uses Huly's native empty name and person=null. Huly class, access, language, 2x1 free floor-plan position, and recording/transcription defaults are derived internally; video inherits workspace OfficeSettings while other kinds default both flags to false. This does not create participants or start recording/transcription.",
      category: CATEGORY,
      inputSchema: createOfficeRoomParamsJsonSchema,
      resultSchema: CreateOfficeRoomResultSchema
    },
    parseCreateOfficeRoomParams,
    createOfficeRoom
  ),
  defineTool(
    {
      name: "update_office_room",
      description:
        "Update one durable Room or Office by roomId. Accepts only name, Markdown description, access, startWithTranscription, and startWithRecording. Personal offices reject open access; Huly's protected Reception cannot be renamed. Floor, geometry, person assignment, language, ACLs, occupancy, and active provider state are preserved. Default flags affect future sessions and do not start or stop recording/transcription.",
      category: CATEGORY,
      inputSchema: updateOfficeRoomParamsJsonSchema,
      resultSchema: UpdateOfficeRoomResultSchema
    },
    parseUpdateOfficeRoomParams,
    updateOfficeRoom
  ),
  defineTool(
    {
      name: "list_offices",
      description: "List personal office rooms and their assigned people when readable.",
      category: CATEGORY,
      inputSchema: listOfficesParamsJsonSchema,
      resultSchema: ListOfficesResultSchema
    },
    parseListOfficesParams,
    listOffices
  ),
  defineTool(
    {
      name: "get_office",
      description: "Get one personal office room by roomId, including assigned person and description when readable.",
      category: CATEGORY,
      inputSchema: getOfficeParamsJsonSchema,
      resultSchema: GetOfficeResultSchema
    },
    parseGetOfficeParams,
    getOffice
  ),
  defineTool(
    {
      name: "list_active_room_info",
      description: "List transient active room occupancy summaries.",
      category: CATEGORY,
      inputSchema: listActiveRoomInfoParamsJsonSchema,
      resultSchema: ListActiveRoomInfoResultSchema
    },
    parseListActiveRoomInfoParams,
    listActiveRoomInfo
  ),
  defineTool(
    {
      name: "list_active_room_participants",
      description: "List transient active virtual-office participants and positions, optionally filtered by roomId.",
      category: CATEGORY,
      inputSchema: listActiveRoomParticipantsParamsJsonSchema,
      resultSchema: ListActiveRoomParticipantsResultSchema
    },
    parseListActiveRoomParticipantsParams,
    listActiveRoomParticipants
  ),
  defineTool(
    {
      name: "list_meeting_minutes",
      description:
        "List meeting notes/transcript records (minutes) by optional attachment target and created-on range.",
      category: CATEGORY,
      inputSchema: listMeetingMinutesParamsJsonSchema,
      resultSchema: ListMeetingMinutesResultSchema
    },
    parseListMeetingMinutesParams,
    listMeetingMinutes
  ),
  defineTool(
    {
      name: "get_meeting_minutes",
      description:
        "Get one meeting notes/transcript record (minutes) by meetingMinutesId, including description when readable.",
      category: CATEGORY,
      inputSchema: getMeetingMinutesParamsJsonSchema,
      resultSchema: GetMeetingMinutesResultSchema
    },
    parseGetMeetingMinutesParams,
    getMeetingMinutes
  ),
  defineTool(
    {
      name: "list_device_preferences",
      description: "List readable virtual-office media device preferences.",
      category: CATEGORY,
      inputSchema: listDevicePreferencesParamsJsonSchema,
      resultSchema: ListDevicePreferencesResultSchema
    },
    parseListDevicePreferencesParams,
    listDevicePreferences
  ),
  defineTool(
    {
      name: "list_office_defaults",
      description: "List room-level language, default recording, and default transcription settings.",
      category: CATEGORY,
      inputSchema: listOfficeDefaultsParamsJsonSchema,
      resultSchema: ListOfficeDefaultsResultSchema
    },
    parseListOfficeDefaultsParams,
    listOfficeDefaults
  )
] as const satisfies ReadonlyArray<RegisteredTool>
