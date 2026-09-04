import type { TzDate } from "@hcengineering/hr"

import { HrCalendarDate } from "../../domain/schemas.js"

const HUMAN_MONTH_OFFSET = 1
const YEAR_DIGITS = 4
const DATE_PART_DIGITS = 2
const MILLISECONDS_PER_DAY = 86_400_000
const SATURDAY = 6

export const hrTzDateFromCalendarDate = (value: HrCalendarDate): TzDate => {
  const [year = 0, month = 1, day = 0] = value.split("-").map(Number)
  return { year, month: month - HUMAN_MONTH_OFFSET, day, offset: 0 }
}

export const hrCalendarDateFromTzDate = (value: TzDate): HrCalendarDate =>
  HrCalendarDate.make(
    `${String(value.year).padStart(YEAR_DIGITS, "0")}-${String(value.month + HUMAN_MONTH_OFFSET).padStart(DATE_PART_DIGITS, "0")}-${String(value.day).padStart(DATE_PART_DIGITS, "0")}`
  )

const utcDate = (value: HrCalendarDate): Date => {
  const [year = 0, month = 1, day = 0] = value.split("-").map(Number)
  const date = new Date(0)
  date.setUTCHours(0, 0, 0, 0)
  date.setUTCFullYear(year, month - HUMAN_MONTH_OFFSET, day)
  return date
}

const hrCalendarDayNumber = (value: HrCalendarDate): number => utcDate(value).getTime() / MILLISECONDS_PER_DAY

export const hrCalendarDaysInclusive = (startDate: HrCalendarDate, endDate: HrCalendarDate): number =>
  hrCalendarDayNumber(endDate) - hrCalendarDayNumber(startDate) + 1

export const hrCalendarDateRange = (
  startDate: HrCalendarDate,
  endDate: HrCalendarDate
): ReadonlyArray<HrCalendarDate> => {
  const start = hrCalendarDayNumber(startDate)
  const end = hrCalendarDayNumber(endDate)
  return Array.from({ length: end - start + 1 }, (_, index) => {
    const date = new Date((start + index) * MILLISECONDS_PER_DAY)
    return HrCalendarDate.make(
      `${String(date.getUTCFullYear()).padStart(YEAR_DIGITS, "0")}-${String(date.getUTCMonth() + HUMAN_MONTH_OFFSET).padStart(DATE_PART_DIGITS, "0")}-${String(date.getUTCDate()).padStart(DATE_PART_DIGITS, "0")}`
    )
  })
}

export const isHrWeekend = (value: HrCalendarDate): boolean => {
  const weekday = utcDate(value).getUTCDay()
  return weekday === 0 || weekday === SATURDAY
}

export const clipHrDateRange = (
  startDate: HrCalendarDate,
  endDate: HrCalendarDate,
  rangeStart: HrCalendarDate,
  rangeEnd: HrCalendarDate
): { readonly startDate: HrCalendarDate; readonly endDate: HrCalendarDate } | undefined => {
  const clippedStart = startDate < rangeStart ? rangeStart : startDate
  const clippedEnd = endDate > rangeEnd ? rangeEnd : endDate
  return clippedStart <= clippedEnd ? { startDate: clippedStart, endDate: clippedEnd } : undefined
}
