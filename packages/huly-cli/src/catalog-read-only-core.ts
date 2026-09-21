import type { McpToolName } from "../../../src/mcp/tools/index.js"
import type { CliCommandSpec } from "./catalog-types.js"

export const coreReadOnlyCliCommandCatalog = {
  get_class_collaborator_metadata: {
    path: ["model", "collaborators", "get"],
    positional: ["class"],
    description: "Get Class Collaborator Metadata"
  },
  get_document_snapshot: {
    path: ["documents", "snapshots", "get"],
    positional: ["teamspace", "document", "snapshot"],
    description: "Get Document Snapshot"
  },
  get_drawing: { path: ["drawings", "get"], positional: ["drawingId"], description: "Get Drawing" },
  get_issue_template: {
    path: ["issues", "templates", "get"],
    positional: ["project", "template"],
    description: "Get Issue Template"
  },
  get_global_space_admins: {
    path: ["spaces", "admins", "get"],
    positional: [],
    description: "Get Global Space Admins"
  },
  get_project_type: { path: ["project-types", "get"], positional: [], description: "Get Project Type" },
  get_status_category: {
    path: ["status-categories", "get"],
    positional: ["category"],
    description: "Get Generic Status Category"
  },
  get_workflow_status: {
    path: ["workflow-statuses", "get"],
    positional: ["status"],
    description: "Get Generic Workflow Status"
  },
  list_document_snapshots: {
    path: ["documents", "snapshots", "list"],
    positional: ["teamspace", "document"],
    description: "List Document Snapshots"
  },
  list_external_tracker_targets: {
    path: ["issues", "external-targets", "list"],
    positional: ["project"],
    description: "List External Tracker Targets"
  },
  list_drawings: { path: ["drawings", "list"], positional: ["parentId", "parentClass"], description: "List Drawings" },
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
  list_project_types: { path: ["project-types", "list"], positional: [], description: "List Project Types" },
  list_status_categories: {
    path: ["status-categories", "list"],
    positional: [],
    description: "List Generic Status Categories"
  },
  list_related_issue_targets: {
    path: ["issues", "related-targets", "list"],
    positional: [],
    description: "List Related Issue Targets"
  },
  get_issue_publication_status: {
    path: ["issues", "external-publication", "status"],
    positional: ["project", "identifier"],
    description: "Get Issue External Publication Status"
  },
  list_saved_attachments: {
    path: ["attachments", "saved", "list"],
    positional: [],
    description: "List Saved Attachments"
  },
  list_task_types: { path: ["task-types", "list"], positional: [], description: "List Task Types" },
  list_workflow_statuses: {
    path: ["workflow-statuses", "list"],
    positional: [],
    description: "List Generic Workflow Statuses"
  }
} as const satisfies Partial<Record<McpToolName, CliCommandSpec>>
