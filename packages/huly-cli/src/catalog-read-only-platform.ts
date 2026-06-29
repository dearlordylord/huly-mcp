import type { McpToolName } from "../../../src/mcp/tools/index.js"
import type { CliCommandSpec } from "./catalog-types.js"

export const platformReadOnlyCliCommandCatalog = {
  get_custom_field_values: {
    path: ["custom-fields", "values", "get"],
    positional: ["objectId", "objectClass"],
    description: "Get Custom Field Values"
  },
  get_filtered_view: {
    path: ["views", "filtered", "get"],
    positional: ["filteredView"],
    description: "Get Filtered View"
  },
  get_process: {
    path: ["processes", "get"],
    positional: ["process"],
    description: "Get Process"
  },
  get_regions: {
    path: ["workspace", "regions", "get"],
    positional: [],
    description: "Get Regions"
  },
  get_space_preference: {
    path: ["preferences", "spaces", "get"],
    positional: ["space"],
    description: "Get Space Preference"
  },
  get_user_profile: {
    path: ["workspace", "profile", "get"],
    positional: [],
    description: "Get User Profile"
  },
  get_workspace_info: {
    path: ["workspace", "info", "get"],
    positional: [],
    description: "Get Workspace Info"
  },
  list_associations: {
    path: ["platform", "associations", "list"],
    positional: [],
    description: "List Associations"
  },
  list_custom_fields: {
    path: ["custom-fields", "list"],
    positional: [],
    description: "List Custom Fields"
  },
  list_filtered_views: {
    path: ["views", "filtered", "list"],
    positional: [],
    description: "List Filtered Views"
  },
  list_process_executions: {
    path: ["processes", "executions", "list"],
    positional: [],
    description: "List Process Executions"
  },
  list_processes: {
    path: ["processes", "list"],
    positional: [],
    description: "List Processes"
  },
  list_relations: {
    path: ["platform", "relations", "list"],
    positional: [],
    description: "List Relations"
  },
  list_space_preferences: {
    path: ["preferences", "spaces", "list"],
    positional: [],
    description: "List Space Preferences"
  },
  list_user_statuses: {
    path: ["user-statuses", "list"],
    positional: [],
    description: "List User Statuses"
  },
  list_viewlets: {
    path: ["views", "viewlets", "list"],
    positional: [],
    description: "List Viewlets"
  },
  list_workspace_members: {
    path: ["workspace", "members", "list"],
    positional: [],
    description: "List Workspace Members"
  },
  list_workspaces: {
    path: ["workspace", "list"],
    positional: [],
    description: "List Workspaces"
  }
} as const satisfies Partial<Record<McpToolName, CliCommandSpec>>
