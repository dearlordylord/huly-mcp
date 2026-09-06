import * as fc from "fast-check"
import { Result, Schema } from "effect"
import { describe, expect, it } from "vitest"

import {
  CalendarSettingsSummarySchema,
  SetPrimaryCalendarParamsSchema,
  UpdateCalendarSettingsParamsSchema
} from "../../src/domain/schemas/calendar-settings.js"
import { assertDecodeSuccess, assertEncodeSuccess, propertyTestParameters } from "../helpers/property.js"

const nonBlankText = fc.string({ minLength: 1, maxLength: 32 }).filter((value) => value.trim().length > 0)
const visibility = fc.constantFrom("public", "freeBusy", "private")
const access = fc.constantFrom("freeBusyReader", "reader", "writer", "owner")
const kind = fc.constantFrom("internal", "external")

describe("calendar settings schema properties", () => {
  it("accepts exactly one generated calendar target and rejects the other cardinalities", () => {
    fc.assert(
      fc.property(
        fc.option(nonBlankText, { nil: undefined }),
        fc.option(nonBlankText, { nil: undefined }),
        (id, name) => {
          const input = {
            ...(id === undefined ? {} : { calendarId: id }),
            ...(name === undefined ? {} : { calendarName: name })
          }
          const decoded = Schema.decodeUnknownResult(SetPrimaryCalendarParamsSchema)(input)
          expect(Result.isSuccess(decoded)).toBe((id === undefined) !== (name === undefined))
        }
      ),
      propertyTestParameters
    )
  })

  it("round-trips every generated calendar settings summary", () => {
    fc.assert(
      fc.property(
        nonBlankText,
        nonBlankText,
        kind,
        fc.boolean(),
        visibility,
        nonBlankText,
        access,
        fc.boolean(),
        (calendarId, name, calendarKind, hidden, calendarVisibility, user, calendarAccess, isPrimary) => {
          const summary = assertDecodeSuccess(CalendarSettingsSummarySchema, {
            calendarId,
            name,
            kind: calendarKind,
            hidden,
            visibility: calendarVisibility,
            user,
            access: calendarAccess,
            isPrimary
          })
          expect(assertEncodeSuccess(CalendarSettingsSummarySchema, summary)).toEqual(summary)
        }
      ),
      propertyTestParameters
    )
  })

  it("rejects every generated provider-owned field on settings updates", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("default", "externalId", "externalUser"),
        fc.oneof(fc.boolean(), nonBlankText),
        (field, value) => {
          const decoded = Schema.decodeUnknownResult(UpdateCalendarSettingsParamsSchema, { onExcessProperty: "error" })(
            { calendarId: "calendar", visibility: "private", [field]: value }
          )
          expect(Result.isFailure(decoded)).toBe(true)
        }
      ),
      propertyTestParameters
    )
  })
})
