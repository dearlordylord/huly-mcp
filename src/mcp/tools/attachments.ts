import {
  createDrawingParamsJsonSchema,
  CreateDrawingResultSchema,
  deleteDrawingParamsJsonSchema,
  DeleteDrawingResultSchema,
  getDrawingParamsJsonSchema,
  GetDrawingResultSchema,
  listDrawingsParamsJsonSchema,
  ListDrawingsResultSchema,
  listSavedAttachmentsParamsJsonSchema,
  ListSavedAttachmentsResultSchema,
  parseCreateDrawingParams,
  parseDeleteDrawingParams,
  parseGetDrawingParams,
  parseListDrawingsParams,
  parseListSavedAttachmentsParams,
  parseSaveAttachmentParams,
  parseUnsaveAttachmentParams,
  parseUpdateDrawingParams,
  saveAttachmentParamsJsonSchema,
  SaveAttachmentResultSchema,
  unsaveAttachmentParamsJsonSchema,
  UnsaveAttachmentResultSchema,
  updateDrawingParamsJsonSchema,
  UpdateDrawingResultSchema
} from "../../domain/schemas/attachment-extras.js"
import {
  addAttachmentParamsJsonSchema,
  AddAttachmentResultSchema,
  addDocumentAttachmentParamsJsonSchema,
  addIssueAttachmentParamsJsonSchema,
  deleteAttachmentParamsJsonSchema,
  DeleteAttachmentResultSchema,
  downloadAttachmentParamsJsonSchema,
  DownloadAttachmentResultSchema,
  getAttachmentParamsJsonSchema,
  GetAttachmentResultSchema,
  listAttachmentsParamsJsonSchema,
  ListAttachmentsResultSchema,
  parseAddAttachmentParams,
  parseAddDocumentAttachmentParams,
  parseAddIssueAttachmentParams,
  parseDeleteAttachmentParams,
  parseDownloadAttachmentParams,
  parseGetAttachmentParams,
  parseListAttachmentsParams,
  parsePinAttachmentParams,
  parseUpdateAttachmentParams,
  pinAttachmentParamsJsonSchema,
  PinAttachmentResultSchema,
  updateAttachmentParamsJsonSchema,
  UpdateAttachmentResultSchema
} from "../../domain/schemas/attachments.js"
import {
  createDrawing,
  deleteDrawing,
  getDrawing,
  listDrawings,
  listSavedAttachments,
  saveAttachment,
  unsaveAttachment,
  updateDrawing
} from "../../huly/operations/attachment-extras.js"
import { addAttachment, addDocumentAttachment, addIssueAttachment } from "../../huly/operations/attachments-upload.js"
import {
  deleteAttachment,
  downloadAttachment,
  getAttachment,
  listAttachments,
  pinAttachment,
  updateAttachment
} from "../../huly/operations/attachments.js"
import { defineCombinedTool, defineTool, type RegisteredTool } from "./registry.js"
const CATEGORY = "attachments" as const
export const attachmentTools: ReadonlyArray<RegisteredTool> = [
  defineTool(
    {
      name: "list_attachments",
      description:
        "List attachments on a Huly object (issue, document, etc.). Returns attachments sorted by modification date (newest first).",
      category: CATEGORY,
      inputSchema: listAttachmentsParamsJsonSchema,
      resultSchema: ListAttachmentsResultSchema
    },
    parseListAttachmentsParams,
    listAttachments
  ),
  defineCombinedTool(
    {
      name: "get_attachment",
      description: "Retrieve full details for a Huly attachment including download URL.",
      category: CATEGORY,
      inputSchema: getAttachmentParamsJsonSchema,
      resultSchema: GetAttachmentResultSchema
    },
    parseGetAttachmentParams,
    getAttachment
  ),
  defineCombinedTool(
    {
      name: "add_attachment",
      description:
        "Add an attachment to a Huly object. Provide ONE of: filePath (local file - preferred), fileUrl (fetch from URL), or data (base64). Returns the attachment ID and download URL.",
      category: CATEGORY,
      inputSchema: addAttachmentParamsJsonSchema,
      resultSchema: AddAttachmentResultSchema
    },
    parseAddAttachmentParams,
    addAttachment
  ),
  defineTool(
    {
      name: "update_attachment",
      description: "Update attachment metadata (description, pinned status).",
      category: CATEGORY,
      inputSchema: updateAttachmentParamsJsonSchema,
      resultSchema: UpdateAttachmentResultSchema
    },
    parseUpdateAttachmentParams,
    updateAttachment
  ),
  defineTool(
    {
      name: "delete_attachment",
      description: "Permanently delete an attachment. This action cannot be undone.",
      category: CATEGORY,
      inputSchema: deleteAttachmentParamsJsonSchema,
      resultSchema: DeleteAttachmentResultSchema
    },
    parseDeleteAttachmentParams,
    deleteAttachment
  ),
  defineTool(
    {
      name: "pin_attachment",
      description: "Pin or unpin an attachment.",
      category: CATEGORY,
      inputSchema: pinAttachmentParamsJsonSchema,
      resultSchema: PinAttachmentResultSchema
    },
    parsePinAttachmentParams,
    pinAttachment
  ),
  defineCombinedTool(
    {
      name: "download_attachment",
      description: "Get download URL for an attachment along with file metadata (name, type, size).",
      category: CATEGORY,
      inputSchema: downloadAttachmentParamsJsonSchema,
      resultSchema: DownloadAttachmentResultSchema
    },
    parseDownloadAttachmentParams,
    downloadAttachment
  ),
  defineCombinedTool(
    {
      name: "add_issue_attachment",
      description:
        "Add an attachment to a Huly issue. Convenience method that finds the issue by project and identifier. Provide ONE of: filePath, fileUrl, or data.",
      category: CATEGORY,
      inputSchema: addIssueAttachmentParamsJsonSchema,
      resultSchema: AddAttachmentResultSchema
    },
    parseAddIssueAttachmentParams,
    addIssueAttachment
  ),
  defineCombinedTool(
    {
      name: "add_document_attachment",
      description:
        "Add an attachment to a Huly document. Convenience method that finds the document by teamspace and title/ID. Provide ONE of: filePath, fileUrl, or data.",
      category: CATEGORY,
      inputSchema: addDocumentAttachmentParamsJsonSchema,
      resultSchema: AddAttachmentResultSchema
    },
    parseAddDocumentAttachmentParams,
    addDocumentAttachment
  ),
  defineTool(
    {
      name: "save_attachment",
      description: "Save/bookmark an attachment for later reference. Idempotent when already saved.",
      category: CATEGORY,
      inputSchema: saveAttachmentParamsJsonSchema,
      resultSchema: SaveAttachmentResultSchema
    },
    parseSaveAttachmentParams,
    saveAttachment
  ),
  defineTool(
    {
      name: "unsave_attachment",
      description: "Remove an attachment from saved/bookmarks.",
      category: CATEGORY,
      inputSchema: unsaveAttachmentParamsJsonSchema,
      resultSchema: UnsaveAttachmentResultSchema
    },
    parseUnsaveAttachmentParams,
    unsaveAttachment
  ),
  defineTool(
    {
      name: "list_saved_attachments",
      description: "List saved/bookmarked attachments for the current user.",
      category: CATEGORY,
      inputSchema: listSavedAttachmentsParamsJsonSchema,
      resultSchema: ListSavedAttachmentsResultSchema
    },
    parseListSavedAttachmentsParams,
    listSavedAttachments
  ),
  defineTool(
    {
      name: "list_drawings",
      description: "List drawings attached to a raw Huly parent object.",
      category: CATEGORY,
      inputSchema: listDrawingsParamsJsonSchema,
      resultSchema: ListDrawingsResultSchema
    },
    parseListDrawingsParams,
    listDrawings
  ),
  defineTool(
    {
      name: "get_drawing",
      description: "Get a drawing by ID.",
      category: CATEGORY,
      inputSchema: getDrawingParamsJsonSchema,
      resultSchema: GetDrawingResultSchema
    },
    parseGetDrawingParams,
    getDrawing
  ),
  defineTool(
    {
      name: "create_drawing",
      description: "Create a drawing under a raw Huly parent object.",
      category: CATEGORY,
      inputSchema: createDrawingParamsJsonSchema,
      resultSchema: CreateDrawingResultSchema
    },
    parseCreateDrawingParams,
    createDrawing
  ),
  defineTool(
    {
      name: "update_drawing",
      description: "Update drawing content. Pass null content to clear it.",
      category: CATEGORY,
      inputSchema: updateDrawingParamsJsonSchema,
      resultSchema: UpdateDrawingResultSchema
    },
    parseUpdateDrawingParams,
    updateDrawing
  ),
  defineTool(
    {
      name: "delete_drawing",
      description: "Delete a drawing. This action cannot be undone.",
      category: CATEGORY,
      inputSchema: deleteDrawingParamsJsonSchema,
      resultSchema: DeleteDrawingResultSchema
    },
    parseDeleteDrawingParams,
    deleteDrawing
  )
]
