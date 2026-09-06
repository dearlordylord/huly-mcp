import { RoomAccess as HulyRoomAccess } from "@hcengineering/love"

import type { RoomAccess } from "../../domain/schemas/virtual-office.js"

const MCP_ROOM_ACCESS_BY_NATIVE = {
  [HulyRoomAccess.Open]: "open",
  [HulyRoomAccess.Knock]: "knock",
  [HulyRoomAccess.DND]: "dnd"
} as const satisfies Record<HulyRoomAccess, RoomAccess>

const NATIVE_ROOM_ACCESS_BY_MCP = {
  open: HulyRoomAccess.Open,
  knock: HulyRoomAccess.Knock,
  dnd: HulyRoomAccess.DND
} as const satisfies Record<RoomAccess, HulyRoomAccess>

export const nativeRoomAccessToMcp = (access: HulyRoomAccess): RoomAccess => MCP_ROOM_ACCESS_BY_NATIVE[access]

export const mcpRoomAccessToNative = (access: RoomAccess): HulyRoomAccess => NATIVE_ROOM_ACCESS_BY_MCP[access]
