import { describe, it } from "@effect/vitest"
import type { AccountUuid, FindResult, PersonId } from "@hcengineering/core"
import { toFindResult } from "@hcengineering/core"
import { Effect } from "effect"
import { expect } from "vitest"

import type { HulyClientOperations } from "../../../src/huly/client.js"
import { testMarkupUrlConfig } from "../../../src/huly/operations/markup.js"
import type { HulyStorageOperations } from "../../../src/huly/storage.js"
import { testWorkbenchUrlConfig } from "../../../src/huly/url-builders.js"
import { toolRegistry } from "../../../src/mcp/tools/index.js"

const emptyFindAll: HulyClientOperations["findAll"] =
  (() => Effect.succeed(toFindResult([])) as Effect.Effect<FindResult<never>>) as HulyClientOperations["findAll"]

const emptyFindOne: HulyClientOperations["findOne"] =
  (() => Effect.succeed(undefined)) as HulyClientOperations["findOne"]

const hulyClient: HulyClientOperations = {
  getAccountUuid: () => "00000000-0000-4000-8000-000000000000" as AccountUuid,
  getPrimarySocialId: () => "test-primary-social-id" as PersonId,
  markupUrlConfig: testMarkupUrlConfig,
  workbenchUrlConfig: testWorkbenchUrlConfig,
  findAll: emptyFindAll,
  findAllInModel: emptyFindAll,
  findOne: emptyFindOne,
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
}

const storageClient: HulyStorageOperations = {
  uploadFile: () => Effect.die(new Error("not implemented")),
  getFileUrl: (blobId: string) => `https://test.huly.io/files?file=${blobId}`
}

describe("inventory MCP tools", () => {
  it.effect("registers inventory tools in the inventory category", () =>
    Effect.gen(function*() {
      const names = new Set(
        toolRegistry.definitions.filter((tool) => tool.category === "inventory").map((tool) => tool.name)
      )

      expect(names).toEqual(
        new Set([
          "list_inventory_categories",
          "get_inventory_category",
          "create_inventory_category",
          "update_inventory_category",
          "delete_inventory_category",
          "list_inventory_products",
          "get_inventory_product",
          "create_inventory_product",
          "update_inventory_product",
          "delete_inventory_product",
          "list_inventory_variants",
          "get_inventory_variant",
          "create_inventory_variant",
          "update_inventory_variant",
          "delete_inventory_variant"
        ])
      )
    }))

  it.effect("returns encoded structured inventory list responses", () =>
    Effect.gen(function*() {
      const result = yield* Effect.promise(() =>
        toolRegistry.handleToolCall("list_inventory_categories", {}, hulyClient, storageClient)
      )

      expect(result?.isError).toBeUndefined()
      expect(result?.content[0]?.text).toBe("{\"categories\":[],\"total\":0}")
    }))

  it.effect("maps inventory not-found errors to invalid params", () =>
    Effect.gen(function*() {
      const result = yield* Effect.promise(() =>
        toolRegistry.handleToolCall(
          "get_inventory_category",
          { category: "Missing" },
          hulyClient,
          storageClient
        )
      )

      expect(result?.isError).toBe(true)
      expect(result?.content[0]?.text).toContain("Inventory category 'Missing' not found")
    }))
})
