import { HULY_NATIVE_REFERENCE_MARKDOWN_INPUT } from "../../domain/schemas/document-native-references.js"
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
        "List comments genuinely attached to one Huly card, oldest first. Resolves cardSpace by exact name or ID and card by exact title or ID. Includes comments created by this MCP server and compatible Huly UI card-comment conventions.",
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
      description:
        "Add a markdown comment to one Huly card, resolving the card space by exact name or ID and the card by exact title or ID. " +
        HULY_NATIVE_REFERENCE_MARKDOWN_INPUT,
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
      description:
        "Update one comment that belongs to the resolved Huly card. Resolves the card space by exact name or ID and the card by exact title or ID. " +
        HULY_NATIVE_REFERENCE_MARKDOWN_INPUT,
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
      description:
        "Permanently delete one comment that belongs to the resolved Huly card. Resolves the card space by exact name or ID and the card by exact title or ID. This action cannot be undone.",
      category: CATEGORY,
      inputSchema: deleteCardCommentParamsJsonSchema,
      resultSchema: DeleteCardCommentResultSchema
    },
    parseDeleteCardCommentParams,
    deleteCardComment
  )
] as const satisfies ReadonlyArray<RegisteredTool>
