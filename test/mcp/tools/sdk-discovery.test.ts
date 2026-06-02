import { describe, it } from "@effect/vitest"
import type { AccountUuid, AnyAttribute, Doc, PersonId, Ref, Space } from "@hcengineering/core"
import { ClassifierKind, toFindResult } from "@hcengineering/core"
import { Effect } from "effect"
import { expect } from "vitest"

import type { HulyClientOperations } from "../../../src/huly/client.js"
import { core, tracker } from "../../../src/huly/huly-plugins.js"
import { testMarkupUrlConfig } from "../../../src/huly/operations/markup.js"
import { firstClassToolHints } from "../../../src/huly/operations/sdk-discovery-tool-hints.js"
import type { HulyStorageOperations } from "../../../src/huly/storage.js"
import { testWorkbenchUrlConfig } from "../../../src/huly/url-builders.js"
import { TOOL_DEFINITIONS } from "../../../src/mcp/tools/index.js"
import { sdkDiscoveryTools } from "../../../src/mcp/tools/sdk-discovery.js"

const person = "person-1" as PersonId
const space = "space-1" as Ref<Space>

// eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- SDK-shaped model fixture
const issueClass = {
  _id: tracker.class.Issue,
  _class: core.class.Class,
  space,
  modifiedBy: person,
  modifiedOn: 0,
  label: "tracker:class:Issue",
  kind: ClassifierKind.CLASS,
  domain: "tracker"
} as Doc

// eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- SDK-shaped attribute fixture
const titleAttribute = {
  _id: "attr:title",
  _class: core.class.Attribute,
  space,
  modifiedBy: person,
  modifiedOn: 0,
  name: "title",
  label: "Title",
  attributeOf: tracker.class.Issue,
  type: { _class: core.class.TypeString }
} as AnyAttribute

const noopStorageClient: HulyStorageOperations = {
  uploadFile: () => Effect.die(new Error("not implemented")),
  getFileUrl: (blobId: string) => `https://test.huly.io/files?file=${blobId}`
}

const hulyClient: HulyClientOperations = {
  getAccountUuid: () => "account-1" as AccountUuid,
  getPrimarySocialId: () => person,
  markupUrlConfig: testMarkupUrlConfig,
  workbenchUrlConfig: testWorkbenchUrlConfig,
  findAll: ((_class: unknown) => {
    if (_class === core.class.Class) return Effect.succeed(toFindResult([issueClass]))
    if (_class === core.class.Attribute) return Effect.succeed(toFindResult([titleAttribute]))
    return Effect.succeed(toFindResult([]))
  }) as HulyClientOperations["findAll"],
  findOne:
    ((_class: unknown) =>
      _class === core.class.Class ? Effect.succeed(issueClass) : Effect.succeed(undefined)) as HulyClientOperations[
        "findOne"
      ],
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

const findTool = (name: string) => {
  const tool = sdkDiscoveryTools.find((candidate) => candidate.name === name)
  if (tool === undefined) throw new Error(`Tool ${name} not found`)
  return tool
}

describe("sdkDiscoveryTools", () => {
  it.effect("exports sdk discovery tools in the sdk-discovery category", () =>
    Effect.gen(function*() {
      expect(sdkDiscoveryTools.map((tool) => tool.name)).toEqual([
        "list_huly_classes",
        "get_huly_class",
        "list_huly_attributes",
        "list_huly_enums"
      ])
      for (const tool of sdkDiscoveryTools) {
        expect(tool.category).toBe("sdk-discovery")
      }
    }))

  it.effect("list_huly_classes handler encodes successful output", () =>
    Effect.gen(function*() {
      const tool = findTool("list_huly_classes")
      const result = yield* Effect.promise(() => tool.handler({}, hulyClient, noopStorageClient))

      expect(result.isError).toBeUndefined()
      const parsed = JSON.parse(result.content[0].text) as { classes: Array<{ classId: string }> }
      expect(parsed.classes[0].classId).toBe(tracker.class.Issue)
    }))

  it.effect("get_huly_class maps schema parse errors", () =>
    Effect.gen(function*() {
      const tool = findTool("get_huly_class")
      const result = yield* Effect.promise(() => tool.handler({}, hulyClient, noopStorageClient))

      expect(result.isError).toBe(true)
    }))

  it.effect("read-only annotations are derived for all discovery tools", () =>
    Effect.gen(function*() {
      for (const tool of sdkDiscoveryTools) {
        expect(tool.name.startsWith("list_") || tool.name.startsWith("get_")).toBe(true)
      }
    }))

  it.effect("uses registered tools as first-class tool hint examples", () =>
    Effect.gen(function*() {
      const registeredToolNames = new Set(Object.keys(TOOL_DEFINITIONS))
      const exampleTools = [...firstClassToolHints.values()].flatMap((hints) =>
        hints.flatMap((hint) => hint.exampleTools)
      )

      for (const toolName of exampleTools) {
        expect(registeredToolNames.has(toolName)).toBe(true)
      }
    }))
})
