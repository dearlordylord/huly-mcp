import { describe, it } from "@effect/vitest"
import type { ChatMessage } from "@hcengineering/chunter"
import { type Doc, type PersonId, type Ref, type Space, toFindResult } from "@hcengineering/core"
import type { TaskType } from "@hcengineering/task"
import {
  type Issue as HulyIssue,
  type IssueStatus,
  type Project as HulyProject,
  TimeReportDayType
} from "@hcengineering/tracker"
import { Effect } from "effect"
import { expect } from "vitest"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import type { CommentNotFoundError, IssueNotFoundError, ProjectNotFoundError } from "../../../src/huly/errors.js"
import { addComment, deleteComment, listComments, updateComment } from "../../../src/huly/operations/comments.js"
import { commentBrandId, issueIdentifier, projectIdentifier } from "../../helpers/brands.js"

import { chunter, tracker } from "../../../src/huly/huly-plugins.js"

// --- Mock Data Builders ---

const asProject = (v: unknown) => v as HulyProject
const asChatMessage = (v: unknown) => v as ChatMessage

const makeProject = (overrides?: Partial<HulyProject>): HulyProject =>
  asProject({
    _id: "project-1" as Ref<HulyProject>,
    _class: tracker.class.Project,
    space: "space-1" as Ref<Space>,
    identifier: "TEST",
    name: "Test Project",
    sequence: 1,
    defaultIssueStatus: "status-open" as Ref<IssueStatus>,
    defaultTimeReportDay: TimeReportDayType.CurrentWorkDay,
    modifiedBy: "user-1" as PersonId,
    modifiedOn: Date.now(),
    createdBy: "user-1" as PersonId,
    createdOn: Date.now(),
    ...overrides
  })

const makeIssue = (overrides?: Partial<HulyIssue>): HulyIssue => {
  const result: HulyIssue = {
    _id: "issue-1" as Ref<HulyIssue>,
    _class: tracker.class.Issue,
    space: "project-1" as Ref<HulyProject>,
    identifier: "TEST-1",
    title: "Test Issue",
    description: null,
    status: "status-open" as Ref<IssueStatus>,
    priority: 3,
    assignee: null,
    kind: "task-type-1" as Ref<TaskType>,
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
    modifiedBy: "user-1" as PersonId,
    modifiedOn: Date.now(),
    createdBy: "user-1" as PersonId,
    createdOn: Date.now(),
    ...overrides
  }
  return result
}

const makeChatMessage = (overrides?: Partial<ChatMessage>): ChatMessage =>
  asChatMessage({
    _id: "msg-1" as Ref<ChatMessage>,
    _class: chunter.class.ChatMessage,
    space: "project-1" as Ref<Space>,
    message: "Test message",
    attachedTo: "issue-1" as Ref<Doc>,
    attachedToClass: tracker.class.Issue,
    collection: "comments",
    modifiedBy: "user-1" as PersonId,
    modifiedOn: Date.now(),
    createdBy: "user-1" as PersonId,
    createdOn: Date.now(),
    editedOn: undefined,
    ...overrides
  })

// --- Test Helpers ---

interface MockConfig {
  projects?: Array<HulyProject>
  issues?: Array<HulyIssue>
  messages?: Array<ChatMessage>
  captureMessageQuery?: { query?: Record<string, unknown>; options?: Record<string, unknown> }
  captureAddCollection?: { attributes?: Record<string, unknown>; id?: string }
  captureUpdateDoc?: { operations?: Record<string, unknown> }
  captureRemoveDoc?: { id?: string }
}

const createTestLayerWithMocks = (config: MockConfig) => {
  const projects = config.projects ?? []
  const issues = config.issues ?? []
  const messages = config.messages ?? []

  const findAllImpl: HulyClientOperations["findAll"] = ((_class: unknown, query: unknown, options: unknown) => {
    if (_class === chunter.class.ChatMessage) {
      if (config.captureMessageQuery) {
        config.captureMessageQuery.query = query as Record<string, unknown>
        config.captureMessageQuery.options = options as Record<string, unknown>
      }
      const q = query as Record<string, unknown>
      // Filter by attachedTo (issue id)
      let filtered = messages.filter(m =>
        m.attachedTo === q.attachedTo
        && m.attachedToClass === q.attachedToClass
      )
      // Apply sorting if specified
      const opts = options as { sort?: Record<string, number> } | undefined
      if (opts?.sort?.createdOn !== undefined) {
        const direction = opts.sort.createdOn
        filtered = filtered.sort((a, b) => direction * ((a.createdOn ?? 0) - (b.createdOn ?? 0)))
      }
      return Effect.succeed(toFindResult(filtered as Array<Doc>))
    }
    return Effect.succeed(toFindResult([]))
  }) as HulyClientOperations["findAll"]

  const findOneImpl: HulyClientOperations["findOne"] = ((_class: unknown, query: unknown) => {
    if (_class === tracker.class.Project) {
      const identifier = (query as Record<string, unknown>).identifier as string
      const found = projects.find(p => p.identifier === identifier)
      return Effect.succeed(found as Doc | undefined)
    }
    if (_class === tracker.class.Issue) {
      const q = query as Record<string, unknown>
      const found = issues.find(i =>
        (q.identifier && i.identifier === q.identifier)
        || (q.number && i.number === q.number)
        || (q.space && i.space === q.space && !q.identifier && !q.number)
      )
      return Effect.succeed(found as Doc | undefined)
    }
    if (_class === chunter.class.ChatMessage) {
      const q = query as Record<string, unknown>
      const found = messages.find(m => m._id === q._id && m.attachedTo === q.attachedTo)
      return Effect.succeed(found as Doc | undefined)
    }
    return Effect.succeed(undefined)
  }) as HulyClientOperations["findOne"]

  const addCollectionImpl: HulyClientOperations["addCollection"] = ((
    _class: unknown,
    _space: unknown,
    _attachedTo: unknown,
    _attachedToClass: unknown,
    _collection: unknown,
    attributes: unknown,
    id?: unknown
  ) => {
    if (config.captureAddCollection) {
      config.captureAddCollection.attributes = attributes as Record<string, unknown>
      config.captureAddCollection.id = id as string
    }
    return Effect.succeed((id ?? "new-comment-id") as Ref<Doc>)
  }) as HulyClientOperations["addCollection"]

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

  return HulyClient.testLayer({
    findAll: findAllImpl,
    findOne: findOneImpl,
    addCollection: addCollectionImpl,
    updateDoc: updateDocImpl,
    removeDoc: removeDocImpl
  })
}

// --- Tests ---

describe("listComments", () => {
  describe("basic functionality", () => {
    // test-revizorro: approved
    it.effect("returns comments for an issue", () =>
      Effect.gen(function*() {
        const project = makeProject({ _id: "proj-1" as Ref<HulyProject>, identifier: "TEST" })
        const issue = makeIssue({
          _id: "issue-1" as Ref<HulyIssue>,
          identifier: "TEST-1",
          number: 1,
          space: "proj-1" as Ref<HulyProject>
        })
        const messages = [
          makeChatMessage({
            _id: "msg-1" as Ref<ChatMessage>,
            message: "First comment",
            attachedTo: "issue-1" as Ref<Doc>,
            createdOn: 1000
          }),
          makeChatMessage({
            _id: "msg-2" as Ref<ChatMessage>,
            message: "Second comment",
            attachedTo: "issue-1" as Ref<Doc>,
            createdOn: 2000
          })
        ]

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue],
          messages
        })

        const result = yield* listComments({
          project: projectIdentifier("TEST"),
          issueIdentifier: issueIdentifier("TEST-1")
        }).pipe(Effect.provide(testLayer))

        expect(result).toHaveLength(2)
        // Sorted by createdOn ascending (oldest first)
        expect(result[0].body).toBe("First comment")
        expect(result[1].body).toBe("Second comment")
      }))

    // test-revizorro: approved
    it.effect("returns empty array when issue has no comments", () =>
      Effect.gen(function*() {
        const project = makeProject({ identifier: "TEST" })
        const issue = makeIssue({ identifier: "TEST-1", number: 1 })

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue],
          messages: []
        })

        const result = yield* listComments({
          project: projectIdentifier("TEST"),
          issueIdentifier: issueIdentifier("TEST-1")
        }).pipe(Effect.provide(testLayer))

        expect(result).toHaveLength(0)
      }))

    // test-revizorro: approved
    it.effect("transforms message to comment format", () =>
      Effect.gen(function*() {
        const project = makeProject({ identifier: "TEST" })
        const issue = makeIssue({ identifier: "TEST-1", number: 1 })
        const messages = [
          makeChatMessage({
            _id: "msg-abc" as Ref<ChatMessage>,
            message: "Comment body here",
            attachedTo: "issue-1" as Ref<Doc>,
            modifiedBy: "person-123" as PersonId,
            createdOn: 1706500000000,
            modifiedOn: 1706600000000,
            editedOn: 1706550000000
          })
        ]

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue],
          messages
        })

        const result = yield* listComments({
          project: projectIdentifier("TEST"),
          issueIdentifier: issueIdentifier("TEST-1")
        }).pipe(Effect.provide(testLayer))

        expect(result[0].id).toBe("msg-abc")
        expect(result[0].body).toBe("Comment body here")
        expect(result[0].authorId).toBe("person-123")
        expect(result[0].createdOn).toBe(1706500000000)
        expect(result[0].modifiedOn).toBe(1706600000000)
        expect(result[0].editedOn).toBe(1706550000000)
      }))
  })

  describe("identifier parsing", () => {
    // test-revizorro: approved
    it.effect("finds issue by full identifier HULY-123", () =>
      Effect.gen(function*() {
        const project = makeProject({ _id: "proj-huly" as Ref<HulyProject>, identifier: "HULY" })
        const issue = makeIssue({
          _id: "issue-huly" as Ref<HulyIssue>,
          identifier: "HULY-123",
          number: 123,
          space: "proj-huly" as Ref<HulyProject>
        })
        const messages = [
          makeChatMessage({
            message: "Found by full ID",
            attachedTo: "issue-huly" as Ref<Doc>
          })
        ]

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue],
          messages
        })

        const result = yield* listComments({
          project: projectIdentifier("HULY"),
          issueIdentifier: issueIdentifier("HULY-123")
        }).pipe(Effect.provide(testLayer))

        expect(result).toHaveLength(1)
      }))

    // test-revizorro: suspect | only verifies result length, not that numeric identifier resolved to correct issue
    it.effect("finds issue by numeric identifier 42", () =>
      Effect.gen(function*() {
        const project = makeProject({ _id: "proj-test" as Ref<HulyProject>, identifier: "TEST" })
        const issue = makeIssue({
          _id: "issue-42" as Ref<HulyIssue>,
          identifier: "TEST-42",
          number: 42,
          space: "proj-test" as Ref<HulyProject>
        })
        const messages = [
          makeChatMessage({
            message: "Found by number",
            attachedTo: "issue-42" as Ref<Doc>
          })
        ]

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue],
          messages
        })

        const result = yield* listComments({
          project: projectIdentifier("TEST"),
          issueIdentifier: issueIdentifier("42")
        }).pipe(Effect.provide(testLayer))

        expect(result).toHaveLength(1)
      }))

    // test-revizorro: approved
    it.effect("handles lowercase identifier test-5", () =>
      Effect.gen(function*() {
        const project = makeProject({ _id: "proj-test" as Ref<HulyProject>, identifier: "TEST" })
        const issue = makeIssue({
          _id: "issue-5" as Ref<HulyIssue>,
          identifier: "TEST-5",
          number: 5,
          space: "proj-test" as Ref<HulyProject>
        })
        const messages = [
          makeChatMessage({
            message: "Lowercase match",
            attachedTo: "issue-5" as Ref<Doc>
          })
        ]

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue],
          messages
        })

        const result = yield* listComments({
          project: projectIdentifier("TEST"),
          issueIdentifier: issueIdentifier("test-5")
        }).pipe(Effect.provide(testLayer))

        expect(result).toHaveLength(1)
      }))
  })

  describe("limit handling", () => {
    // test-revizorro: approved
    it.effect("uses default limit of 50", () =>
      Effect.gen(function*() {
        const project = makeProject({ identifier: "TEST" })
        const issue = makeIssue({ identifier: "TEST-1", number: 1 })

        const captureQuery: MockConfig["captureMessageQuery"] = {}

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue],
          messages: [],
          captureMessageQuery: captureQuery
        })

        yield* listComments({
          project: projectIdentifier("TEST"),
          issueIdentifier: issueIdentifier("TEST-1")
        }).pipe(Effect.provide(testLayer))

        expect(captureQuery.options?.limit).toBe(50)
      }))

    // test-revizorro: approved
    it.effect("enforces max limit of 200", () =>
      Effect.gen(function*() {
        const project = makeProject({ identifier: "TEST" })
        const issue = makeIssue({ identifier: "TEST-1", number: 1 })

        const captureQuery: MockConfig["captureMessageQuery"] = {}

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue],
          messages: [],
          captureMessageQuery: captureQuery
        })

        yield* listComments({
          project: projectIdentifier("TEST"),
          issueIdentifier: issueIdentifier("TEST-1"),
          limit: 500
        }).pipe(Effect.provide(testLayer))

        expect(captureQuery.options?.limit).toBe(200)
      }))

    // test-revizorro: approved
    it.effect("uses provided limit when under max", () =>
      Effect.gen(function*() {
        const project = makeProject({ identifier: "TEST" })
        const issue = makeIssue({ identifier: "TEST-1", number: 1 })

        const captureQuery: MockConfig["captureMessageQuery"] = {}

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue],
          messages: [],
          captureMessageQuery: captureQuery
        })

        yield* listComments({
          project: projectIdentifier("TEST"),
          issueIdentifier: issueIdentifier("TEST-1"),
          limit: 25
        }).pipe(Effect.provide(testLayer))

        expect(captureQuery.options?.limit).toBe(25)
      }))
  })

  describe("error handling", () => {
    // test-revizorro: approved
    it.effect("returns ProjectNotFoundError when project doesn't exist", () =>
      Effect.gen(function*() {
        const testLayer = createTestLayerWithMocks({
          projects: [],
          issues: [],
          messages: []
        })

        const error = yield* Effect.flip(
          listComments({
            project: projectIdentifier("NONEXISTENT"),
            issueIdentifier: issueIdentifier("1")
          }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("ProjectNotFoundError")
        expect((error as ProjectNotFoundError).identifier).toBe("NONEXISTENT")
      }))

    // test-revizorro: approved
    it.effect("returns IssueNotFoundError when issue doesn't exist", () =>
      Effect.gen(function*() {
        const project = makeProject({ identifier: "TEST" })

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [],
          messages: []
        })

        const error = yield* Effect.flip(
          listComments({
            project: projectIdentifier("TEST"),
            issueIdentifier: issueIdentifier("TEST-999")
          }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("IssueNotFoundError")
        expect((error as IssueNotFoundError).identifier).toBe("TEST-999")
        expect((error as IssueNotFoundError).project).toBe("TEST")
      }))
  })
})

describe("addComment", () => {
  describe("basic functionality", () => {
    // test-revizorro: approved
    it.effect("adds a comment to an issue", () =>
      Effect.gen(function*() {
        const project = makeProject({ _id: "proj-1" as Ref<HulyProject>, identifier: "TEST" })
        const issue = makeIssue({
          _id: "issue-1" as Ref<HulyIssue>,
          identifier: "TEST-1",
          number: 1,
          space: "proj-1" as Ref<HulyProject>
        })

        const captureAddCollection: MockConfig["captureAddCollection"] = {}

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue],
          captureAddCollection
        })

        const result = yield* addComment({
          project: projectIdentifier("TEST"),
          issueIdentifier: issueIdentifier("TEST-1"),
          body: "This is my new comment"
        }).pipe(Effect.provide(testLayer))

        expect(result.commentId).toBeDefined()
        expect(result.issueIdentifier).toBe("TEST-1")
        expect(captureAddCollection.attributes?.message).toBe("This is my new comment")
      }))

    // test-revizorro: approved
    it.effect("supports markdown in comment body", () =>
      Effect.gen(function*() {
        const project = makeProject({ identifier: "TEST" })
        const issue = makeIssue({ identifier: "TEST-1", number: 1 })

        const captureAddCollection: MockConfig["captureAddCollection"] = {}

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue],
          captureAddCollection
        })

        yield* addComment({
          project: projectIdentifier("TEST"),
          issueIdentifier: issueIdentifier("TEST-1"),
          body: "# Heading\n\n- Item 1\n- Item 2\n\n```js\nconsole.log('test');\n```"
        }).pipe(Effect.provide(testLayer))

        expect(captureAddCollection.attributes?.message).toContain("# Heading")
        expect(captureAddCollection.attributes?.message).toContain("console.log")
      }))

    // test-revizorro: suspect | Weak assertions: only checks commentId.length > 0 and type, not actual ID value
    it.effect("returns comment ID and issue identifier", () =>
      Effect.gen(function*() {
        const project = makeProject({ identifier: "HULY" })
        const issue = makeIssue({ identifier: "HULY-42", number: 42 })

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue]
        })

        const result = yield* addComment({
          project: projectIdentifier("HULY"),
          issueIdentifier: issueIdentifier("42"),
          body: "Comment added"
        }).pipe(Effect.provide(testLayer))

        // commentId is generated using generateId(), so just verify it exists
        expect(result.commentId).toBeDefined()
        expect(typeof result.commentId).toBe("string")
        expect(result.commentId.length).toBeGreaterThan(0)
        expect(result.issueIdentifier).toBe("HULY-42")
      }))
  })

  describe("error handling", () => {
    // test-revizorro: approved
    it.effect("returns ProjectNotFoundError when project doesn't exist", () =>
      Effect.gen(function*() {
        const testLayer = createTestLayerWithMocks({
          projects: [],
          issues: []
        })

        const error = yield* Effect.flip(
          addComment({
            project: projectIdentifier("NONEXISTENT"),
            issueIdentifier: issueIdentifier("1"),
            body: "Comment"
          }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("ProjectNotFoundError")
        expect((error as ProjectNotFoundError).identifier).toBe("NONEXISTENT")
      }))

    // test-revizorro: approved
    it.effect("returns IssueNotFoundError when issue doesn't exist", () =>
      Effect.gen(function*() {
        const project = makeProject({ identifier: "TEST" })

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: []
        })

        const error = yield* Effect.flip(
          addComment({
            project: projectIdentifier("TEST"),
            issueIdentifier: issueIdentifier("TEST-999"),
            body: "Comment"
          }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("IssueNotFoundError")
        expect((error as IssueNotFoundError).identifier).toBe("TEST-999")
        expect((error as IssueNotFoundError).project).toBe("TEST")
      }))
  })
})

describe("updateComment", () => {
  describe("basic functionality", () => {
    // test-revizorro: suspect | missing assertion: updateComment sets editedOn timestamp but test doesn't verify it
    it.effect("updates an existing comment", () =>
      Effect.gen(function*() {
        const project = makeProject({ _id: "proj-1" as Ref<HulyProject>, identifier: "TEST" })
        const issue = makeIssue({
          _id: "issue-1" as Ref<HulyIssue>,
          identifier: "TEST-1",
          number: 1,
          space: "proj-1" as Ref<HulyProject>
        })
        const messages = [
          makeChatMessage({
            _id: "comment-abc" as Ref<ChatMessage>,
            message: "Original comment",
            attachedTo: "issue-1" as Ref<Doc>
          })
        ]

        const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue],
          messages,
          captureUpdateDoc
        })

        const result = yield* updateComment({
          project: projectIdentifier("TEST"),
          issueIdentifier: issueIdentifier("TEST-1"),
          commentId: commentBrandId("comment-abc"),
          body: "Updated comment body"
        }).pipe(Effect.provide(testLayer))

        expect(result.commentId).toBe("comment-abc")
        expect(result.issueIdentifier).toBe("TEST-1")
        expect(result.updated).toBe(true)
        expect(captureUpdateDoc.operations?.message).toBe("Updated comment body")
      }))

    // test-revizorro: approved
    it.effect("sets editedOn timestamp", () =>
      Effect.gen(function*() {
        const project = makeProject({ identifier: "TEST" })
        const issue = makeIssue({ identifier: "TEST-1", number: 1 })
        const messages = [
          makeChatMessage({
            _id: "comment-1" as Ref<ChatMessage>,
            message: "Original",
            attachedTo: "issue-1" as Ref<Doc>
          })
        ]

        const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue],
          messages,
          captureUpdateDoc
        })

        const before = Date.now()

        yield* updateComment({
          project: projectIdentifier("TEST"),
          issueIdentifier: issueIdentifier("TEST-1"),
          commentId: commentBrandId("comment-1"),
          body: "Updated"
        }).pipe(Effect.provide(testLayer))

        const after = Date.now()

        const editedOn = captureUpdateDoc.operations?.editedOn as number
        expect(editedOn).toBeGreaterThanOrEqual(before)
        expect(editedOn).toBeLessThanOrEqual(after)
      }))

    // test-revizorro: approved
    it.effect("supports markdown in updated body", () =>
      Effect.gen(function*() {
        const project = makeProject({ identifier: "TEST" })
        const issue = makeIssue({ identifier: "TEST-1", number: 1 })
        const messages = [
          makeChatMessage({
            _id: "comment-1" as Ref<ChatMessage>,
            message: "Plain text",
            attachedTo: "issue-1" as Ref<Doc>
          })
        ]

        const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue],
          messages,
          captureUpdateDoc
        })

        yield* updateComment({
          project: projectIdentifier("TEST"),
          issueIdentifier: issueIdentifier("TEST-1"),
          commentId: commentBrandId("comment-1"),
          body: "**Bold** and *italic*"
        }).pipe(Effect.provide(testLayer))

        expect(captureUpdateDoc.operations?.message).toBe("**Bold** and *italic*")
      }))

    // test-revizorro: approved
    it.effect("returns updated: false when body is unchanged", () =>
      Effect.gen(function*() {
        const project = makeProject({ _id: "proj-1" as Ref<HulyProject>, identifier: "TEST" })
        const issue = makeIssue({
          _id: "issue-1" as Ref<HulyIssue>,
          identifier: "TEST-1",
          number: 1,
          space: "proj-1" as Ref<HulyProject>
        })
        const messages = [
          makeChatMessage({
            _id: "comment-abc" as Ref<ChatMessage>,
            message: "Same content",
            attachedTo: "issue-1" as Ref<Doc>
          })
        ]

        const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue],
          messages,
          captureUpdateDoc
        })

        const result = yield* updateComment({
          project: projectIdentifier("TEST"),
          issueIdentifier: issueIdentifier("TEST-1"),
          commentId: commentBrandId("comment-abc"),
          body: "Same content"
        }).pipe(Effect.provide(testLayer))

        expect(result.commentId).toBe("comment-abc")
        expect(result.issueIdentifier).toBe("TEST-1")
        expect(result.updated).toBe(false)
        expect(captureUpdateDoc.operations).toBeUndefined()
      }))
  })

  describe("error handling", () => {
    // test-revizorro: approved
    it.effect("returns ProjectNotFoundError when project doesn't exist", () =>
      Effect.gen(function*() {
        const testLayer = createTestLayerWithMocks({
          projects: [],
          issues: [],
          messages: []
        })

        const error = yield* Effect.flip(
          updateComment({
            project: projectIdentifier("NONEXISTENT"),
            issueIdentifier: issueIdentifier("1"),
            commentId: commentBrandId("comment-1"),
            body: "Updated"
          }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("ProjectNotFoundError")
        expect((error as ProjectNotFoundError).identifier).toBe("NONEXISTENT")
      }))

    // test-revizorro: approved
    it.effect("returns IssueNotFoundError when issue doesn't exist", () =>
      Effect.gen(function*() {
        const project = makeProject({ identifier: "TEST" })

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [],
          messages: []
        })

        const error = yield* Effect.flip(
          updateComment({
            project: projectIdentifier("TEST"),
            issueIdentifier: issueIdentifier("TEST-999"),
            commentId: commentBrandId("comment-1"),
            body: "Updated"
          }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("IssueNotFoundError")
        expect((error as IssueNotFoundError).identifier).toBe("TEST-999")
      }))

    // test-revizorro: approved
    it.effect("returns CommentNotFoundError when comment doesn't exist", () =>
      Effect.gen(function*() {
        const project = makeProject({ identifier: "TEST" })
        const issue = makeIssue({ identifier: "TEST-1", number: 1 })

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue],
          messages: []
        })

        const error = yield* Effect.flip(
          updateComment({
            project: projectIdentifier("TEST"),
            issueIdentifier: issueIdentifier("TEST-1"),
            commentId: commentBrandId("nonexistent-comment"),
            body: "Updated"
          }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("CommentNotFoundError")
        expect((error as CommentNotFoundError).commentId).toBe("nonexistent-comment")
        expect((error as CommentNotFoundError).issueIdentifier).toBe("TEST-1")
        expect((error as CommentNotFoundError).project).toBe("TEST")
      }))

    // test-revizorro: approved
    it.effect("CommentNotFoundError has helpful message", () =>
      Effect.gen(function*() {
        const project = makeProject({ identifier: "HULY" })
        const issue = makeIssue({ identifier: "HULY-42", number: 42 })

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue],
          messages: []
        })

        const error = yield* Effect.flip(
          updateComment({
            project: projectIdentifier("HULY"),
            issueIdentifier: issueIdentifier("HULY-42"),
            commentId: commentBrandId("missing-comment"),
            body: "Updated"
          }).pipe(Effect.provide(testLayer))
        )

        expect(error.message).toContain("missing-comment")
        expect(error.message).toContain("HULY-42")
        expect(error.message).toContain("HULY")
      }))
  })
})

describe("deleteComment", () => {
  describe("basic functionality", () => {
    // test-revizorro: approved
    it.effect("deletes an existing comment", () =>
      Effect.gen(function*() {
        const project = makeProject({ _id: "proj-1" as Ref<HulyProject>, identifier: "TEST" })
        const issue = makeIssue({
          _id: "issue-1" as Ref<HulyIssue>,
          identifier: "TEST-1",
          number: 1,
          space: "proj-1" as Ref<HulyProject>
        })
        const messages = [
          makeChatMessage({
            _id: "comment-to-delete" as Ref<ChatMessage>,
            message: "This will be deleted",
            attachedTo: "issue-1" as Ref<Doc>
          })
        ]

        const captureRemoveDoc: MockConfig["captureRemoveDoc"] = {}

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue],
          messages,
          captureRemoveDoc
        })

        const result = yield* deleteComment({
          project: projectIdentifier("TEST"),
          issueIdentifier: issueIdentifier("TEST-1"),
          commentId: commentBrandId("comment-to-delete")
        }).pipe(Effect.provide(testLayer))

        expect(result.commentId).toBe("comment-to-delete")
        expect(result.issueIdentifier).toBe("TEST-1")
        expect(result.deleted).toBe(true)
        expect(captureRemoveDoc.id).toBe("comment-to-delete")
      }))

    // test-revizorro: approved
    it.effect("finds issue by numeric identifier", () =>
      Effect.gen(function*() {
        const project = makeProject({ _id: "proj-1" as Ref<HulyProject>, identifier: "HULY" })
        const issue = makeIssue({
          _id: "issue-99" as Ref<HulyIssue>,
          identifier: "HULY-99",
          number: 99,
          space: "proj-1" as Ref<HulyProject>
        })
        const messages = [
          makeChatMessage({
            _id: "comment-xyz" as Ref<ChatMessage>,
            message: "Comment on issue 99",
            attachedTo: "issue-99" as Ref<Doc>
          })
        ]

        const captureRemoveDoc: MockConfig["captureRemoveDoc"] = {}

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue],
          messages,
          captureRemoveDoc
        })

        const result = yield* deleteComment({
          project: projectIdentifier("HULY"),
          issueIdentifier: issueIdentifier("99"),
          commentId: commentBrandId("comment-xyz")
        }).pipe(Effect.provide(testLayer))

        expect(result.issueIdentifier).toBe("HULY-99")
        expect(result.deleted).toBe(true)
      }))
  })

  describe("error handling", () => {
    // test-revizorro: approved
    it.effect("returns ProjectNotFoundError when project doesn't exist", () =>
      Effect.gen(function*() {
        const testLayer = createTestLayerWithMocks({
          projects: [],
          issues: [],
          messages: []
        })

        const error = yield* Effect.flip(
          deleteComment({
            project: projectIdentifier("NONEXISTENT"),
            issueIdentifier: issueIdentifier("1"),
            commentId: commentBrandId("comment-1")
          }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("ProjectNotFoundError")
        expect((error as ProjectNotFoundError).identifier).toBe("NONEXISTENT")
      }))

    // test-revizorro: approved
    it.effect("returns IssueNotFoundError when issue doesn't exist", () =>
      Effect.gen(function*() {
        const project = makeProject({ identifier: "TEST" })

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [],
          messages: []
        })

        const error = yield* Effect.flip(
          deleteComment({
            project: projectIdentifier("TEST"),
            issueIdentifier: issueIdentifier("TEST-999"),
            commentId: commentBrandId("comment-1")
          }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("IssueNotFoundError")
        expect((error as IssueNotFoundError).identifier).toBe("TEST-999")
      }))

    // test-revizorro: approved
    it.effect("returns CommentNotFoundError when comment doesn't exist", () =>
      Effect.gen(function*() {
        const project = makeProject({ identifier: "TEST" })
        const issue = makeIssue({ identifier: "TEST-1", number: 1 })

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue],
          messages: []
        })

        const error = yield* Effect.flip(
          deleteComment({
            project: projectIdentifier("TEST"),
            issueIdentifier: issueIdentifier("TEST-1"),
            commentId: commentBrandId("nonexistent-comment")
          }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("CommentNotFoundError")
        expect((error as CommentNotFoundError).commentId).toBe("nonexistent-comment")
      }))

    // test-revizorro: approved
    it.effect("only deletes comment attached to correct issue", () =>
      Effect.gen(function*() {
        const project = makeProject({ _id: "proj-1" as Ref<HulyProject>, identifier: "TEST" })
        const issue1 = makeIssue({
          _id: "issue-1" as Ref<HulyIssue>,
          identifier: "TEST-1",
          number: 1,
          space: "proj-1" as Ref<HulyProject>
        })
        const issue2 = makeIssue({
          _id: "issue-2" as Ref<HulyIssue>,
          identifier: "TEST-2",
          number: 2,
          space: "proj-1" as Ref<HulyProject>
        })
        // Comment attached to issue-2, not issue-1
        const messages = [
          makeChatMessage({
            _id: "comment-on-issue-2" as Ref<ChatMessage>,
            message: "Comment on different issue",
            attachedTo: "issue-2" as Ref<Doc>
          })
        ]

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue1, issue2],
          messages
        })

        // Try to delete comment from issue-1 (should fail - comment is on issue-2)
        const error = yield* Effect.flip(
          deleteComment({
            project: projectIdentifier("TEST"),
            issueIdentifier: issueIdentifier("TEST-1"),
            commentId: commentBrandId("comment-on-issue-2")
          }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("CommentNotFoundError")
      }))
  })
})
