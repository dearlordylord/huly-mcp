import { HULY_NATIVE_REFERENCE_MARKDOWN_INPUT } from "../../domain/schemas.js"
import {
  addCardCommentParamsJsonSchema,
  AddCardCommentResultSchema,
  deleteCardCommentParamsJsonSchema,
  DeleteCardCommentResultSchema,
  listCardCommentsParamsJsonSchema,
  ListCardCommentsResultSchema,
  parseAddCardCommentParams,
  parseDeleteCardCommentParams,
  parseListCardCommentsParams,
  parseUpdateCardCommentParams,
  updateCardCommentParamsJsonSchema,
  UpdateCardCommentResultSchema
} from "../../domain/schemas/card-comments.js"
import {
  addCardComment,
  deleteCardComment,
  listCardComments,
  updateCardComment
} from "../../huly/operations/card-comments.js"
import { defineTool, type RegisteredTool } from "./registry.js"

const CATEGORY = "cards" as const

export const cardCommentTools = [
  defineTool(
    {
      name: "list_card_comments",
      description:
        "List comments on a Huly card. Accepts card space name/ID and card title/ID. Returns comments sorted by creation date (oldest first).",
      category: CATEGORY,
      inputSchema: listCardCommentsParamsJsonSchema,
      resultSchema: ListCardCommentsResultSchema
    },
    parseListCardCommentsParams,
    listCardComments
  ),
  defineTool(
    {
      name: "add_card_comment",
      description: "Add a comment to a Huly card. Comment body supports markdown formatting. "
        + HULY_NATIVE_REFERENCE_MARKDOWN_INPUT,
      category: CATEGORY,
      inputSchema: addCardCommentParamsJsonSchema,
      resultSchema: AddCardCommentResultSchema
    },
    parseAddCardCommentParams,
    addCardComment
  ),
  defineTool(
    {
      name: "update_card_comment",
      description: "Update an existing comment on a Huly card. Comment body supports markdown formatting. "
        + HULY_NATIVE_REFERENCE_MARKDOWN_INPUT,
      category: CATEGORY,
      inputSchema: updateCardCommentParamsJsonSchema,
      resultSchema: UpdateCardCommentResultSchema
    },
    parseUpdateCardCommentParams,
    updateCardComment
  ),
  defineTool(
    {
      name: "delete_card_comment",
      description: "Delete a comment from a Huly card. This action cannot be undone.",
      category: CATEGORY,
      inputSchema: deleteCardCommentParamsJsonSchema,
      resultSchema: DeleteCardCommentResultSchema
    },
    parseDeleteCardCommentParams,
    deleteCardComment
  )
] as const satisfies ReadonlyArray<RegisteredTool>
