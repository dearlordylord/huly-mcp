import { describe, it } from "@effect/vitest"
import type { AccountUuid, Class, Doc, DocumentQuery, PersonId, Ref, UserStatus } from "@hcengineering/core"
import { toFindResult } from "@hcengineering/core"
import { Effect } from "effect"
import { expect } from "vitest"
import { assertAt } from "../../../src/utils/assertions.js"

import type { HulyClientOperations } from "../../../src/huly/client.js"
import { core } from "../../../src/huly/huly-plugins.js"
import { testMarkupUrlConfig } from "../../../src/huly/operations/markup.js"
import type { HulyStorageOperations } from "../../../src/huly/storage.js"
import { testWorkbenchUrlConfig } from "../../../src/huly/url-builders.js"
import { userStatusTools } from "../../../src/mcp/tools/user-statuses.js"

/* eslint-disable no-restricted-syntax -- Huly SDK phantom brands and generic test-client dispatch need casts in fixtures */

const userStatus = {
  _id: "user-status-1" as Ref<UserStatus>,
  _class: core.class.UserStatus,
  space: core.space.Workspace,
  modifiedOn: 1700000000000,
  modifiedBy: "person-1" as PersonId,
  online: true,
  user: "11111111-1111-4111-8111-111111111111" as UserStatus["user"]
}

const hulyClient: HulyClientOperations = {
  getAccountUuid: () => "00000000-0000-4000-8000-000000000000" as AccountUuid,
  getPrimarySocialId: () => "test-primary-social-id" as PersonId,
  markupUrlConfig: testMarkupUrlConfig,
  workbenchUrlConfig: testWorkbenchUrlConfig,
  findAll: (<T extends Doc>(_class: Ref<Class<T>>, _query: DocumentQuery<T>) => {
    expect(_class).toBe(core.class.UserStatus)
    return Effect.succeed(toFindResult([userStatus] as unknown as Array<T>))
  }) as HulyClientOperations["findAll"],
  findAllInModel: () => Effect.succeed(toFindResult([])),
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
  const tool = userStatusTools.find((t) => t.name === name)
  if (!tool) throw new Error(`Tool "${name}" not found in userStatusTools`)
  return tool
}

describe("userStatusTools", () => {
  it.effect("exports list_user_statuses in the user-statuses category", () =>
    Effect.gen(function*() {
      expect(userStatusTools).toHaveLength(1)
      expect(userStatusTools[0]?.name).toBe("list_user_statuses")
      expect(userStatusTools[0]?.category).toBe("user-statuses")
    }))

  it.effect("handler encodes successful output", () =>
    Effect.gen(function*() {
      const tool = findTool("list_user_statuses")
      const result = yield* Effect.promise(() => tool.handler({ limit: 5 }, hulyClient, storageClient))

      expect(result.isError).toBeUndefined()
      const parsed = JSON.parse(assertAt(result.content, 0).text) as {
        statuses: ReadonlyArray<{ id: string; user: string; online: boolean; modifiedOn: number }>
        total: number
      }
      expect(parsed).toEqual({
        statuses: [{
          id: "user-status-1",
          user: "11111111-1111-4111-8111-111111111111",
          online: true,
          modifiedOn: 1700000000000
        }],
        total: 1
      })
    }))

  it.effect("invalid params map through MCP error response", () =>
    Effect.gen(function*() {
      const tool = findTool("list_user_statuses")
      const result = yield* Effect.promise(() => tool.handler({ user: "" }, hulyClient, storageClient))

      expect(result.isError).toBe(true)
    }))
})
