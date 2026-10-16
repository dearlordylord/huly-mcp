import {
  addChatMessageAttachmentParamsJsonSchema,
  deleteChatMessageAttachmentParamsJsonSchema,
  getChatMessageAttachmentParamsJsonSchema,
  listChatMessageAttachmentsParamsJsonSchema,
  parseAddChatMessageAttachmentParams,
  parseDeleteChatMessageAttachmentParams,
  parseGetChatMessageAttachmentParams,
  parseListChatMessageAttachmentsParams,
  parseUpdateChatMessageAttachmentParams,
  updateChatMessageAttachmentParamsJsonSchema
} from "../../domain/schemas/chat-message-attachments.js"
import {
  AddChatMessageAttachmentResultSchema,
  DeleteChatMessageAttachmentResultSchema,
  GetChatMessageAttachmentResultSchema,
  ListChatMessageAttachmentsResultSchema,
  UpdateChatMessageAttachmentResultSchema
} from "../../domain/schemas/chat-message-attachment-results.js"
import { UPLOAD_SOURCE_SEMANTICS } from "../../domain/schemas/upload-source.js"
import {
  addChatMessageAttachment,
  deleteChatMessageAttachment,
  getChatMessageAttachment,
  listChatMessageAttachments,
  updateChatMessageAttachment
} from "../../huly/operations/chat-message-attachments.js"
import { defineCombinedTool, defineTool, type RegisteredTool } from "./registry.js"

const CATEGORY = "channels" as const

export const channelAttachmentTools = [
  defineTool(
    {
      name: "list_chat_message_attachments",
      description:
        "List files attached directly to a Huly chat message target. target.kind supports channel_message, dm_message, and thread_reply; the tool resolves channel names and one-to-one DM participant display names for you.",
      category: CATEGORY,
      inputSchema: listChatMessageAttachmentsParamsJsonSchema,
      resultSchema: ListChatMessageAttachmentsResultSchema
    },
    parseListChatMessageAttachmentsParams,
    listChatMessageAttachments
  ),
  defineCombinedTool(
    {
      name: "get_chat_message_attachment",
      description:
        "Get one file attached directly to a Huly channel message, direct-message message, or thread reply. The attachmentId must belong to the resolved target.",
      category: CATEGORY,
      inputSchema: getChatMessageAttachmentParamsJsonSchema,
      resultSchema: GetChatMessageAttachmentResultSchema
    },
    parseGetChatMessageAttachmentParams,
    getChatMessageAttachment
  ),
  defineCombinedTool(
    {
      name: "add_chat_message_attachment",
      description: `Attach a file directly to a Huly channel message, direct-message message, or thread reply. Provide filename, contentType, and exactly one source: ${UPLOAD_SOURCE_SEMANTICS}`,
      category: CATEGORY,
      inputSchema: addChatMessageAttachmentParamsJsonSchema,
      resultSchema: AddChatMessageAttachmentResultSchema
    },
    parseAddChatMessageAttachmentParams,
    addChatMessageAttachment
  ),
  defineTool(
    {
      name: "update_chat_message_attachment",
      description:
        "Update description and/or pinned state for a file attached directly to a Huly channel message, direct-message message, or thread reply. The attachmentId must belong to the resolved target.",
      category: CATEGORY,
      inputSchema: updateChatMessageAttachmentParamsJsonSchema,
      resultSchema: UpdateChatMessageAttachmentResultSchema
    },
    parseUpdateChatMessageAttachmentParams,
    updateChatMessageAttachment
  ),
  defineTool(
    {
      name: "delete_chat_message_attachment",
      description:
        "Delete one file attached directly to a Huly channel message, direct-message message, or thread reply. The attachmentId must belong to the resolved target.",
      category: CATEGORY,
      inputSchema: deleteChatMessageAttachmentParamsJsonSchema,
      resultSchema: DeleteChatMessageAttachmentResultSchema
    },
    parseDeleteChatMessageAttachmentParams,
    deleteChatMessageAttachment
  )
] as const satisfies ReadonlyArray<RegisteredTool>
