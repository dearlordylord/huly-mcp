import {
  createChannelParamsJsonSchema,
  deleteChannelParamsJsonSchema,
  getChannelParamsJsonSchema,
  listChannelMessagesParamsJsonSchema,
  listChannelsParamsJsonSchema,
  listDirectMessagesParamsJsonSchema,
  parseCreateChannelParams,
  parseDeleteChannelParams,
  parseGetChannelParams,
  parseListChannelMessagesParams,
  parseListChannelsParams,
  parseListDirectMessagesParams,
  parseSendChannelMessageParams,
  parseUpdateChannelParams,
  sendChannelMessageParamsJsonSchema,
  updateChannelParamsJsonSchema
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
import { createToolHandler, type RegisteredTool } from "./registry.js"

export const channelTools: ReadonlyArray<RegisteredTool> = [
  {
    name: "list_channels",
    description: "List all Huly channels. Returns channels sorted by name. Supports filtering by archived status.",
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
    inputSchema: listDirectMessagesParamsJsonSchema,
    handler: createToolHandler(
      "list_direct_messages",
      parseListDirectMessagesParams,
      (params) => listDirectMessages(params)
    )
  }
]
