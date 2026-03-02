import {
  createTagCategoryParamsJsonSchema,
  deleteTagCategoryParamsJsonSchema,
  listTagCategoriesParamsJsonSchema,
  parseCreateTagCategoryParams,
  parseDeleteTagCategoryParams,
  parseListTagCategoriesParams,
  parseUpdateTagCategoryParams,
  updateTagCategoryParamsJsonSchema
} from "../../domain/schemas/tag-categories.js"
import {
  createTagCategory,
  deleteTagCategory,
  listTagCategories,
  updateTagCategory
} from "../../huly/operations/tag-categories.js"
import { createToolHandler, type RegisteredTool } from "./registry.js"

const CATEGORY = "tag-categories" as const

export const tagCategoryTools: ReadonlyArray<RegisteredTool> = [
  {
    name: "list_tag_categories",
    description:
      "List tag/label categories in the workspace. Categories group labels (e.g., 'Priority Labels', 'Type Labels'). Optional targetClass filter (defaults to all).",
    category: CATEGORY,
    inputSchema: listTagCategoriesParamsJsonSchema,
    handler: createToolHandler(
      "list_tag_categories",
      parseListTagCategoriesParams,
      listTagCategories
    )
  },
  {
    name: "create_tag_category",
    description:
      "Create a new tag/label category. Idempotent: returns existing category if one with the same label and targetClass already exists (created=false). Defaults targetClass to tracker issues.",
    category: CATEGORY,
    inputSchema: createTagCategoryParamsJsonSchema,
    handler: createToolHandler(
      "create_tag_category",
      parseCreateTagCategoryParams,
      createTagCategory
    )
  },
  {
    name: "update_tag_category",
    description: "Update a tag/label category. Accepts category ID or label name. Only provided fields are modified.",
    category: CATEGORY,
    inputSchema: updateTagCategoryParamsJsonSchema,
    handler: createToolHandler(
      "update_tag_category",
      parseUpdateTagCategoryParams,
      updateTagCategory
    )
  },
  {
    name: "delete_tag_category",
    description:
      "Permanently delete a tag/label category. Accepts category ID or label name. Labels in this category will be orphaned (not deleted). This action cannot be undone.",
    category: CATEGORY,
    inputSchema: deleteTagCategoryParamsJsonSchema,
    handler: createToolHandler(
      "delete_tag_category",
      parseDeleteTagCategoryParams,
      deleteTagCategory
    )
  }
]
