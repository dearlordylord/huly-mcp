import { describe, it } from "@effect/vitest"
import { toFindResult } from "@hcengineering/core"
import { Effect } from "effect"
import { expect } from "vitest"

import type { HulyClientOperations } from "../../src/huly/client.js"
import type { HulyStorageOperations } from "../../src/huly/storage.js"
import { toolRegistry } from "../../src/mcp/tools/index.js"

const noopHulyClient: HulyClientOperations = {
  findAll: (() => Effect.succeed(toFindResult([]))) as HulyClientOperations["findAll"],
  findOne: (() => Effect.succeed(undefined)) as HulyClientOperations["findOne"],
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

describe("handleToolCall - known tool execution (line 71)", () => {
  // test-revizorro: suspect | weak assertions: only checks null/defined, not response structure or actual tool output
  it.effect("returns a response when tool is found in registry", () =>
    Effect.gen(function*() {
      // Pick a tool that we know exists - list_projects is simple and just needs findAll
      const firstTool = toolRegistry.definitions[0]
      expect(firstTool).toBeDefined()

      const result = yield* Effect.promise(() =>
        toolRegistry.handleToolCall(
          firstTool.name,
          {},
          noopHulyClient,
          noopStorageClient
        )
      )

      // When a known tool is called, it returns a response (not null)
      expect(result).not.toBeNull()
      expect(result).toBeDefined()
    }))
})
