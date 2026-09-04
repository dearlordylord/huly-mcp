import * as S from "../../domain/schemas/hr-request-media.js"
import * as O from "../../huly/operations/hr-request-media.js"
import { defineCombinedTool, defineTool, type RegisteredTool } from "./registry.js"

const CATEGORY = "hr" as const
export const hrRequestMediaTools = [
  defineTool(
    {
      name: "list_hr_request_comments",
      description: "List comments directly attached to an exact HR request ID, with total and truncation metadata.",
      category: CATEGORY,
      inputSchema: S.listHrRequestCommentsParamsJsonSchema,
      resultSchema: S.ListHrRequestCommentsResultSchema
    },
    S.parseListHrRequestCommentsParams,
    O.listHrRequestComments
  ),
  defineTool(
    {
      name: "add_hr_request_comment",
      description: "Add a Markdown comment directly to an exact HR request ID.",
      category: CATEGORY,
      inputSchema: S.addHrRequestCommentParamsJsonSchema,
      resultSchema: S.AddHrRequestCommentResultSchema
    },
    S.parseAddHrRequestCommentParams,
    O.addHrRequestComment
  ),
  defineTool(
    {
      name: "update_hr_request_comment",
      description: "Update a comment that belongs directly to an exact HR request.",
      category: CATEGORY,
      inputSchema: S.updateHrRequestCommentParamsJsonSchema,
      resultSchema: S.UpdateHrRequestCommentResultSchema
    },
    S.parseUpdateHrRequestCommentParams,
    O.updateHrRequestComment
  ),
  defineTool(
    {
      name: "delete_hr_request_comment",
      description: "Delete a comment that belongs directly to an exact HR request.",
      category: CATEGORY,
      inputSchema: S.deleteHrRequestCommentParamsJsonSchema,
      resultSchema: S.DeleteHrRequestCommentResultSchema
    },
    S.parseDeleteHrRequestCommentParams,
    O.deleteHrRequestComment
  ),
  defineTool(
    {
      name: "list_hr_request_attachments",
      description: "List files directly attached to an exact HR request ID, with total and truncation metadata.",
      category: CATEGORY,
      inputSchema: S.listHrRequestAttachmentsParamsJsonSchema,
      resultSchema: S.ListHrRequestAttachmentsResultSchema
    },
    S.parseListHrRequestAttachmentsParams,
    O.listHrRequestAttachments
  ),
  defineCombinedTool(
    {
      name: "get_hr_request_attachment",
      description: "Get one file belonging directly to an exact HR request.",
      category: CATEGORY,
      inputSchema: S.getHrRequestAttachmentParamsJsonSchema,
      resultSchema: S.GetHrRequestAttachmentResultSchema
    },
    S.parseGetHrRequestAttachmentParams,
    O.getHrRequestAttachment
  ),
  defineCombinedTool(
    {
      name: "add_hr_request_attachment",
      description:
        "Attach a file to an exact HR request. Provide filename, contentType, and exactly one of filePath, fileUrl, or base64 data.",
      category: CATEGORY,
      inputSchema: S.addHrRequestAttachmentParamsJsonSchema,
      resultSchema: S.AddHrRequestAttachmentResultSchema
    },
    S.parseAddHrRequestAttachmentParams,
    O.addHrRequestAttachment
  ),
  defineTool(
    {
      name: "update_hr_request_attachment",
      description: "Update description and/or pinned state for a file belonging directly to an exact HR request.",
      category: CATEGORY,
      inputSchema: S.updateHrRequestAttachmentParamsJsonSchema,
      resultSchema: S.UpdateHrRequestAttachmentResultSchema
    },
    S.parseUpdateHrRequestAttachmentParams,
    O.updateHrRequestAttachment
  ),
  defineTool(
    {
      name: "delete_hr_request_attachment",
      description: "Delete one file belonging directly to an exact HR request.",
      category: CATEGORY,
      inputSchema: S.deleteHrRequestAttachmentParamsJsonSchema,
      resultSchema: S.DeleteHrRequestAttachmentResultSchema
    },
    S.parseDeleteHrRequestAttachmentParams,
    O.deleteHrRequestAttachment
  )
] as const satisfies ReadonlyArray<RegisteredTool>
