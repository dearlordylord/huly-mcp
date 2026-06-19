import {
  addBoardCardLabelParamsJsonSchema,
  AddBoardCardLabelResultSchema,
  BoardCardDetailSchema,
  boardCardLabelParamsJsonSchema,
  boardCardMutationParamsJsonSchema,
  BoardCardMutationResultSchema,
  BoardCommonPreferenceResultSchema,
  BoardDetailSchema,
  BoardLabelMutationResultSchema,
  boardMutationParamsJsonSchema,
  BoardMutationResultSchema,
  BoardSavedViewDetailSchema,
  createBoardCardParamsJsonSchema,
  CreateBoardCardResultSchema,
  createBoardLabelParamsJsonSchema,
  createBoardParamsJsonSchema,
  CreateBoardResultSchema,
  DeleteBoardCardResultSchema,
  deleteBoardLabelParamsJsonSchema,
  getBoardCardParamsJsonSchema,
  getBoardCommonPreferenceParamsJsonSchema,
  getBoardParamsJsonSchema,
  getBoardSavedViewParamsJsonSchema,
  ListBoardCardLabelsResultSchema,
  listBoardCardsParamsJsonSchema,
  ListBoardCardsResultSchema,
  listBoardLabelsParamsJsonSchema,
  ListBoardLabelsResultSchema,
  listBoardMenuPagesParamsJsonSchema,
  ListBoardMenuPagesResultSchema,
  listBoardSavedViewsParamsJsonSchema,
  ListBoardSavedViewsResultSchema,
  listBoardsParamsJsonSchema,
  ListBoardsResultSchema,
  listBoardViewletsParamsJsonSchema,
  ListBoardViewletsResultSchema,
  parseAddBoardCardLabelParams,
  parseBoardCardLabelParams,
  parseBoardCardMutationParams,
  parseBoardMutationParams,
  parseCreateBoardCardParams,
  parseCreateBoardLabelParams,
  parseCreateBoardParams,
  parseDeleteBoardLabelParams,
  parseGetBoardCardParams,
  parseGetBoardCommonPreferenceParams,
  parseGetBoardParams,
  parseGetBoardSavedViewParams,
  parseListBoardCardsParams,
  parseListBoardLabelsParams,
  parseListBoardMenuPagesParams,
  parseListBoardSavedViewsParams,
  parseListBoardsParams,
  parseListBoardViewletsParams,
  parseRemoveBoardCardLabelParams,
  parseUpdateBoardCardParams,
  parseUpdateBoardLabelParams,
  parseUpdateBoardParams,
  removeBoardCardLabelParamsJsonSchema,
  RemoveBoardCardLabelResultSchema,
  updateBoardCardParamsJsonSchema,
  updateBoardLabelParamsJsonSchema,
  updateBoardParamsJsonSchema
} from "../../domain/schemas.js"
import {
  addBoardCardLabel,
  createBoardLabel,
  deleteBoardLabel,
  listBoardCardLabels,
  listBoardLabels,
  removeBoardCardLabel,
  updateBoardLabel
} from "../../huly/operations/board-labels.js"
import {
  getBoardCommonPreference,
  getBoardSavedView,
  listBoardMenuPages,
  listBoardSavedViews,
  listBoardViewlets
} from "../../huly/operations/board-views.js"
import {
  archiveBoard,
  archiveBoardCard,
  createBoard,
  createBoardCard,
  deleteBoardCard,
  getBoard,
  getBoardCard,
  listBoardCards,
  listBoards,
  unarchiveBoard,
  unarchiveBoardCard,
  updateBoard,
  updateBoardCard
} from "../../huly/operations/boards.js"
import { createEncodedToolHandler, type RegisteredTool } from "./registry.js"

const CATEGORY = "boards" as const

export const boardTools: ReadonlyArray<RegisteredTool> = [
  {
    name: "list_boards",
    description:
      "List Huly boards from @hcengineering/board, sorted by name. Boards are task.Project-backed spaces; this is not the separate Huly Card module.",
    category: CATEGORY,
    inputSchema: listBoardsParamsJsonSchema,
    handler: createEncodedToolHandler("list_boards", parseListBoardsParams, listBoards, ListBoardsResultSchema)
  },
  {
    name: "get_board",
    description:
      "Get one Huly board by board _id or exact board name. Returns board metadata, project type, and card count.",
    category: CATEGORY,
    inputSchema: getBoardParamsJsonSchema,
    handler: createEncodedToolHandler("get_board", parseGetBoardParams, getBoard, BoardDetailSchema)
  },
  {
    name: "create_board",
    description:
      "Create a Huly board. Idempotent by exact active board name; pass projectType by _id or exact name only when the default board project type is ambiguous.",
    category: CATEGORY,
    inputSchema: createBoardParamsJsonSchema,
    handler: createEncodedToolHandler("create_board", parseCreateBoardParams, createBoard, CreateBoardResultSchema)
  },
  {
    name: "update_board",
    description: "Update a Huly board's name, description, or privacy. board accepts board _id or exact board name.",
    category: CATEGORY,
    inputSchema: updateBoardParamsJsonSchema,
    handler: createEncodedToolHandler("update_board", parseUpdateBoardParams, updateBoard, BoardMutationResultSchema)
  },
  {
    name: "archive_board",
    description:
      "Archive a Huly board by board _id or exact board name. This hides the board but does not delete cards.",
    category: CATEGORY,
    inputSchema: boardMutationParamsJsonSchema,
    handler: createEncodedToolHandler(
      "archive_board",
      parseBoardMutationParams,
      archiveBoard,
      BoardMutationResultSchema
    )
  },
  {
    name: "unarchive_board",
    description: "Unarchive a Huly board by board _id or exact board name.",
    category: CATEGORY,
    inputSchema: boardMutationParamsJsonSchema,
    handler: createEncodedToolHandler(
      "unarchive_board",
      parseBoardMutationParams,
      unarchiveBoard,
      BoardMutationResultSchema
    )
  },
  {
    name: "list_board_cards",
    description:
      "List cards on one @hcengineering/board board. board accepts board _id or exact board name; cards are sorted newest modified first.",
    category: CATEGORY,
    inputSchema: listBoardCardsParamsJsonSchema,
    handler: createEncodedToolHandler(
      "list_board_cards",
      parseListBoardCardsParams,
      listBoardCards,
      ListBoardCardsResultSchema
    )
  },
  {
    name: "get_board_card",
    description:
      "Get one board card. board accepts board _id or exact board name; card accepts card _id, CARD-123, bare number 123, or exact title scoped to the board.",
    category: CATEGORY,
    inputSchema: getBoardCardParamsJsonSchema,
    handler: createEncodedToolHandler("get_board_card", parseGetBoardCardParams, getBoardCard, BoardCardDetailSchema)
  },
  {
    name: "create_board_card",
    description:
      "Create a board card with safe defaults. Resolves kind/status from the board project type, increments the CARD-number sequence, and stores markdown description as inline Huly Markup.",
    category: CATEGORY,
    inputSchema: createBoardCardParamsJsonSchema,
    handler: createEncodedToolHandler(
      "create_board_card",
      parseCreateBoardCardParams,
      createBoardCard,
      CreateBoardCardResultSchema
    )
  },
  {
    name: "update_board_card",
    description:
      "Update board card fields: title, markdown description, status, assignee, members, location, cover, startDate, and dueDate. Use null to clear clearable fields.",
    category: CATEGORY,
    inputSchema: updateBoardCardParamsJsonSchema,
    handler: createEncodedToolHandler(
      "update_board_card",
      parseUpdateBoardCardParams,
      updateBoardCard,
      BoardCardMutationResultSchema
    )
  },
  {
    name: "archive_board_card",
    description: "Archive a board card. card accepts _id, CARD-123, bare number, or exact title scoped to the board.",
    category: CATEGORY,
    inputSchema: boardCardMutationParamsJsonSchema,
    handler: createEncodedToolHandler(
      "archive_board_card",
      parseBoardCardMutationParams,
      archiveBoardCard,
      BoardCardMutationResultSchema
    )
  },
  {
    name: "unarchive_board_card",
    description: "Unarchive a board card. card accepts _id, CARD-123, bare number, or exact title scoped to the board.",
    category: CATEGORY,
    inputSchema: boardCardMutationParamsJsonSchema,
    handler: createEncodedToolHandler(
      "unarchive_board_card",
      parseBoardCardMutationParams,
      unarchiveBoardCard,
      BoardCardMutationResultSchema
    )
  },
  {
    name: "delete_board_card",
    description:
      "Permanently delete an already archived board card using Huly removeCollection. Active cards are rejected; call archive_board_card first.",
    category: CATEGORY,
    inputSchema: boardCardMutationParamsJsonSchema,
    handler: createEncodedToolHandler(
      "delete_board_card",
      parseBoardCardMutationParams,
      deleteBoardCard,
      DeleteBoardCardResultSchema
    )
  },
  {
    name: "list_board_labels",
    description:
      "List board label definitions. Board labels are @hcengineering/tags TagElement rows for board cards, with targetClass = @hcengineering/board Card.",
    category: CATEGORY,
    inputSchema: listBoardLabelsParamsJsonSchema,
    handler: createEncodedToolHandler(
      "list_board_labels",
      parseListBoardLabelsParams,
      listBoardLabels,
      ListBoardLabelsResultSchema
    )
  },
  {
    name: "create_board_label",
    description:
      "Create a board label definition for board cards. Idempotent by exact title when one label matches; uses board.category.Other when no default category exists.",
    category: CATEGORY,
    inputSchema: createBoardLabelParamsJsonSchema,
    handler: createEncodedToolHandler(
      "create_board_label",
      parseCreateBoardLabelParams,
      createBoardLabel,
      BoardLabelMutationResultSchema
    )
  },
  {
    name: "update_board_label",
    description:
      "Update a board label definition by TagElement _id or exact title. At least one of title, color, description, or category is required.",
    category: CATEGORY,
    inputSchema: updateBoardLabelParamsJsonSchema,
    handler: createEncodedToolHandler(
      "update_board_label",
      parseUpdateBoardLabelParams,
      updateBoardLabel,
      BoardLabelMutationResultSchema
    )
  },
  {
    name: "delete_board_label",
    description:
      "Delete one board label definition by TagElement _id or exact title. This removes the label definition, not a board card.",
    category: CATEGORY,
    inputSchema: deleteBoardLabelParamsJsonSchema,
    handler: createEncodedToolHandler(
      "delete_board_label",
      parseDeleteBoardLabelParams,
      deleteBoardLabel,
      BoardLabelMutationResultSchema
    )
  },
  {
    name: "list_board_card_labels",
    description:
      "List board labels attached to one board card. Resolves board by _id/name and card by _id, CARD-123, bare number, or exact title.",
    category: CATEGORY,
    inputSchema: boardCardLabelParamsJsonSchema,
    handler: createEncodedToolHandler(
      "list_board_card_labels",
      parseBoardCardLabelParams,
      listBoardCardLabels,
      ListBoardCardLabelsResultSchema
    )
  },
  {
    name: "add_board_card_label",
    description:
      "Attach a board label to a board card. If label is a new title, creates the board-card label definition first; repeated calls are idempotent.",
    category: CATEGORY,
    inputSchema: addBoardCardLabelParamsJsonSchema,
    handler: createEncodedToolHandler(
      "add_board_card_label",
      parseAddBoardCardLabelParams,
      addBoardCardLabel,
      AddBoardCardLabelResultSchema
    )
  },
  {
    name: "remove_board_card_label",
    description:
      "Detach a board label from one board card. Returns detached=false when the label exists but is not attached to that card.",
    category: CATEGORY,
    inputSchema: removeBoardCardLabelParamsJsonSchema,
    handler: createEncodedToolHandler(
      "remove_board_card_label",
      parseRemoveBoardCardLabelParams,
      removeBoardCardLabel,
      RemoveBoardCardLabelResultSchema
    )
  },
  {
    name: "list_board_menu_pages",
    description:
      "Read-only list of board menu page model docs. Optional page filters by MenuPage _id, raw pageId, main/archive alias, or exact label.",
    category: CATEGORY,
    inputSchema: listBoardMenuPagesParamsJsonSchema,
    handler: createEncodedToolHandler(
      "list_board_menu_pages",
      parseListBoardMenuPagesParams,
      listBoardMenuPages,
      ListBoardMenuPagesResultSchema
    )
  },
  {
    name: "list_board_saved_views",
    description:
      "Read-only list of board saved filtered views. Queries view.class.FilteredView where attachedTo = board.app.Board and reports own/shared visibility.",
    category: CATEGORY,
    inputSchema: listBoardSavedViewsParamsJsonSchema,
    handler: createEncodedToolHandler(
      "list_board_saved_views",
      parseListBoardSavedViewsParams,
      listBoardSavedViews,
      ListBoardSavedViewsResultSchema
    )
  },
  {
    name: "get_board_saved_view",
    description:
      "Read one board saved filtered view by FilteredView _id or exact name, scoped to attachedTo = board.app.Board. No saved-view writes are performed.",
    category: CATEGORY,
    inputSchema: getBoardSavedViewParamsJsonSchema,
    handler: createEncodedToolHandler(
      "get_board_saved_view",
      parseGetBoardSavedViewParams,
      getBoardSavedView,
      BoardSavedViewDetailSchema
    )
  },
  {
    name: "list_board_viewlets",
    description:
      "Read-only list of board card viewlets. Queries view.class.Viewlet with attachTo = board.class.Card and includes descriptor metadata plus matching ViewletPreference configs.",
    category: CATEGORY,
    inputSchema: listBoardViewletsParamsJsonSchema,
    handler: createEncodedToolHandler(
      "list_board_viewlets",
      parseListBoardViewletsParams,
      listBoardViewlets,
      ListBoardViewletsResultSchema
    )
  },
  {
    name: "get_board_common_preference",
    description:
      "Read the CommonBoardPreference row attached to board.app.Board. Returns present=false when the preference row is absent and never creates it.",
    category: CATEGORY,
    inputSchema: getBoardCommonPreferenceParamsJsonSchema,
    handler: createEncodedToolHandler(
      "get_board_common_preference",
      parseGetBoardCommonPreferenceParams,
      getBoardCommonPreference,
      BoardCommonPreferenceResultSchema
    )
  }
]
