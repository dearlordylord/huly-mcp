import { describe, it } from "@effect/vitest"
import type { Person as HulyPerson } from "@hcengineering/contact"
import {
  type Blob,
  type Doc,
  type MarkupBlobRef,
  type PersonId,
  type Ref,
  type Space,
  toFindResult
} from "@hcengineering/core"
import type { Document as HulyDocument, Teamspace as HulyTeamspace } from "@hcengineering/document"
import type { Issue as HulyIssue, Project as HulyProject } from "@hcengineering/tracker"
import { Effect, Schema } from "effect"
import { expect } from "vitest"

import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import {
  type DocumentContentCorruptedError,
  type DocumentEmptyContentError,
  type DocumentNotFoundError,
  type DocumentTextMultipleMatchesError,
  type DocumentTextNotFoundError,
  HulyConnectionError,
  type TeamspaceNotFoundError
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

import { contact, core, documentPlugin, tracker } from "../../../src/huly/huly-plugins.js"

// --- Mock Data Builders ---

const CapturedMarkupChildNodeSchema = Schema.Struct({
  type: Schema.optional(Schema.String),
  attrs: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.Unknown }))
})

const CapturedMarkupTreeSchema = Schema.Struct({
  content: Schema.optional(Schema.Array(Schema.Struct({
    content: Schema.optional(Schema.Array(CapturedMarkupChildNodeSchema))
  })))
})

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

const makeBlob = (overrides?: Partial<Blob>): Blob => ({
  _id: "blob-1" as Ref<Blob>,
  _class: core.class.Blob,
  space: "space-1" as Ref<Space>,
  provider: "test",
  contentType: "application/json",
  etag: "etag",
  version: null,
  size: 0,
  modifiedBy: "user-1" as PersonId,
  modifiedOn: 0,
  createdBy: "user-1" as PersonId,
  createdOn: 0,
  ...overrides
})

// --- Test Helpers ---

interface MockConfig {
  teamspaces?: Array<HulyTeamspace>
  documents?: Array<HulyDocument>
  blobs?: Array<Blob>
  projects?: Array<HulyProject>
  issues?: Array<HulyIssue>
  persons?: Array<HulyPerson>
  markupContent?: Record<string, string | undefined>
  fetchMarkupError?: HulyConnectionError
  captureDocumentQuery?: { query?: Record<string, unknown>; options?: Record<string, unknown> }
  captureCreateDoc?: { attributes?: Record<string, unknown>; id?: string }
  captureUpdateDoc?: { operations?: Record<string, unknown> }
  captureUploadMarkup?: { markup?: string; format?: string }
  captureUpdateMarkup?: { markup?: string; format?: string }
  captureRemoveDoc?: { id?: string }
}

const createTestLayerWithMocks = (config: MockConfig) => {
  const teamspaces = config.teamspaces ?? []
  const documents = config.documents ?? []
  const blobs = config.blobs ?? []
  const projects = config.projects ?? []
  const issues = config.issues ?? []
  const persons = config.persons ?? []

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
      if (typeof q.title === "string") {
        filtered = filtered.filter(d => d.title === q.title)
      }
      if (typeof q._id === "string") {
        filtered = filtered.filter(d => d._id === q._id)
      }
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
    if (_class === contact.class.Person) {
      const q = query as Record<string, unknown>
      const filtered = persons.filter(person => q.name === undefined || person.name === q.name)
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
    if (_class === core.class.Blob) {
      const q = query as Record<string, unknown>
      const found = blobs.find(blob => blob._id === q._id)
      return Effect.succeed(found)
    }
    if (_class === tracker.class.Project) {
      const q = query as Record<string, unknown>
      const found = projects.find(project => project.identifier === q.identifier || project._id === q._id)
      return Effect.succeed(found)
    }
    if (_class === tracker.class.Issue) {
      const q = query as Record<string, unknown>
      const found = issues.find(issue =>
        (q.space === undefined || issue.space === q.space)
        && (
          issue.identifier === q.identifier
          || issue._id === q._id
          || issue.number === q.number
        )
      )
      return Effect.succeed(found)
    }
    if (_class === contact.class.Person) {
      const q = query as Record<string, unknown>
      const found = persons.find(person =>
        person.name === q.name
        || person._id === q._id
      )
      return Effect.succeed(found)
    }
    return Effect.succeed(undefined)
  }) as HulyClientOperations["findOne"]

  const markupContent = config.markupContent ?? {}
  const fetchMarkupImpl: HulyClientOperations["fetchMarkup"] = (
    (_objectClass: unknown, _objectId: unknown, _objectAttr: unknown, id: unknown, format: unknown) => {
      if (config.fetchMarkupError !== undefined) {
        return Effect.fail(config.fetchMarkupError)
      }
      const idString = id as string
      const formatString = typeof format === "string" ? format : ""
      const content = markupContent[`${idString}:${formatString}`]
        ?? (formatString === "markup" ? JSON.stringify({ type: "doc", content: [] }) : markupContent[idString])
        ?? ""
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
    markup: unknown,
    format: unknown
  ) => {
    if (config.captureUploadMarkup) {
      config.captureUploadMarkup.markup = markup as string
      config.captureUploadMarkup.format = format as string
    }
    return Effect.succeed("markup-ref-123")
  }) as unknown as HulyClientOperations["uploadMarkup"]

  // eslint-disable-next-line no-restricted-syntax -- mock function signature (unknown params) doesn't overlap with typed signature
  const updateMarkupImpl: HulyClientOperations["updateMarkup"] = ((
    _objectClass: unknown,
    _objectId: unknown,
    _objectAttr: unknown,
    markup: unknown,
    format: unknown
  ) => {
    if (config.captureUpdateMarkup) {
      config.captureUpdateMarkup.markup = markup as string
      config.captureUpdateMarkup.format = format as string
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

const expectMarkupParagraphText = (markup: string | undefined, text: string): void => {
  expect(JSON.parse(markup ?? "{}")).toMatchObject({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }]
  })
}

// --- Tests ---

describe("listTeamspaces", () => {
  describe("basic functionality", () => {
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
    it.effect("returns TeamspaceNotFoundError when teamspace doesn't exist", () =>
      Effect.gen(function*() {
        const testLayer = createTestLayerWithMocks({ teamspaces: [], documents: [] })

        const error = yield* Effect.flip(
          listDocuments({ teamspace: teamspaceIdentifier("Nonexistent") }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("TeamspaceNotFoundError")
        expect((error as TeamspaceNotFoundError).identifier).toBe("Nonexistent")
      }))
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

  describe("titleRegex", () => {
    it.effect("applies titleRegex to the document query", () =>
      Effect.gen(function*() {
        const teamspace = makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "My Docs" })
        const captureQuery: MockConfig["captureDocumentQuery"] = {}

        const testLayer = createTestLayerWithMocks({
          teamspaces: [teamspace],
          documents: [],
          captureDocumentQuery: captureQuery
        })

        yield* listDocuments({ teamspace: teamspaceIdentifier("My Docs"), titleRegex: "^Spec" }).pipe(
          Effect.provide(testLayer)
        )

        expect(captureQuery.query?.title).toEqual({ $regex: "^Spec" })
      }))
  })
})

describe("getDocument", () => {
  describe("basic functionality", () => {
    it.effect("returns document with full content", () =>
      Effect.gen(function*() {
        const teamspace = makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "My Docs" })
        const doc = makeDocument({
          _id: "doc-1" as Ref<HulyDocument>,
          title: "Test Doc",
          space: "ts-1" as Ref<HulyTeamspace>,
          content: "doc-1-content-1700000000000" as MarkupBlobRef
        })

        const testLayer = createTestLayerWithMocks({
          teamspaces: [teamspace],
          documents: [doc],
          markupContent: { "doc-1-content-1700000000000": "# Hello World" }
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

    it.effect("preserves fetchMarkup failures as HulyConnectionError", () =>
      Effect.gen(function*() {
        const teamspace = makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "My Docs" })
        const doc = makeDocument({
          _id: "doc-1" as Ref<HulyDocument>,
          title: "Corrupted Doc",
          space: "ts-1" as Ref<HulyTeamspace>,
          content: "doc-1-content-1700000000000" as MarkupBlobRef
        })

        const testLayer = createTestLayerWithMocks({
          teamspaces: [teamspace],
          documents: [doc],
          fetchMarkupError: new HulyConnectionError({ message: "fetchMarkup failed: HTTP error 500" })
        })

        const error = yield* Effect.flip(
          getDocument({
            teamspace: teamspaceIdentifier("My Docs"),
            document: documentIdentifier("Corrupted Doc")
          }).pipe(Effect.provide(testLayer))
        )

        expect(error).toBeInstanceOf(HulyConnectionError)
        expect(error.message).toBe("fetchMarkup failed: HTTP error 500")
      }))

    it.effect("maps obvious raw markdown content refs to DocumentContentCorruptedError", () =>
      Effect.gen(function*() {
        const teamspace = makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "My Docs" })
        const doc = makeDocument({
          _id: "doc-1" as Ref<HulyDocument>,
          title: "Raw Doc",
          space: "ts-1" as Ref<HulyTeamspace>,
          content: "raw-markdown-that-is-not-a-blob-ref" as MarkupBlobRef
        })

        const testLayer = createTestLayerWithMocks({
          teamspaces: [teamspace],
          documents: [doc]
        })

        const error = yield* Effect.flip(
          getDocument({
            teamspace: teamspaceIdentifier("My Docs"),
            document: documentIdentifier("Raw Doc")
          }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("DocumentContentCorruptedError")
        expect((error as DocumentContentCorruptedError).causeMessage).toBe(
          "Document.content references a missing markup blob."
        )
      }))

    it.effect("maps empty content from a missing shaped blob to DocumentContentCorruptedError", () =>
      Effect.gen(function*() {
        const teamspace = makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "My Docs" })
        const doc = makeDocument({
          _id: "doc-1" as Ref<HulyDocument>,
          title: "Missing Blob Doc",
          space: "ts-1" as Ref<HulyTeamspace>,
          content: "doc-1-content-1700000000000" as MarkupBlobRef
        })

        const testLayer = createTestLayerWithMocks({
          teamspaces: [teamspace],
          documents: [doc],
          markupContent: { "doc-1-content-1700000000000": "" }
        })

        const error = yield* Effect.flip(
          getDocument({
            teamspace: teamspaceIdentifier("My Docs"),
            document: documentIdentifier("Missing Blob Doc")
          }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("DocumentContentCorruptedError")
        expect((error as DocumentContentCorruptedError).causeMessage).toBe(
          "Document.content references a missing markup blob."
        )
      }))

    it.effect("returns content from non-standard refs when Huly can read them", () =>
      Effect.gen(function*() {
        const teamspace = makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "My Docs" })
        const doc = makeDocument({
          _id: "doc-1" as Ref<HulyDocument>,
          title: "Legacy Doc",
          space: "ts-1" as Ref<HulyTeamspace>,
          content: "legacy-markup-ref" as MarkupBlobRef
        })

        const testLayer = createTestLayerWithMocks({
          teamspaces: [teamspace],
          documents: [doc],
          markupContent: { "legacy-markup-ref": "# Legacy Content" }
        })

        const result = yield* getDocument({
          teamspace: teamspaceIdentifier("My Docs"),
          document: documentIdentifier("Legacy Doc")
        }).pipe(Effect.provide(testLayer))

        expect(result.content).toBe("# Legacy Content")
      }))

    it.effect("returns empty content from non-standard refs when the blob exists", () =>
      Effect.gen(function*() {
        const teamspace = makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "My Docs" })
        const doc = makeDocument({
          _id: "doc-1" as Ref<HulyDocument>,
          title: "Empty Legacy Doc",
          space: "ts-1" as Ref<HulyTeamspace>,
          content: "legacy-content-ref" as MarkupBlobRef
        })
        const blob = makeBlob({ _id: "legacy-content-ref" as Ref<Blob> })

        const testLayer = createTestLayerWithMocks({
          teamspaces: [teamspace],
          documents: [doc],
          blobs: [blob],
          markupContent: { "legacy-content-ref": "" }
        })

        const result = yield* getDocument({
          teamspace: teamspaceIdentifier("My Docs"),
          document: documentIdentifier("Empty Legacy Doc")
        }).pipe(Effect.provide(testLayer))

        expect(result.content).toBe("")
      }))
  })

  describe("error handling", () => {
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
        expect(captureUploadMarkup.format).toBe("markup")
        expect(JSON.parse(captureUploadMarkup.markup ?? "{}")).toMatchObject({
          type: "doc",
          content: [
            { type: "heading", content: [{ type: "text", text: "Heading" }] },
            { type: "paragraph", content: [{ type: "text", text: "Some content here." }] }
          ]
        })
        expect(captureCreateDoc.attributes?.title).toBe("Doc with Content")
        expect(captureCreateDoc.attributes?.content).toBe("markup-ref-123")
        expect(captureCreateDoc.attributes?.content).not.toBe("# Heading\n\nSome content here.")
      }))

    it.effect("creates document content with canonical Huly native reference URLs", () =>
      Effect.gen(function*() {
        const teamspace = makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "My Docs" })
        const captureUploadMarkup: MockConfig["captureUploadMarkup"] = {}

        const testLayer = createTestLayerWithMocks({
          teamspaces: [teamspace],
          captureUploadMarkup
        })

        yield* createDocument({
          teamspace: teamspaceIdentifier("My Docs"),
          title: "Doc with Native Ref",
          content:
            "See [HULY-1](https://test.invalid/browse?workspace=test&_class=tracker%3Aclass%3AIssue&_id=issue-1&label=HULY-1%20First%20Issue) and [plain](https://example.com)."
        }).pipe(Effect.provide(testLayer))

        expect(captureUploadMarkup.format).toBe("markup")
        const parsedMarkup = Schema.decodeUnknownSync(CapturedMarkupTreeSchema)(
          JSON.parse(captureUploadMarkup.markup ?? "{}")
        )
        const reference = (parsedMarkup.content?.[0]?.content ?? []).find((node) => node.type === "reference")
        expect(reference).toMatchObject({
          type: "reference",
          attrs: {
            id: "issue-1",
            objectclass: "tracker:class:Issue",
            label: "HULY-1 First Issue"
          }
        })
      }))

    it.effect("fails malformed native Huly browse links before creating document", () =>
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

        const error = yield* Effect.flip(
          createDocument({
            teamspace: teamspaceIdentifier("My Docs"),
            title: "Broken Reference",
            content: "[bad](https://test.invalid/browse?workspace=test&_id=doc-1)"
          }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("DocumentReferenceError")
        if (error._tag === "DocumentReferenceError") {
          expect(error.reason).toBe(
            "malformed Huly native reference links in content: 'reference missing objectclass, label'"
          )
        }
        expect(captureUploadMarkup.markup).toBeUndefined()
        expect(captureCreateDoc.attributes).toBeUndefined()
      }))

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
          parent: documentIdentifier("Architecture")
        }).pipe(Effect.provide(testLayer))

        expect(result.title).toBe("API Design")
        expect(captureCreateDoc.attributes?.parent).toBe("parent-1")
      }))
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
          parent: documentIdentifier("parent-1")
        }).pipe(Effect.provide(testLayer))

        expect(result.title).toBe("API Design")
        expect(captureCreateDoc.attributes?.parent).toBe("parent-1")
      }))
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
            parent: documentIdentifier("Nonexistent Parent")
          }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("DocumentNotFoundError")
        expect((error as DocumentNotFoundError).identifier).toBe("Nonexistent Parent")
      }))
  })

  describe("error handling", () => {
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

        expect(captureUploadMarkup.format).toBe("markup")
        expect(JSON.parse(captureUploadMarkup.markup ?? "{}")).toMatchObject({
          type: "doc",
          content: [{ type: "heading", content: [{ type: "text", text: "Updated Content" }] }]
        })
        expect(captureUpdateDoc.operations?.content).toBe("markup-ref-123")
      }))

    it.effect("clears content when empty string provided", () =>
      Effect.gen(function*() {
        const teamspace = makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "My Docs" })
        const doc = makeDocument({
          _id: "doc-1" as Ref<HulyDocument>,
          title: "Test Doc",
          space: "ts-1" as Ref<HulyTeamspace>,
          content: "doc-1-content-1700000000000" as MarkupBlobRef
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

    it.effect("updates existing content through updateMarkup without writing raw markdown to updateDoc", () =>
      Effect.gen(function*() {
        const teamspace = makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "My Docs" })
        const doc = makeDocument({
          _id: "doc-1" as Ref<HulyDocument>,
          title: "Test Doc",
          space: "ts-1" as Ref<HulyTeamspace>,
          content: "doc-1-content-1700000000000" as MarkupBlobRef
        })
        const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}
        const captureUpdateMarkup: MockConfig["captureUpdateMarkup"] = {}

        const testLayer = createTestLayerWithMocks({
          teamspaces: [teamspace],
          documents: [doc],
          captureUpdateDoc,
          captureUpdateMarkup
        })

        yield* editDocument({
          teamspace: teamspaceIdentifier("My Docs"),
          document: documentIdentifier("Test Doc"),
          content: "# Updated Content"
        }).pipe(Effect.provide(testLayer))

        expect(captureUpdateMarkup.format).toBe("markup")
        expect(JSON.parse(captureUpdateMarkup.markup ?? "{}")).toMatchObject({
          type: "doc",
          content: [{ type: "heading", content: [{ type: "text", text: "Updated Content" }] }]
        })
        expect(captureUpdateDoc.operations?.content).toBeUndefined()
        expect(captureUpdateDoc.operations).toBeUndefined()
      }))

    it.effect("updates existing document content with canonical Huly native reference URLs", () =>
      Effect.gen(function*() {
        const teamspace = makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "My Docs" })
        const doc = makeDocument({
          _id: "doc-1" as Ref<HulyDocument>,
          title: "Test Doc",
          space: "ts-1" as Ref<HulyTeamspace>,
          content: "doc-1-content-1700000000000" as MarkupBlobRef
        })
        const captureUpdateMarkup: MockConfig["captureUpdateMarkup"] = {}

        const testLayer = createTestLayerWithMocks({
          teamspaces: [teamspace],
          documents: [doc],
          captureUpdateMarkup
        })

        yield* editDocument({
          teamspace: teamspaceIdentifier("My Docs"),
          document: documentIdentifier("Test Doc"),
          content:
            "Updated [HULY-1](https://test.invalid/browse?workspace=test&_class=tracker%3Aclass%3AIssue&_id=issue-1&label=HULY-1%20First%20Issue)"
        }).pipe(Effect.provide(testLayer))

        expect(captureUpdateMarkup.format).toBe("markup")
        const parsedMarkup = Schema.decodeUnknownSync(CapturedMarkupTreeSchema)(
          JSON.parse(captureUpdateMarkup.markup ?? "{}")
        )
        const reference = (parsedMarkup.content?.[0]?.content ?? []).find((node) => node.type === "reference")
        expect(reference).toMatchObject({
          type: "reference",
          attrs: {
            id: "issue-1",
            objectclass: "tracker:class:Issue",
            label: "HULY-1 First Issue"
          }
        })
      }))

    it.effect("fails malformed native Huly browse links before editing document content", () =>
      Effect.gen(function*() {
        const teamspace = makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "My Docs" })
        const doc = makeDocument({
          _id: "doc-1" as Ref<HulyDocument>,
          title: "Test Doc",
          space: "ts-1" as Ref<HulyTeamspace>,
          content: "doc-1-content-1700000000000" as MarkupBlobRef
        })
        const captureUpdateMarkup: MockConfig["captureUpdateMarkup"] = {}

        const testLayer = createTestLayerWithMocks({
          teamspaces: [teamspace],
          documents: [doc],
          captureUpdateMarkup
        })

        const error = yield* Effect.flip(
          editDocument({
            teamspace: teamspaceIdentifier("My Docs"),
            document: documentIdentifier("Test Doc"),
            content: "[bad](https://test.invalid/browse?workspace=test&_id=doc-1)"
          }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("DocumentReferenceError")
        if (error._tag === "DocumentReferenceError") {
          expect(error.reason).toBe(
            "malformed Huly native reference links in content: 'reference missing objectclass, label'"
          )
        }
        expect(captureUpdateMarkup.markup).toBeUndefined()
      }))

    it.effect("full replace repairs raw-corrupted document content through updateMarkup", () =>
      Effect.gen(function*() {
        const teamspace = makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "My Docs" })
        const doc = makeDocument({
          _id: "doc-1" as Ref<HulyDocument>,
          title: "Corrupted Doc",
          space: "ts-1" as Ref<HulyTeamspace>,
          content: "# Raw markdown stored in Document.content" as MarkupBlobRef
        })
        const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}
        const captureUpdateMarkup: MockConfig["captureUpdateMarkup"] = {}

        const testLayer = createTestLayerWithMocks({
          teamspaces: [teamspace],
          documents: [doc],
          captureUpdateDoc,
          captureUpdateMarkup
        })

        yield* editDocument({
          teamspace: teamspaceIdentifier("My Docs"),
          document: documentIdentifier("Corrupted Doc"),
          content: "# Repaired"
        }).pipe(Effect.provide(testLayer))

        expect(captureUpdateMarkup.format).toBe("markup")
        expect(JSON.parse(captureUpdateMarkup.markup ?? "{}")).toMatchObject({
          type: "doc",
          content: [{ type: "heading", content: [{ type: "text", text: "Repaired" }] }]
        })
        expect(captureUpdateDoc.operations?.content).toBeUndefined()
        expect(captureUpdateDoc.operations).toBeUndefined()
      }))

    it.effect("fails when no fields provided", () =>
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

        const error = yield* Effect.flip(
          editDocument({
            teamspace: teamspaceIdentifier("My Docs"),
            document: documentIdentifier("Test Doc")
          }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("NoUpdateFieldsError")
      }))

    it.effect("fails with invalid edit mode when only one search-and-replace field is provided", () =>
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

        const error = yield* Effect.flip(
          editDocument({
            teamspace: teamspaceIdentifier("My Docs"),
            document: documentIdentifier("Test Doc"),
            old_text: "old"
          }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("DocumentEditModeError")
        if (error._tag === "DocumentEditModeError") {
          expect(error.reason).toBe("old_text and new_text must be provided together")
        }
      }))

    it.effect("fails when full content and search-and-replace modes are combined", () =>
      Effect.gen(function*() {
        const teamspace = makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "My Docs" })
        const doc = makeDocument({
          _id: "doc-1" as Ref<HulyDocument>,
          title: "Test Doc",
          space: "ts-1" as Ref<HulyTeamspace>,
          content: "doc-1-content-1700000000000" as MarkupBlobRef
        })

        const testLayer = createTestLayerWithMocks({
          teamspaces: [teamspace],
          documents: [doc],
          markupContent: { "doc-1-content-1700000000000": "old content" }
        })

        const error = yield* Effect.flip(
          editDocument({
            teamspace: teamspaceIdentifier("My Docs"),
            document: documentIdentifier("Test Doc"),
            content: "replacement content",
            old_text: "old",
            new_text: "new"
          }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("DocumentEditModeError")
        if (error._tag === "DocumentEditModeError") {
          expect(error.reason).toBe("content cannot be combined with old_text or new_text")
        }
      }))

    it.effect("fails when replace_all is provided outside search-and-replace mode", () =>
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

        const error = yield* Effect.flip(
          editDocument({
            teamspace: teamspaceIdentifier("My Docs"),
            document: documentIdentifier("Test Doc"),
            title: "New Title",
            replace_all: true
          }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("DocumentEditModeError")
        if (error._tag === "DocumentEditModeError") {
          expect(error.reason).toBe("replace_all requires both old_text and new_text")
        }
      }))

    it.effect("fails before content lookup when old_text is empty", () =>
      Effect.gen(function*() {
        const teamspace = makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "My Docs" })
        const doc = makeDocument({
          _id: "doc-1" as Ref<HulyDocument>,
          title: "Test Doc",
          space: "ts-1" as Ref<HulyTeamspace>,
          content: "doc-1-content-1700000000000" as MarkupBlobRef
        })

        const testLayer = createTestLayerWithMocks({
          teamspaces: [teamspace],
          documents: [doc],
          markupContent: { "doc-1-content-1700000000000": "content" }
        })

        const error = yield* Effect.flip(
          editDocument({
            teamspace: teamspaceIdentifier("My Docs"),
            document: documentIdentifier("Test Doc"),
            old_text: "",
            new_text: "replacement"
          }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("DocumentEditModeError")
        if (error._tag === "DocumentEditModeError") {
          expect(error.reason).toBe("old_text must be non-empty")
        }
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
        expect(captureUploadMarkup.format).toBe("markup")
        expect(JSON.parse(captureUploadMarkup.markup ?? "{}")).toMatchObject({
          type: "doc",
          content: [{ type: "paragraph", content: [{ type: "text", text: "New Content" }] }]
        })
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
          content: "doc-1-content-1700000000000" as MarkupBlobRef
        })
        const captureUpdateMarkup: MockConfig["captureUpdateMarkup"] = {}

        const testLayer = createTestLayerWithMocks({
          teamspaces: [teamspace],
          documents: [doc],
          markupContent: { "doc-1-content-1700000000000": "Hello world, this is a test." },
          captureUpdateMarkup
        })

        const result = yield* editDocument({
          teamspace: teamspaceIdentifier("My Docs"),
          document: documentIdentifier("Test Doc"),
          old_text: "world",
          new_text: "universe"
        }).pipe(Effect.provide(testLayer))

        expect(result.updated).toBe(true)
        expect(captureUpdateMarkup.format).toBe("markup")
        expectMarkupParagraphText(captureUpdateMarkup.markup, "Hello universe, this is a test.")
      }))

    it.effect("deletes text when new_text is empty", () =>
      Effect.gen(function*() {
        const teamspace = makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "My Docs" })
        const doc = makeDocument({
          _id: "doc-1" as Ref<HulyDocument>,
          title: "Test Doc",
          space: "ts-1" as Ref<HulyTeamspace>,
          content: "doc-1-content-1700000000000" as MarkupBlobRef
        })
        const captureUpdateMarkup: MockConfig["captureUpdateMarkup"] = {}

        const testLayer = createTestLayerWithMocks({
          teamspaces: [teamspace],
          documents: [doc],
          markupContent: { "doc-1-content-1700000000000": "Remove this section please." },
          captureUpdateMarkup
        })

        const result = yield* editDocument({
          teamspace: teamspaceIdentifier("My Docs"),
          document: documentIdentifier("Test Doc"),
          old_text: "this section ",
          new_text: ""
        }).pipe(Effect.provide(testLayer))

        expect(result.updated).toBe(true)
        expect(captureUpdateMarkup.format).toBe("markup")
        expectMarkupParagraphText(captureUpdateMarkup.markup, "Remove please.")
      }))

    it.effect("replaces all occurrences when replace_all is true", () =>
      Effect.gen(function*() {
        const teamspace = makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "My Docs" })
        const doc = makeDocument({
          _id: "doc-1" as Ref<HulyDocument>,
          title: "Test Doc",
          space: "ts-1" as Ref<HulyTeamspace>,
          content: "doc-1-content-1700000000000" as MarkupBlobRef
        })
        const captureUpdateMarkup: MockConfig["captureUpdateMarkup"] = {}

        const testLayer = createTestLayerWithMocks({
          teamspaces: [teamspace],
          documents: [doc],
          markupContent: { "doc-1-content-1700000000000": "foo bar foo baz foo" },
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
        expect(captureUpdateMarkup.format).toBe("markup")
        expectMarkupParagraphText(captureUpdateMarkup.markup, "qux bar qux baz qux")
      }))

    it.effect("combines title rename with search-and-replace", () =>
      Effect.gen(function*() {
        const teamspace = makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "My Docs" })
        const doc = makeDocument({
          _id: "doc-1" as Ref<HulyDocument>,
          title: "Old Title",
          space: "ts-1" as Ref<HulyTeamspace>,
          content: "doc-1-content-1700000000000" as MarkupBlobRef
        })
        const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}
        const captureUpdateMarkup: MockConfig["captureUpdateMarkup"] = {}

        const testLayer = createTestLayerWithMocks({
          teamspaces: [teamspace],
          documents: [doc],
          markupContent: { "doc-1-content-1700000000000": "Some content here." },
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
        expect(captureUpdateMarkup.format).toBe("markup")
        expectMarkupParagraphText(captureUpdateMarkup.markup, "Some text here.")
      }))

    it.effect("preserves existing native references during targeted edits", () =>
      Effect.gen(function*() {
        const teamspace = makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "My Docs" })
        const doc = makeDocument({
          _id: "doc-1" as Ref<HulyDocument>,
          title: "Test Doc",
          space: "ts-1" as Ref<HulyTeamspace>,
          content: "doc-1-content-1700000000000" as MarkupBlobRef
        })
        const captureUpdateMarkup: MockConfig["captureUpdateMarkup"] = {}

        const testLayer = createTestLayerWithMocks({
          teamspaces: [teamspace],
          documents: [doc],
          markupContent: {
            "doc-1-content-1700000000000":
              "Before [HULY-1](https://test.invalid/browse?workspace=test&_class=tracker%3Aclass%3AIssue&_id=issue-1&label=HULY-1%20First%20Issue) after."
          },
          captureUpdateMarkup
        })

        const result = yield* editDocument({
          teamspace: teamspaceIdentifier("My Docs"),
          document: documentIdentifier("Test Doc"),
          old_text: "Before",
          new_text: "After"
        }).pipe(Effect.provide(testLayer))

        expect(result.updated).toBe(true)
        expect(captureUpdateMarkup.format).toBe("markup")
        const updatedMarkup = JSON.stringify(JSON.parse(captureUpdateMarkup.markup ?? "{}"))
        expect(updatedMarkup).toContain(`"type":"reference"`)
        expect(updatedMarkup).toContain(`"id":"issue-1"`)
        expect(updatedMarkup).toContain(`"objectclass":"tracker:class:Issue"`)
        expect(updatedMarkup).toContain(`"label":"HULY-1 First Issue"`)
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
          content: "doc-1-content-1700000000000" as MarkupBlobRef
        })

        const testLayer = createTestLayerWithMocks({
          teamspaces: [teamspace],
          documents: [doc],
          markupContent: { "doc-1-content-1700000000000": "Hello world." }
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
          content: "doc-1-content-1700000000000" as MarkupBlobRef
        })

        const testLayer = createTestLayerWithMocks({
          teamspaces: [teamspace],
          documents: [doc],
          markupContent: { "doc-1-content-1700000000000": "foo bar foo baz foo" }
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

  it.effect("returns undefined description for empty teamspace descriptions", () =>
    Effect.gen(function*() {
      const teamspace = makeTeamspace({
        _id: "ts-1" as Ref<HulyTeamspace>,
        name: "No Description",
        description: ""
      })

      const testLayer = createTestLayerWithMocks({ teamspaces: [teamspace] })

      const result = yield* getTeamspace({ teamspace: teamspaceIdentifier("No Description") }).pipe(
        Effect.provide(testLayer)
      )

      expect(result.description).toBeUndefined()
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

  it.effect("sets description to a non-null value", () =>
    Effect.gen(function*() {
      const teamspace = makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "TS" })
      const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}
      const testLayer = createTestLayerWithMocks({ teamspaces: [teamspace], captureUpdateDoc })

      yield* updateTeamspace({
        teamspace: teamspaceIdentifier("TS"),
        description: "Updated description"
      }).pipe(Effect.provide(testLayer))

      expect(captureUpdateDoc.operations?.description).toBe("Updated description")
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

  it.effect("fails when no fields", () =>
    Effect.gen(function*() {
      const teamspace = makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "TS" })
      const testLayer = createTestLayerWithMocks({ teamspaces: [teamspace] })

      const error = yield* Effect.flip(
        updateTeamspace({
          teamspace: teamspaceIdentifier("TS")
        }).pipe(Effect.provide(testLayer))
      )

      expect(error._tag).toBe("NoUpdateFieldsError")
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
