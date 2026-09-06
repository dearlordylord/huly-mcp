import type { Event as HulyEvent } from "@hcengineering/calendar"
import type { Doc, Ref } from "@hcengineering/core"
import type { Meeting as HulyMeeting, Room as HulyRoom } from "@hcengineering/love"
import { Effect } from "effect"

import type { RoomReference } from "../../domain/schemas/calendar.js"
import { CalendarMeetingRoomMetadataDegradedWarningCode } from "../../domain/schemas/tool-warnings.js"
import { RoomId, RoomName } from "../../domain/schemas/shared.js"
import type { HulyClient, HulyClientError } from "../client.js"
import { Diagnostics } from "../diagnostics.js"
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
): RoomReference => {
  const name = optionalRoomName(rooms.get(roomId)?.name)
  return { roomId: RoomId.make(roomId), ...(name === undefined ? {} : { name }) }
}

interface MeetingRoomAssociation extends Doc {
  readonly room: Ref<HulyRoom>
}

export const lookupMeetingRoomReferences = Effect.fn("CalendarMeeting.lookupRoomReferences")(function* (
  client: HulyClient["Service"],
  associations: ReadonlyArray<MeetingRoomAssociation>
): Effect.fn.Return<ReadonlyMap<string, RoomReference>, HulyClientError, Diagnostics> {
  const roomIds = [...new Set(associations.map((association) => association.room))]
  if (roomIds.length === 0) return new Map()

  const rooms = yield* client.findAll<HulyRoom>(love.class.Room, hulyQuery<HulyRoom>({ _id: { $in: roomIds } }))
  const roomsById = new Map(rooms.map((room) => [room._id, room]))
  const missingRooms = roomIds.filter((roomId) => !roomsById.has(roomId)).length
  const blankNames = roomIds.filter((roomId) => roomsById.get(roomId)?.name.trim() === "").length
  if (missingRooms > 0 || blankNames > 0) {
    const diagnostics = yield* Diagnostics
    yield* diagnostics.warnAgent({
      code: CalendarMeetingRoomMetadataDegradedWarningCode,
      message:
        `Calendar meeting-room metadata was partially resolved: ${missingRooms} referenced room(s) were unavailable, ` +
        `${blankNames} room name(s) were blank.`
    })
  }
  return new Map(
    associations.map((association) => [String(association._id), roomReference(association.room, roomsById)])
  )
})

export const lookupEventRooms = (
  client: HulyClient["Service"],
  events: ReadonlyArray<HulyEvent>
): Effect.Effect<ReadonlyMap<string, RoomReference>, HulyClientError, Diagnostics> =>
  Effect.gen(function* () {
    const eventIds = events.map((event) => toRef<HulyMeeting>(event._id))
    if (eventIds.length === 0) return new Map()

    const meetings = yield* client.findAll<HulyMeeting>(
      love.mixin.Meeting,
      hulyQuery<HulyMeeting>({ _id: { $in: eventIds } })
    )
    return yield* lookupMeetingRoomReferences(client, meetings)
  })
