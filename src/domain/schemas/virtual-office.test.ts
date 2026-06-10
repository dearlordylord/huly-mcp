import { Either, Schema } from "effect"
import { describe, expect, it } from "vitest"

import {
  GetMeetingMinutesParamsSchema,
  GetOfficeRoomParamsSchema,
  ListActiveRoomParticipantsParamsSchema,
  ListMeetingMinutesParamsSchema,
  ListOfficeRoomsParamsSchema,
  RoomAccessSchema,
  RoomTypeSchema
} from "./virtual-office.js"

describe("Virtual office schemas", () => {
  it("accepts stable room enum strings", () => {
    expect(Either.isRight(Schema.decodeUnknownEither(RoomAccessSchema)("open"))).toBe(true)
    expect(Either.isRight(Schema.decodeUnknownEither(RoomTypeSchema)("video"))).toBe(true)
  })

  it("accepts room and active participant list filters", () => {
    expect(Either.isRight(Schema.decodeUnknownEither(ListOfficeRoomsParamsSchema)({ floorId: "floor-1" }))).toBe(true)
    expect(Either.isRight(Schema.decodeUnknownEither(GetOfficeRoomParamsSchema)({ roomId: "room-1" }))).toBe(true)
    expect(Either.isRight(Schema.decodeUnknownEither(ListActiveRoomParticipantsParamsSchema)({ roomId: "room-1" })))
      .toBe(true)
  })

  it("accepts meeting minutes filters and get params", () => {
    expect(Either.isRight(
      Schema.decodeUnknownEither(ListMeetingMinutesParamsSchema)({
        attachedToId: "room-1",
        from: 100,
        to: 200
      })
    )).toBe(true)
    expect(Either.isRight(
      Schema.decodeUnknownEither(GetMeetingMinutesParamsSchema)({
        meetingMinutesId: "minutes-1"
      })
    )).toBe(true)
  })
})
