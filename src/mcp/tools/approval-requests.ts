import {
  getApprovalRequestParamsJsonSchema,
  GetApprovalRequestResultSchema,
  listApprovalRequestsParamsJsonSchema,
  ListApprovalRequestsResultSchema,
  parseGetApprovalRequestParams,
  parseListApprovalRequestsParams
} from "../../domain/schemas/approval-requests.js"
import { getApprovalRequest, listApprovalRequests } from "../../huly/operations/approval-requests.js"
import { defineTool, type RegisteredTool } from "./registry.js"

const CATEGORY = "approvals" as const

export const approvalRequestTools: ReadonlyArray<RegisteredTool> = [
  defineTool(
    {
      name: "list_approval_requests",
      description:
        "List generic Huly approval Request documents from the published @hcengineering/request SDK package. This is read-only discovery: filter by status, raw attachedTo document id, and/or raw attachedToClass class id when you know the target document. Omit filters to inspect recent approval requests across modules.",
      category: CATEGORY,
      inputSchema: listApprovalRequestsParamsJsonSchema,
      resultSchema: ListApprovalRequestsResultSchema
    },
    parseListApprovalRequestsParams,
    listApprovalRequests
  ),
  defineTool(
    {
      name: "get_approval_request",
      description:
        "Read one generic Huly approval Request document by raw request _id. Returns person refs with best-effort contact metadata plus the opaque SDK tx/rejectedTx payloads for inspection; approval mutations are intentionally not exposed by this read-only tool.",
      category: CATEGORY,
      inputSchema: getApprovalRequestParamsJsonSchema,
      resultSchema: GetApprovalRequestResultSchema
    },
    parseGetApprovalRequestParams,
    getApprovalRequest
  )
]
