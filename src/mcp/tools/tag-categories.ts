import {
  createTagCategoryParamsJsonSchema,
  CreateTagCategoryResultSchema,
  deleteTagCategoryParamsJsonSchema,
  DeleteTagCategoryResultSchema,
  listTagCategoriesParamsJsonSchema,
  ListTagCategoriesResultSchema,
  parseCreateTagCategoryParams,
  parseDeleteTagCategoryParams,
  parseListTagCategoriesParams,
  parseUpdateTagCategoryParams,
  updateTagCategoryParamsJsonSchema,
  UpdateTagCategoryResultSchema
} from "../../domain/schemas/tag-categories.js"
import {
  createTagCategory,
  deleteTagCategory,
  listTagCategories,
  updateTagCategory
} from "../../huly/operations/tag-categories.js"
import { defineTool, type RegisteredTool } from "./registry.js"

const CATEGORY = "tag-categories" as const

export const tagCategoryTools: ReadonlyArray<RegisteredTool> = [
  defineTool(
    {
      name: "list_tag_categories",
      description:
        "List tag/label categories in the workspace. Categories group labels (e.g., 'Priority Labels', 'Type Labels'). Omit targetClass to include all classes.",
      category: CATEGORY,
      inputSchema: listTagCategoriesParamsJsonSchema,
      resultSchema: ListTagCategoriesResultSchema
    },
    parseListTagCategoriesParams,
    listTagCategories
  ),
  defineTool(
    {
      name: "create_tag_category",
      description:
        "Create a new tag/label category. Idempotent: returns existing category if one with the same label and targetClass already exists (created=false). Defaults targetClass to tracker issues.",
      category: CATEGORY,
      inputSchema: createTagCategoryParamsJsonSchema,
      resultSchema: CreateTagCategoryResultSchema
    },
    parseCreateTagCategoryParams,
    createTagCategory
  ),
  defineTool(
    {
      name: "update_tag_category",
      description: "Update a tag/label category. Accepts category ID or label name. Only provided fields are modified.",
      category: CATEGORY,
      inputSchema: updateTagCategoryParamsJsonSchema,
      resultSchema: UpdateTagCategoryResultSchema
    },
    parseUpdateTagCategoryParams,
    updateTagCategory
  ),
  defineTool(
    {
      name: "delete_tag_category",
      description:
        "Permanently delete a tag/label category. Accepts category ID or label name. Labels in this category will be orphaned (not deleted). This action cannot be undone.",
      category: CATEGORY,
      inputSchema: deleteTagCategoryParamsJsonSchema,
      resultSchema: DeleteTagCategoryResultSchema
    },
    parseDeleteTagCategoryParams,
    deleteTagCategory
  )
]
