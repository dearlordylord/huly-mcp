import type { McpToolName } from "../../../src/mcp/tools/index.js"
import type { CliCommandSpec } from "./catalog-types.js"

export const coreReadOnlyCliCommandCatalog = {
  get_document_snapshot: {
    path: ["documents", "snapshots", "get"],
    positional: ["teamspace", "document", "snapshot"],
    description: "Get Document Snapshot"
  },
  get_drawing: {
    path: ["drawings", "get"],
    positional: ["drawingId"],
    description: "Get Drawing"
  },
  get_issue_template: {
    path: ["issues", "templates", "get"],
    positional: ["project", "template"],
    description: "Get Issue Template"
  },
  get_project_type: {
    path: ["project-types", "get"],
    positional: [],
    description: "Get Project Type"
  },
  list_document_snapshots: {
    path: ["documents", "snapshots", "list"],
    positional: ["teamspace", "document"],
    description: "List Document Snapshots"
  },
  list_drawings: {
    path: ["drawings", "list"],
    positional: ["parentId", "parentClass"],
    description: "List Drawings"
  },
  list_issue_templates: {
    path: ["issues", "templates", "list"],
    positional: ["project"],
    description: "List Issue Templates"
  },
  list_project_target_preferences: {
    path: ["projects", "target-preferences", "list"],
    positional: [],
    description: "List Project Target Preferences"
  },
  list_project_types: {
    path: ["project-types", "list"],
    positional: [],
    description: "List Project Types"
  },
  list_related_issue_targets: {
    path: ["issues", "related-targets", "list"],
    positional: [],
    description: "List Related Issue Targets"
  },
  list_saved_attachments: {
    path: ["attachments", "saved", "list"],
    positional: [],
    description: "List Saved Attachments"
  },
  list_task_types: {
    path: ["task-types", "list"],
    positional: [],
    description: "List Task Types"
  }
} as const satisfies Partial<Record<McpToolName, CliCommandSpec>>
