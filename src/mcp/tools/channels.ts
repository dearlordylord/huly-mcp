import {
  addThreadReplyParamsJsonSchema,
  createChannelParamsJsonSchema,
  deleteChannelMessageParamsJsonSchema,
  deleteChannelParamsJsonSchema,
  deleteDmMessageParamsJsonSchema,
  deleteThreadReplyParamsJsonSchema,
  getChannelParamsJsonSchema,
  listChannelMessagesParamsJsonSchema,
  listChannelsParamsJsonSchema,
  listDirectMessagesParamsJsonSchema,
  listDmMessagesParamsJsonSchema,
  listThreadRepliesParamsJsonSchema,
  parseAddThreadReplyParams,
  parseCreateChannelParams,
  parseDeleteChannelMessageParams,
  parseDeleteChannelParams,
  parseDeleteDmMessageParams,
  parseDeleteThreadReplyParams,
  parseGetChannelParams,
  parseListChannelMessagesParams,
  parseListChannelsParams,
  parseListDirectMessagesParams,
  parseListDmMessagesParams,
  parseListThreadRepliesParams,
  parseSendChannelMessageParams,
  parseSendDmMessageParams,
  parseUpdateChannelMessageParams,
  parseUpdateChannelParams,
  parseUpdateDmMessageParams,
  parseUpdateThreadReplyParams,
  sendChannelMessageParamsJsonSchema,
  sendDmMessageParamsJsonSchema,
  updateChannelMessageParamsJsonSchema,
  updateChannelParamsJsonSchema,
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
  deleteDirectMessage,
  listDirectMessageMessages,
  sendDirectMessage,
  updateDirectMessage
} from "../../huly/operations/direct-messages.js"
import {
  addThreadReply,
  deleteThreadReply,
  listThreadReplies,
  updateThreadReply
} from "../../huly/operations/threads.js"
import { createToolHandler, type RegisteredTool } from "./registry.js"

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
    description: "Permanently delete a Huly channel. This action cannot be undone.",
    category: CATEGORY,
    inputSchema: deleteChannelParamsJsonSchema,
    handler: createToolHandler(
      "delete_channel",
      parseDeleteChannelParams,
      deleteChannel
    )
  },
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
    name: "list_dm_messages",
    description:
      "List messages in a direct-message conversation, newest first. The `dm` argument accepts either the DM `_id` or a participant display name (e.g. `Kerr,Shannon`); a name resolves to the DM whose members include that person's account.",
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
      "Send a message to a direct-message conversation. The `dm` argument accepts either the DM `_id` or a participant display name. Message body supports markdown formatting.",
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
    description: "Update a direct-message message. Only the body can be modified.",
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
    description: "Permanently delete a direct-message message. This action cannot be undone.",
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
  }
]
