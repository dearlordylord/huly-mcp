import { describe, it } from "@effect/vitest"
import type { FindResult } from "@hcengineering/core"
import { toFindResult } from "@hcengineering/core"
import { Effect } from "effect"
import { expect } from "vitest"

import type { HulyClientOperations } from "../../src/huly/client.js"
import type { HulyStorageOperations } from "../../src/huly/storage.js"
import { CATEGORY_NAMES, createFilteredRegistry, TOOL_DEFINITIONS, toolRegistry } from "../../src/mcp/tools/index.js"

const noopHulyClient: HulyClientOperations = {
  findAll: () => Effect.succeed(toFindResult([])) as Effect.Effect<FindResult<never>>,
  findOne: () => Effect.succeed(undefined),
  createDoc: () => Effect.die(new Error("not implemented")),
  updateDoc: () => Effect.die(new Error("not implemented")),
  addCollection: () => Effect.die(new Error("not implemented")),
  removeDoc: () => Effect.die(new Error("not implemented")),
  uploadMarkup: () => Effect.die(new Error("not implemented")),
  fetchMarkup: () => Effect.succeed(""),
  updateMarkup: () => Effect.die(new Error("not implemented"))
}

const noopStorageClient: HulyStorageOperations = {
  uploadFile: () => Effect.die(new Error("not implemented")),
  getFileUrl: (blobId: string) => `https://test.huly.io/files?file=${blobId}`
}

describe("CATEGORY_NAMES", () => {
  // test-revizorro: approved
  it.effect("contains expected categories", () =>
    Effect.gen(function*() {
      expect(CATEGORY_NAMES.has("projects")).toBe(true)
      expect(CATEGORY_NAMES.has("issues")).toBe(true)
      expect(CATEGORY_NAMES.has("documents")).toBe(true)
      expect(CATEGORY_NAMES.has("comments")).toBe(true)
      expect(CATEGORY_NAMES.size).toBeGreaterThan(5)
    }))
})

describe("toolRegistry", () => {
  // test-revizorro: approved
  it.effect("has tools", () =>
    Effect.gen(function*() {
      expect(toolRegistry.tools.size).toBeGreaterThan(0)
      expect(toolRegistry.definitions.length).toBeGreaterThan(0)
      expect(toolRegistry.tools.size).toBe(toolRegistry.definitions.length)
    }))

  // test-revizorro: approved
  it.effect("all tool names are unique", () =>
    Effect.gen(function*() {
      const names = toolRegistry.definitions.map((t) => t.name)
      const uniqueNames = new Set(names)
      expect(uniqueNames.size).toBe(names.length)
    }))
})

describe("createFilteredRegistry", () => {
  // test-revizorro: approved
  it.effect("filters to only requested categories", () =>
    Effect.gen(function*() {
      const filtered = createFilteredRegistry(new Set(["issues"]))

      expect(filtered.definitions.length).toBeGreaterThan(0)
      expect(filtered.definitions.length).toBeLessThan(toolRegistry.definitions.length)

      for (const tool of filtered.definitions) {
        expect(tool.category).toBe("issues")
      }
    }))

  // test-revizorro: approved
  it.effect("returns empty registry for unknown category", () =>
    Effect.gen(function*() {
      const filtered = createFilteredRegistry(new Set(["nonexistent_category"]))
      expect(filtered.definitions.length).toBe(0)
      expect(filtered.tools.size).toBe(0)
    }))

  // test-revizorro: approved
  it.effect("combines multiple categories", () =>
    Effect.gen(function*() {
      const filtered = createFilteredRegistry(new Set(["issues", "projects"]))

      const categories = new Set(filtered.definitions.map((t) => t.category))
      expect(categories.size).toBeLessThanOrEqual(2)
      for (const cat of categories) {
        expect(["issues", "projects"]).toContain(cat)
      }
      expect(filtered.definitions.length).toBeGreaterThan(0)
    }))
})

describe("handleToolCall", () => {
  // test-revizorro: approved
  it.effect("returns null for unknown tool", () =>
    Effect.gen(function*() {
      const result = yield* Effect.promise(() =>
        toolRegistry.handleToolCall(
          "totally_nonexistent_tool_xyz",
          {},
          noopHulyClient,
          noopStorageClient
        )
      )

      expect(result).toBeNull()
    }))
})

describe("TOOL_DEFINITIONS", () => {
  // test-revizorro: approved
  it.effect("is populated", () =>
    Effect.gen(function*() {
      const keys = Object.keys(TOOL_DEFINITIONS)
      expect(keys.length).toBeGreaterThan(0)
      expect(keys.length).toBe(toolRegistry.tools.size)
    }))

  // test-revizorro: approved
  it.effect("entries match toolRegistry", () =>
    Effect.gen(function*() {
      for (const [name, tool] of Object.entries(TOOL_DEFINITIONS)) {
        expect(tool.name).toBe(name)
        expect(toolRegistry.tools.has(name)).toBe(true)
      }
    }))
})
