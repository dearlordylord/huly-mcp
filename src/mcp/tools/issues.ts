import {
  addLabelParamsJsonSchema,
  createIssueParamsJsonSchema,
  deleteIssueParamsJsonSchema,
  getIssueParamsJsonSchema,
  listIssuesParamsJsonSchema,
  parseAddLabelParams,
  parseCreateIssueParams,
  parseDeleteIssueParams,
  parseGetIssueParams,
  parseListIssuesParams,
  parseUpdateIssueParams,
  updateIssueParamsJsonSchema
} from "../../domain/schemas.js"
import { addLabel, createIssue, deleteIssue, getIssue, listIssues, updateIssue } from "../../huly/operations/issues.js"
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
  }
]
