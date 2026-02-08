import { describe, it } from "@effect/vitest"
import type { Channel, Person } from "@hcengineering/contact"
import { type Doc, type Ref, type Space, type Status, toFindResult } from "@hcengineering/core"
import {
  type Issue as HulyIssue,
  IssuePriority,
  type Project as HulyProject,
  type TimeSpendReport as HulyTimeSpendReport
} from "@hcengineering/tracker"
import { Effect } from "effect"
import { expect } from "vitest"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import type { IssueNotFoundError, ProjectNotFoundError } from "../../../src/huly/errors.js"
import {
  getTimeReport,
  listTimeSpendReports,
  logTime,
  startTimer,
  stopTimer
} from "../../../src/huly/operations/time.js"

import { contact, tracker } from "../../../src/huly/huly-plugins.js"

// --- Mock Data Builders ---

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
    estimation: 60,
    remainingTime: 30,
    reportedTime: 15,
    reports: 1,
    childInfo: [],
    modifiedBy: "user-1" as Ref<Doc>,
    modifiedOn: Date.now(),
    createdBy: "user-1" as Ref<Doc>,
    createdOn: Date.now(),
    ...overrides
  }
  return result
}

const makeTimeSpendReport = (overrides?: Partial<HulyTimeSpendReport>): HulyTimeSpendReport => {
  const result: HulyTimeSpendReport = {
    _id: "report-1" as Ref<HulyTimeSpendReport>,
    _class: tracker.class.TimeSpendReport,
    space: "project-1" as Ref<Space>,
    attachedTo: "issue-1" as Ref<HulyIssue>,
    attachedToClass: tracker.class.Issue,
    collection: "reports",
    employee: null,
    date: Date.now(),
    value: 30,
    description: "Worked on feature",
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

// --- Test Helpers ---

interface MockConfig {
  projects?: Array<HulyProject>
  issues?: Array<HulyIssue>
  reports?: Array<HulyTimeSpendReport>
  persons?: Array<Person>
  channels?: Array<Channel>
  captureAddCollection?: { attributes?: Record<string, unknown>; id?: string }
  captureUpdateDoc?: { operations?: Record<string, unknown> }
}

const createTestLayerWithMocks = (config: MockConfig) => {
  const projects = config.projects ?? []
  const issues = config.issues ?? []
  const reports = config.reports ?? []
  const persons = config.persons ?? []
  const channels = config.channels ?? []

  const findAllImpl: HulyClientOperations["findAll"] = ((_class: unknown, query: unknown, options?: unknown) => {
    const opts = options as { lookup?: Record<string, unknown> } | undefined
    if (_class === tracker.class.Issue) {
      const q = query as Record<string, unknown>
      if (q._id?.$in) {
        const ids = q._id.$in as Array<string>
        const filtered = issues.filter(i => ids.includes(String(i._id)))
        return Effect.succeed(toFindResult(filtered as Array<Doc>))
      }
      return Effect.succeed(toFindResult(issues as Array<Doc>))
    }
    if (_class === tracker.class.TimeSpendReport) {
      const q = query as Record<string, unknown>
      let filtered = [...reports]
      if (q.attachedTo) {
        filtered = filtered.filter(r => String(r.attachedTo) === String(q.attachedTo))
      }
      if (q.space) {
        filtered = filtered.filter(r => String(r.space) === String(q.space))
      }
      // Add $lookup data if lookup is requested
      if (opts?.lookup) {
        filtered = filtered.map(report => {
          const lookupData: Record<string, unknown> = {}
          if (opts.lookup?.attachedTo) {
            lookupData.attachedTo = issues.find(i => String(i._id) === String(report.attachedTo))
          }
          if (opts.lookup?.employee) {
            lookupData.employee = report.employee
              ? persons.find(p => String(p._id) === String(report.employee))
              : undefined
          }
          return {
            ...report,
            $lookup: lookupData
          }
        })
      }
      return Effect.succeed(toFindResult(filtered as Array<Doc>))
    }
    if (_class === contact.class.Channel) {
      const value = (query as Record<string, unknown>).value as string
      const filtered = channels.filter(c => c.value === value)
      return Effect.succeed(toFindResult(filtered as Array<Doc>))
    }
    if (_class === contact.class.Person) {
      const q = query as Record<string, unknown>
      if (q._id?.$in) {
        const ids = q._id.$in as Array<string>
        const filtered = persons.filter(p => ids.includes(String(p._id)))
        return Effect.succeed(toFindResult(filtered as Array<Doc>))
      }
      return Effect.succeed(toFindResult(persons as Array<Doc>))
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
        || (q.space && i.space === q.space)
      )
      return Effect.succeed(found as Doc | undefined)
    }
    if (_class === contact.class.Person) {
      const id = (query as Record<string, unknown>)._id as string
      const found = persons.find(p => p._id === id)
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
    return Effect.succeed((id ?? "new-report-id") as Ref<Doc>)
  }) as HulyClientOperations["addCollection"]

  const updateDocImpl: HulyClientOperations["updateDoc"] = (
    (_class: unknown, _space: unknown, _objectId: unknown, operations: unknown) => {
      if (config.captureUpdateDoc) {
        config.captureUpdateDoc.operations = operations as Record<string, unknown>
      }
      return Effect.succeed({} as never)
    }
  ) as HulyClientOperations["updateDoc"]

  return HulyClient.testLayer({
    findAll: findAllImpl,
    findOne: findOneImpl,
    addCollection: addCollectionImpl,
    updateDoc: updateDocImpl
  })
}

// --- Tests ---

describe("logTime", () => {
  describe("basic functionality", () => {
    it.effect("logs time on an issue", () =>
      Effect.gen(function*() {
        const project = makeProject({ identifier: "TEST" })
        const issue = makeIssue({ identifier: "TEST-1", number: 1, remainingTime: 60 })

        const captureAddCollection: MockConfig["captureAddCollection"] = {}
        const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue],
          captureAddCollection,
          captureUpdateDoc
        })

        const result = yield* logTime({
          project: "TEST",
          identifier: "TEST-1",
          value: 30,
          description: "Worked on feature"
        }).pipe(Effect.provide(testLayer))

        expect(result.identifier).toBe("TEST-1")
        expect(result.reportId).toBeDefined()
        expect(captureAddCollection.attributes?.value).toBe(30)
        expect(captureAddCollection.attributes?.description).toBe("Worked on feature")
      }))

    it.effect("updates issue reportedTime and reports count", () =>
      Effect.gen(function*() {
        const project = makeProject({ identifier: "TEST" })
        const issue = makeIssue({ identifier: "TEST-1", reportedTime: 10, reports: 2 })

        const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue],
          captureUpdateDoc
        })

        yield* logTime({
          project: "TEST",
          identifier: "TEST-1",
          value: 15
        }).pipe(Effect.provide(testLayer))

        expect(captureUpdateDoc.operations?.$inc).toEqual({
          reportedTime: 15,
          reports: 1
        })
      }))

    it.effect("reduces remainingTime when time is logged", () =>
      Effect.gen(function*() {
        const project = makeProject({ identifier: "TEST" })
        const issue = makeIssue({ identifier: "TEST-1", remainingTime: 60 })

        const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue],
          captureUpdateDoc
        })

        yield* logTime({
          project: "TEST",
          identifier: "TEST-1",
          value: 25
        }).pipe(Effect.provide(testLayer))

        expect(captureUpdateDoc.operations?.remainingTime).toBe(35)
      }))

    it.effect("does not reduce remainingTime below zero", () =>
      Effect.gen(function*() {
        const project = makeProject({ identifier: "TEST" })
        const issue = makeIssue({ identifier: "TEST-1", remainingTime: 10 })

        const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue],
          captureUpdateDoc
        })

        yield* logTime({
          project: "TEST",
          identifier: "TEST-1",
          value: 50
        }).pipe(Effect.provide(testLayer))

        expect(captureUpdateDoc.operations?.remainingTime).toBe(0)
      }))

    it.effect("uses empty description when not provided", () =>
      Effect.gen(function*() {
        const project = makeProject({ identifier: "TEST" })
        const issue = makeIssue({ identifier: "TEST-1" })

        const captureAddCollection: MockConfig["captureAddCollection"] = {}

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue],
          captureAddCollection
        })

        yield* logTime({
          project: "TEST",
          identifier: "TEST-1",
          value: 10
        }).pipe(Effect.provide(testLayer))

        expect(captureAddCollection.attributes?.description).toBe("")
      }))
  })

  describe("identifier parsing", () => {
    it.effect("accepts numeric identifier", () =>
      Effect.gen(function*() {
        const project = makeProject({ identifier: "PROJ" })
        const issue = makeIssue({ identifier: "PROJ-42", number: 42 })

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue]
        })

        const result = yield* logTime({
          project: "PROJ",
          identifier: "42",
          value: 10
        }).pipe(Effect.provide(testLayer))

        expect(result.identifier).toBe("PROJ-42")
      }))

    it.effect("accepts full identifier", () =>
      Effect.gen(function*() {
        const project = makeProject({ identifier: "HULY" })
        const issue = makeIssue({ identifier: "HULY-123", number: 123 })

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue]
        })

        const result = yield* logTime({
          project: "HULY",
          identifier: "HULY-123",
          value: 10
        }).pipe(Effect.provide(testLayer))

        expect(result.identifier).toBe("HULY-123")
      }))
  })

  describe("error handling", () => {
    it.effect("returns ProjectNotFoundError when project doesn't exist", () =>
      Effect.gen(function*() {
        const testLayer = createTestLayerWithMocks({
          projects: [],
          issues: []
        })

        const error = yield* Effect.flip(
          logTime({
            project: "NONEXISTENT",
            identifier: "1",
            value: 10
          }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("ProjectNotFoundError")
        expect((error as ProjectNotFoundError).identifier).toBe("NONEXISTENT")
      }))

    it.effect("returns IssueNotFoundError when issue doesn't exist", () =>
      Effect.gen(function*() {
        const project = makeProject({ identifier: "TEST" })

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: []
        })

        const error = yield* Effect.flip(
          logTime({
            project: "TEST",
            identifier: "TEST-999",
            value: 10
          }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("IssueNotFoundError")
        expect((error as IssueNotFoundError).identifier).toBe("TEST-999")
      }))
  })
})

describe("getTimeReport", () => {
  describe("basic functionality", () => {
    it.effect("returns time report for an issue", () =>
      Effect.gen(function*() {
        const project = makeProject({ identifier: "TEST" })
        const issue = makeIssue({
          identifier: "TEST-1",
          reportedTime: 90,
          estimation: 120,
          remainingTime: 30
        })
        const report1 = makeTimeSpendReport({
          _id: "report-1" as Ref<HulyTimeSpendReport>,
          attachedTo: "issue-1" as Ref<HulyIssue>,
          value: 60,
          description: "First work session"
        })
        const report2 = makeTimeSpendReport({
          _id: "report-2" as Ref<HulyTimeSpendReport>,
          attachedTo: "issue-1" as Ref<HulyIssue>,
          value: 30,
          description: "Second work session"
        })

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue],
          reports: [report1, report2]
        })

        const result = yield* getTimeReport({
          project: "TEST",
          identifier: "TEST-1"
        }).pipe(Effect.provide(testLayer))

        expect(result.identifier).toBe("TEST-1")
        expect(result.totalTime).toBe(90)
        expect(result.estimation).toBe(120)
        expect(result.remainingTime).toBe(30)
        expect(result.reports).toHaveLength(2)
      }))

    it.effect("excludes estimation when zero", () =>
      Effect.gen(function*() {
        const project = makeProject({ identifier: "TEST" })
        const issue = makeIssue({
          identifier: "TEST-1",
          estimation: 0,
          remainingTime: 0
        })

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue],
          reports: []
        })

        const result = yield* getTimeReport({
          project: "TEST",
          identifier: "TEST-1"
        }).pipe(Effect.provide(testLayer))

        expect(result.estimation).toBeUndefined()
        expect(result.remainingTime).toBeUndefined()
      }))

    it.effect("includes employee name when assigned", () =>
      Effect.gen(function*() {
        const project = makeProject({ identifier: "TEST" })
        const issue = makeIssue({ identifier: "TEST-1" })
        const person = makePerson({ _id: "person-1" as Ref<Person>, name: "Jane Developer" })
        const report = makeTimeSpendReport({
          attachedTo: "issue-1" as Ref<HulyIssue>,
          employee: "person-1" as Ref<Person>
        })

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue],
          reports: [report],
          persons: [person]
        })

        const result = yield* getTimeReport({
          project: "TEST",
          identifier: "TEST-1"
        }).pipe(Effect.provide(testLayer))

        expect(result.reports[0].employee).toBe("Jane Developer")
      }))
  })

  describe("error handling", () => {
    it.effect("returns ProjectNotFoundError when project doesn't exist", () =>
      Effect.gen(function*() {
        const testLayer = createTestLayerWithMocks({
          projects: [],
          issues: []
        })

        const error = yield* Effect.flip(
          getTimeReport({
            project: "NONEXISTENT",
            identifier: "1"
          }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("ProjectNotFoundError")
      }))

    it.effect("returns IssueNotFoundError when issue doesn't exist", () =>
      Effect.gen(function*() {
        const project = makeProject({ identifier: "TEST" })

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: []
        })

        const error = yield* Effect.flip(
          getTimeReport({
            project: "TEST",
            identifier: "TEST-999"
          }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("IssueNotFoundError")
      }))
  })
})

describe("listTimeSpendReports", () => {
  describe("basic functionality", () => {
    it.effect("returns all reports when no filters", () =>
      Effect.gen(function*() {
        const project = makeProject({ identifier: "TEST" })
        const issue = makeIssue({ identifier: "TEST-1" })
        const report1 = makeTimeSpendReport({ _id: "report-1" as Ref<HulyTimeSpendReport> })
        const report2 = makeTimeSpendReport({ _id: "report-2" as Ref<HulyTimeSpendReport> })

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue],
          reports: [report1, report2]
        })

        const result = yield* listTimeSpendReports({}).pipe(Effect.provide(testLayer))

        expect(result).toHaveLength(2)
      }))

    it.effect("filters by project", () =>
      Effect.gen(function*() {
        const project = makeProject({ identifier: "TEST", _id: "project-1" as Ref<HulyProject> })
        const issue = makeIssue({ identifier: "TEST-1" })
        const report1 = makeTimeSpendReport({
          _id: "report-1" as Ref<HulyTimeSpendReport>,
          space: "project-1" as Ref<Space>
        })
        const report2 = makeTimeSpendReport({
          _id: "report-2" as Ref<HulyTimeSpendReport>,
          space: "other-project" as Ref<Space>
        })

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue],
          reports: [report1, report2]
        })

        const result = yield* listTimeSpendReports({
          project: "TEST"
        }).pipe(Effect.provide(testLayer))

        expect(result).toHaveLength(1)
        expect(result[0].id).toBe("report-1")
      }))

    it.effect("returns ProjectNotFoundError for invalid project filter", () =>
      Effect.gen(function*() {
        const testLayer = createTestLayerWithMocks({
          projects: [],
          issues: [],
          reports: []
        })

        const error = yield* Effect.flip(
          listTimeSpendReports({
            project: "NONEXISTENT"
          }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("ProjectNotFoundError")
      }))

    it.effect("includes issue identifier in response", () =>
      Effect.gen(function*() {
        const project = makeProject({ identifier: "TEST" })
        const issue = makeIssue({ _id: "issue-1" as Ref<HulyIssue>, identifier: "TEST-42" })
        const report = makeTimeSpendReport({
          attachedTo: "issue-1" as Ref<HulyIssue>
        })

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue],
          reports: [report]
        })

        const result = yield* listTimeSpendReports({}).pipe(Effect.provide(testLayer))

        expect(result[0].identifier).toBe("TEST-42")
      }))
  })
})

describe("startTimer", () => {
  describe("basic functionality", () => {
    it.effect("returns start timestamp and issue identifier", () =>
      Effect.gen(function*() {
        const project = makeProject({ identifier: "TEST" })
        const issue = makeIssue({ identifier: "TEST-1" })

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue]
        })

        const before = Date.now()
        const result = yield* startTimer({
          project: "TEST",
          identifier: "TEST-1"
        }).pipe(Effect.provide(testLayer))
        const after = Date.now()

        expect(result.identifier).toBe("TEST-1")
        expect(result.startedAt).toBeGreaterThanOrEqual(before)
        expect(result.startedAt).toBeLessThanOrEqual(after)
      }))
  })

  describe("error handling", () => {
    it.effect("returns ProjectNotFoundError when project doesn't exist", () =>
      Effect.gen(function*() {
        const testLayer = createTestLayerWithMocks({
          projects: [],
          issues: []
        })

        const error = yield* Effect.flip(
          startTimer({
            project: "NONEXISTENT",
            identifier: "1"
          }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("ProjectNotFoundError")
      }))

    it.effect("returns IssueNotFoundError when issue doesn't exist", () =>
      Effect.gen(function*() {
        const project = makeProject({ identifier: "TEST" })

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: []
        })

        const error = yield* Effect.flip(
          startTimer({
            project: "TEST",
            identifier: "TEST-999"
          }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("IssueNotFoundError")
      }))
  })
})

describe("stopTimer", () => {
  describe("basic functionality", () => {
    it.effect("returns stop timestamp and issue identifier", () =>
      Effect.gen(function*() {
        const project = makeProject({ identifier: "TEST" })
        const issue = makeIssue({ identifier: "TEST-1" })

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue]
        })

        const before = Date.now()
        const result = yield* stopTimer({
          project: "TEST",
          identifier: "TEST-1"
        }).pipe(Effect.provide(testLayer))
        const after = Date.now()

        expect(result.identifier).toBe("TEST-1")
        expect(result.stoppedAt).toBeGreaterThanOrEqual(before)
        expect(result.stoppedAt).toBeLessThanOrEqual(after)
      }))
  })

  describe("error handling", () => {
    it.effect("returns ProjectNotFoundError when project doesn't exist", () =>
      Effect.gen(function*() {
        const testLayer = createTestLayerWithMocks({
          projects: [],
          issues: []
        })

        const error = yield* Effect.flip(
          stopTimer({
            project: "NONEXISTENT",
            identifier: "1"
          }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("ProjectNotFoundError")
      }))

    it.effect("returns IssueNotFoundError when issue doesn't exist", () =>
      Effect.gen(function*() {
        const project = makeProject({ identifier: "TEST" })

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: []
        })

        const error = yield* Effect.flip(
          stopTimer({
            project: "TEST",
            identifier: "TEST-999"
          }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("IssueNotFoundError")
      }))
  })
})
