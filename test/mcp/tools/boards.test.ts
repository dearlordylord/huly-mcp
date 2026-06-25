import { describe, it } from "@effect/vitest"
import type { Board as HulyBoard, MenuPage } from "@hcengineering/board"
import type { AccountUuid, Class, Doc, PersonId, Ref } from "@hcengineering/core"
import { toFindResult } from "@hcengineering/core"
import type { IntlString } from "@hcengineering/platform"
import type { ProjectType } from "@hcengineering/task"
import type { AnyComponent } from "@hcengineering/ui"
import type { FilteredView } from "@hcengineering/view"
import { Effect } from "effect"
import { expect } from "vitest"
import { assertAt, assertExists } from "../../../src/utils/assertions.js"

import type { HulyClientOperations } from "../../../src/huly/client.js"
import { board, core, view } from "../../../src/huly/huly-plugins.js"
import { testMarkupUrlConfig } from "../../../src/huly/operations/markup.js"
import { toRef } from "../../../src/huly/operations/sdk-boundary.js"
import type { HulyStorageOperations } from "../../../src/huly/storage.js"
import { testWorkbenchUrlConfig } from "../../../src/huly/url-builders.js"
import { McpErrorCode } from "../../../src/mcp/error-mapping.js"
import { boardTools } from "../../../src/mcp/tools/boards.js"
import { createFilteredRegistry, TOOL_DEFINITIONS } from "../../../src/mcp/tools/index.js"
import { makeToolCategory, makeToolName } from "../../../src/mcp/tools/registry.js"

const toolDefinition = (name: string) => assertExists(TOOL_DEFINITIONS[name], `Expected tool definition for ${name}`)
const boardRegistry = () => createFilteredRegistry(new Set([makeToolCategory("boards")]))

// Huly SDK refs, account UUIDs, intl strings, and component handles are erased string brands at runtime.
const accountUuid = (value: string): AccountUuid => value as AccountUuid
const personId = (value: string): PersonId => value as PersonId
const intl = (value: string): IntlString => value as IntlString
const component = (value: string): AnyComponent => value as AnyComponent

const boardDoc: HulyBoard = {
  _id: toRef<HulyBoard>("board-1"),
  _class: board.class.Board,
  space: core.space.Space,
  modifiedOn: 1,
  modifiedBy: core.account.System,
  name: "Roadmap",
  description: "",
  private: false,
  archived: false,
  members: [accountUuid("00000000-0000-4000-8000-000000000000")],
  owners: [accountUuid("00000000-0000-4000-8000-000000000000")],
  type: toRef<ProjectType>("project-type-board")
}

const menuPageDoc: MenuPage = {
  _id: toRef<MenuPage>("menu-main"),
  _class: board.class.MenuPage,
  space: core.space.Model,
  modifiedOn: 1,
  modifiedBy: core.account.System,
  pageId: board.menuPageId.Main,
  label: intl("board:string:Main"),
  component: component("board:component:Main")
}

const storageClient: HulyStorageOperations = {
  uploadFile: () => Effect.die(new Error("not implemented")),
  getFileUrl: (blobId: string) => `https://test.invalid/files/${blobId}`
}

interface ClientFixture {
  readonly boards?: ReadonlyArray<HulyBoard>
  readonly menuPages?: ReadonlyArray<MenuPage>
  readonly savedViews?: ReadonlyArray<FilteredView>
}

const makeClient = (fixture: ClientFixture): HulyClientOperations => ({
  getAccountUuid: () => accountUuid("00000000-0000-4000-8000-000000000000"),
  getPrimarySocialId: () => personId("test-primary-social-id"),
  markupUrlConfig: testMarkupUrlConfig,
  workbenchUrlConfig: testWorkbenchUrlConfig,
  findAll: <T extends Doc>(_class: Ref<Class<T>>) =>
    Effect.succeed(toFindResult(toTypedDocs<T>(
      String(_class) === String(board.class.Board)
        ? fixture.boards ?? []
        : String(_class) === String(view.class.FilteredView)
        ? fixture.savedViews ?? []
        : []
    ))),
  findAllInModel: <T extends Doc>(_class: Ref<Class<T>>) =>
    Effect.succeed(toFindResult(toTypedDocs<T>(
      String(_class) === String(board.class.MenuPage) ? fixture.menuPages ?? [] : []
    ))),
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

const toTypedDocs = <T extends Doc>(docs: ReadonlyArray<Doc>): Array<T> => {
  // The fake client selects the backing array by Huly class before returning it through the SDK-generic shape.
  return docs as Array<T>
}

describe("board MCP tools", () => {
  it.effect("registers board tools in order", () =>
    Effect.gen(function*() {
      const filtered = boardRegistry()

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
        "delete_board_card",
        "list_board_labels",
        "create_board_label",
        "update_board_label",
        "delete_board_label",
        "list_board_card_labels",
        "add_board_card_label",
        "remove_board_card_label",
        "list_board_menu_pages",
        "list_board_saved_views",
        "get_board_saved_view",
        "list_board_viewlets",
        "get_board_common_preference"
      ])
      expect(toolDefinition("list_boards").category).toBe("boards")
    }))

  it.effect("serializes successful board responses as structured content", () =>
    Effect.gen(function*() {
      const registry = boardRegistry()
      const result = yield* Effect.promise(() =>
        registry.handleToolCall(makeToolName("list_boards"), {}, makeClient({ boards: [boardDoc] }), storageClient)
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

  it.effect("serializes successful board menu page responses as structured content", () =>
    Effect.gen(function*() {
      const registry = boardRegistry()
      const result = yield* Effect.promise(() =>
        registry.handleToolCall(
          makeToolName("list_board_menu_pages"),
          {},
          makeClient({ menuPages: [menuPageDoc] }),
          storageClient
        )
      )

      expect(result?.isError).toBeUndefined()
      expect(result?.structuredContent?.result).toEqual({
        pages: [{
          id: "menu-main",
          pageId: String(board.menuPageId.Main),
          label: "board:string:Main",
          component: "board:component:Main"
        }],
        total: 1
      })
    }))

  it.effect("maps board domain errors to invalid params", () =>
    Effect.gen(function*() {
      const registry = boardRegistry()
      const result = yield* Effect.promise(() =>
        registry.handleToolCall(
          makeToolName("get_board"),
          { board: "Missing" },
          makeClient({ boards: [] }),
          storageClient
        )
      )

      expect(result?.isError).toBe(true)
      expect(result?._meta?.errorCode).toBe(McpErrorCode.InvalidParams)
      expect(assertAt(assertExists(result).content, 0).text).toContain("Board 'Missing' not found")
    }))

  it.effect("maps board saved-view domain errors to invalid params", () =>
    Effect.gen(function*() {
      const registry = boardRegistry()
      const result = yield* Effect.promise(() =>
        registry.handleToolCall(
          makeToolName("get_board_saved_view"),
          { savedView: "Missing" },
          makeClient({}),
          storageClient
        )
      )

      expect(result?.isError).toBe(true)
      expect(result?._meta?.errorCode).toBe(McpErrorCode.InvalidParams)
      expect(assertAt(assertExists(result).content, 0).text).toContain("Board saved view 'Missing' not found")
    }))

  it.effect("rejects invalid board output before returning structured content", () =>
    Effect.gen(function*() {
      const tool = boardTools.find((definition) => definition.name === "list_boards")
      expect(tool).toBeDefined()
      const result = yield* Effect.promise(() =>
        tool?.handler({}, makeClient({ boards: [makeInvalidBoardDoc()] }), storageClient)
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
