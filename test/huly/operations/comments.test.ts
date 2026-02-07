import { describe, it } from "@effect/vitest"
import { expect } from "vitest"
import { Effect } from "effect"
import type {
  Doc,
  FindResult,
  Ref,
  Space
} from "@hcengineering/core"
import type { Issue as HulyIssue, Project as HulyProject } from "@hcengineering/tracker"
import type { ChatMessage } from "@hcengineering/chunter"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import {
  ProjectNotFoundError,
  IssueNotFoundError,
  CommentNotFoundError
} from "../../../src/huly/errors.js"
import {
  listComments,
  addComment,
  updateComment,
  deleteComment
} from "../../../src/huly/operations/comments.js"

// eslint-disable-next-line @typescript-eslint/no-require-imports
const tracker = require("@hcengineering/tracker").default as typeof import("@hcengineering/tracker").default
// eslint-disable-next-line @typescript-eslint/no-require-imports
const chunter = require("@hcengineering/chunter").default as typeof import("@hcengineering/chunter").default

// --- Mock Data Builders ---

const makeProject = (overrides?: Partial<HulyProject>): HulyProject =>
  ({
    _id: "project-1" as Ref<HulyProject>,
    _class: tracker.class.Project,
    space: "space-1" as Ref<Space>,
    identifier: "TEST",
    name: "Test Project",
    sequence: 1,
    defaultIssueStatus: "status-open" as Ref<Doc>,
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
    status: "status-open" as Ref<Doc>,
    priority: 3,
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

const makeChatMessage = (overrides?: Partial<ChatMessage>): ChatMessage =>
  ({
    _id: "msg-1" as Ref<ChatMessage>,
    _class: chunter.class.ChatMessage,
    space: "project-1" as Ref<Space>,
    message: "Test message",
    attachedTo: "issue-1" as Ref<Doc>,
    attachedToClass: tracker.class.Issue,
    collection: "comments",
    modifiedBy: "user-1" as Ref<Doc>,
    modifiedOn: Date.now(),
    createdBy: "user-1" as Ref<Doc>,
    createdOn: Date.now(),
    editedOn: null,
    ...overrides,
  }) as ChatMessage

// --- Test Helpers ---

interface MockConfig {
  projects?: HulyProject[]
  issues?: HulyIssue[]
  messages?: ChatMessage[]
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
        m.attachedTo === q.attachedTo &&
        m.attachedToClass === q.attachedToClass
      )
      // Apply sorting if specified
      const opts = options as { sort?: Record<string, number> } | undefined
      if (opts?.sort?.createdOn !== undefined) {
        const direction = opts.sort.createdOn
        filtered = filtered.sort((a, b) => direction * (a.createdOn - b.createdOn))
      }
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
      const found = issues.find(i =>
        (q.identifier && i.identifier === q.identifier) ||
        (q.number && i.number === q.number) ||
        (q.space && i.space === q.space && !q.identifier && !q.number)
      )
      return Effect.succeed(found as Doc | undefined)
    }
    if (_class === chunter.class.ChatMessage) {
      const q = query as Record<string, unknown>
      const found = messages.find(m =>
        m._id === q._id && m.attachedTo === q.attachedTo
      )
      return Effect.succeed(found as Doc | undefined)
    }
    return Effect.succeed(undefined)
  }) as HulyClientOperations["findOne"]

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const addCollectionImpl: any = (
    _class: unknown, _space: unknown, _attachedTo: unknown, _attachedToClass: unknown, _collection: unknown, attributes: unknown, id?: unknown
  ) => {
    if (config.captureAddCollection) {
      config.captureAddCollection.attributes = attributes as Record<string, unknown>
      config.captureAddCollection.id = id as string
    }
    return Effect.succeed((id ?? "new-comment-id") as Ref<Doc>)
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
    addCollection: addCollectionImpl,
    updateDoc: updateDocImpl,
    removeDoc: removeDocImpl,
  })
}

// --- Tests ---

describe("listComments", () => {
  describe("basic functionality", () => {
    it.effect("returns comments for an issue", () =>
      Effect.gen(function* () {
        const project = makeProject({ _id: "proj-1" as Ref<HulyProject>, identifier: "TEST" })
        const issue = makeIssue({
          _id: "issue-1" as Ref<HulyIssue>,
          identifier: "TEST-1",
          number: 1,
          space: "proj-1" as Ref<HulyProject>,
        })
        const messages = [
          makeChatMessage({
            _id: "msg-1" as Ref<ChatMessage>,
            message: "First comment",
            attachedTo: "issue-1" as Ref<Doc>,
            createdOn: 1000,
          }),
          makeChatMessage({
            _id: "msg-2" as Ref<ChatMessage>,
            message: "Second comment",
            attachedTo: "issue-1" as Ref<Doc>,
            createdOn: 2000,
          }),
        ]

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue],
          messages,
        })

        const result = yield* listComments({
          project: "TEST",
          issueIdentifier: "TEST-1",
        }).pipe(Effect.provide(testLayer))

        expect(result).toHaveLength(2)
        // Sorted by createdOn ascending (oldest first)
        expect(result[0].body).toBe("First comment")
        expect(result[1].body).toBe("Second comment")
      })
    )

    it.effect("returns empty array when issue has no comments", () =>
      Effect.gen(function* () {
        const project = makeProject({ identifier: "TEST" })
        const issue = makeIssue({ identifier: "TEST-1", number: 1 })

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue],
          messages: [],
        })

        const result = yield* listComments({
          project: "TEST",
          issueIdentifier: "TEST-1",
        }).pipe(Effect.provide(testLayer))

        expect(result).toHaveLength(0)
      })
    )

    it.effect("transforms message to comment format", () =>
      Effect.gen(function* () {
        const project = makeProject({ identifier: "TEST" })
        const issue = makeIssue({ identifier: "TEST-1", number: 1 })
        const messages = [
          makeChatMessage({
            _id: "msg-abc" as Ref<ChatMessage>,
            message: "Comment body here",
            attachedTo: "issue-1" as Ref<Doc>,
            modifiedBy: "person-123" as Ref<Doc>,
            createdOn: 1706500000000,
            modifiedOn: 1706600000000,
            editedOn: 1706550000000,
          }),
        ]

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue],
          messages,
        })

        const result = yield* listComments({
          project: "TEST",
          issueIdentifier: "TEST-1",
        }).pipe(Effect.provide(testLayer))

        expect(result[0].id).toBe("msg-abc")
        expect(result[0].body).toBe("Comment body here")
        expect(result[0].authorId).toBe("person-123")
        expect(result[0].createdOn).toBe(1706500000000)
        expect(result[0].modifiedOn).toBe(1706600000000)
        expect(result[0].editedOn).toBe(1706550000000)
      })
    )

  })

  describe("identifier parsing", () => {
    it.effect("finds issue by full identifier HULY-123", () =>
      Effect.gen(function* () {
        const project = makeProject({ _id: "proj-huly" as Ref<HulyProject>, identifier: "HULY" })
        const issue = makeIssue({
          _id: "issue-huly" as Ref<HulyIssue>,
          identifier: "HULY-123",
          number: 123,
          space: "proj-huly" as Ref<HulyProject>,
        })
        const messages = [
          makeChatMessage({
            message: "Found by full ID",
            attachedTo: "issue-huly" as Ref<Doc>,
          }),
        ]

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue],
          messages,
        })

        const result = yield* listComments({
          project: "HULY",
          issueIdentifier: "HULY-123",
        }).pipe(Effect.provide(testLayer))

        expect(result).toHaveLength(1)
      })
    )

    it.effect("finds issue by numeric identifier 42", () =>
      Effect.gen(function* () {
        const project = makeProject({ _id: "proj-test" as Ref<HulyProject>, identifier: "TEST" })
        const issue = makeIssue({
          _id: "issue-42" as Ref<HulyIssue>,
          identifier: "TEST-42",
          number: 42,
          space: "proj-test" as Ref<HulyProject>,
        })
        const messages = [
          makeChatMessage({
            message: "Found by number",
            attachedTo: "issue-42" as Ref<Doc>,
          }),
        ]

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue],
          messages,
        })

        const result = yield* listComments({
          project: "TEST",
          issueIdentifier: "42",
        }).pipe(Effect.provide(testLayer))

        expect(result).toHaveLength(1)
      })
    )

    it.effect("handles lowercase identifier test-5", () =>
      Effect.gen(function* () {
        const project = makeProject({ _id: "proj-test" as Ref<HulyProject>, identifier: "TEST" })
        const issue = makeIssue({
          _id: "issue-5" as Ref<HulyIssue>,
          identifier: "TEST-5",
          number: 5,
          space: "proj-test" as Ref<HulyProject>,
        })
        const messages = [
          makeChatMessage({
            message: "Lowercase match",
            attachedTo: "issue-5" as Ref<Doc>,
          }),
        ]

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue],
          messages,
        })

        const result = yield* listComments({
          project: "TEST",
          issueIdentifier: "test-5",
        }).pipe(Effect.provide(testLayer))

        expect(result).toHaveLength(1)
      })
    )
  })

  describe("limit handling", () => {
    it.effect("uses default limit of 50", () =>
      Effect.gen(function* () {
        const project = makeProject({ identifier: "TEST" })
        const issue = makeIssue({ identifier: "TEST-1", number: 1 })

        const captureQuery: MockConfig["captureMessageQuery"] = {}

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue],
          messages: [],
          captureMessageQuery: captureQuery,
        })

        yield* listComments({
          project: "TEST",
          issueIdentifier: "TEST-1",
        }).pipe(Effect.provide(testLayer))

        expect(captureQuery.options?.limit).toBe(50)
      })
    )

    it.effect("enforces max limit of 200", () =>
      Effect.gen(function* () {
        const project = makeProject({ identifier: "TEST" })
        const issue = makeIssue({ identifier: "TEST-1", number: 1 })

        const captureQuery: MockConfig["captureMessageQuery"] = {}

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue],
          messages: [],
          captureMessageQuery: captureQuery,
        })

        yield* listComments({
          project: "TEST",
          issueIdentifier: "TEST-1",
          limit: 500,
        }).pipe(Effect.provide(testLayer))

        expect(captureQuery.options?.limit).toBe(200)
      })
    )

    it.effect("uses provided limit when under max", () =>
      Effect.gen(function* () {
        const project = makeProject({ identifier: "TEST" })
        const issue = makeIssue({ identifier: "TEST-1", number: 1 })

        const captureQuery: MockConfig["captureMessageQuery"] = {}

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue],
          messages: [],
          captureMessageQuery: captureQuery,
        })

        yield* listComments({
          project: "TEST",
          issueIdentifier: "TEST-1",
          limit: 25,
        }).pipe(Effect.provide(testLayer))

        expect(captureQuery.options?.limit).toBe(25)
      })
    )
  })

  describe("error handling", () => {
    it.effect("returns ProjectNotFoundError when project doesn't exist", () =>
      Effect.gen(function* () {
        const testLayer = createTestLayerWithMocks({
          projects: [],
          issues: [],
          messages: [],
        })

        const error = yield* Effect.flip(
          listComments({
            project: "NONEXISTENT",
            issueIdentifier: "1",
          }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("ProjectNotFoundError")
        expect((error as ProjectNotFoundError).identifier).toBe("NONEXISTENT")
      })
    )

    it.effect("returns IssueNotFoundError when issue doesn't exist", () =>
      Effect.gen(function* () {
        const project = makeProject({ identifier: "TEST" })

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [],
          messages: [],
        })

        const error = yield* Effect.flip(
          listComments({
            project: "TEST",
            issueIdentifier: "TEST-999",
          }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("IssueNotFoundError")
        expect((error as IssueNotFoundError).identifier).toBe("TEST-999")
        expect((error as IssueNotFoundError).project).toBe("TEST")
      })
    )
  })
})

describe("addComment", () => {
  describe("basic functionality", () => {
    it.effect("adds a comment to an issue", () =>
      Effect.gen(function* () {
        const project = makeProject({ _id: "proj-1" as Ref<HulyProject>, identifier: "TEST" })
        const issue = makeIssue({
          _id: "issue-1" as Ref<HulyIssue>,
          identifier: "TEST-1",
          number: 1,
          space: "proj-1" as Ref<HulyProject>,
        })

        const captureAddCollection: MockConfig["captureAddCollection"] = {}

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue],
          captureAddCollection,
        })

        const result = yield* addComment({
          project: "TEST",
          issueIdentifier: "TEST-1",
          body: "This is my new comment",
        }).pipe(Effect.provide(testLayer))

        expect(result.commentId).toBeDefined()
        expect(result.issueIdentifier).toBe("TEST-1")
        expect(captureAddCollection.attributes?.message).toBe("This is my new comment")
      })
    )

    it.effect("supports markdown in comment body", () =>
      Effect.gen(function* () {
        const project = makeProject({ identifier: "TEST" })
        const issue = makeIssue({ identifier: "TEST-1", number: 1 })

        const captureAddCollection: MockConfig["captureAddCollection"] = {}

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue],
          captureAddCollection,
        })

        yield* addComment({
          project: "TEST",
          issueIdentifier: "TEST-1",
          body: "# Heading\n\n- Item 1\n- Item 2\n\n```js\nconsole.log('test');\n```",
        }).pipe(Effect.provide(testLayer))

        expect(captureAddCollection.attributes?.message).toContain("# Heading")
        expect(captureAddCollection.attributes?.message).toContain("console.log")
      })
    )

    it.effect("returns comment ID and issue identifier", () =>
      Effect.gen(function* () {
        const project = makeProject({ identifier: "HULY" })
        const issue = makeIssue({ identifier: "HULY-42", number: 42 })

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue],
        })

        const result = yield* addComment({
          project: "HULY",
          issueIdentifier: "42",
          body: "Comment added",
        }).pipe(Effect.provide(testLayer))

        // commentId is generated using generateId(), so just verify it exists
        expect(result.commentId).toBeDefined()
        expect(typeof result.commentId).toBe("string")
        expect(result.commentId.length).toBeGreaterThan(0)
        expect(result.issueIdentifier).toBe("HULY-42")
      })
    )
  })

  describe("error handling", () => {
    it.effect("returns ProjectNotFoundError when project doesn't exist", () =>
      Effect.gen(function* () {
        const testLayer = createTestLayerWithMocks({
          projects: [],
          issues: [],
        })

        const error = yield* Effect.flip(
          addComment({
            project: "NONEXISTENT",
            issueIdentifier: "1",
            body: "Comment",
          }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("ProjectNotFoundError")
        expect((error as ProjectNotFoundError).identifier).toBe("NONEXISTENT")
      })
    )

    it.effect("returns IssueNotFoundError when issue doesn't exist", () =>
      Effect.gen(function* () {
        const project = makeProject({ identifier: "TEST" })

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [],
        })

        const error = yield* Effect.flip(
          addComment({
            project: "TEST",
            issueIdentifier: "TEST-999",
            body: "Comment",
          }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("IssueNotFoundError")
        expect((error as IssueNotFoundError).identifier).toBe("TEST-999")
        expect((error as IssueNotFoundError).project).toBe("TEST")
      })
    )
  })
})

describe("updateComment", () => {
  describe("basic functionality", () => {
    it.effect("updates an existing comment", () =>
      Effect.gen(function* () {
        const project = makeProject({ _id: "proj-1" as Ref<HulyProject>, identifier: "TEST" })
        const issue = makeIssue({
          _id: "issue-1" as Ref<HulyIssue>,
          identifier: "TEST-1",
          number: 1,
          space: "proj-1" as Ref<HulyProject>,
        })
        const messages = [
          makeChatMessage({
            _id: "comment-abc" as Ref<ChatMessage>,
            message: "Original comment",
            attachedTo: "issue-1" as Ref<Doc>,
          }),
        ]

        const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue],
          messages,
          captureUpdateDoc,
        })

        const result = yield* updateComment({
          project: "TEST",
          issueIdentifier: "TEST-1",
          commentId: "comment-abc",
          body: "Updated comment body",
        }).pipe(Effect.provide(testLayer))

        expect(result.commentId).toBe("comment-abc")
        expect(result.issueIdentifier).toBe("TEST-1")
        expect(result.updated).toBe(true)
        expect(captureUpdateDoc.operations?.message).toBe("Updated comment body")
      })
    )

    it.effect("sets editedOn timestamp", () =>
      Effect.gen(function* () {
        const project = makeProject({ identifier: "TEST" })
        const issue = makeIssue({ identifier: "TEST-1", number: 1 })
        const messages = [
          makeChatMessage({
            _id: "comment-1" as Ref<ChatMessage>,
            message: "Original",
            attachedTo: "issue-1" as Ref<Doc>,
          }),
        ]

        const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue],
          messages,
          captureUpdateDoc,
        })

        const before = Date.now()

        yield* updateComment({
          project: "TEST",
          issueIdentifier: "TEST-1",
          commentId: "comment-1",
          body: "Updated",
        }).pipe(Effect.provide(testLayer))

        const after = Date.now()

        const editedOn = captureUpdateDoc.operations?.editedOn as number
        expect(editedOn).toBeGreaterThanOrEqual(before)
        expect(editedOn).toBeLessThanOrEqual(after)
      })
    )

    it.effect("supports markdown in updated body", () =>
      Effect.gen(function* () {
        const project = makeProject({ identifier: "TEST" })
        const issue = makeIssue({ identifier: "TEST-1", number: 1 })
        const messages = [
          makeChatMessage({
            _id: "comment-1" as Ref<ChatMessage>,
            message: "Plain text",
            attachedTo: "issue-1" as Ref<Doc>,
          }),
        ]

        const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue],
          messages,
          captureUpdateDoc,
        })

        yield* updateComment({
          project: "TEST",
          issueIdentifier: "TEST-1",
          commentId: "comment-1",
          body: "**Bold** and *italic*",
        }).pipe(Effect.provide(testLayer))

        expect(captureUpdateDoc.operations?.message).toBe("**Bold** and *italic*")
      })
    )

    it.effect("returns updated: false when body is unchanged", () =>
      Effect.gen(function* () {
        const project = makeProject({ _id: "proj-1" as Ref<HulyProject>, identifier: "TEST" })
        const issue = makeIssue({
          _id: "issue-1" as Ref<HulyIssue>,
          identifier: "TEST-1",
          number: 1,
          space: "proj-1" as Ref<HulyProject>,
        })
        const messages = [
          makeChatMessage({
            _id: "comment-abc" as Ref<ChatMessage>,
            message: "Same content",
            attachedTo: "issue-1" as Ref<Doc>,
          }),
        ]

        const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue],
          messages,
          captureUpdateDoc,
        })

        const result = yield* updateComment({
          project: "TEST",
          issueIdentifier: "TEST-1",
          commentId: "comment-abc",
          body: "Same content",
        }).pipe(Effect.provide(testLayer))

        expect(result.commentId).toBe("comment-abc")
        expect(result.issueIdentifier).toBe("TEST-1")
        expect(result.updated).toBe(false)
        expect(captureUpdateDoc.operations).toBeUndefined()
      })
    )
  })

  describe("error handling", () => {
    it.effect("returns ProjectNotFoundError when project doesn't exist", () =>
      Effect.gen(function* () {
        const testLayer = createTestLayerWithMocks({
          projects: [],
          issues: [],
          messages: [],
        })

        const error = yield* Effect.flip(
          updateComment({
            project: "NONEXISTENT",
            issueIdentifier: "1",
            commentId: "comment-1",
            body: "Updated",
          }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("ProjectNotFoundError")
        expect((error as ProjectNotFoundError).identifier).toBe("NONEXISTENT")
      })
    )

    it.effect("returns IssueNotFoundError when issue doesn't exist", () =>
      Effect.gen(function* () {
        const project = makeProject({ identifier: "TEST" })

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [],
          messages: [],
        })

        const error = yield* Effect.flip(
          updateComment({
            project: "TEST",
            issueIdentifier: "TEST-999",
            commentId: "comment-1",
            body: "Updated",
          }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("IssueNotFoundError")
        expect((error as IssueNotFoundError).identifier).toBe("TEST-999")
      })
    )

    it.effect("returns CommentNotFoundError when comment doesn't exist", () =>
      Effect.gen(function* () {
        const project = makeProject({ identifier: "TEST" })
        const issue = makeIssue({ identifier: "TEST-1", number: 1 })

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue],
          messages: [],
        })

        const error = yield* Effect.flip(
          updateComment({
            project: "TEST",
            issueIdentifier: "TEST-1",
            commentId: "nonexistent-comment",
            body: "Updated",
          }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("CommentNotFoundError")
        expect((error as CommentNotFoundError).commentId).toBe("nonexistent-comment")
        expect((error as CommentNotFoundError).issueIdentifier).toBe("TEST-1")
        expect((error as CommentNotFoundError).project).toBe("TEST")
      })
    )

    it.effect("CommentNotFoundError has helpful message", () =>
      Effect.gen(function* () {
        const project = makeProject({ identifier: "HULY" })
        const issue = makeIssue({ identifier: "HULY-42", number: 42 })

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue],
          messages: [],
        })

        const error = yield* Effect.flip(
          updateComment({
            project: "HULY",
            issueIdentifier: "HULY-42",
            commentId: "missing-comment",
            body: "Updated",
          }).pipe(Effect.provide(testLayer))
        )

        expect(error.message).toContain("missing-comment")
        expect(error.message).toContain("HULY-42")
        expect(error.message).toContain("HULY")
      })
    )
  })
})

describe("deleteComment", () => {
  describe("basic functionality", () => {
    it.effect("deletes an existing comment", () =>
      Effect.gen(function* () {
        const project = makeProject({ _id: "proj-1" as Ref<HulyProject>, identifier: "TEST" })
        const issue = makeIssue({
          _id: "issue-1" as Ref<HulyIssue>,
          identifier: "TEST-1",
          number: 1,
          space: "proj-1" as Ref<HulyProject>,
        })
        const messages = [
          makeChatMessage({
            _id: "comment-to-delete" as Ref<ChatMessage>,
            message: "This will be deleted",
            attachedTo: "issue-1" as Ref<Doc>,
          }),
        ]

        const captureRemoveDoc: MockConfig["captureRemoveDoc"] = {}

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue],
          messages,
          captureRemoveDoc,
        })

        const result = yield* deleteComment({
          project: "TEST",
          issueIdentifier: "TEST-1",
          commentId: "comment-to-delete",
        }).pipe(Effect.provide(testLayer))

        expect(result.commentId).toBe("comment-to-delete")
        expect(result.issueIdentifier).toBe("TEST-1")
        expect(result.deleted).toBe(true)
        expect(captureRemoveDoc.id).toBe("comment-to-delete")
      })
    )

    it.effect("finds issue by numeric identifier", () =>
      Effect.gen(function* () {
        const project = makeProject({ _id: "proj-1" as Ref<HulyProject>, identifier: "HULY" })
        const issue = makeIssue({
          _id: "issue-99" as Ref<HulyIssue>,
          identifier: "HULY-99",
          number: 99,
          space: "proj-1" as Ref<HulyProject>,
        })
        const messages = [
          makeChatMessage({
            _id: "comment-xyz" as Ref<ChatMessage>,
            message: "Comment on issue 99",
            attachedTo: "issue-99" as Ref<Doc>,
          }),
        ]

        const captureRemoveDoc: MockConfig["captureRemoveDoc"] = {}

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue],
          messages,
          captureRemoveDoc,
        })

        const result = yield* deleteComment({
          project: "HULY",
          issueIdentifier: "99",
          commentId: "comment-xyz",
        }).pipe(Effect.provide(testLayer))

        expect(result.issueIdentifier).toBe("HULY-99")
        expect(result.deleted).toBe(true)
      })
    )
  })

  describe("error handling", () => {
    it.effect("returns ProjectNotFoundError when project doesn't exist", () =>
      Effect.gen(function* () {
        const testLayer = createTestLayerWithMocks({
          projects: [],
          issues: [],
          messages: [],
        })

        const error = yield* Effect.flip(
          deleteComment({
            project: "NONEXISTENT",
            issueIdentifier: "1",
            commentId: "comment-1",
          }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("ProjectNotFoundError")
        expect((error as ProjectNotFoundError).identifier).toBe("NONEXISTENT")
      })
    )

    it.effect("returns IssueNotFoundError when issue doesn't exist", () =>
      Effect.gen(function* () {
        const project = makeProject({ identifier: "TEST" })

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [],
          messages: [],
        })

        const error = yield* Effect.flip(
          deleteComment({
            project: "TEST",
            issueIdentifier: "TEST-999",
            commentId: "comment-1",
          }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("IssueNotFoundError")
        expect((error as IssueNotFoundError).identifier).toBe("TEST-999")
      })
    )

    it.effect("returns CommentNotFoundError when comment doesn't exist", () =>
      Effect.gen(function* () {
        const project = makeProject({ identifier: "TEST" })
        const issue = makeIssue({ identifier: "TEST-1", number: 1 })

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue],
          messages: [],
        })

        const error = yield* Effect.flip(
          deleteComment({
            project: "TEST",
            issueIdentifier: "TEST-1",
            commentId: "nonexistent-comment",
          }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("CommentNotFoundError")
        expect((error as CommentNotFoundError).commentId).toBe("nonexistent-comment")
      })
    )

    it.effect("only deletes comment attached to correct issue", () =>
      Effect.gen(function* () {
        const project = makeProject({ _id: "proj-1" as Ref<HulyProject>, identifier: "TEST" })
        const issue1 = makeIssue({
          _id: "issue-1" as Ref<HulyIssue>,
          identifier: "TEST-1",
          number: 1,
          space: "proj-1" as Ref<HulyProject>,
        })
        const issue2 = makeIssue({
          _id: "issue-2" as Ref<HulyIssue>,
          identifier: "TEST-2",
          number: 2,
          space: "proj-1" as Ref<HulyProject>,
        })
        // Comment attached to issue-2, not issue-1
        const messages = [
          makeChatMessage({
            _id: "comment-on-issue-2" as Ref<ChatMessage>,
            message: "Comment on different issue",
            attachedTo: "issue-2" as Ref<Doc>,
          }),
        ]

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue1, issue2],
          messages,
        })

        // Try to delete comment from issue-1 (should fail - comment is on issue-2)
        const error = yield* Effect.flip(
          deleteComment({
            project: "TEST",
            issueIdentifier: "TEST-1",
            commentId: "comment-on-issue-2",
          }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("CommentNotFoundError")
      })
    )
  })
})
