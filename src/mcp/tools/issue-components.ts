import {
  createComponentParamsJsonSchema,
  deleteComponentParamsJsonSchema,
  getComponentParamsJsonSchema,
  listComponentsParamsJsonSchema,
  parseCreateComponentParams,
  parseDeleteComponentParams,
  parseGetComponentParams,
  parseListComponentsParams,
  parseSetIssueComponentParams,
  parseUpdateComponentParams,
  setIssueComponentParamsJsonSchema,
  updateComponentParamsJsonSchema,
  CreateComponentResultSchema,
  DeleteComponentResultSchema,
  GetComponentResultSchema,
  ListComponentsResultSchema,
  SetIssueComponentResultSchema,
  UpdateComponentResultSchema
} from "../../domain/schemas/components.js"
import { HULY_NATIVE_REFERENCE_MARKDOWN_INPUT } from "../../domain/schemas/document-native-references.js"
import {
  createComponent,
  deleteComponent,
  getComponent,
  listComponents,
  setIssueComponent,
  updateComponent
} from "../../huly/operations/components.js"
import { defineTool, type RegisteredTool } from "./registry.js"

const CATEGORY = "issues" as const

export const issueComponentTools = [
  defineTool(
    {
      name: "list_components",
      description:
        "List components in a Huly project. Components organize issues by area/feature. Returns components sorted by modification date (newest first).",
      category: CATEGORY,
      inputSchema: listComponentsParamsJsonSchema,
      resultSchema: ListComponentsResultSchema
    },
    parseListComponentsParams,
    listComponents
  ),
  defineTool(
    {
      name: "get_component",
      description: "Retrieve full details for a Huly component. Use this to view component content and metadata.",
      category: CATEGORY,
      inputSchema: getComponentParamsJsonSchema,
      resultSchema: GetComponentResultSchema
    },
    parseGetComponentParams,
    getComponent
  ),
  defineTool(
    {
      name: "create_component",
      description:
        "Create a new component in a Huly project. Components help organize issues by area/feature. Description supports markdown. " +
        HULY_NATIVE_REFERENCE_MARKDOWN_INPUT +
        " Returns the created component ID and label.",
      category: CATEGORY,
      inputSchema: createComponentParamsJsonSchema,
      resultSchema: CreateComponentResultSchema
    },
    parseCreateComponentParams,
    createComponent
  ),
  defineTool(
    {
      name: "update_component",
      description:
        "Update fields on an existing Huly component. Only provided fields are modified. Description supports markdown. " +
        HULY_NATIVE_REFERENCE_MARKDOWN_INPUT,
      category: CATEGORY,
      inputSchema: updateComponentParamsJsonSchema,
      resultSchema: UpdateComponentResultSchema
    },
    parseUpdateComponentParams,
    updateComponent
  ),
  defineTool(
    {
      name: "set_issue_component",
      description: "Set or clear the component on a Huly issue. Pass null for component to clear it.",
      category: CATEGORY,
      inputSchema: setIssueComponentParamsJsonSchema,
      resultSchema: SetIssueComponentResultSchema
    },
    parseSetIssueComponentParams,
    setIssueComponent
  ),
  defineTool(
    {
      name: "delete_component",
      description: "Permanently delete a Huly component. This action cannot be undone.",
      category: CATEGORY,
      inputSchema: deleteComponentParamsJsonSchema,
      resultSchema: DeleteComponentResultSchema
    },
    parseDeleteComponentParams,
    deleteComponent
  )
] as const satisfies ReadonlyArray<RegisteredTool>
