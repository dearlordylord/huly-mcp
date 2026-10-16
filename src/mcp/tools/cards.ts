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
  updateCardParamsJsonSchema,
  CreateCardResultSchema,
  DeleteCardResultSchema,
  GetCardResultSchema,
  ListCardSpacesResultSchema,
  ListCardsResultSchema,
  ListMasterTagsResultSchema,
  UpdateCardResultSchema
} from "../../domain/schemas/cards.js"
import { HULY_NATIVE_REFERENCE_MARKDOWN_INPUT } from "../../domain/schemas/document-native-references.js"
import {
  listCardVersionsParamsJsonSchema,
  parseListCardVersionsParams,
  ListCardVersionsResultSchema
} from "../../domain/schemas/card-versions.js"

import {
  createCard,
  deleteCard,
  getCard,
  listCards,
  listCardSpaces,
  listCardVersions,
  listMasterTags,
  updateCard
} from "../../huly/operations/cards.js"
import { defineTool, type RegisteredTool } from "./registry.js"

const CATEGORY = "cards" as const

export const cardTools = [
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
        "Retrieve full details for a Huly card including markdown content. When Huly supplies a coherent version number and chain identity, returns them together in one version object; partial or null version fields are omitted.",
      category: CATEGORY,
      inputSchema: getCardParamsJsonSchema,
      resultSchema: GetCardResultSchema
    },
    parseGetCardParams,
    getCard
  ),
  defineTool(
    {
      name: "list_card_versions",
      description:
        "Read one page of a Huly card's version history using any version card ID or exact title. Returns deterministic oldest-version-first entries, an authoritative total for the full history, and hasMore when the limit truncates the page. Unversioned cards return one entry without version metadata. This tool never creates or restores versions.",
      category: CATEGORY,
      inputSchema: listCardVersionsParamsJsonSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      resultSchema: ListCardVersionsResultSchema
    },
    parseListCardVersionsParams,
    listCardVersions
  ),
  defineTool(
    {
      name: "create_card",
      description:
        "Create a new card in a Huly card space. Requires a master tag (card type). Content supports markdown formatting. " +
        HULY_NATIVE_REFERENCE_MARKDOWN_INPUT +
        " Returns the created card id.",
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
        "Update fields on an existing Huly card. Only provided fields are modified. Content updates support markdown. " +
        HULY_NATIVE_REFERENCE_MARKDOWN_INPUT,
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
] as const satisfies ReadonlyArray<RegisteredTool>
