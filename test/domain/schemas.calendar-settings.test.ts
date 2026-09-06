import { Ajv } from "ajv"
import { Result, Schema } from "effect"
import { describe, expect, it } from "vitest"

import {
  ListCalendarSettingsParamsSchema,
  UpdateCalendarSettingsParamsSchema,
  listCalendarSettingsParamsJsonSchema,
  setPrimaryCalendarParamsJsonSchema,
  updateCalendarSettingsParamsJsonSchema,
  SetPrimaryCalendarParamsSchema
} from "../../src/domain/schemas/calendar-settings.js"

const ajv = new Ajv({ strict: false })

const parserAndJsonSchemaAgree = <S extends Schema.ConstraintDecoder<unknown>>(
  schema: S,
  jsonSchema: object,
  inputs: ReadonlyArray<unknown>
) => {
  const validate = ajv.compile(jsonSchema)
  for (const input of inputs) {
    const runtimeAccepts = Result.isSuccess(Schema.decodeUnknownResult(schema, { onExcessProperty: "error" })(input))
    expect(validate(input), JSON.stringify(input)).toBe(runtimeAccepts)
  }
}

describe("calendar settings schemas", () => {
  it("uses the normalized strict empty object for list settings", () => {
    expect(listCalendarSettingsParamsJsonSchema).toEqual({
      $schema: "http://json-schema.org/draft-07/schema#",
      type: "object",
      properties: {},
      additionalProperties: false
    })
    parserAndJsonSchemaAgree(ListCalendarSettingsParamsSchema, listCalendarSettingsParamsJsonSchema, [
      {},
      { extra: true }
    ])
  })

  it("keeps ID/name target cardinality aligned between JSON and runtime schemas", () => {
    parserAndJsonSchemaAgree(SetPrimaryCalendarParamsSchema, setPrimaryCalendarParamsJsonSchema, [
      {},
      { calendarId: "calendar-1" },
      { calendarName: "Personal" },
      { calendarId: "calendar-1", calendarName: "Personal" },
      { calendarId: "calendar-1", extra: true }
    ])
  })

  it("keeps update-field requirements aligned between JSON and runtime schemas", () => {
    parserAndJsonSchemaAgree(UpdateCalendarSettingsParamsSchema, updateCalendarSettingsParamsJsonSchema, [
      { calendarId: "calendar-1" },
      { calendarId: "calendar-1", visibility: "private" },
      { calendarId: "calendar-1", hidden: false },
      { calendarName: "Personal", visibility: "public", hidden: true },
      { calendarId: "calendar-1", calendarName: "Personal", hidden: false },
      { calendarName: "Personal", providerDefault: true }
    ])
  })
})
