import { describe, it } from "@effect/vitest"
import type { AccountUuid, FindResult, PersonId } from "@hcengineering/core"
import { toFindResult } from "@hcengineering/core"
import type { TodoAutomationHelper } from "@hcengineering/time"
import { Effect } from "effect"
import { expect } from "vitest"

import type { HulyClientOperations } from "../../../src/huly/client.js"
import { time } from "../../../src/huly/huly-plugins.js"
import { testMarkupUrlConfig } from "../../../src/huly/operations/markup.js"
import type { HulyStorageOperations } from "../../../src/huly/storage.js"
import { testWorkbenchUrlConfig } from "../../../src/huly/url-builders.js"
import { plannerTools } from "../../../src/mcp/tools/planner.js"

const asAutomationHelper = (v: unknown) => v as TodoAutomationHelper

const helper = asAutomationHelper({
  _id: "helper-1",
  _class: time.class.TodoAutomationHelper,
  space: time.space.ToDos,
  onDoneTester: "time:test:done",
  modifiedBy: "user-1",
  modifiedOn: 1,
  createdBy: "user-1",
  createdOn: 1
})

const hulyClient: HulyClientOperations = {
  getAccountUuid: () => "00000000-0000-4000-8000-000000000000" as AccountUuid,
  getPrimarySocialId: () => "test-primary-social-id" as PersonId,
  markupUrlConfig: testMarkupUrlConfig,
  workbenchUrlConfig: testWorkbenchUrlConfig,
  findAll: () => Effect.succeed(toFindResult([helper])) as Effect.Effect<FindResult<never>>,
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

const storageClient: HulyStorageOperations = {
  uploadFile: () => Effect.die(new Error("not implemented")),
  getFileUrl: (blobId: string) => `https://test.huly.io/files?file=${blobId}`
}

const findTool = (name: string) => {
  const tool = plannerTools.find((candidate) => candidate.name === name)
  if (tool === undefined) throw new Error(`Tool ${name} not found`)
  return tool
}

describe("plannerTools", () => {
  it.effect("exports planner tools in the planner category", () =>
    Effect.gen(function*() {
      expect(plannerTools.map((tool) => tool.name)).toContain("create_todo")
      expect(plannerTools.map((tool) => tool.name)).toContain("schedule_todo")
      expect(plannerTools.map((tool) => tool.name)).toContain("list_todo_automation_helpers")
      for (const tool of plannerTools) {
        expect(tool.category).toBe("planner")
      }
    }))

  it.effect("list_todo_automation_helpers handler returns helpers", () =>
    Effect.gen(function*() {
      const tool = findTool("list_todo_automation_helpers")
      const result = yield* Effect.promise(() => tool.handler({}, hulyClient, storageClient))

      expect(result.isError).toBeFalsy()
      expect(result.content[0].text).toContain("time:test:done")
    }))
})
