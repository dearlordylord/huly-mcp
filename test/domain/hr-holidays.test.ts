import { Effect } from "effect"
import { describe, expect, it } from "vitest"

import { parseListPublicHolidaysParams, parseUpdatePublicHolidayParams } from "../../src/domain/schemas/hr-holidays.js"
import { parseHrReportParams } from "../../src/domain/schemas/hr-reports.js"

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
})
