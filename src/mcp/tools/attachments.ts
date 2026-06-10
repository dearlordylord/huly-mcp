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
  addDocumentAttachmentParamsJsonSchema,
  addIssueAttachmentParamsJsonSchema,
  deleteAttachmentParamsJsonSchema,
  downloadAttachmentParamsJsonSchema,
  getAttachmentParamsJsonSchema,
  listAttachmentsParamsJsonSchema,
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
  updateAttachmentParamsJsonSchema
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
import {
  createCombinedToolHandler,
  createEncodedToolHandler,
  createToolHandler,
  type RegisteredTool
} from "./registry.js"

const CATEGORY = "attachments" as const

export const attachmentTools: ReadonlyArray<RegisteredTool> = [
  {
    name: "list_attachments",
    description:
      "List attachments on a Huly object (issue, document, etc.). Returns attachments sorted by modification date (newest first).",
    category: CATEGORY,
    inputSchema: listAttachmentsParamsJsonSchema,
    handler: createToolHandler(
      "list_attachments",
      parseListAttachmentsParams,
      listAttachments
    )
  },
  {
    name: "get_attachment",
    description: "Retrieve full details for a Huly attachment including download URL.",
    category: CATEGORY,
    inputSchema: getAttachmentParamsJsonSchema,
    handler: createCombinedToolHandler(
      "get_attachment",
      parseGetAttachmentParams,
      getAttachment
    )
  },
  {
    name: "add_attachment",
    description:
      "Add an attachment to a Huly object. Provide ONE of: filePath (local file - preferred), fileUrl (fetch from URL), or data (base64). Returns the attachment ID and download URL.",
    category: CATEGORY,
    inputSchema: addAttachmentParamsJsonSchema,
    handler: createCombinedToolHandler(
      "add_attachment",
      parseAddAttachmentParams,
      addAttachment
    )
  },
  {
    name: "update_attachment",
    description: "Update attachment metadata (description, pinned status).",
    category: CATEGORY,
    inputSchema: updateAttachmentParamsJsonSchema,
    handler: createToolHandler(
      "update_attachment",
      parseUpdateAttachmentParams,
      updateAttachment
    )
  },
  {
    name: "delete_attachment",
    description: "Permanently delete an attachment. This action cannot be undone.",
    category: CATEGORY,
    inputSchema: deleteAttachmentParamsJsonSchema,
    handler: createToolHandler(
      "delete_attachment",
      parseDeleteAttachmentParams,
      deleteAttachment
    )
  },
  {
    name: "pin_attachment",
    description: "Pin or unpin an attachment.",
    category: CATEGORY,
    inputSchema: pinAttachmentParamsJsonSchema,
    handler: createToolHandler(
      "pin_attachment",
      parsePinAttachmentParams,
      pinAttachment
    )
  },
  {
    name: "download_attachment",
    description: "Get download URL for an attachment along with file metadata (name, type, size).",
    category: CATEGORY,
    inputSchema: downloadAttachmentParamsJsonSchema,
    handler: createCombinedToolHandler(
      "download_attachment",
      parseDownloadAttachmentParams,
      downloadAttachment
    )
  },
  {
    name: "add_issue_attachment",
    description:
      "Add an attachment to a Huly issue. Convenience method that finds the issue by project and identifier. Provide ONE of: filePath, fileUrl, or data.",
    category: CATEGORY,
    inputSchema: addIssueAttachmentParamsJsonSchema,
    handler: createCombinedToolHandler(
      "add_issue_attachment",
      parseAddIssueAttachmentParams,
      addIssueAttachment
    )
  },
  {
    name: "add_document_attachment",
    description:
      "Add an attachment to a Huly document. Convenience method that finds the document by teamspace and title/ID. Provide ONE of: filePath, fileUrl, or data.",
    category: CATEGORY,
    inputSchema: addDocumentAttachmentParamsJsonSchema,
    handler: createCombinedToolHandler(
      "add_document_attachment",
      parseAddDocumentAttachmentParams,
      addDocumentAttachment
    )
  },
  {
    name: "save_attachment",
    description: "Save/bookmark an attachment for later reference. Idempotent when already saved.",
    category: CATEGORY,
    inputSchema: saveAttachmentParamsJsonSchema,
    handler: createEncodedToolHandler(
      "save_attachment",
      parseSaveAttachmentParams,
      saveAttachment,
      SaveAttachmentResultSchema
    )
  },
  {
    name: "unsave_attachment",
    description: "Remove an attachment from saved/bookmarks.",
    category: CATEGORY,
    inputSchema: unsaveAttachmentParamsJsonSchema,
    handler: createEncodedToolHandler(
      "unsave_attachment",
      parseUnsaveAttachmentParams,
      unsaveAttachment,
      UnsaveAttachmentResultSchema
    )
  },
  {
    name: "list_saved_attachments",
    description: "List saved/bookmarked attachments for the current user.",
    category: CATEGORY,
    inputSchema: listSavedAttachmentsParamsJsonSchema,
    handler: createEncodedToolHandler(
      "list_saved_attachments",
      parseListSavedAttachmentsParams,
      listSavedAttachments,
      ListSavedAttachmentsResultSchema
    )
  },
  {
    name: "list_drawings",
    description: "List drawings attached to a raw Huly parent object.",
    category: CATEGORY,
    inputSchema: listDrawingsParamsJsonSchema,
    handler: createEncodedToolHandler(
      "list_drawings",
      parseListDrawingsParams,
      listDrawings,
      ListDrawingsResultSchema
    )
  },
  {
    name: "get_drawing",
    description: "Get a drawing by ID.",
    category: CATEGORY,
    inputSchema: getDrawingParamsJsonSchema,
    handler: createEncodedToolHandler(
      "get_drawing",
      parseGetDrawingParams,
      getDrawing,
      GetDrawingResultSchema
    )
  },
  {
    name: "create_drawing",
    description: "Create a drawing under a raw Huly parent object.",
    category: CATEGORY,
    inputSchema: createDrawingParamsJsonSchema,
    handler: createEncodedToolHandler(
      "create_drawing",
      parseCreateDrawingParams,
      createDrawing,
      CreateDrawingResultSchema
    )
  },
  {
    name: "update_drawing",
    description: "Update drawing content. Pass null content to clear it.",
    category: CATEGORY,
    inputSchema: updateDrawingParamsJsonSchema,
    handler: createEncodedToolHandler(
      "update_drawing",
      parseUpdateDrawingParams,
      updateDrawing,
      UpdateDrawingResultSchema
    )
  },
  {
    name: "delete_drawing",
    description: "Delete a drawing. This action cannot be undone.",
    category: CATEGORY,
    inputSchema: deleteDrawingParamsJsonSchema,
    handler: createEncodedToolHandler(
      "delete_drawing",
      parseDeleteDrawingParams,
      deleteDrawing,
      DeleteDrawingResultSchema
    )
  }
]
