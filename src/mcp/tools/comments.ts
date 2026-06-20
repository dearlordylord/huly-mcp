import {
  addCommentParamsJsonSchema,
  deleteCommentParamsJsonSchema,
  listCommentsParamsJsonSchema,
  parseAddCommentParams,
  parseDeleteCommentParams,
  parseListCommentsParams,
  parseUpdateCommentParams,
  updateCommentParamsJsonSchema
} from "../../domain/schemas.js"
import {
  AddCommentResultSchema,
  DeleteCommentResultSchema,
  ListCommentsResultSchema,
  UpdateCommentResultSchema
} from "../../domain/schemas/comments.js"
import { addComment, deleteComment, listComments, updateComment } from "../../huly/operations/comments.js"
import { defineTool, type RegisteredTool } from "./registry.js"

const CATEGORY = "comments" as const

export const commentTools: ReadonlyArray<RegisteredTool> = [
  defineTool(
    {
      name: "list_comments",
      description: "List comments on a Huly issue. Returns comments sorted by creation date (oldest first).",
      category: CATEGORY,
      inputSchema: listCommentsParamsJsonSchema,
      resultSchema: ListCommentsResultSchema
    },
    parseListCommentsParams,
    listComments
  ),
  defineTool(
    {
      name: "add_comment",
      description: "Add a comment to a Huly issue. Comment body supports markdown formatting.",
      category: CATEGORY,
      inputSchema: addCommentParamsJsonSchema,
      resultSchema: AddCommentResultSchema
    },
    parseAddCommentParams,
    addComment
  ),
  defineTool(
    {
      name: "update_comment",
      description: "Update an existing comment on a Huly issue. Comment body supports markdown formatting.",
      category: CATEGORY,
      inputSchema: updateCommentParamsJsonSchema,
      resultSchema: UpdateCommentResultSchema
    },
    parseUpdateCommentParams,
    updateComment
  ),
  defineTool(
    {
      name: "delete_comment",
      description: "Delete a comment from a Huly issue. This action cannot be undone.",
      category: CATEGORY,
      inputSchema: deleteCommentParamsJsonSchema,
      resultSchema: DeleteCommentResultSchema
    },
    parseDeleteCommentParams,
    deleteComment
  )
]
