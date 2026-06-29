import type { McpToolName } from "../../../src/mcp/tools/index.js"

export const ignoredCoreMcpTools = [
  // attachments: The first subset exposes issue/document attachment workflows; generic saved/drawing attachment commands are deferred.
  "add_attachment",
  "create_drawing",
  "delete_attachment",
  "delete_drawing",
  "get_drawing",
  "list_drawings",
  "list_saved_attachments",
  "pin_attachment",
  "save_attachment",
  "unsave_attachment",
  "update_attachment",
  "update_drawing",
  // documents: Destructive document and snapshot/teamspace administration is deferred beyond first document CRUD.
  "create_teamspace",
  "delete_document",
  "delete_teamspace",
  "get_document_snapshot",
  "list_document_snapshots",
  "update_teamspace",
  // issues: Issue templates, components administration, and destructive issue deletion are deferred beyond first issue work.
  "add_template_child",
  "create_component",
  "create_issue_from_template",
  "create_issue_template",
  "delete_component",
  "delete_issue",
  "delete_issue_template",
  "delete_related_issue_space_target",
  "get_issue_template",
  "list_issue_templates",
  "list_related_issue_targets",
  "preview_deletion",
  "remove_template_child",
  "set_related_issue_target",
  "update_component",
  "update_issue_template",
  // labels: Label administration is deferred; the first subset only lists labels and mutates issue label membership.
  "create_label",
  "delete_label",
  "update_label",
  // milestones: Milestone administration is deferred; the first subset lists/gets milestones and sets issue milestones.
  "create_milestone",
  "delete_milestone",
  "update_milestone",
  // projects: Project administration is deferred; the first subset only lists/gets projects and statuses.
  "create_project",
  "delete_project",
  "list_project_target_preferences",
  "update_project",
  "upsert_project_target_preference",
  // storage: Raw storage upload is lower-level than the first attachment workflows.
  "upload_file",
  // task-management: Task type/status administration is project configuration and deferred beyond issue operations.
  "create_issue_status",
  "create_task_type",
  "get_project_type",
  "list_project_types",
  "list_task_types"
] as const satisfies ReadonlyArray<McpToolName>
