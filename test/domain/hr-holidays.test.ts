import { Effect } from "effect"
import { describe, expect, it } from "vitest"

import { parseListPublicHolidaysParams, parseUpdatePublicHolidayParams } from "../../src/domain/schemas/hr-holidays.js"
import { hrReportParamsJsonSchema, parseHrReportParams } from "../../src/domain/schemas/hr-reports.js"
import { HrCalendarDate } from "../../src/domain/schemas/hr-requests.js"
import { parsePublicHolidayRecord } from "../../src/huly/operations/hr-holiday-sdk-boundary.js"
import { publicHolidayDateConflicts } from "../../src/huly/operations/hr-holidays.js"

describe("public holiday contracts", () => {
  it("accepts explicit inheritance and continuation inputs", () => {
    expect(
      Effect.runSync(
        parseListPublicHolidaysParams({
          department: "Product/Design",
          includeInherited: true,
          startDate: "2026-01-01",
          endDate: "2026-12-31",
          limit: 20,
          offset: 40
        })
      )
    ).toMatchObject({ includeInherited: true, offset: 40 })
  })

  it("rejects reversed ranges and empty updates", () => {
    expect(() =>
      Effect.runSync(parseListPublicHolidaysParams({ startDate: "2026-12-31", endDate: "2026-01-01" }))
    ).toThrow("startDate must not be after endDate")
    expect(() => Effect.runSync(parseUpdatePublicHolidayParams({ holiday: "holiday-1" }))).toThrow(
      "at least one update field"
    )
    expect(() => Effect.runSync(parseHrReportParams({ startDate: "2026-12-31", endDate: "2026-01-01" }))).toThrow(
      "startDate must not be after endDate"
    )
  })

  it("keeps internal pagination tuning out of the public report contract", () => {
    expect(JSON.stringify(hrReportParamsJsonSchema)).not.toContain("scanPageSize")
  })

  it("detects calendar-day duplicates regardless of the stored timezone offset", () => {
    const existing = Effect.runSync(
      parsePublicHolidayRecord({
        _id: "holiday-offset",
        _class: "hr:class:PublicHoliday",
        space: "core:space:Workspace",
        title: "Offset holiday",
        description: "",
        date: { year: 2026, month: 8, day: 4, offset: -300 },
        department: "department-1"
      })
    )

    expect(publicHolidayDateConflicts([existing], HrCalendarDate.make("2026-09-04"))).toBe(true)
    expect(publicHolidayDateConflicts([existing], HrCalendarDate.make("2026-09-04"), existing._id)).toBe(false)
  })
})
