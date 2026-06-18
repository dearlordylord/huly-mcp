import { describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { expect } from "vitest"

import {
  BoardCardSummarySchema,
  createBoardCardParamsJsonSchema,
  CreateBoardCardResultSchema,
  parseBoardCardMutationParams,
  parseBoardMutationParams,
  parseCreateBoardCardParams,
  parseGetBoardCardParams,
  parseGetBoardParams,
  parseUpdateBoardCardParams,
  parseUpdateBoardParams,
  updateBoardCardParamsJsonSchema
} from "../../src/domain/schemas.js"

describe("board schemas", () => {
  it.effect("accepts board and board card locator forms", () =>
    Effect.gen(function*() {
      expect((yield* parseGetBoardParams({ board: "Roadmap" })).board).toBe("Roadmap")
      expect((yield* parseBoardMutationParams({ board: "board-id-1" })).board).toBe("board-id-1")
      expect((yield* parseGetBoardCardParams({ board: "Roadmap", card: "card-id-1" })).card).toBe("card-id-1")
      expect((yield* parseGetBoardCardParams({ board: "Roadmap", card: "CARD-123" })).card).toBe("CARD-123")
      expect((yield* parseGetBoardCardParams({ board: "Roadmap", card: "123" })).card).toBe("123")
      expect((yield* parseBoardCardMutationParams({ board: "Roadmap", card: "Planning" })).card).toBe("Planning")
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

      expect(emptyBoard._tag).toBe("Left")
      expect(emptyCard._tag).toBe("Left")
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

      expect(badSize._tag).toBe("Left")
      expect(badColor._tag).toBe("Left")
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

      expect(boardResult._tag).toBe("Left")
      expect(cardResult._tag).toBe("Left")
    }))

  it.effect("exposes useful JSON schema descriptions for LLM single-call use", () =>
    Effect.gen(function*() {
      const createSchemaText = JSON.stringify(createBoardCardParamsJsonSchema)
      const updateSchemaText = JSON.stringify(updateBoardCardParamsJsonSchema)

      expect(createSchemaText).toContain("CARD-number sequence")
      expect(createSchemaText).toContain("exact email")
      expect(updateSchemaText).toContain("null clears")
      expect(updateSchemaText).toContain("Cannot be combined with addMembers")
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
})
