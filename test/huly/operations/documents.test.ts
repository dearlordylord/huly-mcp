import { describe, it } from "@effect/vitest"
import { expect } from "vitest"
import { Effect } from "effect"
import {
  toFindResult,
  type Doc,
  type MarkupBlobRef,
  type Ref,
  type Space
} from "@hcengineering/core"
import type { Document as HulyDocument, Teamspace as HulyTeamspace } from "@hcengineering/document"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import { TeamspaceNotFoundError, DocumentNotFoundError } from "../../../src/huly/errors.js"
import {
  listTeamspaces,
  listDocuments,
  getDocument,
  createDocument,
  updateDocument,
  deleteDocument
} from "../../../src/huly/operations/documents.js"

// Import plugin objects at runtime (CommonJS modules)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const documentPlugin = require("@hcengineering/document").default as typeof import("@hcengineering/document").default

// --- Mock Data Builders ---

const makeTeamspace = (overrides?: Partial<HulyTeamspace>): HulyTeamspace =>
  ({
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
    ...overrides,
  }) as HulyTeamspace

const makeDocument = (overrides?: Partial<HulyDocument>): HulyDocument =>
  ({
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
    ...overrides,
  }) as HulyDocument

// --- Test Helpers ---

interface MockConfig {
  teamspaces?: HulyTeamspace[]
  documents?: HulyDocument[]
  markupContent?: Record<string, string>
  captureDocumentQuery?: { query?: Record<string, unknown>; options?: Record<string, unknown> }
  captureCreateDoc?: { attributes?: Record<string, unknown>; id?: string }
  captureUpdateDoc?: { operations?: Record<string, unknown> }
  captureUploadMarkup?: { markup?: string }
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
      return Effect.succeed(toFindResult(filtered as Doc[]))
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
      return Effect.succeed(toFindResult(filtered as Doc[]))
    }
    return Effect.succeed(toFindResult([]))
  }) as HulyClientOperations["findAll"]

  const findOneImpl: HulyClientOperations["findOne"] = ((_class: unknown, query: unknown) => {
    if (_class === documentPlugin.class.Teamspace) {
      const q = query as Record<string, unknown>
      // Find by name or ID
      const found = teamspaces.find(ts =>
        (q.name && ts.name === q.name) ||
        (q._id && ts._id === q._id)
      )
      return Effect.succeed(found as Doc | undefined)
    }
    if (_class === documentPlugin.class.Document) {
      const q = query as Record<string, unknown>
      // Find by title, ID, or space (for rank queries)
      const found = documents.find(d =>
        (q.space && q.title && d.space === q.space && d.title === q.title) ||
        (q.space && q._id && d.space === q.space && d._id === q._id) ||
        (q.space && !q.title && !q._id && d.space === q.space)
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const createDocImpl: any = (
    _class: unknown, _space: unknown, attributes: unknown, id?: unknown
  ) => {
    if (config.captureCreateDoc) {
      config.captureCreateDoc.attributes = attributes as Record<string, unknown>
      config.captureCreateDoc.id = id as string
    }
    return Effect.succeed((id ?? "new-doc-id") as Ref<Doc>)
  }

  const updateDocImpl: HulyClientOperations["updateDoc"] = (
    (_class: unknown, _space: unknown, _objectId: unknown, operations: unknown) => {
      if (config.captureUpdateDoc) {
        config.captureUpdateDoc.operations = operations as Record<string, unknown>
      }
      return Effect.succeed({} as never)
    }
  ) as HulyClientOperations["updateDoc"]

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const uploadMarkupImpl: any = (
    _objectClass: unknown, _objectId: unknown, _objectAttr: unknown, markup: unknown
  ) => {
    if (config.captureUploadMarkup) {
      config.captureUploadMarkup.markup = markup as string
    }
    return Effect.succeed("markup-ref-123")
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const removeDocImpl: any = (
    _class: unknown, _space: unknown, objectId: unknown
  ) => {
    if (config.captureRemoveDoc) {
      config.captureRemoveDoc.id = objectId as string
    }
    return Effect.succeed({})
  }

  return HulyClient.testLayer({
    findAll: findAllImpl,
    findOne: findOneImpl,
    fetchMarkup: fetchMarkupImpl,
    createDoc: createDocImpl,
    updateDoc: updateDocImpl,
    uploadMarkup: uploadMarkupImpl,
    removeDoc: removeDocImpl,
  })
}

// --- Tests ---

describe("listTeamspaces", () => {
  describe("basic functionality", () => {
    it.effect("returns teamspaces", () =>
      Effect.gen(function* () {
        const teamspaces = [
          makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "Alpha" }),
          makeTeamspace({ _id: "ts-2" as Ref<HulyTeamspace>, name: "Beta" }),
        ]

        const testLayer = createTestLayerWithMocks({ teamspaces })

        const result = yield* listTeamspaces({}).pipe(Effect.provide(testLayer))

        expect(result.teamspaces).toHaveLength(2)
        expect(result.total).toBe(2)
      })
    )

    it.effect("filters out archived teamspaces by default", () =>
      Effect.gen(function* () {
        const teamspaces = [
          makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "Active", archived: false }),
          makeTeamspace({ _id: "ts-2" as Ref<HulyTeamspace>, name: "Archived", archived: true }),
        ]

        const testLayer = createTestLayerWithMocks({ teamspaces })

        const result = yield* listTeamspaces({}).pipe(Effect.provide(testLayer))

        expect(result.teamspaces).toHaveLength(1)
        expect(result.teamspaces[0].name).toBe("Active")
      })
    )

    it.effect("includes archived when includeArchived=true", () =>
      Effect.gen(function* () {
        const teamspaces = [
          makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "Active", archived: false }),
          makeTeamspace({ _id: "ts-2" as Ref<HulyTeamspace>, name: "Archived", archived: true }),
        ]

        const testLayer = createTestLayerWithMocks({ teamspaces })

        const result = yield* listTeamspaces({ includeArchived: true }).pipe(Effect.provide(testLayer))

        expect(result.teamspaces).toHaveLength(2)
      })
    )
  })
})

describe("listDocuments", () => {
  describe("basic functionality", () => {
    it.effect("returns documents for a teamspace", () =>
      Effect.gen(function* () {
        const teamspace = makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "My Docs" })
        const documents = [
          makeDocument({ _id: "doc-1" as Ref<HulyDocument>, title: "Doc 1", space: "ts-1" as Ref<HulyTeamspace>, modifiedOn: 2000 }),
          makeDocument({ _id: "doc-2" as Ref<HulyDocument>, title: "Doc 2", space: "ts-1" as Ref<HulyTeamspace>, modifiedOn: 1000 }),
        ]

        const testLayer = createTestLayerWithMocks({ teamspaces: [teamspace], documents })

        const result = yield* listDocuments({ teamspace: "My Docs" }).pipe(Effect.provide(testLayer))

        expect(result.documents).toHaveLength(2)
        // Sorted by modifiedOn descending
        expect(result.documents[0].title).toBe("Doc 1")
        expect(result.documents[1].title).toBe("Doc 2")
      })
    )

    it.effect("returns TeamspaceNotFoundError when teamspace doesn't exist", () =>
      Effect.gen(function* () {
        const testLayer = createTestLayerWithMocks({ teamspaces: [], documents: [] })

        const error = yield* Effect.flip(
          listDocuments({ teamspace: "Nonexistent" }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("TeamspaceNotFoundError")
        expect((error as TeamspaceNotFoundError).identifier).toBe("Nonexistent")
      })
    )

    it.effect("finds teamspace by ID", () =>
      Effect.gen(function* () {
        const teamspace = makeTeamspace({ _id: "ts-123" as Ref<HulyTeamspace>, name: "My Docs" })
        const documents = [
          makeDocument({ _id: "doc-1" as Ref<HulyDocument>, title: "Doc 1", space: "ts-123" as Ref<HulyTeamspace> }),
        ]

        const testLayer = createTestLayerWithMocks({ teamspaces: [teamspace], documents })

        // Search by ID instead of name
        const result = yield* listDocuments({ teamspace: "ts-123" }).pipe(Effect.provide(testLayer))

        expect(result.documents).toHaveLength(1)
        expect(result.documents[0].teamspace).toBe("My Docs")
      })
    )
  })

  describe("limit handling", () => {
    it.effect("uses default limit of 50", () =>
      Effect.gen(function* () {
        const teamspace = makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "My Docs" })
        const captureQuery: MockConfig["captureDocumentQuery"] = {}

        const testLayer = createTestLayerWithMocks({
          teamspaces: [teamspace],
          documents: [],
          captureDocumentQuery: captureQuery,
        })

        yield* listDocuments({ teamspace: "My Docs" }).pipe(Effect.provide(testLayer))

        expect(captureQuery.options?.limit).toBe(50)
      })
    )

    it.effect("enforces max limit of 200", () =>
      Effect.gen(function* () {
        const teamspace = makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "My Docs" })
        const captureQuery: MockConfig["captureDocumentQuery"] = {}

        const testLayer = createTestLayerWithMocks({
          teamspaces: [teamspace],
          documents: [],
          captureDocumentQuery: captureQuery,
        })

        yield* listDocuments({ teamspace: "My Docs", limit: 500 }).pipe(Effect.provide(testLayer))

        expect(captureQuery.options?.limit).toBe(200)
      })
    )
  })
})

describe("getDocument", () => {
  describe("basic functionality", () => {
    it.effect("returns document with full content", () =>
      Effect.gen(function* () {
        const teamspace = makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "My Docs" })
        const doc = makeDocument({
          _id: "doc-1" as Ref<HulyDocument>,
          title: "Test Doc",
          space: "ts-1" as Ref<HulyTeamspace>,
          content: "markup-id-123" as MarkupBlobRef,
        })

        const testLayer = createTestLayerWithMocks({
          teamspaces: [teamspace],
          documents: [doc],
          markupContent: { "markup-id-123": "# Hello World" },
        })

        const result = yield* getDocument({ teamspace: "My Docs", document: "Test Doc" }).pipe(Effect.provide(testLayer))

        expect(result.id).toBe("doc-1")
        expect(result.title).toBe("Test Doc")
        expect(result.content).toBe("# Hello World")
        expect(result.teamspace).toBe("My Docs")
      })
    )

    it.effect("finds document by ID", () =>
      Effect.gen(function* () {
        const teamspace = makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "My Docs" })
        const doc = makeDocument({
          _id: "doc-1" as Ref<HulyDocument>,
          title: "Test Doc",
          space: "ts-1" as Ref<HulyTeamspace>,
        })

        const testLayer = createTestLayerWithMocks({
          teamspaces: [teamspace],
          documents: [doc],
        })

        const result = yield* getDocument({ teamspace: "My Docs", document: "doc-1" }).pipe(Effect.provide(testLayer))

        expect(result.id).toBe("doc-1")
      })
    )

    it.effect("returns undefined content when not set", () =>
      Effect.gen(function* () {
        const teamspace = makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "My Docs" })
        const doc = makeDocument({
          _id: "doc-1" as Ref<HulyDocument>,
          title: "Empty Doc",
          space: "ts-1" as Ref<HulyTeamspace>,
          content: null,
        })

        const testLayer = createTestLayerWithMocks({
          teamspaces: [teamspace],
          documents: [doc],
        })

        const result = yield* getDocument({ teamspace: "My Docs", document: "Empty Doc" }).pipe(Effect.provide(testLayer))

        expect(result.content).toBeUndefined()
      })
    )
  })

  describe("error handling", () => {
    it.effect("returns TeamspaceNotFoundError when teamspace doesn't exist", () =>
      Effect.gen(function* () {
        const testLayer = createTestLayerWithMocks({ teamspaces: [], documents: [] })

        const error = yield* Effect.flip(
          getDocument({ teamspace: "Nonexistent", document: "Doc" }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("TeamspaceNotFoundError")
      })
    )

    it.effect("returns DocumentNotFoundError when document doesn't exist", () =>
      Effect.gen(function* () {
        const teamspace = makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "My Docs" })

        const testLayer = createTestLayerWithMocks({ teamspaces: [teamspace], documents: [] })

        const error = yield* Effect.flip(
          getDocument({ teamspace: "My Docs", document: "Nonexistent" }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("DocumentNotFoundError")
        expect((error as DocumentNotFoundError).identifier).toBe("Nonexistent")
        expect((error as DocumentNotFoundError).teamspace).toBe("My Docs")
      })
    )
  })
})

describe("createDocument", () => {
  describe("basic functionality", () => {
    it.effect("creates document with minimal parameters", () =>
      Effect.gen(function* () {
        const teamspace = makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "My Docs" })
        const captureCreateDoc: MockConfig["captureCreateDoc"] = {}

        const testLayer = createTestLayerWithMocks({
          teamspaces: [teamspace],
          documents: [],
          captureCreateDoc,
        })

        const result = yield* createDocument({
          teamspace: "My Docs",
          title: "New Document",
        }).pipe(Effect.provide(testLayer))

        expect(result.title).toBe("New Document")
        expect(result.id).toBeDefined()
        expect(captureCreateDoc.attributes?.title).toBe("New Document")
        expect(captureCreateDoc.attributes?.content).toBeNull()
      })
    )

    it.effect("creates document with content", () =>
      Effect.gen(function* () {
        const teamspace = makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "My Docs" })
        const captureCreateDoc: MockConfig["captureCreateDoc"] = {}
        const captureUploadMarkup: MockConfig["captureUploadMarkup"] = {}

        const testLayer = createTestLayerWithMocks({
          teamspaces: [teamspace],
          documents: [],
          captureCreateDoc,
          captureUploadMarkup,
        })

        const result = yield* createDocument({
          teamspace: "My Docs",
          title: "Doc with Content",
          content: "# Heading\n\nSome content here.",
        }).pipe(Effect.provide(testLayer))

        expect(result.title).toBe("Doc with Content")
        expect(captureUploadMarkup.markup).toBe("# Heading\n\nSome content here.")
        expect(captureCreateDoc.attributes?.content).toBe("markup-ref-123")
      })
    )

    it.effect("calculates rank for new document", () =>
      Effect.gen(function* () {
        const teamspace = makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "My Docs" })
        const existingDoc = makeDocument({
          space: "ts-1" as Ref<HulyTeamspace>,
          rank: "0|hzzzzz:",
        })
        const captureCreateDoc: MockConfig["captureCreateDoc"] = {}

        const testLayer = createTestLayerWithMocks({
          teamspaces: [teamspace],
          documents: [existingDoc],
          captureCreateDoc,
        })

        yield* createDocument({
          teamspace: "My Docs",
          title: "New Document",
        }).pipe(Effect.provide(testLayer))

        expect(captureCreateDoc.attributes?.rank).toBeDefined()
        expect(typeof captureCreateDoc.attributes?.rank).toBe("string")
      })
    )

    it.effect("skips upload for empty content", () =>
      Effect.gen(function* () {
        const teamspace = makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "My Docs" })
        const captureCreateDoc: MockConfig["captureCreateDoc"] = {}
        const captureUploadMarkup: MockConfig["captureUploadMarkup"] = {}

        const testLayer = createTestLayerWithMocks({
          teamspaces: [teamspace],
          documents: [],
          captureCreateDoc,
          captureUploadMarkup,
        })

        yield* createDocument({
          teamspace: "My Docs",
          title: "Empty Content Doc",
          content: "   ",
        }).pipe(Effect.provide(testLayer))

        expect(captureUploadMarkup.markup).toBeUndefined()
        expect(captureCreateDoc.attributes?.content).toBeNull()
      })
    )
  })

  describe("error handling", () => {
    it.effect("returns TeamspaceNotFoundError when teamspace doesn't exist", () =>
      Effect.gen(function* () {
        const testLayer = createTestLayerWithMocks({ teamspaces: [], documents: [] })

        const error = yield* Effect.flip(
          createDocument({
            teamspace: "Nonexistent",
            title: "Test Doc",
          }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("TeamspaceNotFoundError")
        expect((error as TeamspaceNotFoundError).identifier).toBe("Nonexistent")
      })
    )
  })
})

describe("updateDocument", () => {
  describe("basic functionality", () => {
    it.effect("updates document title", () =>
      Effect.gen(function* () {
        const teamspace = makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "My Docs" })
        const doc = makeDocument({
          _id: "doc-1" as Ref<HulyDocument>,
          title: "Old Title",
          space: "ts-1" as Ref<HulyTeamspace>,
        })
        const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}

        const testLayer = createTestLayerWithMocks({
          teamspaces: [teamspace],
          documents: [doc],
          captureUpdateDoc,
        })

        const result = yield* updateDocument({
          teamspace: "My Docs",
          document: "Old Title",
          title: "New Title",
        }).pipe(Effect.provide(testLayer))

        expect(result.id).toBe("doc-1")
        expect(result.updated).toBe(true)
        expect(captureUpdateDoc.operations?.title).toBe("New Title")
      })
    )

    it.effect("updates document content", () =>
      Effect.gen(function* () {
        const teamspace = makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "My Docs" })
        const doc = makeDocument({
          _id: "doc-1" as Ref<HulyDocument>,
          title: "Test Doc",
          space: "ts-1" as Ref<HulyTeamspace>,
        })
        const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}
        const captureUploadMarkup: MockConfig["captureUploadMarkup"] = {}

        const testLayer = createTestLayerWithMocks({
          teamspaces: [teamspace],
          documents: [doc],
          captureUpdateDoc,
          captureUploadMarkup,
        })

        yield* updateDocument({
          teamspace: "My Docs",
          document: "Test Doc",
          content: "# Updated Content",
        }).pipe(Effect.provide(testLayer))

        expect(captureUploadMarkup.markup).toBe("# Updated Content")
        expect(captureUpdateDoc.operations?.content).toBe("markup-ref-123")
      })
    )

    it.effect("clears content when empty string provided", () =>
      Effect.gen(function* () {
        const teamspace = makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "My Docs" })
        const doc = makeDocument({
          _id: "doc-1" as Ref<HulyDocument>,
          title: "Test Doc",
          space: "ts-1" as Ref<HulyTeamspace>,
          content: "markup-old" as MarkupBlobRef,
        })
        const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}

        const testLayer = createTestLayerWithMocks({
          teamspaces: [teamspace],
          documents: [doc],
          captureUpdateDoc,
        })

        yield* updateDocument({
          teamspace: "My Docs",
          document: "Test Doc",
          content: "",
        }).pipe(Effect.provide(testLayer))

        expect(captureUpdateDoc.operations?.content).toBeNull()
      })
    )

    it.effect("returns updated=false when no fields provided", () =>
      Effect.gen(function* () {
        const teamspace = makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "My Docs" })
        const doc = makeDocument({
          _id: "doc-1" as Ref<HulyDocument>,
          title: "Test Doc",
          space: "ts-1" as Ref<HulyTeamspace>,
        })

        const testLayer = createTestLayerWithMocks({
          teamspaces: [teamspace],
          documents: [doc],
        })

        const result = yield* updateDocument({
          teamspace: "My Docs",
          document: "Test Doc",
        }).pipe(Effect.provide(testLayer))

        expect(result.id).toBe("doc-1")
        expect(result.updated).toBe(false)
      })
    )

    it.effect("updates multiple fields at once", () =>
      Effect.gen(function* () {
        const teamspace = makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "My Docs" })
        const doc = makeDocument({
          _id: "doc-1" as Ref<HulyDocument>,
          title: "Old Title",
          space: "ts-1" as Ref<HulyTeamspace>,
        })
        const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}
        const captureUploadMarkup: MockConfig["captureUploadMarkup"] = {}

        const testLayer = createTestLayerWithMocks({
          teamspaces: [teamspace],
          documents: [doc],
          captureUpdateDoc,
          captureUploadMarkup,
        })

        yield* updateDocument({
          teamspace: "My Docs",
          document: "Old Title",
          title: "New Title",
          content: "New Content",
        }).pipe(Effect.provide(testLayer))

        expect(captureUpdateDoc.operations?.title).toBe("New Title")
        expect(captureUpdateDoc.operations?.content).toBe("markup-ref-123")
      })
    )
  })

  describe("error handling", () => {
    it.effect("returns TeamspaceNotFoundError when teamspace doesn't exist", () =>
      Effect.gen(function* () {
        const testLayer = createTestLayerWithMocks({ teamspaces: [], documents: [] })

        const error = yield* Effect.flip(
          updateDocument({
            teamspace: "Nonexistent",
            document: "Doc",
            title: "New Title",
          }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("TeamspaceNotFoundError")
      })
    )

    it.effect("returns DocumentNotFoundError when document doesn't exist", () =>
      Effect.gen(function* () {
        const teamspace = makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "My Docs" })

        const testLayer = createTestLayerWithMocks({ teamspaces: [teamspace], documents: [] })

        const error = yield* Effect.flip(
          updateDocument({
            teamspace: "My Docs",
            document: "Nonexistent",
            title: "New Title",
          }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("DocumentNotFoundError")
        expect((error as DocumentNotFoundError).identifier).toBe("Nonexistent")
      })
    )
  })
})

describe("deleteDocument", () => {
  describe("basic functionality", () => {
    it.effect("deletes document", () =>
      Effect.gen(function* () {
        const teamspace = makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "My Docs" })
        const doc = makeDocument({
          _id: "doc-1" as Ref<HulyDocument>,
          title: "To Delete",
          space: "ts-1" as Ref<HulyTeamspace>,
        })
        const captureRemoveDoc: MockConfig["captureRemoveDoc"] = {}

        const testLayer = createTestLayerWithMocks({
          teamspaces: [teamspace],
          documents: [doc],
          captureRemoveDoc,
        })

        const result = yield* deleteDocument({
          teamspace: "My Docs",
          document: "To Delete",
        }).pipe(Effect.provide(testLayer))

        expect(result.id).toBe("doc-1")
        expect(result.deleted).toBe(true)
        expect(captureRemoveDoc.id).toBe("doc-1")
      })
    )

    it.effect("finds document by ID for deletion", () =>
      Effect.gen(function* () {
        const teamspace = makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "My Docs" })
        const doc = makeDocument({
          _id: "doc-123" as Ref<HulyDocument>,
          title: "Some Doc",
          space: "ts-1" as Ref<HulyTeamspace>,
        })
        const captureRemoveDoc: MockConfig["captureRemoveDoc"] = {}

        const testLayer = createTestLayerWithMocks({
          teamspaces: [teamspace],
          documents: [doc],
          captureRemoveDoc,
        })

        const result = yield* deleteDocument({
          teamspace: "My Docs",
          document: "doc-123",
        }).pipe(Effect.provide(testLayer))

        expect(result.id).toBe("doc-123")
        expect(result.deleted).toBe(true)
      })
    )
  })

  describe("error handling", () => {
    it.effect("returns TeamspaceNotFoundError when teamspace doesn't exist", () =>
      Effect.gen(function* () {
        const testLayer = createTestLayerWithMocks({ teamspaces: [], documents: [] })

        const error = yield* Effect.flip(
          deleteDocument({
            teamspace: "Nonexistent",
            document: "Doc",
          }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("TeamspaceNotFoundError")
      })
    )

    it.effect("returns DocumentNotFoundError when document doesn't exist", () =>
      Effect.gen(function* () {
        const teamspace = makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "My Docs" })

        const testLayer = createTestLayerWithMocks({ teamspaces: [teamspace], documents: [] })

        const error = yield* Effect.flip(
          deleteDocument({
            teamspace: "My Docs",
            document: "Nonexistent",
          }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("DocumentNotFoundError")
        expect((error as DocumentNotFoundError).identifier).toBe("Nonexistent")
        expect((error as DocumentNotFoundError).teamspace).toBe("My Docs")
      })
    )
  })
})
