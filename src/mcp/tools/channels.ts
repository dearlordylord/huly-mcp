import {
  addChatMessageAttachmentParamsJsonSchema,
  AddChatMessageAttachmentResultSchema,
  addThreadReplyParamsJsonSchema,
  createChannelParamsJsonSchema,
  createDirectMessageParamsJsonSchema,
  deleteChannelMessageParamsJsonSchema,
  deleteChannelParamsJsonSchema,
  deleteChatMessageAttachmentParamsJsonSchema,
  DeleteChatMessageAttachmentResultSchema,
  deleteDmMessageParamsJsonSchema,
  deleteThreadReplyParamsJsonSchema,
  getChannelParamsJsonSchema,
  getChatMessageAttachmentParamsJsonSchema,
  GetChatMessageAttachmentResultSchema,
  listChannelMessagesParamsJsonSchema,
  listChannelsParamsJsonSchema,
  listChatMessageAttachmentsParamsJsonSchema,
  ListChatMessageAttachmentsResultSchema,
  listDirectMessagesParamsJsonSchema,
  listDmMessagesParamsJsonSchema,
  listExternalChannelMessagesParamsJsonSchema,
  listThreadRepliesParamsJsonSchema,
  parseAddChatMessageAttachmentParams,
  parseAddThreadReplyParams,
  parseCreateChannelParams,
  parseCreateDirectMessageParams,
  parseDeleteChannelMessageParams,
  parseDeleteChannelParams,
  parseDeleteChatMessageAttachmentParams,
  parseDeleteDmMessageParams,
  parseDeleteThreadReplyParams,
  parseGetChannelParams,
  parseGetChatMessageAttachmentParams,
  parseListChannelMessagesParams,
  parseListChannelsParams,
  parseListChatMessageAttachmentsParams,
  parseListDirectMessagesParams,
  parseListDmMessagesParams,
  parseListExternalChannelMessagesParams,
  parseListThreadRepliesParams,
  parseSendChannelMessageParams,
  parseSendDmMessageParams,
  parseUpdateChannelMessageParams,
  parseUpdateChannelParams,
  parseUpdateChatMessageAttachmentParams,
  parseUpdateDmMessageParams,
  parseUpdateThreadReplyParams,
  sendChannelMessageParamsJsonSchema,
  sendDmMessageParamsJsonSchema,
  updateChannelMessageParamsJsonSchema,
  updateChannelParamsJsonSchema,
  updateChatMessageAttachmentParamsJsonSchema,
  UpdateChatMessageAttachmentResultSchema,
  updateDmMessageParamsJsonSchema,
  updateThreadReplyParamsJsonSchema
} from "../../domain/schemas.js"
import {
  createChannel,
  deleteChannel,
  deleteChannelMessage,
  getChannel,
  listChannelMessages,
  listChannels,
  listDirectMessages,
  sendChannelMessage,
  updateChannel,
  updateChannelMessage
} from "../../huly/operations/channels.js"
import {
  addChatMessageAttachment,
  deleteChatMessageAttachment,
  getChatMessageAttachment,
  listChatMessageAttachments,
  updateChatMessageAttachment
} from "../../huly/operations/chat-message-attachments.js"
import {
  createDirectMessage,
  deleteDirectMessage,
  listDirectMessageMessages,
  sendDirectMessage,
  updateDirectMessage
} from "../../huly/operations/direct-messages.js"
import { listExternalChannelMessages } from "../../huly/operations/external-channel-messages.js"
import {
  addThreadReply,
  deleteThreadReply,
  listThreadReplies,
  updateThreadReply
} from "../../huly/operations/threads.js"
import { channelConversationTools } from "./channel-conversations.js"
import {
  createEncodedCombinedToolHandler,
  createEncodedToolHandler,
  createToolHandler,
  type RegisteredTool
} from "./registry.js"

const CATEGORY = "channels" as const

export const channelTools: ReadonlyArray<RegisteredTool> = [
  {
    name: "list_channels",
    description:
      "List all Huly channels. Returns channels sorted by name. Supports filtering by archived status. Supports searching by name substring (nameSearch) and topic substring (topicSearch).",
    category: CATEGORY,
    inputSchema: listChannelsParamsJsonSchema,
    handler: createToolHandler(
      "list_channels",
      parseListChannelsParams,
      listChannels
    )
  },
  {
    name: "get_channel",
    description: "Retrieve full details for a Huly channel including topic and member list.",
    category: CATEGORY,
    inputSchema: getChannelParamsJsonSchema,
    handler: createToolHandler(
      "get_channel",
      parseGetChannelParams,
      getChannel
    )
  },
  {
    name: "create_channel",
    description: "Create a new channel in Huly. Returns the created channel ID and name.",
    category: CATEGORY,
    inputSchema: createChannelParamsJsonSchema,
    handler: createToolHandler(
      "create_channel",
      parseCreateChannelParams,
      createChannel
    )
  },
  {
    name: "update_channel",
    description: "Update fields on an existing Huly channel. Only provided fields are modified.",
    category: CATEGORY,
    inputSchema: updateChannelParamsJsonSchema,
    handler: createToolHandler(
      "update_channel",
      parseUpdateChannelParams,
      updateChannel
    )
  },
  {
    name: "delete_channel",
    description:
      "Permanently delete a Huly channel. This action cannot be undone. For reversible channel lifecycle changes, use archive_channel and unarchive_channel instead.",
    category: CATEGORY,
    inputSchema: deleteChannelParamsJsonSchema,
    handler: createToolHandler(
      "delete_channel",
      parseDeleteChannelParams,
      deleteChannel
    )
  },
  ...channelConversationTools,
  {
    name: "list_channel_messages",
    description: "List messages in a Huly channel. Returns messages sorted by date (newest first).",
    category: CATEGORY,
    inputSchema: listChannelMessagesParamsJsonSchema,
    handler: createToolHandler(
      "list_channel_messages",
      parseListChannelMessagesParams,
      listChannelMessages
    )
  },
  {
    name: "list_external_channel_messages",
    description:
      "List read-only messages for an external Gmail or Telegram channel by channel name or ID. The limit defaults to 50 and is capped at 200. When this build does not include a compatible Huly external-message SDK/model for the requested provider, returns supported=false, an unsupportedReason, and an empty messages array; it never sends, replies, deletes, mutates, or returns fake messages.",
    category: CATEGORY,
    inputSchema: listExternalChannelMessagesParamsJsonSchema,
    handler: createToolHandler(
      "list_external_channel_messages",
      parseListExternalChannelMessagesParams,
      listExternalChannelMessages
    )
  },
  {
    name: "send_channel_message",
    description: "Send a message to a Huly channel. Message body supports markdown formatting.",
    category: CATEGORY,
    inputSchema: sendChannelMessageParamsJsonSchema,
    handler: createToolHandler(
      "send_channel_message",
      parseSendChannelMessageParams,
      sendChannelMessage
    )
  },
  {
    name: "update_channel_message",
    description: "Update a channel message. Only the body can be modified.",
    category: CATEGORY,
    inputSchema: updateChannelMessageParamsJsonSchema,
    handler: createToolHandler(
      "update_channel_message",
      parseUpdateChannelMessageParams,
      updateChannelMessage
    )
  },
  {
    name: "delete_channel_message",
    description: "Permanently delete a channel message. This action cannot be undone.",
    category: CATEGORY,
    inputSchema: deleteChannelMessageParamsJsonSchema,
    handler: createToolHandler(
      "delete_channel_message",
      parseDeleteChannelMessageParams,
      deleteChannelMessage
    )
  },
  {
    name: "list_direct_messages",
    description: "List direct message conversations in Huly. Returns conversations sorted by date (newest first).",
    category: CATEGORY,
    inputSchema: listDirectMessagesParamsJsonSchema,
    handler: createToolHandler(
      "list_direct_messages",
      parseListDirectMessagesParams,
      listDirectMessages
    )
  },
  {
    name: "create_direct_message",
    description:
      "Open a one-to-one direct-message conversation with a workspace member. The `person` argument accepts an email or exact display name (e.g. `Smith,Bill`). Idempotent: if a DM with that participant already exists, returns it (`created: false`); otherwise creates a new DM (`created: true`). The returned `id` can be passed as `dm` to send_dm_message, list_dm_messages, etc.",
    category: CATEGORY,
    inputSchema: createDirectMessageParamsJsonSchema,
    handler: createToolHandler(
      "create_direct_message",
      parseCreateDirectMessageParams,
      createDirectMessage
    )
  },
  {
    name: "list_dm_messages",
    description:
      "List messages in a direct-message conversation, newest first. The `dm` argument accepts either the DM `_id` or a participant display name (e.g. `Kerr,Shannon`); a name resolves only to a one-to-one DM with the authenticated account.",
    category: CATEGORY,
    inputSchema: listDmMessagesParamsJsonSchema,
    handler: createToolHandler(
      "list_dm_messages",
      parseListDmMessagesParams,
      listDirectMessageMessages
    )
  },
  {
    name: "send_dm_message",
    description:
      "Send a message to a direct-message conversation. The `dm` argument accepts either the DM `_id` or a participant display name; a name resolves only to a one-to-one DM with the authenticated account. Message body supports markdown formatting.",
    category: CATEGORY,
    inputSchema: sendDmMessageParamsJsonSchema,
    handler: createToolHandler(
      "send_dm_message",
      parseSendDmMessageParams,
      sendDirectMessage
    )
  },
  {
    name: "update_dm_message",
    description:
      "Update a direct-message message. The `dm` argument accepts either the DM `_id` or a participant display name; a name resolves only to a one-to-one DM with the authenticated account. Only the body can be modified.",
    category: CATEGORY,
    inputSchema: updateDmMessageParamsJsonSchema,
    handler: createToolHandler(
      "update_dm_message",
      parseUpdateDmMessageParams,
      updateDirectMessage
    )
  },
  {
    name: "delete_dm_message",
    description:
      "Permanently delete a direct-message message. The `dm` argument accepts either the DM `_id` or a participant display name; a name resolves only to a one-to-one DM with the authenticated account. This action cannot be undone.",
    category: CATEGORY,
    inputSchema: deleteDmMessageParamsJsonSchema,
    handler: createToolHandler(
      "delete_dm_message",
      parseDeleteDmMessageParams,
      deleteDirectMessage
    )
  },
  {
    name: "list_thread_replies",
    description: "List replies in a message thread. Returns replies sorted by date (oldest first).",
    category: CATEGORY,
    inputSchema: listThreadRepliesParamsJsonSchema,
    handler: createToolHandler(
      "list_thread_replies",
      parseListThreadRepliesParams,
      listThreadReplies
    )
  },
  {
    name: "add_thread_reply",
    description: "Add a reply to a message thread. Reply body supports markdown formatting.",
    category: CATEGORY,
    inputSchema: addThreadReplyParamsJsonSchema,
    handler: createToolHandler(
      "add_thread_reply",
      parseAddThreadReplyParams,
      addThreadReply
    )
  },
  {
    name: "update_thread_reply",
    description: "Update a thread reply. Only the body can be modified.",
    category: CATEGORY,
    inputSchema: updateThreadReplyParamsJsonSchema,
    handler: createToolHandler(
      "update_thread_reply",
      parseUpdateThreadReplyParams,
      updateThreadReply
    )
  },
  {
    name: "delete_thread_reply",
    description: "Permanently delete a thread reply. This action cannot be undone.",
    category: CATEGORY,
    inputSchema: deleteThreadReplyParamsJsonSchema,
    handler: createToolHandler(
      "delete_thread_reply",
      parseDeleteThreadReplyParams,
      deleteThreadReply
    )
  },
  {
    name: "list_chat_message_attachments",
    description:
      "List files attached directly to a Huly chat message target. target.kind supports channel_message, dm_message, and thread_reply; the tool resolves channel names and one-to-one DM participant display names for you.",
    category: CATEGORY,
    inputSchema: listChatMessageAttachmentsParamsJsonSchema,
    handler: createEncodedToolHandler(
      "list_chat_message_attachments",
      parseListChatMessageAttachmentsParams,
      listChatMessageAttachments,
      ListChatMessageAttachmentsResultSchema
    )
  },
  {
    name: "get_chat_message_attachment",
    description:
      "Get one file attached directly to a Huly channel message, direct-message message, or thread reply. The attachmentId must belong to the resolved target.",
    category: CATEGORY,
    inputSchema: getChatMessageAttachmentParamsJsonSchema,
    handler: createEncodedCombinedToolHandler(
      "get_chat_message_attachment",
      parseGetChatMessageAttachmentParams,
      getChatMessageAttachment,
      GetChatMessageAttachmentResultSchema
    )
  },
  {
    name: "add_chat_message_attachment",
    description:
      "Attach a file directly to a Huly channel message, direct-message message, or thread reply. Provide filename, contentType, and exactly one of filePath, fileUrl, or data.",
    category: CATEGORY,
    inputSchema: addChatMessageAttachmentParamsJsonSchema,
    handler: createEncodedCombinedToolHandler(
      "add_chat_message_attachment",
      parseAddChatMessageAttachmentParams,
      addChatMessageAttachment,
      AddChatMessageAttachmentResultSchema
    )
  },
  {
    name: "update_chat_message_attachment",
    description:
      "Update description and/or pinned state for a file attached directly to a Huly channel message, direct-message message, or thread reply. The attachmentId must belong to the resolved target.",
    category: CATEGORY,
    inputSchema: updateChatMessageAttachmentParamsJsonSchema,
    handler: createEncodedToolHandler(
      "update_chat_message_attachment",
      parseUpdateChatMessageAttachmentParams,
      updateChatMessageAttachment,
      UpdateChatMessageAttachmentResultSchema
    )
  },
  {
    name: "delete_chat_message_attachment",
    description:
      "Delete one file attached directly to a Huly channel message, direct-message message, or thread reply. The attachmentId must belong to the resolved target.",
    category: CATEGORY,
    inputSchema: deleteChatMessageAttachmentParamsJsonSchema,
    handler: createEncodedToolHandler(
      "delete_chat_message_attachment",
      parseDeleteChatMessageAttachmentParams,
      deleteChatMessageAttachment,
      DeleteChatMessageAttachmentResultSchema
    )
  }
]
