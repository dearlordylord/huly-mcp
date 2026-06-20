import {
  createLabelParamsJsonSchema,
  deleteLabelParamsJsonSchema,
  listLabelsParamsJsonSchema,
  parseCreateLabelParams,
  parseDeleteLabelParams,
  parseListLabelsParams,
  parseUpdateLabelParams,
  updateLabelParamsJsonSchema
} from "../../domain/schemas.js"
import {
  CreateLabelResultSchema,
  DeleteLabelResultSchema,
  ListLabelsResultSchema,
  UpdateLabelResultSchema
} from "../../domain/schemas/labels.js"
import { createLabel, deleteLabel, listLabels, updateLabel } from "../../huly/operations/labels.js"
import { defineTool, type RegisteredTool } from "./registry.js"

const CATEGORY = "labels" as const

export const labelTools: ReadonlyArray<RegisteredTool> = [
  defineTool(
    {
      name: "list_labels",
      description:
        "List label/tag definitions in the workspace. Labels are global (not project-scoped). Returns labels for tracker issues sorted by modification date (newest first).",
      category: CATEGORY,
      inputSchema: listLabelsParamsJsonSchema,
      resultSchema: ListLabelsResultSchema
    },
    parseListLabelsParams,
    listLabels
  ),
  defineTool(
    {
      name: "create_label",
      description:
        "Create a new label/tag definition in the workspace. Labels are global and can be attached to any issue. Returns existing label if one with the same title already exists (created=false). Use add_issue_label to attach a label to a specific issue.",
      category: CATEGORY,
      inputSchema: createLabelParamsJsonSchema,
      resultSchema: CreateLabelResultSchema
    },
    parseCreateLabelParams,
    createLabel
  ),
  defineTool(
    {
      name: "update_label",
      description: "Update a label/tag definition. Accepts label ID or title. Only provided fields are modified.",
      category: CATEGORY,
      inputSchema: updateLabelParamsJsonSchema,
      resultSchema: UpdateLabelResultSchema
    },
    parseUpdateLabelParams,
    updateLabel
  ),
  defineTool(
    {
      name: "delete_label",
      description:
        "Permanently delete a label/tag definition. Accepts label ID or title. This action cannot be undone.",
      category: CATEGORY,
      inputSchema: deleteLabelParamsJsonSchema,
      resultSchema: DeleteLabelResultSchema
    },
    parseDeleteLabelParams,
    deleteLabel
  )
]
