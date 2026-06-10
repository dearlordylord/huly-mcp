import type { Event as HulyEvent } from "@hcengineering/calendar"
import type { Meeting as HulyMeeting, Room as HulyRoom } from "@hcengineering/love"
import { Effect } from "effect"

import type { RoomReference } from "../../domain/schemas/calendar.js"
import { RoomId, RoomName } from "../../domain/schemas/shared.js"
import type { HulyClient, HulyClientError } from "../client.js"
import { love } from "../huly-plugins.js"
import { hulyQuery } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"

const optionalRoomName = (value: string | undefined): RoomName | undefined => {
  const trimmed = value?.trim() ?? ""
  return trimmed === "" ? undefined : RoomName.make(trimmed)
}

const roomReference = (
  roomId: HulyMeeting["room"],
  rooms: ReadonlyMap<HulyMeeting["room"], HulyRoom>
): RoomReference => ({
  roomId: RoomId.make(roomId),
  name: optionalRoomName(rooms.get(roomId)?.name)
})

export const lookupEventRooms = (
  client: HulyClient["Type"],
  events: ReadonlyArray<HulyEvent>
): Effect.Effect<ReadonlyMap<string, RoomReference>, HulyClientError> =>
  Effect.gen(function*() {
    const eventIds = events.map((event) => toRef<HulyMeeting>(event._id))
    if (eventIds.length === 0) return new Map()

    const meetings = yield* client.findAll<HulyMeeting>(
      love.mixin.Meeting,
      hulyQuery<HulyMeeting>({ _id: { $in: eventIds } })
    )
    const roomIds = [...new Set(meetings.map((meeting) => meeting.room))]
    if (roomIds.length === 0) return new Map()

    const rooms = yield* client.findAll<HulyRoom>(
      love.class.Room,
      hulyQuery<HulyRoom>({ _id: { $in: roomIds } })
    )
    const roomsById = new Map(rooms.map((room) => [room._id, room]))
    return new Map(meetings.map((meeting) => [String(meeting._id), roomReference(meeting.room, roomsById)]))
  })
