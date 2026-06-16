import { describe, it } from "@effect/vitest"
import type { AccountUuid, FindResult, PersonId } from "@hcengineering/core"
import { toFindResult } from "@hcengineering/core"
import { Effect } from "effect"
import { expect } from "vitest"

import type { HulyClientOperations } from "../../src/huly/client.js"
import { testMarkupUrlConfig } from "../../src/huly/operations/markup.js"
import type { HulyStorageOperations } from "../../src/huly/storage.js"
import { testWorkbenchUrlConfig } from "../../src/huly/url-builders.js"
import { CATEGORY_NAMES, createFilteredRegistry, TOOL_DEFINITIONS, toolRegistry } from "../../src/mcp/tools/index.js"

const noopHulyClient: HulyClientOperations = {
  getAccountUuid: () => "00000000-0000-4000-8000-000000000000" as AccountUuid,
  getPrimarySocialId: () => "test-primary-social-id" as PersonId,
  markupUrlConfig: testMarkupUrlConfig,
  workbenchUrlConfig: testWorkbenchUrlConfig,
  findAll: () => Effect.succeed(toFindResult([])) as Effect.Effect<FindResult<never>>,
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
      expect(CATEGORY_NAMES.has("associations")).toBe(true)
      expect(CATEGORY_NAMES.has("sdk-discovery")).toBe(true)
      expect(CATEGORY_NAMES.has("user-statuses")).toBe(true)
      expect(CATEGORY_NAMES.has("inventory")).toBe(true)
      expect(CATEGORY_NAMES.has("recruiting")).toBe(true)
      expect(CATEGORY_NAMES.size).toBeGreaterThan(5)
    }))

  it.effect("registers calendar schedule and virtual-office tools", () =>
    Effect.gen(function*() {
      const names = new Set(toolRegistry.definitions.map((tool) => tool.name))

      expect(names.has("list_schedules")).toBe(true)
      expect(names.has("get_schedule")).toBe(true)
      expect(names.has("create_schedule")).toBe(true)
      expect(names.has("update_schedule")).toBe(true)
      expect(names.has("delete_schedule")).toBe(true)
      expect(names.has("list_office_floors")).toBe(true)
      expect(names.has("get_office_floor")).toBe(true)
      expect(names.has("list_office_rooms")).toBe(true)
      expect(names.has("get_office_room")).toBe(true)
      expect(names.has("list_offices")).toBe(true)
      expect(names.has("get_office")).toBe(true)
      expect(names.has("list_active_room_info")).toBe(true)
      expect(names.has("list_active_room_participants")).toBe(true)
      expect(names.has("list_meeting_minutes")).toBe(true)
      expect(names.has("get_meeting_minutes")).toBe(true)
      expect(names.has("list_device_preferences")).toBe(true)
      expect(names.has("list_office_defaults")).toBe(true)
    }))

  it.effect("registers issue #102 closeout tools in their owning categories", () =>
    Effect.gen(function*() {
      expect(TOOL_DEFINITIONS.list_document_snapshots.category).toBe("documents")
      expect(TOOL_DEFINITIONS.get_document_snapshot.category).toBe("documents")
      expect(TOOL_DEFINITIONS.list_project_target_preferences.category).toBe("projects")
      expect(TOOL_DEFINITIONS.upsert_project_target_preference.category).toBe("projects")
      expect(TOOL_DEFINITIONS.list_related_issue_targets.category).toBe("issues")
      expect(TOOL_DEFINITIONS.set_related_issue_target.category).toBe("issues")
      expect(TOOL_DEFINITIONS.delete_related_issue_space_target.category).toBe("issues")
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

  it.effect("filters to association tools", () =>
    Effect.gen(function*() {
      const filtered = createFilteredRegistry(new Set(["associations"]))
      const toolNames = filtered.definitions.map((tool) => tool.name)

      expect(toolNames).toEqual([
        "list_associations",
        "create_association",
        "delete_association",
        "list_relations",
        "create_relation",
        "delete_relation"
      ])
      for (const tool of filtered.definitions) {
        expect(tool.category).toBe("associations")
      }
    }))

  it.effect("filters to user status tools", () =>
    Effect.gen(function*() {
      const filtered = createFilteredRegistry(new Set(["user-statuses"]))
      const toolNames = filtered.definitions.map((tool) => tool.name)

      expect(toolNames).toEqual(["list_user_statuses"])
      for (const tool of filtered.definitions) {
        expect(tool.category).toBe("user-statuses")
      }
    }))

  it.effect("filters to recruiting tools", () =>
    Effect.gen(function*() {
      const filtered = createFilteredRegistry(new Set(["recruiting"]))
      const toolNames = filtered.definitions.map((tool) => tool.name)

      expect(toolNames).toEqual([
        "list_recruiting_vacancy_types",
        "list_recruiting_vacancy_statuses",
        "list_recruiting_vacancies",
        "get_recruiting_vacancy",
        "create_recruiting_vacancy",
        "update_recruiting_vacancy",
        "archive_recruiting_vacancy",
        "unarchive_recruiting_vacancy",
        "list_recruiting_candidates",
        "get_recruiting_candidate",
        "set_recruiting_candidate_profile",
        "list_recruiting_skills",
        "list_recruiting_candidate_skills",
        "add_recruiting_candidate_skill",
        "remove_recruiting_candidate_skill",
        "list_recruiting_applicants",
        "get_recruiting_applicant",
        "create_recruiting_applicant",
        "update_recruiting_applicant",
        "delete_recruiting_applicant",
        "list_recruiting_applicant_matches",
        "get_recruiting_applicant_match",
        "list_recruiting_reviews",
        "get_recruiting_review",
        "create_recruiting_review",
        "update_recruiting_review",
        "delete_recruiting_review",
        "list_recruiting_opinions",
        "get_recruiting_opinion",
        "create_recruiting_opinion",
        "update_recruiting_opinion",
        "delete_recruiting_opinion"
      ])
      for (const tool of filtered.definitions) {
        expect(tool.category).toBe("recruiting")
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

  it.effect("accepts omitted arguments for all-optional parameter tools", () =>
    Effect.gen(function*() {
      const result = yield* Effect.promise(() =>
        toolRegistry.handleToolCall(
          "list_projects",
          undefined,
          noopHulyClient,
          noopStorageClient
        )
      )

      expect(result?.isError).toBeUndefined()
      expect(result?.content[0]?.text).toBe("{\"projects\":[],\"total\":0}")
    }))

  it.effect("accepts omitted arguments for true no-argument tools", () =>
    Effect.gen(function*() {
      const result = yield* Effect.promise(() =>
        toolRegistry.handleToolCall(
          "get_unread_notification_count",
          undefined,
          noopHulyClient,
          noopStorageClient
        )
      )

      expect(result?.isError).toBeUndefined()
      expect(result?.content[0]?.text).toContain("\"count\"")
    }))

  it.effect("rejects omitted arguments for required-parameter tools", () =>
    Effect.gen(function*() {
      const result = yield* Effect.promise(() =>
        toolRegistry.handleToolCall(
          "get_issue",
          undefined,
          noopHulyClient,
          noopStorageClient
        )
      )

      expect(result?.isError).toBe(true)
      expect(result?._meta?.errorTag).toBe("MissingArguments")
      expect(result?.content[0]?.text).toContain("missing arguments object")
    }))

  it.effect("rejects unexpected arguments for true no-argument tools", () =>
    Effect.gen(function*() {
      const result = yield* Effect.promise(() =>
        toolRegistry.handleToolCall(
          "get_unread_notification_count",
          { junk: true },
          noopHulyClient,
          noopStorageClient
        )
      )

      expect(result?.isError).toBe(true)
      expect(result?.content[0]?.text).toContain("does not accept arguments")
    }))
})

describe("TOOL_DEFINITIONS", () => {
  it.effect("is populated", () =>
    Effect.gen(function*() {
      const keys = Object.keys(TOOL_DEFINITIONS)
      expect(keys.length).toBeGreaterThan(0)
      expect(keys.length).toBe(toolRegistry.tools.size)
      expect(keys).toContain("create_issue_status")
      expect(keys).toContain("list_associations")
      expect(keys).toContain("list_user_statuses")
    }))

  it.effect("entries match toolRegistry", () =>
    Effect.gen(function*() {
      for (const [name, tool] of Object.entries(TOOL_DEFINITIONS)) {
        expect(tool.name).toBe(name)
        expect(toolRegistry.tools.has(name)).toBe(true)
      }
    }))
})
