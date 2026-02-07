import {
  addThreadReplyParamsJsonSchema,
  createChannelParamsJsonSchema,
  deleteChannelParamsJsonSchema,
  deleteThreadReplyParamsJsonSchema,
  getChannelParamsJsonSchema,
  listChannelMessagesParamsJsonSchema,
  listChannelsParamsJsonSchema,
  listDirectMessagesParamsJsonSchema,
  listThreadRepliesParamsJsonSchema,
  parseAddThreadReplyParams,
  parseCreateChannelParams,
  parseDeleteChannelParams,
  parseDeleteThreadReplyParams,
  parseGetChannelParams,
  parseListChannelMessagesParams,
  parseListChannelsParams,
  parseListDirectMessagesParams,
  parseListThreadRepliesParams,
  parseSendChannelMessageParams,
  parseUpdateChannelParams,
  parseUpdateThreadReplyParams,
  sendChannelMessageParamsJsonSchema,
  updateChannelParamsJsonSchema,
  updateThreadReplyParamsJsonSchema
} from "../../domain/schemas.js"
import {
  createChannel,
  deleteChannel,
  getChannel,
  listChannelMessages,
  listChannels,
  listDirectMessages,
  sendChannelMessage,
  updateChannel
} from "../../huly/operations/channels.js"
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
      (params) => listChannels(params)
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
      (params) => getChannel(params)
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
      (params) => createChannel(params)
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
      (params) => updateChannel(params)
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
      (params) => deleteChannel(params)
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
      (params) => listChannelMessages(params)
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
      (params) => sendChannelMessage(params)
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
      (params) => listDirectMessages(params)
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
      (params) => listThreadReplies(params)
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
      (params) => addThreadReply(params)
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
      (params) => updateThreadReply(params)
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
      (params) => deleteThreadReply(params)
    )
  }
]
