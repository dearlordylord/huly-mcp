import type { McpToolName } from "../../../src/mcp/tools/index.js"

export const ignoredPlatformMcpTools = [
  // associations/custom-fields: Generic object targeting needs a shared CLI object locator convention.
  "create_association",
  "create_relation",
  "delete_association",
  "delete_relation",
  "set_custom_field",
  // processes: Execution lifecycle commands need process-specific start/cancel UX.
  "cancel_execution",
  "start_process",
  // sdk-discovery: These remain MCP-first until the human CLI has a clear discovery taxonomy.
  "describe_huly_space_type_capabilities",
  "get_huly_class",
  "list_huly_attributes",
  "list_huly_classes",
  "list_huly_domain_index_configurations",
  "list_huly_enums",
  "list_huly_plugin_configurations",
  "list_huly_sequences",
  // workspace/account: Administration commands need account, role, and workspace lifecycle safeguards.
  "create_access_link",
  "create_workspace",
  "delete_workspace",
  "update_guest_settings",
  "update_member_role",
  "update_user_profile"
] as const satisfies ReadonlyArray<McpToolName>
