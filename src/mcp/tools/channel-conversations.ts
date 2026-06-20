import {
  channelLifecycleParamsJsonSchema,
  channelMemberMutationParamsJsonSchema,
  createGroupDirectMessageParamsJsonSchema,
  listChannelMembersParamsJsonSchema,
  parseChannelLifecycleParams,
  parseChannelMemberMutationParams,
  parseCreateGroupDirectMessageParams,
  parseListChannelMembersParams,
  parseSetConversationClosedParams,
  parseSetConversationStarredParams,
  setConversationClosedParamsJsonSchema,
  setConversationStarredParamsJsonSchema
} from "../../domain/schemas.js"
import {
  AddChannelMembersResultSchema,
  ArchiveChannelResultSchema,
  CreateGroupDirectMessageResultSchema,
  JoinChannelResultSchema,
  LeaveChannelResultSchema,
  ListChannelMembersResultSchema,
  RemoveChannelMembersResultSchema,
  SetConversationClosedResultSchema,
  SetConversationStarredResultSchema,
  UnarchiveChannelResultSchema
} from "../../domain/schemas/chat-conversations.js"
import {
  addChannelMembers,
  archiveChannel,
  createGroupDirectMessage,
  joinChannel,
  leaveChannel,
  listChannelMembers,
  removeChannelMembers,
  setConversationClosed,
  setConversationStarred,
  unarchiveChannel
} from "../../huly/operations/channels.js"
import { defineTool, type RegisteredTool } from "./registry.js"

const CATEGORY = "channels" as const

export const channelConversationTools: ReadonlyArray<RegisteredTool> = [
  defineTool(
    {
      name: "list_channel_members",
      description:
        "List members of a Huly channel by channel name or ID. Returns each member account UUID and the workspace display name when available.",
      category: CATEGORY,
      inputSchema: listChannelMembersParamsJsonSchema,
      resultSchema: ListChannelMembersResultSchema
    },
    parseListChannelMembersParams,
    listChannelMembers
  ),
  defineTool(
    {
      name: "add_channel_members",
      description:
        "Idempotently add members to a non-archived Huly channel. Members accept account UUID, exact email, or exact person display name and resolve to Huly account UUIDs before replacing the full sorted member array.",
      category: CATEGORY,
      inputSchema: channelMemberMutationParamsJsonSchema,
      resultSchema: AddChannelMembersResultSchema
    },
    parseChannelMemberMutationParams,
    addChannelMembers
  ),
  defineTool(
    {
      name: "remove_channel_members",
      description:
        "Idempotently remove members from a non-archived Huly channel. Members accept account UUID, exact email, or exact person display name. Refuses removals that would leave the channel with zero members or, when owners exist, no owner among remaining members.",
      category: CATEGORY,
      inputSchema: channelMemberMutationParamsJsonSchema,
      resultSchema: RemoveChannelMembersResultSchema
    },
    parseChannelMemberMutationParams,
    removeChannelMembers
  ),
  defineTool(
    {
      name: "join_channel",
      description:
        "Join a non-archived Huly channel as the authenticated account. Idempotent when the account is already a member.",
      category: CATEGORY,
      inputSchema: channelLifecycleParamsJsonSchema,
      resultSchema: JoinChannelResultSchema
    },
    parseChannelLifecycleParams,
    joinChannel
  ),
  defineTool(
    {
      name: "leave_channel",
      description:
        "Leave a non-archived Huly channel as the authenticated account. Idempotent when already absent. Refuses to leave if that would leave the channel empty or without any remaining owner.",
      category: CATEGORY,
      inputSchema: channelLifecycleParamsJsonSchema,
      resultSchema: LeaveChannelResultSchema
    },
    parseChannelLifecycleParams,
    leaveChannel
  ),
  defineTool(
    {
      name: "archive_channel",
      description:
        "Archive a Huly channel by channel name or ID. This is reversible with unarchive_channel and is idempotent when the channel is already archived.",
      category: CATEGORY,
      inputSchema: channelLifecycleParamsJsonSchema,
      resultSchema: ArchiveChannelResultSchema
    },
    parseChannelLifecycleParams,
    archiveChannel
  ),
  defineTool(
    {
      name: "unarchive_channel",
      description: "Unarchive a Huly channel by channel name or ID. Idempotent when the channel is already active.",
      category: CATEGORY,
      inputSchema: channelLifecycleParamsJsonSchema,
      resultSchema: UnarchiveChannelResultSchema
    },
    parseChannelLifecycleParams,
    unarchiveChannel
  ),
  defineTool(
    {
      name: "create_group_direct_message",
      description:
        "Open a group direct-message conversation with at least two other workspace members. The `people` array accepts exact emails or exact display names; the authenticated account is included automatically. Idempotent by exact sorted member set: returns an existing group DM with `created: false` when one already exists. For one other person, use create_direct_message.",
      category: CATEGORY,
      inputSchema: createGroupDirectMessageParamsJsonSchema,
      resultSchema: CreateGroupDirectMessageResultSchema
    },
    parseCreateGroupDirectMessageParams,
    createGroupDirectMessage
  ),
  defineTool(
    {
      name: "set_conversation_starred",
      description:
        "Set the authenticated user's starred state for exactly one conversation. Provide either `channel` (channel name or ID) or `dm` (DM ID, or one-to-one participant display name), plus `starred`. Creates the missing notification context when needed.",
      category: CATEGORY,
      inputSchema: setConversationStarredParamsJsonSchema,
      resultSchema: SetConversationStarredResultSchema
    },
    parseSetConversationStarredParams,
    setConversationStarred
  ),
  defineTool(
    {
      name: "set_conversation_closed",
      description:
        "Set the authenticated user's closed/visible state for exactly one conversation. Provide either `channel` or `dm`, plus `closed`. Closing only hides the current user's notification context; it does not leave channels or remove members.",
      category: CATEGORY,
      inputSchema: setConversationClosedParamsJsonSchema,
      resultSchema: SetConversationClosedResultSchema
    },
    parseSetConversationClosedParams,
    setConversationClosed
  )
]
