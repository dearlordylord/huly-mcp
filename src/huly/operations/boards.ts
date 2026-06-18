import type { Board as HulyBoard, Card as HulyBoardCard } from "@hcengineering/board"
import type { Person } from "@hcengineering/contact"
import {
  type AttachedData,
  type Data,
  type DocumentUpdate,
  generateId,
  type Ref,
  SortingOrder
} from "@hcengineering/core"
import { makeRank } from "@hcengineering/rank"
import { Effect } from "effect"

import type {
  BoardCardDetail,
  BoardCardMutationParams,
  BoardCardMutationResult,
  BoardDetail,
  BoardMutationParams,
  BoardMutationResult,
  BoardSummary,
  CreateBoardCardParams,
  CreateBoardCardResult,
  CreateBoardParams,
  CreateBoardResult,
  DeleteBoardCardResult,
  GetBoardCardParams,
  GetBoardParams,
  ListBoardCardsParams,
  ListBoardCardsResult,
  ListBoardsParams,
  ListBoardsResult,
  UpdateBoardCardParams,
  UpdateBoardParams
} from "../../domain/schemas.js"
import { BoardCardId, BoardCardSequenceIdentifier, BoardId, BoardName, Count } from "../../domain/schemas.js"
import { HulyClient, type HulyClientError } from "../client.js"
import type { Diagnostics } from "../diagnostics.js"
import {
  BoardArchivedCardDeleteError,
  BoardIdentifierAmbiguousError,
  BoardMutationUnsupportedError
} from "../errors.js"
import { board, core } from "../huly-plugins.js"
import {
  cardDetailWithMetadata,
  cardSummaryWithMetadata,
  loadBoardCardMetadata,
  resolveBoardCard
} from "./boards-card-read.js"
import { buildCardUpdate } from "./boards-card-update.js"
import { descriptionFromMarkdown, toBoardDetail } from "./boards-output.js"
import {
  boardCardActiveQuery,
  type BoardCardReadError,
  type BoardCardWriteError,
  type BoardModelError,
  type BoardReadError,
  boardSpace,
  type BoardWriteError,
  cardIdentifierFromNumber,
  getBoardProjectType,
  incrementBoardCardSequence,
  requireRemoveCollection,
  resolveBoardFromContext,
  resolveBoardProjectType,
  resolveBoardStatus,
  resolveBoardTaskType,
  resolveEmployeeRef,
  resolveEmployeeRefs
} from "./boards-shared.js"
import { listTotal } from "./counts.js"
import { clampLimit, escapeLikeWildcards, hulyQuery, type StrictDocumentQuery } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"
import { requireUpdateFields } from "./update-guards.js"

type BoardCreateError = HulyClientError | BoardIdentifierAmbiguousError | BoardModelError

const boardSummary = (resolvedBoard: HulyBoard): BoardSummary => ({
  id: BoardId.make(resolvedBoard._id),
  name: BoardName.make(resolvedBoard.name),
  description: resolvedBoard.description || undefined,
  archived: resolvedBoard.archived,
  private: resolvedBoard.private
})

export const listBoards = (
  params: ListBoardsParams
): Effect.Effect<ListBoardsResult, HulyClientError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const query: StrictDocumentQuery<HulyBoard> = params.includeArchived === true ? {} : { archived: false }
    const boards = yield* client.findAll<HulyBoard>(
      board.class.Board,
      hulyQuery(query),
      { limit: clampLimit(params.limit), sort: { name: SortingOrder.Ascending } }
    )
    return { boards: boards.map(boardSummary), total: listTotal(boards.total) }
  })

export const getBoard = (
  params: GetBoardParams
): Effect.Effect<BoardDetail, BoardReadError, HulyClient> =>
  Effect.gen(function*() {
    const { board: resolvedBoard, client } = yield* resolveBoardFromContext(params.board, { includeArchived: true })
    const cards = yield* client.findAll<HulyBoardCard>(
      board.class.Card,
      hulyQuery<HulyBoardCard>({ space: boardSpace(resolvedBoard._id) }),
      { limit: 1, total: true }
    )
    const projectType = yield* getBoardProjectType(client, resolvedBoard)
    return toBoardDetail(resolvedBoard, projectType, Count.make(Math.max(0, listTotal(cards.total))))
  })

export const createBoard = (
  params: CreateBoardParams
): Effect.Effect<CreateBoardResult, BoardCreateError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const existing = yield* client.findAll<HulyBoard>(
      board.class.Board,
      hulyQuery<HulyBoard>({ name: params.name, archived: false })
    )
    if (existing.length === 1) {
      return { id: BoardId.make(existing[0]._id), name: BoardName.make(existing[0].name), created: false }
    }
    if (existing.length > 1) {
      return yield* new BoardIdentifierAmbiguousError({ identifier: params.name, matches: existing.length })
    }

    const projectType = yield* resolveBoardProjectType(client, params.projectType)
    const boardId: Ref<HulyBoard> = generateId()
    const account = client.getAccountUuid()
    const data: Data<HulyBoard> = {
      name: params.name,
      description: params.description ?? "",
      private: params.private ?? false,
      archived: false,
      members: [account],
      owners: [account],
      type: projectType._id
    }
    yield* client.createDoc(board.class.Board, core.space.Space, data, boardId)
    return { id: BoardId.make(boardId), name: params.name, created: true }
  })

export const updateBoard = (
  params: UpdateBoardParams
): Effect.Effect<BoardMutationResult, BoardWriteError, HulyClient> =>
  Effect.gen(function*() {
    yield* requireUpdateFields("update_board", params, ["name", "description", "private"])
    const { board: resolvedBoard, client } = yield* resolveBoardFromContext(params.board, { includeArchived: true })
    const update: DocumentUpdate<HulyBoard> = {
      ...(params.name === undefined ? {} : { name: params.name }),
      ...(params.description === undefined ? {} : { description: params.description ?? "" }),
      ...(params.private === undefined ? {} : { private: params.private })
    }
    yield* client.updateDoc(board.class.Board, core.space.Space, resolvedBoard._id, update)
    return { id: BoardId.make(resolvedBoard._id), updated: true }
  })

export const archiveBoard = (
  params: BoardMutationParams
): Effect.Effect<BoardMutationResult, BoardReadError, HulyClient> => setBoardArchived(params, true)

export const unarchiveBoard = (
  params: BoardMutationParams
): Effect.Effect<BoardMutationResult, BoardReadError, HulyClient> => setBoardArchived(params, false)

const setBoardArchived = (
  params: BoardMutationParams,
  archived: boolean
): Effect.Effect<BoardMutationResult, BoardReadError, HulyClient> =>
  Effect.gen(function*() {
    const { board: resolvedBoard, client } = yield* resolveBoardFromContext(params.board, { includeArchived: true })
    yield* client.updateDoc(board.class.Board, core.space.Space, resolvedBoard._id, { archived })
    return { id: BoardId.make(resolvedBoard._id), updated: true }
  })

export const listBoardCards = (
  params: ListBoardCardsParams
): Effect.Effect<ListBoardCardsResult, BoardReadError, HulyClient | Diagnostics> =>
  Effect.gen(function*() {
    const { board: resolvedBoard, client } = yield* resolveBoardFromContext(params.board, { includeArchived: true })
    const query: StrictDocumentQuery<HulyBoardCard> = {
      ...boardCardActiveQuery(resolvedBoard, params.includeArchived === true),
      ...(params.titleSearch === undefined || params.titleSearch.trim() === ""
        ? {}
        : { title: { $like: `%${escapeLikeWildcards(params.titleSearch)}%` } })
    }
    const cards = yield* client.findAll<HulyBoardCard>(
      board.class.Card,
      hulyQuery(query),
      { limit: clampLimit(params.limit), sort: { modifiedOn: SortingOrder.Descending } }
    )
    const metadata = yield* loadBoardCardMetadata(client, resolvedBoard, cards)
    return {
      cards: cards.map((card) => cardSummaryWithMetadata(resolvedBoard, metadata, card)),
      total: listTotal(cards.total)
    }
  })

export const getBoardCard = (
  params: GetBoardCardParams
): Effect.Effect<BoardCardDetail, BoardCardReadError, HulyClient | Diagnostics> =>
  Effect.gen(function*() {
    const { board: resolvedBoard, client } = yield* resolveBoardFromContext(params.board, { includeArchived: true })
    const card = yield* resolveBoardCard(client, resolvedBoard, params.card)
    const metadata = yield* loadBoardCardMetadata(client, resolvedBoard, [card])
    return cardDetailWithMetadata(client, resolvedBoard, metadata, card)
  })

export const createBoardCard = (
  params: CreateBoardCardParams
): Effect.Effect<CreateBoardCardResult, BoardCardWriteError, HulyClient | Diagnostics> =>
  Effect.gen(function*() {
    const { board: resolvedBoard, client } = yield* resolveBoardFromContext(params.board, { includeArchived: true })
    const projectType = yield* getBoardProjectType(client, resolvedBoard)
    const kind = yield* resolveBoardTaskType(client, resolvedBoard, projectType, params.kind)
    const status = yield* resolveBoardStatus(client, resolvedBoard, projectType, kind, params.status)
    const assignee = params.assignee === undefined
      ? null
      : toRef<Person>(yield* resolveEmployeeRef(client, params.assignee))
    const members = params.members === undefined ? [] : yield* resolveEmployeeRefs(client, params.members)
    const number = yield* incrementBoardCardSequence(client)
    const cardId: Ref<HulyBoardCard> = generateId()
    const lastCard = yield* client.findOne<HulyBoardCard>(
      board.class.Card,
      hulyQuery<HulyBoardCard>({ space: boardSpace(resolvedBoard._id) }),
      { sort: { rank: SortingOrder.Descending } }
    )
    const data: AttachedData<HulyBoardCard> = {
      title: params.title,
      description: descriptionFromMarkdown(params.description, client.markupUrlConfig),
      status: status.id,
      kind: kind._id,
      number,
      identifier: cardIdentifierFromNumber(number),
      assignee,
      dueDate: params.dueDate ?? null,
      rank: makeRank(lastCard?.rank, undefined),
      isArchived: false,
      members: [...members],
      startDate: params.startDate ?? null,
      ...(params.location === undefined ? {} : { location: params.location }),
      ...(params.cover === undefined ? {} : { cover: params.cover })
    }
    yield* client.addCollection(
      board.class.Card,
      boardSpace(resolvedBoard._id),
      resolvedBoard._id,
      board.class.Board,
      "cards",
      data,
      cardId
    )
    return {
      id: BoardCardId.make(cardId),
      identifier: BoardCardSequenceIdentifier.make(data.identifier),
      number,
      title: params.title
    }
  })

export const updateBoardCard = (
  params: UpdateBoardCardParams
): Effect.Effect<BoardCardMutationResult, BoardCardWriteError, HulyClient | Diagnostics> =>
  Effect.gen(function*() {
    yield* requireUpdateFields("update_board_card", params, [
      "title",
      "description",
      "status",
      "assignee",
      "members",
      "addMembers",
      "removeMembers",
      "location",
      "cover",
      "startDate",
      "dueDate"
    ])
    const { board: resolvedBoard, client } = yield* resolveBoardFromContext(params.board, { includeArchived: true })
    const card = yield* resolveBoardCard(client, resolvedBoard, params.card)
    const update = yield* buildCardUpdate(client, resolvedBoard, card, params)
    yield* client.updateDoc(board.class.Card, boardSpace(resolvedBoard._id), card._id, update)
    return { id: BoardCardId.make(card._id), updated: true }
  })

export const archiveBoardCard = (
  params: BoardCardMutationParams
): Effect.Effect<BoardCardMutationResult, BoardCardReadError, HulyClient> => setBoardCardArchived(params, true)

export const unarchiveBoardCard = (
  params: BoardCardMutationParams
): Effect.Effect<BoardCardMutationResult, BoardCardReadError, HulyClient> => setBoardCardArchived(params, false)

const setBoardCardArchived = (
  params: BoardCardMutationParams,
  isArchived: boolean
): Effect.Effect<BoardCardMutationResult, BoardCardReadError, HulyClient> =>
  Effect.gen(function*() {
    const { board: resolvedBoard, client } = yield* resolveBoardFromContext(params.board, { includeArchived: true })
    const card = yield* resolveBoardCard(client, resolvedBoard, params.card)
    yield* client.updateDoc(board.class.Card, boardSpace(resolvedBoard._id), card._id, { isArchived })
    return { id: BoardCardId.make(card._id), updated: true }
  })

export const deleteBoardCard = (
  params: BoardCardMutationParams
): Effect.Effect<DeleteBoardCardResult, BoardCardWriteError, HulyClient> =>
  Effect.gen(function*() {
    const { board: resolvedBoard, client } = yield* resolveBoardFromContext(params.board, { includeArchived: true })
    const card = yield* resolveBoardCard(client, resolvedBoard, params.card)
    if (card.isArchived !== true) {
      return yield* new BoardArchivedCardDeleteError({ identifier: params.card, board: resolvedBoard.name })
    }
    const removeCollection = requireRemoveCollection(client)
    if (removeCollection instanceof BoardMutationUnsupportedError) return yield* removeCollection
    yield* removeCollection(
      board.class.Card,
      boardSpace(resolvedBoard._id),
      card._id,
      resolvedBoard._id,
      board.class.Board,
      "cards"
    )
    return { id: BoardCardId.make(card._id), deleted: true }
  })
