import { describe, it } from "@effect/vitest"
import type { AccountUuid, FindResult } from "@hcengineering/core"
import { toFindResult } from "@hcengineering/core"
import { Effect } from "effect"
import { expect } from "vitest"

import type { HulyClientOperations } from "../../../src/huly/client.js"
import { testMarkupUrlConfig } from "../../../src/huly/operations/markup.js"
import type { HulyStorageOperations } from "../../../src/huly/storage.js"
import { notificationTools } from "../../../src/mcp/tools/notifications.js"

const noopHulyClient: HulyClientOperations = {
  getAccountUuid: () => "test-account-uuid" as AccountUuid,
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
  searchFulltext: () => Effect.die(new Error("not implemented")),
  toMarkup: (md: string) => md,
  toMarkdown: (markup: string) => markup,
  getMarkupUrls: () => ({ refUrl: "", imageUrl: "" })
}

const noopStorageClient: HulyStorageOperations = {
  uploadFile: () => Effect.die(new Error("not implemented")),
  getFileUrl: (blobId: string) => `https://test.huly.io/files?file=${blobId}`
}

const findTool = (name: string) => {
  const tool = notificationTools.find((t) => t.name === name)
  if (!tool) throw new Error(`Tool "${name}" not found in notificationTools`)
  return tool
}

describe("notificationTools", () => {
  it.effect("exports all expected notification tools", () =>
    Effect.gen(function*() {
      const expectedTools = [
        "list_notifications",
        "get_notification",
        "mark_notification_read",
        "mark_all_notifications_read",
        "archive_notification",
        "archive_all_notifications",
        "delete_notification",
        "get_notification_context",
        "list_notification_contexts",
        "pin_notification_context",
        "list_notification_settings",
        "update_notification_provider_setting",
        "get_unread_notification_count"
      ]

      const toolNames = notificationTools.map((t) => t.name)
      for (const expected of expectedTools) {
        expect(toolNames).toContain(expected)
      }
      expect(notificationTools.length).toBe(expectedTools.length)
    }))

  it.effect("all tools have category 'notifications'", () =>
    Effect.gen(function*() {
      for (const tool of notificationTools) {
        expect(tool.category).toBe("notifications")
      }
    }))

  it.effect("all tools have non-empty description and inputSchema", () =>
    Effect.gen(function*() {
      for (const tool of notificationTools) {
        expect(tool.description.length).toBeGreaterThan(0)
        expect(tool.inputSchema).toBeDefined()
      }
    }))
})

describe("notification tool handlers", () => {
  it.effect("mark_all_notifications_read handler returns success for empty list", () =>
    Effect.gen(function*() {
      const tool = findTool("mark_all_notifications_read")
      const result = yield* Effect.promise(() => tool.handler({}, noopHulyClient, noopStorageClient))

      expect(result.isError).toBeUndefined()
      const parsed = JSON.parse(result.content[0].text) as { count: number }
      expect(parsed.count).toBe(0)
    }))

  it.effect("archive_all_notifications handler returns success for empty list", () =>
    Effect.gen(function*() {
      const tool = findTool("archive_all_notifications")
      const result = yield* Effect.promise(() => tool.handler({}, noopHulyClient, noopStorageClient))

      expect(result.isError).toBeUndefined()
      const parsed = JSON.parse(result.content[0].text) as { count: number }
      expect(parsed.count).toBe(0)
    }))

  it.effect("get_unread_notification_count handler returns count", () =>
    Effect.gen(function*() {
      const tool = findTool("get_unread_notification_count")
      const result = yield* Effect.promise(() => tool.handler({}, noopHulyClient, noopStorageClient))

      expect(result.isError).toBeUndefined()
      const parsed = JSON.parse(result.content[0].text) as { count: number }
      expect(parsed.count).toBe(0)
    }))

  it.effect("list_notifications handler returns empty list", () =>
    Effect.gen(function*() {
      const tool = findTool("list_notifications")
      const result = yield* Effect.promise(() => tool.handler({}, noopHulyClient, noopStorageClient))

      expect(result.isError).toBeUndefined()
      const parsed = JSON.parse(result.content[0].text)
      expect(parsed).toEqual([])
    }))

  it.effect("get_notification handler returns error for missing notification", () =>
    Effect.gen(function*() {
      const tool = findTool("get_notification")
      const result = yield* Effect.promise(() =>
        tool.handler({ notificationId: "nonexistent" }, noopHulyClient, noopStorageClient)
      )

      expect(result.isError).toBe(true)
    }))

  it.effect("mark_notification_read handler returns error for missing notification", () =>
    Effect.gen(function*() {
      const tool = findTool("mark_notification_read")
      const result = yield* Effect.promise(() =>
        tool.handler({ notificationId: "nonexistent" }, noopHulyClient, noopStorageClient)
      )

      expect(result.isError).toBe(true)
    }))

  it.effect("archive_notification handler returns error for missing notification", () =>
    Effect.gen(function*() {
      const tool = findTool("archive_notification")
      const result = yield* Effect.promise(() =>
        tool.handler({ notificationId: "nonexistent" }, noopHulyClient, noopStorageClient)
      )

      expect(result.isError).toBe(true)
    }))

  it.effect("delete_notification handler returns error for missing notification", () =>
    Effect.gen(function*() {
      const tool = findTool("delete_notification")
      const result = yield* Effect.promise(() =>
        tool.handler({ notificationId: "nonexistent" }, noopHulyClient, noopStorageClient)
      )

      expect(result.isError).toBe(true)
    }))

  it.effect("get_notification_context handler returns null for missing context", () =>
    Effect.gen(function*() {
      const tool = findTool("get_notification_context")
      const result = yield* Effect.promise(() =>
        tool.handler(
          { objectId: "obj-1", objectClass: "tracker.class.Issue" },
          noopHulyClient,
          noopStorageClient
        )
      )

      expect(result.isError).toBeUndefined()
      const parsed = JSON.parse(result.content[0].text)
      expect(parsed).toBeNull()
    }))

  it.effect("list_notification_contexts handler returns empty list", () =>
    Effect.gen(function*() {
      const tool = findTool("list_notification_contexts")
      const result = yield* Effect.promise(() => tool.handler({}, noopHulyClient, noopStorageClient))

      expect(result.isError).toBeUndefined()
      const parsed = JSON.parse(result.content[0].text)
      expect(parsed).toEqual([])
    }))

  it.effect("pin_notification_context handler returns error for missing context", () =>
    Effect.gen(function*() {
      const tool = findTool("pin_notification_context")
      const result = yield* Effect.promise(() =>
        tool.handler(
          { contextId: "nonexistent", pinned: true },
          noopHulyClient,
          noopStorageClient
        )
      )

      expect(result.isError).toBe(true)
    }))

  it.effect("list_notification_settings handler returns empty list", () =>
    Effect.gen(function*() {
      const tool = findTool("list_notification_settings")
      const result = yield* Effect.promise(() => tool.handler({}, noopHulyClient, noopStorageClient))

      expect(result.isError).toBeUndefined()
      const parsed = JSON.parse(result.content[0].text)
      expect(parsed).toEqual([])
    }))

  it.effect("update_notification_provider_setting handler returns updated=false when setting not found", () =>
    Effect.gen(function*() {
      const tool = findTool("update_notification_provider_setting")
      const result = yield* Effect.promise(() =>
        tool.handler(
          { providerId: "some-provider", enabled: true },
          noopHulyClient,
          noopStorageClient
        )
      )

      expect(result.isError).toBeUndefined()
      const parsed = JSON.parse(result.content[0].text) as { providerId: string; updated: boolean }
      expect(parsed.providerId).toBe("some-provider")
      // With noop client (findOne returns undefined), no setting exists to update
      expect(parsed.updated).toBe(false)
    }))

  it.effect("handler returns parse error for invalid params", () =>
    Effect.gen(function*() {
      const tool = findTool("get_notification")
      const result = yield* Effect.promise(() => tool.handler({ wrong: "params" }, noopHulyClient, noopStorageClient))

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain("Invalid parameters")
    }))
})
