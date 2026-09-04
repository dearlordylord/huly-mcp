import { Schema } from "effect"

import { DepartmentId, DepartmentIdentifier, DepartmentPath } from "./hr-departments.js"
import { HrCalendarDate } from "./hr-requests.js"
import { toDraft07JsonSchema, withJsonSchemaPropertyDescriptions } from "./json-schema.js"
import { Count, LimitParam, NonEmptyString, NonNegativeInteger, Timestamp } from "./shared.js"

export const PublicHolidayId = NonEmptyString.pipe(Schema.brand("PublicHolidayId"))
export type PublicHolidayId = Schema.Schema.Type<typeof PublicHolidayId>

export const PublicHolidaySummarySchema = Schema.Struct({
  id: PublicHolidayId,
  title: NonEmptyString,
  description: Schema.String,
  date: HrCalendarDate,
  department: Schema.Struct({ id: DepartmentId, path: DepartmentPath }),
  modifiedOn: Schema.optionalKey(Timestamp)
})
export type PublicHolidaySummary = Schema.Schema.Type<typeof PublicHolidaySummarySchema>

const dateRange = { startDate: Schema.optional(HrCalendarDate), endDate: Schema.optional(HrCalendarDate) }
export const ListPublicHolidaysParamsSchema = Schema.Struct({
  department: Schema.optional(DepartmentIdentifier),
  includeInherited: Schema.optional(Schema.Boolean),
  ...dateRange,
  limit: Schema.optional(LimitParam),
  offset: Schema.optional(NonNegativeInteger)
}).pipe(
  Schema.check(
    Schema.makeFilter(
      (p) =>
        p.startDate === undefined ||
        p.endDate === undefined ||
        p.startDate <= p.endDate ||
        "startDate must not be after endDate"
    )
  )
)
export type ListPublicHolidaysParams = Schema.Schema.Type<typeof ListPublicHolidaysParamsSchema>

export const GetPublicHolidayParamsSchema = Schema.Struct({ holiday: PublicHolidayId })
export type GetPublicHolidayParams = Schema.Schema.Type<typeof GetPublicHolidayParamsSchema>

export const CreatePublicHolidayParamsSchema = Schema.Struct({
  title: NonEmptyString,
  description: Schema.optional(Schema.String),
  date: HrCalendarDate,
  department: DepartmentIdentifier
})
export type CreatePublicHolidayParams = Schema.Schema.Type<typeof CreatePublicHolidayParamsSchema>

export const UpdatePublicHolidayParamsSchema = Schema.Struct({
  holiday: PublicHolidayId,
  title: Schema.optional(NonEmptyString),
  description: Schema.optional(Schema.String),
  date: Schema.optional(HrCalendarDate),
  department: Schema.optional(DepartmentIdentifier)
}).pipe(
  Schema.check(
    Schema.makeFilter(
      (p) =>
        [p.title, p.description, p.date, p.department].some((value) => value !== undefined) ||
        "Provide at least one update field"
    )
  )
)
export type UpdatePublicHolidayParams = Schema.Schema.Type<typeof UpdatePublicHolidayParamsSchema>

export const DeletePublicHolidayParamsSchema = GetPublicHolidayParamsSchema
export type DeletePublicHolidayParams = GetPublicHolidayParams

export const ListPublicHolidaysResultSchema = Schema.Struct({
  holidays: Schema.Array(PublicHolidaySummarySchema),
  total: Count,
  offset: NonNegativeInteger,
  returned: Count,
  truncated: Schema.Boolean,
  nextOffset: Schema.optionalKey(NonNegativeInteger)
})
export const CreatePublicHolidayResultSchema = Schema.Struct({
  holiday: PublicHolidaySummarySchema,
  created: Schema.Literal(true)
})
export type CreatePublicHolidayResult = Schema.Schema.Type<typeof CreatePublicHolidayResultSchema>
export const UpdatePublicHolidayResultSchema = Schema.Struct({
  holiday: PublicHolidaySummarySchema,
  updated: Schema.Literal(true)
})
export type UpdatePublicHolidayResult = Schema.Schema.Type<typeof UpdatePublicHolidayResultSchema>
export const DeletePublicHolidayResultSchema = Schema.Struct({ id: PublicHolidayId, deleted: Schema.Literal(true) })
export type DeletePublicHolidayResult = Schema.Schema.Type<typeof DeletePublicHolidayResultSchema>

const descriptions = {
  holiday: "Exact raw PublicHoliday ID returned by list_public_holidays or create_public_holiday.",
  title: "Non-empty holiday title.",
  description: "Plain-text holiday description.",
  date: "Calendar date in YYYY-MM-DD form. Huly stores calendar components with UTC offset 0.",
  department: "Exact department ID or full slash-separated path; ambiguity is rejected.",
  includeInherited:
    "With department set, include holidays owned by every ancestor department as well as that department (default false).",
  startDate: "Optional inclusive first holiday date in YYYY-MM-DD form.",
  endDate: "Optional inclusive last holiday date in YYYY-MM-DD form.",
  limit: "Page size.",
  offset: "Zero-based continuation offset returned as nextOffset."
}
const json = (schema: Schema.Constraint) =>
  withJsonSchemaPropertyDescriptions(toDraft07JsonSchema(schema), descriptions)
export const listPublicHolidaysParamsJsonSchema = json(ListPublicHolidaysParamsSchema)
export const getPublicHolidayParamsJsonSchema = json(GetPublicHolidayParamsSchema)
export const createPublicHolidayParamsJsonSchema = json(CreatePublicHolidayParamsSchema)
export const updatePublicHolidayParamsJsonSchema = json(UpdatePublicHolidayParamsSchema)
export const deletePublicHolidayParamsJsonSchema = json(DeletePublicHolidayParamsSchema)
export const parseListPublicHolidaysParams = Schema.decodeUnknownEffect(ListPublicHolidaysParamsSchema)
export const parseGetPublicHolidayParams = Schema.decodeUnknownEffect(GetPublicHolidayParamsSchema)
export const parseCreatePublicHolidayParams = Schema.decodeUnknownEffect(CreatePublicHolidayParamsSchema)
export const parseUpdatePublicHolidayParams = Schema.decodeUnknownEffect(UpdatePublicHolidayParamsSchema)
export const parseDeletePublicHolidayParams = Schema.decodeUnknownEffect(DeletePublicHolidayParamsSchema)
