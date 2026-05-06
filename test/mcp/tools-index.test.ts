import { describe, it } from "@effect/vitest"
import type { AccountUuid, FindResult, PersonId } from "@hcengineering/core"
import { toFindResult } from "@hcengineering/core"
import { Effect } from "effect"
import { expect } from "vitest"

import { UrlString, WorkspaceUrlSlug } from "../../src/domain/schemas/shared.js"
import type { HulyClientOperations } from "../../src/huly/client.js"
import { testMarkupUrlConfig } from "../../src/huly/operations/markup.js"
import type { HulyStorageOperations } from "../../src/huly/storage.js"
import { CATEGORY_NAMES, createFilteredRegistry, TOOL_DEFINITIONS, toolRegistry } from "../../src/mcp/tools/index.js"

const noopHulyClient: HulyClientOperations = {
  getAccountUuid: () => "test-account-uuid" as AccountUuid,
  getPrimarySocialId: () => "test-primary-social-id" as PersonId,
  documentUrlConfig: {
    baseUrl: UrlString.make("https://test.huly.local"),
    workspaceUrlSlug: WorkspaceUrlSlug.make("test-workspace")
  },
  markupUrlConfig: testMarkupUrlConfig,
  findAll: () => Effect.succeed(toFindResult([])) as Effect.Effect<FindResult<never>>,
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
}

const noopStorageClient: HulyStorageOperations = {
  uploadFile: () => Effect.die(new Error("not implemented")),
  getFileUrl: (blobId: string) => `https://test.huly.io/files?file=${blobId}`
}

describe("CATEGORY_NAMES", () => {
  it.effect("contains expected categories", () =>
    Effect.gen(function*() {
      expect(CATEGORY_NAMES.has("projects")).toBe(true)
      expect(CATEGORY_NAMES.has("issues")).toBe(true)
      expect(CATEGORY_NAMES.has("documents")).toBe(true)
      expect(CATEGORY_NAMES.has("comments")).toBe(true)
      expect(CATEGORY_NAMES.has("task-management")).toBe(true)
      expect(CATEGORY_NAMES.size).toBeGreaterThan(5)
    }))
})

describe("toolRegistry", () => {
  it.effect("has tools", () =>
    Effect.gen(function*() {
      expect(toolRegistry.tools.size).toBeGreaterThan(0)
      expect(toolRegistry.definitions.length).toBeGreaterThan(0)
      expect(toolRegistry.tools.size).toBe(toolRegistry.definitions.length)
    }))

  it.effect("all tool names are unique", () =>
    Effect.gen(function*() {
      const names = toolRegistry.definitions.map((t) => t.name)
      const uniqueNames = new Set(names)
      expect(uniqueNames.size).toBe(names.length)
    }))
})

describe("createFilteredRegistry", () => {
  it.effect("filters to only requested categories", () =>
    Effect.gen(function*() {
      const filtered = createFilteredRegistry(new Set(["issues"]))

      expect(filtered.definitions.length).toBeGreaterThan(0)
      expect(filtered.definitions.length).toBeLessThan(toolRegistry.definitions.length)

      for (const tool of filtered.definitions) {
        expect(tool.category).toBe("issues")
      }
    }))

  it.effect("returns empty registry for unknown category", () =>
    Effect.gen(function*() {
      const filtered = createFilteredRegistry(new Set(["nonexistent_category"]))
      expect(filtered.definitions.length).toBe(0)
      expect(filtered.tools.size).toBe(0)
    }))

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

  it.effect("filters to task-management tools", () =>
    Effect.gen(function*() {
      const filtered = createFilteredRegistry(new Set(["task-management"]))
      const toolNames = filtered.definitions.map((tool) => tool.name)

      expect(toolNames).toEqual([
        "list_project_types",
        "get_project_type",
        "list_task_types",
        "create_task_type",
        "create_issue_status"
      ])
      for (const tool of filtered.definitions) {
        expect(tool.category).toBe("task-management")
      }
    }))
})

describe("handleToolCall", () => {
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
  it.effect("is populated", () =>
    Effect.gen(function*() {
      const keys = Object.keys(TOOL_DEFINITIONS)
      expect(keys.length).toBeGreaterThan(0)
      expect(keys.length).toBe(toolRegistry.tools.size)
      expect(keys).toContain("create_issue_status")
    }))

  it.effect("entries match toolRegistry", () =>
    Effect.gen(function*() {
      for (const [name, tool] of Object.entries(TOOL_DEFINITIONS)) {
        expect(tool.name).toBe(name)
        expect(toolRegistry.tools.has(name)).toBe(true)
      }
    }))
})
