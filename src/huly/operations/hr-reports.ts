import type { Ref } from "@hcengineering/core"
import type { Department } from "@hcengineering/hr"
import { Effect } from "effect"

import {
  Count,
  type DepartmentId,
  DepartmentPath,
  HR_REPORT_SEMANTICS,
  type HrReportParams,
  type HrRequestSummary,
  type HrScheduleResult,
  type HrSummaryReportResult,
  type HrTableResult
} from "../../domain/schemas.js"
import { HulyClient } from "../client.js"
import { DepartmentHierarchyError } from "../errors.js"
import { hr } from "../huly-plugins.js"
import { hrCalendarDateRange, isHrWeekend } from "./hr-calendar.js"
import { descendantsOf, loadDepartmentCatalog, resolveDepartmentFromCatalog } from "./hr-departments-shared.js"
import { applicableHolidayDepartmentIds, loadAllPublicHolidaySummaries } from "./hr-holidays.js"
import { loadAllHrDocuments } from "./hr-pagination.js"
import { applicableHolidayDates, hrRequestMeasures, hrTypeTotals } from "./hr-report-core.js"
import { type HrReportStaffRecord, parseHrReportStaffRecord } from "./hr-report-sdk-boundary.js"
import { loadAllHrRequestSummaries } from "./hr-requests.js"
import { toRef } from "./sdk-boundary.js"

const loadReportStaff = Effect.fn("HrReports.loadStaff")(function* (scanPageSize?: number) {
  const client = yield* HulyClient
  const raw = yield* loadAllHrDocuments(client, hr.mixin.Staff, {}, scanPageSize)
  return yield* Effect.forEach(raw, parseHrReportStaffRecord)
})

const scopedDepartmentIds = Effect.fn("HrReports.scopedDepartmentIds")(function* (
  params: HrReportParams,
  catalog: Effect.Success<ReturnType<typeof loadDepartmentCatalog>>
) {
  if (params.department === undefined) return undefined
  const department = yield* resolveDepartmentFromCatalog(catalog, params.department)
  const departments =
    (params.includeSubdepartments ?? true) ? [department, ...descendantsOf(catalog, department)] : [department]
  return new Set(departments.map((item) => item._id))
})

const reportData = Effect.fn("HrReports.loadData")(function* (params: HrReportParams) {
  const catalog = yield* loadDepartmentCatalog(yield* HulyClient)
  const scope = yield* scopedDepartmentIds(params, catalog)
  const allRequests = yield* loadAllHrRequestSummaries({}, params.scanPageSize)
  const requests = allRequests.filter(
    (request) =>
      (scope === undefined || scope.has(toRef<Department>(request.department.id))) &&
      request.startDate <= params.endDate &&
      request.endDate >= params.startDate
  )
  const allHolidays = yield* loadAllPublicHolidaySummaries(params.scanPageSize)
  const holidayDepartmentIds = new Set<Ref<Department>>()
  if (scope !== undefined) {
    for (const departmentId of scope) {
      const department = catalog.byId.get(departmentId)
      if (department === undefined) {
        return yield* new DepartmentHierarchyError({
          message: `Report scope references missing department '${departmentId}'`
        })
      }
      for (const ownerId of applicableHolidayDepartmentIds(
        department,
        catalog.byId,
        params.includeInheritedHolidays ?? true
      )) {
        holidayDepartmentIds.add(ownerId)
      }
    }
  }
  const holidays = allHolidays.filter(
    (holiday) =>
      holiday.date >= params.startDate &&
      holiday.date <= params.endDate &&
      (scope === undefined || holidayDepartmentIds.has(toRef<Department>(holiday.department.id)))
  )
  return { catalog, scope, requests, holidays }
})

const departmentPath = (
  departmentId: DepartmentId,
  paths: ReadonlyMap<Ref<Department>, DepartmentPath>
): Effect.Effect<DepartmentPath, DepartmentHierarchyError> => {
  const path =
    departmentId === String(hr.ids.Head) ? DepartmentPath.make("Head") : paths.get(toRef<Department>(departmentId))
  return path === undefined
    ? Effect.fail(new DepartmentHierarchyError({ message: `Staff references missing department '${departmentId}'` }))
    : Effect.succeed(path)
}

export const getHrSchedule = Effect.fn("HrReports.getSchedule")(function* (params: HrReportParams) {
  const data = yield* reportData(params)
  const days = hrCalendarDateRange(params.startDate, params.endDate).map((date) => ({
    date,
    weekend: isHrWeekend(date),
    requestIds: data.requests
      .filter((request) => request.startDate <= date && request.endDate >= date)
      .map((r) => r.id),
    holidayIds: data.holidays.filter((holiday) => holiday.date === date).map((holiday) => holiday.id)
  }))
  return {
    startDate: params.startDate,
    endDate: params.endDate,
    ...HR_REPORT_SEMANTICS,
    requests: data.requests,
    holidays: data.holidays,
    days,
    complete: true
  } satisfies HrScheduleResult
})

const makeTableRow = Effect.fn("HrReports.makeTableRow")(function* (
  employee: HrReportStaffRecord,
  data: Effect.Success<ReturnType<typeof reportData>>,
  params: HrReportParams,
  weekdays: number
) {
  const holidays = applicableHolidayDates(
    employee.department,
    data.holidays,
    data.catalog.byId,
    params.includeInheritedHolidays ?? true
  )
  const publicHolidayWorkdays = [...holidays].filter((date) => !isHrWeekend(date)).length
  const baseWorkdays = weekdays - publicHolidayWorkdays
  const requests = data.requests.filter((request) => request.employee.id === employee._id)
  const requestTypes = hrTypeTotals(requests, params.startDate, params.endDate, holidays)
  const requestUnits = requestTypes.reduce((total, item) => total + item.units, 0)
  return {
    employee: { id: employee._id, name: employee.name },
    department: { id: employee.department, path: yield* departmentPath(employee.department, data.catalog.pathById) },
    weekdays: Count.make(weekdays),
    publicHolidayWorkdays: Count.make(publicHolidayWorkdays),
    baseWorkdays: Count.make(baseWorkdays),
    requestUnits,
    netWorkdays: baseWorkdays + requestUnits,
    requestTypes
  }
})

export const getHrTable = Effect.fn("HrReports.getTable")(function* (params: HrReportParams) {
  const data = yield* reportData(params)
  const staff = (yield* loadReportStaff(params.scanPageSize)).filter(
    (item) => data.scope === undefined || data.scope.has(toRef<Department>(item.department))
  )
  const dates = hrCalendarDateRange(params.startDate, params.endDate)
  const weekdays = dates.filter((date) => !isHrWeekend(date)).length
  const rows = yield* Effect.forEach(staff, (employee) => makeTableRow(employee, data, params, weekdays))
  return {
    startDate: params.startDate,
    endDate: params.endDate,
    ...HR_REPORT_SEMANTICS,
    rows,
    totalEmployees: Count.make(rows.length),
    complete: true
  } satisfies HrTableResult
})

interface SummaryAccumulator {
  readonly department: HrRequestSummary["department"]
  readonly requestType: {
    readonly id: HrRequestSummary["requestType"]["id"]
    readonly label: HrRequestSummary["requestType"]["label"]
  }
  readonly requestCount: number
  readonly calendarDays: number
  readonly workdays: number
  readonly units: number
}

const addSummaryRequest = (
  current: SummaryAccumulator | undefined,
  request: HrRequestSummary,
  measures: ReturnType<typeof hrRequestMeasures>
): SummaryAccumulator => {
  const previous =
    current ??
    ({
      department: request.department,
      requestType: request.requestType,
      requestCount: 0,
      calendarDays: 0,
      workdays: 0,
      units: 0
    } satisfies SummaryAccumulator)
  return {
    department: request.department,
    requestType: { id: request.requestType.id, label: request.requestType.label },
    requestCount: previous.requestCount + 1,
    calendarDays: previous.calendarDays + measures.calendarDays,
    workdays: previous.workdays + measures.workdays,
    units: previous.units + measures.units
  }
}

const groupSummaryRequests = (
  requests: ReadonlyArray<HrRequestSummary>,
  params: HrReportParams,
  data: Effect.Success<ReturnType<typeof reportData>>
): ReadonlyArray<SummaryAccumulator> => {
  const grouped = new Map<string, SummaryAccumulator>()
  for (const request of requests) {
    const holidayDates = applicableHolidayDates(
      request.department.id,
      data.holidays,
      data.catalog.byId,
      params.includeInheritedHolidays ?? true
    )
    const measures = hrRequestMeasures(request, params.startDate, params.endDate, holidayDates)
    const key = `${request.department.id}\0${request.requestType.id}`
    grouped.set(key, addSummaryRequest(grouped.get(key), request, measures))
  }
  return [...grouped.values()]
}

export const getHrSummaryReport = Effect.fn("HrReports.getSummary")(function* (params: HrReportParams) {
  const data = yield* reportData(params)
  const groups = groupSummaryRequests(data.requests, params, data).map((group) => ({
    ...group,
    requestCount: Count.make(group.requestCount),
    calendarDays: Count.make(group.calendarDays),
    workdays: Count.make(group.workdays)
  }))
  return {
    startDate: params.startDate,
    endDate: params.endDate,
    ...HR_REPORT_SEMANTICS,
    totalRequests: Count.make(data.requests.length),
    totalCalendarDays: Count.make(groups.reduce((total, group) => total + group.calendarDays, 0)),
    totalWorkdays: Count.make(groups.reduce((total, group) => total + group.workdays, 0)),
    totalRequestUnits: groups.reduce((total, group) => total + group.units, 0),
    publicHolidayDocuments: Count.make(data.holidays.length),
    groups,
    complete: true
  } satisfies HrSummaryReportResult
})
