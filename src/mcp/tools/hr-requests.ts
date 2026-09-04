import {
  createHrRequestParamsJsonSchema,
  deleteHrRequestParamsJsonSchema,
  DeleteHrRequestResultSchema,
  getHrRequestParamsJsonSchema,
  CreateHrRequestResultSchema,
  HrRequestSummarySchema,
  ListHrRequestsResultSchema,
  ListHrRequestTypesResultSchema,
  UpdateHrRequestResultSchema,
  listHrRequestsParamsJsonSchema,
  listHrRequestTypesParamsJsonSchema,
  parseCreateHrRequestParams,
  parseDeleteHrRequestParams,
  parseGetHrRequestParams,
  parseListHrRequestsParams,
  parseListHrRequestTypesParams,
  parseUpdateHrRequestParams,
  updateHrRequestParamsJsonSchema,
  createPublicHolidayParamsJsonSchema,
  CreatePublicHolidayResultSchema,
  deletePublicHolidayParamsJsonSchema,
  DeletePublicHolidayResultSchema,
  getPublicHolidayParamsJsonSchema,
  hrReportParamsJsonSchema,
  HrScheduleResultSchema,
  HrSummaryReportResultSchema,
  HrTableResultSchema,
  ListPublicHolidaysResultSchema,
  listPublicHolidaysParamsJsonSchema,
  parseCreatePublicHolidayParams,
  parseDeletePublicHolidayParams,
  parseGetPublicHolidayParams,
  parseHrReportParams,
  parseListPublicHolidaysParams,
  parseUpdatePublicHolidayParams,
  PublicHolidaySummarySchema,
  updatePublicHolidayParamsJsonSchema,
  UpdatePublicHolidayResultSchema
} from "../../domain/schemas.js"
import {
  createHrRequest,
  deleteHrRequest,
  getHrRequest,
  listHrRequests,
  listHrRequestTypes,
  updateHrRequest
} from "../../huly/operations/hr-requests.js"
import {
  createPublicHoliday,
  deletePublicHoliday,
  getPublicHoliday,
  listPublicHolidays,
  updatePublicHoliday
} from "../../huly/operations/hr-holidays.js"
import { getHrSchedule, getHrSummaryReport, getHrTable } from "../../huly/operations/hr-reports.js"
import { defineTool, type RegisteredTool } from "./registry.js"

const CATEGORY = "hr" as const

export const hrRequestTools = [
  defineTool(
    {
      name: "list_hr_request_types",
      description:
        "Discover installed HR request types by stable ID and Huly-translated human label. Set locale to a supported Huly locale such as fr; labels from any supported locale may be used by request tools, while ambiguous labels are rejected. Request-type mutation is intentionally unsupported because Huly installs these as model-space documents and exposes no stable runtime mutation contract.",
      category: CATEGORY,
      inputSchema: listHrRequestTypesParamsJsonSchema,
      resultSchema: ListHrRequestTypesResultSchema
    },
    parseListHrRequestTypesParams,
    listHrRequestTypes
  ),
  defineTool(
    {
      name: "list_hr_requests",
      description:
        "List HR requests with exact optional employee, department, and request-type filters. Calendar dates are inclusive YYYY-MM-DD values stored with UTC offset 0. Every match is loaded from Huly before the intentional output page is applied; results include total, truncation, and nextOffset continuation metadata.",
      category: CATEGORY,
      inputSchema: listHrRequestsParamsJsonSchema,
      resultSchema: ListHrRequestsResultSchema
    },
    parseListHrRequestsParams,
    listHrRequests
  ),
  defineTool(
    {
      name: "get_hr_request",
      description: "Get one HR request by the exact raw request ID returned by list_hr_requests.",
      category: CATEGORY,
      inputSchema: getHrRequestParamsJsonSchema,
      resultSchema: HrRequestSummarySchema
    },
    parseGetHrRequestParams,
    getHrRequest
  ),
  defineTool(
    {
      name: "create_hr_request",
      description:
        "Create an employee-attached HR request using exact employee, department, and request-type resolution. Dates are inclusive calendar dates in YYYY-MM-DD form and descriptions accept Markdown with native Huly references.",
      category: CATEGORY,
      inputSchema: createHrRequestParamsJsonSchema,
      resultSchema: CreateHrRequestResultSchema
    },
    parseCreateHrRequestParams,
    createHrRequest
  ),
  defineTool(
    {
      name: "update_hr_request",
      description:
        "Update selected HR request fields by exact request ID. Department and type locators resolve exactly; omitted fields are preserved. Dates remain inclusive YYYY-MM-DD calendar dates.",
      category: CATEGORY,
      inputSchema: updateHrRequestParamsJsonSchema,
      resultSchema: UpdateHrRequestResultSchema
    },
    parseUpdateHrRequestParams,
    updateHrRequest
  ),
  defineTool(
    {
      name: "delete_hr_request",
      description:
        "Delete one exact HR request. Its comments and attachments are Huly-owned attached collections and follow the request deletion lifecycle.",
      category: CATEGORY,
      inputSchema: deleteHrRequestParamsJsonSchema,
      resultSchema: DeleteHrRequestResultSchema
    },
    parseDeleteHrRequestParams,
    deleteHrRequest
  ),
  defineTool(
    {
      name: "list_public_holidays",
      description:
        "List public-holiday documents with exact optional department and inclusive date filters. includeInherited adds every ancestor department explicitly; it never adds descendants. Results are loaded completely from Huly before the intentional output page is applied, and include total, truncated, and nextOffset metadata.",
      category: CATEGORY,
      inputSchema: listPublicHolidaysParamsJsonSchema,
      resultSchema: ListPublicHolidaysResultSchema
    },
    parseListPublicHolidaysParams,
    listPublicHolidays
  ),
  defineTool(
    {
      name: "get_public_holiday",
      description: "Get one public-holiday document by the exact raw ID returned by list_public_holidays.",
      category: CATEGORY,
      inputSchema: getPublicHolidayParamsJsonSchema,
      resultSchema: PublicHolidaySummarySchema
    },
    parseGetPublicHolidayParams,
    getPublicHoliday
  ),
  defineTool(
    {
      name: "create_public_holiday",
      description:
        "Create one public holiday for an exact department ID or full path. The date is a timezone-independent Gregorian calendar day stored as Huly TzDate with UTC offset 0; duplicate department/date pairs are rejected.",
      category: CATEGORY,
      inputSchema: createPublicHolidayParamsJsonSchema,
      resultSchema: CreatePublicHolidayResultSchema
    },
    parseCreatePublicHolidayParams,
    createPublicHoliday
  ),
  defineTool(
    {
      name: "update_public_holiday",
      description:
        "Update selected fields of one exact public-holiday ID. Department paths resolve exactly and duplicate department/date pairs are rejected. Omitted fields are preserved without a read-after-write query.",
      category: CATEGORY,
      inputSchema: updatePublicHolidayParamsJsonSchema,
      resultSchema: UpdatePublicHolidayResultSchema
    },
    parseUpdatePublicHolidayParams,
    updatePublicHoliday
  ),
  defineTool(
    {
      name: "delete_public_holiday",
      description: "Permanently delete one public-holiday document by exact raw ID.",
      category: CATEGORY,
      inputSchema: deletePublicHolidayParamsJsonSchema,
      resultSchema: DeletePublicHolidayResultSchema,
      annotations: { destructiveHint: true, idempotentHint: false }
    },
    parseDeletePublicHolidayParams,
    deletePublicHoliday
  ),
  defineTool(
    {
      name: "get_hr_schedule",
      description:
        "Return every HR request overlapping an inclusive UTC calendar-date range, every applicable holiday document, and one day cell per date. Department scope includes nested departments by default; holiday inheritance walks upward from each scoped department by default. No result cap is applied and complete=true certifies full cursor pagination.",
      category: CATEGORY,
      inputSchema: hrReportParamsJsonSchema,
      resultSchema: HrScheduleResultSchema
    },
    parseHrReportParams,
    getHrSchedule
  ),
  defineTool(
    {
      name: "get_hr_table",
      description:
        "Return a complete employee table for an inclusive UTC calendar-date range. Base workdays are Monday-Friday minus applicable inherited holiday dates; negative request types consume non-holiday workdays, positive types add calendar-day units, and zero types add none. No result cap is applied.",
      category: CATEGORY,
      inputSchema: hrReportParamsJsonSchema,
      resultSchema: HrTableResultSchema
    },
    parseHrReportParams,
    getHrTable
  ),
  defineTool(
    {
      name: "get_hr_summary_report",
      description:
        "Return complete request totals grouped by exact department and request type for an inclusive UTC date range. Requests are clipped to the range; calendar days include weekends, workdays exclude weekends and applicable inherited holidays, and signed units follow Huly request-type values. No result cap is applied.",
      category: CATEGORY,
      inputSchema: hrReportParamsJsonSchema,
      resultSchema: HrSummaryReportResultSchema
    },
    parseHrReportParams,
    getHrSummaryReport
  )
] as const satisfies ReadonlyArray<RegisteredTool>
