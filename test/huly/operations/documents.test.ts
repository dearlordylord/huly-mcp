import { describe, it } from "@effect/vitest"
import { type Doc, type MarkupBlobRef, type PersonId, type Ref, type Space, toFindResult } from "@hcengineering/core"
import type { Document as HulyDocument, Teamspace as HulyTeamspace } from "@hcengineering/document"
import { Effect } from "effect"
import { expect } from "vitest"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import type {
  DocumentEmptyContentError,
  DocumentNotFoundError,
  DocumentTextMultipleMatchesError,
  DocumentTextNotFoundError,
  TeamspaceNotFoundError
} from "../../../src/huly/errors.js"
import {
  createDocument,
  createTeamspace,
  deleteDocument,
  deleteTeamspace,
  editDocument,
  getDocument,
  getTeamspace,
  listDocuments,
  listTeamspaces,
  updateTeamspace
} from "../../../src/huly/operations/documents.js"
import { documentIdentifier, teamspaceIdentifier } from "../../helpers/brands.js"

import { documentPlugin } from "../../../src/huly/huly-plugins.js"

// --- Mock Data Builders ---

// eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- mock builder
const makeTeamspace = (overrides?: Partial<HulyTeamspace>): HulyTeamspace => ({
  _id: "teamspace-1" as Ref<HulyTeamspace>,
  _class: documentPlugin.class.Teamspace,
  space: "space-1" as Ref<Space>,
  name: "My Documents",
  description: "Test teamspace",
  archived: false,
  private: false,
  modifiedBy: "user-1" as PersonId,
  modifiedOn: 0,
  createdBy: "user-1" as PersonId,
  createdOn: 0,
  ...overrides
} as HulyTeamspace)

const makeDocument = (overrides?: Partial<HulyDocument>): HulyDocument => {
  const result: HulyDocument = {
    _id: "doc-1" as Ref<HulyDocument>,
    _class: documentPlugin.class.Document,
    space: "teamspace-1" as Ref<HulyTeamspace>,
    title: "Test Document",
    content: null,
    parent: documentPlugin.ids.NoParent,
    rank: "0|aaa",
    modifiedBy: "user-1" as PersonId,
    modifiedOn: 0,
    createdBy: "user-1" as PersonId,
    createdOn: 0,
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
  captureCreateDoc?: { attributes?: Record<string, unknown>; id?: string }
  captureUpdateDoc?: { operations?: Record<string, unknown> }
  captureUploadMarkup?: { markup?: string }
  captureUpdateMarkup?: { markup?: string }
  captureRemoveDoc?: { id?: string }
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
      let filtered = documents.filter(d => d.space === q.space)
      // Apply sorting if specified
      const opts = options as { sort?: Record<string, number> } | undefined
      if (opts?.sort?.modifiedOn !== undefined) {
        const direction = opts.sort.modifiedOn
        filtered = filtered.sort((a, b) => direction * (a.modifiedOn - b.modifiedOn))
      }
      if (opts?.sort?.rank !== undefined) {
        const direction = opts.sort.rank
        filtered = filtered.sort((a, b) => direction * a.rank.localeCompare(b.rank))
      }
      return Effect.succeed(toFindResult(filtered as Array<Doc>))
    }
    return Effect.succeed(toFindResult([]))
  }) as HulyClientOperations["findAll"]

  const findOneImpl: HulyClientOperations["findOne"] = ((_class: unknown, query: unknown) => {
    if (_class === documentPlugin.class.Teamspace) {
      const q = query as Record<string, unknown>
      // Find by name or ID, respecting archived filter
      const found = teamspaces.find(ts => {
        if (q.archived !== undefined && ts.archived !== q.archived) return false
        return (q.name && ts.name === q.name)
          || (q._id && ts._id === q._id)
      })
      return Effect.succeed(found)
    }
    if (_class === documentPlugin.class.Document) {
      const q = query as Record<string, unknown>
      // Find by title, ID, or space (for rank queries)
      const found = documents.find(d =>
        (q.space && q.title && d.space === q.space && d.title === q.title)
        || (q.space && q._id && d.space === q.space && d._id === q._id)
        || (q.space && !q.title && !q._id && d.space === q.space)
      )
      return Effect.succeed(found)
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

  const createDocImpl: HulyClientOperations["createDoc"] = ((
    _class: unknown,
    _space: unknown,
    attributes: unknown,
    id?: unknown
  ) => {
    if (config.captureCreateDoc) {
      config.captureCreateDoc.attributes = attributes as Record<string, unknown>
      config.captureCreateDoc.id = id as string
    }
    return Effect.succeed((id ?? "new-doc-id") as Ref<Doc>)
  }) as HulyClientOperations["createDoc"]

  const updateDocImpl: HulyClientOperations["updateDoc"] = (
    (_class: unknown, _space: unknown, _objectId: unknown, operations: unknown) => {
      if (config.captureUpdateDoc) {
        config.captureUpdateDoc.operations = operations as Record<string, unknown>
      }
      return Effect.succeed({} as never)
    }
  ) as HulyClientOperations["updateDoc"]

  // eslint-disable-next-line no-restricted-syntax -- mock function signature (unknown params) doesn't overlap with typed signature
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
  }) as unknown as HulyClientOperations["uploadMarkup"]

  // eslint-disable-next-line no-restricted-syntax -- mock function signature (unknown params) doesn't overlap with typed signature
  const updateMarkupImpl: HulyClientOperations["updateMarkup"] = ((
    _objectClass: unknown,
    _objectId: unknown,
    _objectAttr: unknown,
    markup: unknown
  ) => {
    if (config.captureUpdateMarkup) {
      config.captureUpdateMarkup.markup = markup as string
    }
    return Effect.succeed(undefined)
  }) as unknown as HulyClientOperations["updateMarkup"]

  const removeDocImpl: HulyClientOperations["removeDoc"] = ((
    _class: unknown,
    _space: unknown,
    objectId: unknown
  ) => {
    if (config.captureRemoveDoc) {
      config.captureRemoveDoc.id = objectId as string
    }
    return Effect.succeed({})
  }) as HulyClientOperations["removeDoc"]

  return HulyClient.testLayer({
    findAll: findAllImpl,
    findOne: findOneImpl,
    fetchMarkup: fetchMarkupImpl,
    createDoc: createDocImpl,
    updateDoc: updateDocImpl,
    uploadMarkup: uploadMarkupImpl,
    updateMarkup: updateMarkupImpl,
    removeDoc: removeDocImpl
  })
}

// --- Tests ---

describe("listTeamspaces", () => {
  describe("basic functionality", () => {
    // test-revizorro: approved
    it.effect("returns teamspaces", () =>
      Effect.gen(function*() {
        const teamspaces = [
          makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "Alpha" }),
          makeTeamspace({ _id: "ts-2" as Ref<HulyTeamspace>, name: "Beta" })
        ]

        const testLayer = createTestLayerWithMocks({ teamspaces })

        const result = yield* listTeamspaces({}).pipe(Effect.provide(testLayer))

        expect(result.teamspaces).toHaveLength(2)
        expect(result.total).toBe(2)
      }))

    // test-revizorro: approved
    it.effect("filters out archived teamspaces by default", () =>
      Effect.gen(function*() {
        const teamspaces = [
          makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "Active", archived: false }),
          makeTeamspace({ _id: "ts-2" as Ref<HulyTeamspace>, name: "Archived", archived: true })
        ]

        const testLayer = createTestLayerWithMocks({ teamspaces })

        const result = yield* listTeamspaces({}).pipe(Effect.provide(testLayer))

        expect(result.teamspaces).toHaveLength(1)
        expect(result.teamspaces[0].name).toBe("Active")
      }))

    // test-revizorro: approved
    it.effect("includes archived when includeArchived=true", () =>
      Effect.gen(function*() {
        const teamspaces = [
          makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "Active", archived: false }),
          makeTeamspace({ _id: "ts-2" as Ref<HulyTeamspace>, name: "Archived", archived: true })
        ]

        const testLayer = createTestLayerWithMocks({ teamspaces })

        const result = yield* listTeamspaces({ includeArchived: true }).pipe(Effect.provide(testLayer))

        expect(result.teamspaces).toHaveLength(2)
      }))
  })
})

describe("listDocuments", () => {
  describe("basic functionality", () => {
    // test-revizorro: approved
    it.effect("returns documents for a teamspace", () =>
      Effect.gen(function*() {
        const teamspace = makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "My Docs" })
        const documents = [
          makeDocument({
            _id: "doc-1" as Ref<HulyDocument>,
            title: "Doc 1",
            space: "ts-1" as Ref<HulyTeamspace>,
            modifiedOn: 2000
          }),
          makeDocument({
            _id: "doc-2" as Ref<HulyDocument>,
            title: "Doc 2",
            space: "ts-1" as Ref<HulyTeamspace>,
            modifiedOn: 1000
          })
        ]

        const testLayer = createTestLayerWithMocks({ teamspaces: [teamspace], documents })

        const result = yield* listDocuments({ teamspace: teamspaceIdentifier("My Docs") }).pipe(
          Effect.provide(testLayer)
        )

        expect(result.documents).toHaveLength(2)
        // Sorted by modifiedOn descending
        expect(result.documents[0].title).toBe("Doc 1")
        expect(result.documents[1].title).toBe("Doc 2")
      }))

    // test-revizorro: approved
    it.effect("returns TeamspaceNotFoundError when teamspace doesn't exist", () =>
      Effect.gen(function*() {
        const testLayer = createTestLayerWithMocks({ teamspaces: [], documents: [] })

        const error = yield* Effect.flip(
          listDocuments({ teamspace: teamspaceIdentifier("Nonexistent") }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("TeamspaceNotFoundError")
        expect((error as TeamspaceNotFoundError).identifier).toBe("Nonexistent")
      }))

    // test-revizorro: approved
    it.effect("finds teamspace by ID", () =>
      Effect.gen(function*() {
        const teamspace = makeTeamspace({ _id: "ts-123" as Ref<HulyTeamspace>, name: "My Docs" })
        const documents = [
          makeDocument({ _id: "doc-1" as Ref<HulyDocument>, title: "Doc 1", space: "ts-123" as Ref<HulyTeamspace> })
        ]

        const testLayer = createTestLayerWithMocks({ teamspaces: [teamspace], documents })

        // Search by ID instead of name
        const result = yield* listDocuments({ teamspace: teamspaceIdentifier("ts-123") }).pipe(
          Effect.provide(testLayer)
        )

        expect(result.documents).toHaveLength(1)
        expect(result.documents[0].teamspace).toBe("My Docs")
      }))
  })

  describe("limit handling", () => {
    // test-revizorro: approved
    it.effect("uses default limit of 50", () =>
      Effect.gen(function*() {
        const teamspace = makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "My Docs" })
        const captureQuery: MockConfig["captureDocumentQuery"] = {}

        const testLayer = createTestLayerWithMocks({
          teamspaces: [teamspace],
          documents: [],
          captureDocumentQuery: captureQuery
        })

        yield* listDocuments({ teamspace: teamspaceIdentifier("My Docs") }).pipe(Effect.provide(testLayer))

        expect(captureQuery.options?.limit).toBe(50)
      }))

    // test-revizorro: approved
    it.effect("enforces max limit of 200", () =>
      Effect.gen(function*() {
        const teamspace = makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "My Docs" })
        const captureQuery: MockConfig["captureDocumentQuery"] = {}

        const testLayer = createTestLayerWithMocks({
          teamspaces: [teamspace],
          documents: [],
          captureDocumentQuery: captureQuery
        })

        yield* listDocuments({ teamspace: teamspaceIdentifier("My Docs"), limit: 500 }).pipe(Effect.provide(testLayer))

        expect(captureQuery.options?.limit).toBe(200)
      }))
  })
})

describe("getDocument", () => {
  describe("basic functionality", () => {
    // test-revizorro: approved
    it.effect("returns document with full content", () =>
      Effect.gen(function*() {
        const teamspace = makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "My Docs" })
        const doc = makeDocument({
          _id: "doc-1" as Ref<HulyDocument>,
          title: "Test Doc",
          space: "ts-1" as Ref<HulyTeamspace>,
          content: "markup-id-123" as MarkupBlobRef
        })

        const testLayer = createTestLayerWithMocks({
          teamspaces: [teamspace],
          documents: [doc],
          markupContent: { "markup-id-123": "# Hello World" }
        })

        const result = yield* getDocument({
          teamspace: teamspaceIdentifier("My Docs"),
          document: documentIdentifier("Test Doc")
        }).pipe(
          Effect.provide(testLayer)
        )

        expect(result.id).toBe("doc-1")
        expect(result.title).toBe("Test Doc")
        expect(result.content).toBe("# Hello World")
        expect(result.teamspace).toBe("My Docs")
      }))

    // test-revizorro: approved
    it.effect("finds document by ID", () =>
      Effect.gen(function*() {
        const teamspace = makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "My Docs" })
        const doc = makeDocument({
          _id: "doc-1" as Ref<HulyDocument>,
          title: "Test Doc",
          space: "ts-1" as Ref<HulyTeamspace>
        })

        const testLayer = createTestLayerWithMocks({
          teamspaces: [teamspace],
          documents: [doc]
        })

        const result = yield* getDocument({
          teamspace: teamspaceIdentifier("My Docs"),
          document: documentIdentifier("doc-1")
        }).pipe(Effect.provide(testLayer))

        expect(result.id).toBe("doc-1")
      }))

    // test-revizorro: approved
    it.effect("returns undefined content when not set", () =>
      Effect.gen(function*() {
        const teamspace = makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "My Docs" })
        const doc = makeDocument({
          _id: "doc-1" as Ref<HulyDocument>,
          title: "Empty Doc",
          space: "ts-1" as Ref<HulyTeamspace>,
          content: null
        })

        const testLayer = createTestLayerWithMocks({
          teamspaces: [teamspace],
          documents: [doc]
        })

        const result = yield* getDocument({
          teamspace: teamspaceIdentifier("My Docs"),
          document: documentIdentifier("Empty Doc")
        }).pipe(
          Effect.provide(testLayer)
        )

        expect(result.content).toBeUndefined()
      }))
  })

  describe("error handling", () => {
    // test-revizorro: approved
    it.effect("returns TeamspaceNotFoundError when teamspace doesn't exist", () =>
      Effect.gen(function*() {
        const testLayer = createTestLayerWithMocks({ teamspaces: [], documents: [] })

        const error = yield* Effect.flip(
          getDocument({ teamspace: teamspaceIdentifier("Nonexistent"), document: documentIdentifier("Doc") }).pipe(
            Effect.provide(testLayer)
          )
        )

        expect(error._tag).toBe("TeamspaceNotFoundError")
      }))

    // test-revizorro: approved
    it.effect("returns DocumentNotFoundError when document doesn't exist", () =>
      Effect.gen(function*() {
        const teamspace = makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "My Docs" })

        const testLayer = createTestLayerWithMocks({ teamspaces: [teamspace], documents: [] })

        const error = yield* Effect.flip(
          getDocument({ teamspace: teamspaceIdentifier("My Docs"), document: documentIdentifier("Nonexistent") }).pipe(
            Effect.provide(testLayer)
          )
        )

        expect(error._tag).toBe("DocumentNotFoundError")
        expect((error as DocumentNotFoundError).identifier).toBe("Nonexistent")
        expect((error as DocumentNotFoundError).teamspace).toBe("My Docs")
      }))
  })
})

describe("createDocument", () => {
  describe("basic functionality", () => {
    // test-revizorro: approved
    it.effect("creates document with minimal parameters", () =>
      Effect.gen(function*() {
        const teamspace = makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "My Docs" })
        const captureCreateDoc: MockConfig["captureCreateDoc"] = {}

        const testLayer = createTestLayerWithMocks({
          teamspaces: [teamspace],
          documents: [],
          captureCreateDoc
        })

        const result = yield* createDocument({
          teamspace: teamspaceIdentifier("My Docs"),
          title: "New Document"
        }).pipe(Effect.provide(testLayer))

        expect(result.title).toBe("New Document")
        expect(result.id).toBeDefined()
        expect(captureCreateDoc.attributes?.title).toBe("New Document")
        expect(captureCreateDoc.attributes?.content).toBeNull()
      }))

    // test-revizorro: approved
    it.effect("creates document with content", () =>
      Effect.gen(function*() {
        const teamspace = makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "My Docs" })
        const captureCreateDoc: MockConfig["captureCreateDoc"] = {}
        const captureUploadMarkup: MockConfig["captureUploadMarkup"] = {}

        const testLayer = createTestLayerWithMocks({
          teamspaces: [teamspace],
          documents: [],
          captureCreateDoc,
          captureUploadMarkup
        })

        const result = yield* createDocument({
          teamspace: teamspaceIdentifier("My Docs"),
          title: "Doc with Content",
          content: "# Heading\n\nSome content here."
        }).pipe(Effect.provide(testLayer))

        expect(result.title).toBe("Doc with Content")
        expect(result.id).toBeDefined()
        expect(captureUploadMarkup.markup).toBe("# Heading\n\nSome content here.")
        expect(captureCreateDoc.attributes?.title).toBe("Doc with Content")
        // uploadMarkup was called (markup captured) and its return value flows into createDoc
        expect(captureCreateDoc.attributes?.content).not.toBeNull()
        expect(typeof captureCreateDoc.attributes?.content).toBe("string")
      }))

    // test-revizorro: approved
    it.effect("calculates rank for new document", () =>
      Effect.gen(function*() {
        const teamspace = makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "My Docs" })
        const existingDocRank = "0|hzzzzz:"
        const existingDoc = makeDocument({
          space: "ts-1" as Ref<HulyTeamspace>,
          rank: existingDocRank
        })
        const captureCreateDoc: MockConfig["captureCreateDoc"] = {}

        const testLayer = createTestLayerWithMocks({
          teamspaces: [teamspace],
          documents: [existingDoc],
          captureCreateDoc
        })

        yield* createDocument({
          teamspace: teamspaceIdentifier("My Docs"),
          title: "New Document"
        }).pipe(Effect.provide(testLayer))

        const newRank = captureCreateDoc.attributes?.rank as string
        expect(newRank).toBeDefined()
        expect(typeof newRank).toBe("string")
        expect(newRank > existingDocRank).toBe(true)
      }))

    // test-revizorro: approved
    it.effect("skips upload for empty content", () =>
      Effect.gen(function*() {
        const teamspace = makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "My Docs" })
        const captureCreateDoc: MockConfig["captureCreateDoc"] = {}
        const captureUploadMarkup: MockConfig["captureUploadMarkup"] = {}

        const testLayer = createTestLayerWithMocks({
          teamspaces: [teamspace],
          documents: [],
          captureCreateDoc,
          captureUploadMarkup
        })

        yield* createDocument({
          teamspace: teamspaceIdentifier("My Docs"),
          title: "Empty Content Doc",
          content: "   "
        }).pipe(Effect.provide(testLayer))

        expect(captureUploadMarkup.markup).toBeUndefined()
        expect(captureCreateDoc.attributes?.content).toBeNull()
      }))
  })

  describe("nested documents (parent parameter)", () => {
    // test-revizorro: approved
    it.effect("creates document under parent found by title", () =>
      Effect.gen(function*() {
        const teamspace = makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "My Docs" })
        const parentDoc = makeDocument({
          _id: "parent-1" as Ref<HulyDocument>,
          space: "ts-1" as Ref<HulyTeamspace>,
          title: "Architecture"
        })
        const captureCreateDoc: MockConfig["captureCreateDoc"] = {}

        const testLayer = createTestLayerWithMocks({
          teamspaces: [teamspace],
          documents: [parentDoc],
          captureCreateDoc
        })

        const result = yield* createDocument({
          teamspace: teamspaceIdentifier("My Docs"),
          title: "API Design",
          parent: "Architecture"
        }).pipe(Effect.provide(testLayer))

        expect(result.title).toBe("API Design")
        expect(captureCreateDoc.attributes?.parent).toBe("parent-1")
      }))

    // test-revizorro: approved
    it.effect("creates document under parent found by ID", () =>
      Effect.gen(function*() {
        const teamspace = makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "My Docs" })
        const parentDoc = makeDocument({
          _id: "parent-1" as Ref<HulyDocument>,
          space: "ts-1" as Ref<HulyTeamspace>,
          title: "Architecture"
        })
        const captureCreateDoc: MockConfig["captureCreateDoc"] = {}

        const testLayer = createTestLayerWithMocks({
          teamspaces: [teamspace],
          documents: [parentDoc],
          captureCreateDoc
        })

        const result = yield* createDocument({
          teamspace: teamspaceIdentifier("My Docs"),
          title: "API Design",
          parent: "parent-1"
        }).pipe(Effect.provide(testLayer))

        expect(result.title).toBe("API Design")
        expect(captureCreateDoc.attributes?.parent).toBe("parent-1")
      }))

    // test-revizorro: approved
    it.effect("creates top-level document when parent is omitted", () =>
      Effect.gen(function*() {
        const teamspace = makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "My Docs" })
        const captureCreateDoc: MockConfig["captureCreateDoc"] = {}

        const testLayer = createTestLayerWithMocks({
          teamspaces: [teamspace],
          documents: [],
          captureCreateDoc
        })

        const result = yield* createDocument({
          teamspace: teamspaceIdentifier("My Docs"),
          title: "Top Level Doc"
        }).pipe(Effect.provide(testLayer))

        expect(result.title).toBe("Top Level Doc")
        expect(captureCreateDoc.attributes?.parent).toBe(documentPlugin.ids.NoParent)
      }))

    // test-revizorro: approved
    it.effect("returns DocumentNotFoundError when parent does not exist", () =>
      Effect.gen(function*() {
        const teamspace = makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "My Docs" })

        const testLayer = createTestLayerWithMocks({
          teamspaces: [teamspace],
          documents: []
        })

        const error = yield* Effect.flip(
          createDocument({
            teamspace: teamspaceIdentifier("My Docs"),
            title: "Orphan Doc",
            parent: "Nonexistent Parent"
          }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("DocumentNotFoundError")
        expect((error as DocumentNotFoundError).identifier).toBe("Nonexistent Parent")
      }))
  })

  describe("error handling", () => {
    // test-revizorro: approved
    it.effect("returns TeamspaceNotFoundError when teamspace doesn't exist", () =>
      Effect.gen(function*() {
        const testLayer = createTestLayerWithMocks({ teamspaces: [], documents: [] })

        const error = yield* Effect.flip(
          createDocument({
            teamspace: teamspaceIdentifier("Nonexistent"),
            title: "Test Doc"
          }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("TeamspaceNotFoundError")
        expect((error as TeamspaceNotFoundError).identifier).toBe("Nonexistent")
      }))
  })
})

describe("editDocument", () => {
  describe("full replace mode", () => {
    it.effect("updates document title", () =>
      Effect.gen(function*() {
        const teamspace = makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "My Docs" })
        const doc = makeDocument({
          _id: "doc-1" as Ref<HulyDocument>,
          title: "Old Title",
          space: "ts-1" as Ref<HulyTeamspace>
        })
        const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}

        const testLayer = createTestLayerWithMocks({
          teamspaces: [teamspace],
          documents: [doc],
          captureUpdateDoc
        })

        const result = yield* editDocument({
          teamspace: teamspaceIdentifier("My Docs"),
          document: documentIdentifier("Old Title"),
          title: "New Title"
        }).pipe(Effect.provide(testLayer))

        expect(result.id).toBe("doc-1")
        expect(result.updated).toBe(true)
        expect(captureUpdateDoc.operations?.title).toBe("New Title")
      }))

    it.effect("replaces full document content", () =>
      Effect.gen(function*() {
        const teamspace = makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "My Docs" })
        const doc = makeDocument({
          _id: "doc-1" as Ref<HulyDocument>,
          title: "Test Doc",
          space: "ts-1" as Ref<HulyTeamspace>
        })
        const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}
        const captureUploadMarkup: MockConfig["captureUploadMarkup"] = {}

        const testLayer = createTestLayerWithMocks({
          teamspaces: [teamspace],
          documents: [doc],
          captureUpdateDoc,
          captureUploadMarkup
        })

        yield* editDocument({
          teamspace: teamspaceIdentifier("My Docs"),
          document: documentIdentifier("Test Doc"),
          content: "# Updated Content"
        }).pipe(Effect.provide(testLayer))

        expect(captureUploadMarkup.markup).toBe("# Updated Content")
        expect(captureUpdateDoc.operations?.content).toBe("markup-ref-123")
      }))

    it.effect("clears content when empty string provided", () =>
      Effect.gen(function*() {
        const teamspace = makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "My Docs" })
        const doc = makeDocument({
          _id: "doc-1" as Ref<HulyDocument>,
          title: "Test Doc",
          space: "ts-1" as Ref<HulyTeamspace>,
          content: "markup-old" as MarkupBlobRef
        })
        const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}

        const testLayer = createTestLayerWithMocks({
          teamspaces: [teamspace],
          documents: [doc],
          captureUpdateDoc
        })

        yield* editDocument({
          teamspace: teamspaceIdentifier("My Docs"),
          document: documentIdentifier("Test Doc"),
          content: ""
        }).pipe(Effect.provide(testLayer))

        expect(captureUpdateDoc.operations?.content).toBeNull()
      }))

    it.effect("returns updated=false when no fields provided", () =>
      Effect.gen(function*() {
        const teamspace = makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "My Docs" })
        const doc = makeDocument({
          _id: "doc-1" as Ref<HulyDocument>,
          title: "Test Doc",
          space: "ts-1" as Ref<HulyTeamspace>
        })

        const testLayer = createTestLayerWithMocks({
          teamspaces: [teamspace],
          documents: [doc]
        })

        const result = yield* editDocument({
          teamspace: teamspaceIdentifier("My Docs"),
          document: documentIdentifier("Test Doc")
        }).pipe(Effect.provide(testLayer))

        expect(result.id).toBe("doc-1")
        expect(result.updated).toBe(false)
      }))

    it.effect("updates title and full content at once", () =>
      Effect.gen(function*() {
        const teamspace = makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "My Docs" })
        const doc = makeDocument({
          _id: "doc-1" as Ref<HulyDocument>,
          title: "Old Title",
          space: "ts-1" as Ref<HulyTeamspace>
        })
        const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}
        const captureUploadMarkup: MockConfig["captureUploadMarkup"] = {}

        const testLayer = createTestLayerWithMocks({
          teamspaces: [teamspace],
          documents: [doc],
          captureUpdateDoc,
          captureUploadMarkup
        })

        const result = yield* editDocument({
          teamspace: teamspaceIdentifier("My Docs"),
          document: documentIdentifier("Old Title"),
          title: "New Title",
          content: "New Content"
        }).pipe(Effect.provide(testLayer))

        expect(result.id).toBe("doc-1")
        expect(result.updated).toBe(true)
        expect(captureUploadMarkup.markup).toBe("New Content")
        expect(captureUpdateDoc.operations?.title).toBe("New Title")
        expect(captureUpdateDoc.operations?.content).toBeDefined()
      }))
  })

  describe("search-and-replace mode", () => {
    it.effect("replaces single occurrence", () =>
      Effect.gen(function*() {
        const teamspace = makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "My Docs" })
        const doc = makeDocument({
          _id: "doc-1" as Ref<HulyDocument>,
          title: "Test Doc",
          space: "ts-1" as Ref<HulyTeamspace>,
          content: "markup-id-1" as MarkupBlobRef
        })
        const captureUpdateMarkup: MockConfig["captureUpdateMarkup"] = {}

        const testLayer = createTestLayerWithMocks({
          teamspaces: [teamspace],
          documents: [doc],
          markupContent: { "markup-id-1": "Hello world, this is a test." },
          captureUpdateMarkup
        })

        const result = yield* editDocument({
          teamspace: teamspaceIdentifier("My Docs"),
          document: documentIdentifier("Test Doc"),
          old_text: "world",
          new_text: "universe"
        }).pipe(Effect.provide(testLayer))

        expect(result.updated).toBe(true)
        expect(captureUpdateMarkup.markup).toBe("Hello universe, this is a test.")
      }))

    it.effect("deletes text when new_text is empty", () =>
      Effect.gen(function*() {
        const teamspace = makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "My Docs" })
        const doc = makeDocument({
          _id: "doc-1" as Ref<HulyDocument>,
          title: "Test Doc",
          space: "ts-1" as Ref<HulyTeamspace>,
          content: "markup-id-1" as MarkupBlobRef
        })
        const captureUpdateMarkup: MockConfig["captureUpdateMarkup"] = {}

        const testLayer = createTestLayerWithMocks({
          teamspaces: [teamspace],
          documents: [doc],
          markupContent: { "markup-id-1": "Remove this section please." },
          captureUpdateMarkup
        })

        const result = yield* editDocument({
          teamspace: teamspaceIdentifier("My Docs"),
          document: documentIdentifier("Test Doc"),
          old_text: "this section ",
          new_text: ""
        }).pipe(Effect.provide(testLayer))

        expect(result.updated).toBe(true)
        expect(captureUpdateMarkup.markup).toBe("Remove please.")
      }))

    it.effect("replaces all occurrences when replace_all is true", () =>
      Effect.gen(function*() {
        const teamspace = makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "My Docs" })
        const doc = makeDocument({
          _id: "doc-1" as Ref<HulyDocument>,
          title: "Test Doc",
          space: "ts-1" as Ref<HulyTeamspace>,
          content: "markup-id-1" as MarkupBlobRef
        })
        const captureUpdateMarkup: MockConfig["captureUpdateMarkup"] = {}

        const testLayer = createTestLayerWithMocks({
          teamspaces: [teamspace],
          documents: [doc],
          markupContent: { "markup-id-1": "foo bar foo baz foo" },
          captureUpdateMarkup
        })

        const result = yield* editDocument({
          teamspace: teamspaceIdentifier("My Docs"),
          document: documentIdentifier("Test Doc"),
          old_text: "foo",
          new_text: "qux",
          replace_all: true
        }).pipe(Effect.provide(testLayer))

        expect(result.updated).toBe(true)
        expect(captureUpdateMarkup.markup).toBe("qux bar qux baz qux")
      }))

    it.effect("combines title rename with search-and-replace", () =>
      Effect.gen(function*() {
        const teamspace = makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "My Docs" })
        const doc = makeDocument({
          _id: "doc-1" as Ref<HulyDocument>,
          title: "Old Title",
          space: "ts-1" as Ref<HulyTeamspace>,
          content: "markup-id-1" as MarkupBlobRef
        })
        const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}
        const captureUpdateMarkup: MockConfig["captureUpdateMarkup"] = {}

        const testLayer = createTestLayerWithMocks({
          teamspaces: [teamspace],
          documents: [doc],
          markupContent: { "markup-id-1": "Some content here." },
          captureUpdateDoc,
          captureUpdateMarkup
        })

        const result = yield* editDocument({
          teamspace: teamspaceIdentifier("My Docs"),
          document: documentIdentifier("Old Title"),
          title: "New Title",
          old_text: "content",
          new_text: "text"
        }).pipe(Effect.provide(testLayer))

        expect(result.updated).toBe(true)
        expect(captureUpdateDoc.operations?.title).toBe("New Title")
        expect(captureUpdateMarkup.markup).toBe("Some text here.")
      }))
  })

  describe("search-and-replace errors", () => {
    it.effect("returns DocumentTextNotFoundError when old_text not found", () =>
      Effect.gen(function*() {
        const teamspace = makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "My Docs" })
        const doc = makeDocument({
          _id: "doc-1" as Ref<HulyDocument>,
          title: "Test Doc",
          space: "ts-1" as Ref<HulyTeamspace>,
          content: "markup-id-1" as MarkupBlobRef
        })

        const testLayer = createTestLayerWithMocks({
          teamspaces: [teamspace],
          documents: [doc],
          markupContent: { "markup-id-1": "Hello world." }
        })

        const error = yield* Effect.flip(
          editDocument({
            teamspace: teamspaceIdentifier("My Docs"),
            document: documentIdentifier("Test Doc"),
            old_text: "nonexistent text",
            new_text: "replacement"
          }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("DocumentTextNotFoundError")
        expect((error as DocumentTextNotFoundError).searchText).toBe("nonexistent text")
      }))

    it.effect("returns DocumentTextMultipleMatchesError when multiple matches without replace_all", () =>
      Effect.gen(function*() {
        const teamspace = makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "My Docs" })
        const doc = makeDocument({
          _id: "doc-1" as Ref<HulyDocument>,
          title: "Test Doc",
          space: "ts-1" as Ref<HulyTeamspace>,
          content: "markup-id-1" as MarkupBlobRef
        })

        const testLayer = createTestLayerWithMocks({
          teamspaces: [teamspace],
          documents: [doc],
          markupContent: { "markup-id-1": "foo bar foo baz foo" }
        })

        const error = yield* Effect.flip(
          editDocument({
            teamspace: teamspaceIdentifier("My Docs"),
            document: documentIdentifier("Test Doc"),
            old_text: "foo",
            new_text: "qux"
          }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("DocumentTextMultipleMatchesError")
        expect((error as DocumentTextMultipleMatchesError).matchCount).toBe(3)
        expect((error as DocumentTextMultipleMatchesError).searchText).toBe("foo")
      }))

    it.effect("returns DocumentEmptyContentError when document has no content", () =>
      Effect.gen(function*() {
        const teamspace = makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "My Docs" })
        const doc = makeDocument({
          _id: "doc-1" as Ref<HulyDocument>,
          title: "Empty Doc",
          space: "ts-1" as Ref<HulyTeamspace>,
          content: null
        })

        const testLayer = createTestLayerWithMocks({
          teamspaces: [teamspace],
          documents: [doc]
        })

        const error = yield* Effect.flip(
          editDocument({
            teamspace: teamspaceIdentifier("My Docs"),
            document: documentIdentifier("Empty Doc"),
            old_text: "anything",
            new_text: "replacement"
          }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("DocumentEmptyContentError")
        expect((error as DocumentEmptyContentError).identifier).toBe("Empty Doc")
      }))
  })

  describe("error handling", () => {
    it.effect("returns TeamspaceNotFoundError when teamspace doesn't exist", () =>
      Effect.gen(function*() {
        const testLayer = createTestLayerWithMocks({ teamspaces: [], documents: [] })

        const error = yield* Effect.flip(
          editDocument({
            teamspace: teamspaceIdentifier("Nonexistent"),
            document: documentIdentifier("Doc"),
            title: "New Title"
          }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("TeamspaceNotFoundError")
      }))

    it.effect("returns DocumentNotFoundError when document doesn't exist", () =>
      Effect.gen(function*() {
        const teamspace = makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "My Docs" })

        const testLayer = createTestLayerWithMocks({ teamspaces: [teamspace], documents: [] })

        const error = yield* Effect.flip(
          editDocument({
            teamspace: teamspaceIdentifier("My Docs"),
            document: documentIdentifier("Nonexistent"),
            title: "New Title"
          }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("DocumentNotFoundError")
        expect((error as DocumentNotFoundError).identifier).toBe("Nonexistent")
        expect((error as DocumentNotFoundError).teamspace).toBe("My Docs")
      }))
  })
})

describe("deleteDocument", () => {
  describe("basic functionality", () => {
    // test-revizorro: approved
    it.effect("deletes document", () =>
      Effect.gen(function*() {
        const teamspace = makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "My Docs" })
        const doc = makeDocument({
          _id: "doc-1" as Ref<HulyDocument>,
          title: "To Delete",
          space: "ts-1" as Ref<HulyTeamspace>
        })
        const captureRemoveDoc: MockConfig["captureRemoveDoc"] = {}

        const testLayer = createTestLayerWithMocks({
          teamspaces: [teamspace],
          documents: [doc],
          captureRemoveDoc
        })

        const result = yield* deleteDocument({
          teamspace: teamspaceIdentifier("My Docs"),
          document: documentIdentifier("To Delete")
        }).pipe(Effect.provide(testLayer))

        expect(result.id).toBe("doc-1")
        expect(result.deleted).toBe(true)
        expect(captureRemoveDoc.id).toBe("doc-1")
      }))

    // test-revizorro: approved
    it.effect("finds document by ID for deletion", () =>
      Effect.gen(function*() {
        const teamspace = makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "My Docs" })
        const doc = makeDocument({
          _id: "doc-123" as Ref<HulyDocument>,
          title: "Some Doc",
          space: "ts-1" as Ref<HulyTeamspace>
        })
        const captureRemoveDoc: MockConfig["captureRemoveDoc"] = {}

        const testLayer = createTestLayerWithMocks({
          teamspaces: [teamspace],
          documents: [doc],
          captureRemoveDoc
        })

        const result = yield* deleteDocument({
          teamspace: teamspaceIdentifier("My Docs"),
          document: documentIdentifier("doc-123")
        }).pipe(Effect.provide(testLayer))

        expect(result.id).toBe("doc-123")
        expect(result.deleted).toBe(true)
        expect(captureRemoveDoc.id).toBe("doc-123")
      }))
  })

  describe("error handling", () => {
    // test-revizorro: approved
    it.effect("returns TeamspaceNotFoundError when teamspace doesn't exist", () =>
      Effect.gen(function*() {
        const testLayer = createTestLayerWithMocks({ teamspaces: [], documents: [] })

        const error = yield* Effect.flip(
          deleteDocument({
            teamspace: teamspaceIdentifier("Nonexistent"),
            document: documentIdentifier("Doc")
          }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("TeamspaceNotFoundError")
      }))

    // test-revizorro: approved
    it.effect("returns DocumentNotFoundError when document doesn't exist", () =>
      Effect.gen(function*() {
        const teamspace = makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "My Docs" })

        const testLayer = createTestLayerWithMocks({ teamspaces: [teamspace], documents: [] })

        const error = yield* Effect.flip(
          deleteDocument({
            teamspace: teamspaceIdentifier("My Docs"),
            document: documentIdentifier("Nonexistent")
          }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("DocumentNotFoundError")
        expect((error as DocumentNotFoundError).identifier).toBe("Nonexistent")
        expect((error as DocumentNotFoundError).teamspace).toBe("My Docs")
      }))
  })
})

// --- Teamspace CRUD Tests ---

describe("getTeamspace", () => {
  it.effect("returns teamspace with document count", () =>
    Effect.gen(function*() {
      const teamspace = makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "My Docs", description: "Desc" })
      const documents = [
        makeDocument({ _id: "doc-1" as Ref<HulyDocument>, space: "ts-1" as Ref<HulyTeamspace> }),
        makeDocument({ _id: "doc-2" as Ref<HulyDocument>, space: "ts-1" as Ref<HulyTeamspace> })
      ]

      const testLayer = createTestLayerWithMocks({ teamspaces: [teamspace], documents })

      const result = yield* getTeamspace({ teamspace: teamspaceIdentifier("My Docs") }).pipe(
        Effect.provide(testLayer)
      )

      expect(result.id).toBe("ts-1")
      expect(result.name).toBe("My Docs")
      expect(result.description).toBe("Desc")
      expect(result.documents).toBe(2)
    }))

  it.effect("finds archived teamspaces", () =>
    Effect.gen(function*() {
      const teamspace = makeTeamspace({
        _id: "ts-1" as Ref<HulyTeamspace>,
        name: "Archived TS",
        archived: true
      })

      const testLayer = createTestLayerWithMocks({ teamspaces: [teamspace] })

      const result = yield* getTeamspace({ teamspace: teamspaceIdentifier("ts-1") }).pipe(
        Effect.provide(testLayer)
      )

      expect(result.archived).toBe(true)
    }))

  it.effect("returns TeamspaceNotFoundError when not found", () =>
    Effect.gen(function*() {
      const testLayer = createTestLayerWithMocks({})

      const error = yield* Effect.flip(
        getTeamspace({ teamspace: teamspaceIdentifier("Nonexistent") }).pipe(Effect.provide(testLayer))
      )

      expect(error._tag).toBe("TeamspaceNotFoundError")
    }))
})

describe("createTeamspace", () => {
  it.effect("creates teamspace with minimal params", () =>
    Effect.gen(function*() {
      const captureCreateDoc: MockConfig["captureCreateDoc"] = {}
      const testLayer = createTestLayerWithMocks({ captureCreateDoc })

      const result = yield* createTeamspace({ name: "New TS" }).pipe(Effect.provide(testLayer))

      expect(result.name).toBe("New TS")
      expect(result.created).toBe(true)
      expect(captureCreateDoc.attributes?.name).toBe("New TS")
      expect(captureCreateDoc.attributes?.archived).toBe(false)
      expect(captureCreateDoc.attributes?.private).toBe(false)
    }))

  it.effect("returns existing teamspace idempotently", () =>
    Effect.gen(function*() {
      const teamspace = makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "Existing" })
      const testLayer = createTestLayerWithMocks({ teamspaces: [teamspace] })

      const result = yield* createTeamspace({ name: "Existing" }).pipe(Effect.provide(testLayer))

      expect(result.id).toBe("ts-1")
      expect(result.created).toBe(false)
    }))

  it.effect("passes private and description", () =>
    Effect.gen(function*() {
      const captureCreateDoc: MockConfig["captureCreateDoc"] = {}
      const testLayer = createTestLayerWithMocks({ captureCreateDoc })

      yield* createTeamspace({
        name: "Private TS",
        description: "Secret",
        private: true
      }).pipe(Effect.provide(testLayer))

      expect(captureCreateDoc.attributes?.private).toBe(true)
      expect(captureCreateDoc.attributes?.description).toBe("Secret")
    }))
})

describe("updateTeamspace", () => {
  it.effect("updates name", () =>
    Effect.gen(function*() {
      const teamspace = makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "Old Name" })
      const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}
      const testLayer = createTestLayerWithMocks({ teamspaces: [teamspace], captureUpdateDoc })

      const result = yield* updateTeamspace({
        teamspace: teamspaceIdentifier("Old Name"),
        name: "New Name"
      }).pipe(Effect.provide(testLayer))

      expect(result.updated).toBe(true)
      expect(captureUpdateDoc.operations?.name).toBe("New Name")
    }))

  it.effect("clears description with null", () =>
    Effect.gen(function*() {
      const teamspace = makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "TS" })
      const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}
      const testLayer = createTestLayerWithMocks({ teamspaces: [teamspace], captureUpdateDoc })

      yield* updateTeamspace({
        teamspace: teamspaceIdentifier("TS"),
        description: null
      }).pipe(Effect.provide(testLayer))

      expect(captureUpdateDoc.operations?.description).toBe("")
    }))

  it.effect("sets archived status", () =>
    Effect.gen(function*() {
      const teamspace = makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "TS" })
      const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}
      const testLayer = createTestLayerWithMocks({ teamspaces: [teamspace], captureUpdateDoc })

      yield* updateTeamspace({
        teamspace: teamspaceIdentifier("TS"),
        archived: true
      }).pipe(Effect.provide(testLayer))

      expect(captureUpdateDoc.operations?.archived).toBe(true)
    }))

  it.effect("returns updated=false when no fields", () =>
    Effect.gen(function*() {
      const teamspace = makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "TS" })
      const testLayer = createTestLayerWithMocks({ teamspaces: [teamspace] })

      const result = yield* updateTeamspace({
        teamspace: teamspaceIdentifier("TS")
      }).pipe(Effect.provide(testLayer))

      expect(result.updated).toBe(false)
    }))

  it.effect("returns TeamspaceNotFoundError when not found", () =>
    Effect.gen(function*() {
      const testLayer = createTestLayerWithMocks({})

      const error = yield* Effect.flip(
        updateTeamspace({
          teamspace: teamspaceIdentifier("Nonexistent"),
          name: "X"
        }).pipe(Effect.provide(testLayer))
      )

      expect(error._tag).toBe("TeamspaceNotFoundError")
    }))
})

describe("deleteTeamspace", () => {
  it.effect("deletes teamspace", () =>
    Effect.gen(function*() {
      const teamspace = makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "To Delete" })
      const captureRemoveDoc: MockConfig["captureRemoveDoc"] = {}
      const testLayer = createTestLayerWithMocks({ teamspaces: [teamspace], captureRemoveDoc })

      const result = yield* deleteTeamspace({
        teamspace: teamspaceIdentifier("To Delete")
      }).pipe(Effect.provide(testLayer))

      expect(result.id).toBe("ts-1")
      expect(result.deleted).toBe(true)
      expect(captureRemoveDoc.id).toBe("ts-1")
    }))

  it.effect("returns TeamspaceNotFoundError when not found", () =>
    Effect.gen(function*() {
      const testLayer = createTestLayerWithMocks({})

      const error = yield* Effect.flip(
        deleteTeamspace({
          teamspace: teamspaceIdentifier("Nonexistent")
        }).pipe(Effect.provide(testLayer))
      )

      expect(error._tag).toBe("TeamspaceNotFoundError")
    }))
})
