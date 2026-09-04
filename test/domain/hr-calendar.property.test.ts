import { Effect } from "effect"
import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { HrCalendarDate } from "../../src/domain/schemas/hr-requests.js"
import {
  hrCalendarDateFromTzDate,
  hrCalendarDateRange,
  hrTzDateFromCalendarDate
} from "../../src/huly/operations/hr-calendar.js"
import { collectHrPages } from "../../src/huly/operations/hr-pagination.js"

const calendarDate = (day: number): HrCalendarDate => {
  const value = new Date(Date.UTC(2000, 0, day + 1)).toISOString().slice(0, 10)
  return HrCalendarDate.make(value)
}

describe("HR calendar properties", () => {
  it("round-trips every generated calendar date through the Huly TzDate contract", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 36_524 }), (day) => {
        const value = calendarDate(day)
        expect(hrCalendarDateFromTzDate(hrTzDateFromCalendarDate(value))).toBe(value)
      })
    )
  })

  it("produces inclusive ordered ranges with exact endpoints", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 36_500 }), fc.integer({ min: 0, max: 24 }), (startDay, length) => {
        const start = calendarDate(startDay)
        const end = calendarDate(startDay + length)
        const range = hrCalendarDateRange(start, end)
        expect(range).toHaveLength(length + 1)
        expect(range[0]).toBe(start)
        expect(range.at(-1)).toBe(end)
        expect([...range].sort()).toEqual(range)
      })
    )
  })

  it("collects every cursor page without an implicit 200-row cap", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 0, max: 650 }), async (length) => {
        const values = Array.from({ length }, (_, index) => String(index).padStart(4, "0"))
        const result = await Effect.runPromise(
          collectHrPages(
            (excluded, pageSize) =>
              Effect.succeed(values.filter((value) => !excluded.includes(value)).slice(0, pageSize)),
            (value) => value
          )
        )
        expect(result).toEqual(values)
      })
    )
  })
})
