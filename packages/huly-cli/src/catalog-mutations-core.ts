import type { McpToolName } from "../../../src/mcp/tools/index.js"
import type { CliCommandSpec } from "./catalog-types.js"

export const coreMutationCliCommandCatalog = {
  create_huly_sequence: {
    path: ["model", "sequences", "create"],
    positional: ["class", "kind"],
    description: "Create Huly Sequence"
  },
  create_huly_permission: {
    path: ["model", "permissions", "create"],
    positional: ["label", "scope"],
    description: "Create Huly Permission"
  },
  create_space_role: {
    path: ["spaces", "roles", "create"],
    positional: ["spaceType", "name", "permissions"],
    description: "Create Space Role"
  },
  create_huly_attribute: {
    path: ["model", "attributes", "create"],
    positional: ["class", "name", "label"],
    description: "Create Huly Model Attribute"
  },
  create_huly_enum: {
    path: ["model", "enums", "create"],
    positional: ["name", "values"],
    description: "Create Huly Model Enum"
  },
  add_template_child: {
    path: ["issues", "templates", "children", "add"],
    positional: ["title", "project", "template"],
    description: "Add Template Child",
    behavior: { fileInput: { fields: ["description"] } }
  },
  create_component: {
    path: ["components", "create"],
    positional: ["project", "label"],
    description: "Create Component",
    behavior: { fileInput: { fields: ["description"] } }
  },
  create_issue_from_template: {
    path: ["issues", "from-template", "create"],
    positional: ["project", "template"],
    description: "Create Issue From Template",
    behavior: { fileInput: { fields: ["description"] } }
  },
  create_issue_status: {
    path: ["issue-statuses", "create"],
    positional: ["name", "category"],
    description: "Create Issue Status"
  },
  create_status_category: {
    path: ["status-categories", "create"],
    positional: ["ofAttribute", "label", "defaultStatus"],
    description: "Create Generic Status Category"
  },
  create_workflow_status: {
    path: ["workflow-statuses", "create"],
    positional: ["ofAttribute", "name"],
    description: "Create Generic Workflow Status"
  },
  create_issue_template: {
    path: ["issues", "templates", "create"],
    positional: ["project", "title"],
    description: "Create Issue Template",
    behavior: { fileInput: { fields: ["description"] } }
  },
  create_label: {
    path: ["labels", "create"],
    positional: ["title"],
    description: "Create Label",
    behavior: { fileInput: { fields: ["description"] } }
  },
  create_milestone: {
    path: ["milestones", "create"],
    positional: ["project", "label", "targetDate"],
    description: "Create Milestone",
    behavior: { fileInput: { fields: ["description"] } }
  },
  create_project: {
    path: ["projects", "create"],
    positional: ["name", "identifier"],
    description: "Create Project",
    behavior: { fileInput: { fields: ["description"] } }
  },
  create_space: {
    path: ["spaces", "create"],
    positional: ["spaceType", "name"],
    description: "Create Generic Typed Space",
    behavior: { fileInput: { fields: ["description"] } }
  },
  create_task_type: { path: ["task-types", "create"], positional: ["name"], description: "Create Task Type" },
  create_teamspace: {
    path: ["teamspaces", "create"],
    positional: ["name"],
    description: "Create Teamspace",
    behavior: { fileInput: { fields: ["description"] } }
  },
  delete_attachment: {
    path: ["attachments", "delete"],
    positional: ["attachmentId"],
    description: "Delete Attachment",
    behavior: { confirmation: { type: "requires-yes", message: "attachments delete requires --yes." } }
  },
  delete_huly_attribute: {
    path: ["model", "attributes", "delete"],
    positional: ["attribute"],
    description: "Delete Huly Model Attribute",
    behavior: { confirmation: { type: "requires-yes", message: "model attributes delete requires --yes." } }
  },
  delete_huly_sequence: {
    path: ["model", "sequences", "delete"],
    positional: ["sequence", "expectedCurrentValue"],
    description: "Delete Huly Sequence",
    behavior: { confirmation: { type: "requires-yes", message: "model sequences delete requires --yes." } }
  },
  delete_class_collaborator_metadata: {
    path: ["model", "collaborators", "delete"],
    positional: ["class"],
    description: "Delete Class Collaborator Metadata",
    behavior: { confirmation: { type: "requires-yes", message: "model collaborators delete requires --yes." } }
  },
  delete_huly_permission: {
    path: ["model", "permissions", "delete"],
    positional: ["permission"],
    description: "Delete Huly Permission",
    behavior: { confirmation: { type: "requires-yes", message: "model permissions delete requires --yes." } }
  },
  delete_huly_enum: {
    path: ["model", "enums", "delete"],
    positional: ["enum"],
    description: "Delete Huly Model Enum",
    behavior: { confirmation: { type: "requires-yes", message: "model enums delete requires --yes." } }
  },
  delete_component: {
    path: ["components", "delete"],
    positional: ["project", "component"],
    description: "Delete Component",
    behavior: { confirmation: { type: "requires-yes", message: "components delete requires --yes." } }
  },
  delete_document: {
    path: ["documents", "delete"],
    positional: ["teamspace", "document"],
    description: "Delete Document",
    behavior: { confirmation: { type: "requires-yes", message: "documents delete requires --yes." } }
  },
  delete_drawing: {
    path: ["drawings", "delete"],
    positional: ["drawingId"],
    description: "Delete Drawing",
    behavior: { confirmation: { type: "requires-yes", message: "drawings delete requires --yes." } }
  },
  delete_issue: {
    path: ["issues", "delete"],
    positional: ["project", "identifier"],
    description: "Delete Issue",
    behavior: { confirmation: { type: "requires-yes", message: "issues delete requires --yes." } }
  },
  publish_issue_to_external_tracker: {
    path: ["issues", "external-publication", "publish"],
    positional: ["project", "identifier"],
    description: "Request Issue External Publication"
  },
  delete_issue_template: {
    path: ["issues", "templates", "delete"],
    positional: ["project", "template"],
    description: "Delete Issue Template",
    behavior: { confirmation: { type: "requires-yes", message: "issues templates delete requires --yes." } }
  },
  delete_label: {
    path: ["labels", "delete"],
    positional: ["label"],
    description: "Delete Label",
    behavior: { confirmation: { type: "requires-yes", message: "labels delete requires --yes." } }
  },
  delete_milestone: {
    path: ["milestones", "delete"],
    positional: ["project", "milestone"],
    description: "Delete Milestone",
    behavior: { confirmation: { type: "requires-yes", message: "milestones delete requires --yes." } }
  },
  delete_project: {
    path: ["projects", "delete"],
    positional: ["project"],
    description: "Delete Project",
    behavior: { confirmation: { type: "requires-yes", message: "projects delete requires --yes." } }
  },
  delete_status_category: {
    path: ["status-categories", "delete"],
    positional: ["category"],
    description: "Delete Generic Status Category",
    behavior: { confirmation: { type: "requires-yes", message: "status-categories delete requires --yes." } }
  },
  delete_workflow_status: {
    path: ["workflow-statuses", "delete"],
    positional: ["status"],
    description: "Delete Generic Workflow Status",
    behavior: { confirmation: { type: "requires-yes", message: "workflow-statuses delete requires --yes." } }
  },
  delete_related_issue_space_target: {
    path: ["issues", "related-targets", "delete"],
    positional: ["space"],
    description: "Delete Related Issue Space Target",
    behavior: { confirmation: { type: "requires-yes", message: "issues related-targets delete requires --yes." } }
  },
  delete_teamspace: {
    path: ["teamspaces", "delete"],
    positional: ["teamspace"],
    description: "Delete Teamspace",
    behavior: { confirmation: { type: "requires-yes", message: "teamspaces delete requires --yes." } }
  },
  pin_attachment: {
    path: ["attachments", "pin"],
    positional: ["attachmentId", "pinned"],
    description: "Pin Attachment"
  },
  preview_deletion: {
    path: ["deletion", "preview"],
    positional: ["entityType", "project"],
    description: "Preview Deletion"
  },
  remove_template_child: {
    path: ["issues", "templates", "children", "remove"],
    positional: ["project", "template", "childId"],
    description: "Remove Template Child",
    behavior: { confirmation: { type: "requires-yes", message: "issues templates children remove requires --yes." } }
  },
  save_attachment: { path: ["attachments", "save"], positional: ["attachmentId"], description: "Save Attachment" },
  set_global_space_admins: {
    path: ["spaces", "admins", "set"],
    positional: [],
    description: "Set Global Space Admins",
    behavior: { confirmation: { type: "requires-yes", message: "spaces admins set requires --yes." } }
  },
  set_class_collaborator_metadata: {
    path: ["model", "collaborators", "set"],
    positional: ["class", "fieldSelection"],
    description: "Set Class Collaborator Metadata"
  },
  set_space_role_permissions: {
    path: ["spaces", "roles", "permissions", "set"],
    positional: ["spaceType", "role", "permissions"],
    description: "Set Space Role Permissions"
  },
  set_related_issue_target: {
    path: ["issues", "related-targets", "set"],
    positional: ["targetProject"],
    description: "Set Related Issue Target"
  },
  unsave_attachment: {
    path: ["attachments", "unsave"],
    positional: ["attachmentId"],
    description: "Unsave Attachment"
  },
  update_attachment: {
    path: ["attachments", "update"],
    positional: ["attachmentId"],
    description: "Update Attachment",
    behavior: { fileInput: { fields: ["description"] } }
  },
  update_huly_attribute: {
    path: ["model", "attributes", "update"],
    positional: ["attribute"],
    description: "Update Huly Model Attribute"
  },
  update_huly_custom_sequence: {
    path: ["model", "sequences", "update"],
    positional: ["sequence", "prefix"],
    description: "Update Huly Custom Sequence"
  },
  update_huly_permission: {
    path: ["model", "permissions", "update"],
    positional: ["permission"],
    description: "Update Huly Permission"
  },
  update_huly_enum: { path: ["model", "enums", "update"], positional: ["enum"], description: "Update Huly Model Enum" },
  update_component: {
    path: ["components", "update"],
    positional: ["project", "component"],
    description: "Update Component",
    behavior: { fileInput: { fields: ["description"] } }
  },
  update_status_category: {
    path: ["status-categories", "update"],
    positional: ["category"],
    description: "Update Generic Status Category"
  },
  update_workflow_status: {
    path: ["workflow-statuses", "update"],
    positional: ["status"],
    description: "Update Generic Workflow Status"
  },
  update_issue_template: {
    path: ["issues", "templates", "update"],
    positional: ["project", "template"],
    description: "Update Issue Template",
    behavior: { fileInput: { fields: ["description"] } }
  },
  update_label: {
    path: ["labels", "update"],
    positional: ["label"],
    description: "Update Label",
    behavior: { fileInput: { fields: ["description"] } }
  },
  update_milestone: {
    path: ["milestones", "update"],
    positional: ["project", "milestone"],
    description: "Update Milestone",
    behavior: { fileInput: { fields: ["description"] } }
  },
  update_project: {
    path: ["projects", "update"],
    positional: ["project"],
    description: "Update Project",
    behavior: { fileInput: { fields: ["description"] } }
  },
  update_teamspace: {
    path: ["teamspaces", "update"],
    positional: ["teamspace"],
    description: "Update Teamspace",
    behavior: { fileInput: { fields: ["description"] } }
  }
} as const satisfies Partial<Record<McpToolName, CliCommandSpec>>
