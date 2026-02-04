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
  addLabel,
  createComponent,
  createIssue,
  createIssueFromTemplate,
  createIssueTemplate,
  deleteComponent,
  deleteIssue,
  deleteIssueTemplate,
  getComponent,
  getIssue,
  getIssueTemplate,
  listComponents,
  listIssues,
  listIssueTemplates,
  setIssueComponent,
  updateComponent,
  updateIssue,
  updateIssueTemplate
} from "../../huly/operations/issues.js"
import { createToolHandler, type RegisteredTool } from "./registry.js"

export const issueTools: ReadonlyArray<RegisteredTool> = [
  {
    name: "list_issues",
    description:
      "Query Huly issues with optional filters. Returns issues sorted by modification date (newest first). Supports filtering by project, status, assignee, and milestone. Supports searching by title substring (titleSearch) and description content (descriptionSearch).",
    inputSchema: listIssuesParamsJsonSchema,
    handler: createToolHandler(
      "list_issues",
      parseListIssuesParams,
      (params) => listIssues(params)
    )
  },
  {
    name: "get_issue",
    description:
      "Retrieve full details for a Huly issue including markdown description. Use this to view issue content, comments, or full metadata.",
    inputSchema: getIssueParamsJsonSchema,
    handler: createToolHandler(
      "get_issue",
      parseGetIssueParams,
      (params) => getIssue(params)
    )
  },
  {
    name: "create_issue",
    description:
      "Create a new issue in a Huly project. Description supports markdown formatting. Returns the created issue identifier.",
    inputSchema: createIssueParamsJsonSchema,
    handler: createToolHandler(
      "create_issue",
      parseCreateIssueParams,
      (params) => createIssue(params)
    )
  },
  {
    name: "update_issue",
    description:
      "Update fields on an existing Huly issue. Only provided fields are modified. Description updates support markdown.",
    inputSchema: updateIssueParamsJsonSchema,
    handler: createToolHandler(
      "update_issue",
      parseUpdateIssueParams,
      (params) => updateIssue(params)
    )
  },
  {
    name: "add_issue_label",
    description: "Add a tag/label to a Huly issue. Creates the tag if it doesn't exist in the project.",
    inputSchema: addLabelParamsJsonSchema,
    handler: createToolHandler(
      "add_issue_label",
      parseAddLabelParams,
      (params) => addLabel(params)
    )
  },
  {
    name: "delete_issue",
    description: "Permanently delete a Huly issue. This action cannot be undone.",
    inputSchema: deleteIssueParamsJsonSchema,
    handler: createToolHandler(
      "delete_issue",
      parseDeleteIssueParams,
      (params) => deleteIssue(params)
    )
  },
  // Component tools
  {
    name: "list_components",
    description: "List components in a Huly project. Components organize issues by area/feature. Returns components sorted by modification date (newest first).",
    inputSchema: listComponentsParamsJsonSchema,
    handler: createToolHandler(
      "list_components",
      parseListComponentsParams,
      (params) => listComponents(params)
    )
  },
  {
    name: "get_component",
    description: "Retrieve full details for a Huly component. Use this to view component content and metadata.",
    inputSchema: getComponentParamsJsonSchema,
    handler: createToolHandler(
      "get_component",
      parseGetComponentParams,
      (params) => getComponent(params)
    )
  },
  {
    name: "create_component",
    description: "Create a new component in a Huly project. Components help organize issues by area/feature. Returns the created component ID and label.",
    inputSchema: createComponentParamsJsonSchema,
    handler: createToolHandler(
      "create_component",
      parseCreateComponentParams,
      (params) => createComponent(params)
    )
  },
  {
    name: "update_component",
    description: "Update fields on an existing Huly component. Only provided fields are modified.",
    inputSchema: updateComponentParamsJsonSchema,
    handler: createToolHandler(
      "update_component",
      parseUpdateComponentParams,
      (params) => updateComponent(params)
    )
  },
  {
    name: "set_issue_component",
    description: "Set or clear the component on a Huly issue. Pass null for component to clear it.",
    inputSchema: setIssueComponentParamsJsonSchema,
    handler: createToolHandler(
      "set_issue_component",
      parseSetIssueComponentParams,
      (params) => setIssueComponent(params)
    )
  },
  {
    name: "delete_component",
    description: "Permanently delete a Huly component. This action cannot be undone.",
    inputSchema: deleteComponentParamsJsonSchema,
    handler: createToolHandler(
      "delete_component",
      parseDeleteComponentParams,
      (params) => deleteComponent(params)
    )
  },
  // Issue Template tools
  {
    name: "list_issue_templates",
    description: "List issue templates in a Huly project. Templates define reusable issue configurations. Returns templates sorted by modification date (newest first).",
    inputSchema: listIssueTemplatesParamsJsonSchema,
    handler: createToolHandler(
      "list_issue_templates",
      parseListIssueTemplatesParams,
      (params) => listIssueTemplates(params)
    )
  },
  {
    name: "get_issue_template",
    description: "Retrieve full details for a Huly issue template. Use this to view template content and default values.",
    inputSchema: getIssueTemplateParamsJsonSchema,
    handler: createToolHandler(
      "get_issue_template",
      parseGetIssueTemplateParams,
      (params) => getIssueTemplate(params)
    )
  },
  {
    name: "create_issue_template",
    description: "Create a new issue template in a Huly project. Templates define default values for new issues. Returns the created template ID and title.",
    inputSchema: createIssueTemplateParamsJsonSchema,
    handler: createToolHandler(
      "create_issue_template",
      parseCreateIssueTemplateParams,
      (params) => createIssueTemplate(params)
    )
  },
  {
    name: "create_issue_from_template",
    description: "Create a new issue from a template. Applies template defaults, allowing overrides for specific fields. Returns the created issue identifier.",
    inputSchema: createIssueFromTemplateParamsJsonSchema,
    handler: createToolHandler(
      "create_issue_from_template",
      parseCreateIssueFromTemplateParams,
      (params) => createIssueFromTemplate(params)
    )
  },
  {
    name: "update_issue_template",
    description: "Update fields on an existing Huly issue template. Only provided fields are modified.",
    inputSchema: updateIssueTemplateParamsJsonSchema,
    handler: createToolHandler(
      "update_issue_template",
      parseUpdateIssueTemplateParams,
      (params) => updateIssueTemplate(params)
    )
  },
  {
    name: "delete_issue_template",
    description: "Permanently delete a Huly issue template. This action cannot be undone.",
    inputSchema: deleteIssueTemplateParamsJsonSchema,
    handler: createToolHandler(
      "delete_issue_template",
      parseDeleteIssueTemplateParams,
      (params) => deleteIssueTemplate(params)
    )
  }
]
