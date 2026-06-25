import { describe, it } from "@effect/vitest"
import type { AccountUuid, Class, Doc, PersonId, Ref } from "@hcengineering/core"
import { toFindResult } from "@hcengineering/core"
import type { IntlString } from "@hcengineering/platform"
import type { AnyComponent } from "@hcengineering/ui"
import type { FilteredView, Viewlet, ViewletDescriptor, ViewletPreference } from "@hcengineering/view"
import { Effect } from "effect"
import { expect } from "vitest"

import { ViewletDescriptorMetadataDegradedWarningCode } from "../../../src/domain/schemas/tool-warnings.js"
import type { HulyClientOperations } from "../../../src/huly/client.js"
import { board, core, view } from "../../../src/huly/huly-plugins.js"
import { testMarkupUrlConfig } from "../../../src/huly/operations/markup.js"
import { toRef } from "../../../src/huly/operations/sdk-boundary.js"
import type { HulyStorageOperations } from "../../../src/huly/storage.js"
import { testWorkbenchUrlConfig } from "../../../src/huly/url-builders.js"
import { McpErrorCode } from "../../../src/mcp/error-mapping.js"
import { createFilteredRegistry, TOOL_DEFINITIONS } from "../../../src/mcp/tools/index.js"
import { makeToolCategory, makeToolName } from "../../../src/mcp/tools/registry.js"
import { viewTools } from "../../../src/mcp/tools/views.js"
import { assertAt, assertExists } from "../../../src/utils/assertions.js"

const toolDefinition = (name: string) => assertExists(TOOL_DEFINITIONS[name], `Expected tool definition for ${name}`)
const viewRegistry = () => createFilteredRegistry(new Set([makeToolCategory("views")]))

// Huly SDK brands, intl ids, and component handles are erased at runtime; these fixture casts restore
// compile-time brands for stable literals that match the SDK shapes used by the fake client.
const accountUuid = (value: string): AccountUuid => value as AccountUuid
const personId = (value: string): PersonId => value as PersonId
const intl = (value: string): IntlString => value as IntlString
const component = (value: string): AnyComponent => value as AnyComponent

const account = accountUuid("00000000-0000-4000-8000-000000000000")
const person = personId("person-1")
const boardCardClass = toRef<Class<Doc>>(String(board.class.Card))

const filteredViewDoc: FilteredView = {
  _id: toRef<FilteredView>("filtered-view-1"),
  _class: view.class.FilteredView,
  space: core.space.Workspace,
  modifiedOn: 1,
  modifiedBy: core.account.System,
  name: "Mine",
  location: { path: ["board"] },
  filters: "[{\"key\":\"status\"}]",
  viewletId: toRef<Viewlet>("viewlet-kanban"),
  sharable: false,
  users: [account],
  createdBy: person,
  attachedTo: String(board.app.Board)
}

const viewletDoc: Viewlet = {
  _id: toRef<Viewlet>("viewlet-kanban"),
  _class: view.class.Viewlet,
  space: core.space.Model,
  modifiedOn: 1,
  modifiedBy: core.account.System,
  attachTo: boardCardClass,
  descriptor: toRef<ViewletDescriptor>("descriptor-kanban"),
  config: ["title"],
  title: "Kanban",
  variant: "kanban"
}

const descriptorDoc: ViewletDescriptor = {
  _id: toRef<ViewletDescriptor>("descriptor-kanban"),
  _class: view.class.ViewletDescriptor,
  space: core.space.Model,
  modifiedOn: 1,
  modifiedBy: core.account.System,
  label: intl("view:string:Kanban"),
  component: component("view:component:Kanban")
}

const preferenceDoc: ViewletPreference = {
  _id: toRef<ViewletPreference>("viewlet-pref-1"),
  _class: view.class.ViewletPreference,
  space: core.space.Workspace,
  modifiedOn: 1,
  modifiedBy: core.account.System,
  attachedTo: toRef<Viewlet>("viewlet-kanban"),
  config: ["title"]
}

const storageClient: HulyStorageOperations = {
  uploadFile: () => Effect.die(new Error("not implemented")),
  getFileUrl: (blobId: string) => `https://test.invalid/files/${blobId}`
}

interface ClientFixture {
  readonly filteredViews?: ReadonlyArray<FilteredView>
  readonly viewlets?: ReadonlyArray<Viewlet>
  readonly descriptors?: ReadonlyArray<ViewletDescriptor>
  readonly preferences?: ReadonlyArray<ViewletPreference>
}

const makeClient = (fixture: ClientFixture): HulyClientOperations => ({
  getAccountUuid: () => account,
  getPrimarySocialId: () => person,
  markupUrlConfig: testMarkupUrlConfig,
  workbenchUrlConfig: testWorkbenchUrlConfig,
  findAll: <T extends Doc>(_class: Ref<Class<T>>) =>
    Effect.succeed(toFindResult(toTypedDocs<T>(
      String(_class) === String(view.class.FilteredView)
        ? fixture.filteredViews ?? []
        : String(_class) === String(view.class.ViewletPreference)
        ? fixture.preferences ?? []
        : []
    ))),
  findAllInModel: <T extends Doc>(_class: Ref<Class<T>>) =>
    Effect.succeed(toFindResult(toTypedDocs<T>(
      String(_class) === String(view.class.Viewlet)
        ? fixture.viewlets ?? []
        : String(_class) === String(view.class.ViewletDescriptor)
        ? fixture.descriptors ?? []
        : []
    ))),
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
})

const toTypedDocs = <T extends Doc>(docs: ReadonlyArray<Doc>): Array<T> => {
  // Safe because makeClient selects a Huly class-specific fixture before restoring the SDK-generic shape.
  return docs as Array<T>
}

describe("view MCP tools", () => {
  it.effect("registers view tools in order", () =>
    Effect.gen(function*() {
      const filtered = viewRegistry()

      expect(filtered.definitions.map((tool) => tool.name)).toEqual([
        "list_filtered_views",
        "get_filtered_view",
        "list_viewlets"
      ])
      expect(toolDefinition("list_filtered_views").category).toBe("views")
    }))

  it.effect("serializes filtered view responses as structured content", () =>
    Effect.gen(function*() {
      const registry = viewRegistry()
      const result = yield* Effect.promise(() =>
        registry.handleToolCall(
          makeToolName("list_filtered_views"),
          { attachedTo: String(board.app.Board) },
          makeClient({ filteredViews: [filteredViewDoc] }),
          storageClient
        )
      )

      expect(result?.isError).toBeUndefined()
      expect(result?.structuredContent?.result).toEqual({
        filteredViews: [{
          id: "filtered-view-1",
          name: "Mine",
          attachedTo: String(board.app.Board),
          visibility: "own",
          sharable: false,
          users: 1,
          viewletId: "viewlet-kanban"
        }],
        total: 1
      })
    }))

  it.effect("serializes viewlet responses with descriptors and preferences", () =>
    Effect.gen(function*() {
      const registry = viewRegistry()
      const result = yield* Effect.promise(() =>
        registry.handleToolCall(
          makeToolName("list_viewlets"),
          { attachTo: String(board.class.Card) },
          makeClient({
            viewlets: [viewletDoc],
            descriptors: [descriptorDoc],
            preferences: [preferenceDoc]
          }),
          storageClient
        )
      )

      expect(result?.isError).toBeUndefined()
      expect(result?.structuredContent?.result).toEqual({
        viewlets: [{
          id: "viewlet-kanban",
          attachTo: String(board.class.Card),
          descriptor: "descriptor-kanban",
          title: "Kanban",
          variant: "kanban",
          config: ["title"],
          descriptorInfo: {
            id: "descriptor-kanban",
            label: "view:string:Kanban",
            component: "view:component:Kanban"
          },
          preferences: [{
            id: "viewlet-pref-1",
            attachedTo: "viewlet-kanban",
            config: ["title"]
          }]
        }],
        total: 1
      })
    }))

  it.effect("surfaces descriptor metadata warnings in the MCP envelope", () =>
    Effect.gen(function*() {
      const registry = viewRegistry()
      const result = yield* Effect.promise(() =>
        registry.handleToolCall(
          makeToolName("list_viewlets"),
          { attachTo: String(board.class.Card) },
          makeClient({
            viewlets: [viewletDoc],
            descriptors: [],
            preferences: []
          }),
          storageClient
        )
      )

      expect(result?.isError).toBeUndefined()
      expect(result?.structuredContent?.warnings).toEqual([{
        code: ViewletDescriptorMetadataDegradedWarningCode,
        message:
          "Huly did not return descriptor metadata for 1 viewlet descriptor ref(s): descriptor-kanban. The affected viewlets omit descriptorInfo; use descriptor ids, titles, and variants instead of inferring label or component metadata."
      }])
      expect(JSON.parse(assertAt(assertExists(result).content, 1).text)).toEqual({
        warnings: result?.structuredContent?.warnings
      })
    }))

  it.effect("maps generic view domain errors to invalid params", () =>
    Effect.gen(function*() {
      const registry = viewRegistry()
      const result = yield* Effect.promise(() =>
        registry.handleToolCall(
          makeToolName("get_filtered_view"),
          { filteredView: "Missing" },
          makeClient({ filteredViews: [] }),
          storageClient
        )
      )

      expect(result?.isError).toBe(true)
      expect(result?._meta?.errorCode).toBe(McpErrorCode.InvalidParams)
      expect(assertAt(assertExists(result).content, 0).text).toContain("Filtered view 'Missing' not found")
    }))

  it.effect("rejects invalid view output before returning structured content", () =>
    Effect.gen(function*() {
      const tool = viewTools.find((definition) => definition.name === "list_filtered_views")
      expect(tool).toBeDefined()
      const result = yield* Effect.promise(() =>
        tool?.handler({}, makeClient({ filteredViews: [makeInvalidFilteredViewDoc()] }), storageClient)
          ?? Promise.resolve(undefined)
      )

      expect(result?.isError).toBe(true)
      expect(result?._meta?.errorCode).toBe(McpErrorCode.InternalError)
      expect(assertAt(assertExists(result).content, 0).text).toContain("invalid output")
    }))
})

const makeInvalidFilteredViewDoc = (): FilteredView => ({
  ...filteredViewDoc,
  // eslint-disable-next-line no-restricted-syntax -- intentionally malformed SDK-shaped fake exercises output encoding
  name: "" as unknown as string
})
