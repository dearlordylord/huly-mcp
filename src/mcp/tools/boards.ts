import {
  BoardCardDetailSchema,
  boardCardMutationParamsJsonSchema,
  BoardCardMutationResultSchema,
  BoardDetailSchema,
  boardMutationParamsJsonSchema,
  BoardMutationResultSchema,
  createBoardCardParamsJsonSchema,
  CreateBoardCardResultSchema,
  createBoardParamsJsonSchema,
  CreateBoardResultSchema,
  DeleteBoardCardResultSchema,
  getBoardCardParamsJsonSchema,
  getBoardParamsJsonSchema,
  listBoardCardsParamsJsonSchema,
  ListBoardCardsResultSchema,
  listBoardsParamsJsonSchema,
  ListBoardsResultSchema,
  parseBoardCardMutationParams,
  parseBoardMutationParams,
  parseCreateBoardCardParams,
  parseCreateBoardParams,
  parseGetBoardCardParams,
  parseGetBoardParams,
  parseListBoardCardsParams,
  parseListBoardsParams,
  parseUpdateBoardCardParams,
  parseUpdateBoardParams,
  updateBoardCardParamsJsonSchema,
  updateBoardParamsJsonSchema
} from "../../domain/schemas.js"
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
  }
]
