import { Schema } from "effect"

import { HULY_NATIVE_REFERENCE_MARKDOWN_INPUT } from "./document-native-references.js"
import { toDraft07JsonSchema, withJsonSchemaPropertyDescriptions } from "./json-schema.js"
import {
  ColorCode,
  Count,
  DEFAULT_LIMIT,
  LimitParam,
  NonEmptyString,
  NonNegativeInteger,
  PersonId,
  PersonName,
  Timestamp
} from "./shared.js"
import { DepartmentId, DepartmentIdentifier, DepartmentPath, PersonLocator } from "./hr-departments.js"

export const HrRequestId = NonEmptyString.pipe(Schema.brand("HrRequestId"))
export type HrRequestId = Schema.Schema.Type<typeof HrRequestId>
export const HrRequestTypeIdentifier = NonEmptyString.pipe(Schema.brand("HrRequestTypeIdentifier"))
export type HrRequestTypeIdentifier = Schema.Schema.Type<typeof HrRequestTypeIdentifier>
export const HrRequestTypeNormalizedLocator = NonEmptyString.pipe(Schema.brand("HrRequestTypeNormalizedLocator"))
export type HrRequestTypeNormalizedLocator = Schema.Schema.Type<typeof HrRequestTypeNormalizedLocator>
export const HrRequestTypeLabel = NonEmptyString.pipe(Schema.brand("HrRequestTypeLabel"))
export type HrRequestTypeLabel = Schema.Schema.Type<typeof HrRequestTypeLabel>
export const HrRequestTypeLabelResource = NonEmptyString.pipe(Schema.brand("HrRequestTypeLabelResource"))
export type HrRequestTypeLabelResource = Schema.Schema.Type<typeof HrRequestTypeLabelResource>
const CALENDAR_MONTH_OFFSET = 1
const isRealIsoCalendarDate = (value: string): boolean => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (match === null) return false
  const [, yearText = "", monthText = "", dayText = ""] = match
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const parsed = new Date(0)
  parsed.setUTCHours(0, 0, 0, 0)
  parsed.setUTCFullYear(year, month - CALENDAR_MONTH_OFFSET, day)
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - CALENDAR_MONTH_OFFSET &&
    parsed.getUTCDate() === day
  )
}
export const HrCalendarDate = Schema.String.pipe(
  Schema.check(
    Schema.makeFilter((value) => isRealIsoCalendarDate(value) || "Expected a real calendar date in YYYY-MM-DD format")
  ),
  Schema.brand("HrCalendarDate")
).annotate({ description: "Inclusive calendar date in YYYY-MM-DD form; stored as Huly TzDate with UTC offset 0." })
export type HrCalendarDate = Schema.Schema.Type<typeof HrCalendarDate>
export const HrLocale = Schema.Literals([
  "cs",
  "de",
  "en",
  "es",
  "fr",
  "it",
  "ja",
  "ko",
  "pt-br",
  "pt",
  "ru",
  "tr",
  "zh"
])
export type HrLocale = Schema.Schema.Type<typeof HrLocale>

export const HrRequestTypeSummarySchema = Schema.Struct({
  id: HrRequestTypeIdentifier,
  label: HrRequestTypeLabel,
  labelLocale: HrLocale,
  labelResource: HrRequestTypeLabelResource,
  value: Schema.Number,
  color: ColorCode,
  mutationSupported: Schema.Literal(false),
  mutationReason: NonEmptyString
})
export type HrRequestTypeSummary = Schema.Schema.Type<typeof HrRequestTypeSummarySchema>

export const HrRequestSummarySchema = Schema.Struct({
  id: HrRequestId,
  employee: Schema.Struct({ id: PersonId, name: PersonName }),
  department: Schema.Struct({ id: DepartmentId, path: DepartmentPath }),
  requestType: HrRequestTypeSummarySchema,
  startDate: HrCalendarDate,
  endDate: HrCalendarDate,
  description: Schema.String,
  comments: Count,
  attachments: Count,
  createdOn: Schema.optionalKey(Timestamp),
  modifiedOn: Schema.optionalKey(Timestamp)
})
export type HrRequestSummary = Schema.Schema.Type<typeof HrRequestSummarySchema>

const paging = { limit: Schema.optional(LimitParam), offset: Schema.optional(NonNegativeInteger) }
export const ListHrRequestTypesParamsSchema = Schema.Struct({
  query: Schema.optional(NonEmptyString),
  locale: Schema.optional(HrLocale),
  ...paging
})
export type ListHrRequestTypesParams = Schema.Schema.Type<typeof ListHrRequestTypesParamsSchema>
export const ListHrRequestTypesResultSchema = Schema.Struct({
  requestTypes: Schema.Array(HrRequestTypeSummarySchema),
  total: Count,
  offset: NonNegativeInteger,
  returned: Count,
  truncated: Schema.Boolean,
  nextOffset: Schema.optionalKey(NonNegativeInteger)
})

const requestFilters = {
  employee: Schema.optional(PersonLocator),
  department: Schema.optional(DepartmentIdentifier),
  requestType: Schema.optional(HrRequestTypeIdentifier),
  startOnOrAfter: Schema.optional(HrCalendarDate),
  endOnOrBefore: Schema.optional(HrCalendarDate),
  ...paging
}
export const ListHrRequestsParamsSchema = Schema.Struct(requestFilters)
export type ListHrRequestsParams = Schema.Schema.Type<typeof ListHrRequestsParamsSchema>
export const ListHrRequestsResultSchema = Schema.Struct({
  requests: Schema.Array(HrRequestSummarySchema),
  total: Count,
  offset: NonNegativeInteger,
  returned: Count,
  truncated: Schema.Boolean,
  nextOffset: Schema.optionalKey(NonNegativeInteger)
})
export const GetHrRequestParamsSchema = Schema.Struct({ request: HrRequestId })
export type GetHrRequestParams = Schema.Schema.Type<typeof GetHrRequestParamsSchema>

export const CreateHrRequestParamsSchema = Schema.Struct({
  employee: PersonLocator,
  department: Schema.optional(DepartmentIdentifier),
  requestType: HrRequestTypeIdentifier,
  startDate: HrCalendarDate,
  endDate: HrCalendarDate,
  description: Schema.optional(Schema.String)
}).pipe(Schema.check(Schema.makeFilter((p) => p.startDate <= p.endDate || "startDate must not be after endDate")))
export type CreateHrRequestParams = Schema.Schema.Type<typeof CreateHrRequestParamsSchema>

export const UpdateHrRequestParamsSchema = Schema.Struct({
  request: HrRequestId,
  department: Schema.optional(DepartmentIdentifier),
  requestType: Schema.optional(HrRequestTypeIdentifier),
  startDate: Schema.optional(HrCalendarDate),
  endDate: Schema.optional(HrCalendarDate),
  description: Schema.optional(Schema.String)
}).pipe(
  Schema.check(
    Schema.makeFilter(
      (p) =>
        [p.department, p.requestType, p.startDate, p.endDate, p.description].some((v) => v !== undefined) ||
        "Provide at least one update field"
    )
  ),
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
export type UpdateHrRequestParams = Schema.Schema.Type<typeof UpdateHrRequestParamsSchema>
export const DeleteHrRequestParamsSchema = GetHrRequestParamsSchema
export type DeleteHrRequestParams = GetHrRequestParams
export const CreateHrRequestResultSchema = Schema.Struct({
  request: HrRequestSummarySchema,
  created: Schema.Literal(true)
})
export type CreateHrRequestResult = Schema.Schema.Type<typeof CreateHrRequestResultSchema>
export const UpdateHrRequestResultSchema = Schema.Struct({
  request: HrRequestSummarySchema,
  updated: Schema.Literal(true)
})
export type UpdateHrRequestResult = Schema.Schema.Type<typeof UpdateHrRequestResultSchema>
export const DeleteHrRequestResultSchema = Schema.Struct({ id: HrRequestId, deleted: Schema.Literal(true) })
export type ListHrRequestsResult = Schema.Schema.Type<typeof ListHrRequestsResultSchema>
export type DeleteHrRequestResult = Schema.Schema.Type<typeof DeleteHrRequestResultSchema>

const descriptions = {
  request: "Raw HR request ID returned by list_hr_requests or create_hr_request.",
  employee: "Exact employee ID, email, or Huly display name; ambiguity is rejected.",
  department: "Exact department ID or full slash-separated path; ambiguity is rejected.",
  requestType: "Exact request-type ID or human-readable label returned by list_hr_request_types.",
  locale: "Huly translation locale for request-type labels (default: en). Translated labels remain valid locators.",
  startDate: "Inclusive first calendar day in YYYY-MM-DD form; stored with UTC offset 0.",
  endDate: "Inclusive last calendar day in YYYY-MM-DD form; stored with UTC offset 0.",
  description: `Markdown description. ${HULY_NATIVE_REFERENCE_MARKDOWN_INPUT}`,
  limit: `Page size (default ${DEFAULT_LIMIT}).`,
  offset: "Zero-based continuation offset returned as nextOffset."
}
const json = (schema: Schema.Constraint) =>
  withJsonSchemaPropertyDescriptions(toDraft07JsonSchema(schema), descriptions)
export const listHrRequestTypesParamsJsonSchema = json(ListHrRequestTypesParamsSchema)
export const listHrRequestsParamsJsonSchema = json(ListHrRequestsParamsSchema)
export const getHrRequestParamsJsonSchema = json(GetHrRequestParamsSchema)
export const createHrRequestParamsJsonSchema = json(CreateHrRequestParamsSchema)
export const updateHrRequestParamsJsonSchema = json(UpdateHrRequestParamsSchema)
export const deleteHrRequestParamsJsonSchema = json(DeleteHrRequestParamsSchema)
export const parseListHrRequestTypesParams = Schema.decodeUnknownEffect(ListHrRequestTypesParamsSchema)
export const parseListHrRequestsParams = Schema.decodeUnknownEffect(ListHrRequestsParamsSchema)
export const parseGetHrRequestParams = Schema.decodeUnknownEffect(GetHrRequestParamsSchema)
export const parseCreateHrRequestParams = Schema.decodeUnknownEffect(CreateHrRequestParamsSchema)
export const parseUpdateHrRequestParams = Schema.decodeUnknownEffect(UpdateHrRequestParamsSchema)
export const parseDeleteHrRequestParams = Schema.decodeUnknownEffect(DeleteHrRequestParamsSchema)
