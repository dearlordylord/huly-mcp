import { describe, it } from "@effect/vitest"
import type { AccountUuid, PersonId } from "@hcengineering/core"
import { toFindResult } from "@hcengineering/core"
import { Effect } from "effect"
import { expect } from "vitest"
import { assertAt } from "../../src/utils/assertions.js"

import type { HulyClientOperations } from "../../src/huly/client.js"
import { testMarkupUrlConfig } from "../../src/huly/operations/markup.js"
import type { HulyStorageOperations } from "../../src/huly/storage.js"
import { testWorkbenchUrlConfig } from "../../src/huly/url-builders.js"
import { toolRegistry } from "../../src/mcp/tools/index.js"

const noopHulyClient: HulyClientOperations = {
  getAccountUuid: () => "00000000-0000-4000-8000-000000000000" as AccountUuid,
  getPrimarySocialId: () => "test-primary-social-id" as PersonId,
  markupUrlConfig: testMarkupUrlConfig,
  workbenchUrlConfig: testWorkbenchUrlConfig,
  findAll: (() => Effect.succeed(toFindResult([]))) as HulyClientOperations["findAll"],
  findAllInModel: (() => Effect.succeed(toFindResult([]))) as HulyClientOperations["findAllInModel"],
  findOne: (() => Effect.succeed(undefined)) as HulyClientOperations["findOne"],
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

describe("handleToolCall - known tool execution (line 71)", () => {
  it.effect("returns a response when tool is found in registry", () =>
    Effect.gen(function*() {
      // Pick a tool that we know exists - list_projects is simple and just needs findAll
      const firstTool = assertAt(toolRegistry.definitions, 0)

      const result = yield* Effect.promise(() =>
        toolRegistry.handleToolCall(
          firstTool.name,
          {},
          noopHulyClient,
          noopStorageClient
        )
      )

      // When a known tool is called, it returns an MCP response (not null)
      expect(result).not.toBeNull()
      expect(result).toBeDefined()
      // Verify MCP response structure: must have content array with text entries
      expect(result!.content).toBeInstanceOf(Array)
      expect(result!.content.length).toBeGreaterThan(0)
      expect(assertAt(result!.content, 0).type).toBe("text")
      expect(typeof assertAt(result!.content, 0).text).toBe("string")
    }))
})
