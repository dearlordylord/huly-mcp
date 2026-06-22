import {
  addApprovalRequestCommentParamsJsonSchema,
  addApprovalRequestParamsJsonSchema,
  ApprovalRequestMutationResultSchema,
  approveApprovalRequestParamsJsonSchema,
  cancelApprovalRequestParamsJsonSchema,
  getApprovalRequestParamsJsonSchema,
  GetApprovalRequestResultSchema,
  listApprovalRequestsParamsJsonSchema,
  ListApprovalRequestsResultSchema,
  parseAddApprovalRequestCommentParams,
  parseAddApprovalRequestParams,
  parseApproveApprovalRequestParams,
  parseCancelApprovalRequestParams,
  parseGetApprovalRequestParams,
  parseListApprovalRequestsParams,
  parseRejectApprovalRequestParams,
  rejectApprovalRequestParamsJsonSchema
} from "../../domain/schemas/approval-requests.js"
import {
  addApprovalRequest,
  addApprovalRequestComment,
  approveApprovalRequest,
  cancelApprovalRequest,
  rejectApprovalRequest
} from "../../huly/operations/approval-request-writes.js"
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
  ),
  defineTool(
    {
      name: "add_approval_request",
      description:
        "Create a generic Huly approval Request attached to any target document. Provide raw attachedTo and attachedToClass from the target, requested people as Person ids or exact email/name identifiers, and a real opaque Huly SDK tx payload. Omit space to resolve it from the target; collection defaults to requests. Returns the new request id without doing an immediate stale-prone read-after-write.",
      category: CATEGORY,
      inputSchema: addApprovalRequestParamsJsonSchema,
      resultSchema: ApprovalRequestMutationResultSchema
    },
    parseAddApprovalRequestParams,
    addApprovalRequest
  ),
  defineTool(
    {
      name: "add_approval_request_comment",
      description:
        "Add a plain markdown comment to an approval Request by request _id. This does not approve, reject, cancel, or create a decision comment mixin.",
      category: CATEGORY,
      inputSchema: addApprovalRequestCommentParamsJsonSchema,
      resultSchema: ApprovalRequestMutationResultSchema
    },
    parseAddApprovalRequestCommentParams,
    addApprovalRequestComment
  ),
  defineTool(
    {
      name: "approve_approval_request",
      description:
        "Approve an active approval Request as the current Huly user. The current user's Employee/Person ref must be in the request's requested list. Optionally attach a markdown decision comment before approval. If the current user already approved it, returns changed=false.",
      category: CATEGORY,
      inputSchema: approveApprovalRequestParamsJsonSchema,
      resultSchema: ApprovalRequestMutationResultSchema,
      annotations: { destructiveHint: false, idempotentHint: false }
    },
    parseApproveApprovalRequestParams,
    approveApprovalRequest
  ),
  defineTool(
    {
      name: "reject_approval_request",
      description:
        "Reject an active approval Request as the current Huly user and attach the required markdown rejection decision comment. Huly applies rejectedTx when present.",
      category: CATEGORY,
      inputSchema: rejectApprovalRequestParamsJsonSchema,
      resultSchema: ApprovalRequestMutationResultSchema,
      annotations: { destructiveHint: false, idempotentHint: false }
    },
    parseRejectApprovalRequestParams,
    rejectApprovalRequest
  ),
  defineTool(
    {
      name: "cancel_approval_request",
      description:
        "Cancel an active approval Request created by the current Huly user. This is the safe removal-from-workflow operation; hard delete is intentionally not exposed.",
      category: CATEGORY,
      inputSchema: cancelApprovalRequestParamsJsonSchema,
      resultSchema: ApprovalRequestMutationResultSchema,
      annotations: { destructiveHint: false, idempotentHint: false }
    },
    parseCancelApprovalRequestParams,
    cancelApprovalRequest
  )
]
