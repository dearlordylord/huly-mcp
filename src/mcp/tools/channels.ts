import {
  addThreadReplyParamsJsonSchema,
  createChannelParamsJsonSchema,
  createDirectMessageParamsJsonSchema,
  deleteChannelMessageParamsJsonSchema,
  deleteChannelParamsJsonSchema,
  deleteDmMessageParamsJsonSchema,
  deleteThreadReplyParamsJsonSchema,
  getChannelParamsJsonSchema,
  HULY_NATIVE_REFERENCE_MARKDOWN_INPUT,
  listChannelMessagesParamsJsonSchema,
  listChannelsParamsJsonSchema,
  listDirectMessagesParamsJsonSchema,
  listDmMessagesParamsJsonSchema,
  listExternalChannelMessagesParamsJsonSchema,
  listThreadRepliesParamsJsonSchema,
  parseAddThreadReplyParams,
  parseCreateChannelParams,
  parseCreateDirectMessageParams,
  parseDeleteChannelMessageParams,
  parseDeleteChannelParams,
  parseDeleteDmMessageParams,
  parseDeleteThreadReplyParams,
  parseGetChannelParams,
  parseListChannelMessagesParams,
  parseListChannelsParams,
  parseListDirectMessagesParams,
  parseListDmMessagesParams,
  parseListExternalChannelMessagesParams,
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
  AddThreadReplyResultSchema,
  ChannelSchema,
  CreateChannelResultSchema,
  DeleteChannelMessageResultSchema,
  DeleteChannelResultSchema,
  DeleteThreadReplyResultSchema,
  ListChannelMessagesResultSchema,
  ListChannelsResultSchema,
  ListDirectMessagesResultSchema,
  ListThreadRepliesResultSchema,
  SendChannelMessageResultSchema,
  UpdateChannelMessageResultSchema,
  UpdateChannelResultSchema,
  UpdateThreadReplyResultSchema
} from "../../domain/schemas/channels.js"
import {
  CreateDirectMessageResultSchema,
  DeleteDmMessageResultSchema,
  ListDmMessagesResultSchema,
  SendDmMessageResultSchema,
  UpdateDmMessageResultSchema
} from "../../domain/schemas/direct-messages.js"
import { ListExternalChannelMessagesResultSchema } from "../../domain/schemas/external-channel-messages.js"
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
import { channelMessageWorkflowTools } from "./channel-message-workflow-tools.js"
import { channelAttachmentTools } from "./channel-attachment-tools.js"
import { defineTool, type RegisteredTool } from "./registry.js"
const CATEGORY = "channels" as const
export const channelTools = [
  defineTool(
    {
      name: "list_channels",
      description:
        "List all Huly channels. Returns channels sorted by name. Supports filtering by archived status. Supports searching by name substring (nameSearch) and topic substring (topicSearch).",
      category: CATEGORY,
      inputSchema: listChannelsParamsJsonSchema,
      resultSchema: ListChannelsResultSchema
    },
    parseListChannelsParams,
    listChannels
  ),
  defineTool(
    {
      name: "get_channel",
      description: "Retrieve full details for a Huly channel including topic and member list.",
      category: CATEGORY,
      inputSchema: getChannelParamsJsonSchema,
      resultSchema: ChannelSchema
    },
    parseGetChannelParams,
    getChannel
  ),
  defineTool(
    {
      name: "create_channel",
      description: "Create a new channel in Huly. Returns the created channel ID and name.",
      category: CATEGORY,
      inputSchema: createChannelParamsJsonSchema,
      resultSchema: CreateChannelResultSchema
    },
    parseCreateChannelParams,
    createChannel
  ),
  defineTool(
    {
      name: "update_channel",
      description: "Update fields on an existing Huly channel. Only provided fields are modified.",
      category: CATEGORY,
      inputSchema: updateChannelParamsJsonSchema,
      resultSchema: UpdateChannelResultSchema
    },
    parseUpdateChannelParams,
    updateChannel
  ),
  defineTool(
    {
      name: "delete_channel",
      description:
        "Permanently delete a Huly channel. This action cannot be undone. For reversible channel lifecycle changes, use archive_channel and unarchive_channel instead.",
      category: CATEGORY,
      inputSchema: deleteChannelParamsJsonSchema,
      resultSchema: DeleteChannelResultSchema
    },
    parseDeleteChannelParams,
    deleteChannel
  ),
  ...channelConversationTools,
  ...channelMessageWorkflowTools,
  defineTool(
    {
      name: "list_channel_messages",
      description: "List messages in a Huly channel. Returns messages sorted by date (newest first).",
      category: CATEGORY,
      inputSchema: listChannelMessagesParamsJsonSchema,
      resultSchema: ListChannelMessagesResultSchema
    },
    parseListChannelMessagesParams,
    listChannelMessages
  ),
  defineTool(
    {
      name: "list_external_channel_messages",
      description:
        "Read persisted Telegram contact-channel messages or assess why an external provider cannot be read safely. For provider=telegram, resolve channel by exact stored value or stable contact-channel ID and return newest contentMarkdown, direction, sent time, and attachment count; returns supported=false when the workspace model or channel is unavailable. This proves only Huly-stored records, not provider freshness or an active Telegram connection, and does not return attachment bytes. Gmail returns supported=false because Huly does not expose the live deployment-wide v1/v2 writer version needed to distinguish current legacy records from stale data. The limit defaults to 50 and is capped at 200. This tool never sends, replies, deletes, or mutates.",
      category: CATEGORY,
      inputSchema: listExternalChannelMessagesParamsJsonSchema,
      resultSchema: ListExternalChannelMessagesResultSchema
    },
    parseListExternalChannelMessagesParams,
    listExternalChannelMessages
  ),
  defineTool(
    {
      name: "send_channel_message",
      description:
        "Send a message to a Huly channel. Message body supports markdown formatting. " +
        HULY_NATIVE_REFERENCE_MARKDOWN_INPUT,
      category: CATEGORY,
      inputSchema: sendChannelMessageParamsJsonSchema,
      resultSchema: SendChannelMessageResultSchema
    },
    parseSendChannelMessageParams,
    sendChannelMessage
  ),
  defineTool(
    {
      name: "update_channel_message",
      description:
        "Update a channel message. Only the body can be modified; body supports markdown formatting. " +
        HULY_NATIVE_REFERENCE_MARKDOWN_INPUT,
      category: CATEGORY,
      inputSchema: updateChannelMessageParamsJsonSchema,
      resultSchema: UpdateChannelMessageResultSchema
    },
    parseUpdateChannelMessageParams,
    updateChannelMessage
  ),
  defineTool(
    {
      name: "delete_channel_message",
      description: "Permanently delete a channel message. This action cannot be undone.",
      category: CATEGORY,
      inputSchema: deleteChannelMessageParamsJsonSchema,
      resultSchema: DeleteChannelMessageResultSchema
    },
    parseDeleteChannelMessageParams,
    deleteChannelMessage
  ),
  defineTool(
    {
      name: "list_direct_messages",
      description: "List direct message conversations in Huly. Returns conversations sorted by date (newest first).",
      category: CATEGORY,
      inputSchema: listDirectMessagesParamsJsonSchema,
      resultSchema: ListDirectMessagesResultSchema
    },
    parseListDirectMessagesParams,
    listDirectMessages
  ),
  defineTool(
    {
      name: "create_direct_message",
      description:
        "Open a one-to-one direct-message conversation with a workspace member. The `person` argument accepts an email or exact display name (e.g. `Smith,Bill`). Idempotent: if a DM with that participant already exists, returns it (`created: false`); otherwise creates a new DM (`created: true`). The returned `id` can be passed as `dm` to send_dm_message, list_dm_messages, etc.",
      category: CATEGORY,
      inputSchema: createDirectMessageParamsJsonSchema,
      resultSchema: CreateDirectMessageResultSchema
    },
    parseCreateDirectMessageParams,
    createDirectMessage
  ),
  defineTool(
    {
      name: "list_dm_messages",
      description:
        "List messages in a direct-message conversation, newest first. The `dm` argument accepts either the DM `_id` or a participant display name (e.g. `Kerr,Shannon`); a name resolves only to a one-to-one DM with the authenticated account.",
      category: CATEGORY,
      inputSchema: listDmMessagesParamsJsonSchema,
      resultSchema: ListDmMessagesResultSchema
    },
    parseListDmMessagesParams,
    listDirectMessageMessages
  ),
  defineTool(
    {
      name: "send_dm_message",
      description:
        "Send a message to a direct-message conversation. The `dm` argument accepts either the DM `_id` or a participant display name; a name resolves only to a one-to-one DM with the authenticated account. Message body supports markdown formatting. " +
        HULY_NATIVE_REFERENCE_MARKDOWN_INPUT,
      category: CATEGORY,
      inputSchema: sendDmMessageParamsJsonSchema,
      resultSchema: SendDmMessageResultSchema
    },
    parseSendDmMessageParams,
    sendDirectMessage
  ),
  defineTool(
    {
      name: "update_dm_message",
      description:
        "Update a direct-message message. The `dm` argument accepts either the DM `_id` or a participant display name; a name resolves only to a one-to-one DM with the authenticated account. Only the body can be modified; body supports markdown formatting. " +
        HULY_NATIVE_REFERENCE_MARKDOWN_INPUT,
      category: CATEGORY,
      inputSchema: updateDmMessageParamsJsonSchema,
      resultSchema: UpdateDmMessageResultSchema
    },
    parseUpdateDmMessageParams,
    updateDirectMessage
  ),
  defineTool(
    {
      name: "delete_dm_message",
      description:
        "Permanently delete a direct-message message. The `dm` argument accepts either the DM `_id` or a participant display name; a name resolves only to a one-to-one DM with the authenticated account. This action cannot be undone.",
      category: CATEGORY,
      inputSchema: deleteDmMessageParamsJsonSchema,
      resultSchema: DeleteDmMessageResultSchema
    },
    parseDeleteDmMessageParams,
    deleteDirectMessage
  ),
  defineTool(
    {
      name: "list_thread_replies",
      description: "List replies in a message thread. Returns replies sorted by date (oldest first).",
      category: CATEGORY,
      inputSchema: listThreadRepliesParamsJsonSchema,
      resultSchema: ListThreadRepliesResultSchema
    },
    parseListThreadRepliesParams,
    listThreadReplies
  ),
  defineTool(
    {
      name: "add_thread_reply",
      description:
        "Add a reply to a message thread. Reply body supports markdown formatting. " +
        HULY_NATIVE_REFERENCE_MARKDOWN_INPUT,
      category: CATEGORY,
      inputSchema: addThreadReplyParamsJsonSchema,
      resultSchema: AddThreadReplyResultSchema
    },
    parseAddThreadReplyParams,
    addThreadReply
  ),
  defineTool(
    {
      name: "update_thread_reply",
      description:
        "Update a thread reply. Only the body can be modified; body supports markdown formatting. " +
        HULY_NATIVE_REFERENCE_MARKDOWN_INPUT,
      category: CATEGORY,
      inputSchema: updateThreadReplyParamsJsonSchema,
      resultSchema: UpdateThreadReplyResultSchema
    },
    parseUpdateThreadReplyParams,
    updateThreadReply
  ),
  defineTool(
    {
      name: "delete_thread_reply",
      description: "Permanently delete a thread reply. This action cannot be undone.",
      category: CATEGORY,
      inputSchema: deleteThreadReplyParamsJsonSchema,
      resultSchema: DeleteThreadReplyResultSchema
    },
    parseDeleteThreadReplyParams,
    deleteThreadReply
  ),
  ...channelAttachmentTools
] as const satisfies ReadonlyArray<RegisteredTool>
