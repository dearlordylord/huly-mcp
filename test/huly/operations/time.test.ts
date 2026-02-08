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
  createWorkSlot,
  getDetailedTimeReport,
  getTimeReport,
  listTimeSpendReports,
  listWorkSlots,
  logTime,
  startTimer,
  stopTimer
} from "../../../src/huly/operations/time.js"

import { contact, time, tracker } from "../../../src/huly/huly-plugins.js"

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
      if (q.date) {
        const dateFilter = q.date as { $gte?: number; $lte?: number }
        if (dateFilter.$gte !== undefined) {
          filtered = filtered.filter(r => r.date !== null && r.date >= dateFilter.$gte!)
        }
        if (dateFilter.$lte !== undefined) {
          filtered = filtered.filter(r => r.date !== null && r.date <= dateFilter.$lte!)
        }
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
      const q = query as Record<string, unknown>
      const value = q.value as string
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
    // Handle WorkSlot queries
    if (_class === time.class.WorkSlot) {
      // Return empty by default; override via workSlots in specific tests
      return Effect.succeed(toFindResult([]))
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
    // test-revizorro: approved
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

    // test-revizorro: scheduled
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

    // test-revizorro: approved
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

    // test-revizorro: approved
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

    // test-revizorro: scheduled
    it.effect("does not set remainingTime when it is zero", () =>
      Effect.gen(function*() {
        const project = makeProject({ identifier: "TEST" })
        const issue = makeIssue({ identifier: "TEST-1", remainingTime: 0 })

        const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue],
          captureUpdateDoc
        })

        yield* logTime({
          project: "TEST",
          identifier: "TEST-1",
          value: 10
        }).pipe(Effect.provide(testLayer))

        expect(captureUpdateDoc.operations?.remainingTime).toBeUndefined()
        expect(captureUpdateDoc.operations?.$inc).toEqual({
          reportedTime: 10,
          reports: 1
        })
      }))

    // test-revizorro: approved
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
    // test-revizorro: approved
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

    // test-revizorro: approved
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
    // test-revizorro: scheduled
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

    // test-revizorro: approved
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
    // test-revizorro: approved
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

    // test-revizorro: approved
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

    // test-revizorro: approved
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

    // test-revizorro: scheduled
    it.effect("returns undefined employee when person not found in map", () =>
      Effect.gen(function*() {
        const project = makeProject({ identifier: "TEST" })
        const issue = makeIssue({ identifier: "TEST-1" })
        const report = makeTimeSpendReport({
          attachedTo: "issue-1" as Ref<HulyIssue>,
          employee: "person-unknown" as Ref<Person>
        })

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue],
          reports: [report],
          persons: []
        })

        const result = yield* getTimeReport({
          project: "TEST",
          identifier: "TEST-1"
        }).pipe(Effect.provide(testLayer))

        expect(result.reports[0].employee).toBeUndefined()
      }))

    // test-revizorro: scheduled
    it.effect("returns undefined employee when report has no employee", () =>
      Effect.gen(function*() {
        const project = makeProject({ identifier: "TEST" })
        const issue = makeIssue({ identifier: "TEST-1" })
        const report = makeTimeSpendReport({
          attachedTo: "issue-1" as Ref<HulyIssue>,
          employee: null
        })

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue],
          reports: [report]
        })

        const result = yield* getTimeReport({
          project: "TEST",
          identifier: "TEST-1"
        }).pipe(Effect.provide(testLayer))

        expect(result.reports[0].employee).toBeUndefined()
      }))
  })

  describe("error handling", () => {
    // test-revizorro: suspect | missing identifier assertion in error; logTime test checks both _tag and identifier
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

    // test-revizorro: approved
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
    // test-revizorro: approved
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

    // test-revizorro: approved
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

    // test-revizorro: approved
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

    // test-revizorro: approved
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

  describe("date filtering", () => {
    // test-revizorro: scheduled
    it.effect("filters by from date only", () =>
      Effect.gen(function*() {
        const report1 = makeTimeSpendReport({
          _id: "report-1" as Ref<HulyTimeSpendReport>,
          date: 1000
        })
        const report2 = makeTimeSpendReport({
          _id: "report-2" as Ref<HulyTimeSpendReport>,
          date: 2000
        })

        const testLayer = createTestLayerWithMocks({
          reports: [report1, report2]
        })

        const result = yield* listTimeSpendReports({
          from: 1500
        }).pipe(Effect.provide(testLayer))

        expect(result).toHaveLength(1)
        expect(result[0].id).toBe("report-2")
      }))

    // test-revizorro: scheduled
    it.effect("filters by to date only", () =>
      Effect.gen(function*() {
        const report1 = makeTimeSpendReport({
          _id: "report-1" as Ref<HulyTimeSpendReport>,
          date: 1000
        })
        const report2 = makeTimeSpendReport({
          _id: "report-2" as Ref<HulyTimeSpendReport>,
          date: 2000
        })

        const testLayer = createTestLayerWithMocks({
          reports: [report1, report2]
        })

        const result = yield* listTimeSpendReports({
          to: 1500
        }).pipe(Effect.provide(testLayer))

        expect(result).toHaveLength(1)
        expect(result[0].id).toBe("report-1")
      }))

    // test-revizorro: approved
    it.effect("filters by both from and to", () =>
      Effect.gen(function*() {
        const report1 = makeTimeSpendReport({
          _id: "report-1" as Ref<HulyTimeSpendReport>,
          date: 1000
        })
        const report2 = makeTimeSpendReport({
          _id: "report-2" as Ref<HulyTimeSpendReport>,
          date: 2000
        })
        const report3 = makeTimeSpendReport({
          _id: "report-3" as Ref<HulyTimeSpendReport>,
          date: 3000
        })

        const testLayer = createTestLayerWithMocks({
          reports: [report1, report2, report3]
        })

        const result = yield* listTimeSpendReports({
          from: 1500,
          to: 2500
        }).pipe(Effect.provide(testLayer))

        expect(result).toHaveLength(1)
        expect(result[0].id).toBe("report-2")
      }))
  })

  describe("employee lookup", () => {
    // test-revizorro: approved
    it.effect("includes employee name from lookup", () =>
      Effect.gen(function*() {
        const issue = makeIssue({ _id: "issue-1" as Ref<HulyIssue>, identifier: "TEST-1" })
        const person = makePerson({ _id: "person-1" as Ref<Person>, name: "Alice Smith" })
        const report = makeTimeSpendReport({
          attachedTo: "issue-1" as Ref<HulyIssue>,
          employee: "person-1" as Ref<Person>
        })

        const testLayer = createTestLayerWithMocks({
          issues: [issue],
          reports: [report],
          persons: [person]
        })

        const result = yield* listTimeSpendReports({}).pipe(Effect.provide(testLayer))

        expect(result[0].employee).toBe("Alice Smith")
      }))

    // test-revizorro: approved
    it.effect("returns undefined employee when no lookup match", () =>
      Effect.gen(function*() {
        const report = makeTimeSpendReport({
          employee: null
        })

        const testLayer = createTestLayerWithMocks({
          reports: [report]
        })

        const result = yield* listTimeSpendReports({}).pipe(Effect.provide(testLayer))

        expect(result[0].employee).toBeUndefined()
      }))

    // test-revizorro: scheduled
    it.effect("returns undefined identifier when issue not in lookup", () =>
      Effect.gen(function*() {
        const report = makeTimeSpendReport({
          attachedTo: "issue-deleted" as Ref<HulyIssue>
        })

        const testLayer = createTestLayerWithMocks({
          issues: [],
          reports: [report]
        })

        const result = yield* listTimeSpendReports({}).pipe(Effect.provide(testLayer))

        expect(result[0].identifier).toBeUndefined()
      }))
  })
})

describe("getDetailedTimeReport", () => {
  describe("basic functionality", () => {
    // test-revizorro: scheduled
    it.effect("returns detailed breakdown by issue and employee", () =>
      Effect.gen(function*() {
        const project = makeProject({ identifier: "TEST", _id: "project-1" as Ref<HulyProject> })
        const issue1 = makeIssue({ _id: "issue-1" as Ref<HulyIssue>, identifier: "TEST-1", title: "Issue One" })
        const issue2 = makeIssue({ _id: "issue-2" as Ref<HulyIssue>, identifier: "TEST-2", title: "Issue Two" })
        const person = makePerson({ _id: "person-1" as Ref<Person>, name: "Alice" })

        const report1 = makeTimeSpendReport({
          _id: "r1" as Ref<HulyTimeSpendReport>,
          attachedTo: "issue-1" as Ref<HulyIssue>,
          space: "project-1" as Ref<Space>,
          employee: "person-1" as Ref<Person>,
          value: 60,
          date: 1000,
          description: "Work on issue 1"
        })
        const report2 = makeTimeSpendReport({
          _id: "r2" as Ref<HulyTimeSpendReport>,
          attachedTo: "issue-2" as Ref<HulyIssue>,
          space: "project-1" as Ref<Space>,
          employee: "person-1" as Ref<Person>,
          value: 30,
          date: 2000,
          description: "Work on issue 2"
        })
        const report3 = makeTimeSpendReport({
          _id: "r3" as Ref<HulyTimeSpendReport>,
          attachedTo: "issue-1" as Ref<HulyIssue>,
          space: "project-1" as Ref<Space>,
          employee: null,
          value: 15,
          date: 3000,
          description: "Anonymous work"
        })

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue1, issue2],
          reports: [report1, report2, report3],
          persons: [person]
        })

        const result = yield* getDetailedTimeReport({
          project: "TEST"
        }).pipe(Effect.provide(testLayer))

        expect(result.project).toBe("TEST")
        expect(result.totalTime).toBe(105)
        expect(result.byIssue).toHaveLength(2)
        expect(result.byEmployee).toHaveLength(2)

        const issue1Entry = result.byIssue.find(e => e.identifier === "TEST-1")
        expect(issue1Entry).toBeDefined()
        expect(issue1Entry!.totalTime).toBe(75)
        expect(issue1Entry!.reports).toHaveLength(2)

        const issue2Entry = result.byIssue.find(e => e.identifier === "TEST-2")
        expect(issue2Entry).toBeDefined()
        expect(issue2Entry!.totalTime).toBe(30)
        expect(issue2Entry!.reports).toHaveLength(1)

        const aliceEntry = result.byEmployee.find(e => e.employeeName === "Alice")
        expect(aliceEntry).toBeDefined()
        expect(aliceEntry!.totalTime).toBe(90)

        const unassignedEntry = result.byEmployee.find(e => e.employeeName === undefined)
        expect(unassignedEntry).toBeDefined()
        expect(unassignedEntry!.totalTime).toBe(15)
      }))

    // test-revizorro: approved
    it.effect("returns empty report when no time entries", () =>
      Effect.gen(function*() {
        const project = makeProject({ identifier: "TEST", _id: "project-1" as Ref<HulyProject> })

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          reports: []
        })

        const result = yield* getDetailedTimeReport({
          project: "TEST"
        }).pipe(Effect.provide(testLayer))

        expect(result.project).toBe("TEST")
        expect(result.totalTime).toBe(0)
        expect(result.byIssue).toHaveLength(0)
        expect(result.byEmployee).toHaveLength(0)
      }))

    // test-revizorro: approved
    it.effect("handles reports with missing issue lookups", () =>
      Effect.gen(function*() {
        const project = makeProject({ identifier: "TEST", _id: "project-1" as Ref<HulyProject> })
        const report = makeTimeSpendReport({
          _id: "r1" as Ref<HulyTimeSpendReport>,
          attachedTo: "issue-deleted" as Ref<HulyIssue>,
          space: "project-1" as Ref<Space>,
          employee: null,
          value: 20,
          description: "Orphaned report"
        })

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [],
          reports: [report]
        })

        const result = yield* getDetailedTimeReport({
          project: "TEST"
        }).pipe(Effect.provide(testLayer))

        expect(result.totalTime).toBe(20)
        expect(result.byIssue).toHaveLength(1)
        expect(result.byIssue[0].identifier).toBeUndefined()
        expect(result.byIssue[0].issueTitle).toBe("Unknown")
      }))
  })

  describe("date filtering", () => {
    // test-revizorro: approved
    it.effect("filters by from date", () =>
      Effect.gen(function*() {
        const project = makeProject({ identifier: "TEST", _id: "project-1" as Ref<HulyProject> })
        const report1 = makeTimeSpendReport({
          _id: "r1" as Ref<HulyTimeSpendReport>,
          space: "project-1" as Ref<Space>,
          date: 1000,
          value: 10
        })
        const report2 = makeTimeSpendReport({
          _id: "r2" as Ref<HulyTimeSpendReport>,
          space: "project-1" as Ref<Space>,
          date: 3000,
          value: 20
        })

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          reports: [report1, report2]
        })

        const result = yield* getDetailedTimeReport({
          project: "TEST",
          from: 2000
        }).pipe(Effect.provide(testLayer))

        expect(result.totalTime).toBe(20)
      }))

    // test-revizorro: approved
    it.effect("filters by to date", () =>
      Effect.gen(function*() {
        const project = makeProject({ identifier: "TEST", _id: "project-1" as Ref<HulyProject> })
        const report1 = makeTimeSpendReport({
          _id: "r1" as Ref<HulyTimeSpendReport>,
          space: "project-1" as Ref<Space>,
          date: 1000,
          value: 10
        })
        const report2 = makeTimeSpendReport({
          _id: "r2" as Ref<HulyTimeSpendReport>,
          space: "project-1" as Ref<Space>,
          date: 3000,
          value: 20
        })

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          reports: [report1, report2]
        })

        const result = yield* getDetailedTimeReport({
          project: "TEST",
          to: 2000
        }).pipe(Effect.provide(testLayer))

        expect(result.totalTime).toBe(10)
      }))

    // test-revizorro: approved
    it.effect("filters by from and to date", () =>
      Effect.gen(function*() {
        const project = makeProject({ identifier: "TEST", _id: "project-1" as Ref<HulyProject> })
        const report1 = makeTimeSpendReport({
          _id: "r1" as Ref<HulyTimeSpendReport>,
          space: "project-1" as Ref<Space>,
          date: 1000,
          value: 10
        })
        const report2 = makeTimeSpendReport({
          _id: "r2" as Ref<HulyTimeSpendReport>,
          space: "project-1" as Ref<Space>,
          date: 2000,
          value: 20
        })
        const report3 = makeTimeSpendReport({
          _id: "r3" as Ref<HulyTimeSpendReport>,
          space: "project-1" as Ref<Space>,
          date: 3000,
          value: 30
        })

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          reports: [report1, report2, report3]
        })

        const result = yield* getDetailedTimeReport({
          project: "TEST",
          from: 1500,
          to: 2500
        }).pipe(Effect.provide(testLayer))

        expect(result.totalTime).toBe(20)
      }))
  })

  describe("error handling", () => {
    // test-revizorro: approved
    it.effect("returns ProjectNotFoundError when project doesn't exist", () =>
      Effect.gen(function*() {
        const testLayer = createTestLayerWithMocks({
          projects: [],
          reports: []
        })

        const error = yield* Effect.flip(
          getDetailedTimeReport({
            project: "NONEXISTENT"
          }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("ProjectNotFoundError")
        expect((error as ProjectNotFoundError).identifier).toBe("NONEXISTENT")
      }))
  })

  describe("aggregation", () => {
    // test-revizorro: approved
    it.effect("aggregates multiple reports for same issue", () =>
      Effect.gen(function*() {
        const project = makeProject({ identifier: "TEST", _id: "project-1" as Ref<HulyProject> })
        const issue = makeIssue({ _id: "issue-1" as Ref<HulyIssue>, identifier: "TEST-1", title: "Issue One" })

        const report1 = makeTimeSpendReport({
          _id: "r1" as Ref<HulyTimeSpendReport>,
          attachedTo: "issue-1" as Ref<HulyIssue>,
          space: "project-1" as Ref<Space>,
          employee: null,
          value: 10
        })
        const report2 = makeTimeSpendReport({
          _id: "r2" as Ref<HulyTimeSpendReport>,
          attachedTo: "issue-1" as Ref<HulyIssue>,
          space: "project-1" as Ref<Space>,
          employee: null,
          value: 25
        })

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue],
          reports: [report1, report2]
        })

        const result = yield* getDetailedTimeReport({
          project: "TEST"
        }).pipe(Effect.provide(testLayer))

        expect(result.byIssue).toHaveLength(1)
        expect(result.byIssue[0].totalTime).toBe(35)
        expect(result.byIssue[0].reports).toHaveLength(2)
      }))

    // test-revizorro: approved
    it.effect("aggregates multiple reports for same employee", () =>
      Effect.gen(function*() {
        const project = makeProject({ identifier: "TEST", _id: "project-1" as Ref<HulyProject> })
        const issue1 = makeIssue({ _id: "issue-1" as Ref<HulyIssue>, identifier: "TEST-1" })
        const issue2 = makeIssue({ _id: "issue-2" as Ref<HulyIssue>, identifier: "TEST-2" })
        const person = makePerson({ _id: "person-1" as Ref<Person>, name: "Bob" })

        const report1 = makeTimeSpendReport({
          _id: "r1" as Ref<HulyTimeSpendReport>,
          attachedTo: "issue-1" as Ref<HulyIssue>,
          space: "project-1" as Ref<Space>,
          employee: "person-1" as Ref<Person>,
          value: 40
        })
        const report2 = makeTimeSpendReport({
          _id: "r2" as Ref<HulyTimeSpendReport>,
          attachedTo: "issue-2" as Ref<HulyIssue>,
          space: "project-1" as Ref<Space>,
          employee: "person-1" as Ref<Person>,
          value: 50
        })

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue1, issue2],
          reports: [report1, report2],
          persons: [person]
        })

        const result = yield* getDetailedTimeReport({
          project: "TEST"
        }).pipe(Effect.provide(testLayer))

        expect(result.byEmployee).toHaveLength(1)
        expect(result.byEmployee[0].employeeName).toBe("Bob")
        expect(result.byEmployee[0].totalTime).toBe(90)
      }))
  })
})

describe("listWorkSlots", () => {
  const makeWorkSlotFindAll = (slots: Array<Record<string, unknown>>, config?: MockConfig) => {
    const persons = config?.persons ?? []
    const channels = config?.channels ?? []

    const findAllImpl: HulyClientOperations["findAll"] = ((_class: unknown, query: unknown) => {
      if (_class === time.class.WorkSlot) {
        const q = query as Record<string, unknown>
        let filtered = [...slots]
        if (q.user) {
          filtered = filtered.filter(s => s.user === q.user)
        }
        if (q.date) {
          const dateFilter = q.date as { $gte?: number; $lte?: number }
          if (dateFilter.$gte !== undefined) {
            filtered = filtered.filter(s => (s.date as number) >= dateFilter.$gte!)
          }
          if (dateFilter.$lte !== undefined) {
            filtered = filtered.filter(s => (s.date as number) <= dateFilter.$lte!)
          }
        }
        return Effect.succeed(toFindResult(filtered as Array<Doc>))
      }
      if (_class === contact.class.Channel) {
        const q = query as Record<string, unknown>
        const value = q.value as string
        const filtered = channels.filter(c => c.value === value)
        return Effect.succeed(toFindResult(filtered as Array<Doc>))
      }
      return Effect.succeed(toFindResult([]))
    }) as HulyClientOperations["findAll"]

    const findOneImpl: HulyClientOperations["findOne"] = ((_class: unknown, query: unknown) => {
      if (_class === contact.class.Person) {
        const id = (query as Record<string, unknown>)._id as string
        const found = persons.find(p => p._id === id)
        return Effect.succeed(found as Doc | undefined)
      }
      return Effect.succeed(undefined)
    }) as HulyClientOperations["findOne"]

    return HulyClient.testLayer({
      findAll: findAllImpl,
      findOne: findOneImpl
    })
  }

  describe("basic functionality", () => {
    // test-revizorro: approved
    it.effect("returns work slots", () =>
      Effect.gen(function*() {
        const slots = [
          {
            _id: "slot-1",
            attachedTo: "todo-1",
            date: 1000,
            dueDate: 2000,
            title: "Morning work"
          },
          {
            _id: "slot-2",
            attachedTo: "todo-2",
            date: 3000,
            dueDate: 4000,
            title: "Afternoon work"
          }
        ]

        const testLayer = makeWorkSlotFindAll(slots)

        const result = yield* listWorkSlots({}).pipe(Effect.provide(testLayer))

        expect(result).toHaveLength(2)
        expect(result[0].id).toBe("slot-1")
        expect(result[0].todoId).toBe("todo-1")
        expect(result[0].date).toBe(1000)
        expect(result[0].dueDate).toBe(2000)
        expect(result[0].title).toBe("Morning work")
      }))

    // test-revizorro: approved
    it.effect("returns empty when no slots", () =>
      Effect.gen(function*() {
        const testLayer = makeWorkSlotFindAll([])

        const result = yield* listWorkSlots({}).pipe(Effect.provide(testLayer))

        expect(result).toHaveLength(0)
      }))
  })

  describe("employee filtering", () => {
    // test-revizorro: approved
    it.effect("filters by employee ID (person found directly)", () =>
      Effect.gen(function*() {
        const person = makePerson({ _id: "person-1" as Ref<Person>, name: "Alice" })
        const slots = [
          {
            _id: "slot-1",
            attachedTo: "todo-1",
            date: 1000,
            dueDate: 2000,
            title: "Alice's work",
            user: "person-1"
          },
          {
            _id: "slot-2",
            attachedTo: "todo-2",
            date: 3000,
            dueDate: 4000,
            title: "Bob's work",
            user: "person-2"
          }
        ]

        const testLayer = makeWorkSlotFindAll(slots, { persons: [person] })

        const result = yield* listWorkSlots({ employeeId: "person-1" }).pipe(Effect.provide(testLayer))

        expect(result).toHaveLength(1)
        expect(result[0].id).toBe("slot-1")
      }))

    // test-revizorro: approved
    it.effect("filters by employee email via channel lookup", () =>
      Effect.gen(function*() {
        const channel = makeChannel({
          value: "alice@example.com",
          attachedTo: "person-1" as Ref<Doc>
        })
        const slots = [
          {
            _id: "slot-1",
            attachedTo: "todo-1",
            date: 1000,
            dueDate: 2000,
            title: "Alice's work",
            user: "person-1"
          },
          {
            _id: "slot-2",
            attachedTo: "todo-2",
            date: 3000,
            dueDate: 4000,
            title: "Bob's work",
            user: "person-2"
          }
        ]

        const testLayer = makeWorkSlotFindAll(slots, {
          persons: [],
          channels: [channel]
        })

        const result = yield* listWorkSlots({ employeeId: "alice@example.com" }).pipe(Effect.provide(testLayer))

        expect(result).toHaveLength(1)
        expect(result[0].id).toBe("slot-1")
      }))

    // test-revizorro: approved
    it.effect("returns all slots when employee not found by ID or channel", () =>
      Effect.gen(function*() {
        const slots = [
          {
            _id: "slot-1",
            attachedTo: "todo-1",
            date: 1000,
            dueDate: 2000,
            title: "Work"
          }
        ]

        const testLayer = makeWorkSlotFindAll(slots, { persons: [], channels: [] })

        const result = yield* listWorkSlots({ employeeId: "unknown-id" }).pipe(Effect.provide(testLayer))

        // When no person or channel is found, query.user is never set, so all slots returned
        expect(result).toHaveLength(1)
      }))
  })

  describe("date filtering", () => {
    // test-revizorro: approved
    it.effect("filters by from date", () =>
      Effect.gen(function*() {
        const slots = [
          { _id: "slot-1", attachedTo: "todo-1", date: 1000, dueDate: 2000, title: "Early" },
          { _id: "slot-2", attachedTo: "todo-2", date: 3000, dueDate: 4000, title: "Late" }
        ]

        const testLayer = makeWorkSlotFindAll(slots)

        const result = yield* listWorkSlots({ from: 2000 }).pipe(Effect.provide(testLayer))

        expect(result).toHaveLength(1)
        expect(result[0].id).toBe("slot-2")
      }))

    // test-revizorro: approved
    it.effect("filters by to date", () =>
      Effect.gen(function*() {
        const slots = [
          { _id: "slot-1", attachedTo: "todo-1", date: 1000, dueDate: 2000, title: "Early" },
          { _id: "slot-2", attachedTo: "todo-2", date: 3000, dueDate: 4000, title: "Late" }
        ]

        const testLayer = makeWorkSlotFindAll(slots)

        const result = yield* listWorkSlots({ to: 2000 }).pipe(Effect.provide(testLayer))

        expect(result).toHaveLength(1)
        expect(result[0].id).toBe("slot-1")
      }))

    // test-revizorro: approved
    it.effect("filters by both from and to", () =>
      Effect.gen(function*() {
        const slots = [
          { _id: "slot-1", attachedTo: "todo-1", date: 1000, dueDate: 2000, title: "Early" },
          { _id: "slot-2", attachedTo: "todo-2", date: 3000, dueDate: 4000, title: "Middle" },
          { _id: "slot-3", attachedTo: "todo-3", date: 5000, dueDate: 6000, title: "Late" }
        ]

        const testLayer = makeWorkSlotFindAll(slots)

        const result = yield* listWorkSlots({ from: 2000, to: 4000 }).pipe(Effect.provide(testLayer))

        expect(result).toHaveLength(1)
        expect(result[0].id).toBe("slot-2")
      }))
  })
})

describe("createWorkSlot", () => {
  // test-revizorro: approved
  it.effect("creates a work slot", () =>
    Effect.gen(function*() {
      const captureAddCollection: MockConfig["captureAddCollection"] = {}

      const addCollectionImpl: HulyClientOperations["addCollection"] = ((
        _class: unknown,
        _space: unknown,
        _attachedTo: unknown,
        _attachedToClass: unknown,
        _collection: unknown,
        attributes: unknown,
        id?: unknown
      ) => {
        captureAddCollection.attributes = attributes as Record<string, unknown>
        captureAddCollection.id = id as string
        return Effect.succeed((id ?? "new-slot-id") as Ref<Doc>)
      }) as HulyClientOperations["addCollection"]

      const testLayer = HulyClient.testLayer({
        addCollection: addCollectionImpl
      })

      const result = yield* createWorkSlot({
        todoId: "todo-123",
        date: 1000,
        dueDate: 2000
      }).pipe(Effect.provide(testLayer))

      expect(result.slotId).toBeDefined()
      expect(typeof result.slotId).toBe("string")
      expect(result.slotId.length).toBeGreaterThan(0)
      expect(captureAddCollection.attributes?.date).toBe(1000)
      expect(captureAddCollection.attributes?.dueDate).toBe(2000)
      expect(captureAddCollection.attributes?.allDay).toBe(false)
      expect(captureAddCollection.attributes?.visibility).toBe("public")
    }))

  // test-revizorro: approved
  it.effect("passes correct class and space references", () =>
    Effect.gen(function*() {
      let capturedClass: unknown
      let capturedSpace: unknown
      let capturedAttachedTo: unknown
      let capturedAttachedToClass: unknown
      let capturedCollection: unknown

      const addCollectionImpl: HulyClientOperations["addCollection"] = ((
        _class: unknown,
        space: unknown,
        attachedTo: unknown,
        attachedToClass: unknown,
        collection: unknown,
        _attributes: unknown,
        id?: unknown
      ) => {
        capturedClass = _class
        capturedSpace = space
        capturedAttachedTo = attachedTo
        capturedAttachedToClass = attachedToClass
        capturedCollection = collection
        return Effect.succeed((id ?? "new-slot-id") as Ref<Doc>)
      }) as HulyClientOperations["addCollection"]

      const testLayer = HulyClient.testLayer({
        addCollection: addCollectionImpl
      })

      yield* createWorkSlot({
        todoId: "todo-abc",
        date: 5000,
        dueDate: 6000
      }).pipe(Effect.provide(testLayer))

      expect(capturedClass).toBe(time.class.WorkSlot)
      expect(capturedSpace).toBe(time.space.ToDos)
      expect(capturedAttachedTo).toBe("todo-abc")
      expect(capturedAttachedToClass).toBe(time.class.ToDo)
      expect(capturedCollection).toBe("workslots")
    }))
})

describe("startTimer", () => {
  describe("basic functionality", () => {
    // test-revizorro: approved
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
    // test-revizorro: approved
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

    // test-revizorro: approved
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
    // test-revizorro: approved
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
    // test-revizorro: suspect | incomplete assertion; should verify error.identifier like logTime test does
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

    // test-revizorro: approved
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
