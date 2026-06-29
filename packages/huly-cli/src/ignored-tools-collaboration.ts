import type { McpToolName } from "../../../src/mcp/tools/index.js"

export const ignoredCollaborationMcpTools = [
  // approvals: Actor decisions need approval-specific UX and confirmation semantics.
  "add_approval_request",
  "approve_approval_request",
  "reject_approval_request",
  // channels: Uploads and conversation send/edit/delete paths need chat-safe rendering and confirmation policy.
  "add_chat_message_attachment",
  "add_thread_reply",
  "delete_channel_message",
  "delete_dm_message",
  "delete_thread_reply",
  "send_channel_message",
  "send_dm_message",
  "update_channel_message",
  "update_dm_message",
  "update_thread_reply",
  // generic object targets: Collaborators, object subscriptions, and tag attachment need a shared object locator.
  "add_object_collaborator",
  "remove_object_collaborator",
  "subscribe_to_object_notifications",
  "unsubscribe_from_object_notifications",
  "attach_tag",
  "detach_tag",
  // notifications: Bulk actions need explicit bulk-action confirmation wording.
  "archive_all_notifications",
  "mark_all_notifications_read",
  // spaces: Membership, ownership, and role commands need a shared member/permission vocabulary.
  "add_space_members",
  "add_space_role_members",
  "remove_space_members",
  "remove_space_role_members",
  "set_space_owners",
  "set_space_role_members",
  "update_space",
  // templates: Rendering templates needs domain-specific input/value UX.
  "render_message_template"
] as const satisfies ReadonlyArray<McpToolName>
