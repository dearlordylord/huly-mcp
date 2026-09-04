import { Schema } from "effect"

import { DepartmentId, DepartmentIdentifier, DepartmentPath } from "./hr-departments.js"
import { PublicHolidayId, PublicHolidaySummarySchema } from "./hr-holidays.js"
import {
  HrCalendarDate,
  HrRequestId,
  HrRequestSummarySchema,
  HrRequestTypeIdentifier,
  HrRequestTypeLabel
} from "./hr-requests.js"
import { toDraft07JsonSchema, withJsonSchemaPropertyDescriptions } from "./json-schema.js"
import { Count, PersonId, PersonName } from "./shared.js"

export const HrReportTimeZone = Schema.Literal("UTC")
export const HrRangeSemantics = Schema.Literal("inclusive-calendar-dates")
export const HrWorkdaySemantics = Schema.Literal("monday-through-friday-excluding-applicable-public-holidays")
export const HrRequestUnitSemantics = Schema.Literal(
  "negative-types-use-workdays;positive-types-use-calendar-days;zero-types-contribute-zero"
)

export const HrReportParamsSchema = Schema.Struct({
  startDate: HrCalendarDate,
  endDate: HrCalendarDate,
  department: Schema.optional(DepartmentIdentifier),
  includeSubdepartments: Schema.optional(Schema.Boolean),
  includeInheritedHolidays: Schema.optional(Schema.Boolean)
}).pipe(Schema.check(Schema.makeFilter((p) => p.startDate <= p.endDate || "startDate must not be after endDate")))
export type HrReportParams = Schema.Schema.Type<typeof HrReportParamsSchema>

const reportSemantics = {
  timezone: HrReportTimeZone,
  rangeSemantics: HrRangeSemantics,
  workdaySemantics: HrWorkdaySemantics,
  requestUnitSemantics: HrRequestUnitSemantics
}

export const HrScheduleDaySchema = Schema.Struct({
  date: HrCalendarDate,
  weekend: Schema.Boolean,
  requestIds: Schema.Array(HrRequestId),
  holidayIds: Schema.Array(PublicHolidayId)
})
export const HrScheduleResultSchema = Schema.Struct({
  startDate: HrCalendarDate,
  endDate: HrCalendarDate,
  ...reportSemantics,
  requests: Schema.Array(HrRequestSummarySchema),
  holidays: Schema.Array(PublicHolidaySummarySchema),
  days: Schema.Array(HrScheduleDaySchema),
  complete: Schema.Literal(true)
})
export type HrScheduleResult = Schema.Schema.Type<typeof HrScheduleResultSchema>

export const HrTableTypeTotalSchema = Schema.Struct({
  requestType: Schema.Struct({ id: HrRequestTypeIdentifier, label: HrRequestTypeLabel }),
  requestCount: Count,
  calendarDays: Count,
  workdays: Count,
  units: Schema.Number
})
export type HrTableTypeTotal = Schema.Schema.Type<typeof HrTableTypeTotalSchema>
export const HrTableRowSchema = Schema.Struct({
  employee: Schema.Struct({ id: PersonId, name: PersonName }),
  department: Schema.Struct({ id: DepartmentId, path: DepartmentPath }),
  weekdays: Count,
  publicHolidayWorkdays: Count,
  baseWorkdays: Count,
  requestUnits: Schema.Number,
  netWorkdays: Schema.Number,
  requestTypes: Schema.Array(HrTableTypeTotalSchema)
})
export const HrTableResultSchema = Schema.Struct({
  startDate: HrCalendarDate,
  endDate: HrCalendarDate,
  ...reportSemantics,
  rows: Schema.Array(HrTableRowSchema),
  totalEmployees: Count,
  complete: Schema.Literal(true)
})
export type HrTableResult = Schema.Schema.Type<typeof HrTableResultSchema>

export const HrSummaryGroupSchema = Schema.Struct({
  department: Schema.Struct({ id: DepartmentId, path: DepartmentPath }),
  requestType: Schema.Struct({ id: HrRequestTypeIdentifier, label: HrRequestTypeLabel }),
  requestCount: Count,
  calendarDays: Count,
  workdays: Count,
  units: Schema.Number
})
export const HrSummaryReportResultSchema = Schema.Struct({
  startDate: HrCalendarDate,
  endDate: HrCalendarDate,
  ...reportSemantics,
  totalRequests: Count,
  totalCalendarDays: Count,
  totalWorkdays: Count,
  totalRequestUnits: Schema.Number,
  publicHolidayDocuments: Count,
  groups: Schema.Array(HrSummaryGroupSchema),
  complete: Schema.Literal(true)
})
export type HrSummaryReportResult = Schema.Schema.Type<typeof HrSummaryReportResultSchema>

export const hrReportParamsJsonSchema = withJsonSchemaPropertyDescriptions(toDraft07JsonSchema(HrReportParamsSchema), {
  startDate: "Inclusive first UTC calendar date in YYYY-MM-DD form.",
  endDate: "Inclusive last UTC calendar date in YYYY-MM-DD form.",
  department: "Exact department ID or full slash-separated path; ambiguity is rejected.",
  includeSubdepartments: "Include employees and requests assigned to nested departments (default true).",
  includeInheritedHolidays:
    "Apply holidays from each employee/request department and all of its ancestors (default true)."
})
export const parseHrReportParams = Schema.decodeUnknownEffect(HrReportParamsSchema)

export const HR_REPORT_SEMANTICS = {
  timezone: "UTC",
  rangeSemantics: "inclusive-calendar-dates",
  workdaySemantics: "monday-through-friday-excluding-applicable-public-holidays",
  requestUnitSemantics: "negative-types-use-workdays;positive-types-use-calendar-days;zero-types-contribute-zero"
} satisfies {
  readonly timezone: typeof HrReportTimeZone.Type
  readonly rangeSemantics: typeof HrRangeSemantics.Type
  readonly workdaySemantics: typeof HrWorkdaySemantics.Type
  readonly requestUnitSemantics: typeof HrRequestUnitSemantics.Type
}
