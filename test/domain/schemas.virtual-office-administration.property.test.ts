import * as fc from "fast-check"
import { Result, Schema } from "effect"
import { describe, expect, it } from "vitest"

import {
  CreateOfficeRoomParamsSchema,
  UpdateOfficeRoomParamsSchema
} from "../../src/domain/schemas/virtual-office-administration.js"
import { propertyTestParameters } from "../helpers/property.js"

const nonBlankText = fc.string({ minLength: 1, maxLength: 32 }).filter((value) => value.trim().length > 0)

describe("virtual-office administration schema properties", () => {
  it("accepts generated updates exactly when at least one durable field is present", () => {
    fc.assert(
      fc.property(
        fc.record(
          {
            name: nonBlankText,
            description: fc.oneof(fc.string({ maxLength: 64 }), fc.constant(null)),
            access: fc.constantFrom("open", "knock", "dnd"),
            startWithTranscription: fc.boolean(),
            startWithRecording: fc.boolean()
          },
          { requiredKeys: [] }
        ),
        (update) => {
          const decoded = Schema.decodeUnknownResult(UpdateOfficeRoomParamsSchema)({ roomId: "room-1", ...update })
          expect(Result.isSuccess(decoded)).toBe(Object.keys(update).length > 0)
        }
      ),
      propertyTestParameters
    )
  })

  it("rejects every generated server-owned or transient room field", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          "floor",
          "x",
          "y",
          "width",
          "height",
          "person",
          "language",
          "acl",
          "participants",
          "provider",
          "session"
        ),
        fc.oneof(fc.integer(), nonBlankText, fc.boolean()),
        (field, value) => {
          const decoded = Schema.decodeUnknownResult(UpdateOfficeRoomParamsSchema, { onExcessProperty: "error" })({
            roomId: "room-1",
            name: "Allowed rename",
            [field]: value
          })
          expect(Result.isFailure(decoded)).toBe(true)
        }
      ),
      propertyTestParameters
    )
  })

  it("keeps personal-office creation distinct from named room creation", () => {
    fc.assert(
      fc.property(nonBlankText, nonBlankText, (floor, name) => {
        const namedRoom = Schema.decodeUnknownResult(CreateOfficeRoomParamsSchema)({ floor, kind: "video", name })
        const office = Schema.decodeUnknownResult(CreateOfficeRoomParamsSchema)({ floor, kind: "office" })
        const unnamedRoom = Schema.decodeUnknownResult(CreateOfficeRoomParamsSchema)({ floor, kind: "audio" })
        const namedOffice = Schema.decodeUnknownResult(CreateOfficeRoomParamsSchema, { onExcessProperty: "error" })({
          floor,
          kind: "office",
          name
        })

        expect(Result.isSuccess(namedRoom)).toBe(true)
        expect(Result.isSuccess(office)).toBe(true)
        expect(Result.isFailure(unnamedRoom)).toBe(true)
        expect(Result.isFailure(namedOffice)).toBe(true)
      }),
      propertyTestParameters
    )
  })
})
