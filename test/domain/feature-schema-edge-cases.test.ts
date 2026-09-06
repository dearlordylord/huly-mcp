import { Result, Schema } from "effect"
import { describe, expect, it } from "vitest"

import { UpdateCalendarSettingsParamsSchema } from "../../src/domain/schemas/calendar-settings.js"
import {
  AddLeadAttachmentParamsSchema,
  UpdateLeadAttachmentParamsSchema
} from "../../src/domain/schemas/lead-collaboration.js"
import { UpdateOfficeRoomParamsSchema } from "../../src/domain/schemas/virtual-office-administration.js"

const decodeResult = <S extends Schema.ConstraintDecoder<unknown>>(schema: S, input: unknown) =>
  Schema.decodeUnknownResult(schema, { onExcessProperty: "error" })(input)

describe("feature schema edge cases", () => {
  it("accepts exactly one lead attachment source", () => {
    const result = decodeResult(AddLeadAttachmentParamsSchema, {
      funnel: "Sales",
      identifier: "LEAD-1",
      filename: "brief.txt",
      contentType: "text/plain",
      data: "SGVsbG8="
    })

    expect(Result.isSuccess(result)).toBe(true)
  })

  it("rejects lead attachment updates without description or pinned", () => {
    const result = decodeResult(UpdateLeadAttachmentParamsSchema, {
      funnel: "Sales",
      identifier: "LEAD-1",
      attachmentId: "attachment-1"
    })

    expect(Result.isFailure(result)).toBe(true)
  })

  it("rejects calendar-name settings updates without a changed setting", () => {
    const result = decodeResult(UpdateCalendarSettingsParamsSchema, { calendarName: "Personal" })

    expect(Result.isFailure(result)).toBe(true)
  })

  it("rejects office-room updates without a durable editable field", () => {
    const result = decodeResult(UpdateOfficeRoomParamsSchema, { roomId: "room-1" })

    expect(Result.isFailure(result)).toBe(true)
  })
})
