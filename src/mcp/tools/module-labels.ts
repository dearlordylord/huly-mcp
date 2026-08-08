import {
  addDocumentLabelParamsJsonSchema,
  AddModuleLabelResultSchema,
  addTodoLabelParamsJsonSchema,
  ListAttachedModuleLabelsResultSchema,
  listDocumentLabelDefinitionsParamsJsonSchema,
  listDocumentLabelsParamsJsonSchema,
  ListModuleLabelDefinitionsResultSchema,
  listTodoLabelDefinitionsParamsJsonSchema,
  listTodoLabelsParamsJsonSchema,
  parseAddDocumentLabelParams,
  parseAddTodoLabelParams,
  parseListDocumentLabelDefinitionsParams,
  parseListDocumentLabelsParams,
  parseListTodoLabelDefinitionsParams,
  parseListTodoLabelsParams,
  parseRemoveDocumentLabelParams,
  parseRemoveTodoLabelParams,
  removeDocumentLabelParamsJsonSchema,
  RemoveModuleLabelResultSchema,
  removeTodoLabelParamsJsonSchema
} from "../../domain/schemas/module-labels.js"
import {
  addDocumentLabel,
  addTodoLabel,
  listDocumentLabelDefinitions,
  listDocumentLabels,
  listTodoLabelDefinitions,
  listTodoLabels,
  removeDocumentLabel,
  removeTodoLabel
} from "../../huly/operations/module-labels.js"
import { defineTool, type RegisteredTool } from "./registry.js"

export const moduleLabelTools = [
  defineTool(
    {
      name: "list_document_label_definitions",
      description:
        "List label definitions available for ordinary Huly documents by optional title substring. Does not expose raw target-class or category mechanics.",
      category: "documents",
      inputSchema: listDocumentLabelDefinitionsParamsJsonSchema,
      resultSchema: ListModuleLabelDefinitionsResultSchema
    },
    parseListDocumentLabelDefinitionsParams,
    listDocumentLabelDefinitions
  ),
  defineTool(
    {
      name: "list_document_labels",
      description:
        "List labels attached to one ordinary Huly document. Resolves the teamspace by name or ID and the document by title or ID; no raw class, space, or collection values are needed.",
      category: "documents",
      inputSchema: listDocumentLabelsParamsJsonSchema,
      resultSchema: ListAttachedModuleLabelsResultSchema
    },
    parseListDocumentLabelsParams,
    listDocumentLabels
  ),
  defineTool(
    {
      name: "add_document_label",
      description:
        "Idempotently attach a label to an ordinary Huly document resolved by teamspace and title or ID. label accepts a definition ID or exact title; a missing title creates the document label definition first, while duplicate exact titles return candidate IDs.",
      category: "documents",
      inputSchema: addDocumentLabelParamsJsonSchema,
      annotations: { idempotentHint: true },
      resultSchema: AddModuleLabelResultSchema
    },
    parseAddDocumentLabelParams,
    addDocumentLabel
  ),
  defineTool(
    {
      name: "remove_document_label",
      description:
        "Detach a label from one ordinary Huly document without deleting the reusable label definition. Returns detached=false when the label exists but is not attached; duplicate exact titles return candidate IDs.",
      category: "documents",
      inputSchema: removeDocumentLabelParamsJsonSchema,
      resultSchema: RemoveModuleLabelResultSchema
    },
    parseRemoveDocumentLabelParams,
    removeDocumentLabel
  ),
  defineTool(
    {
      name: "list_todo_label_definitions",
      description:
        "List label definitions available for Huly Planner ToDos by optional title substring. Does not expose raw target-class or category mechanics.",
      category: "planner",
      inputSchema: listTodoLabelDefinitionsParamsJsonSchema,
      resultSchema: ListModuleLabelDefinitionsResultSchema
    },
    parseListTodoLabelDefinitionsParams,
    listTodoLabelDefinitions
  ),
  defineTool(
    {
      name: "list_todo_labels",
      description:
        "List labels attached to one Planner ToDo. Resolves the ToDo by raw ID or the same human-oriented issue, title, owner, and completion locators used by get_todo.",
      category: "planner",
      inputSchema: listTodoLabelsParamsJsonSchema,
      resultSchema: ListAttachedModuleLabelsResultSchema
    },
    parseListTodoLabelsParams,
    listTodoLabels
  ),
  defineTool(
    {
      name: "add_todo_label",
      description:
        "Idempotently attach a label to a Planner ToDo resolved by raw ID or human locator. label accepts a definition ID or exact title; a missing title creates the ToDo label definition first, while duplicate exact titles return candidate IDs.",
      category: "planner",
      inputSchema: addTodoLabelParamsJsonSchema,
      annotations: { idempotentHint: true },
      resultSchema: AddModuleLabelResultSchema
    },
    parseAddTodoLabelParams,
    addTodoLabel
  ),
  defineTool(
    {
      name: "remove_todo_label",
      description:
        "Detach a label from one Planner ToDo without deleting the reusable label definition. Returns detached=false when the label exists but is not attached; duplicate exact titles return candidate IDs.",
      category: "planner",
      inputSchema: removeTodoLabelParamsJsonSchema,
      resultSchema: RemoveModuleLabelResultSchema
    },
    parseRemoveTodoLabelParams,
    removeTodoLabel
  )
] as const satisfies ReadonlyArray<RegisteredTool>
