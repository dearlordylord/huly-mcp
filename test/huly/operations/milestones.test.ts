import { describe, it } from "@effect/vitest"
import { expect } from "vitest"
import { Effect } from "effect"
import {
  toFindResult,
  type Doc,
  type Ref,
  type Space,
} from "@hcengineering/core"
import {
  type Issue as HulyIssue,
  type Milestone as HulyMilestone,
  MilestoneStatus,
  type Project as HulyProject,
} from "@hcengineering/tracker"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import {
  IssueNotFoundError,
  MilestoneNotFoundError,
  ProjectNotFoundError,
} from "../../../src/huly/errors.js"
import {
  listMilestones,
  getMilestone,
  createMilestone,
  updateMilestone,
  setIssueMilestone,
  deleteMilestone,
} from "../../../src/huly/operations/milestones.js"

// eslint-disable-next-line @typescript-eslint/no-require-imports
const tracker = require("@hcengineering/tracker").default as typeof import("@hcengineering/tracker").default

const makeProject = (overrides?: Partial<HulyProject>): HulyProject =>
  ({
    _id: "project-1" as Ref<HulyProject>,
    _class: tracker.class.Project,
    space: "space-1" as Ref<Space>,
    identifier: "TEST",
    name: "Test Project",
    sequence: 1,
    modifiedBy: "user-1" as Ref<Doc>,
    modifiedOn: Date.now(),
    createdBy: "user-1" as Ref<Doc>,
    createdOn: Date.now(),
    ...overrides,
  }) as HulyProject

const makeMilestone = (overrides?: Partial<HulyMilestone>): HulyMilestone =>
  ({
    _id: "milestone-1" as Ref<HulyMilestone>,
    _class: tracker.class.Milestone,
    space: "project-1" as Ref<HulyProject>,
    label: "Sprint 1",
    description: "",
    status: MilestoneStatus.Planned,
    targetDate: 1706500000000,
    comments: 0,
    modifiedBy: "user-1" as Ref<Doc>,
    modifiedOn: Date.now(),
    createdBy: "user-1" as Ref<Doc>,
    createdOn: Date.now(),
    ...overrides,
  }) as HulyMilestone

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
    milestone: null,
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

interface MockConfig {
  projects?: HulyProject[]
  milestones?: HulyMilestone[]
  issues?: HulyIssue[]
  captureMilestoneQuery?: { query?: Record<string, unknown>; options?: Record<string, unknown> }
  captureCreateDoc?: { attributes?: Record<string, unknown>; id?: string }
  captureUpdateDoc?: { operations?: Record<string, unknown> }
  captureRemoveDoc?: { called?: boolean }
}

const createTestLayerWithMocks = (config: MockConfig) => {
  const projects = config.projects ?? []
  const milestones = config.milestones ?? []
  const issues = config.issues ?? []

  const findAllImpl: HulyClientOperations["findAll"] = ((_class: unknown, query: unknown, options: unknown) => {
    if (_class === tracker.class.Milestone) {
      if (config.captureMilestoneQuery) {
        config.captureMilestoneQuery.query = query as Record<string, unknown>
        config.captureMilestoneQuery.options = options as Record<string, unknown>
      }
      const opts = options as { sort?: Record<string, number>; limit?: number } | undefined
      let result = [...milestones]
      if (opts?.sort?.modifiedOn !== undefined) {
        const direction = opts.sort.modifiedOn
        result = result.sort((a, b) => direction * (a.modifiedOn - b.modifiedOn))
      }
      if (opts?.limit) {
        result = result.slice(0, opts.limit)
      }
      return Effect.succeed(toFindResult(result as Doc[]))
    }
    return Effect.succeed(toFindResult([]))
  }) as HulyClientOperations["findAll"]

  const findOneImpl: HulyClientOperations["findOne"] = ((_class: unknown, query: unknown) => {
    if (_class === tracker.class.Project) {
      const identifier = (query as Record<string, unknown>).identifier as string
      const found = projects.find(p => p.identifier === identifier)
      return Effect.succeed(found as Doc | undefined)
    }
    if (_class === tracker.class.Milestone) {
      const q = query as Record<string, unknown>
      const found = milestones.find(m =>
        (q._id && m._id === q._id) ||
        (q.label && m.label === q.label && m.space === q.space)
      )
      return Effect.succeed(found as Doc | undefined)
    }
    if (_class === tracker.class.Issue) {
      const q = query as Record<string, unknown>
      const found = issues.find(i =>
        (q.identifier && i.identifier === q.identifier) ||
        (q.number && i.number === q.number)
      )
      return Effect.succeed(found as Doc | undefined)
    }
    return Effect.succeed(undefined)
  }) as HulyClientOperations["findOne"]

  const createDocImpl: HulyClientOperations["createDoc"] = ((
    _class: unknown, _space: unknown, attributes: unknown, id?: unknown
  ) => {
    if (config.captureCreateDoc) {
      config.captureCreateDoc.attributes = attributes as Record<string, unknown>
      config.captureCreateDoc.id = id as string
    }
    return Effect.succeed((id ?? "new-milestone-id") as Ref<Doc>)
  }) as HulyClientOperations["createDoc"]

  const updateDocImpl: HulyClientOperations["updateDoc"] = (
    (_class: unknown, _space: unknown, _objectId: unknown, operations: unknown) => {
      if (config.captureUpdateDoc) {
        config.captureUpdateDoc.operations = operations as Record<string, unknown>
      }
      return Effect.succeed({} as never)
    }
  ) as HulyClientOperations["updateDoc"]

  const removeDocImpl: HulyClientOperations["removeDoc"] = (
    (_class: unknown, _space: unknown, _objectId: unknown) => {
      if (config.captureRemoveDoc) {
        config.captureRemoveDoc.called = true
      }
      return Effect.succeed({} as never)
    }
  ) as HulyClientOperations["removeDoc"]

  return HulyClient.testLayer({
    findAll: findAllImpl,
    findOne: findOneImpl,
    createDoc: createDocImpl,
    updateDoc: updateDocImpl,
    removeDoc: removeDocImpl,
  })
}

describe("listMilestones", () => {
  describe("basic functionality", () => {
    it.effect("returns milestones for a project", () =>
      Effect.gen(function* () {
        const project = makeProject({ identifier: "TEST" })
        const milestones = [
          makeMilestone({ _id: "m-1" as Ref<HulyMilestone>, label: "Sprint 1", modifiedOn: 2000 }),
          makeMilestone({ _id: "m-2" as Ref<HulyMilestone>, label: "Sprint 2", modifiedOn: 1000 }),
        ]

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          milestones,
        })

        const result = yield* listMilestones({ project: "TEST" }).pipe(Effect.provide(testLayer))

        expect(result).toHaveLength(2)
        expect(result[0].label).toBe("Sprint 1")
        expect(result[1].label).toBe("Sprint 2")
      })
    )

    it.effect("transforms status correctly", () =>
      Effect.gen(function* () {
        const project = makeProject()
        const milestones = [
          makeMilestone({ label: "Planned", status: MilestoneStatus.Planned, modifiedOn: 4000 }),
          makeMilestone({ label: "In Progress", status: MilestoneStatus.InProgress, modifiedOn: 3000 }),
          makeMilestone({ label: "Completed", status: MilestoneStatus.Completed, modifiedOn: 2000 }),
          makeMilestone({ label: "Canceled", status: MilestoneStatus.Canceled, modifiedOn: 1000 }),
        ]

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          milestones,
        })

        const result = yield* listMilestones({ project: "TEST" }).pipe(Effect.provide(testLayer))

        expect(result[0].status).toBe("planned")
        expect(result[1].status).toBe("in-progress")
        expect(result[2].status).toBe("completed")
        expect(result[3].status).toBe("canceled")
      })
    )

    it.effect("returns empty array when no milestones", () =>
      Effect.gen(function* () {
        const project = makeProject()

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          milestones: [],
        })

        const result = yield* listMilestones({ project: "TEST" }).pipe(Effect.provide(testLayer))

        expect(result).toHaveLength(0)
      })
    )
  })

  describe("error handling", () => {
    it.effect("returns ProjectNotFoundError when project doesn't exist", () =>
      Effect.gen(function* () {
        const testLayer = createTestLayerWithMocks({
          projects: [],
          milestones: [],
        })

        const error = yield* Effect.flip(
          listMilestones({ project: "NONEXISTENT" }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("ProjectNotFoundError")
        expect((error as ProjectNotFoundError).identifier).toBe("NONEXISTENT")
      })
    )
  })

  describe("limit handling", () => {
    it.effect("uses default limit of 50", () =>
      Effect.gen(function* () {
        const project = makeProject()
        const captureQuery: MockConfig["captureMilestoneQuery"] = {}

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          milestones: [],
          captureMilestoneQuery: captureQuery,
        })

        yield* listMilestones({ project: "TEST" }).pipe(Effect.provide(testLayer))

        expect(captureQuery.options?.limit).toBe(50)
      })
    )

    it.effect("enforces max limit of 200", () =>
      Effect.gen(function* () {
        const project = makeProject()
        const captureQuery: MockConfig["captureMilestoneQuery"] = {}

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          milestones: [],
          captureMilestoneQuery: captureQuery,
        })

        yield* listMilestones({ project: "TEST", limit: 500 }).pipe(Effect.provide(testLayer))

        expect(captureQuery.options?.limit).toBe(200)
      })
    )

    it.effect("uses provided limit when under max", () =>
      Effect.gen(function* () {
        const project = makeProject()
        const captureQuery: MockConfig["captureMilestoneQuery"] = {}

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          milestones: [],
          captureMilestoneQuery: captureQuery,
        })

        yield* listMilestones({ project: "TEST", limit: 25 }).pipe(Effect.provide(testLayer))

        expect(captureQuery.options?.limit).toBe(25)
      })
    )
  })

  describe("sorting", () => {
    it.effect("sorts by modifiedOn descending", () =>
      Effect.gen(function* () {
        const project = makeProject()
        const captureQuery: MockConfig["captureMilestoneQuery"] = {}

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          milestones: [],
          captureMilestoneQuery: captureQuery,
        })

        yield* listMilestones({ project: "TEST" }).pipe(Effect.provide(testLayer))

        expect((captureQuery.options?.sort as Record<string, number>)?.modifiedOn).toBe(-1)
      })
    )
  })
})

describe("getMilestone", () => {
  describe("basic functionality", () => {
    it.effect("returns milestone by label", () =>
      Effect.gen(function* () {
        const project = makeProject({ identifier: "TEST" })
        const milestone = makeMilestone({
          label: "Sprint 1",
          description: "First sprint",
          status: MilestoneStatus.InProgress,
          targetDate: 1706500000000,
          modifiedOn: 1706400000000,
          createdOn: 1706300000000,
        })

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          milestones: [milestone],
        })

        const result = yield* getMilestone({ project: "TEST", milestone: "Sprint 1" }).pipe(Effect.provide(testLayer))

        expect(result.label).toBe("Sprint 1")
        expect(result.description).toBe("First sprint")
        expect(result.status).toBe("in-progress")
        expect(result.targetDate).toBe(1706500000000)
        expect(result.project).toBe("TEST")
      })
    )

    it.effect("returns milestone by ID", () =>
      Effect.gen(function* () {
        const project = makeProject({ identifier: "TEST" })
        const milestone = makeMilestone({
          _id: "milestone-abc" as Ref<HulyMilestone>,
          label: "Sprint 1",
        })

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          milestones: [milestone],
        })

        const result = yield* getMilestone({ project: "TEST", milestone: "milestone-abc" }).pipe(Effect.provide(testLayer))

        expect(result.id).toBe("milestone-abc")
      })
    )

    it.effect("returns empty description when not set", () =>
      Effect.gen(function* () {
        const project = makeProject()
        const milestone = makeMilestone({
          description: "",
        })

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          milestones: [milestone],
        })

        const result = yield* getMilestone({ project: "TEST", milestone: "Sprint 1" }).pipe(Effect.provide(testLayer))

        expect(result.description).toBe("")
      })
    )
  })

  describe("error handling", () => {
    it.effect("returns ProjectNotFoundError when project doesn't exist", () =>
      Effect.gen(function* () {
        const testLayer = createTestLayerWithMocks({
          projects: [],
          milestones: [],
        })

        const error = yield* Effect.flip(
          getMilestone({ project: "NONEXISTENT", milestone: "Sprint 1" }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("ProjectNotFoundError")
        expect((error as ProjectNotFoundError).identifier).toBe("NONEXISTENT")
      })
    )

    it.effect("returns MilestoneNotFoundError when milestone doesn't exist", () =>
      Effect.gen(function* () {
        const project = makeProject()

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          milestones: [],
        })

        const error = yield* Effect.flip(
          getMilestone({ project: "TEST", milestone: "NonexistentSprint" }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("MilestoneNotFoundError")
        expect((error as MilestoneNotFoundError).identifier).toBe("NonexistentSprint")
        expect((error as MilestoneNotFoundError).project).toBe("TEST")
      })
    )

    it.effect("MilestoneNotFoundError has helpful message", () =>
      Effect.gen(function* () {
        const project = makeProject()

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          milestones: [],
        })

        const error = yield* Effect.flip(
          getMilestone({ project: "TEST", milestone: "Sprint 99" }).pipe(Effect.provide(testLayer))
        )

        expect(error.message).toContain("Sprint 99")
        expect(error.message).toContain("TEST")
      })
    )
  })
})

describe("createMilestone", () => {
  describe("basic functionality", () => {
    it.effect("creates milestone with required fields", () =>
      Effect.gen(function* () {
        const project = makeProject({ identifier: "TEST" })
        const captureCreateDoc: MockConfig["captureCreateDoc"] = {}

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          milestones: [],
          captureCreateDoc,
        })

        const result = yield* createMilestone({
          project: "TEST",
          label: "Sprint 1",
          targetDate: 1706500000000,
        }).pipe(Effect.provide(testLayer))

        expect(result.label).toBe("Sprint 1")
        expect(captureCreateDoc.attributes?.label).toBe("Sprint 1")
        expect(captureCreateDoc.attributes?.targetDate).toBe(1706500000000)
        expect(captureCreateDoc.attributes?.status).toBe(MilestoneStatus.Planned)
      })
    )

    it.effect("creates milestone with description", () =>
      Effect.gen(function* () {
        const project = makeProject({ identifier: "TEST" })
        const captureCreateDoc: MockConfig["captureCreateDoc"] = {}

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          milestones: [],
          captureCreateDoc,
        })

        yield* createMilestone({
          project: "TEST",
          label: "Sprint 1",
          description: "First sprint of Q1",
          targetDate: 1706500000000,
        }).pipe(Effect.provide(testLayer))

        expect(captureCreateDoc.attributes?.description).toBe("First sprint of Q1")
      })
    )

    it.effect("sets initial status to Planned", () =>
      Effect.gen(function* () {
        const project = makeProject({ identifier: "TEST" })
        const captureCreateDoc: MockConfig["captureCreateDoc"] = {}

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          milestones: [],
          captureCreateDoc,
        })

        yield* createMilestone({
          project: "TEST",
          label: "Sprint 1",
          targetDate: 1706500000000,
        }).pipe(Effect.provide(testLayer))

        expect(captureCreateDoc.attributes?.status).toBe(MilestoneStatus.Planned)
      })
    )

    it.effect("initializes comments to 0", () =>
      Effect.gen(function* () {
        const project = makeProject({ identifier: "TEST" })
        const captureCreateDoc: MockConfig["captureCreateDoc"] = {}

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          milestones: [],
          captureCreateDoc,
        })

        yield* createMilestone({
          project: "TEST",
          label: "Sprint 1",
          targetDate: 1706500000000,
        }).pipe(Effect.provide(testLayer))

        expect(captureCreateDoc.attributes?.comments).toBe(0)
      })
    )

    it.effect("returns created milestone ID", () =>
      Effect.gen(function* () {
        const project = makeProject({ identifier: "TEST" })

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          milestones: [],
        })

        const result = yield* createMilestone({
          project: "TEST",
          label: "Sprint 1",
          targetDate: 1706500000000,
        }).pipe(Effect.provide(testLayer))

        expect(result.id).toBeDefined()
        expect(typeof result.id).toBe("string")
      })
    )
  })

  describe("error handling", () => {
    it.effect("returns ProjectNotFoundError when project doesn't exist", () =>
      Effect.gen(function* () {
        const testLayer = createTestLayerWithMocks({
          projects: [],
          milestones: [],
        })

        const error = yield* Effect.flip(
          createMilestone({
            project: "NONEXISTENT",
            label: "Sprint 1",
            targetDate: 1706500000000,
          }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("ProjectNotFoundError")
        expect((error as ProjectNotFoundError).identifier).toBe("NONEXISTENT")
      })
    )
  })
})

describe("updateMilestone", () => {
  describe("basic functionality", () => {
    it.effect("updates milestone label", () =>
      Effect.gen(function* () {
        const project = makeProject({ identifier: "TEST" })
        const milestone = makeMilestone({ label: "Sprint 1" })
        const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          milestones: [milestone],
          captureUpdateDoc,
        })

        const result = yield* updateMilestone({
          project: "TEST",
          milestone: "Sprint 1",
          label: "Sprint 1 - Updated",
        }).pipe(Effect.provide(testLayer))

        expect(result.updated).toBe(true)
        expect(captureUpdateDoc.operations?.label).toBe("Sprint 1 - Updated")
      })
    )

    it.effect("updates milestone description", () =>
      Effect.gen(function* () {
        const project = makeProject({ identifier: "TEST" })
        const milestone = makeMilestone({ label: "Sprint 1" })
        const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          milestones: [milestone],
          captureUpdateDoc,
        })

        yield* updateMilestone({
          project: "TEST",
          milestone: "Sprint 1",
          description: "Updated description",
        }).pipe(Effect.provide(testLayer))

        expect(captureUpdateDoc.operations?.description).toBe("Updated description")
      })
    )

    it.effect("updates milestone targetDate", () =>
      Effect.gen(function* () {
        const project = makeProject({ identifier: "TEST" })
        const milestone = makeMilestone({ label: "Sprint 1" })
        const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          milestones: [milestone],
          captureUpdateDoc,
        })

        yield* updateMilestone({
          project: "TEST",
          milestone: "Sprint 1",
          targetDate: 1706600000000,
        }).pipe(Effect.provide(testLayer))

        expect(captureUpdateDoc.operations?.targetDate).toBe(1706600000000)
      })
    )

    it.effect("updates milestone status", () =>
      Effect.gen(function* () {
        const project = makeProject({ identifier: "TEST" })
        const milestone = makeMilestone({ label: "Sprint 1", status: MilestoneStatus.Planned })
        const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          milestones: [milestone],
          captureUpdateDoc,
        })

        yield* updateMilestone({
          project: "TEST",
          milestone: "Sprint 1",
          status: "completed",
        }).pipe(Effect.provide(testLayer))

        expect(captureUpdateDoc.operations?.status).toBe(MilestoneStatus.Completed)
      })
    )

    it.effect("updates multiple fields at once", () =>
      Effect.gen(function* () {
        const project = makeProject({ identifier: "TEST" })
        const milestone = makeMilestone({ label: "Sprint 1" })
        const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          milestones: [milestone],
          captureUpdateDoc,
        })

        yield* updateMilestone({
          project: "TEST",
          milestone: "Sprint 1",
          label: "Sprint 1 Final",
          description: "Completed",
          status: "completed",
          targetDate: 1706700000000,
        }).pipe(Effect.provide(testLayer))

        expect(captureUpdateDoc.operations?.label).toBe("Sprint 1 Final")
        expect(captureUpdateDoc.operations?.description).toBe("Completed")
        expect(captureUpdateDoc.operations?.status).toBe(MilestoneStatus.Completed)
        expect(captureUpdateDoc.operations?.targetDate).toBe(1706700000000)
      })
    )

    it.effect("returns updated=false when no fields provided", () =>
      Effect.gen(function* () {
        const project = makeProject({ identifier: "TEST" })
        const milestone = makeMilestone({ label: "Sprint 1" })

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          milestones: [milestone],
        })

        const result = yield* updateMilestone({
          project: "TEST",
          milestone: "Sprint 1",
        }).pipe(Effect.provide(testLayer))

        expect(result.updated).toBe(false)
      })
    )

    it.effect("status string to enum conversion works for all statuses", () =>
      Effect.gen(function* () {
        const project = makeProject({ identifier: "TEST" })
        const statusMappings: Array<{ input: "planned" | "in-progress" | "completed" | "canceled"; expected: MilestoneStatus }> = [
          { input: "planned", expected: MilestoneStatus.Planned },
          { input: "in-progress", expected: MilestoneStatus.InProgress },
          { input: "completed", expected: MilestoneStatus.Completed },
          { input: "canceled", expected: MilestoneStatus.Canceled },
        ]

        for (const { input, expected } of statusMappings) {
          const milestone = makeMilestone({ label: `Sprint ${input}` })
          const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}

          const testLayer = createTestLayerWithMocks({
            projects: [project],
            milestones: [milestone],
            captureUpdateDoc,
          })

          yield* updateMilestone({
            project: "TEST",
            milestone: `Sprint ${input}`,
            status: input,
          }).pipe(Effect.provide(testLayer))

          expect(captureUpdateDoc.operations?.status).toBe(expected)
        }
      })
    )
  })

  describe("error handling", () => {
    it.effect("returns ProjectNotFoundError when project doesn't exist", () =>
      Effect.gen(function* () {
        const testLayer = createTestLayerWithMocks({
          projects: [],
          milestones: [],
        })

        const error = yield* Effect.flip(
          updateMilestone({
            project: "NONEXISTENT",
            milestone: "Sprint 1",
            label: "Updated",
          }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("ProjectNotFoundError")
      })
    )

    it.effect("returns MilestoneNotFoundError when milestone doesn't exist", () =>
      Effect.gen(function* () {
        const project = makeProject()

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          milestones: [],
        })

        const error = yield* Effect.flip(
          updateMilestone({
            project: "TEST",
            milestone: "NonexistentSprint",
            label: "Updated",
          }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("MilestoneNotFoundError")
        expect((error as MilestoneNotFoundError).identifier).toBe("NonexistentSprint")
      })
    )
  })
})

describe("setIssueMilestone", () => {
  describe("basic functionality", () => {
    it.effect("sets milestone on issue by label", () =>
      Effect.gen(function* () {
        const project = makeProject({ identifier: "TEST" })
        const milestone = makeMilestone({ _id: "m-1" as Ref<HulyMilestone>, label: "Sprint 1" })
        const issue = makeIssue({ identifier: "TEST-1", number: 1, milestone: null })
        const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          milestones: [milestone],
          issues: [issue],
          captureUpdateDoc,
        })

        const result = yield* setIssueMilestone({
          project: "TEST",
          identifier: "TEST-1",
          milestone: "Sprint 1",
        }).pipe(Effect.provide(testLayer))

        expect(result.identifier).toBe("TEST-1")
        expect(result.milestoneSet).toBe(true)
        expect(captureUpdateDoc.operations?.milestone).toBe("m-1")
      })
    )

    it.effect("sets milestone on issue by milestone ID", () =>
      Effect.gen(function* () {
        const project = makeProject({ identifier: "TEST" })
        const milestone = makeMilestone({ _id: "milestone-abc" as Ref<HulyMilestone>, label: "Sprint 1" })
        const issue = makeIssue({ identifier: "TEST-1", number: 1 })
        const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          milestones: [milestone],
          issues: [issue],
          captureUpdateDoc,
        })

        const result = yield* setIssueMilestone({
          project: "TEST",
          identifier: "TEST-1",
          milestone: "milestone-abc",
        }).pipe(Effect.provide(testLayer))

        expect(result.milestoneSet).toBe(true)
        expect(captureUpdateDoc.operations?.milestone).toBe("milestone-abc")
      })
    )

    it.effect("clears milestone when null", () =>
      Effect.gen(function* () {
        const project = makeProject({ identifier: "TEST" })
        const issue = makeIssue({ identifier: "TEST-1", number: 1, milestone: "m-1" as Ref<HulyMilestone> })
        const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          milestones: [],
          issues: [issue],
          captureUpdateDoc,
        })

        const result = yield* setIssueMilestone({
          project: "TEST",
          identifier: "TEST-1",
          milestone: null,
        }).pipe(Effect.provide(testLayer))

        expect(result.milestoneSet).toBe(true)
        expect(captureUpdateDoc.operations?.milestone).toBeNull()
      })
    )

    it.effect("finds issue by number", () =>
      Effect.gen(function* () {
        const project = makeProject({ identifier: "TEST" })
        const milestone = makeMilestone({ _id: "m-1" as Ref<HulyMilestone>, label: "Sprint 1" })
        const issue = makeIssue({ identifier: "TEST-42", number: 42 })
        const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          milestones: [milestone],
          issues: [issue],
          captureUpdateDoc,
        })

        const result = yield* setIssueMilestone({
          project: "TEST",
          identifier: "42",
          milestone: "Sprint 1",
        }).pipe(Effect.provide(testLayer))

        expect(result.identifier).toBe("TEST-42")
      })
    )
  })

  describe("error handling", () => {
    it.effect("returns ProjectNotFoundError when project doesn't exist", () =>
      Effect.gen(function* () {
        const testLayer = createTestLayerWithMocks({
          projects: [],
          milestones: [],
          issues: [],
        })

        const error = yield* Effect.flip(
          setIssueMilestone({
            project: "NONEXISTENT",
            identifier: "TEST-1",
            milestone: "Sprint 1",
          }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("ProjectNotFoundError")
      })
    )

    it.effect("returns IssueNotFoundError when issue doesn't exist", () =>
      Effect.gen(function* () {
        const project = makeProject()
        const milestone = makeMilestone({ label: "Sprint 1" })

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          milestones: [milestone],
          issues: [],
        })

        const error = yield* Effect.flip(
          setIssueMilestone({
            project: "TEST",
            identifier: "TEST-999",
            milestone: "Sprint 1",
          }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("IssueNotFoundError")
        expect((error as IssueNotFoundError).identifier).toBe("TEST-999")
        expect((error as IssueNotFoundError).project).toBe("TEST")
      })
    )

    it.effect("returns MilestoneNotFoundError when milestone doesn't exist", () =>
      Effect.gen(function* () {
        const project = makeProject()
        const issue = makeIssue({ identifier: "TEST-1", number: 1 })

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          milestones: [],
          issues: [issue],
        })

        const error = yield* Effect.flip(
          setIssueMilestone({
            project: "TEST",
            identifier: "TEST-1",
            milestone: "NonexistentSprint",
          }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("MilestoneNotFoundError")
        expect((error as MilestoneNotFoundError).identifier).toBe("NonexistentSprint")
      })
    )
  })
})

describe("deleteMilestone", () => {
  describe("basic functionality", () => {
    it.effect("deletes milestone by label", () =>
      Effect.gen(function* () {
        const project = makeProject({ identifier: "TEST" })
        const milestone = makeMilestone({ _id: "m-1" as Ref<HulyMilestone>, label: "Sprint 1" })
        const captureRemoveDoc: MockConfig["captureRemoveDoc"] = {}

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          milestones: [milestone],
          captureRemoveDoc,
        })

        const result = yield* deleteMilestone({
          project: "TEST",
          milestone: "Sprint 1",
        }).pipe(Effect.provide(testLayer))

        expect(result.id).toBe("m-1")
        expect(result.deleted).toBe(true)
        expect(captureRemoveDoc.called).toBe(true)
      })
    )

    it.effect("deletes milestone by ID", () =>
      Effect.gen(function* () {
        const project = makeProject({ identifier: "TEST" })
        const milestone = makeMilestone({ _id: "milestone-abc" as Ref<HulyMilestone>, label: "Sprint 1" })
        const captureRemoveDoc: MockConfig["captureRemoveDoc"] = {}

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          milestones: [milestone],
          captureRemoveDoc,
        })

        const result = yield* deleteMilestone({
          project: "TEST",
          milestone: "milestone-abc",
        }).pipe(Effect.provide(testLayer))

        expect(result.id).toBe("milestone-abc")
        expect(result.deleted).toBe(true)
      })
    )
  })

  describe("error handling", () => {
    it.effect("returns ProjectNotFoundError when project doesn't exist", () =>
      Effect.gen(function* () {
        const testLayer = createTestLayerWithMocks({
          projects: [],
          milestones: [],
        })

        const error = yield* Effect.flip(
          deleteMilestone({
            project: "NONEXISTENT",
            milestone: "Sprint 1",
          }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("ProjectNotFoundError")
        expect((error as ProjectNotFoundError).identifier).toBe("NONEXISTENT")
      })
    )

    it.effect("returns MilestoneNotFoundError when milestone doesn't exist", () =>
      Effect.gen(function* () {
        const project = makeProject()

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          milestones: [],
        })

        const error = yield* Effect.flip(
          deleteMilestone({
            project: "TEST",
            milestone: "NonexistentSprint",
          }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("MilestoneNotFoundError")
        expect((error as MilestoneNotFoundError).identifier).toBe("NonexistentSprint")
        expect((error as MilestoneNotFoundError).project).toBe("TEST")
      })
    )
  })
})
