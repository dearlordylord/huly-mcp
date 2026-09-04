import type { McpToolName } from "../../../src/mcp/tools/index.js"
import type { CliCommandSpec } from "./catalog-types.js"

export const CONSEQUENTIAL_CLI_TOOLS = [
  "add_approval_request",
  "approve_approval_request",
  "reject_approval_request",
  "archive_all_notifications",
  "archive_funnel",
  "mark_all_notifications_read",
  "add_drive_members",
  "remove_drive_members",
  "set_drive_owners",
  "add_space_members",
  "remove_space_members",
  "set_space_owners",
  "add_space_role_members",
  "remove_space_role_members",
  "set_space_role_members",
  "add_object_collaborator",
  "remove_object_collaborator",
  "subscribe_to_object_notifications",
  "unsubscribe_from_object_notifications",
  "create_access_link",
  "create_workspace",
  "delete_workspace",
  "update_guest_settings",
  "update_member_role",
  "update_user_profile",
  "start_process",
  "cancel_execution",
  "upsert_project_target_preference",
  "attach_tag",
  "detach_tag",
  "create_huly_permission",
  "update_huly_permission",
  "create_space_role",
  "set_space_role_permissions",
  "set_class_collaborator_metadata",
  "link_document_to_issue",
  "unlink_document_from_issue",
  "make_organization_customer",
  "join_channel",
  "leave_channel",
  "unarchive_channel",
  "request_channel_access",
  "translate_chat_message",
  "unarchive_board",
  "unarchive_board_card",
  "unarchive_recruiting_vacancy",
  "complete_todo",
  "reopen_todo",
  "schedule_todo",
  "unschedule_todo",
  "unarchive_notification",
  "hide_notification_context",
  "unarchive_notification_context"
] as const satisfies ReadonlyArray<McpToolName>

const consequentialCliToolSet: ReadonlySet<McpToolName> = new Set(CONSEQUENTIAL_CLI_TOOLS)

export const hasExplicitCliConfirmationPolicy = (toolName: McpToolName, spec: CliCommandSpec): boolean =>
  spec.behavior?.confirmation?.type === "requires-yes" || consequentialCliToolSet.has(toolName)

export const explicitCliConfirmationMessage = (toolName: McpToolName, spec: CliCommandSpec): string | undefined => {
  const catalogPolicy = spec.behavior?.confirmation
  if (catalogPolicy?.type === "requires-yes") return catalogPolicy.message
  return consequentialCliToolSet.has(toolName) ? `${spec.path.join(" ")} requires --yes.` : undefined
}
