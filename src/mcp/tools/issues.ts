import {
  addLabelParamsJsonSchema,
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
  listComponentsParamsJsonSchema,
  listIssuesParamsJsonSchema,
  listIssueTemplatesParamsJsonSchema,
  parseAddLabelParams,
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
  parseListComponentsParams,
  parseListIssuesParams,
  parseListIssueTemplatesParams,
  parseSetIssueComponentParams,
  parseUpdateComponentParams,
  parseUpdateIssueParams,
  parseUpdateIssueTemplateParams,
  setIssueComponentParamsJsonSchema,
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
import {
  createIssueFromTemplate,
  createIssueTemplate,
  deleteIssueTemplate,
  getIssueTemplate,
  listIssueTemplates,
  updateIssueTemplate
} from "../../huly/operations/issue-templates.js"
import { addLabel, createIssue, deleteIssue, getIssue, listIssues, updateIssue } from "../../huly/operations/issues.js"
import { createToolHandler, type RegisteredTool } from "./registry.js"

const CATEGORY = "issues" as const

export const issueTools: ReadonlyArray<RegisteredTool> = [
  {
    name: "list_issues",
    description:
      "Query Huly issues with optional filters. Returns issues sorted by modification date (newest first). Supports filtering by project, status, assignee, and milestone. Supports searching by title substring (titleSearch) and description content (descriptionSearch).",
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
      "Retrieve full details for a Huly issue template. Use this to view template content and default values.",
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
      "Create a new issue template in a Huly project. Templates define default values for new issues. Returns the created template ID and title.",
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
      "Create a new issue from a template. Applies template defaults, allowing overrides for specific fields. Returns the created issue identifier.",
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
  }
]
