import type { Ref } from "@hcengineering/core"
import type { Department } from "@hcengineering/hr"

import {
  Count,
  type DepartmentId,
  type HrCalendarDate,
  type HrRequestSummary,
  type HrTableTypeTotal,
  type PublicHolidaySummary
} from "../../domain/schemas.js"
import { clipHrDateRange, hrCalendarDateRange, hrCalendarDaysInclusive, isHrWeekend } from "./hr-calendar.js"
import { ancestorDepartmentIds } from "./hr-departments-shared.js"
import { toRef } from "./sdk-boundary.js"

export const applicableHolidayDates = (
  departmentId: DepartmentId,
  holidays: ReadonlyArray<PublicHolidaySummary>,
  departments: ReadonlyMap<Ref<Department>, Department>,
  includeInherited: boolean
): ReadonlySet<HrCalendarDate> => {
  const department = departments.get(toRef<Department>(departmentId))
  const allowed =
    includeInherited && department !== undefined
      ? ancestorDepartmentIds(department, departments)
      : new Set<Ref<Department>>([toRef<Department>(departmentId)])
  return new Set(
    holidays.filter((holiday) => allowed.has(toRef<Department>(holiday.department.id))).map((holiday) => holiday.date)
  )
}

interface HrRequestMeasures {
  readonly calendarDays: number
  readonly workdays: number
  readonly units: number
}

export const hrRequestMeasures = (
  request: HrRequestSummary,
  rangeStart: HrCalendarDate,
  rangeEnd: HrCalendarDate,
  holidayDates: ReadonlySet<HrCalendarDate>
): HrRequestMeasures => {
  const clipped = clipHrDateRange(request.startDate, request.endDate, rangeStart, rangeEnd)
  if (clipped === undefined) return { calendarDays: 0, workdays: 0, units: 0 }
  const dates = hrCalendarDateRange(clipped.startDate, clipped.endDate)
  const workdays = dates.filter((date) => !isHrWeekend(date) && !holidayDates.has(date)).length
  const calendarDays = hrCalendarDaysInclusive(clipped.startDate, clipped.endDate)
  const countedDays = request.requestType.value < 0 ? workdays : request.requestType.value > 0 ? calendarDays : 0
  return { calendarDays, workdays, units: countedDays * request.requestType.value }
}

const addTypeTotal = (
  current: HrTableTypeTotal | undefined,
  request: HrRequestSummary,
  measures: HrRequestMeasures
): HrTableTypeTotal => {
  const previous =
    current ??
    ({
      requestType: request.requestType,
      requestCount: Count.make(0),
      calendarDays: Count.make(0),
      workdays: Count.make(0),
      units: 0
    } satisfies HrTableTypeTotal)
  return {
    requestType: { id: request.requestType.id, label: request.requestType.label },
    requestCount: Count.make(previous.requestCount + 1),
    calendarDays: Count.make(previous.calendarDays + measures.calendarDays),
    workdays: Count.make(previous.workdays + measures.workdays),
    units: previous.units + measures.units
  }
}

export const hrTypeTotals = (
  requests: ReadonlyArray<HrRequestSummary>,
  rangeStart: HrCalendarDate,
  rangeEnd: HrCalendarDate,
  holidayDates: ReadonlySet<HrCalendarDate>
): ReadonlyArray<HrTableTypeTotal> => {
  const grouped = new Map<string, HrTableTypeTotal>()
  for (const request of requests) {
    const measures = hrRequestMeasures(request, rangeStart, rangeEnd, holidayDates)
    grouped.set(request.requestType.id, addTypeTotal(grouped.get(request.requestType.id), request, measures))
  }
  return [...grouped.values()].sort((left, right) => left.requestType.label.localeCompare(right.requestType.label))
}
