import {
  parsePreviewDeletionParams,
  previewDeletionParamsJsonSchema,
  PreviewDeletionResultSchema
} from "../../domain/schemas/deletion.js"
import { previewDeletion } from "../../huly/operations/deletion.js"
import { defineTool, type RegisteredTool } from "./registry.js"

const CATEGORY = "issues" as const

export const deletionTools: ReadonlyArray<RegisteredTool> = [
  defineTool(
    {
      name: "preview_deletion",
      description:
        "Preview the impact of deleting a Huly entity before actually deleting it. Shows affected sub-entities, relations, and warnings. Supports issues, projects, components, and milestones. Use this to understand cascade effects before calling a delete operation.",
      category: CATEGORY,
      inputSchema: previewDeletionParamsJsonSchema,
      resultSchema: PreviewDeletionResultSchema
    },
    parsePreviewDeletionParams,
    previewDeletion
  )
]
