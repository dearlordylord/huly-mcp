import {
  AddRecruitingAttachmentResultSchema,
  AddRecruitingCommentResultSchema,
  AddRecruitingRelatedIssueResultSchema,
  DeleteRecruitingAttachmentResultSchema,
  DeleteRecruitingCommentResultSchema,
  GetRecruitingAttachmentResultSchema,
  ListRecruitingActivityResultSchema,
  ListRecruitingAttachmentsResultSchema,
  ListRecruitingCommentsResultSchema,
  ListRecruitingRelatedIssuesResultSchema,
  RemoveRecruitingRelatedIssueResultSchema,
  UpdateRecruitingAttachmentResultSchema,
  UpdateRecruitingCommentResultSchema
} from "../../domain/schemas/recruiting-media-results.js"
import {
  addRecruitingAttachmentParamsJsonSchema,
  addRecruitingCommentParamsJsonSchema,
  addRecruitingRelatedIssueParamsJsonSchema,
  deleteRecruitingAttachmentParamsJsonSchema,
  deleteRecruitingCommentParamsJsonSchema,
  getRecruitingAttachmentParamsJsonSchema,
  listRecruitingActivityParamsJsonSchema,
  listRecruitingAttachmentsParamsJsonSchema,
  listRecruitingCommentsParamsJsonSchema,
  listRecruitingRelatedIssuesParamsJsonSchema,
  parseAddRecruitingAttachmentParams,
  parseAddRecruitingCommentParams,
  parseAddRecruitingRelatedIssueParams,
  parseDeleteRecruitingAttachmentParams,
  parseDeleteRecruitingCommentParams,
  parseGetRecruitingAttachmentParams,
  parseListRecruitingActivityParams,
  parseListRecruitingAttachmentsParams,
  parseListRecruitingCommentsParams,
  parseListRecruitingRelatedIssuesParams,
  parseRemoveRecruitingRelatedIssueParams,
  parseUpdateRecruitingAttachmentParams,
  parseUpdateRecruitingCommentParams,
  removeRecruitingRelatedIssueParamsJsonSchema,
  updateRecruitingAttachmentParamsJsonSchema,
  updateRecruitingCommentParamsJsonSchema
} from "../../domain/schemas/recruiting-media.js"
import {
  addRecruitingAttachment,
  addRecruitingComment,
  deleteRecruitingAttachment,
  deleteRecruitingComment,
  getRecruitingAttachment,
  listRecruitingActivity,
  listRecruitingAttachments,
  listRecruitingComments,
  updateRecruitingAttachment,
  updateRecruitingComment
} from "../../huly/operations/recruiting-media.js"
import {
  addRecruitingRelatedIssue,
  listRecruitingRelatedIssues,
  removeRecruitingRelatedIssue
} from "../../huly/operations/recruiting-related-issues.js"
import { defineCombinedTool, defineTool, type RegisteredTool } from "./registry.js"
const CATEGORY = "recruiting" as const
export const recruitingMediaTools: ReadonlyArray<RegisteredTool> = [
  defineTool(
    {
      name: "list_recruiting_comments",
      description:
        "List comments attached directly to a Recruiting vacancy, candidate, applicant, review, or opinion target. The target locator resolves friendly Recruiting identifiers and returns the resolved target ref.",
      category: CATEGORY,
      inputSchema: listRecruitingCommentsParamsJsonSchema,
      resultSchema: ListRecruitingCommentsResultSchema
    },
    parseListRecruitingCommentsParams,
    listRecruitingComments
  ),
  defineTool(
    {
      name: "add_recruiting_comment",
      description:
        "Add a Markdown comment directly to a Recruiting vacancy, candidate, applicant, review, or opinion target resolved by the shared target locator.",
      category: CATEGORY,
      inputSchema: addRecruitingCommentParamsJsonSchema,
      resultSchema: AddRecruitingCommentResultSchema
    },
    parseAddRecruitingCommentParams,
    addRecruitingComment
  ),
  defineTool(
    {
      name: "update_recruiting_comment",
      description:
        "Update one comment attached directly to a Recruiting vacancy, candidate, applicant, review, or opinion. The commentId must belong to the resolved target.",
      category: CATEGORY,
      inputSchema: updateRecruitingCommentParamsJsonSchema,
      resultSchema: UpdateRecruitingCommentResultSchema
    },
    parseUpdateRecruitingCommentParams,
    updateRecruitingComment
  ),
  defineTool(
    {
      name: "delete_recruiting_comment",
      description:
        "Delete one comment attached directly to a Recruiting vacancy, candidate, applicant, review, or opinion. The commentId must belong to the resolved target.",
      category: CATEGORY,
      inputSchema: deleteRecruitingCommentParamsJsonSchema,
      resultSchema: DeleteRecruitingCommentResultSchema
    },
    parseDeleteRecruitingCommentParams,
    deleteRecruitingComment
  ),
  defineTool(
    {
      name: "list_recruiting_attachments",
      description:
        "List files attached directly to a Recruiting vacancy, candidate, applicant, or opinion target. Review attachments are intentionally unsupported unless the model exposes that collection.",
      category: CATEGORY,
      inputSchema: listRecruitingAttachmentsParamsJsonSchema,
      resultSchema: ListRecruitingAttachmentsResultSchema
    },
    parseListRecruitingAttachmentsParams,
    listRecruitingAttachments
  ),
  defineCombinedTool(
    {
      name: "get_recruiting_attachment",
      description:
        "Get one file attached directly to a Recruiting vacancy, candidate, applicant, or opinion. The attachmentId must belong to the resolved target.",
      category: CATEGORY,
      inputSchema: getRecruitingAttachmentParamsJsonSchema,
      resultSchema: GetRecruitingAttachmentResultSchema
    },
    parseGetRecruitingAttachmentParams,
    getRecruitingAttachment
  ),
  defineCombinedTool(
    {
      name: "add_recruiting_attachment",
      description:
        "Attach a file to a Recruiting vacancy, candidate, applicant, or opinion target. Provide exactly one of filePath, fileUrl, or data, plus filename and contentType.",
      category: CATEGORY,
      inputSchema: addRecruitingAttachmentParamsJsonSchema,
      resultSchema: AddRecruitingAttachmentResultSchema
    },
    parseAddRecruitingAttachmentParams,
    addRecruitingAttachment
  ),
  defineTool(
    {
      name: "update_recruiting_attachment",
      description:
        "Update description and/or pinned state for a file attached directly to a Recruiting vacancy, candidate, applicant, or opinion. The attachmentId must belong to the resolved target.",
      category: CATEGORY,
      inputSchema: updateRecruitingAttachmentParamsJsonSchema,
      resultSchema: UpdateRecruitingAttachmentResultSchema
    },
    parseUpdateRecruitingAttachmentParams,
    updateRecruitingAttachment
  ),
  defineTool(
    {
      name: "delete_recruiting_attachment",
      description:
        "Delete one file attached directly to a Recruiting vacancy, candidate, applicant, or opinion. The attachmentId must belong to the resolved target.",
      category: CATEGORY,
      inputSchema: deleteRecruitingAttachmentParamsJsonSchema,
      resultSchema: DeleteRecruitingAttachmentResultSchema
    },
    parseDeleteRecruitingAttachmentParams,
    deleteRecruitingAttachment
  ),
  defineTool(
    {
      name: "list_recruiting_activity",
      description:
        "List read-only activity messages for a Recruiting vacancy, candidate, applicant, or review target resolved by friendly Recruiting identifiers. Opinions are intentionally unsupported.",
      category: CATEGORY,
      inputSchema: listRecruitingActivityParamsJsonSchema,
      resultSchema: ListRecruitingActivityResultSchema
    },
    parseListRecruitingActivityParams,
    listRecruitingActivity
  ),
  defineTool(
    {
      name: "list_recruiting_related_issues",
      description:
        "List tracker issues whose Huly Related Issues entries (`Issue.relations`) point at a Recruiting vacancy, candidate, or applicant target.",
      category: CATEGORY,
      inputSchema: listRecruitingRelatedIssuesParamsJsonSchema,
      resultSchema: ListRecruitingRelatedIssuesResultSchema
    },
    parseListRecruitingRelatedIssuesParams,
    listRecruitingRelatedIssues
  ),
  defineTool(
    {
      name: "add_recruiting_related_issue",
      description:
        "Idempotently add a Huly Related Issues entry (`Issue.relations`) from a tracker issue to a Recruiting vacancy, candidate, or applicant target.",
      category: CATEGORY,
      inputSchema: addRecruitingRelatedIssueParamsJsonSchema,
      resultSchema: AddRecruitingRelatedIssueResultSchema
    },
    parseAddRecruitingRelatedIssueParams,
    addRecruitingRelatedIssue
  ),
  defineTool(
    {
      name: "remove_recruiting_related_issue",
      description:
        "Idempotently remove a Huly Related Issues entry (`Issue.relations`) from a tracker issue to a Recruiting vacancy, candidate, or applicant target.",
      category: CATEGORY,
      inputSchema: removeRecruitingRelatedIssueParamsJsonSchema,
      resultSchema: RemoveRecruitingRelatedIssueResultSchema
    },
    parseRemoveRecruitingRelatedIssueParams,
    removeRecruitingRelatedIssue
  )
]
