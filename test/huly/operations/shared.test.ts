import { describe, it } from "@effect/vitest"
import type { Channel, Person } from "@hcengineering/contact"
import type { Doc, FindResult, Ref, Space, Status } from "@hcengineering/core"
import { type Issue as HulyIssue, IssuePriority, type Project as HulyProject } from "@hcengineering/tracker"
import { Effect } from "effect"
import { expect } from "vitest"
import { NonNegativeNumber } from "../../../src/domain/schemas/shared.js"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import type { IssueNotFoundError, ProjectNotFoundError } from "../../../src/huly/errors.js"
import { contact, core, task, tracker } from "../../../src/huly/huly-plugins.js"
import {
  clampLimit,
  findByNameOrId,
  findOneOrFail,
  findPersonByEmailOrName,
  findProject,
  findProjectAndIssue,
  findProjectWithStatuses,
  parseIssueIdentifier,
  priorityToString,
  stringToPriority,
  toRef,
  validatePersonUuid,
  zeroAsUnset
} from "../../../src/huly/operations/shared.js"

const toFindResult = <T extends Doc>(docs: Array<T>): FindResult<T> => {
  const result = docs as FindResult<T>
  result.total = docs.length
  return result
}

const makeProject = (overrides?: Partial<HulyProject>): HulyProject => {
  const result: HulyProject = {
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
    ...overrides
  }
  return result
}

const makeIssue = (overrides?: Partial<HulyIssue>): HulyIssue => {
  const result: HulyIssue = {
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
    ...overrides
  }
  return result
}

const makeStatus = (overrides?: Partial<Status>): Status => {
  const result: Status = {
    _id: "status-1" as Ref<Status>,
    _class: "core:class:Status" as Ref<Doc>,
    space: "space-1" as Ref<Space>,
    ofAttribute: "tracker:attribute:IssueStatus" as Ref<Doc>,
    name: "Open",
    modifiedBy: "user-1" as Ref<Doc>,
    modifiedOn: Date.now(),
    createdBy: "user-1" as Ref<Doc>,
    createdOn: Date.now(),
    ...overrides
  }
  return result
}

const makePerson = (overrides?: Partial<Person>): Person => {
  const result: Person = {
    _id: "person-1" as Ref<Person>,
    _class: contact.class.Person,
    space: "space-1" as Ref<Space>,
    name: "John Doe",
    modifiedBy: "user-1" as Ref<Doc>,
    modifiedOn: Date.now(),
    createdBy: "user-1" as Ref<Doc>,
    createdOn: Date.now(),
    ...overrides
  }
  return result
}

const makeChannel = (overrides?: Partial<Channel>): Channel => {
  const result: Channel = {
    _id: "channel-1" as Ref<Channel>,
    _class: contact.class.Channel,
    space: "space-1" as Ref<Space>,
    attachedTo: "person-1" as Ref<Doc>,
    attachedToClass: contact.class.Person,
    collection: "channels",
    provider: contact.channelProvider.Email,
    value: "john@example.com",
    modifiedBy: "user-1" as Ref<Doc>,
    modifiedOn: Date.now(),
    createdBy: "user-1" as Ref<Doc>,
    createdOn: Date.now(),
    ...overrides
  }
  return result
}

interface MockConfig {
  projects?: Array<HulyProject>
  issues?: Array<HulyIssue>
  statuses?: Array<Status>
  persons?: Array<Person>
  channels?: Array<Channel>
  statusQueryFails?: boolean
}

const createTestLayerWithMocks = (config: MockConfig) => {
  const projects = config.projects ?? []
  const issues = config.issues ?? []
  const statuses = config.statuses ?? []
  const persons = config.persons ?? []
  const channels = config.channels ?? []

  const findAllImpl: HulyClientOperations["findAll"] = ((_class: unknown, query: unknown, _options: unknown) => {
    if (String(_class) === String(core.class.Status)) {
      if (config.statusQueryFails) {
        return Effect.fail({ _tag: "HulyConnectionError", message: "Status query failed" } as never)
      }
      const q = query as Record<string, unknown>
      const inQuery = q._id as { $in?: Array<Ref<Status>> } | undefined
      if (inQuery?.$in) {
        const filtered = statuses.filter(s => inQuery.$in!.includes(s._id))
        return Effect.succeed(toFindResult(filtered as Array<Doc>))
      }
      return Effect.succeed(toFindResult(statuses as Array<Doc>))
    }
    if (_class === tracker.class.Issue) {
      return Effect.succeed(toFindResult(issues as Array<Doc>))
    }
    if (_class === contact.class.Channel) {
      const q = query as Record<string, unknown>
      let filtered = channels
      if (q.value !== undefined) {
        const value = q.value as { $like?: string } | string
        if (typeof value === "string") {
          filtered = filtered.filter(c => c.value === value)
        }
      }
      if (q.provider !== undefined) {
        filtered = filtered.filter(c => c.provider === q.provider)
      }
      return Effect.succeed(toFindResult(filtered as Array<Doc>))
    }
    if (_class === contact.class.Person) {
      return Effect.succeed(toFindResult(persons as Array<Doc>))
    }
    return Effect.succeed(toFindResult([]))
  }) as HulyClientOperations["findAll"]

  const findOneImpl: HulyClientOperations["findOne"] = ((_class: unknown, query: unknown, options?: unknown) => {
    if (_class === tracker.class.Project) {
      const q = query as Record<string, unknown>
      const identifier = q.identifier as string | undefined
      const found = identifier ? projects.find(p => p.identifier === identifier) : undefined
      if (found === undefined) return Effect.succeed(undefined)
      const opts = options as { lookup?: Record<string, unknown> } | undefined
      if (opts?.lookup?.type) {
        const projectWithLookup = {
          ...found,
          $lookup: {
            type: {
              _id: "project-type-1",
              statuses: statuses.map(s => ({ _id: s._id }))
            }
          }
        }
        return Effect.succeed(projectWithLookup as Doc)
      }
      return Effect.succeed(found as Doc)
    }
    if (_class === tracker.class.Issue) {
      const q = query as Record<string, unknown>
      const found = issues.find(i =>
        (q.identifier && i.identifier === q.identifier)
        || (q.number && i.number === q.number)
      )
      return Effect.succeed(found as Doc | undefined)
    }
    if (_class === contact.class.Channel) {
      const q = query as Record<string, unknown>
      const value = q.value as string | { $like: string } | undefined
      if (typeof value === "string") {
        const found = channels.find(c => c.value === value && (q.provider === undefined || c.provider === q.provider))
        return Effect.succeed(found as Doc | undefined)
      }
      if (value && typeof value === "object" && "$like" in value) {
        const pattern = value.$like.replace(/%/g, "")
        const found = channels.find(c =>
          c.value.includes(pattern) && (q.provider === undefined || c.provider === q.provider)
        )
        return Effect.succeed(found as Doc | undefined)
      }
      return Effect.succeed(undefined)
    }
    if (_class === contact.class.Person) {
      const q = query as Record<string, unknown>
      if (q._id) {
        const found = persons.find(p => p._id === q._id)
        return Effect.succeed(found as Doc | undefined)
      }
      if (q.name) {
        if (typeof q.name === "string") {
          const found = persons.find(p => p.name === q.name)
          return Effect.succeed(found as Doc | undefined)
        }
        if (typeof q.name === "object" && "$like" in (q.name as Record<string, unknown>)) {
          const pattern = (q.name as Record<string, string>).$like.replace(/%/g, "")
          const found = persons.find(p => p.name.includes(pattern))
          return Effect.succeed(found as Doc | undefined)
        }
      }
      return Effect.succeed(undefined)
    }
    return Effect.succeed(undefined)
  }) as HulyClientOperations["findOne"]

  return HulyClient.testLayer({
    findAll: findAllImpl,
    findOne: findOneImpl
  })
}

describe("shared.ts", () => {
  describe("toRef", () => {
    // test-revizorro: approved
    it("converts string to Ref", () => {
      const ref = toRef<Doc>("some-id")
      expect(ref).toBe("some-id")
    })
  })

  describe("zeroAsUnset", () => {
    // test-revizorro: approved
    it("returns undefined for zero", () => {
      expect(zeroAsUnset(NonNegativeNumber.make(0))).toBeUndefined()
    })

    // test-revizorro: suspect | branded type comparison: expects result.toBe(5) but PositiveNumber.make(5) is branded type, not plain number
    it("returns PositiveNumber for positive values", () => {
      const result = zeroAsUnset(NonNegativeNumber.make(5))
      expect(result).toBe(5)
    })
  })

  describe("clampLimit", () => {
    // test-revizorro: scheduled
    it("uses default 50 when undefined", () => {
      expect(clampLimit(undefined)).toBe(50)
    })

    // test-revizorro: approved
    it("uses provided value when under max", () => {
      expect(clampLimit(25)).toBe(25)
    })

    // test-revizorro: approved
    it("clamps to MAX_LIMIT (200) when over", () => {
      expect(clampLimit(500)).toBe(200)
    })
  })

  describe("validatePersonUuid", () => {
    // test-revizorro: approved
    it.effect("returns undefined for undefined input", () =>
      Effect.gen(function*() {
        const result = yield* validatePersonUuid(undefined)
        expect(result).toBeUndefined()
      }))

    // test-revizorro: approved
    it.effect("returns valid UUID", () =>
      Effect.gen(function*() {
        const result = yield* validatePersonUuid("550e8400-e29b-41d4-a716-446655440000")
        expect(result).toBe("550e8400-e29b-41d4-a716-446655440000")
      }))

    // test-revizorro: approved
    it.effect("fails for invalid UUID format", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(validatePersonUuid("not-a-uuid"))
        expect(error._tag).toBe("InvalidPersonUuidError")
      }))
  })

  describe("parseIssueIdentifier", () => {
    // test-revizorro: approved
    it("parses full identifier like TEST-123", () => {
      const result = parseIssueIdentifier("TEST-123", "PROJ")
      expect(result.fullIdentifier).toBe("TEST-123")
      expect(result.number).toBe(123)
    })

    // test-revizorro: approved
    it("parses lowercase identifier like test-5", () => {
      const result = parseIssueIdentifier("test-5", "PROJ")
      expect(result.fullIdentifier).toBe("TEST-5")
      expect(result.number).toBe(5)
    })

    // test-revizorro: scheduled
    it("parses pure numeric identifier", () => {
      const result = parseIssueIdentifier("42", "PROJ")
      expect(result.fullIdentifier).toBe("PROJ-42")
      expect(result.number).toBe(42)
    })

    // test-revizorro: scheduled
    it("parses numeric identifier (number type)", () => {
      const result = parseIssueIdentifier(99, "PROJ")
      expect(result.fullIdentifier).toBe("PROJ-99")
      expect(result.number).toBe(99)
    })

    // test-revizorro: scheduled
    it("returns raw string when it doesn't match any pattern", () => {
      const result = parseIssueIdentifier("random-text-here", "PROJ")
      expect(result.fullIdentifier).toBe("random-text-here")
      expect(result.number).toBeNull()
    })
  })

  describe("priorityToString", () => {
    // test-revizorro: approved
    it("converts Urgent", () => {
      expect(priorityToString(IssuePriority.Urgent)).toBe("urgent")
    })

    // test-revizorro: approved
    it("converts High", () => {
      expect(priorityToString(IssuePriority.High)).toBe("high")
    })

    // test-revizorro: scheduled
    it("converts Medium", () => {
      expect(priorityToString(IssuePriority.Medium)).toBe("medium")
    })

    // test-revizorro: approved
    it("converts Low", () => {
      expect(priorityToString(IssuePriority.Low)).toBe("low")
    })

    // test-revizorro: approved
    it("converts NoPriority", () => {
      expect(priorityToString(IssuePriority.NoPriority)).toBe("no-priority")
    })
  })

  describe("stringToPriority", () => {
    // test-revizorro: approved
    it("converts 'urgent'", () => {
      expect(stringToPriority("urgent")).toBe(IssuePriority.Urgent)
    })

    // test-revizorro: approved
    it("converts 'high'", () => {
      expect(stringToPriority("high")).toBe(IssuePriority.High)
    })

    // test-revizorro: approved
    it("converts 'medium'", () => {
      expect(stringToPriority("medium")).toBe(IssuePriority.Medium)
    })

    // test-revizorro: approved
    it("converts 'low'", () => {
      expect(stringToPriority("low")).toBe(IssuePriority.Low)
    })

    // test-revizorro: approved
    it("converts 'no-priority'", () => {
      expect(stringToPriority("no-priority")).toBe(IssuePriority.NoPriority)
    })
  })

  describe("findOneOrFail", () => {
    // test-revizorro: approved
    it.effect("returns document when found", () =>
      Effect.gen(function*() {
        const project = makeProject({ identifier: "TEST" })
        const testLayer = createTestLayerWithMocks({ projects: [project] })

        const client = yield* HulyClient.pipe(Effect.provide(testLayer))
        const result = yield* findOneOrFail(
          client,
          tracker.class.Project,
          { identifier: "TEST" },
          () => ({ _tag: "NotFound" as const })
        )

        expect(result.identifier).toBe("TEST")
      }))

    // test-revizorro: approved
    it.effect("fails with error when not found", () =>
      Effect.gen(function*() {
        const testLayer = createTestLayerWithMocks({ projects: [] })

        const client = yield* HulyClient.pipe(Effect.provide(testLayer))
        const error = yield* Effect.flip(
          findOneOrFail(
            client,
            tracker.class.Project,
            { identifier: "NONEXISTENT" },
            () => ({ _tag: "NotFound" as const })
          )
        )

        expect(error._tag).toBe("NotFound")
      }))
  })

  describe("findByNameOrId", () => {
    // test-revizorro: approved
    it.effect("returns result from primary query when found", () =>
      Effect.gen(function*() {
        const project = makeProject({ identifier: "TEST" })
        const testLayer = createTestLayerWithMocks({ projects: [project] })

        const client = yield* HulyClient.pipe(Effect.provide(testLayer))
        const result = yield* findByNameOrId(
          client,
          tracker.class.Project,
          { identifier: "TEST" },
          { identifier: "FALLBACK" }
        )

        expect(result).toBeDefined()
        expect(result!.identifier).toBe("TEST")
      }))

    // test-revizorro: approved
    it.effect("falls back to second query when primary returns nothing", () =>
      Effect.gen(function*() {
        const project = makeProject({ identifier: "FALLBACK" })
        const testLayer = createTestLayerWithMocks({ projects: [project] })

        const client = yield* HulyClient.pipe(Effect.provide(testLayer))
        const result = yield* findByNameOrId(
          client,
          tracker.class.Project,
          { identifier: "PRIMARY" },
          { identifier: "FALLBACK" }
        )

        expect(result).toBeDefined()
        expect(result!.identifier).toBe("FALLBACK")
      }))

    // test-revizorro: approved
    it.effect("returns undefined when neither query matches", () =>
      Effect.gen(function*() {
        const testLayer = createTestLayerWithMocks({ projects: [] })

        const client = yield* HulyClient.pipe(Effect.provide(testLayer))
        const result = yield* findByNameOrId(
          client,
          tracker.class.Project,
          { identifier: "PRIMARY" },
          { identifier: "FALLBACK" }
        )

        expect(result).toBeUndefined()
      }))
  })

  describe("findProject", () => {
    // test-revizorro: suspect | incomplete: only asserts project.identifier, ignores client property in return type
    it.effect("returns client and project when found", () =>
      Effect.gen(function*() {
        const project = makeProject({ identifier: "TEST" })
        const testLayer = createTestLayerWithMocks({ projects: [project] })

        const result = yield* findProject("TEST").pipe(Effect.provide(testLayer))

        expect(result.project.identifier).toBe("TEST")
      }))

    // test-revizorro: approved
    it.effect("fails with ProjectNotFoundError when not found", () =>
      Effect.gen(function*() {
        const testLayer = createTestLayerWithMocks({ projects: [] })

        const error = yield* Effect.flip(findProject("NONEXISTENT").pipe(Effect.provide(testLayer)))

        expect(error._tag).toBe("ProjectNotFoundError")
        expect((error as ProjectNotFoundError).identifier).toBe("NONEXISTENT")
      }))
  })

  describe("findProjectWithStatuses", () => {
    // test-revizorro: scheduled
    it.effect("fails with ProjectNotFoundError when project not found", () =>
      Effect.gen(function*() {
        const testLayer = createTestLayerWithMocks({ projects: [], statuses: [] })

        const error = yield* Effect.flip(
          findProjectWithStatuses("NONEXISTENT").pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("ProjectNotFoundError")
        expect((error as ProjectNotFoundError).identifier).toBe("NONEXISTENT")
      }))

    // test-revizorro: approved
    it.effect("returns project with resolved statuses", () =>
      Effect.gen(function*() {
        const project = makeProject({ identifier: "TEST" })
        const openStatus = makeStatus({
          _id: "status-open" as Ref<Status>,
          name: "Open",
          category: task.statusCategory.Active
        })
        const doneStatus = makeStatus({
          _id: "status-done" as Ref<Status>,
          name: "Done",
          category: task.statusCategory.Won
        })
        const canceledStatus = makeStatus({
          _id: "status-canceled" as Ref<Status>,
          name: "Canceled",
          category: task.statusCategory.Lost
        })

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          statuses: [openStatus, doneStatus, canceledStatus]
        })

        const result = yield* findProjectWithStatuses("TEST").pipe(Effect.provide(testLayer))

        expect(result.project.identifier).toBe("TEST")
        expect(result.statuses).toHaveLength(3)

        const open = result.statuses.find(s => s.name === "Open")
        expect(open?.isDone).toBe(false)
        expect(open?.isCanceled).toBe(false)

        const done = result.statuses.find(s => s.name === "Done")
        expect(done?.isDone).toBe(true)
        expect(done?.isCanceled).toBe(false)

        const canceled = result.statuses.find(s => s.name === "Canceled")
        expect(canceled?.isDone).toBe(false)
        expect(canceled?.isCanceled).toBe(true)
      }))

    // test-revizorro: suspect | weak test: only checks length > 0, doesn't verify extracted names or isDone/isCanceled heuristics
    it.effect("uses fallback when status query fails", () =>
      Effect.gen(function*() {
        const project = makeProject({ identifier: "TEST" })
        const statuses = [
          makeStatus({ _id: "tracker:status:done-task" as Ref<Status>, name: "Done" }),
          makeStatus({ _id: "tracker:status:canceled-item" as Ref<Status>, name: "Cancel" })
        ]

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          statuses,
          statusQueryFails: true
        })

        const result = yield* findProjectWithStatuses("TEST").pipe(Effect.provide(testLayer))

        expect(result.project.identifier).toBe("TEST")
        expect(result.statuses.length).toBeGreaterThan(0)
        // Fallback uses name extracted from ref ID after last ":"
        // and heuristics for isDone/isCanceled
      }))

    // test-revizorro: approved
    it.effect("returns empty statuses when project type has no statuses", () =>
      Effect.gen(function*() {
        const project = makeProject({ identifier: "TEST" })

        // Override findOne to return project with $lookup.type but no statuses
        const findOneImpl: HulyClientOperations["findOne"] = ((_class: unknown, query: unknown, options?: unknown) => {
          if (_class === tracker.class.Project) {
            const opts = options as { lookup?: Record<string, unknown> } | undefined
            if (opts?.lookup?.type) {
              return Effect.succeed({
                ...project,
                $lookup: {
                  type: {
                    _id: "project-type-1",
                    statuses: undefined
                  }
                }
              } as Doc)
            }
            return Effect.succeed(project as Doc)
          }
          return Effect.succeed(undefined)
        }) as HulyClientOperations["findOne"]

        const testLayer = HulyClient.testLayer({
          findOne: findOneImpl,
          findAll: (() => Effect.succeed(toFindResult([]))) as HulyClientOperations["findAll"]
        })

        const result = yield* findProjectWithStatuses("TEST").pipe(Effect.provide(testLayer))

        expect(result.statuses).toEqual([])
      }))

    // test-revizorro: approved
    it.effect("handles status with no category", () =>
      Effect.gen(function*() {
        const project = makeProject({ identifier: "TEST" })
        const statusNoCategory = makeStatus({
          _id: "status-no-cat" as Ref<Status>,
          name: "Backlog"
          // no category set
        })

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          statuses: [statusNoCategory]
        })

        const result = yield* findProjectWithStatuses("TEST").pipe(Effect.provide(testLayer))

        const backlog = result.statuses.find(s => s.name === "Backlog")
        expect(backlog?.isDone).toBe(false)
        expect(backlog?.isCanceled).toBe(false)
      }))
  })

  describe("findProjectAndIssue", () => {
    // test-revizorro: approved
    it.effect("returns project and issue by full identifier", () =>
      Effect.gen(function*() {
        const project = makeProject({ identifier: "TEST" })
        const issue = makeIssue({ identifier: "TEST-1", number: 1 })

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue]
        })

        const result = yield* findProjectAndIssue({ project: "TEST", identifier: "TEST-1" }).pipe(
          Effect.provide(testLayer)
        )

        expect(result.project.identifier).toBe("TEST")
        expect(result.issue.identifier).toBe("TEST-1")
      }))

    // test-revizorro: suspect | test name claims fallback but issue exists with full identifier so first lookup succeeds, fallback never executes
    it.effect("falls back to number-based lookup", () =>
      Effect.gen(function*() {
        const project = makeProject({ identifier: "PROJ" })
        const issue = makeIssue({ identifier: "PROJ-42", number: 42 })

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue]
        })

        const result = yield* findProjectAndIssue({ project: "PROJ", identifier: "42" }).pipe(
          Effect.provide(testLayer)
        )

        expect(result.issue.identifier).toBe("PROJ-42")
      }))

    // test-revizorro: approved
    it.effect("fails with IssueNotFoundError when issue not found", () =>
      Effect.gen(function*() {
        const project = makeProject({ identifier: "TEST" })

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: []
        })

        const error = yield* Effect.flip(
          findProjectAndIssue({ project: "TEST", identifier: "TEST-999" }).pipe(
            Effect.provide(testLayer)
          )
        )

        expect(error._tag).toBe("IssueNotFoundError")
        expect((error as IssueNotFoundError).identifier).toBe("TEST-999")
      }))

    // test-revizorro: approved
    it.effect("fails with ProjectNotFoundError when project not found", () =>
      Effect.gen(function*() {
        const testLayer = createTestLayerWithMocks({ projects: [], issues: [] })

        const error = yield* Effect.flip(
          findProjectAndIssue({ project: "NONEXISTENT", identifier: "1" }).pipe(
            Effect.provide(testLayer)
          )
        )

        expect(error._tag).toBe("ProjectNotFoundError")
      }))

    // test-revizorro: suspect | test name claims fallback but first lookup (identifier: "TEST-10") succeeds, fallback never executes; weak assertion only checks number
    it.effect("returns issue found only by number fallback (identifier not matched directly)", () =>
      Effect.gen(function*() {
        const project = makeProject({ identifier: "TEST" })
        // Issue identifier is TEST-10, but we query with just "10"
        const issue = makeIssue({ identifier: "TEST-10", number: 10 })

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue]
        })

        const result = yield* findProjectAndIssue({ project: "TEST", identifier: "10" }).pipe(
          Effect.provide(testLayer)
        )

        expect(result.issue.number).toBe(10)
      }))
  })

  describe("findPersonByEmailOrName", () => {
    // test-revizorro: approved
    it.effect("finds person by exact email channel match", () =>
      Effect.gen(function*() {
        const person = makePerson({ _id: "person-1" as Ref<Person>, name: "John Doe" })
        const channel = makeChannel({
          attachedTo: "person-1" as Ref<Doc>,
          value: "john@example.com"
        })

        const testLayer = createTestLayerWithMocks({
          persons: [person],
          channels: [channel]
        })

        const client = yield* HulyClient.pipe(Effect.provide(testLayer))
        const result = yield* findPersonByEmailOrName(client, "john@example.com")

        expect(result).toBeDefined()
        expect(result!._id).toBe("person-1")
      }))

    // test-revizorro: approved
    it.effect("finds person by exact name match when email not found", () =>
      Effect.gen(function*() {
        const person = makePerson({ _id: "person-1" as Ref<Person>, name: "John Doe" })

        const testLayer = createTestLayerWithMocks({
          persons: [person],
          channels: []
        })

        const client = yield* HulyClient.pipe(Effect.provide(testLayer))
        const result = yield* findPersonByEmailOrName(client, "John Doe")

        expect(result).toBeDefined()
        expect(result!._id).toBe("person-1")
      }))

    // test-revizorro: approved
    it.effect("finds person by substring email channel match via $like", () =>
      Effect.gen(function*() {
        const person = makePerson({ _id: "person-1" as Ref<Person>, name: "John Doe" })
        const channel = makeChannel({
          attachedTo: "person-1" as Ref<Doc>,
          value: "john@example.com"
        })

        const testLayer = createTestLayerWithMocks({
          persons: [person],
          channels: [channel]
        })

        const client = yield* HulyClient.pipe(Effect.provide(testLayer))
        // Use a substring that won't match exactly
        const result = yield* findPersonByEmailOrName(client, "john@exam")

        expect(result).toBeDefined()
        expect(result!._id).toBe("person-1")
      }))

    // test-revizorro: scheduled
    it.effect("finds person by substring name match via $like", () =>
      Effect.gen(function*() {
        const person = makePerson({ _id: "person-1" as Ref<Person>, name: "John Doe" })

        const testLayer = createTestLayerWithMocks({
          persons: [person],
          channels: []
        })

        const client = yield* HulyClient.pipe(Effect.provide(testLayer))
        const result = yield* findPersonByEmailOrName(client, "ohn Do")

        expect(result).toBeDefined()
        expect(result!._id).toBe("person-1")
      }))

    // test-revizorro: approved
    it.effect("returns undefined when no match at all", () =>
      Effect.gen(function*() {
        const testLayer = createTestLayerWithMocks({
          persons: [],
          channels: []
        })

        const client = yield* HulyClient.pipe(Effect.provide(testLayer))
        const result = yield* findPersonByEmailOrName(client, "nobody@nowhere.com")

        expect(result).toBeUndefined()
      }))

    // test-revizorro: approved
    it.effect("finds person via email channel even when person lookup for channel returns undefined", () =>
      Effect.gen(function*() {
        // Channel exists but person behind it doesn't -- should fall through to name match
        const channel = makeChannel({
          attachedTo: "nonexistent" as Ref<Doc>,
          value: "orphan@example.com"
        })
        const personByName = makePerson({ _id: "person-2" as Ref<Person>, name: "orphan@example.com" })

        const testLayer = createTestLayerWithMocks({
          persons: [personByName],
          channels: [channel]
        })

        const client = yield* HulyClient.pipe(Effect.provide(testLayer))
        const result = yield* findPersonByEmailOrName(client, "orphan@example.com")

        // Should find by exact name match (step 2) after channel person lookup fails
        expect(result).toBeDefined()
        expect(result!._id).toBe("person-2")
      }))
  })
})
