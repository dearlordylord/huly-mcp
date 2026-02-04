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
import { addComment, deleteComment, listComments, updateComment } from "../../huly/operations/comments.js"
import { createToolHandler, type RegisteredTool } from "./registry.js"

const CATEGORY = "Comments" as const

export const commentTools: ReadonlyArray<RegisteredTool> = [
  {
    name: "list_comments",
    description: "List comments on a Huly issue. Returns comments sorted by creation date (oldest first).",
    category: CATEGORY,
    inputSchema: listCommentsParamsJsonSchema,
    handler: createToolHandler(
      "list_comments",
      parseListCommentsParams,
      (params) => listComments(params)
    )
  },
  {
    name: "add_comment",
    description: "Add a comment to a Huly issue. Comment body supports markdown formatting.",
    category: CATEGORY,
    inputSchema: addCommentParamsJsonSchema,
    handler: createToolHandler(
      "add_comment",
      parseAddCommentParams,
      (params) => addComment(params)
    )
  },
  {
    name: "update_comment",
    description: "Update an existing comment on a Huly issue. Comment body supports markdown formatting.",
    category: CATEGORY,
    inputSchema: updateCommentParamsJsonSchema,
    handler: createToolHandler(
      "update_comment",
      parseUpdateCommentParams,
      (params) => updateComment(params)
    )
  },
  {
    name: "delete_comment",
    description: "Delete a comment from a Huly issue. This action cannot be undone.",
    category: CATEGORY,
    inputSchema: deleteCommentParamsJsonSchema,
    handler: createToolHandler(
      "delete_comment",
      parseDeleteCommentParams,
      (params) => deleteComment(params)
    )
  }
]
