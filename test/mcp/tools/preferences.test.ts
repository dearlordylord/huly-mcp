import { describe, it } from "@effect/vitest"
import type { AccountUuid, Class, Doc, DocumentQuery, PersonId, Ref, Space } from "@hcengineering/core"
import { toFindResult } from "@hcengineering/core"
import type { SpacePreference as HulySpacePreference } from "@hcengineering/preference"
import { Effect } from "effect"
import { expect } from "vitest"
import { assertAt } from "../../../src/utils/assertions.js"

import type { HulyClientOperations } from "../../../src/huly/client.js"
import { core, preference } from "../../../src/huly/huly-plugins.js"
import { testMarkupUrlConfig } from "../../../src/huly/operations/markup.js"
import { toAccountUuid, toRef } from "../../../src/huly/operations/sdk-boundary.js"
import type { HulyStorageOperations } from "../../../src/huly/storage.js"
import { testWorkbenchUrlConfig } from "../../../src/huly/url-builders.js"
import { resolveAnnotations, TOOL_DEFINITIONS } from "../../../src/mcp/tools/index.js"
import { preferenceTools } from "../../../src/mcp/tools/preferences.js"
import { corePersonId } from "../../helpers/huly-sdk.js"

const personId: PersonId = corePersonId("person-social-1")
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

const spacePreference: HulySpacePreference = {
  _id: toRef<HulySpacePreference>("pref-1"),
  _class: preference.class.SpacePreference,
  space: core.space.Workspace,
  modifiedBy: personId,
  modifiedOn: 10,
  createdBy: personId,
  createdOn: 5,
  attachedTo: toRef<Space>("space-1")
}

const findAll: HulyClientOperations["findAll"] = <T extends Doc>(
  classId: Ref<Class<T>>,
  _query: DocumentQuery<T>
) => {
  if (classId === preference.class.SpacePreference) {
    // The class ref selects the SpacePreference fixture for T.
    // eslint-disable-next-line no-restricted-syntax -- brands erased at runtime; class branch selects T
    return Effect.succeed(toFindResult([spacePreference] as unknown as Array<T>))
  }
  if (classId === core.class.Space) {
    // The class ref selects the Space fixture for T.
    // eslint-disable-next-line no-restricted-syntax -- brands erased at runtime; class branch selects T
    return Effect.succeed(toFindResult([space] as unknown as Array<T>))
  }
  return Effect.succeed(toFindResult<T>([]))
}

const findOne: HulyClientOperations["findOne"] = <T extends Doc>(classId: Ref<Class<T>>) => {
  if (classId === core.class.Space) {
    // The class ref selects the Space fixture for T.
    // eslint-disable-next-line no-restricted-syntax -- brands erased at runtime; class branch selects T
    return Effect.succeed(space as unknown as T)
  }
  if (classId === preference.class.SpacePreference) {
    // The class ref selects the SpacePreference fixture for T.
    // eslint-disable-next-line no-restricted-syntax -- brands erased at runtime; class branch selects T
    return Effect.succeed(spacePreference as unknown as T)
  }
  return Effect.succeed(undefined)
}

const hulyClient: HulyClientOperations = {
  getAccountUuid: (): AccountUuid => accountUuid,
  getPrimarySocialId: () => personId,
  markupUrlConfig: testMarkupUrlConfig,
  workbenchUrlConfig: testWorkbenchUrlConfig,
  findAll,
  findAllInModel: findAll,
  findOne,
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
  const tool = preferenceTools.find((candidate) => candidate.name === name)
  if (tool === undefined) throw new Error(`Tool ${name} not found`)
  return tool
}

describe("preferenceTools", () => {
  it.effect("exports space preference tools in the preferences category and registers them globally", () =>
    Effect.gen(function*() {
      expect(preferenceTools.map((tool) => tool.name)).toEqual([
        "list_space_preferences",
        "get_space_preference"
      ])
      for (const tool of preferenceTools) {
        expect(tool.category).toBe("preferences")
        expect(TOOL_DEFINITIONS[tool.name]).toBe(tool)
        expect(resolveAnnotations(tool).readOnlyHint).toBe(true)
      }
    }))

  it.effect("list_space_preferences handler encodes successful structured output", () =>
    Effect.gen(function*() {
      const result = yield* Effect.promise(() =>
        findTool("list_space_preferences").handler({}, hulyClient, storageClient)
      )

      expect(result.isError).toBeUndefined()
      expect(result.structuredContent?.result).toMatchObject({
        preferences: [{
          preferenceId: "pref-1",
          attachedTo: "space-1",
          attachedSpace: { id: "space-1", name: "General" },
          class: preference.class.SpacePreference
        }],
        total: 1
      })
      expect(JSON.parse(assertAt(result.content, 0).text)).toMatchObject({ total: 1 })
    }))

  it.effect("get_space_preference maps validation errors to invalid params", () =>
    Effect.gen(function*() {
      const result = yield* Effect.promise(() =>
        findTool("get_space_preference").handler({}, hulyClient, storageClient)
      )

      expect(result.isError).toBe(true)
      expect(assertAt(result.content, 0).text).toContain("Invalid parameters for get_space_preference")
    }))
})
