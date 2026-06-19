import { describe, it } from "@effect/vitest"
import type { Board as HulyBoard } from "@hcengineering/board"
import type { AccountUuid, Class, Doc, FindResult, PersonId, Ref } from "@hcengineering/core"
import { toFindResult } from "@hcengineering/core"
import { Effect } from "effect"
import { expect } from "vitest"
import { assertAt, assertExists } from "../../../src/utils/assertions.js"

import type { HulyClientOperations } from "../../../src/huly/client.js"
import { board, core } from "../../../src/huly/huly-plugins.js"
import { testMarkupUrlConfig } from "../../../src/huly/operations/markup.js"
import type { HulyStorageOperations } from "../../../src/huly/storage.js"
import { testWorkbenchUrlConfig } from "../../../src/huly/url-builders.js"
import { McpErrorCode } from "../../../src/mcp/error-mapping.js"
import { boardTools } from "../../../src/mcp/tools/boards.js"
import { createFilteredRegistry, TOOL_DEFINITIONS } from "../../../src/mcp/tools/index.js"

const toolDefinition = (name: string) => assertExists(TOOL_DEFINITIONS[name], `Expected tool definition for ${name}`)

const boardDoc: HulyBoard = {
  _id: "board-1" as Ref<HulyBoard>,
  _class: board.class.Board,
  space: core.space.Space,
  modifiedOn: 1,
  modifiedBy: core.account.System,
  name: "Roadmap",
  description: "",
  private: false,
  archived: false,
  members: ["00000000-0000-4000-8000-000000000000" as AccountUuid],
  owners: ["00000000-0000-4000-8000-000000000000" as AccountUuid],
  type: "project-type-board" as never
}

const storageClient: HulyStorageOperations = {
  uploadFile: () => Effect.die(new Error("not implemented")),
  getFileUrl: (blobId: string) => `https://test.invalid/files/${blobId}`
}

const makeClient = (boards: ReadonlyArray<HulyBoard>): HulyClientOperations => ({
  getAccountUuid: () => "00000000-0000-4000-8000-000000000000" as AccountUuid,
  getPrimarySocialId: () => "test-primary-social-id" as PersonId,
  markupUrlConfig: testMarkupUrlConfig,
  workbenchUrlConfig: testWorkbenchUrlConfig,
  findAll: <T extends Doc>(_class: Ref<Class<T>>) =>
    // eslint-disable-next-line no-restricted-syntax -- SDK-shaped fake narrows generic T by runtime class id
    Effect.succeed(toFindResult((String(_class) === String(board.class.Board) ? boards : []) as unknown as Array<T>)),
  findAllInModel: () => Effect.succeed(toFindResult([])) as Effect.Effect<FindResult<never>>,
  findOne: () => Effect.succeed(undefined),
  createDoc: () => Effect.die(new Error("not implemented")),
  updateDoc: () => Effect.die(new Error("not implemented")),
  addCollection: () => Effect.die(new Error("not implemented")),
  removeDoc: () => Effect.die(new Error("not implemented")),
  uploadMarkup: () => Effect.die(new Error("not implemented")),
  fetchMarkup: () => Effect.succeed(""),
  updateMarkup: () => Effect.die(new Error("not implemented")),
  updateMixin: () => Effect.die(new Error("not implemented")),
  createMixin: () => Effect.die(new Error("not implemented")),
  searchFulltext: () => Effect.die(new Error("not implemented"))
})

describe("board MCP tools", () => {
  it.effect("registers board tools in order", () =>
    Effect.gen(function*() {
      const filtered = createFilteredRegistry(new Set(["boards"]))

      expect(filtered.definitions.map((tool) => tool.name)).toEqual([
        "list_boards",
        "get_board",
        "create_board",
        "update_board",
        "archive_board",
        "unarchive_board",
        "list_board_cards",
        "get_board_card",
        "create_board_card",
        "update_board_card",
        "archive_board_card",
        "unarchive_board_card",
        "delete_board_card"
      ])
      expect(toolDefinition("list_boards").category).toBe("boards")
    }))

  it.effect("serializes successful board responses as structured content", () =>
    Effect.gen(function*() {
      const registry = createFilteredRegistry(new Set(["boards"]))
      const result = yield* Effect.promise(() =>
        registry.handleToolCall("list_boards", {}, makeClient([boardDoc]), storageClient)
      )

      expect(result?.isError).toBeUndefined()
      expect(result?.structuredContent?.result).toEqual({
        boards: [{
          id: "board-1",
          name: "Roadmap",
          archived: false,
          private: false
        }],
        total: 1
      })
    }))

  it.effect("maps board domain errors to invalid params", () =>
    Effect.gen(function*() {
      const registry = createFilteredRegistry(new Set(["boards"]))
      const result = yield* Effect.promise(() =>
        registry.handleToolCall("get_board", { board: "Missing" }, makeClient([]), storageClient)
      )

      expect(result?.isError).toBe(true)
      expect(result?._meta?.errorCode).toBe(McpErrorCode.InvalidParams)
      expect(assertAt(assertExists(result).content, 0).text).toContain("Board 'Missing' not found")
    }))

  it.effect("rejects invalid board output before returning structured content", () =>
    Effect.gen(function*() {
      const tool = boardTools.find((definition) => definition.name === "list_boards")
      expect(tool).toBeDefined()
      const result = yield* Effect.promise(() =>
        tool?.handler({}, makeClient([makeInvalidBoardDoc()]), storageClient)
          ?? Promise.resolve(undefined)
      )

      expect(result?.isError).toBe(true)
      expect(result?._meta?.errorCode).toBe(McpErrorCode.InternalError)
      expect(assertAt(assertExists(result).content, 0).text).toContain("invalid output")
    }))
})

const makeInvalidBoardDoc = (): HulyBoard => ({
  ...boardDoc,
  // eslint-disable-next-line no-restricted-syntax -- intentionally malformed SDK-shaped fake exercises output encoding
  archived: "not-a-boolean" as unknown as boolean
})
