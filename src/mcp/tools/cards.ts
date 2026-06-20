import {
  createCardParamsJsonSchema,
  deleteCardParamsJsonSchema,
  getCardParamsJsonSchema,
  listCardSpacesParamsJsonSchema,
  listCardsParamsJsonSchema,
  listMasterTagsParamsJsonSchema,
  parseCreateCardParams,
  parseDeleteCardParams,
  parseGetCardParams,
  parseListCardSpacesParams,
  parseListCardsParams,
  parseListMasterTagsParams,
  parseUpdateCardParams,
  updateCardParamsJsonSchema
} from "../../domain/schemas.js"
import {
  CreateCardResultSchema,
  DeleteCardResultSchema,
  GetCardResultSchema,
  ListCardSpacesResultSchema,
  ListCardsResultSchema,
  ListMasterTagsResultSchema,
  UpdateCardResultSchema
} from "../../domain/schemas/cards.js"
import {
  createCard,
  deleteCard,
  getCard,
  listCards,
  listCardSpaces,
  listMasterTags,
  updateCard
} from "../../huly/operations/cards.js"
import { defineTool, type RegisteredTool } from "./registry.js"

const CATEGORY = "cards" as const

export const cardTools: ReadonlyArray<RegisteredTool> = [
  defineTool(
    {
      name: "list_card_spaces",
      description:
        "List all Huly card spaces. Returns card spaces sorted by name. Card spaces are containers for cards.",
      category: CATEGORY,
      inputSchema: listCardSpacesParamsJsonSchema,
      resultSchema: ListCardSpacesResultSchema
    },
    parseListCardSpacesParams,
    listCardSpaces
  ),
  defineTool(
    {
      name: "list_master_tags",
      description:
        "List master tags (card types) available in a Huly card space. Master tags define the type/schema of cards that can be created in a space.",
      category: CATEGORY,
      inputSchema: listMasterTagsParamsJsonSchema,
      resultSchema: ListMasterTagsResultSchema
    },
    parseListMasterTagsParams,
    listMasterTags
  ),
  defineTool(
    {
      name: "list_cards",
      description:
        "List cards in a Huly card space. Returns cards sorted by modification date (newest first). Supports filtering by type (master tag), title substring, and content search.",
      category: CATEGORY,
      inputSchema: listCardsParamsJsonSchema,
      resultSchema: ListCardsResultSchema
    },
    parseListCardsParams,
    listCards
  ),
  defineTool(
    {
      name: "get_card",
      description:
        "Retrieve full details for a Huly card including markdown content. Use this to view card content and metadata.",
      category: CATEGORY,
      inputSchema: getCardParamsJsonSchema,
      resultSchema: GetCardResultSchema
    },
    parseGetCardParams,
    getCard
  ),
  defineTool(
    {
      name: "create_card",
      description:
        "Create a new card in a Huly card space. Requires a master tag (card type). Content supports markdown formatting. Returns the created card id.",
      category: CATEGORY,
      inputSchema: createCardParamsJsonSchema,
      resultSchema: CreateCardResultSchema
    },
    parseCreateCardParams,
    createCard
  ),
  defineTool(
    {
      name: "update_card",
      description:
        "Update fields on an existing Huly card. Only provided fields are modified. Content updates support markdown.",
      category: CATEGORY,
      inputSchema: updateCardParamsJsonSchema,
      resultSchema: UpdateCardResultSchema
    },
    parseUpdateCardParams,
    updateCard
  ),
  defineTool(
    {
      name: "delete_card",
      description: "Permanently delete a Huly card. This action cannot be undone.",
      category: CATEGORY,
      inputSchema: deleteCardParamsJsonSchema,
      resultSchema: DeleteCardResultSchema
    },
    parseDeleteCardParams,
    deleteCard
  )
]
