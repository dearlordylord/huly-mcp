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
  addAttachment,
  addDocumentAttachment,
  addIssueAttachment,
  deleteAttachment,
  downloadAttachment,
  getAttachment,
  listAttachments,
  pinAttachment,
  updateAttachment
} from "../../huly/operations/attachments.js"
import { createCombinedToolHandler, createToolHandler, type RegisteredTool } from "./registry.js"

const CATEGORY = "Attachments" as const

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
      (params) => listAttachments(params)
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
      (params) => getAttachment(params)
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
      (params) => addAttachment(params)
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
      (params) => updateAttachment(params)
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
      (params) => deleteAttachment(params)
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
      (params) => pinAttachment(params)
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
      (params) => downloadAttachment(params)
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
      (params) => addIssueAttachment(params)
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
      (params) => addDocumentAttachment(params)
    )
  }
]
