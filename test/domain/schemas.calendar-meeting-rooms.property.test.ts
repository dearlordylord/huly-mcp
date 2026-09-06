import * as fc from "fast-check"
import { Result, Schema } from "effect"
import { describe, expect, it } from "vitest"

import {
  MeetingCompositionRecoverySchema,
  MeetingRoomLocatorSchema
} from "../../src/domain/schemas/calendar-meeting-rooms.js"
import { CreateScheduleParamsSchema, UpdateScheduleParamsSchema } from "../../src/domain/schemas/calendar-schedules.js"
import { CreateEventParamsSchema, UpdateEventParamsSchema } from "../../src/domain/schemas/calendar.js"
import { assertDecodeSuccess, assertEncodeSuccess, propertyTestParameters } from "../helpers/property.js"

const nonBlankText = fc.string({ minLength: 1, maxLength: 32 }).filter((value) => value.trim().length > 0)
const locatorArbitrary = fc.record(
  { room: nonBlankText, floor: fc.option(nonBlankText, { nil: undefined }) },
  { requiredKeys: ["room"] }
)

describe("calendar meeting-room schema properties", () => {
  it("trims and round-trips generated room locators", () => {
    fc.assert(
      fc.property(locatorArbitrary, (locator) => {
        const input = {
          room: ` ${locator.room} `,
          ...(locator.floor === undefined ? {} : { floor: ` ${locator.floor} ` })
        }
        const decoded = assertDecodeSuccess(MeetingRoomLocatorSchema, input)

        expect(decoded).toEqual({
          room: locator.room.trim(),
          ...(locator.floor === undefined ? {} : { floor: locator.floor.trim() })
        })
        expect(assertEncodeSuccess(MeetingRoomLocatorSchema, decoded)).toEqual(decoded)
      }),
      propertyTestParameters
    )
  })

  it("accepts the same generated locator at all four Event and Schedule write boundaries", () => {
    fc.assert(
      fc.property(locatorArbitrary, (meetingRoom) => {
        const normalizedMeetingRoom = {
          room: meetingRoom.room,
          ...(meetingRoom.floor === undefined ? {} : { floor: meetingRoom.floor })
        }
        const inputs = [
          [CreateEventParamsSchema, { title: "Planning", date: 1, meetingRoom: normalizedMeetingRoom }],
          [UpdateEventParamsSchema, { eventId: "event-1", meetingRoom: normalizedMeetingRoom }],
          [
            CreateScheduleParamsSchema,
            {
              title: "Office hours",
              meetingDuration: 30,
              meetingInterval: 0,
              availability: {},
              timeZone: "UTC",
              meetingRoom: normalizedMeetingRoom
            }
          ],
          [UpdateScheduleParamsSchema, { scheduleId: "schedule-1", meetingRoom: normalizedMeetingRoom }]
        ] as const

        for (const [schema, input] of inputs) {
          expect(Result.isSuccess(Schema.decodeUnknownResult(schema)(input))).toBe(true)
        }
      }),
      propertyTestParameters
    )
  })

  it("rejects null, blank, and generated excess room-locator fields", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 24 }), (value) => {
        const invalidLocators = [null, { room: "   " }, { room: "Focus", unsupported: value }]
        for (const locator of invalidLocators) {
          const decoded = Schema.decodeUnknownResult(MeetingRoomLocatorSchema, { onExcessProperty: "error" })(locator)
          expect(Result.isFailure(decoded)).toBe(true)
        }
      }),
      propertyTestParameters
    )
  })

  it("round-trips generated nonempty residual recovery states", () => {
    fc.assert(
      fc.property(nonBlankText, nonBlankText, (documentId, roomId) => {
        const record = assertDecodeSuccess(MeetingCompositionRecoverySchema, {
          _tag: "Unconfirmed",
          residuals: [{ _tag: "RoomAssignment", target: "event", documentId, expectedRoomId: roomId }]
        })
        expect(assertEncodeSuccess(MeetingCompositionRecoverySchema, record)).toEqual(record)
      }),
      propertyTestParameters
    )
  })
})
