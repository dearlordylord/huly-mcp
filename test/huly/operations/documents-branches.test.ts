import { describe, it } from "@effect/vitest"
import { type Doc, type MarkupBlobRef, type Ref, type Space, toFindResult } from "@hcengineering/core"
import type { Document as HulyDocument, Teamspace as HulyTeamspace } from "@hcengineering/document"
import { Effect } from "effect"
import { expect } from "vitest"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import { listDocuments, updateDocument } from "../../../src/huly/operations/documents.js"

import { documentPlugin } from "../../../src/huly/huly-plugins.js"

// --- Mock Data Builders ---

const makeTeamspace = (overrides?: Partial<HulyTeamspace>): HulyTeamspace => {
  const result: HulyTeamspace = {
    _id: "teamspace-1" as Ref<HulyTeamspace>,
    _class: documentPlugin.class.Teamspace,
    space: "space-1" as Ref<Space>,
    name: "My Documents",
    description: "Test teamspace",
    archived: false,
    private: false,
    modifiedBy: "user-1" as Ref<Doc>,
    modifiedOn: Date.now(),
    createdBy: "user-1" as Ref<Doc>,
    createdOn: Date.now(),
    ...overrides
  }
  return result
}

const makeDocument = (overrides?: Partial<HulyDocument>): HulyDocument => {
  const result: HulyDocument = {
    _id: "doc-1" as Ref<HulyDocument>,
    _class: documentPlugin.class.Document,
    space: "teamspace-1" as Ref<HulyTeamspace>,
    title: "Test Document",
    content: null,
    parent: documentPlugin.ids.NoParent,
    rank: "0|aaa",
    modifiedBy: "user-1" as Ref<Doc>,
    modifiedOn: Date.now(),
    createdBy: "user-1" as Ref<Doc>,
    createdOn: Date.now(),
    ...overrides
  }
  return result
}

// --- Test Helpers ---

interface MockConfig {
  teamspaces?: Array<HulyTeamspace>
  documents?: Array<HulyDocument>
  markupContent?: Record<string, string>
  captureDocumentQuery?: { query?: Record<string, unknown>; options?: Record<string, unknown> }
  captureUpdateDoc?: { operations?: Record<string, unknown> }
  captureUploadMarkup?: { markup?: string }
  captureUpdateMarkup?: { called?: boolean; markup?: string }
}

const createTestLayerWithMocks = (config: MockConfig) => {
  const teamspaces = config.teamspaces ?? []
  const documents = config.documents ?? []

  const findAllImpl: HulyClientOperations["findAll"] = ((_class: unknown, query: unknown, options: unknown) => {
    if (_class === documentPlugin.class.Teamspace) {
      const q = query as Record<string, unknown>
      let filtered = [...teamspaces]
      if (q.archived !== undefined) {
        filtered = filtered.filter(ts => ts.archived === q.archived)
      }
      return Effect.succeed(toFindResult(filtered as Array<Doc>))
    }
    if (_class === documentPlugin.class.Document) {
      if (config.captureDocumentQuery) {
        config.captureDocumentQuery.query = query as Record<string, unknown>
        config.captureDocumentQuery.options = options as Record<string, unknown>
      }
      const q = query as Record<string, unknown>
      const filtered = documents.filter(d => d.space === q.space)
      return Effect.succeed(toFindResult(filtered as Array<Doc>))
    }
    return Effect.succeed(toFindResult([]))
  }) as HulyClientOperations["findAll"]

  const findOneImpl: HulyClientOperations["findOne"] = ((_class: unknown, query: unknown) => {
    if (_class === documentPlugin.class.Teamspace) {
      const q = query as Record<string, unknown>
      const found = teamspaces.find(ts =>
        (q.name && ts.name === q.name)
        || (q._id && ts._id === q._id)
      )
      return Effect.succeed(found as Doc | undefined)
    }
    if (_class === documentPlugin.class.Document) {
      const q = query as Record<string, unknown>
      const found = documents.find(d =>
        (q.space && q.title && d.space === q.space && d.title === q.title)
        || (q.space && q._id && d.space === q.space && d._id === q._id)
        || (q.space && !q.title && !q._id && d.space === q.space)
      )
      return Effect.succeed(found as Doc | undefined)
    }
    return Effect.succeed(undefined)
  }) as HulyClientOperations["findOne"]

  const markupContent = config.markupContent ?? {}
  const fetchMarkupImpl: HulyClientOperations["fetchMarkup"] = (
    (_objectClass: unknown, _objectId: unknown, _objectAttr: unknown, id: unknown) => {
      const content = markupContent[id as string] ?? ""
      return Effect.succeed(content)
    }
  ) as HulyClientOperations["fetchMarkup"]

  const updateDocImpl: HulyClientOperations["updateDoc"] = (
    (_class: unknown, _space: unknown, _objectId: unknown, operations: unknown) => {
      if (config.captureUpdateDoc) {
        config.captureUpdateDoc.operations = operations as Record<string, unknown>
      }
      return Effect.succeed({} as never)
    }
  ) as HulyClientOperations["updateDoc"]

  const uploadMarkupImpl: HulyClientOperations["uploadMarkup"] = ((
    _objectClass: unknown,
    _objectId: unknown,
    _objectAttr: unknown,
    markup: unknown
  ) => {
    if (config.captureUploadMarkup) {
      config.captureUploadMarkup.markup = markup as string
    }
    return Effect.succeed("markup-ref-123")
  }) as HulyClientOperations["uploadMarkup"]

  const updateMarkupImpl: HulyClientOperations["updateMarkup"] = ((
    _objectClass: unknown,
    _objectId: unknown,
    _objectAttr: unknown,
    markup: unknown
  ) => {
    if (config.captureUpdateMarkup) {
      config.captureUpdateMarkup.called = true
      config.captureUpdateMarkup.markup = markup as string
    }
    return Effect.succeed(undefined as void)
  }) as HulyClientOperations["updateMarkup"]

  const removeDocImpl: HulyClientOperations["removeDoc"] = (
    () => Effect.succeed({})
  ) as HulyClientOperations["removeDoc"]

  return HulyClient.testLayer({
    findAll: findAllImpl,
    findOne: findOneImpl,
    fetchMarkup: fetchMarkupImpl,
    updateDoc: updateDocImpl,
    uploadMarkup: uploadMarkupImpl,
    updateMarkup: updateMarkupImpl,
    removeDoc: removeDocImpl
  })
}

// --- Branch coverage tests ---

describe("listDocuments - titleSearch branch (line 196)", () => {
  // test-revizorro: approved
  it.effect("applies titleSearch filter to query", () =>
    Effect.gen(function*() {
      const teamspace = makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "My Docs" })
      const captureQuery: MockConfig["captureDocumentQuery"] = {}

      const testLayer = createTestLayerWithMocks({
        teamspaces: [teamspace],
        documents: [],
        captureDocumentQuery: captureQuery
      })

      yield* listDocuments({ teamspace: "My Docs", titleSearch: "design" }).pipe(Effect.provide(testLayer))

      expect(captureQuery.query?.title).toEqual({ $like: "%design%" })
    }))

  // test-revizorro: approved
  it.effect("skips titleSearch when whitespace-only", () =>
    Effect.gen(function*() {
      const teamspace = makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "My Docs" })
      const captureQuery: MockConfig["captureDocumentQuery"] = {}

      const testLayer = createTestLayerWithMocks({
        teamspaces: [teamspace],
        documents: [],
        captureDocumentQuery: captureQuery
      })

      yield* listDocuments({ teamspace: "My Docs", titleSearch: "   " }).pipe(Effect.provide(testLayer))

      expect(captureQuery.query?.title).toBeUndefined()
    }))
})

describe("listDocuments - contentSearch branch (line 200)", () => {
  // test-revizorro: scheduled
  it.effect("applies contentSearch to $search query", () =>
    Effect.gen(function*() {
      const teamspace = makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "My Docs" })
      const captureQuery: MockConfig["captureDocumentQuery"] = {}

      const testLayer = createTestLayerWithMocks({
        teamspaces: [teamspace],
        documents: [],
        captureDocumentQuery: captureQuery
      })

      yield* listDocuments({ teamspace: "My Docs", contentSearch: "implementation" }).pipe(Effect.provide(testLayer))

      expect(captureQuery.query?.$search).toBe("implementation")
    }))

  // test-revizorro: approved
  it.effect("skips contentSearch when whitespace-only", () =>
    Effect.gen(function*() {
      const teamspace = makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "My Docs" })
      const captureQuery: MockConfig["captureDocumentQuery"] = {}

      const testLayer = createTestLayerWithMocks({
        teamspaces: [teamspace],
        documents: [],
        captureDocumentQuery: captureQuery
      })

      yield* listDocuments({ teamspace: "My Docs", contentSearch: "  " }).pipe(Effect.provide(testLayer))

      expect(captureQuery.query?.$search).toBeUndefined()
    }))
})

describe("updateDocument - in-place content update branch (lines 358-365)", () => {
  // test-revizorro: approved
  it.effect("uses updateMarkup when document already has content", () =>
    Effect.gen(function*() {
      const teamspace = makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "My Docs" })
      const doc = makeDocument({
        _id: "doc-1" as Ref<HulyDocument>,
        title: "Existing Doc",
        space: "ts-1" as Ref<HulyTeamspace>,
        content: "existing-markup-ref" as MarkupBlobRef
      })
      const captureUpdateMarkup: MockConfig["captureUpdateMarkup"] = {}
      const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}

      const testLayer = createTestLayerWithMocks({
        teamspaces: [teamspace],
        documents: [doc],
        captureUpdateMarkup,
        captureUpdateDoc
      })

      const result = yield* updateDocument({
        teamspace: "My Docs",
        document: "Existing Doc",
        content: "# Updated in place"
      }).pipe(Effect.provide(testLayer))

      expect(result.updated).toBe(true)
      expect(captureUpdateMarkup.called).toBe(true)
      expect(captureUpdateMarkup.markup).toBe("# Updated in place")
      // When content is updated in-place, the updateDoc should NOT set content field
      // (contentUpdatedInPlace = true means content is not in updateOps)
      expect(captureUpdateDoc.operations?.content).toBeUndefined()
    }))

  // test-revizorro: approved
  it.effect("updates title alongside in-place content update", () =>
    Effect.gen(function*() {
      const teamspace = makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "My Docs" })
      const doc = makeDocument({
        _id: "doc-1" as Ref<HulyDocument>,
        title: "Old Title",
        space: "ts-1" as Ref<HulyTeamspace>,
        content: "existing-ref" as MarkupBlobRef
      })
      const captureUpdateMarkup: MockConfig["captureUpdateMarkup"] = {}
      const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}

      const testLayer = createTestLayerWithMocks({
        teamspaces: [teamspace],
        documents: [doc],
        captureUpdateMarkup,
        captureUpdateDoc
      })

      const result = yield* updateDocument({
        teamspace: "My Docs",
        document: "Old Title",
        title: "New Title",
        content: "New content in place"
      }).pipe(Effect.provide(testLayer))

      expect(result.updated).toBe(true)
      expect(captureUpdateMarkup.called).toBe(true)
      expect(captureUpdateDoc.operations?.title).toBe("New Title")
    }))
})
