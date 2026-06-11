import { describe, it } from "@effect/vitest"
import type { Class, Doc, DocumentQuery, Ref, Space } from "@hcengineering/core"
import { toFindResult } from "@hcengineering/core"
import { Effect } from "effect"
import { expect } from "vitest"

import type { HulyClientOperations } from "../../../src/huly/client.js"
import { core } from "../../../src/huly/huly-plugins.js"
import { testMarkupUrlConfig } from "../../../src/huly/operations/markup.js"
import { toAccountUuid, toRef } from "../../../src/huly/operations/sdk-boundary.js"
import type { HulyStorageOperations } from "../../../src/huly/storage.js"
import { testWorkbenchUrlConfig } from "../../../src/huly/url-builders.js"
import { McpErrorCode } from "../../../src/mcp/error-mapping.js"
import { TOOL_DEFINITIONS } from "../../../src/mcp/tools/index.js"
import { spaceTools } from "../../../src/mcp/tools/spaces.js"
import { corePersonId } from "../../helpers/huly-sdk.js"

const personId = corePersonId("person-social-1")
const accountUuid = toAccountUuid("00000000-0000-4000-8000-000000000001")

const space: Space = {
  _id: toRef<Space>("space-1"),
  _class: core.class.Space,
  space: core.space.Space,
  modifiedBy: personId,
  modifiedOn: 0,
  createdBy: personId,
  createdOn: 0,
  name: "General",
  description: "Default space",
  private: false,
  members: [accountUuid],
  owners: [],
  archived: false
}

const findAll: HulyClientOperations["findAll"] = <T extends Doc>(
  _class: Ref<Class<T>>,
  _query: DocumentQuery<T>
) => {
  if (_class === core.class.Space) {
    // The class ref selects the Space fixture; Huly SDK refs are phantom-branded
    // strings at runtime, so this is the fake-client boundary for T.
    // eslint-disable-next-line no-restricted-syntax -- brands erased at runtime; class branch selects Space as T
    return Effect.succeed(toFindResult([space] as unknown as Array<T>))
  }
  return Effect.succeed(toFindResult<T>([]))
}

const findOne: HulyClientOperations["findOne"] = <T extends Doc>(_class: Ref<Class<T>>) =>
  _class === core.class.Space
    // The same class-ref branch as findAll selects the Space fixture for T.
    // eslint-disable-next-line no-restricted-syntax -- brands erased at runtime; class branch selects Space as T
    ? Effect.succeed(space as unknown as T)
    : Effect.succeed(undefined)

const hulyClient: HulyClientOperations = {
  getAccountUuid: () => accountUuid,
  getPrimarySocialId: () => personId,
  markupUrlConfig: testMarkupUrlConfig,
  workbenchUrlConfig: testWorkbenchUrlConfig,
  findAll,
  findAllInModel: findAll,
  findOne,
  createDoc: () => Effect.die(new Error("not implemented")),
  updateDoc: () => Effect.succeed([]),
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
  const tool = spaceTools.find((candidate) => candidate.name === name)
  if (tool === undefined) throw new Error(`Tool ${name} not found`)
  return tool
}

describe("spaceTools", () => {
  it.effect("exports all spaces tools in the spaces category and registers them globally", () =>
    Effect.gen(function*() {
      expect(spaceTools.map((tool) => tool.name)).toEqual([
        "list_spaces",
        "get_space",
        "list_space_types",
        "get_space_type",
        "list_space_permissions",
        "update_space",
        "add_space_members",
        "remove_space_members",
        "set_space_owners",
        "set_space_role_members",
        "add_space_role_members",
        "remove_space_role_members"
      ])
      for (const tool of spaceTools) {
        expect(tool.category).toBe("spaces")
        expect(TOOL_DEFINITIONS[tool.name]).toBe(tool)
      }
    }))

  it.effect("list_spaces handler encodes successful structured output", () =>
    Effect.gen(function*() {
      const result = yield* Effect.promise(() => findTool("list_spaces").handler({}, hulyClient, storageClient))

      expect(result.isError).toBeUndefined()
      expect(result.structuredContent?.result).toMatchObject({
        spaces: [{ id: "space-1", class: core.class.Space, membersCount: 1 }],
        total: 1
      })
      expect(JSON.parse(result.content[0].text)).toMatchObject({ total: 1 })
    }))

  it.effect("update_space handler maps validation errors to invalid params", () =>
    Effect.gen(function*() {
      const result = yield* Effect.promise(() =>
        findTool("update_space").handler({ space: "space-1" }, hulyClient, storageClient)
      )

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain("Invalid parameters for update_space")
    }))

  it.effect("set_space_role_members handler maps non-typed spaces to invalid params", () =>
    Effect.gen(function*() {
      const result = yield* Effect.promise(() =>
        findTool("set_space_role_members").handler(
          { space: "space-1", role: "Admins", members: [accountUuid] },
          hulyClient,
          storageClient
        )
      )

      expect(result.isError).toBe(true)
      expect(result._meta?.errorCode).toBe(McpErrorCode.InvalidParams)
      expect(result._meta?.errorTag).toBeUndefined()
      expect(result.content[0].text).toBe(
        "Space 'General' (space-1) is not typed; role members can only be changed on spaces with a SpaceType"
      )
    }))

  it.effect("get_space handler maps domain errors to invalid params", () =>
    Effect.gen(function*() {
      const missingClient: HulyClientOperations = {
        ...hulyClient,
        findOne: () => Effect.succeed(undefined),
        findAll: () => Effect.succeed(toFindResult([]))
      }
      const result = yield* Effect.promise(() =>
        findTool("get_space").handler({ space: "missing" }, missingClient, storageClient)
      )

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain("Space 'missing' not found")
    }))
})
