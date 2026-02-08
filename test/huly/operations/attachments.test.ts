import { describe, it } from "@effect/vitest"
import type { Attachment as HulyAttachment } from "@hcengineering/attachment"
import type { Blob, Class, Doc, Ref, Space } from "@hcengineering/core"
import { toFindResult } from "@hcengineering/core"
import type { Document as HulyDocument, Teamspace as HulyTeamspace } from "@hcengineering/document"
import type { Issue as HulyIssue, Project as HulyProject } from "@hcengineering/tracker"
import { Effect, Layer } from "effect"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { expect } from "vitest"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import type { AttachmentNotFoundError } from "../../../src/huly/errors.js"
import { attachment, documentPlugin, tracker } from "../../../src/huly/huly-plugins.js"
import {
  addAttachment,
  addDocumentAttachment,
  addIssueAttachment,
  deleteAttachment,
  downloadAttachment,
  getAttachment,
  listAttachments,
  pinAttachment,
  updateAttachment
} from "../../../src/huly/operations/attachments.js"
import { HulyStorageClient } from "../../../src/huly/storage.js"

// --- Mock Data Builders ---

const makeAttachment = (overrides?: Partial<HulyAttachment>): HulyAttachment => ({
  _id: "att-1" as Ref<HulyAttachment>,
  _class: attachment.class.Attachment,
  space: "space-1" as Ref<Space>,
  name: "test-file.pdf",
  file: "blob-1" as Ref<Blob>,
  type: "application/pdf",
  size: 1024,
  lastModified: Date.now(),
  pinned: false,
  description: "A test file",
  collection: "attachments",
  attachedTo: "parent-1" as Ref<Doc>,
  attachedToClass: "class-1" as Ref<Class<Doc>>,
  modifiedBy: "user-1" as Doc["modifiedBy"],
  modifiedOn: Date.now(),
  createdBy: "user-1" as Doc["createdBy"],
  createdOn: Date.now(),
  ...overrides
})

// eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- mock builder
const makeProject = (overrides?: Partial<HulyProject>): HulyProject => ({
  _id: "project-1" as Ref<HulyProject>,
  _class: tracker.class.Project,
  space: "space-1" as Ref<Space>,
  name: "Test Project",
  identifier: "TEST",
  sequence: 1,
  defaultIssueStatus: "status-1" as Ref<Doc>,
  defaultAssignee: undefined,
  defaultTimeReportDay: 0,
  modifiedBy: "user-1" as Doc["modifiedBy"],
  modifiedOn: Date.now(),
  createdBy: "user-1" as Doc["createdBy"],
  createdOn: Date.now(),
  archived: false,
  private: false,
  ...overrides
} as HulyProject)

// eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- mock builder
const makeIssue = (overrides?: Partial<HulyIssue>): HulyIssue => ({
  _id: "issue-1" as Ref<HulyIssue>,
  _class: tracker.class.Issue,
  space: "project-1" as Ref<HulyProject>,
  title: "Test Issue",
  identifier: "TEST-1",
  number: 1,
  status: "status-1" as Ref<Doc>,
  priority: 0,
  modifiedBy: "user-1" as Doc["modifiedBy"],
  modifiedOn: Date.now(),
  createdBy: "user-1" as Doc["createdBy"],
  createdOn: Date.now(),
  attachedTo: "parent-1" as Ref<Doc>,
  attachedToClass: "class-1" as Ref<Class<Doc>>,
  collection: "issues",
  ...overrides
} as HulyIssue)

const makeTeamspace = (overrides?: Partial<HulyTeamspace>): HulyTeamspace => ({
  _id: "ts-1" as Ref<HulyTeamspace>,
  _class: documentPlugin.class.Teamspace,
  space: "space-1" as Ref<Space>,
  name: "My Docs",
  description: "Test teamspace",
  archived: false,
  private: false,
  modifiedBy: "user-1" as Doc["modifiedBy"],
  modifiedOn: Date.now(),
  createdBy: "user-1" as Doc["createdBy"],
  createdOn: Date.now(),
  ...overrides
})

// eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- mock builder
const makeDocument = (overrides?: Partial<HulyDocument>): HulyDocument => ({
  _id: "doc-1" as Ref<HulyDocument>,
  _class: documentPlugin.class.Document,
  space: "ts-1" as Ref<HulyTeamspace>,
  title: "Test Doc",
  content: null,
  parent: documentPlugin.ids.NoParent,
  rank: "0|aaa",
  modifiedBy: "user-1" as Ref<Doc>,
  modifiedOn: Date.now(),
  createdBy: "user-1" as Ref<Doc>,
  createdOn: Date.now(),
  ...overrides
} as HulyDocument)

// --- Test Helpers ---

interface MockConfig {
  attachments?: Array<HulyAttachment>
  projects?: Array<HulyProject>
  issues?: Array<HulyIssue>
  teamspaces?: Array<HulyTeamspace>
  documents?: Array<HulyDocument>
  captureUpdateDoc?: { operations?: Record<string, unknown> }
  captureRemoveDoc?: { id?: string }
  captureAddCollection?: { attributes?: Record<string, unknown> }
}

const createTestLayer = (config: MockConfig) => {
  const attachments = config.attachments ?? []
  const projects = config.projects ?? []
  const issues = config.issues ?? []
  const teamspaces = config.teamspaces ?? []
  const documents = config.documents ?? []

  const findAllImpl: HulyClientOperations["findAll"] = ((_class: unknown, query: unknown) => {
    if (_class === attachment.class.Attachment) {
      const q = query as Record<string, unknown>
      let filtered = [...attachments]
      if (q.attachedTo) {
        filtered = filtered.filter(a => a.attachedTo === q.attachedTo)
      }
      return Effect.succeed(toFindResult(filtered as Array<Doc>))
    }
    if (_class === documentPlugin.class.Teamspace) {
      const q = query as Record<string, unknown>
      let filtered = [...teamspaces]
      if (q.archived !== undefined) {
        filtered = filtered.filter(ts => ts.archived === q.archived)
      }
      return Effect.succeed(toFindResult(filtered as Array<Doc>))
    }
    return Effect.succeed(toFindResult([]))
  }) as HulyClientOperations["findAll"]

  const findOneImpl: HulyClientOperations["findOne"] = ((_class: unknown, query: unknown) => {
    if (_class === attachment.class.Attachment) {
      const q = query as Record<string, unknown>
      const found = attachments.find(a => a._id === q._id)
      return Effect.succeed(found as Doc | undefined)
    }
    if (_class === tracker.class.Project) {
      const q = query as Record<string, unknown>
      const found = projects.find(p => p.identifier === q.identifier)
      return Effect.succeed(found as Doc | undefined)
    }
    if (_class === tracker.class.Issue) {
      const q = query as Record<string, unknown>
      const found = issues.find(i =>
        (q.identifier && i.identifier === q.identifier && i.space === q.space)
        || (q.number !== undefined && i.number === q.number && i.space === q.space)
      )
      return Effect.succeed(found as Doc | undefined)
    }
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
      )
      return Effect.succeed(found as Doc | undefined)
    }
    return Effect.succeed(undefined)
  }) as HulyClientOperations["findOne"]

  const updateDocImpl: HulyClientOperations["updateDoc"] = (
    (_class: unknown, _space: unknown, _objectId: unknown, operations: unknown) => {
      if (config.captureUpdateDoc) {
        config.captureUpdateDoc.operations = operations as Record<string, unknown>
      }
      return Effect.succeed({} as never)
    }
  ) as HulyClientOperations["updateDoc"]

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

  const addCollectionImpl: HulyClientOperations["addCollection"] = ((
    _class: unknown,
    _space: unknown,
    _attachedTo: unknown,
    _attachedToClass: unknown,
    _collection: unknown,
    attributes: unknown
  ) => {
    if (config.captureAddCollection) {
      config.captureAddCollection.attributes = attributes as Record<string, unknown>
    }
    return Effect.succeed("new-att-id" as Ref<Doc>)
  }) as HulyClientOperations["addCollection"]

  const clientLayer = HulyClient.testLayer({
    findAll: findAllImpl,
    findOne: findOneImpl,
    updateDoc: updateDocImpl,
    removeDoc: removeDocImpl,
    addCollection: addCollectionImpl
  })

  const storageLayer = HulyStorageClient.testLayer({})

  return Layer.merge(clientLayer, storageLayer)
}

// --- Tests ---

describe("listAttachments", () => {
  // test-revizorro: approved
  it.effect("returns attachment summaries", () =>
    Effect.gen(function*() {
      const attachments = [
        makeAttachment({ _id: "att-1" as Ref<HulyAttachment>, name: "file1.pdf", attachedTo: "parent-1" as Ref<Doc> }),
        makeAttachment({ _id: "att-2" as Ref<HulyAttachment>, name: "file2.png", attachedTo: "parent-1" as Ref<Doc> })
      ]
      const testLayer = createTestLayer({ attachments })

      const result = yield* listAttachments({
        objectId: "parent-1",
        objectClass: "tracker:class:Issue"
      }).pipe(Effect.provide(testLayer))

      expect(result).toHaveLength(2)
      expect(result[0].name).toBe("file1.pdf")
      expect(result[1].name).toBe("file2.png")
    }))

  // test-revizorro: approved
  it.effect("returns empty array when no attachments", () =>
    Effect.gen(function*() {
      const testLayer = createTestLayer({})

      const result = yield* listAttachments({
        objectId: "parent-1",
        objectClass: "tracker:class:Issue"
      }).pipe(Effect.provide(testLayer))

      expect(result).toHaveLength(0)
    }))

  // test-revizorro: approved
  it.effect("handles null pinned and description via nullish coalescing", () =>
    Effect.gen(function*() {
      const att = makeAttachment({
        _id: "att-null" as Ref<HulyAttachment>,
        attachedTo: "parent-1" as Ref<Doc>,
        // eslint-disable-next-line no-restricted-syntax -- test mock requires double cast through unknown
        pinned: undefined as unknown as boolean,
        // eslint-disable-next-line no-restricted-syntax -- test mock requires double cast through unknown
        description: null as unknown as string
      })
      const testLayer = createTestLayer({ attachments: [att] })

      const result = yield* listAttachments({
        objectId: "parent-1",
        objectClass: "tracker:class:Issue"
      }).pipe(Effect.provide(testLayer))

      expect(result).toHaveLength(1)
      expect(result[0].pinned).toBeUndefined()
      expect(result[0].description).toBeUndefined()
    }))
})

describe("getAttachment", () => {
  // test-revizorro: approved
  it.effect("returns full attachment with URL", () =>
    Effect.gen(function*() {
      const att = makeAttachment({
        _id: "att-1" as Ref<HulyAttachment>,
        name: "report.pdf",
        type: "application/pdf",
        size: 2048,
        file: "blob-123" as Ref<Blob>
      })
      const testLayer = createTestLayer({ attachments: [att] })

      const result = yield* getAttachment({ attachmentId: "att-1" }).pipe(Effect.provide(testLayer))

      expect(result.id).toBe("att-1")
      expect(result.name).toBe("report.pdf")
      expect(result.type).toBe("application/pdf")
      expect(result.size).toBe(2048)
      expect(result.url).toContain("blob-123")
    }))

  // test-revizorro: approved
  it.effect("fails with AttachmentNotFoundError when not found", () =>
    Effect.gen(function*() {
      const testLayer = createTestLayer({})

      const error = yield* Effect.flip(
        getAttachment({ attachmentId: "nonexistent" }).pipe(Effect.provide(testLayer))
      )

      expect(error._tag).toBe("AttachmentNotFoundError")
      expect((error as AttachmentNotFoundError).attachmentId).toBe("nonexistent")
    }))

  // test-revizorro: approved
  it.effect("handles null pinned and description via nullish coalescing", () =>
    Effect.gen(function*() {
      const att = makeAttachment({
        _id: "att-null" as Ref<HulyAttachment>,
        file: "blob-null" as Ref<Blob>,
        // eslint-disable-next-line no-restricted-syntax -- test mock requires double cast through unknown
        pinned: undefined as unknown as boolean,
        // eslint-disable-next-line no-restricted-syntax -- test mock requires double cast through unknown
        description: null as unknown as string,
        // eslint-disable-next-line no-restricted-syntax -- test mock requires double cast through unknown
        readonly: undefined as unknown as boolean
      })
      const testLayer = createTestLayer({ attachments: [att] })

      const result = yield* getAttachment({ attachmentId: "att-null" }).pipe(Effect.provide(testLayer))

      expect(result.id).toBe("att-null")
      expect(result.pinned).toBeUndefined()
      expect(result.description).toBeUndefined()
    }))
})

describe("addAttachment", () => {
  // test-revizorro: suspect | weak assertions (toBeDefined only), missing return value validation
  it.effect("uploads and attaches file via base64 data", () =>
    Effect.gen(function*() {
      const captureAddCollection: MockConfig["captureAddCollection"] = {}
      const testLayer = createTestLayer({ captureAddCollection })

      const result = yield* addAttachment({
        objectId: "parent-1",
        objectClass: "tracker:class:Issue",
        space: "space-1",
        filename: "test.txt",
        contentType: "text/plain",
        data: Buffer.from("hello world").toString("base64")
      }).pipe(Effect.provide(testLayer))

      expect(result.attachmentId).toBeDefined()
      expect(result.blobId).toBeDefined()
      expect(result.url).toBeDefined()
      expect(captureAddCollection.attributes?.name).toBe("test.txt")
      expect(captureAddCollection.attributes?.type).toBe("text/plain")
    }))

  // test-revizorro: scheduled
  it.effect("includes description in attachment data when provided", () =>
    Effect.gen(function*() {
      const captureAddCollection: MockConfig["captureAddCollection"] = {}
      const testLayer = createTestLayer({ captureAddCollection })

      yield* addAttachment({
        objectId: "parent-1",
        objectClass: "tracker:class:Issue",
        space: "space-1",
        filename: "test.txt",
        contentType: "text/plain",
        data: Buffer.from("hello").toString("base64"),
        description: "My attachment"
      }).pipe(Effect.provide(testLayer))

      expect(captureAddCollection.attributes?.description).toBe("My attachment")
    }))

  // test-revizorro: approved
  it.effect("uploads file via filePath (covers toFileSourceParams filePath branch)", () =>
    Effect.gen(function*() {
      const tmpDir = os.tmpdir()
      const tmpFile = path.join(tmpDir, `hulymcp-test-${Date.now()}.txt`)
      fs.writeFileSync(tmpFile, "file content for test")
      try {
        const captureAddCollection: MockConfig["captureAddCollection"] = {}
        const testLayer = createTestLayer({ captureAddCollection })

        const result = yield* addAttachment({
          objectId: "parent-1",
          objectClass: "tracker:class:Issue",
          space: "space-1",
          filename: "from-disk.txt",
          contentType: "text/plain",
          filePath: tmpFile
        }).pipe(Effect.provide(testLayer))

        expect(result.attachmentId).toBeDefined()
        expect(captureAddCollection.attributes?.name).toBe("from-disk.txt")
      } finally {
        fs.unlinkSync(tmpFile)
      }
    }))
})

describe("updateAttachment", () => {
  // test-revizorro: approved
  it.effect("updates attachment description", () =>
    Effect.gen(function*() {
      const att = makeAttachment({ _id: "att-1" as Ref<HulyAttachment> })
      const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}
      const testLayer = createTestLayer({ attachments: [att], captureUpdateDoc })

      const result = yield* updateAttachment({
        attachmentId: "att-1",
        description: "Updated description"
      }).pipe(Effect.provide(testLayer))

      expect(result.attachmentId).toBe("att-1")
      expect(result.updated).toBe(true)
      expect(captureUpdateDoc.operations?.description).toBe("Updated description")
    }))

  // test-revizorro: approved
  it.effect("clears description with null", () =>
    Effect.gen(function*() {
      const att = makeAttachment({ _id: "att-1" as Ref<HulyAttachment> })
      const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}
      const testLayer = createTestLayer({ attachments: [att], captureUpdateDoc })

      const result = yield* updateAttachment({
        attachmentId: "att-1",
        description: null
      }).pipe(Effect.provide(testLayer))

      expect(result.updated).toBe(true)
      expect(captureUpdateDoc.operations?.description).toBe("")
    }))

  // test-revizorro: approved
  it.effect("updates pinned status", () =>
    Effect.gen(function*() {
      const att = makeAttachment({ _id: "att-1" as Ref<HulyAttachment> })
      const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}
      const testLayer = createTestLayer({ attachments: [att], captureUpdateDoc })

      const result = yield* updateAttachment({
        attachmentId: "att-1",
        pinned: true
      }).pipe(Effect.provide(testLayer))

      expect(result.updated).toBe(true)
      expect(captureUpdateDoc.operations?.pinned).toBe(true)
    }))

  // test-revizorro: approved
  it.effect("returns updated=false when no fields provided", () =>
    Effect.gen(function*() {
      const att = makeAttachment({ _id: "att-1" as Ref<HulyAttachment> })
      const testLayer = createTestLayer({ attachments: [att] })

      const result = yield* updateAttachment({ attachmentId: "att-1" }).pipe(Effect.provide(testLayer))

      expect(result.updated).toBe(false)
    }))

  // test-revizorro: suspect | checks only error tag, missing attachmentId assertion like similar tests
  it.effect("fails with AttachmentNotFoundError when not found", () =>
    Effect.gen(function*() {
      const testLayer = createTestLayer({})

      const error = yield* Effect.flip(
        updateAttachment({ attachmentId: "nonexistent", description: "x" }).pipe(Effect.provide(testLayer))
      )

      expect(error._tag).toBe("AttachmentNotFoundError")
    }))
})

describe("deleteAttachment", () => {
  // test-revizorro: approved
  it.effect("deletes attachment", () =>
    Effect.gen(function*() {
      const att = makeAttachment({ _id: "att-1" as Ref<HulyAttachment> })
      const captureRemoveDoc: MockConfig["captureRemoveDoc"] = {}
      const testLayer = createTestLayer({ attachments: [att], captureRemoveDoc })

      const result = yield* deleteAttachment({ attachmentId: "att-1" }).pipe(Effect.provide(testLayer))

      expect(result.attachmentId).toBe("att-1")
      expect(result.deleted).toBe(true)
      expect(captureRemoveDoc.id).toBe("att-1")
    }))

  // test-revizorro: approved
  it.effect("fails with AttachmentNotFoundError when not found", () =>
    Effect.gen(function*() {
      const testLayer = createTestLayer({})

      const error = yield* Effect.flip(
        deleteAttachment({ attachmentId: "nonexistent" }).pipe(Effect.provide(testLayer))
      )

      expect(error._tag).toBe("AttachmentNotFoundError")
      expect((error as AttachmentNotFoundError).attachmentId).toBe("nonexistent")
    }))
})

describe("pinAttachment", () => {
  // test-revizorro: approved
  it.effect("pins attachment", () =>
    Effect.gen(function*() {
      const att = makeAttachment({ _id: "att-1" as Ref<HulyAttachment>, pinned: false })
      const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}
      const testLayer = createTestLayer({ attachments: [att], captureUpdateDoc })

      const result = yield* pinAttachment({
        attachmentId: "att-1",
        pinned: true
      }).pipe(Effect.provide(testLayer))

      expect(result.attachmentId).toBe("att-1")
      expect(result.pinned).toBe(true)
      expect(captureUpdateDoc.operations?.pinned).toBe(true)
    }))

  // test-revizorro: approved
  it.effect("unpins attachment", () =>
    Effect.gen(function*() {
      const att = makeAttachment({ _id: "att-1" as Ref<HulyAttachment>, pinned: true })
      const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}
      const testLayer = createTestLayer({ attachments: [att], captureUpdateDoc })

      const result = yield* pinAttachment({
        attachmentId: "att-1",
        pinned: false
      }).pipe(Effect.provide(testLayer))

      expect(result.pinned).toBe(false)
      expect(captureUpdateDoc.operations?.pinned).toBe(false)
    }))

  // test-revizorro: approved
  it.effect("fails with AttachmentNotFoundError when not found", () =>
    Effect.gen(function*() {
      const testLayer = createTestLayer({})

      const error = yield* Effect.flip(
        pinAttachment({ attachmentId: "nonexistent", pinned: true }).pipe(Effect.provide(testLayer))
      )

      expect(error._tag).toBe("AttachmentNotFoundError")
    }))
})

describe("downloadAttachment", () => {
  // test-revizorro: approved
  it.effect("returns download URL and metadata", () =>
    Effect.gen(function*() {
      const att = makeAttachment({
        _id: "att-1" as Ref<HulyAttachment>,
        name: "report.pdf",
        type: "application/pdf",
        size: 4096,
        file: "blob-456" as Ref<Blob>
      })
      const testLayer = createTestLayer({ attachments: [att] })

      const result = yield* downloadAttachment({ attachmentId: "att-1" }).pipe(Effect.provide(testLayer))

      expect(result.attachmentId).toBe("att-1")
      expect(result.url).toContain("blob-456")
      expect(result.name).toBe("report.pdf")
      expect(result.type).toBe("application/pdf")
      expect(result.size).toBe(4096)
    }))

  // test-revizorro: approved
  it.effect("fails with AttachmentNotFoundError when not found", () =>
    Effect.gen(function*() {
      const testLayer = createTestLayer({})

      const error = yield* Effect.flip(
        downloadAttachment({ attachmentId: "nonexistent" }).pipe(Effect.provide(testLayer))
      )

      expect(error._tag).toBe("AttachmentNotFoundError")
    }))
})

describe("addIssueAttachment", () => {
  // test-revizorro: suspect | weak assertions (toBeDefined only), doesn't validate issue lookup or object refs
  it.effect("uploads and attaches file to issue", () =>
    Effect.gen(function*() {
      const project = makeProject({ _id: "project-1" as Ref<HulyProject>, identifier: "TEST" })
      const issue = makeIssue({
        _id: "issue-1" as Ref<HulyIssue>,
        identifier: "TEST-1",
        number: 1,
        space: "project-1" as Ref<HulyProject>
      })
      const captureAddCollection: MockConfig["captureAddCollection"] = {}
      const testLayer = createTestLayer({
        projects: [project],
        issues: [issue],
        captureAddCollection
      })

      const result = yield* addIssueAttachment({
        project: "TEST",
        identifier: "TEST-1",
        filename: "screenshot.png",
        contentType: "image/png",
        data: Buffer.from("fake-png-data").toString("base64")
      }).pipe(Effect.provide(testLayer))

      expect(result.attachmentId).toBeDefined()
      expect(result.url).toBeDefined()
      expect(captureAddCollection.attributes?.name).toBe("screenshot.png")
    }))
})

describe("addDocumentAttachment", () => {
  // test-revizorro: suspect | weak assertions (toBeDefined), no verification of actual attachment creation or returned values
  it.effect("uploads and attaches file to document", () =>
    Effect.gen(function*() {
      const teamspace = makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "My Docs" })
      const doc = makeDocument({
        _id: "doc-1" as Ref<HulyDocument>,
        title: "Test Doc",
        space: "ts-1" as Ref<HulyTeamspace>
      })
      const captureAddCollection: MockConfig["captureAddCollection"] = {}
      const testLayer = createTestLayer({
        teamspaces: [teamspace],
        documents: [doc],
        captureAddCollection
      })

      const result = yield* addDocumentAttachment({
        teamspace: "My Docs",
        document: "Test Doc",
        filename: "data.csv",
        contentType: "text/csv",
        data: Buffer.from("col1,col2\n1,2").toString("base64")
      }).pipe(Effect.provide(testLayer))

      expect(result.attachmentId).toBeDefined()
      expect(result.url).toBeDefined()
      expect(captureAddCollection.attributes?.name).toBe("data.csv")
    }))
})
