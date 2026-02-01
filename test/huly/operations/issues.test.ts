import { describe, it } from "@effect/vitest"
import { expect } from "vitest"
import { Effect } from "effect"
import type {
  Doc,
  FindResult,
  Ref,
  Space,
  Status,
  StatusCategory,
} from "@hcengineering/core"
import { type Issue as HulyIssue, type Project as HulyProject, IssuePriority } from "@hcengineering/tracker"
import type { Person, Channel } from "@hcengineering/contact"
import type { TagElement, TagReference } from "@hcengineering/tags"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import { ProjectNotFoundError, InvalidStatusError, IssueNotFoundError, PersonNotFoundError } from "../../../src/huly/errors.js"
import { listIssues, getIssue, createIssue, updateIssue, addLabel } from "../../../src/huly/operations/issues.js"

// Import plugin objects at runtime (CommonJS modules)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const tracker = require("@hcengineering/tracker").default as typeof import("@hcengineering/tracker").default
// eslint-disable-next-line @typescript-eslint/no-require-imports
const contact = require("@hcengineering/contact").default as typeof import("@hcengineering/contact").default
// eslint-disable-next-line @typescript-eslint/no-require-imports
const tags = require("@hcengineering/tags").default as typeof import("@hcengineering/tags").default
// eslint-disable-next-line @typescript-eslint/no-require-imports
const task = require("@hcengineering/task").default as typeof import("@hcengineering/task").default

// --- Mock Data Builders ---

const makeProject = (overrides?: Partial<HulyProject>): HulyProject =>
  ({
    _id: "project-1" as Ref<HulyProject>,
    _class: tracker.class.Project,
    space: "space-1" as Ref<Space>,
    identifier: "TEST",
    name: "Test Project",
    sequence: 1,
    defaultIssueStatus: "status-open" as Ref<Status>,
    defaultTimeReportDay: 0,
    modifiedBy: "user-1" as Ref<Doc>,
    modifiedOn: Date.now(),
    createdBy: "user-1" as Ref<Doc>,
    createdOn: Date.now(),
    ...overrides,
  }) as HulyProject

const makeIssue = (overrides?: Partial<HulyIssue>): HulyIssue =>
  ({
    _id: "issue-1" as Ref<HulyIssue>,
    _class: tracker.class.Issue,
    space: "project-1" as Ref<HulyProject>,
    identifier: "TEST-1",
    title: "Test Issue",
    description: null,
    status: "status-open" as Ref<Status>,
    priority: IssuePriority.Medium,
    assignee: null,
    kind: "task-type-1" as Ref<Doc>,
    number: 1,
    dueDate: null,
    rank: "0|aaa",
    attachedTo: "no-parent" as Ref<HulyIssue>,
    attachedToClass: tracker.class.Issue,
    collection: "subIssues",
    component: null,
    subIssues: 0,
    parents: [],
    estimation: 0,
    remainingTime: 0,
    reportedTime: 0,
    reports: 0,
    childInfo: [],
    modifiedBy: "user-1" as Ref<Doc>,
    modifiedOn: Date.now(),
    createdBy: "user-1" as Ref<Doc>,
    createdOn: Date.now(),
    ...overrides,
  }) as HulyIssue

const makeStatus = (overrides?: Partial<Status>): Status =>
  ({
    _id: "status-1" as Ref<Status>,
    _class: "core:class:Status" as Ref<Doc>,
    space: "space-1" as Ref<Space>,
    ofAttribute: "tracker:attribute:IssueStatus" as Ref<Doc>,
    name: "Open",
    modifiedBy: "user-1" as Ref<Doc>,
    modifiedOn: Date.now(),
    createdBy: "user-1" as Ref<Doc>,
    createdOn: Date.now(),
    ...overrides,
  }) as Status

const makePerson = (overrides?: Partial<Person>): Person =>
  ({
    _id: "person-1" as Ref<Person>,
    _class: contact.class.Person,
    space: "space-1" as Ref<Space>,
    name: "John Doe",
    modifiedBy: "user-1" as Ref<Doc>,
    modifiedOn: Date.now(),
    createdBy: "user-1" as Ref<Doc>,
    createdOn: Date.now(),
    ...overrides,
  }) as Person

const makeChannel = (overrides?: Partial<Channel>): Channel =>
  ({
    _id: "channel-1" as Ref<Channel>,
    _class: contact.class.Channel,
    space: "space-1" as Ref<Space>,
    attachedTo: "person-1" as Ref<Doc>,
    attachedToClass: contact.class.Person,
    collection: "channels",
    provider: "email" as Ref<Doc>,
    value: "john@example.com",
    modifiedBy: "user-1" as Ref<Doc>,
    modifiedOn: Date.now(),
    createdBy: "user-1" as Ref<Doc>,
    createdOn: Date.now(),
    ...overrides,
  }) as Channel

const makeTagElement = (overrides?: Partial<TagElement>): TagElement =>
  ({
    _id: "tag-element-1" as Ref<TagElement>,
    _class: tags.class.TagElement,
    space: "space-1" as Ref<Space>,
    title: "Bug",
    description: "",
    targetClass: tracker.class.Issue,
    color: 0,
    category: tracker.category.Other,
    modifiedBy: "user-1" as Ref<Doc>,
    modifiedOn: Date.now(),
    createdBy: "user-1" as Ref<Doc>,
    createdOn: Date.now(),
    ...overrides,
  }) as TagElement

const makeTagReference = (overrides?: Partial<TagReference>): TagReference =>
  ({
    _id: "tag-ref-1" as Ref<TagReference>,
    _class: tags.class.TagReference,
    space: "project-1" as Ref<Space>,
    attachedTo: "issue-1" as Ref<Doc>,
    attachedToClass: tracker.class.Issue,
    collection: "labels",
    title: "Bug",
    color: 0,
    tag: "tag-element-1" as Ref<TagElement>,
    modifiedBy: "user-1" as Ref<Doc>,
    modifiedOn: Date.now(),
    createdBy: "user-1" as Ref<Doc>,
    createdOn: Date.now(),
    ...overrides,
  }) as TagReference

// --- Test Helpers ---

interface MockConfig {
  projects?: HulyProject[]
  issues?: HulyIssue[]
  statuses?: Status[]
  persons?: Person[]
  channels?: Channel[]
  tagElements?: TagElement[]
  tagReferences?: TagReference[]
  captureIssueQuery?: { query?: Record<string, unknown>; options?: Record<string, unknown> }
  markupContent?: Record<string, string>  // Map of markup ID to markdown content
  // For create tests
  captureUpdateDoc?: { operations?: Record<string, unknown> }
  captureAddCollection?: { attributes?: Record<string, unknown>; id?: string; class?: unknown }
  captureCreateDoc?: { attributes?: Record<string, unknown>; id?: string }
  captureUploadMarkup?: { markup?: string }
  updateDocResult?: { object?: { sequence?: number } }
}

const createTestLayerWithMocks = (config: MockConfig) => {
  const projects = config.projects ?? []
  const issues = config.issues ?? []
  const statuses = config.statuses ?? []
  const persons = config.persons ?? []
  const channels = config.channels ?? []
  const tagElements = config.tagElements ?? []
  const tagReferences = config.tagReferences ?? []

  // Use type assertion to bypass strict generic type checking in tests
  // This is safe because the mock implementation returns the correct data
  const findAllImpl: HulyClientOperations["findAll"] = ((_class: unknown, query: unknown, options: unknown) => {
    if (_class === tracker.class.Issue) {
      if (config.captureIssueQuery) {
        config.captureIssueQuery.query = query as Record<string, unknown>
        config.captureIssueQuery.options = options as Record<string, unknown>
      }
      // Apply sorting if specified in options
      const opts = options as { sort?: Record<string, number> } | undefined
      let result = [...issues]
      if (opts?.sort?.modifiedOn !== undefined) {
        // SortingOrder.Descending = -1, Ascending = 1
        const direction = opts.sort.modifiedOn
        result = result.sort((a, b) => direction * (a.modifiedOn - b.modifiedOn))
      }
      return Effect.succeed(result as unknown as FindResult<Doc>)
    }
    if (_class === tracker.class.IssueStatus) {
      return Effect.succeed(statuses as unknown as FindResult<Doc>)
    }
    if (_class === contact.class.Channel) {
      const value = (query as Record<string, unknown>).value as string
      const filtered = channels.filter(c => c.value === value)
      return Effect.succeed(filtered as unknown as FindResult<Doc>)
    }
    if (_class === contact.class.Person) {
      const nameFilter = (query as Record<string, unknown>).name as string | undefined
      if (nameFilter) {
        const filtered = persons.filter(p => p.name === nameFilter)
        return Effect.succeed(filtered as unknown as FindResult<Doc>)
      }
      return Effect.succeed(persons as unknown as FindResult<Doc>)
    }
    if (_class === tags.class.TagReference) {
      const q = query as Record<string, unknown>
      // Filter by attachedTo (issue id)
      const filtered = tagReferences.filter(tr =>
        tr.attachedTo === q.attachedTo &&
        tr.attachedToClass === q.attachedToClass
      )
      return Effect.succeed(filtered as unknown as FindResult<Doc>)
    }
    return Effect.succeed([] as unknown as FindResult<Doc>)
  }) as HulyClientOperations["findAll"]

  const findOneImpl: HulyClientOperations["findOne"] = ((_class: unknown, query: unknown) => {
    if (_class === tracker.class.Project) {
      const identifier = (query as Record<string, unknown>).identifier as string
      const found = projects.find(p => p.identifier === identifier)
      return Effect.succeed(found as Doc | undefined)
    }
    if (_class === tracker.class.Issue) {
      const q = query as Record<string, unknown>
      // Find by identifier, number, or space (for rank queries)
      const found = issues.find(i =>
        (q.identifier && i.identifier === q.identifier) ||
        (q.number && i.number === q.number) ||
        (q.space && i.space === q.space)
      )
      return Effect.succeed(found as Doc | undefined)
    }
    if (_class === contact.class.Person) {
      const id = (query as Record<string, unknown>)._id as string
      const found = persons.find(p => p._id === id)
      return Effect.succeed(found as Doc | undefined)
    }
    if (_class === tags.class.TagElement) {
      const q = query as Record<string, unknown>
      // Find by _id or by title + targetClass
      const found = tagElements.find(te =>
        (q._id && te._id === q._id) ||
        (q.title && q.targetClass && te.title === q.title && te.targetClass === q.targetClass)
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

  // Mock updateDoc - captures operation and returns incremented sequence
  const updateDocImpl: HulyClientOperations["updateDoc"] = (
    (_class: unknown, _space: unknown, _objectId: unknown, operations: unknown) => {
      if (config.captureUpdateDoc) {
        config.captureUpdateDoc.operations = operations as Record<string, unknown>
      }
      // Return project with incremented sequence
      const project = projects[0]
      const sequence = (config.updateDocResult?.object?.sequence) ?? (project ? project.sequence + 1 : 2)
      return Effect.succeed({ object: { sequence } } as never)
    }
  ) as HulyClientOperations["updateDoc"]

  // Mock addCollection - captures attributes
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const addCollectionImpl: any = (
    _class: unknown, _space: unknown, _attachedTo: unknown, _attachedToClass: unknown, _collection: unknown, attributes: unknown, id?: unknown
  ) => {
    if (config.captureAddCollection) {
      config.captureAddCollection.class = _class
      config.captureAddCollection.attributes = attributes as Record<string, unknown>
      config.captureAddCollection.id = id as string
    }
    return Effect.succeed((id ?? "new-issue-id") as Ref<Doc>)
  }

  // Mock createDoc - captures attributes for tag creation
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const createDocImpl: any = (
    _class: unknown, _space: unknown, attributes: unknown, id?: unknown
  ) => {
    if (config.captureCreateDoc) {
      config.captureCreateDoc.attributes = attributes as Record<string, unknown>
      config.captureCreateDoc.id = id as string
    }
    // If creating a tag element, add it to the tagElements array for subsequent findOne
    if (_class === tags.class.TagElement && id) {
      const newTag = makeTagElement({
        _id: id as Ref<TagElement>,
        ...(attributes as Partial<TagElement>),
      })
      tagElements.push(newTag)
    }
    return Effect.succeed((id ?? "new-doc-id") as Ref<Doc>)
  }

  // Mock uploadMarkup - captures markup content
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const uploadMarkupImpl: any = (
    _objectClass: unknown, _objectId: unknown, _objectAttr: unknown, markup: unknown
  ) => {
    if (config.captureUploadMarkup) {
      config.captureUploadMarkup.markup = markup as string
    }
    return Effect.succeed("markup-ref-123")
  }

  return HulyClient.testLayer({
    findAll: findAllImpl,
    findOne: findOneImpl,
    fetchMarkup: fetchMarkupImpl,
    updateDoc: updateDocImpl,
    addCollection: addCollectionImpl,
    uploadMarkup: uploadMarkupImpl,
    createDoc: createDocImpl,
  })
}

// --- Tests ---

describe("listIssues", () => {
  describe("basic functionality", () => {
    // test-revizorro: approved
    it.effect("returns issues for a project", () =>
      Effect.gen(function* () {
        const project = makeProject({ identifier: "TEST" })
        // Input: older issue first (opposite of expected output order)
        const issues = [
          makeIssue({ identifier: "TEST-2", title: "Issue 2", modifiedOn: 1000 }),
          makeIssue({ identifier: "TEST-1", title: "Issue 1", modifiedOn: 2000 }),
        ]
        const statuses = [
          makeStatus({ _id: "status-open" as Ref<Status>, name: "Open" }),
        ]

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues,
          statuses,
        })

        const result = yield* listIssues({ project: "TEST" }).pipe(Effect.provide(testLayer))

        expect(result).toHaveLength(2)
        // Expect sorted by modifiedOn descending (newer first)
        expect(result[0].identifier).toBe("TEST-1")
        expect(result[1].identifier).toBe("TEST-2")
      })
    )

    // test-revizorro: approved
    it.effect("transforms priority correctly", () =>
      Effect.gen(function* () {
        const project = makeProject()
        const issues = [
          makeIssue({ identifier: "TEST-1", priority: IssuePriority.Urgent }),
          makeIssue({ identifier: "TEST-2", priority: IssuePriority.High }),
          makeIssue({ identifier: "TEST-3", priority: IssuePriority.Medium }),
          makeIssue({ identifier: "TEST-4", priority: IssuePriority.Low }),
          makeIssue({ identifier: "TEST-5", priority: IssuePriority.NoPriority }),
        ]
        const statuses = [makeStatus({ _id: "status-open" as Ref<Status>, name: "Open" })]

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues,
          statuses,
        })

        const result = yield* listIssues({ project: "TEST" }).pipe(Effect.provide(testLayer))

        expect(result[0].priority).toBe("urgent")
        expect(result[1].priority).toBe("high")
        expect(result[2].priority).toBe("medium")
        expect(result[3].priority).toBe("low")
        expect(result[4].priority).toBe("no-priority")
      })
    )

    // test-revizorro: approved
    it.effect("includes assignee name when assigned", () =>
      Effect.gen(function* () {
        const project = makeProject()
        const person = makePerson({ _id: "person-1" as Ref<Person>, name: "Jane Doe" })
        const issues = [
          makeIssue({ assignee: "person-1" as Ref<Person> }),
        ]
        const statuses = [makeStatus({ _id: "status-open" as Ref<Status>, name: "Open" })]

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues,
          statuses,
          persons: [person],
        })

        const result = yield* listIssues({ project: "TEST" }).pipe(Effect.provide(testLayer))

        expect(result[0].assignee).toBe("Jane Doe")
      })
    )
  })

  describe("error handling", () => {
    // test-revizorro: scheduled
    it.effect("returns ProjectNotFoundError when project doesn't exist", () =>
      Effect.gen(function* () {
        const testLayer = createTestLayerWithMocks({
          projects: [],
          issues: [],
          statuses: [],
        })

        const error = yield* Effect.flip(
          listIssues({ project: "NONEXISTENT" }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("ProjectNotFoundError")
        expect((error as ProjectNotFoundError).identifier).toBe("NONEXISTENT")
      })
    )

    // test-revizorro: approved
    it.effect("returns InvalidStatusError for unknown status name", () =>
      Effect.gen(function* () {
        const project = makeProject()
        const statuses = [makeStatus({ _id: "status-open" as Ref<Status>, name: "Open" })]

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [],
          statuses,
        })

        const error = yield* Effect.flip(
          listIssues({ project: "TEST", status: "InvalidStatus" }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("InvalidStatusError")
        expect((error as InvalidStatusError).status).toBe("InvalidStatus")
      })
    )
  })

  describe("status filtering", () => {
    // test-revizorro: approved
    it.effect("filters by exact status name (case insensitive)", () =>
      Effect.gen(function* () {
        const project = makeProject()
        const inProgressStatus = makeStatus({ _id: "status-progress" as Ref<Status>, name: "In Progress" })
        const todoStatus = makeStatus({ _id: "status-todo" as Ref<Status>, name: "Todo" })
        const statuses = [inProgressStatus, todoStatus]
        const issues = [
          makeIssue({ status: "status-progress" as Ref<Status> }),
        ]

        const captureQuery: MockConfig["captureIssueQuery"] = {}

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues,
          statuses,
          captureIssueQuery: captureQuery,
        })

        // "in progress" (lowercase) should match "In Progress" status
        yield* listIssues({ project: "TEST", status: "in progress" }).pipe(Effect.provide(testLayer))

        expect(captureQuery.query?.status).toBe("status-progress")
      })
    )

    // test-revizorro: approved
    it.effect("reserved word 'open' filters by category (not done/canceled)", () =>
      Effect.gen(function* () {
        const project = makeProject()
        // Statuses with proper categories: Active (open), Won (done), Lost (canceled)
        const statuses = [
          makeStatus({
            _id: "status-open" as Ref<Status>,
            name: "Open",
            category: task.statusCategory.Active as Ref<StatusCategory>,
          }),
          makeStatus({
            _id: "status-done" as Ref<Status>,
            name: "Done",
            category: task.statusCategory.Won as Ref<StatusCategory>,
          }),
          makeStatus({
            _id: "status-canceled" as Ref<Status>,
            name: "Canceled",
            category: task.statusCategory.Lost as Ref<StatusCategory>,
          }),
        ]
        const issues = [makeIssue({ status: "status-open" as Ref<Status> })]

        const captureQuery: MockConfig["captureIssueQuery"] = {}

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues,
          statuses,
          captureIssueQuery: captureQuery,
        })

        yield* listIssues({ project: "TEST", status: "open" }).pipe(Effect.provide(testLayer))

        // "open" filter should exclude done (Won) and canceled (Lost) statuses
        expect(captureQuery.query?.status).toEqual({
          $nin: ["status-done", "status-canceled"],
        })
      })
    )
  })

  describe("assignee filtering", () => {
    // test-revizorro: approved
    it.effect("filters by assignee email", () =>
      Effect.gen(function* () {
        const project = makeProject()
        const person = makePerson({ _id: "person-1" as Ref<Person> })
        const channel = makeChannel({ attachedTo: "person-1" as Ref<Doc>, value: "john@example.com" })
        const statuses = [makeStatus({ _id: "status-open" as Ref<Status>, name: "Open" })]
        const issues = [makeIssue({ assignee: "person-1" as Ref<Person> })]

        const captureQuery: MockConfig["captureIssueQuery"] = {}

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues,
          statuses,
          persons: [person],
          channels: [channel],
          captureIssueQuery: captureQuery,
        })

        yield* listIssues({ project: "TEST", assignee: "john@example.com" }).pipe(Effect.provide(testLayer))

        expect(captureQuery.query?.assignee).toBe("person-1")
      })
    )

    // test-revizorro: approved
    it.effect("returns empty results when assignee not found", () =>
      Effect.gen(function* () {
        const project = makeProject()
        const statuses = [makeStatus({ _id: "status-open" as Ref<Status>, name: "Open" })]

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [],
          statuses,
          persons: [],
          channels: [],
        })

        const result = yield* listIssues({ project: "TEST", assignee: "nonexistent@example.com" }).pipe(Effect.provide(testLayer))

        expect(result).toHaveLength(0)
      })
    )
  })

  describe("limit handling", () => {
    // test-revizorro: approved
    it.effect("uses default limit of 50", () =>
      Effect.gen(function* () {
        const project = makeProject()
        const statuses = [makeStatus({ _id: "status-open" as Ref<Status>, name: "Open" })]

        const captureQuery: MockConfig["captureIssueQuery"] = {}

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [],
          statuses,
          captureIssueQuery: captureQuery,
        })

        yield* listIssues({ project: "TEST" }).pipe(Effect.provide(testLayer))

        expect(captureQuery.options?.limit).toBe(50)
      })
    )

    // test-revizorro: approved
    it.effect("enforces max limit of 200", () =>
      Effect.gen(function* () {
        const project = makeProject()
        const statuses = [makeStatus({ _id: "status-open" as Ref<Status>, name: "Open" })]

        const captureQuery: MockConfig["captureIssueQuery"] = {}

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [],
          statuses,
          captureIssueQuery: captureQuery,
        })

        yield* listIssues({ project: "TEST", limit: 500 }).pipe(Effect.provide(testLayer))

        expect(captureQuery.options?.limit).toBe(200)
      })
    )

    // test-revizorro: approved
    it.effect("uses provided limit when under max", () =>
      Effect.gen(function* () {
        const project = makeProject()
        const statuses = [makeStatus({ _id: "status-open" as Ref<Status>, name: "Open" })]

        const captureQuery: MockConfig["captureIssueQuery"] = {}

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [],
          statuses,
          captureIssueQuery: captureQuery,
        })

        yield* listIssues({ project: "TEST", limit: 25 }).pipe(Effect.provide(testLayer))

        expect(captureQuery.options?.limit).toBe(25)
      })
    )
  })

  describe("sorting", () => {
    // test-revizorro: approved
    it.effect("sorts by modifiedOn descending", () =>
      Effect.gen(function* () {
        const project = makeProject()
        const statuses = [makeStatus({ _id: "status-open" as Ref<Status>, name: "Open" })]

        const captureQuery: MockConfig["captureIssueQuery"] = {}

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [],
          statuses,
          captureIssueQuery: captureQuery,
        })

        yield* listIssues({ project: "TEST" }).pipe(Effect.provide(testLayer))

        // SortingOrder.Descending = -1
        expect((captureQuery.options?.sort as Record<string, number>)?.modifiedOn).toBe(-1)
      })
    )
  })
})

describe("getIssue", () => {
  describe("basic functionality", () => {
    // test-revizorro: approved
    it.effect("returns issue with full identifier", () =>
      Effect.gen(function* () {
        const project = makeProject({ identifier: "TEST" })
        const issue = makeIssue({
          identifier: "TEST-1",
          title: "Test Issue",
          number: 1,
          modifiedOn: 1000,
          createdOn: 500,
        })
        const statuses = [makeStatus({ _id: "status-open" as Ref<Status>, name: "Open" })]

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue],
          statuses,
        })

        const result = yield* getIssue({ project: "TEST", identifier: "TEST-1" }).pipe(Effect.provide(testLayer))

        expect(result.identifier).toBe("TEST-1")
        expect(result.title).toBe("Test Issue")
        expect(result.status).toBe("Open")
        expect(result.project).toBe("TEST")
      })
    )

    // test-revizorro: approved
    it.effect("returns issue with numeric identifier", () =>
      Effect.gen(function* () {
        const project = makeProject({ identifier: "HULY" })
        const issue = makeIssue({
          identifier: "HULY-123",
          title: "Numeric Lookup Issue",
          number: 123,
        })
        const statuses = [makeStatus({ _id: "status-open" as Ref<Status>, name: "Open" })]

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue],
          statuses,
        })

        const result = yield* getIssue({ project: "HULY", identifier: "123" }).pipe(Effect.provide(testLayer))

        expect(result.identifier).toBe("HULY-123")
        expect(result.title).toBe("Numeric Lookup Issue")
      })
    )

    // test-revizorro: approved
    it.effect("returns issue with lowercase identifier", () =>
      Effect.gen(function* () {
        const project = makeProject({ identifier: "TEST" })
        const issue = makeIssue({ identifier: "TEST-5", number: 5 })
        const statuses = [makeStatus({ _id: "status-open" as Ref<Status>, name: "Open" })]

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue],
          statuses,
        })

        const result = yield* getIssue({ project: "TEST", identifier: "test-5" }).pipe(Effect.provide(testLayer))

        expect(result.identifier).toBe("TEST-5")
      })
    )

    // test-revizorro: approved
    it.effect("fetches markdown description", () =>
      Effect.gen(function* () {
        const project = makeProject()
        const issue = makeIssue({
          identifier: "TEST-1",
          description: "markup-id-123" as unknown as null,
        })
        const statuses = [makeStatus({ _id: "status-open" as Ref<Status>, name: "Open" })]

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue],
          statuses,
          markupContent: {
            "markup-id-123": "# Hello World\n\nThis is markdown content.",
          },
        })

        const result = yield* getIssue({ project: "TEST", identifier: "TEST-1" }).pipe(Effect.provide(testLayer))

        expect(result.description).toBe("# Hello World\n\nThis is markdown content.")
      })
    )

    // test-revizorro: approved
    it.effect("includes assignee name when assigned", () =>
      Effect.gen(function* () {
        const project = makeProject()
        const person = makePerson({ _id: "person-1" as Ref<Person>, name: "Jane Developer" })
        const issue = makeIssue({
          identifier: "TEST-1",
          assignee: "person-1" as Ref<Person>,
        })
        const statuses = [makeStatus({ _id: "status-open" as Ref<Status>, name: "Open" })]

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue],
          statuses,
          persons: [person],
        })

        const result = yield* getIssue({ project: "TEST", identifier: "TEST-1" }).pipe(Effect.provide(testLayer))

        expect(result.assignee).toBe("Jane Developer")
        expect(result.assigneeRef?.id).toBe("person-1")
        expect(result.assigneeRef?.name).toBe("Jane Developer")
      })
    )

    // test-revizorro: approved
    it.effect("transforms priority correctly", () =>
      Effect.gen(function* () {
        const project = makeProject()
        const issue = makeIssue({
          identifier: "TEST-1",
          priority: IssuePriority.High,
        })
        const statuses = [makeStatus({ _id: "status-open" as Ref<Status>, name: "Open" })]

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue],
          statuses,
        })

        const result = yield* getIssue({ project: "TEST", identifier: "TEST-1" }).pipe(Effect.provide(testLayer))

        expect(result.priority).toBe("high")
      })
    )

    // test-revizorro: approved
    it.effect("returns undefined description when not set", () =>
      Effect.gen(function* () {
        const project = makeProject()
        const issue = makeIssue({
          identifier: "TEST-1",
          description: null,
        })
        const statuses = [makeStatus({ _id: "status-open" as Ref<Status>, name: "Open" })]

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue],
          statuses,
        })

        const result = yield* getIssue({ project: "TEST", identifier: "TEST-1" }).pipe(Effect.provide(testLayer))

        expect(result.description).toBeUndefined()
      })
    )
  })

  describe("error handling", () => {
    // test-revizorro: approved
    it.effect("returns ProjectNotFoundError when project doesn't exist", () =>
      Effect.gen(function* () {
        const testLayer = createTestLayerWithMocks({
          projects: [],
          issues: [],
          statuses: [],
        })

        const error = yield* Effect.flip(
          getIssue({ project: "NONEXISTENT", identifier: "1" }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("ProjectNotFoundError")
        expect((error as ProjectNotFoundError).identifier).toBe("NONEXISTENT")
      })
    )

    // test-revizorro: approved
    it.effect("returns IssueNotFoundError when issue doesn't exist", () =>
      Effect.gen(function* () {
        const project = makeProject()
        const statuses = [makeStatus({ _id: "status-open" as Ref<Status>, name: "Open" })]

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [],
          statuses,
        })

        const error = yield* Effect.flip(
          getIssue({ project: "TEST", identifier: "TEST-999" }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("IssueNotFoundError")
        expect((error as IssueNotFoundError).identifier).toBe("TEST-999")
        expect((error as IssueNotFoundError).project).toBe("TEST")
      })
    )

    // test-revizorro: approved
    it.effect("returns IssueNotFoundError with helpful message", () =>
      Effect.gen(function* () {
        const project = makeProject()
        const statuses = [makeStatus({ _id: "status-open" as Ref<Status>, name: "Open" })]

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [],
          statuses,
        })

        const error = yield* Effect.flip(
          getIssue({ project: "TEST", identifier: "42" }).pipe(Effect.provide(testLayer))
        )

        expect(error.message).toContain("42")
        expect(error.message).toContain("TEST")
      })
    )
  })

  describe("identifier parsing", () => {
    // test-revizorro: approved
    it.effect("handles prefixed identifier HULY-123", () =>
      Effect.gen(function* () {
        const project = makeProject({ identifier: "HULY" })
        const issue = makeIssue({ identifier: "HULY-123", number: 123 })
        const statuses = [makeStatus({ _id: "status-open" as Ref<Status>, name: "Open" })]

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue],
          statuses,
        })

        const result = yield* getIssue({ project: "HULY", identifier: "HULY-123" }).pipe(Effect.provide(testLayer))

        expect(result.identifier).toBe("HULY-123")
      })
    )

    // test-revizorro: approved
    it.effect("handles just number 123", () =>
      Effect.gen(function* () {
        const project = makeProject({ identifier: "PROJ" })
        const issue = makeIssue({ identifier: "PROJ-42", number: 42 })
        const statuses = [makeStatus({ _id: "status-open" as Ref<Status>, name: "Open" })]

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue],
          statuses,
        })

        const result = yield* getIssue({ project: "PROJ", identifier: "42" }).pipe(Effect.provide(testLayer))

        expect(result.identifier).toBe("PROJ-42")
      })
    )
  })
})

describe("createIssue", () => {
  describe("basic functionality", () => {
    // test-revizorro: approved
    it.effect("creates issue with minimal parameters", () =>
      Effect.gen(function* () {
        const project = makeProject({ identifier: "TEST", sequence: 5 })

        const captureAddCollection: MockConfig["captureAddCollection"] = {}

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [],
          statuses: [],
          captureAddCollection,
          updateDocResult: { object: { sequence: 6 } },
        })

        const result = yield* createIssue({
          project: "TEST",
          title: "New Issue",
        }).pipe(Effect.provide(testLayer))

        expect(result.identifier).toBe("TEST-6")
        expect(captureAddCollection.attributes?.title).toBe("New Issue")
      })
    )

    // test-revizorro: approved
    it.effect("creates issue with description", () =>
      Effect.gen(function* () {
        const project = makeProject({ identifier: "TEST", sequence: 1 })

        const captureAddCollection: MockConfig["captureAddCollection"] = {}
        const captureUploadMarkup: MockConfig["captureUploadMarkup"] = {}

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [],
          statuses: [],
          captureAddCollection,
          captureUploadMarkup,
          updateDocResult: { object: { sequence: 2 } },
        })

        const result = yield* createIssue({
          project: "TEST",
          title: "Issue with Description",
          description: "# Markdown\n\nThis is a description.",
        }).pipe(Effect.provide(testLayer))

        expect(result.identifier).toBe("TEST-2")
        expect(captureUploadMarkup.markup).toBe("# Markdown\n\nThis is a description.")
        expect(captureAddCollection.attributes?.description).toBe("markup-ref-123")
      })
    )

    // test-revizorro: approved
    it.effect("creates issue with priority", () =>
      Effect.gen(function* () {
        const project = makeProject({ identifier: "TEST", sequence: 1 })

        const captureAddCollection: MockConfig["captureAddCollection"] = {}

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [],
          statuses: [],
          captureAddCollection,
          updateDocResult: { object: { sequence: 2 } },
        })

        yield* createIssue({
          project: "TEST",
          title: "High Priority Issue",
          priority: "high",
        }).pipe(Effect.provide(testLayer))

        // IssuePriority.High = 2
        expect(captureAddCollection.attributes?.priority).toBe(2)
      })
    )

    // test-revizorro: approved
    it.effect("creates issue with assignee by email", () =>
      Effect.gen(function* () {
        const project = makeProject({ identifier: "TEST", sequence: 1 })
        const person = makePerson({ _id: "person-1" as Ref<Person>, name: "John Doe" })
        const channel = makeChannel({ attachedTo: "person-1" as Ref<Doc>, value: "john@example.com" })

        const captureAddCollection: MockConfig["captureAddCollection"] = {}

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [],
          statuses: [],
          persons: [person],
          channels: [channel],
          captureAddCollection,
          updateDocResult: { object: { sequence: 2 } },
        })

        yield* createIssue({
          project: "TEST",
          title: "Assigned Issue",
          assignee: "john@example.com",
        }).pipe(Effect.provide(testLayer))

        expect(captureAddCollection.attributes?.assignee).toBe("person-1")
      })
    )

    // test-revizorro: approved
    it.effect("creates issue with specific status", () =>
      Effect.gen(function* () {
        const project = makeProject({ identifier: "TEST", sequence: 1 })
        const todoStatus = makeStatus({ _id: "status-todo" as Ref<Status>, name: "Todo" })
        const inProgressStatus = makeStatus({ _id: "status-progress" as Ref<Status>, name: "In Progress" })

        const captureAddCollection: MockConfig["captureAddCollection"] = {}

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [],
          statuses: [todoStatus, inProgressStatus],
          captureAddCollection,
          updateDocResult: { object: { sequence: 2 } },
        })

        yield* createIssue({
          project: "TEST",
          title: "In Progress Issue",
          status: "In Progress",
        }).pipe(Effect.provide(testLayer))

        expect(captureAddCollection.attributes?.status).toBe("status-progress")
      })
    )

    // test-revizorro: approved
    it.effect("uses project default status when not specified", () =>
      Effect.gen(function* () {
        const project = makeProject({
          identifier: "TEST",
          sequence: 1,
          defaultIssueStatus: "status-default" as Ref<Status>,
        })

        const captureAddCollection: MockConfig["captureAddCollection"] = {}

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [],
          statuses: [],
          captureAddCollection,
          updateDocResult: { object: { sequence: 2 } },
        })

        yield* createIssue({
          project: "TEST",
          title: "Default Status Issue",
        }).pipe(Effect.provide(testLayer))

        expect(captureAddCollection.attributes?.status).toBe("status-default")
      })
    )

    // test-revizorro: approved
    it.effect("calculates rank for new issue", () =>
      Effect.gen(function* () {
        const project = makeProject({ identifier: "TEST", sequence: 1 })
        const existingIssue = makeIssue({ rank: "0|hzzzzz:" })

        const captureAddCollection: MockConfig["captureAddCollection"] = {}

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [existingIssue],
          statuses: [],
          captureAddCollection,
          updateDocResult: { object: { sequence: 2 } },
        })

        yield* createIssue({
          project: "TEST",
          title: "Ranked Issue",
        }).pipe(Effect.provide(testLayer))

        // Should have calculated a rank greater than the existing issue's rank
        expect(captureAddCollection.attributes?.rank).toBeDefined()
        expect(typeof captureAddCollection.attributes?.rank).toBe("string")
        expect(captureAddCollection.attributes?.rank > existingIssue.rank).toBe(true)
      })
    )

    // test-revizorro: approved
    it.effect("maps priority strings correctly", () =>
      Effect.gen(function* () {
        const project = makeProject({ identifier: "TEST", sequence: 0 })

        const priorities: Array<{ input: "urgent" | "high" | "medium" | "low" | "no-priority"; expected: number }> = [
          { input: "urgent", expected: 1 },    // IssuePriority.Urgent
          { input: "high", expected: 2 },      // IssuePriority.High
          { input: "medium", expected: 3 },    // IssuePriority.Medium
          { input: "low", expected: 4 },       // IssuePriority.Low
          { input: "no-priority", expected: 0 }, // IssuePriority.NoPriority
        ]

        for (const { input, expected } of priorities) {
          const captureAddCollection: MockConfig["captureAddCollection"] = {}

          const testLayer = createTestLayerWithMocks({
            projects: [project],
            issues: [],
            statuses: [],
            captureAddCollection,
            updateDocResult: { object: { sequence: 1 } },
          })

          yield* createIssue({
            project: "TEST",
            title: `Priority ${input}`,
            priority: input,
          }).pipe(Effect.provide(testLayer))

          expect(captureAddCollection.attributes?.priority).toBe(expected)
        }
      })
    )
  })

  describe("error handling", () => {
    // test-revizorro: approved
    it.effect("returns ProjectNotFoundError when project doesn't exist", () =>
      Effect.gen(function* () {
        const testLayer = createTestLayerWithMocks({
          projects: [],
          issues: [],
          statuses: [],
        })

        const error = yield* Effect.flip(
          createIssue({
            project: "NONEXISTENT",
            title: "Test Issue",
          }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("ProjectNotFoundError")
        expect((error as ProjectNotFoundError).identifier).toBe("NONEXISTENT")
      })
    )

    // test-revizorro: approved
    it.effect("returns InvalidStatusError for unknown status", () =>
      Effect.gen(function* () {
        const project = makeProject({ identifier: "TEST" })
        const todoStatus = makeStatus({ _id: "status-todo" as Ref<Status>, name: "Todo" })

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [],
          statuses: [todoStatus],
        })

        const error = yield* Effect.flip(
          createIssue({
            project: "TEST",
            title: "Test Issue",
            status: "InvalidStatus",
          }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("InvalidStatusError")
        expect((error as InvalidStatusError).status).toBe("InvalidStatus")
      })
    )

    // test-revizorro: scheduled
    it.effect("returns PersonNotFoundError when assignee not found", () =>
      Effect.gen(function* () {
        const project = makeProject({ identifier: "TEST" })

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [],
          statuses: [],
          persons: [],
          channels: [],
        })

        const error = yield* Effect.flip(
          createIssue({
            project: "TEST",
            title: "Test Issue",
            assignee: "nonexistent@example.com",
          }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("PersonNotFoundError")
        expect((error as PersonNotFoundError).identifier).toBe("nonexistent@example.com")
      })
    )

    // test-revizorro: approved
    it.effect("PersonNotFoundError has helpful message", () =>
      Effect.gen(function* () {
        const project = makeProject({ identifier: "TEST" })

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [],
          statuses: [],
          persons: [],
          channels: [],
        })

        const error = yield* Effect.flip(
          createIssue({
            project: "TEST",
            title: "Test Issue",
            assignee: "jane@example.com",
          }).pipe(Effect.provide(testLayer))
        )

        expect(error.message).toContain("jane@example.com")
      })
    )
  })

  describe("status resolution", () => {
    // test-revizorro: approved
    it.effect("matches status case-insensitively", () =>
      Effect.gen(function* () {
        const project = makeProject({ identifier: "TEST", sequence: 1 })
        const inProgressStatus = makeStatus({ _id: "status-progress" as Ref<Status>, name: "In Progress" })

        const captureAddCollection: MockConfig["captureAddCollection"] = {}

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [],
          statuses: [inProgressStatus],
          captureAddCollection,
          updateDocResult: { object: { sequence: 2 } },
        })

        yield* createIssue({
          project: "TEST",
          title: "Test Issue",
          status: "in progress",  // lowercase
        }).pipe(Effect.provide(testLayer))

        expect(captureAddCollection.attributes?.status).toBe("status-progress")
      })
    )
  })

  describe("assignee resolution", () => {
    // test-revizorro: approved
    it.effect("resolves assignee by name when email not found", () =>
      Effect.gen(function* () {
        const project = makeProject({ identifier: "TEST", sequence: 1 })
        const person = makePerson({ _id: "person-2" as Ref<Person>, name: "Jane Developer" })

        const captureAddCollection: MockConfig["captureAddCollection"] = {}

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [],
          statuses: [],
          persons: [person],
          channels: [],  // No email channels
          captureAddCollection,
          updateDocResult: { object: { sequence: 2 } },
        })

        yield* createIssue({
          project: "TEST",
          title: "Test Issue",
          assignee: "Jane Developer",
        }).pipe(Effect.provide(testLayer))

        expect(captureAddCollection.attributes?.assignee).toBe("person-2")
      })
    )
  })

  describe("description handling", () => {
    // test-revizorro: approved
    it.effect("skips upload for empty description", () =>
      Effect.gen(function* () {
        const project = makeProject({ identifier: "TEST", sequence: 1 })

        const captureAddCollection: MockConfig["captureAddCollection"] = {}
        const captureUploadMarkup: MockConfig["captureUploadMarkup"] = {}

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [],
          statuses: [],
          captureAddCollection,
          captureUploadMarkup,
          updateDocResult: { object: { sequence: 2 } },
        })

        yield* createIssue({
          project: "TEST",
          title: "Issue without description",
        }).pipe(Effect.provide(testLayer))

        expect(captureUploadMarkup.markup).toBeUndefined()
        expect(captureAddCollection.attributes?.description).toBeNull()
      })
    )

    // test-revizorro: approved
    it.effect("skips upload for whitespace-only description", () =>
      Effect.gen(function* () {
        const project = makeProject({ identifier: "TEST", sequence: 1 })

        const captureAddCollection: MockConfig["captureAddCollection"] = {}
        const captureUploadMarkup: MockConfig["captureUploadMarkup"] = {}

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [],
          statuses: [],
          captureAddCollection,
          captureUploadMarkup,
          updateDocResult: { object: { sequence: 2 } },
        })

        yield* createIssue({
          project: "TEST",
          title: "Issue with whitespace description",
          description: "   \n\t  ",
        }).pipe(Effect.provide(testLayer))

        expect(captureUploadMarkup.markup).toBeUndefined()
        expect(captureAddCollection.attributes?.description).toBeNull()
      })
    )
  })
})

describe("updateIssue", () => {
  describe("basic functionality", () => {
    // test-revizorro: approved
    it.effect("updates issue title", () =>
      Effect.gen(function* () {
        const project = makeProject({ identifier: "TEST" })
        const issue = makeIssue({ identifier: "TEST-1", title: "Old Title", number: 1 })
        const statuses = [makeStatus({ _id: "status-open" as Ref<Status>, name: "Open" })]

        const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue],
          statuses,
          captureUpdateDoc,
        })

        const result = yield* updateIssue({
          project: "TEST",
          identifier: "TEST-1",
          title: "New Title",
        }).pipe(Effect.provide(testLayer))

        expect(result.identifier).toBe("TEST-1")
        expect(result.updated).toBe(true)
        expect(captureUpdateDoc.operations?.title).toBe("New Title")
      })
    )

    // test-revizorro: approved
    it.effect("updates issue priority", () =>
      Effect.gen(function* () {
        const project = makeProject({ identifier: "TEST" })
        const issue = makeIssue({ identifier: "TEST-1", priority: IssuePriority.Low })
        const statuses = [makeStatus({ _id: "status-open" as Ref<Status>, name: "Open" })]

        const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue],
          statuses,
          captureUpdateDoc,
        })

        yield* updateIssue({
          project: "TEST",
          identifier: "TEST-1",
          priority: "urgent",
        }).pipe(Effect.provide(testLayer))

        // IssuePriority.Urgent = 1
        expect(captureUpdateDoc.operations?.priority).toBe(1)
      })
    )

    // test-revizorro: approved
    it.effect("updates issue status", () =>
      Effect.gen(function* () {
        const project = makeProject({ identifier: "TEST" })
        const issue = makeIssue({ identifier: "TEST-1", status: "status-open" as Ref<Status> })
        const todoStatus = makeStatus({ _id: "status-todo" as Ref<Status>, name: "Todo" })
        const doneStatus = makeStatus({ _id: "status-done" as Ref<Status>, name: "Done" })
        const statuses = [todoStatus, doneStatus]

        const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue],
          statuses,
          captureUpdateDoc,
        })

        yield* updateIssue({
          project: "TEST",
          identifier: "TEST-1",
          status: "Done",
        }).pipe(Effect.provide(testLayer))

        expect(captureUpdateDoc.operations?.status).toBe("status-done")
      })
    )

    // test-revizorro: approved
    it.effect("updates issue description", () =>
      Effect.gen(function* () {
        const project = makeProject({ identifier: "TEST" })
        const issue = makeIssue({ identifier: "TEST-1" })
        const statuses = [makeStatus({ _id: "status-open" as Ref<Status>, name: "Open" })]

        const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}
        const captureUploadMarkup: MockConfig["captureUploadMarkup"] = {}

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue],
          statuses,
          captureUpdateDoc,
          captureUploadMarkup,
        })

        yield* updateIssue({
          project: "TEST",
          identifier: "TEST-1",
          description: "# New Description\n\nUpdated content.",
        }).pipe(Effect.provide(testLayer))

        expect(captureUploadMarkup.markup).toBe("# New Description\n\nUpdated content.")
        expect(captureUpdateDoc.operations?.description).toBe("markup-ref-123")
      })
    )

    // test-revizorro: approved
    it.effect("updates issue assignee", () =>
      Effect.gen(function* () {
        const project = makeProject({ identifier: "TEST" })
        const issue = makeIssue({ identifier: "TEST-1", assignee: null })
        const person = makePerson({ _id: "person-1" as Ref<Person>, name: "Jane Doe" })
        const channel = makeChannel({ attachedTo: "person-1" as Ref<Doc>, value: "jane@example.com" })
        const statuses = [makeStatus({ _id: "status-open" as Ref<Status>, name: "Open" })]

        const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue],
          statuses,
          persons: [person],
          channels: [channel],
          captureUpdateDoc,
        })

        yield* updateIssue({
          project: "TEST",
          identifier: "TEST-1",
          assignee: "jane@example.com",
        }).pipe(Effect.provide(testLayer))

        expect(captureUpdateDoc.operations?.assignee).toBe("person-1")
      })
    )

    // test-revizorro: approved
    it.effect("unassigns issue when assignee is null", () =>
      Effect.gen(function* () {
        const project = makeProject({ identifier: "TEST" })
        const issue = makeIssue({ identifier: "TEST-1", assignee: "person-1" as Ref<Person> })
        const statuses = [makeStatus({ _id: "status-open" as Ref<Status>, name: "Open" })]

        const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue],
          statuses,
          captureUpdateDoc,
        })

        yield* updateIssue({
          project: "TEST",
          identifier: "TEST-1",
          assignee: null,
        }).pipe(Effect.provide(testLayer))

        expect(captureUpdateDoc.operations?.assignee).toBeNull()
      })
    )

    // test-revizorro: approved
    it.effect("returns updated=false when no fields provided", () =>
      Effect.gen(function* () {
        const project = makeProject({ identifier: "TEST" })
        const issue = makeIssue({ identifier: "TEST-1" })
        const statuses = [makeStatus({ _id: "status-open" as Ref<Status>, name: "Open" })]

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue],
          statuses,
        })

        const result = yield* updateIssue({
          project: "TEST",
          identifier: "TEST-1",
        }).pipe(Effect.provide(testLayer))

        expect(result.identifier).toBe("TEST-1")
        expect(result.updated).toBe(false)
      })
    )

    // test-revizorro: approved
    it.effect("updates multiple fields at once", () =>
      Effect.gen(function* () {
        const project = makeProject({ identifier: "TEST" })
        const issue = makeIssue({ identifier: "TEST-1" })
        const doneStatus = makeStatus({ _id: "status-done" as Ref<Status>, name: "Done" })
        const statuses = [doneStatus]

        const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue],
          statuses,
          captureUpdateDoc,
        })

        yield* updateIssue({
          project: "TEST",
          identifier: "TEST-1",
          title: "Updated Title",
          priority: "high",
          status: "Done",
        }).pipe(Effect.provide(testLayer))

        expect(captureUpdateDoc.operations?.title).toBe("Updated Title")
        expect(captureUpdateDoc.operations?.priority).toBe(2) // IssuePriority.High
        expect(captureUpdateDoc.operations?.status).toBe("status-done")
      })
    )

    // test-revizorro: approved
    it.effect("clears description when empty string provided", () =>
      Effect.gen(function* () {
        const project = makeProject({ identifier: "TEST" })
        const issue = makeIssue({ identifier: "TEST-1", description: "markup-old" as unknown as null })
        const statuses = [makeStatus({ _id: "status-open" as Ref<Status>, name: "Open" })]

        const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue],
          statuses,
          captureUpdateDoc,
        })

        yield* updateIssue({
          project: "TEST",
          identifier: "TEST-1",
          description: "",
        }).pipe(Effect.provide(testLayer))

        expect(captureUpdateDoc.operations?.description).toBeNull()
      })
    )
  })

  describe("identifier parsing", () => {
    // test-revizorro: approved
    it.effect("finds issue by full identifier", () =>
      Effect.gen(function* () {
        const project = makeProject({ identifier: "HULY" })
        const issue = makeIssue({ identifier: "HULY-42", number: 42 })
        const statuses = [makeStatus({ _id: "status-open" as Ref<Status>, name: "Open" })]

        const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue],
          statuses,
          captureUpdateDoc,
        })

        const result = yield* updateIssue({
          project: "HULY",
          identifier: "HULY-42",
          title: "Updated",
        }).pipe(Effect.provide(testLayer))

        expect(result.identifier).toBe("HULY-42")
      })
    )

    // test-revizorro: approved
    it.effect("finds issue by numeric identifier", () =>
      Effect.gen(function* () {
        const project = makeProject({ identifier: "TEST" })
        const issue = makeIssue({ identifier: "TEST-99", number: 99 })
        const statuses = [makeStatus({ _id: "status-open" as Ref<Status>, name: "Open" })]

        const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue],
          statuses,
          captureUpdateDoc,
        })

        const result = yield* updateIssue({
          project: "TEST",
          identifier: "99",
          title: "Updated",
        }).pipe(Effect.provide(testLayer))

        expect(result.identifier).toBe("TEST-99")
      })
    )
  })

  describe("error handling", () => {
    // test-revizorro: approved
    it.effect("returns ProjectNotFoundError when project doesn't exist", () =>
      Effect.gen(function* () {
        const testLayer = createTestLayerWithMocks({
          projects: [],
          issues: [],
          statuses: [],
        })

        const error = yield* Effect.flip(
          updateIssue({
            project: "NONEXISTENT",
            identifier: "1",
            title: "New Title",
          }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("ProjectNotFoundError")
        expect((error as ProjectNotFoundError).identifier).toBe("NONEXISTENT")
      })
    )

    // test-revizorro: approved
    it.effect("returns IssueNotFoundError when issue doesn't exist", () =>
      Effect.gen(function* () {
        const project = makeProject({ identifier: "TEST" })
        const statuses = [makeStatus({ _id: "status-open" as Ref<Status>, name: "Open" })]

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [],
          statuses,
        })

        const error = yield* Effect.flip(
          updateIssue({
            project: "TEST",
            identifier: "TEST-999",
            title: "New Title",
          }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("IssueNotFoundError")
        expect((error as IssueNotFoundError).identifier).toBe("TEST-999")
        expect((error as IssueNotFoundError).project).toBe("TEST")
      })
    )

    // test-revizorro: approved
    it.effect("returns InvalidStatusError for unknown status", () =>
      Effect.gen(function* () {
        const project = makeProject({ identifier: "TEST" })
        const issue = makeIssue({ identifier: "TEST-1" })
        const todoStatus = makeStatus({ _id: "status-todo" as Ref<Status>, name: "Todo" })

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue],
          statuses: [todoStatus],
        })

        const error = yield* Effect.flip(
          updateIssue({
            project: "TEST",
            identifier: "TEST-1",
            status: "InvalidStatus",
          }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("InvalidStatusError")
        expect((error as InvalidStatusError).status).toBe("InvalidStatus")
        expect((error as InvalidStatusError).project).toBe("TEST")
      })
    )

    // test-revizorro: scheduled
    it.effect("returns PersonNotFoundError when assignee not found", () =>
      Effect.gen(function* () {
        const project = makeProject({ identifier: "TEST" })
        const issue = makeIssue({ identifier: "TEST-1" })
        const statuses = [makeStatus({ _id: "status-open" as Ref<Status>, name: "Open" })]

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue],
          statuses,
          persons: [],
          channels: [],
        })

        const error = yield* Effect.flip(
          updateIssue({
            project: "TEST",
            identifier: "TEST-1",
            assignee: "nonexistent@example.com",
          }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("PersonNotFoundError")
        expect((error as PersonNotFoundError).identifier).toBe("nonexistent@example.com")
      })
    )
  })

  describe("status resolution", () => {
    // test-revizorro: approved
    it.effect("matches status case-insensitively", () =>
      Effect.gen(function* () {
        const project = makeProject({ identifier: "TEST" })
        const issue = makeIssue({ identifier: "TEST-1" })
        const inProgressStatus = makeStatus({ _id: "status-progress" as Ref<Status>, name: "In Progress" })

        const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue],
          statuses: [inProgressStatus],
          captureUpdateDoc,
        })

        yield* updateIssue({
          project: "TEST",
          identifier: "TEST-1",
          status: "in progress",  // lowercase
        }).pipe(Effect.provide(testLayer))

        expect(captureUpdateDoc.operations?.status).toBe("status-progress")
      })
    )
  })

  describe("assignee resolution", () => {
    // test-revizorro: approved
    it.effect("resolves assignee by name when email not found", () =>
      Effect.gen(function* () {
        const project = makeProject({ identifier: "TEST" })
        const issue = makeIssue({ identifier: "TEST-1" })
        const person = makePerson({ _id: "person-2" as Ref<Person>, name: "Jane Developer" })
        const statuses = [makeStatus({ _id: "status-open" as Ref<Status>, name: "Open" })]

        const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue],
          statuses,
          persons: [person],
          channels: [],  // No email channels
          captureUpdateDoc,
        })

        yield* updateIssue({
          project: "TEST",
          identifier: "TEST-1",
          assignee: "Jane Developer",
        }).pipe(Effect.provide(testLayer))

        expect(captureUpdateDoc.operations?.assignee).toBe("person-2")
      })
    )
  })
})

describe("addLabel", () => {
  describe("basic functionality", () => {
    // test-revizorro: approved
    it.effect("adds a new label to an issue", () =>
      Effect.gen(function* () {
        const project = makeProject({ identifier: "TEST" })
        const issue = makeIssue({ identifier: "TEST-1", number: 1 })

        const captureAddCollection: MockConfig["captureAddCollection"] = {}
        const captureCreateDoc: MockConfig["captureCreateDoc"] = {}

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue],
          tagElements: [],
          tagReferences: [],
          captureAddCollection,
          captureCreateDoc,
        })

        const result = yield* addLabel({
          project: "TEST",
          identifier: "TEST-1",
          label: "Bug",
        }).pipe(Effect.provide(testLayer))

        expect(result.identifier).toBe("TEST-1")
        expect(result.labelAdded).toBe(true)
        // Should have created a new tag element
        expect(captureCreateDoc.attributes?.title).toBe("Bug")
        // Should have added the tag reference
        expect(captureAddCollection.class).toBe(tags.class.TagReference)
        expect(captureAddCollection.attributes?.title).toBe("Bug")
      })
    )

    // test-revizorro: approved
    it.effect("uses existing tag element when label already exists in project", () =>
      Effect.gen(function* () {
        const project = makeProject({ identifier: "TEST" })
        const issue = makeIssue({ identifier: "TEST-1", number: 1 })
        const existingTag = makeTagElement({
          _id: "tag-existing" as Ref<TagElement>,
          title: "Bug",
          color: 5,
        })

        const captureAddCollection: MockConfig["captureAddCollection"] = {}
        const captureCreateDoc: MockConfig["captureCreateDoc"] = {}

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue],
          tagElements: [existingTag],
          tagReferences: [],
          captureAddCollection,
          captureCreateDoc,
        })

        const result = yield* addLabel({
          project: "TEST",
          identifier: "TEST-1",
          label: "Bug",
        }).pipe(Effect.provide(testLayer))

        expect(result.identifier).toBe("TEST-1")
        expect(result.labelAdded).toBe(true)
        // Should NOT have created a new tag element
        expect(captureCreateDoc.attributes).toBeUndefined()
        // Should have added the tag reference with existing tag's color
        expect(captureAddCollection.attributes?.color).toBe(5)
        expect(captureAddCollection.attributes?.tag).toBe("tag-existing")
      })
    )

    // test-revizorro: approved
    it.effect("returns labelAdded=false when label already attached (idempotent)", () =>
      Effect.gen(function* () {
        const project = makeProject({ identifier: "TEST" })
        const issue = makeIssue({ identifier: "TEST-1", number: 1 })
        const existingTag = makeTagElement({
          _id: "tag-existing" as Ref<TagElement>,
          title: "Bug",
        })
        const existingRef = makeTagReference({
          attachedTo: "issue-1" as Ref<Doc>,
          attachedToClass: tracker.class.Issue,
          title: "Bug",
          tag: "tag-existing" as Ref<TagElement>,
        })

        const captureAddCollection: MockConfig["captureAddCollection"] = {}

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue],
          tagElements: [existingTag],
          tagReferences: [existingRef],
          captureAddCollection,
        })

        const result = yield* addLabel({
          project: "TEST",
          identifier: "TEST-1",
          label: "Bug",
        }).pipe(Effect.provide(testLayer))

        expect(result.identifier).toBe("TEST-1")
        expect(result.labelAdded).toBe(false)
        // Should NOT have called addCollection
        expect(captureAddCollection.attributes).toBeUndefined()
      })
    )

    // test-revizorro: approved
    it.effect("handles case-insensitive label matching for idempotency", () =>
      Effect.gen(function* () {
        const project = makeProject({ identifier: "TEST" })
        const issue = makeIssue({ identifier: "TEST-1", number: 1 })
        const existingRef = makeTagReference({
          attachedTo: "issue-1" as Ref<Doc>,
          attachedToClass: tracker.class.Issue,
          title: "Bug",
        })

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue],
          tagReferences: [existingRef],
        })

        const result = yield* addLabel({
          project: "TEST",
          identifier: "TEST-1",
          label: "BUG",  // uppercase
        }).pipe(Effect.provide(testLayer))

        expect(result.labelAdded).toBe(false)
      })
    )

    // test-revizorro: approved
    it.effect("uses provided color when creating new tag", () =>
      Effect.gen(function* () {
        const project = makeProject({ identifier: "TEST" })
        const issue = makeIssue({ identifier: "TEST-1", number: 1 })

        const captureCreateDoc: MockConfig["captureCreateDoc"] = {}

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue],
          tagElements: [],
          tagReferences: [],
          captureCreateDoc,
        })

        yield* addLabel({
          project: "TEST",
          identifier: "TEST-1",
          label: "Feature",
          color: 7,
        }).pipe(Effect.provide(testLayer))

        expect(captureCreateDoc.attributes?.color).toBe(7)
      })
    )

    // test-revizorro: approved
    it.effect("uses default color 0 when not specified", () =>
      Effect.gen(function* () {
        const project = makeProject({ identifier: "TEST" })
        const issue = makeIssue({ identifier: "TEST-1", number: 1 })

        const captureCreateDoc: MockConfig["captureCreateDoc"] = {}

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue],
          tagElements: [],
          tagReferences: [],
          captureCreateDoc,
        })

        yield* addLabel({
          project: "TEST",
          identifier: "TEST-1",
          label: "Enhancement",
        }).pipe(Effect.provide(testLayer))

        expect(captureCreateDoc.attributes?.color).toBe(0)
      })
    )

    // test-revizorro: approved
    it.effect("trims whitespace from label name", () =>
      Effect.gen(function* () {
        const project = makeProject({ identifier: "TEST" })
        const issue = makeIssue({ identifier: "TEST-1", number: 1 })

        const captureCreateDoc: MockConfig["captureCreateDoc"] = {}

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue],
          tagElements: [],
          tagReferences: [],
          captureCreateDoc,
        })

        yield* addLabel({
          project: "TEST",
          identifier: "TEST-1",
          label: "  Trimmed Label  ",
        }).pipe(Effect.provide(testLayer))

        expect(captureCreateDoc.attributes?.title).toBe("Trimmed Label")
      })
    )
  })

  describe("identifier parsing", () => {
    // test-revizorro: approved
    it.effect("finds issue by full identifier", () =>
      Effect.gen(function* () {
        const project = makeProject({ identifier: "HULY" })
        const issue = makeIssue({ identifier: "HULY-42", number: 42 })

        const captureAddCollection: MockConfig["captureAddCollection"] = {}

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue],
          tagElements: [],
          tagReferences: [],
          captureAddCollection,
        })

        const result = yield* addLabel({
          project: "HULY",
          identifier: "HULY-42",
          label: "Bug",
        }).pipe(Effect.provide(testLayer))

        expect(result.identifier).toBe("HULY-42")
        expect(result.labelAdded).toBe(true)
        // Verify addCollection was called to create TagReference
        expect(captureAddCollection.attributes).toBeDefined()
        expect(captureAddCollection.attributes?.title).toBe("Bug")
      })
    )

    // test-revizorro: approved
    it.effect("finds issue by numeric identifier", () =>
      Effect.gen(function* () {
        const project = makeProject({ identifier: "TEST" })
        const issue = makeIssue({ identifier: "TEST-99", number: 99 })

        const captureAddCollection: MockConfig["captureAddCollection"] = {}

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue],
          tagElements: [],
          tagReferences: [],
          captureAddCollection,
        })

        const result = yield* addLabel({
          project: "TEST",
          identifier: "99",
          label: "Bug",
        }).pipe(Effect.provide(testLayer))

        expect(result.identifier).toBe("TEST-99")
        expect(result.labelAdded).toBe(true)
      })
    )
  })

  describe("error handling", () => {
    // test-revizorro: approved
    it.effect("returns ProjectNotFoundError when project doesn't exist", () =>
      Effect.gen(function* () {
        const testLayer = createTestLayerWithMocks({
          projects: [],
          issues: [],
        })

        const error = yield* Effect.flip(
          addLabel({
            project: "NONEXISTENT",
            identifier: "1",
            label: "Bug",
          }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("ProjectNotFoundError")
        expect((error as ProjectNotFoundError).identifier).toBe("NONEXISTENT")
      })
    )

    // test-revizorro: approved
    it.effect("returns IssueNotFoundError when issue doesn't exist", () =>
      Effect.gen(function* () {
        const project = makeProject({ identifier: "TEST" })

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [],
        })

        const error = yield* Effect.flip(
          addLabel({
            project: "TEST",
            identifier: "TEST-999",
            label: "Bug",
          }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("IssueNotFoundError")
        expect((error as IssueNotFoundError).identifier).toBe("TEST-999")
        expect((error as IssueNotFoundError).project).toBe("TEST")
      })
    )
  })
})
