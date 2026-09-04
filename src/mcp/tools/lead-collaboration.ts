import {
  addLeadAttachmentParamsJsonSchema,
  AddLeadAttachmentResultSchema,
  addLeadCommentParamsJsonSchema,
  AddLeadLabelResultSchema,
  addLeadLabelParamsJsonSchema,
  deleteLeadAttachmentParamsJsonSchema,
  deleteLeadCommentParamsJsonSchema,
  getLeadAttachmentParamsJsonSchema,
  GetLeadAttachmentResultSchema,
  LeadAttachmentMutationResultSchema,
  LeadCommentMutationResultSchema,
  ListLeadAttachmentsResultSchema,
  listLeadAttachmentsParamsJsonSchema,
  ListLeadCommentsResultSchema,
  listLeadCommentsParamsJsonSchema,
  ListLeadLabelDefinitionsResultSchema,
  listLeadLabelDefinitionsParamsJsonSchema,
  ListLeadLabelsResultSchema,
  listLeadLabelsParamsJsonSchema,
  parseAddLeadAttachmentParams,
  parseAddLeadCommentParams,
  parseAddLeadLabelParams,
  parseDeleteLeadAttachmentParams,
  parseDeleteLeadCommentParams,
  parseGetLeadAttachmentParams,
  parseListLeadAttachmentsParams,
  parseListLeadCommentsParams,
  parseListLeadLabelDefinitionsParams,
  parseListLeadLabelsParams,
  parseRemoveLeadLabelParams,
  parseUpdateLeadAttachmentParams,
  parseUpdateLeadCommentParams,
  parseUpdateLeadLabelParams,
  removeLeadLabelParamsJsonSchema,
  RemoveLeadLabelResultSchema,
  updateLeadAttachmentParamsJsonSchema,
  updateLeadCommentParamsJsonSchema,
  updateLeadLabelParamsJsonSchema,
  UpdateLeadLabelResultSchema
} from "../../domain/schemas/lead-collaboration.js"
import {
  addLeadAttachment,
  addLeadComment,
  addLeadLabel,
  deleteLeadAttachment,
  deleteLeadComment,
  getLeadAttachment,
  listLeadAttachments,
  listLeadComments,
  listLeadLabelDefinitions,
  listLeadLabels,
  removeLeadLabel,
  updateLeadAttachment,
  updateLeadComment,
  updateLeadLabel
} from "../../huly/operations/lead-collaboration.js"
import { defineCombinedTool, defineTool, type RegisteredTool } from "./registry.js"

const CATEGORY = "leads" as const

export const leadCollaborationTools = [
  defineTool(
    {
      name: "list_lead_comments",
      description:
        "List native comments on one lead resolved by exact funnel ID/name and LEAD-<number>. Returns Markdown with native Huly references preserved.",
      category: CATEGORY,
      inputSchema: listLeadCommentsParamsJsonSchema,
      resultSchema: ListLeadCommentsResultSchema
    },
    parseListLeadCommentsParams,
    listLeadComments
  ),
  defineTool(
    {
      name: "add_lead_comment",
      description:
        "Add a Markdown comment to one exact lead. Current-workspace Huly links are stored as native references.",
      category: CATEGORY,
      inputSchema: addLeadCommentParamsJsonSchema,
      resultSchema: LeadCommentMutationResultSchema
    },
    parseAddLeadCommentParams,
    addLeadComment
  ),
  defineTool(
    {
      name: "update_lead_comment",
      description:
        "Update one comment belonging to an exact lead; comments attached elsewhere are rejected. Markdown native references are preserved.",
      category: CATEGORY,
      inputSchema: updateLeadCommentParamsJsonSchema,
      resultSchema: LeadCommentMutationResultSchema
    },
    parseUpdateLeadCommentParams,
    updateLeadComment
  ),
  defineTool(
    {
      name: "delete_lead_comment",
      description: "Delete one comment only when it belongs to the exact lead target.",
      category: CATEGORY,
      inputSchema: deleteLeadCommentParamsJsonSchema,
      resultSchema: LeadCommentMutationResultSchema
    },
    parseDeleteLeadCommentParams,
    deleteLeadComment
  ),
  defineTool(
    {
      name: "list_lead_attachments",
      description: "List native attachment references belonging to one exact lead.",
      category: CATEGORY,
      inputSchema: listLeadAttachmentsParamsJsonSchema,
      resultSchema: ListLeadAttachmentsResultSchema
    },
    parseListLeadAttachmentsParams,
    listLeadAttachments
  ),
  defineCombinedTool(
    {
      name: "add_lead_attachment",
      description:
        "Upload a local path, URL, or base64 payload and attach the native file reference to one exact lead.",
      category: CATEGORY,
      inputSchema: addLeadAttachmentParamsJsonSchema,
      resultSchema: AddLeadAttachmentResultSchema
    },
    parseAddLeadAttachmentParams,
    addLeadAttachment
  ),
  defineCombinedTool(
    {
      name: "get_lead_attachment",
      description: "Get metadata and a download URL for an attachment only when it belongs to one exact lead.",
      category: CATEGORY,
      inputSchema: getLeadAttachmentParamsJsonSchema,
      resultSchema: GetLeadAttachmentResultSchema
    },
    parseGetLeadAttachmentParams,
    getLeadAttachment
  ),
  defineTool(
    {
      name: "update_lead_attachment",
      description: "Update description or pinned state for an attachment only when it belongs to one exact lead.",
      category: CATEGORY,
      inputSchema: updateLeadAttachmentParamsJsonSchema,
      resultSchema: LeadAttachmentMutationResultSchema
    },
    parseUpdateLeadAttachmentParams,
    updateLeadAttachment
  ),
  defineTool(
    {
      name: "delete_lead_attachment",
      description:
        "Delete an attachment only when it belongs to one exact lead. The native blob reference remains governed by Huly storage cleanup.",
      category: CATEGORY,
      inputSchema: deleteLeadAttachmentParamsJsonSchema,
      resultSchema: LeadAttachmentMutationResultSchema
    },
    parseDeleteLeadAttachmentParams,
    deleteLeadAttachment
  ),
  defineTool(
    {
      name: "list_lead_label_definitions",
      description: "List reusable native label definitions whose target class is Lead, without raw class IDs.",
      category: CATEGORY,
      inputSchema: listLeadLabelDefinitionsParamsJsonSchema,
      resultSchema: ListLeadLabelDefinitionsResultSchema
    },
    parseListLeadLabelDefinitionsParams,
    listLeadLabelDefinitions
  ),
  defineTool(
    {
      name: "list_lead_labels",
      description: "List native TagReference label relations attached to one exact lead.",
      category: CATEGORY,
      inputSchema: listLeadLabelsParamsJsonSchema,
      resultSchema: ListLeadLabelsResultSchema
    },
    parseListLeadLabelsParams,
    listLeadLabels
  ),
  defineTool(
    {
      name: "add_lead_label",
      description:
        "Idempotently attach a label relation to one exact lead. Accepts a definition ID or exact title; a missing title creates the Lead label definition.",
      category: CATEGORY,
      inputSchema: addLeadLabelParamsJsonSchema,
      annotations: { idempotentHint: true },
      resultSchema: AddLeadLabelResultSchema
    },
    parseAddLeadLabelParams,
    addLeadLabel
  ),
  defineTool(
    {
      name: "update_lead_label",
      description:
        "Update the published optional weight on every matching TagReference relation for one exact lead and label.",
      category: CATEGORY,
      inputSchema: updateLeadLabelParamsJsonSchema,
      resultSchema: UpdateLeadLabelResultSchema
    },
    parseUpdateLeadLabelParams,
    updateLeadLabel
  ),
  defineTool(
    {
      name: "remove_lead_label",
      description:
        "Idempotently remove all matching TagReference relations from one exact lead without deleting the reusable label definition.",
      category: CATEGORY,
      inputSchema: removeLeadLabelParamsJsonSchema,
      annotations: { idempotentHint: true },
      resultSchema: RemoveLeadLabelResultSchema
    },
    parseRemoveLeadLabelParams,
    removeLeadLabel
  )
] as const satisfies ReadonlyArray<RegisteredTool>
