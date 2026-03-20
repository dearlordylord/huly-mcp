import {
  addIssueRelationParamsJsonSchema,
  addLabelParamsJsonSchema,
  addTemplateChildParamsJsonSchema,
  createComponentParamsJsonSchema,
  createIssueFromTemplateParamsJsonSchema,
  createIssueParamsJsonSchema,
  createIssueTemplateParamsJsonSchema,
  deleteComponentParamsJsonSchema,
  deleteIssueParamsJsonSchema,
  deleteIssueTemplateParamsJsonSchema,
  getComponentParamsJsonSchema,
  getIssueParamsJsonSchema,
  getIssueTemplateParamsJsonSchema,
  linkDocumentToIssueParamsJsonSchema,
  listComponentsParamsJsonSchema,
  listIssueRelationsParamsJsonSchema,
  listIssuesParamsJsonSchema,
  listIssueTemplatesParamsJsonSchema,
  moveIssueParamsJsonSchema,
  parseAddIssueRelationParams,
  parseAddLabelParams,
  parseAddTemplateChildParams,
  parseCreateComponentParams,
  parseCreateIssueFromTemplateParams,
  parseCreateIssueParams,
  parseCreateIssueTemplateParams,
  parseDeleteComponentParams,
  parseDeleteIssueParams,
  parseDeleteIssueTemplateParams,
  parseGetComponentParams,
  parseGetIssueParams,
  parseGetIssueTemplateParams,
  parseLinkDocumentToIssueParams,
  parseListComponentsParams,
  parseListIssueRelationsParams,
  parseListIssuesParams,
  parseListIssueTemplatesParams,
  parseMoveIssueParams,
  parseRemoveIssueRelationParams,
  parseRemoveLabelParams,
  parseRemoveTemplateChildParams,
  parseSetIssueComponentParams,
  parseUnlinkDocumentFromIssueParams,
  parseUpdateComponentParams,
  parseUpdateIssueParams,
  parseUpdateIssueTemplateParams,
  removeIssueRelationParamsJsonSchema,
  removeLabelParamsJsonSchema,
  removeTemplateChildParamsJsonSchema,
  setIssueComponentParamsJsonSchema,
  unlinkDocumentFromIssueParamsJsonSchema,
  updateComponentParamsJsonSchema,
  updateIssueParamsJsonSchema,
  updateIssueTemplateParamsJsonSchema
} from "../../domain/schemas.js"
import {
  createComponent,
  deleteComponent,
  getComponent,
  listComponents,
  setIssueComponent,
  updateComponent
} from "../../huly/operations/components.js"
import { linkDocumentToIssue, unlinkDocumentFromIssue } from "../../huly/operations/document-relations.js"
import {
  addTemplateChild,
  createIssueFromTemplate,
  createIssueTemplate,
  deleteIssueTemplate,
  getIssueTemplate,
  listIssueTemplates,
  removeTemplateChild,
  updateIssueTemplate
} from "../../huly/operations/issue-templates.js"
import {
  addLabel,
  createIssue,
  deleteIssue,
  getIssue,
  listIssues,
  moveIssue,
  updateIssue
} from "../../huly/operations/issues.js"
import { removeIssueLabel } from "../../huly/operations/labels.js"
import { addIssueRelation, listIssueRelations, removeIssueRelation } from "../../huly/operations/relations.js"
import { createToolHandler, type RegisteredTool } from "./registry.js"

const CATEGORY = "issues" as const

export const issueTools: ReadonlyArray<RegisteredTool> = [
  {
    name: "list_issues",
    description:
      "Query Huly issues with optional filters. Returns issues sorted by modification date (newest first). Supports filtering by project, status, assignee, component, and parentIssue (to list children of a specific issue). Supports searching by title substring (titleSearch) and description content (descriptionSearch).",
    category: CATEGORY,
    inputSchema: listIssuesParamsJsonSchema,
    handler: createToolHandler(
      "list_issues",
      parseListIssuesParams,
      listIssues
    )
  },
  {
    name: "get_issue",
    description:
      "Retrieve full details for a Huly issue including markdown description. Use this to view issue content, comments, or full metadata.",
    category: CATEGORY,
    inputSchema: getIssueParamsJsonSchema,
    handler: createToolHandler(
      "get_issue",
      parseGetIssueParams,
      getIssue
    )
  },
  {
    name: "create_issue",
    description:
      "Create a new issue in a Huly project. Optionally create as a sub-issue by specifying parentIssue. Description supports markdown formatting. Returns the created issue identifier.",
    category: CATEGORY,
    inputSchema: createIssueParamsJsonSchema,
    handler: createToolHandler(
      "create_issue",
      parseCreateIssueParams,
      createIssue
    )
  },
  {
    name: "update_issue",
    description:
      "Update fields on an existing Huly issue. Only provided fields are modified. Description updates support markdown.",
    category: CATEGORY,
    inputSchema: updateIssueParamsJsonSchema,
    handler: createToolHandler(
      "update_issue",
      parseUpdateIssueParams,
      updateIssue
    )
  },
  {
    name: "add_issue_label",
    description: "Add a tag/label to a Huly issue. Creates the tag if it doesn't exist in the project.",
    category: CATEGORY,
    inputSchema: addLabelParamsJsonSchema,
    handler: createToolHandler(
      "add_issue_label",
      parseAddLabelParams,
      addLabel
    )
  },
  {
    name: "remove_issue_label",
    description:
      "Remove a tag/label from a Huly issue. Detaches the label reference; does not delete the label definition.",
    category: CATEGORY,
    inputSchema: removeLabelParamsJsonSchema,
    handler: createToolHandler(
      "remove_issue_label",
      parseRemoveLabelParams,
      removeIssueLabel
    )
  },
  {
    name: "delete_issue",
    description: "Permanently delete a Huly issue. This action cannot be undone.",
    category: CATEGORY,
    inputSchema: deleteIssueParamsJsonSchema,
    handler: createToolHandler(
      "delete_issue",
      parseDeleteIssueParams,
      deleteIssue
    )
  },
  {
    name: "move_issue",
    description:
      "Move an issue to a new parent (making it a sub-issue) or to top-level (null). Updates parent/child relationships and sub-issue counts.",
    category: CATEGORY,
    inputSchema: moveIssueParamsJsonSchema,
    handler: createToolHandler(
      "move_issue",
      parseMoveIssueParams,
      moveIssue
    )
  },
  {
    name: "list_components",
    description:
      "List components in a Huly project. Components organize issues by area/feature. Returns components sorted by modification date (newest first).",
    category: CATEGORY,
    inputSchema: listComponentsParamsJsonSchema,
    handler: createToolHandler(
      "list_components",
      parseListComponentsParams,
      listComponents
    )
  },
  {
    name: "get_component",
    description: "Retrieve full details for a Huly component. Use this to view component content and metadata.",
    category: CATEGORY,
    inputSchema: getComponentParamsJsonSchema,
    handler: createToolHandler(
      "get_component",
      parseGetComponentParams,
      getComponent
    )
  },
  {
    name: "create_component",
    description:
      "Create a new component in a Huly project. Components help organize issues by area/feature. Returns the created component ID and label.",
    category: CATEGORY,
    inputSchema: createComponentParamsJsonSchema,
    handler: createToolHandler(
      "create_component",
      parseCreateComponentParams,
      createComponent
    )
  },
  {
    name: "update_component",
    description: "Update fields on an existing Huly component. Only provided fields are modified.",
    category: CATEGORY,
    inputSchema: updateComponentParamsJsonSchema,
    handler: createToolHandler(
      "update_component",
      parseUpdateComponentParams,
      updateComponent
    )
  },
  {
    name: "set_issue_component",
    description: "Set or clear the component on a Huly issue. Pass null for component to clear it.",
    category: CATEGORY,
    inputSchema: setIssueComponentParamsJsonSchema,
    handler: createToolHandler(
      "set_issue_component",
      parseSetIssueComponentParams,
      setIssueComponent
    )
  },
  {
    name: "delete_component",
    description: "Permanently delete a Huly component. This action cannot be undone.",
    category: CATEGORY,
    inputSchema: deleteComponentParamsJsonSchema,
    handler: createToolHandler(
      "delete_component",
      parseDeleteComponentParams,
      deleteComponent
    )
  },
  {
    name: "list_issue_templates",
    description:
      "List issue templates in a Huly project. Templates define reusable issue configurations. Returns templates sorted by modification date (newest first).",
    category: CATEGORY,
    inputSchema: listIssueTemplatesParamsJsonSchema,
    handler: createToolHandler(
      "list_issue_templates",
      parseListIssueTemplatesParams,
      listIssueTemplates
    )
  },
  {
    name: "get_issue_template",
    description:
      "Retrieve full details for a Huly issue template including children (sub-task templates). Use this to view template content, default values, and child template IDs.",
    category: CATEGORY,
    inputSchema: getIssueTemplateParamsJsonSchema,
    handler: createToolHandler(
      "get_issue_template",
      parseGetIssueTemplateParams,
      getIssueTemplate
    )
  },
  {
    name: "create_issue_template",
    description:
      "Create a new issue template in a Huly project. Templates define default values for new issues. Optionally include children (sub-task templates) that will become sub-issues when creating issues from this template. Returns the created template ID and title.",
    category: CATEGORY,
    inputSchema: createIssueTemplateParamsJsonSchema,
    handler: createToolHandler(
      "create_issue_template",
      parseCreateIssueTemplateParams,
      createIssueTemplate
    )
  },
  {
    name: "create_issue_from_template",
    description:
      "Create a new issue from a template. Applies template defaults, allowing overrides for specific fields. If the template has children (sub-task templates), sub-issues are created automatically unless includeChildren is set to false. Returns the created issue identifier and count of children created.",
    category: CATEGORY,
    inputSchema: createIssueFromTemplateParamsJsonSchema,
    handler: createToolHandler(
      "create_issue_from_template",
      parseCreateIssueFromTemplateParams,
      createIssueFromTemplate
    )
  },
  {
    name: "update_issue_template",
    description: "Update fields on an existing Huly issue template. Only provided fields are modified.",
    category: CATEGORY,
    inputSchema: updateIssueTemplateParamsJsonSchema,
    handler: createToolHandler(
      "update_issue_template",
      parseUpdateIssueTemplateParams,
      updateIssueTemplate
    )
  },
  {
    name: "delete_issue_template",
    description: "Permanently delete a Huly issue template. This action cannot be undone.",
    category: CATEGORY,
    inputSchema: deleteIssueTemplateParamsJsonSchema,
    handler: createToolHandler(
      "delete_issue_template",
      parseDeleteIssueTemplateParams,
      deleteIssueTemplate
    )
  },
  {
    name: "add_template_child",
    description:
      "Add a child (sub-task) template to an issue template. The child defines default values for sub-issues created when using create_issue_from_template. Returns the child template ID.",
    category: CATEGORY,
    inputSchema: addTemplateChildParamsJsonSchema,
    handler: createToolHandler(
      "add_template_child",
      parseAddTemplateChildParams,
      addTemplateChild
    )
  },
  {
    name: "remove_template_child",
    description:
      "Remove a child (sub-task) template from an issue template by its child ID. Get child IDs from get_issue_template response.",
    category: CATEGORY,
    inputSchema: removeTemplateChildParamsJsonSchema,
    handler: createToolHandler(
      "remove_template_child",
      parseRemoveTemplateChildParams,
      removeTemplateChild
    )
  },
  {
    name: "add_issue_relation",
    description:
      "Add a relation between two issues. Relation types: 'blocks' (source blocks target — pushes into target's blockedBy), 'is-blocked-by' (source is blocked by target — pushes into source's blockedBy), 'relates-to' (bidirectional link — updates both sides). targetIssue accepts cross-project identifiers like 'OTHER-42'. No-op if the relation already exists.",
    category: CATEGORY,
    inputSchema: addIssueRelationParamsJsonSchema,
    handler: createToolHandler(
      "add_issue_relation",
      parseAddIssueRelationParams,
      addIssueRelation
    )
  },
  {
    name: "remove_issue_relation",
    description:
      "Remove a relation between two issues. Mirrors add_issue_relation: 'blocks' pulls from target's blockedBy, 'is-blocked-by' pulls from source's blockedBy, 'relates-to' pulls from both sides. No-op if the relation doesn't exist.",
    category: CATEGORY,
    inputSchema: removeIssueRelationParamsJsonSchema,
    handler: createToolHandler(
      "remove_issue_relation",
      parseRemoveIssueRelationParams,
      removeIssueRelation
    )
  },
  {
    name: "list_issue_relations",
    description:
      "List all relations of an issue. Returns blockedBy (issues blocking this one), relations (bidirectional issue links), and documents (linked documents with title/teamspace). Does NOT return issues that this issue blocks — use list_issue_relations on the target issue to see that.",
    category: CATEGORY,
    inputSchema: listIssueRelationsParamsJsonSchema,
    handler: createToolHandler(
      "list_issue_relations",
      parseListIssueRelationsParams,
      listIssueRelations
    )
  },
  {
    name: "link_document_to_issue",
    description:
      "Link a Huly document to an issue. The link appears in the issue's Relations panel in the UI. Idempotent: no-op if the document is already linked. Use list_issue_relations to see linked documents.",
    category: CATEGORY,
    inputSchema: linkDocumentToIssueParamsJsonSchema,
    handler: createToolHandler(
      "link_document_to_issue",
      parseLinkDocumentToIssueParams,
      linkDocumentToIssue
    )
  },
  {
    name: "unlink_document_from_issue",
    description: "Remove a document link from an issue. Idempotent: no-op if the document is not linked.",
    category: CATEGORY,
    inputSchema: unlinkDocumentFromIssueParamsJsonSchema,
    handler: createToolHandler(
      "unlink_document_from_issue",
      parseUnlinkDocumentFromIssueParams,
      unlinkDocumentFromIssue
    )
  }
]
