import { describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { expect } from "vitest"

import {
  BoardCardSummarySchema,
  BoardCommonPreferenceResultSchema,
  BoardLabelMutationResultSchema,
  BoardLabelSummarySchema,
  BoardSavedViewDetailSchema,
  createBoardCardParamsJsonSchema,
  CreateBoardCardResultSchema,
  getBoardSavedViewParamsJsonSchema,
  listBoardLabelsParamsJsonSchema,
  parseAddBoardCardLabelParams,
  parseBoardCardLabelParams,
  parseBoardCardMutationParams,
  parseBoardMutationParams,
  parseCreateBoardCardParams,
  parseCreateBoardLabelParams,
  parseDeleteBoardLabelParams,
  parseGetBoardCardParams,
  parseGetBoardParams,
  parseGetBoardSavedViewParams,
  parseListBoardLabelsParams,
  parseListBoardMenuPagesParams,
  parseListBoardSavedViewsParams,
  parseListBoardViewletsParams,
  parseRemoveBoardCardLabelParams,
  parseUpdateBoardCardParams,
  parseUpdateBoardLabelParams,
  parseUpdateBoardParams,
  updateBoardCardParamsJsonSchema,
  updateBoardLabelParamsJsonSchema
} from "../../src/domain/schemas.js"

describe("board schemas", () => {
  const strictParseOptions = { onExcessProperty: "error" } as const

  it.effect("accepts board and board card locator forms", () =>
    Effect.gen(function*() {
      expect((yield* parseGetBoardParams({ board: "Roadmap" })).board).toBe("Roadmap")
      expect((yield* parseBoardMutationParams({ board: "board-id-1" })).board).toBe("board-id-1")
      expect((yield* parseGetBoardCardParams({ board: "Roadmap", card: "card-id-1" })).card).toBe("card-id-1")
      expect((yield* parseGetBoardCardParams({ board: "Roadmap", card: "CARD-123" })).card).toBe("CARD-123")
      expect((yield* parseGetBoardCardParams({ board: "Roadmap", card: "123" })).card).toBe("123")
      expect((yield* parseBoardCardMutationParams({ board: "Roadmap", card: "Planning" })).card).toBe("Planning")
      expect((yield* parseDeleteBoardLabelParams({ label: "Urgent" })).label).toBe("Urgent")
      expect((yield* parseBoardCardLabelParams({ board: "Roadmap", card: "CARD-1" })).card).toBe("CARD-1")
      expect((yield* parseGetBoardSavedViewParams({ savedView: "Mine" })).savedView).toBe("Mine")
    }))

  it.effect("accepts board label and view discovery params", () =>
    Effect.gen(function*() {
      expect((yield* parseListBoardLabelsParams({ titleSearch: "Urg", category: "Other", limit: 5 })).category)
        .toBe("Other")
      expect((yield* parseCreateBoardLabelParams({ title: "Urgent", color: 3 })).title).toBe("Urgent")
      expect((yield* parseUpdateBoardLabelParams({ label: "Urgent", description: null })).description).toBeNull()
      expect((yield* parseAddBoardCardLabelParams({ board: "Roadmap", card: "CARD-1", label: "Urgent" })).label)
        .toBe("Urgent")
      expect((yield* parseRemoveBoardCardLabelParams({ board: "Roadmap", card: "CARD-1", label: "Urgent" })).card)
        .toBe("CARD-1")
      expect((yield* parseListBoardMenuPagesParams({ page: "main" })).page).toBe("main")
      expect((yield* parseListBoardSavedViewsParams({ visibility: "own", nameSearch: "Mine" })).visibility).toBe(
        "own"
      )
      expect((yield* parseListBoardViewletsParams({ viewlet: "table" })).viewlet).toBe("table")
    }))

  it.effect("accepts clearable update fields and member mutation fields", () =>
    Effect.gen(function*() {
      const boardUpdate = yield* parseUpdateBoardParams({
        board: "Roadmap",
        description: null,
        name: "Next Roadmap",
        private: true
      })
      const parsed = yield* parseUpdateBoardCardParams({
        board: "Roadmap",
        card: "CARD-1",
        description: null,
        assignee: null,
        location: null,
        cover: null,
        startDate: null,
        dueDate: null,
        addMembers: ["alice@example.com"],
        removeMembers: ["bob@example.com"]
      })

      expect(boardUpdate.name).toBe("Next Roadmap")
      expect(boardUpdate.description).toBeNull()
      expect(boardUpdate.private).toBe(true)
      expect(parsed.description).toBeNull()
      expect(parsed.assignee).toBeNull()
      expect(parsed.cover).toBeNull()
      expect(parsed.addMembers).toEqual(["alice@example.com"])
      expect(parsed.removeMembers).toEqual(["bob@example.com"])
    }))

  it.effect("rejects empty locators", () =>
    Effect.gen(function*() {
      const emptyBoard = yield* Effect.either(parseGetBoardParams({ board: "" }))
      const emptyCard = yield* Effect.either(parseGetBoardCardParams({ board: "Roadmap", card: "" }))
      const emptyLabel = yield* Effect.either(parseDeleteBoardLabelParams({ label: "" }))
      const emptySavedView = yield* Effect.either(parseGetBoardSavedViewParams({ savedView: "" }))
      const emptyViewlet = yield* Effect.either(parseListBoardViewletsParams({ viewlet: "" }))

      expect(emptyBoard._tag).toBe("Left")
      expect(emptyCard._tag).toBe("Left")
      expect(emptyLabel._tag).toBe("Left")
      expect(emptySavedView._tag).toBe("Left")
      expect(emptyViewlet._tag).toBe("Left")
    }))

  it.effect("rejects invalid cover size and color", () =>
    Effect.gen(function*() {
      const badSize = yield* Effect.either(parseCreateBoardCardParams({
        board: "Roadmap",
        title: "Plan",
        cover: { color: 1, size: "medium" }
      }))
      const badColor = yield* Effect.either(parseCreateBoardCardParams({
        board: "Roadmap",
        title: "Plan",
        cover: { color: 24, size: "small" }
      }))
      const badLabelColor = yield* Effect.either(parseCreateBoardLabelParams({ title: "Urgent", color: 24 }))

      expect(badSize._tag).toBe("Left")
      expect(badColor._tag).toBe("Left")
      expect(badLabelColor._tag).toBe("Left")
    }))

  it.effect("rejects replacing members while adding or removing members", () =>
    Effect.gen(function*() {
      const result = yield* Effect.either(parseUpdateBoardCardParams({
        board: "Roadmap",
        card: "CARD-1",
        members: ["alice@example.com"],
        addMembers: ["bob@example.com"]
      }))
      const removeResult = yield* Effect.either(parseUpdateBoardCardParams({
        board: "Roadmap",
        card: "CARD-1",
        members: ["alice@example.com"],
        removeMembers: ["bob@example.com"]
      }))

      expect(result._tag).toBe("Left")
      expect(removeResult._tag).toBe("Left")
    }))

  it.effect("rejects updates without mutable fields", () =>
    Effect.gen(function*() {
      const boardResult = yield* Effect.either(parseUpdateBoardParams({ board: "Roadmap" }))
      const cardResult = yield* Effect.either(parseUpdateBoardCardParams({ board: "Roadmap", card: "CARD-1" }))
      const labelResult = yield* Effect.either(parseUpdateBoardLabelParams({ label: "Urgent" }))

      expect(boardResult._tag).toBe("Left")
      expect(cardResult._tag).toBe("Left")
      expect(labelResult._tag).toBe("Left")
    }))

  it.effect("exposes useful JSON schema descriptions for LLM single-call use", () =>
    Effect.gen(function*() {
      const createSchemaText = JSON.stringify(createBoardCardParamsJsonSchema)
      const updateSchemaText = JSON.stringify(updateBoardCardParamsJsonSchema)
      const labelsSchemaText = JSON.stringify(listBoardLabelsParamsJsonSchema)
      const updateLabelSchemaText = JSON.stringify(updateBoardLabelParamsJsonSchema)
      const savedViewSchemaText = JSON.stringify(getBoardSavedViewParamsJsonSchema)

      expect(createSchemaText).toContain("CARD-number sequence")
      expect(createSchemaText).toContain("exact email")
      expect(updateSchemaText).toContain("null clears")
      expect(updateSchemaText).toContain("Cannot be combined with addMembers")
      expect(labelsSchemaText).toContain("board-card tags")
      expect(updateLabelSchemaText).toContain("title, color, description, category")
      expect(savedViewSchemaText).toContain("attachedTo = board.app.Board")
    }))

  it.effect("validates board card output identifiers and semantic text fields", () =>
    Effect.gen(function*() {
      const payload = {
        id: "card-id-1",
        identifier: "CARD-123",
        number: 123,
        title: "Planning",
        board: "Roadmap",
        status: "Todo",
        statusId: "status-id-1",
        kind: "Card",
        kindId: "task-type-id-1",
        archived: false
      }

      expect((yield* Schema.decodeUnknown(BoardCardSummarySchema)(payload)).identifier).toBe("CARD-123")

      const malformedIdentifier = yield* Effect.either(
        Schema.decodeUnknown(CreateBoardCardResultSchema)({
          id: "card-id-2",
          identifier: "TASK-123",
          number: 123,
          title: "Planning"
        })
      )
      const emptyTitle = yield* Effect.either(
        Schema.decodeUnknown(BoardCardSummarySchema)({ ...payload, title: "" })
      )
      const emptyBoard = yield* Effect.either(
        Schema.decodeUnknown(BoardCardSummarySchema)({ ...payload, board: "" })
      )

      expect(malformedIdentifier._tag).toBe("Left")
      expect(emptyTitle._tag).toBe("Left")
      expect(emptyBoard._tag).toBe("Left")
    }))

  it.effect("validates saved-view output while preserving SDK-open payloads", () =>
    Effect.gen(function*() {
      const decoded = yield* Schema.decodeUnknown(BoardSavedViewDetailSchema)({
        id: "saved-view-1",
        name: "Mine",
        visibility: "own",
        attachedTo: "board:app:Board",
        location: { path: ["board"] },
        filters: "[{\"key\":\"status\"}]",
        viewOptions: { groupBy: ["status"], orderBy: { key: "modifiedOn", order: "desc" } },
        viewletId: "viewlet-1",
        users: 1,
        createdBy: "person-1"
      })

      expect(decoded.filters).toBe("[{\"key\":\"status\"}]")
      expect(decoded.viewOptions).toEqual({ groupBy: ["status"], orderBy: { key: "modifiedOn", order: "desc" } })
    }))

  it.effect("validates board label output category as a resolved tag category id", () =>
    Effect.gen(function*() {
      const payload = {
        id: "label-1",
        title: "Urgent",
        description: "",
        color: 3,
        category: "board:category:Other"
      }

      expect((yield* Schema.decodeUnknown(BoardLabelSummarySchema)(payload)).category).toBe("board:category:Other")
      expect((yield* Effect.either(Schema.decodeUnknown(BoardLabelSummarySchema)({ ...payload, category: "" })))._tag)
        .toBe("Left")
    }))

  it.effect("rejects impossible board label and common preference result states", () =>
    Effect.gen(function*() {
      const labelWithMultipleFlags = yield* Effect.either(
        Schema.decodeUnknown(BoardLabelMutationResultSchema, strictParseOptions)({
          id: "label-1",
          title: "Urgent",
          created: true,
          updated: true
        })
      )
      const missingPresentPreferenceFields = yield* Effect.either(
        Schema.decodeUnknown(BoardCommonPreferenceResultSchema)({
          present: true,
          attachedTo: "board:app:Board"
        })
      )
      const absentPreferenceWithRaw = yield* Effect.either(
        Schema.decodeUnknown(BoardCommonPreferenceResultSchema, strictParseOptions)({
          present: false,
          attachedTo: "board:app:Board",
          raw: {}
        })
      )

      expect(labelWithMultipleFlags._tag).toBe("Left")
      expect(missingPresentPreferenceFields._tag).toBe("Left")
      expect(absentPreferenceWithRaw._tag).toBe("Left")
    }))
})
