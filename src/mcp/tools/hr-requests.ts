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
  updateHrRequestParamsJsonSchema
} from "../../domain/schemas.js"
import {
  createHrRequest,
  deleteHrRequest,
  getHrRequest,
  listHrRequests,
  listHrRequestTypes,
  updateHrRequest
} from "../../huly/operations/hr-requests.js"
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
        "List HR requests with exact optional employee, department, and request-type filters. Calendar dates are inclusive YYYY-MM-DD values stored with UTC offset 0. Results include total, truncation, and nextOffset continuation metadata.",
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
  )
] as const satisfies ReadonlyArray<RegisteredTool>
