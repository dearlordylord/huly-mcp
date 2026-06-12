import { describe, it } from "@effect/vitest"
import type { Doc, PersonId, Ref, Space, Status } from "@hcengineering/core"
import { SortingOrder, toFindResult } from "@hcengineering/core"
import type { ProjectType } from "@hcengineering/task"
import type { Project as HulyProject } from "@hcengineering/tracker"
import { Effect } from "effect"
import { expect } from "vitest"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import { Diagnostics, makeDiagnosticsScope } from "../../../src/huly/diagnostics.js"
import { HulyConnectionError, type ProjectNotFoundError } from "../../../src/huly/errors.js"
import { core, task, tracker } from "../../../src/huly/huly-plugins.js"
import {
  createProject,
  deleteProject,
  getProject,
  listProjects,
  listStatuses,
  updateProject
} from "../../../src/huly/operations/projects.js"
import { projectIdentifier } from "../../helpers/brands.js"
import { withDiagnostics } from "../../helpers/diagnostics.js"

// --- Mock Data Builders ---

const asProject = (v: unknown) => v as HulyProject
const asProjectType = (v: unknown) => v as ProjectType
const asStatus = (v: unknown) => v as Status
// Huly Ref brands are erased at runtime; these tests build fixture refs from stable string ids.
const statusRef = (value: string): Ref<Status> => value as Ref<Status>

const makeProject = (overrides?: Partial<HulyProject>): HulyProject => {
  const result = asProject({
    _id: "project-1" as Ref<HulyProject>,
    _class: tracker.class.Project,
    space: "space-1" as Ref<Space>,
    identifier: "TEST",
    name: "Test Project",
    description: "A test project",
    sequence: 1,
    archived: false,
    private: false,
    members: [],
    modifiedBy: "user-1" as PersonId,
    modifiedOn: 0,
    createdBy: "user-1" as PersonId,
    createdOn: 0,
    ...overrides
  })
  return result
}

const makeStatus = (overrides: Pick<Status, "_id" | "name"> & Partial<Status>): Status => {
  const { _id, name, ...rest } = overrides
  return (
    asStatus({
      _id,
      _class: core.class.Status,
      space: core.space.Model,
      modifiedBy: "user-1" as PersonId,
      modifiedOn: 0,
      createdBy: "user-1" as PersonId,
      createdOn: 0,
      ofAttribute: tracker.attribute.IssueStatus,
      name,
      category: task.statusCategory.ToDo,
      ...rest
    })
  )
}

// --- Test Helpers ---

interface MockConfig {
  projects?: Array<HulyProject>
  captureQuery?: { query?: Record<string, unknown>; options?: Record<string, unknown> }
  captureCreateDoc?: { attributes?: Record<string, unknown>; id?: string }
  captureUpdateDoc?: { operations?: Record<string, unknown> }
  captureRemoveDoc?: { called?: boolean }
  statuses?: Array<Status>
  modelStatuses?: Array<Status>
  failStatusLookup?: boolean
  failModelStatusLookup?: boolean
  projectType?: ProjectType
}

const createTestLayerWithMocks = (config: MockConfig) => {
  const projects = config.projects ?? []
  const statuses = config.statuses ?? []
  const modelStatuses = config.modelStatuses ?? []

  const findAllImpl: HulyClientOperations["findAll"] = ((_class: unknown, query: unknown, options: unknown) => {
    if (_class === tracker.class.Project) {
      if (config.captureQuery) {
        config.captureQuery.query = query as Record<string, unknown>
        config.captureQuery.options = options as Record<string, unknown>
      }

      const q = query as Record<string, unknown>
      let filtered = projects
      if (q.archived !== undefined) {
        filtered = projects.filter(p => p.archived === q.archived)
      }

      const opts = options as { limit?: number } | undefined
      const limit = opts?.limit ?? filtered.length
      const limited = filtered.slice(0, limit)

      const result = toFindResult(limited)
      ;(result as { total?: number }).total = filtered.length
      return Effect.succeed(result)
    }
    if (_class === core.class.Status) {
      if (config.failStatusLookup === true) {
        return Effect.fail(new HulyConnectionError({ message: "status lookup failed" }))
      }
      return Effect.succeed(toFindResult(statuses))
    }
    return Effect.succeed(toFindResult([]))
  }) as HulyClientOperations["findAll"]

  const findAllInModelImpl: HulyClientOperations["findAllInModel"] = ((_class: unknown) => {
    if (_class === core.class.Status) {
      if (config.failModelStatusLookup === true) {
        return Effect.fail(new HulyConnectionError({ message: "model status lookup failed" }))
      }
      return Effect.succeed(toFindResult(modelStatuses))
    }
    return Effect.succeed(toFindResult([]))
  }) as HulyClientOperations["findAllInModel"]

  const findOneImpl: HulyClientOperations["findOne"] = ((_class: unknown, query: unknown, options?: unknown) => {
    if (_class === tracker.class.Project) {
      const q = query as Record<string, unknown>
      const found = projects.find(p => {
        if (q.identifier) return p.identifier === q.identifier
        if (q._id) return p._id === q._id
        return false
      })
      if (found && options) {
        const opts = options as { lookup?: Record<string, unknown> }
        if (opts.lookup?.type === task.class.ProjectType && config.projectType) {
          const withLookup = { ...found, $lookup: { type: config.projectType } }
          return Effect.succeed(withLookup)
        }
      }
      return Effect.succeed(found)
    }
    return Effect.succeed(undefined)
  }) as HulyClientOperations["findOne"]

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
    return Effect.succeed((id ?? "new-project-id") as Ref<Doc>)
  }) as HulyClientOperations["createDoc"]

  const updateDocImpl: HulyClientOperations["updateDoc"] = (
    (_class: unknown, _space: unknown, _objectId: unknown, operations: unknown) => {
      if (config.captureUpdateDoc) {
        config.captureUpdateDoc.operations = operations as Record<string, unknown>
      }
      return Effect.succeed({})
    }
  ) as HulyClientOperations["updateDoc"]

  const removeDocImpl: HulyClientOperations["removeDoc"] = (
    (_class: unknown, _space: unknown, _objectId: unknown) => {
      if (config.captureRemoveDoc) {
        config.captureRemoveDoc.called = true
      }
      return Effect.succeed({})
    }
  ) as HulyClientOperations["removeDoc"]

  return HulyClient.testLayer({
    findAll: findAllImpl,
    findAllInModel: findAllInModelImpl,
    findOne: findOneImpl,
    createDoc: createDocImpl,
    updateDoc: updateDocImpl,
    removeDoc: removeDocImpl
  })
}

// --- Tests ---

describe("listProjects", () => {
  describe("basic functionality", () => {
    it.effect("returns all active projects by default", () =>
      Effect.gen(function*() {
        const projects = [
          makeProject({ identifier: "PROJ1", name: "Project 1", archived: false }),
          makeProject({ identifier: "PROJ2", name: "Project 2", archived: false }),
          makeProject({ identifier: "ARCHIVED", name: "Archived Project", archived: true })
        ]

        const testLayer = createTestLayerWithMocks({ projects })

        const result = yield* listProjects({}).pipe(Effect.provide(testLayer), withDiagnostics)

        expect(result.projects).toHaveLength(2)
        expect(result.projects.map(p => p.identifier)).toEqual(["PROJ1", "PROJ2"])
        expect(result.total).toBe(2)
      }))

    it.effect("transforms project fields correctly", () =>
      Effect.gen(function*() {
        const project = makeProject({
          identifier: "TEST",
          name: "Test Project",
          description: "A description",
          archived: false
        })

        const testLayer = createTestLayerWithMocks({ projects: [project] })

        const result = yield* listProjects({}).pipe(Effect.provide(testLayer), withDiagnostics)

        expect(result.projects).toHaveLength(1)
        expect(result.projects[0]).toEqual({
          identifier: "TEST",
          name: "Test Project",
          description: "A description",
          archived: false
        })
      }))

    it.effect("handles empty description", () =>
      Effect.gen(function*() {
        const project = makeProject({
          identifier: "TEST",
          name: "No Description",
          description: ""
        })

        const testLayer = createTestLayerWithMocks({ projects: [project] })

        const result = yield* listProjects({}).pipe(Effect.provide(testLayer), withDiagnostics)

        expect(result.projects[0].description).toBeUndefined()
      }))

    it.effect("fails when a listed project has invalid SDK data", () =>
      Effect.gen(function*() {
        const project = makeProject({
          identifier: "",
          name: "Invalid Project",
          archived: false
        })
        const testLayer = createTestLayerWithMocks({ projects: [project] })

        const error = yield* Effect.flip(listProjects({}).pipe(Effect.provide(testLayer), withDiagnostics))

        expect(error._tag).toBe("HulyConnectionError")
        expect(error.message).toContain("listProjects response failed schema validation")
      }))

    it.effect("returns empty array when no projects", () =>
      Effect.gen(function*() {
        const testLayer = createTestLayerWithMocks({ projects: [] })

        const result = yield* listProjects({}).pipe(Effect.provide(testLayer), withDiagnostics)

        expect(result.projects).toHaveLength(0)
        expect(result.total).toBe(0)
      }))
  })

  describe("archived filtering", () => {
    it.effect("excludes archived projects by default", () =>
      Effect.gen(function*() {
        const captureQuery: MockConfig["captureQuery"] = {}
        const projects = [
          makeProject({ identifier: "ACTIVE", archived: false }),
          makeProject({ identifier: "ARCHIVED", archived: true })
        ]

        const testLayer = createTestLayerWithMocks({ projects, captureQuery })

        const result = yield* listProjects({}).pipe(Effect.provide(testLayer), withDiagnostics)

        expect(captureQuery.query?.archived).toBe(false)
        expect(result.projects).toHaveLength(1)
        expect(result.projects[0].identifier).toBe("ACTIVE")
      }))

    it.effect("includes archived when includeArchived=true", () =>
      Effect.gen(function*() {
        const captureQuery: MockConfig["captureQuery"] = {}
        const projects = [
          makeProject({ identifier: "ACTIVE", archived: false }),
          makeProject({ identifier: "ARCHIVED", archived: true })
        ]

        const testLayer = createTestLayerWithMocks({ projects, captureQuery })

        const result = yield* listProjects({ includeArchived: true }).pipe(Effect.provide(testLayer), withDiagnostics)

        // When includeArchived=true, no filter applied (shows all)
        expect(captureQuery.query?.archived).toBeUndefined()
        expect(result.projects).toHaveLength(2)
        expect(result.total).toBe(2)
      }))

    it.effect("excludes archived when includeArchived=false explicitly", () =>
      Effect.gen(function*() {
        const captureQuery: MockConfig["captureQuery"] = {}
        const projects = [
          makeProject({ identifier: "ACTIVE", archived: false }),
          makeProject({ identifier: "ARCHIVED", archived: true })
        ]

        const testLayer = createTestLayerWithMocks({ projects, captureQuery })

        const result = yield* listProjects({ includeArchived: false }).pipe(Effect.provide(testLayer), withDiagnostics)

        expect(captureQuery.query?.archived).toBe(false)
        expect(result.projects).toHaveLength(1)
        expect(result.projects[0].identifier).toBe("ACTIVE")
      }))
  })

  describe("limit handling", () => {
    it.effect("uses default limit of 50", () =>
      Effect.gen(function*() {
        const captureQuery: MockConfig["captureQuery"] = {}

        const testLayer = createTestLayerWithMocks({ projects: [], captureQuery })

        yield* listProjects({}).pipe(Effect.provide(testLayer), withDiagnostics)

        expect(captureQuery.options?.limit).toBe(50)
      }))

    it.effect("uses provided limit", () =>
      Effect.gen(function*() {
        const captureQuery: MockConfig["captureQuery"] = {}

        const testLayer = createTestLayerWithMocks({ projects: [], captureQuery })

        yield* listProjects({ limit: 10 }).pipe(Effect.provide(testLayer), withDiagnostics)

        expect(captureQuery.options?.limit).toBe(10)
      }))

    it.effect("enforces max limit of 200", () =>
      Effect.gen(function*() {
        const captureQuery: MockConfig["captureQuery"] = {}

        const testLayer = createTestLayerWithMocks({ projects: [], captureQuery })

        yield* listProjects({ limit: 500 }).pipe(Effect.provide(testLayer), withDiagnostics)

        expect(captureQuery.options?.limit).toBe(200)
      }))
  })

  describe("sorting", () => {
    it.effect("sorts by name ascending", () =>
      Effect.gen(function*() {
        const captureQuery: MockConfig["captureQuery"] = {}

        const testLayer = createTestLayerWithMocks({ projects: [], captureQuery })

        yield* listProjects({}).pipe(Effect.provide(testLayer), withDiagnostics)

        expect((captureQuery.options?.sort as Record<string, number>).name).toBe(SortingOrder.Ascending)
      }))
  })

  describe("pagination info", () => {
    it.effect("returns total count", () =>
      Effect.gen(function*() {
        const projects = [
          makeProject({ identifier: "P1", archived: false }),
          makeProject({ identifier: "P2", archived: false }),
          makeProject({ identifier: "P3", archived: false })
        ]

        const testLayer = createTestLayerWithMocks({ projects })

        const result = yield* listProjects({ limit: 2 }).pipe(Effect.provide(testLayer), withDiagnostics)

        expect(result.projects).toHaveLength(2)
        expect(result.total).toBe(3)
      }))
  })
})

describe("getProject", () => {
  it.effect("returns project with statuses", () =>
    Effect.gen(function*() {
      const defaultStatusId = statusRef("status-1")
      const inProgressStatusId = statusRef("status-2")
      const proj = makeProject({
        identifier: "HULY",
        name: "Huly",
        description: "Main project",
        defaultIssueStatus: defaultStatusId
      })

      const testLayer = createTestLayerWithMocks({
        projects: [proj],
        statuses: [
          makeStatus({ _id: defaultStatusId, name: "Backlog" }),
          makeStatus({ _id: inProgressStatusId, name: "In Progress" })
        ],
        projectType: asProjectType({
          statuses: [
            { _id: defaultStatusId },
            { _id: inProgressStatusId }
          ]
        })
      })

      const result = yield* getProject({
        project: projectIdentifier("HULY")
      }).pipe(Effect.provide(testLayer), withDiagnostics)

      expect(result.identifier).toBe("HULY")
      expect(result.name).toBe("Huly")
      expect(result.description).toBe("Main project")
      expect(result.defaultStatus).toBe("Backlog")
      expect(result.statuses).toEqual(["Backlog", "In Progress"])
    }))

  it.effect("returns each status once when project type links and status docs are duplicated", () =>
    Effect.gen(function*() {
      const defaultStatusId = statusRef("status-1")
      const inProgressStatusId = statusRef("status-2")
      const proj = makeProject({
        identifier: "HULY",
        name: "Huly",
        defaultIssueStatus: defaultStatusId
      })

      const testLayer = createTestLayerWithMocks({
        projects: [proj],
        statuses: [
          makeStatus({ _id: defaultStatusId, name: "Backlog" }),
          makeStatus({ _id: defaultStatusId, name: "Backlog" }),
          makeStatus({ _id: inProgressStatusId, name: "In Progress" }),
          makeStatus({ _id: inProgressStatusId, name: "In Progress" })
        ],
        projectType: asProjectType({
          statuses: [
            { _id: defaultStatusId },
            { _id: defaultStatusId },
            { _id: inProgressStatusId },
            { _id: inProgressStatusId }
          ]
        })
      })

      const result = yield* getProject({
        project: projectIdentifier("HULY")
      }).pipe(Effect.provide(testLayer), withDiagnostics)

      expect(result.defaultStatus).toBe("Backlog")
      expect(result.statuses).toEqual(["Backlog", "In Progress"])
    }))

  it.effect("uses the first status when defaultIssueStatus is empty at runtime", () =>
    Effect.gen(function*() {
      const firstStatusId = statusRef("status-1")
      const proj = makeProject({
        identifier: "HULY",
        name: "Huly",

        defaultIssueStatus: "" as Ref<Status>
      })

      const testLayer = createTestLayerWithMocks({
        projects: [proj],
        statuses: [makeStatus({ _id: firstStatusId, name: "Backlog" })],
        projectType: asProjectType({ statuses: [{ _id: firstStatusId }] })
      })

      const result = yield* getProject({ project: projectIdentifier("HULY") }).pipe(
        Effect.provide(testLayer),
        withDiagnostics
      )

      expect(result.defaultStatus).toBe("Backlog")
    }))

  it.effect("falls back to raw status refs when status document lookup fails", () =>
    Effect.gen(function*() {
      const statusId = statusRef("plainstatus")
      const proj = makeProject({
        identifier: "HULY",
        name: "Huly",
        defaultIssueStatus: statusId
      })

      const testLayer = createTestLayerWithMocks({
        projects: [proj],
        failStatusLookup: true,
        projectType: asProjectType({ statuses: [{ _id: statusId }] })
      })

      const diagnostics = yield* makeDiagnosticsScope
      const result = yield* getProject({ project: projectIdentifier("HULY") }).pipe(
        Effect.provide(testLayer),
        Effect.provideService(Diagnostics, diagnostics.service)
      )
      const warnings = yield* diagnostics.drainWarnings

      expect(result.defaultStatus).toBe("plainstatus")
      expect(result.statuses).toEqual(["plainstatus"])
      expect(warnings).toHaveLength(1)
      expect(warnings[0].code).toBe("status_metadata_unresolved")
    }))

  it.effect("falls back to raw status refs when status document and model lookups both fail", () =>
    Effect.gen(function*() {
      const statusId = statusRef("plainstatus")
      const proj = makeProject({
        identifier: "HULY",
        name: "Huly",
        defaultIssueStatus: statusId
      })

      const testLayer = createTestLayerWithMocks({
        projects: [proj],
        failStatusLookup: true,
        failModelStatusLookup: true,
        projectType: asProjectType({ statuses: [{ _id: statusId }] })
      })

      const diagnostics = yield* makeDiagnosticsScope
      const result = yield* getProject({ project: projectIdentifier("HULY") }).pipe(
        Effect.provide(testLayer),
        Effect.provideService(Diagnostics, diagnostics.service)
      )
      const warnings = yield* diagnostics.drainWarnings

      expect(result.defaultStatus).toBe("plainstatus")
      expect(result.statuses).toEqual(["plainstatus"])
      expect(warnings).toHaveLength(1)
      expect(warnings[0].code).toBe("status_metadata_unresolved")
    }))

  it.effect("resolves status metadata from the local model when status document lookup fails", () =>
    Effect.gen(function*() {
      const statusId = statusRef("6a156d99dc6d0a547e9ad569")
      const proj = makeProject({
        identifier: "HULY",
        name: "Huly",
        defaultIssueStatus: statusId
      })

      const testLayer = createTestLayerWithMocks({
        projects: [proj],
        failStatusLookup: true,
        modelStatuses: [makeStatus({ _id: statusId, name: "Pronto", category: task.statusCategory.Active })],
        projectType: asProjectType({ statuses: [{ _id: statusId }] })
      })

      const diagnostics = yield* makeDiagnosticsScope
      const result = yield* listStatuses({ project: projectIdentifier("HULY") }).pipe(
        Effect.provide(testLayer),
        Effect.provideService(Diagnostics, diagnostics.service)
      )
      const warnings = yield* diagnostics.drainWarnings

      expect(result.statuses).toEqual([
        { name: "Pronto", category: "Active", isDefault: true }
      ])
      expect(warnings).toEqual([])
    }))

  it.effect("uses model and ref fallbacks only for statuses missing from a partial status document lookup", () =>
    Effect.gen(function*() {
      const resolvedStatusId = statusRef("status-open")
      const unresolvedStatusId = statusRef("plainstatus")
      const proj = makeProject({
        identifier: "HULY",
        name: "Huly",
        defaultIssueStatus: resolvedStatusId
      })

      const testLayer = createTestLayerWithMocks({
        projects: [proj],
        statuses: [makeStatus({ _id: resolvedStatusId, name: "Open", category: task.statusCategory.ToDo })],
        projectType: asProjectType({
          statuses: [
            { _id: resolvedStatusId },
            { _id: unresolvedStatusId }
          ]
        })
      })

      const diagnostics = yield* makeDiagnosticsScope
      const result = yield* listStatuses({ project: projectIdentifier("HULY") }).pipe(
        Effect.provide(testLayer),
        Effect.provideService(Diagnostics, diagnostics.service)
      )
      const warnings = yield* diagnostics.drainWarnings

      expect(result.statuses).toEqual([
        { name: "Open", category: "ToDo", isDefault: true },
        { name: "plainstatus", category: "unknown", isDefault: false }
      ])
      expect(warnings).toHaveLength(1)
      expect(warnings[0].code).toBe("status_metadata_unresolved")
    }))

  it.effect("uses model metadata for statuses missing from a partial status document lookup", () =>
    Effect.gen(function*() {
      const resolvedStatusId = statusRef("status-open")
      const modelStatusId = statusRef("status-model")
      const proj = makeProject({
        identifier: "HULY",
        name: "Huly",
        defaultIssueStatus: resolvedStatusId
      })
      const diagnostics = yield* makeDiagnosticsScope

      const testLayer = createTestLayerWithMocks({
        projects: [proj],
        statuses: [makeStatus({ _id: resolvedStatusId, name: "Open", category: task.statusCategory.ToDo })],
        modelStatuses: [makeStatus({ _id: modelStatusId, name: "Review", category: task.statusCategory.Active })],
        projectType: asProjectType({
          statuses: [
            { _id: resolvedStatusId },
            { _id: modelStatusId }
          ]
        })
      })

      const result = yield* listStatuses({ project: projectIdentifier("HULY") }).pipe(
        Effect.provide(testLayer),
        Effect.provideService(Diagnostics, diagnostics.service)
      )
      const warnings = yield* diagnostics.drainWarnings

      expect(result.statuses).toEqual([
        { name: "Open", category: "ToDo", isDefault: true },
        { name: "Review", category: "Active", isDefault: false }
      ])
      expect(warnings).toEqual([])
    }))

  it.effect("fails when project details have invalid SDK data", () =>
    Effect.gen(function*() {
      const proj = makeProject({
        identifier: "HULY",
        name: "",
        description: ""
      })

      const testLayer = createTestLayerWithMocks({
        projects: [proj],
        projectType: asProjectType({ statuses: [] })
      })

      const error = yield* Effect.flip(
        getProject({ project: projectIdentifier("HULY") }).pipe(Effect.provide(testLayer), withDiagnostics)
      )

      expect(error._tag).toBe("HulyConnectionError")
      expect(error.message).toContain("getProject response failed schema validation")
    }))

  it.effect("returns ProjectNotFoundError for nonexistent project", () =>
    Effect.gen(function*() {
      const testLayer = createTestLayerWithMocks({ projects: [] })

      const error = yield* Effect.flip(
        getProject({
          project: projectIdentifier("NOPE")
        }).pipe(Effect.provide(testLayer), withDiagnostics)
      )

      expect(error._tag).toBe("ProjectNotFoundError")
      expect((error as ProjectNotFoundError).identifier).toBe("NOPE")
    }))
})

describe("createProject", () => {
  it.effect("creates new project", () =>
    Effect.gen(function*() {
      const captureCreateDoc: MockConfig["captureCreateDoc"] = {}

      const testLayer = createTestLayerWithMocks({
        projects: [],
        captureCreateDoc
      })

      const result = yield* createProject({
        name: "My Project",
        identifier: "MYPRJ"
      }).pipe(Effect.provide(testLayer), withDiagnostics)

      expect(result.identifier).toBe("MYPRJ")
      expect(result.name).toBe("My Project")
      expect(result.created).toBe(true)
      expect(captureCreateDoc.attributes?.name).toBe("My Project")
      expect(captureCreateDoc.attributes?.identifier).toBe("MYPRJ")
      expect(captureCreateDoc.attributes?.private).toBe(false)
    }))

  it.effect("returns existing project if identifier matches (idempotent)", () =>
    Effect.gen(function*() {
      const existing = makeProject({
        _id: "existing-1" as Ref<HulyProject>,
        identifier: "EXIST",
        name: "Existing"
      })
      const captureCreateDoc: MockConfig["captureCreateDoc"] = {}

      const testLayer = createTestLayerWithMocks({
        projects: [existing],
        captureCreateDoc
      })

      const result = yield* createProject({
        name: "Existing",
        identifier: "EXIST"
      }).pipe(Effect.provide(testLayer), withDiagnostics)

      expect(result.identifier).toBe("EXIST")
      expect(result.name).toBe("Existing")
      expect(result.created).toBe(false)
      expect(captureCreateDoc.attributes).toBeUndefined()
    }))

  it.effect("creates with private flag", () =>
    Effect.gen(function*() {
      const captureCreateDoc: MockConfig["captureCreateDoc"] = {}

      const testLayer = createTestLayerWithMocks({
        projects: [],
        captureCreateDoc
      })

      const result = yield* createProject({
        name: "Secret",
        identifier: "SEC",
        private: true
      }).pipe(Effect.provide(testLayer), withDiagnostics)

      expect(result.created).toBe(true)
      expect(captureCreateDoc.attributes?.private).toBe(true)
    }))

  it.effect("creates with description", () =>
    Effect.gen(function*() {
      const captureCreateDoc: MockConfig["captureCreateDoc"] = {}

      const testLayer = createTestLayerWithMocks({
        projects: [],
        captureCreateDoc
      })

      yield* createProject({
        name: "Described",
        identifier: "DESC",
        description: "A nice project"
      }).pipe(Effect.provide(testLayer), withDiagnostics)

      expect(captureCreateDoc.attributes?.description).toBe("A nice project")
    }))
})

describe("updateProject", () => {
  it.effect("updates name", () =>
    Effect.gen(function*() {
      const proj = makeProject({ identifier: "UPD", name: "Old Name" })
      const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}

      const testLayer = createTestLayerWithMocks({
        projects: [proj],
        captureUpdateDoc
      })

      const result = yield* updateProject({
        project: projectIdentifier("UPD"),
        name: "New Name"
      }).pipe(Effect.provide(testLayer), withDiagnostics)

      expect(result.updated).toBe(true)
      expect(captureUpdateDoc.operations?.name).toBe("New Name")
    }))

  it.effect("updates description", () =>
    Effect.gen(function*() {
      const proj = makeProject({ identifier: "UPD" })
      const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}

      const testLayer = createTestLayerWithMocks({
        projects: [proj],
        captureUpdateDoc
      })

      const result = yield* updateProject({
        project: projectIdentifier("UPD"),
        description: "Updated desc"
      }).pipe(Effect.provide(testLayer), withDiagnostics)

      expect(result.updated).toBe(true)
      expect(captureUpdateDoc.operations?.description).toBe("Updated desc")
    }))

  it.effect("clears description with null", () =>
    Effect.gen(function*() {
      const proj = makeProject({ identifier: "UPD", description: "has desc" })
      const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}

      const testLayer = createTestLayerWithMocks({
        projects: [proj],
        captureUpdateDoc
      })

      const result = yield* updateProject({
        project: projectIdentifier("UPD"),
        description: null
      }).pipe(Effect.provide(testLayer), withDiagnostics)

      expect(result.updated).toBe(true)
      expect(captureUpdateDoc.operations?.description).toBe("")
    }))

  it.effect("fails when no fields provided", () =>
    Effect.gen(function*() {
      const proj = makeProject({ identifier: "UPD" })

      const testLayer = createTestLayerWithMocks({ projects: [proj] })

      const error = yield* Effect.flip(
        updateProject({
          project: projectIdentifier("UPD")
        }).pipe(Effect.provide(testLayer), withDiagnostics)
      )

      expect(error._tag).toBe("NoUpdateFieldsError")
    }))

  it.effect("returns ProjectNotFoundError for nonexistent project", () =>
    Effect.gen(function*() {
      const testLayer = createTestLayerWithMocks({ projects: [] })

      const error = yield* Effect.flip(
        updateProject({
          project: projectIdentifier("NOPE"),
          name: "new"
        }).pipe(Effect.provide(testLayer), withDiagnostics)
      )

      expect(error._tag).toBe("ProjectNotFoundError")
      expect((error as ProjectNotFoundError).identifier).toBe("NOPE")
    }))
})

describe("deleteProject", () => {
  it.effect("deletes project by identifier", () =>
    Effect.gen(function*() {
      const proj = makeProject({ _id: "p-1" as Ref<HulyProject>, identifier: "DEL" })
      const captureRemoveDoc: MockConfig["captureRemoveDoc"] = {}

      const testLayer = createTestLayerWithMocks({
        projects: [proj],
        captureRemoveDoc
      })

      const result = yield* deleteProject({
        project: projectIdentifier("DEL")
      }).pipe(Effect.provide(testLayer), withDiagnostics)

      expect(result.identifier).toBe("DEL")
      expect(result.deleted).toBe(true)
      expect(captureRemoveDoc.called).toBe(true)
    }))

  it.effect("returns ProjectNotFoundError for nonexistent project", () =>
    Effect.gen(function*() {
      const testLayer = createTestLayerWithMocks({ projects: [] })

      const error = yield* Effect.flip(
        deleteProject({
          project: projectIdentifier("NOPE")
        }).pipe(Effect.provide(testLayer), withDiagnostics)
      )

      expect(error._tag).toBe("ProjectNotFoundError")
    }))
})
