import {
  addIssueRelationParamsJsonSchema,
  addLabelParamsJsonSchema,
  addTemplateChildParamsJsonSchema,
  createIssueFromTemplateParamsJsonSchema,
  createIssueParamsJsonSchema,
  createIssueTemplateParamsJsonSchema,
  deleteIssueParamsJsonSchema,
  deleteIssueTemplateParamsJsonSchema,
  getIssueParamsJsonSchema,
  getIssueTemplateParamsJsonSchema,
  linkDocumentToIssueParamsJsonSchema,
  listIssueRelationsParamsJsonSchema,
  listIssuesParamsJsonSchema,
  listIssueTemplatesParamsJsonSchema,
  moveIssueParamsJsonSchema,
  parseAddIssueRelationParams,
  parseAddLabelParams,
  parseAddTemplateChildParams,
  parseCreateIssueFromTemplateParams,
  parseCreateIssueParams,
  parseCreateIssueTemplateParams,
  parseDeleteIssueParams,
  parseDeleteIssueTemplateParams,
  parseGetIssueParams,
  parseGetIssueTemplateParams,
  parseLinkDocumentToIssueParams,
  parseListIssueRelationsParams,
  parseListIssuesParams,
  parseListIssueTemplatesParams,
  parseMoveIssueParams,
  parseRemoveIssueRelationParams,
  parseRemoveLabelParams,
  parseRemoveTemplateChildParams,
  parseUnlinkDocumentFromIssueParams,
  parseUpdateIssueParams,
  parseUpdateIssueTemplateParams,
  removeIssueRelationParamsJsonSchema,
  removeLabelParamsJsonSchema,
  removeTemplateChildParamsJsonSchema,
  unlinkDocumentFromIssueParamsJsonSchema,
  updateIssueParamsJsonSchema,
  updateIssueTemplateParamsJsonSchema
} from "../../domain/schemas.js"
import {
  LinkDocumentToIssueResultSchema,
  UnlinkDocumentFromIssueResultSchema
} from "../../domain/schemas/document-relations.js"
import {
  AddTemplateChildResultSchema,
  CreateIssueFromTemplateResultSchema,
  CreateIssueTemplateResultSchema,
  DeleteIssueTemplateResultSchema,
  GetIssueTemplateResultSchema,
  ListIssueTemplatesResultSchema,
  RemoveTemplateChildResultSchema,
  UpdateIssueTemplateResultSchema
} from "../../domain/schemas/issue-templates.js"
import {
  AddIssueLabelResultSchema,
  CreateIssueResultSchema,
  DeleteIssueResultSchema,
  GetIssueResultSchema,
  ListIssuesResultSchema,
  MoveIssueResultSchema,
  RemoveIssueLabelResultSchema,
  UpdateIssueResultSchema
} from "../../domain/schemas/issues-results.js"
import {
  AddIssueRelationResultSchema,
  ListIssueRelationsResultSchema,
  RemoveIssueRelationResultSchema
} from "../../domain/schemas/relations.js"
import { enumValuesDescription } from "../../domain/schemas/shared.js"
import { StatusCategoryValues } from "../../domain/schemas/task-management.js"
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
import { issueComponentTools } from "./issue-components.js"
import { defineTool, type RegisteredTool } from "./registry.js"
const CATEGORY = "issues" as const
export const issueTools: ReadonlyArray<RegisteredTool> = [
  defineTool(
    {
      name: "list_issues",
      description:
        `Query Huly issues with optional filters. Returns issues sorted by modification date (newest first). Supports filtering by project, exact workflow status name (status), Huly SDK task.statusCategory key (statusCategory: ${
          enumValuesDescription(StatusCategoryValues)
        }), assignee, component, and parentIssue (to list children of a specific issue). Supports searching by title substring (titleSearch) and description content (descriptionSearch).`,
      category: CATEGORY,
      inputSchema: listIssuesParamsJsonSchema,
      resultSchema: ListIssuesResultSchema
    },
    parseListIssuesParams,
    listIssues
  ),
  defineTool(
    {
      name: "get_issue",
      description:
        "Retrieve full details for a Huly issue including markdown description. Use this to view issue content, comments, or full metadata.",
      category: CATEGORY,
      inputSchema: getIssueParamsJsonSchema,
      resultSchema: GetIssueResultSchema
    },
    parseGetIssueParams,
    getIssue
  ),
  defineTool(
    {
      name: "create_issue",
      description:
        "Create a new issue in a Huly project. Optionally set taskType by ID or display name; it is resolved within the target project's project type, and status is validated against that task type's workflow. Use list_task_types or get_project_type to discover valid task types and statuses. Optionally create as a sub-issue by specifying parentIssue. Description supports markdown formatting. Returns the created issue identifier.",
      category: CATEGORY,
      inputSchema: createIssueParamsJsonSchema,
      resultSchema: CreateIssueResultSchema
    },
    parseCreateIssueParams,
    createIssue
  ),
  defineTool(
    {
      name: "update_issue",
      description:
        "Update fields on an existing Huly issue. Optionally set taskType by ID or display name; it is resolved within the target project's project type, and the status is preserved only when valid for the new task type. Use list_task_types or get_project_type to discover valid task types and statuses. Only provided fields are modified. Description updates support markdown.",
      category: CATEGORY,
      inputSchema: updateIssueParamsJsonSchema,
      resultSchema: UpdateIssueResultSchema
    },
    parseUpdateIssueParams,
    updateIssue
  ),
  defineTool(
    {
      name: "add_issue_label",
      description: "Add a tag/label to a Huly issue. Creates the tag if it doesn't exist in the project.",
      category: CATEGORY,
      inputSchema: addLabelParamsJsonSchema,
      resultSchema: AddIssueLabelResultSchema
    },
    parseAddLabelParams,
    addLabel
  ),
  defineTool(
    {
      name: "remove_issue_label",
      description:
        "Remove a tag/label from a Huly issue. Detaches the label reference; does not delete the label definition.",
      category: CATEGORY,
      inputSchema: removeLabelParamsJsonSchema,
      resultSchema: RemoveIssueLabelResultSchema
    },
    parseRemoveLabelParams,
    removeIssueLabel
  ),
  defineTool(
    {
      name: "delete_issue",
      description: "Permanently delete a Huly issue. This action cannot be undone.",
      category: CATEGORY,
      inputSchema: deleteIssueParamsJsonSchema,
      resultSchema: DeleteIssueResultSchema
    },
    parseDeleteIssueParams,
    deleteIssue
  ),
  defineTool(
    {
      name: "move_issue",
      description:
        "Move an issue to a new parent (making it a sub-issue) or to top-level (null). Updates parent/child relationships and sub-issue counts.",
      category: CATEGORY,
      inputSchema: moveIssueParamsJsonSchema,
      resultSchema: MoveIssueResultSchema
    },
    parseMoveIssueParams,
    moveIssue
  ),
  ...issueComponentTools,
  defineTool(
    {
      name: "list_issue_templates",
      description:
        "List issue templates in a Huly project. Templates define reusable issue configurations. Returns templates sorted by modification date (newest first).",
      category: CATEGORY,
      inputSchema: listIssueTemplatesParamsJsonSchema,
      resultSchema: ListIssueTemplatesResultSchema
    },
    parseListIssueTemplatesParams,
    listIssueTemplates
  ),
  defineTool(
    {
      name: "get_issue_template",
      description:
        "Retrieve full details for a Huly issue template including children (sub-task templates). Use this to view template content, default values, and child template IDs.",
      category: CATEGORY,
      inputSchema: getIssueTemplateParamsJsonSchema,
      resultSchema: GetIssueTemplateResultSchema
    },
    parseGetIssueTemplateParams,
    getIssueTemplate
  ),
  defineTool(
    {
      name: "create_issue_template",
      description:
        "Create a new issue template in a Huly project. Templates define default values for new issues. Optionally include children (sub-task templates) that will become sub-issues when creating issues from this template. Returns the created template ID and title.",
      category: CATEGORY,
      inputSchema: createIssueTemplateParamsJsonSchema,
      resultSchema: CreateIssueTemplateResultSchema
    },
    parseCreateIssueTemplateParams,
    createIssueTemplate
  ),
  defineTool(
    {
      name: "create_issue_from_template",
      description:
        "Create a new issue from a template. Applies template defaults, allowing overrides for specific fields. If the template has children (sub-task templates), sub-issues are created automatically unless includeChildren is set to false. Returns the created issue identifier and count of children created.",
      category: CATEGORY,
      inputSchema: createIssueFromTemplateParamsJsonSchema,
      resultSchema: CreateIssueFromTemplateResultSchema
    },
    parseCreateIssueFromTemplateParams,
    createIssueFromTemplate
  ),
  defineTool(
    {
      name: "update_issue_template",
      description: "Update fields on an existing Huly issue template. Only provided fields are modified.",
      category: CATEGORY,
      inputSchema: updateIssueTemplateParamsJsonSchema,
      resultSchema: UpdateIssueTemplateResultSchema
    },
    parseUpdateIssueTemplateParams,
    updateIssueTemplate
  ),
  defineTool(
    {
      name: "delete_issue_template",
      description: "Permanently delete a Huly issue template. This action cannot be undone.",
      category: CATEGORY,
      inputSchema: deleteIssueTemplateParamsJsonSchema,
      resultSchema: DeleteIssueTemplateResultSchema
    },
    parseDeleteIssueTemplateParams,
    deleteIssueTemplate
  ),
  defineTool(
    {
      name: "add_template_child",
      description:
        "Add a child (sub-task) template to an issue template. The child defines default values for sub-issues created when using create_issue_from_template. Returns the child template ID.",
      category: CATEGORY,
      inputSchema: addTemplateChildParamsJsonSchema,
      resultSchema: AddTemplateChildResultSchema
    },
    parseAddTemplateChildParams,
    addTemplateChild
  ),
  defineTool(
    {
      name: "remove_template_child",
      description:
        "Remove a child (sub-task) template from an issue template by its child ID. Get child IDs from get_issue_template response.",
      category: CATEGORY,
      inputSchema: removeTemplateChildParamsJsonSchema,
      resultSchema: RemoveTemplateChildResultSchema
    },
    parseRemoveTemplateChildParams,
    removeTemplateChild
  ),
  defineTool(
    {
      name: "add_issue_relation",
      description:
        "Add a relation between two issues. Relation types: 'blocks' (source blocks target — pushes into target's blockedBy), 'is-blocked-by' (source is blocked by target — pushes into source's blockedBy), 'relates-to' (bidirectional link — updates both sides). targetIssue accepts cross-project identifiers like 'OTHER-42'. No-op if the relation already exists.",
      category: CATEGORY,
      inputSchema: addIssueRelationParamsJsonSchema,
      resultSchema: AddIssueRelationResultSchema
    },
    parseAddIssueRelationParams,
    addIssueRelation
  ),
  defineTool(
    {
      name: "remove_issue_relation",
      description:
        "Remove a relation between two issues. Mirrors add_issue_relation: 'blocks' pulls from target's blockedBy, 'is-blocked-by' pulls from source's blockedBy, 'relates-to' pulls from both sides. No-op if the relation doesn't exist.",
      category: CATEGORY,
      inputSchema: removeIssueRelationParamsJsonSchema,
      resultSchema: RemoveIssueRelationResultSchema
    },
    parseRemoveIssueRelationParams,
    removeIssueRelation
  ),
  defineTool(
    {
      name: "list_issue_relations",
      description:
        "List all relations of an issue. Returns blockedBy (issues blocking this one), blocks (issues this one blocks), relations (bidirectional issue links), and documents (linked documents with title/teamspace).",
      category: CATEGORY,
      inputSchema: listIssueRelationsParamsJsonSchema,
      resultSchema: ListIssueRelationsResultSchema
    },
    parseListIssueRelationsParams,
    listIssueRelations
  ),
  defineTool(
    {
      name: "link_document_to_issue",
      description:
        "Link a Huly document to an issue. The link appears in the issue's Relations panel in the UI. Idempotent: no-op if the document is already linked. Use list_issue_relations to see linked documents.",
      category: CATEGORY,
      inputSchema: linkDocumentToIssueParamsJsonSchema,
      resultSchema: LinkDocumentToIssueResultSchema
    },
    parseLinkDocumentToIssueParams,
    linkDocumentToIssue
  ),
  defineTool(
    {
      name: "unlink_document_from_issue",
      description: "Remove a document link from an issue. Idempotent: no-op if the document is not linked.",
      category: CATEGORY,
      inputSchema: unlinkDocumentFromIssueParamsJsonSchema,
      resultSchema: UnlinkDocumentFromIssueResultSchema
    },
    parseUnlinkDocumentFromIssueParams,
    unlinkDocumentFromIssue
  )
]
