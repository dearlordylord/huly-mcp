import type { McpToolName } from "../../../src/mcp/tools/index.js"

export const ignoredPlatformMcpTools = [
  // associations: Generic association tools are cross-object plumbing and need a clearer CLI navigation model.
  "create_association",
  "create_relation",
  "delete_association",
  "delete_relation",
  "list_associations",
  "list_relations",
  // custom-fields: Custom fields need typed value rendering and update ergonomics before broad CLI exposure.
  "get_custom_field_values",
  "list_custom_fields",
  "set_custom_field",
  // preferences: Preferences are configuration surface area and need a cohesive settings CLI vocabulary.
  "get_space_preference",
  "list_space_preferences",
  // processes: Process execution commands need lifecycle and cancellation UX beyond the first subset.
  "cancel_execution",
  "get_process",
  "list_process_executions",
  "list_processes",
  "start_process",
  // sdk-discovery: SDK discovery remains MCP-first because it is primarily an LLM exploration surface.
  "describe_huly_space_type_capabilities",
  "get_huly_class",
  "list_huly_attributes",
  "list_huly_classes",
  "list_huly_domain_index_configurations",
  "list_huly_enums",
  "list_huly_plugin_configurations",
  "list_huly_sequences",
  // user-statuses: User status listing is low priority for the first CLI subset.
  "list_user_statuses",
  // views: Saved/filtered view commands need a query/view UX beyond first subset tables.
  "get_filtered_view",
  "list_filtered_views",
  "list_viewlets",
  // workspace: Workspace administration and profiles need account/role safeguards before CLI exposure.
  "create_access_link",
  "create_workspace",
  "delete_workspace",
  "get_regions",
  "get_user_profile",
  "get_workspace_info",
  "list_workspace_members",
  "list_workspaces",
  "update_guest_settings",
  "update_member_role",
  "update_user_profile"
] as const satisfies ReadonlyArray<McpToolName>
