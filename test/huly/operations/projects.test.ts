import { describe, it, expect } from "vitest"
import { Effect } from "effect"
import type {
  Doc,
  FindResult,
  Ref,
  Space,
} from "@hcengineering/core"
import { type Project as HulyProject } from "@hcengineering/tracker"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import { listProjects } from "../../../src/huly/operations/projects.js"

// Import plugin objects at runtime (CommonJS modules)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const tracker = require("@hcengineering/tracker").default as typeof import("@hcengineering/tracker").default

// --- Mock Data Builders ---

const makeProject = (overrides?: Partial<HulyProject>): HulyProject =>
  ({
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
    modifiedBy: "user-1" as Ref<Doc>,
    modifiedOn: Date.now(),
    createdBy: "user-1" as Ref<Doc>,
    createdOn: Date.now(),
    ...overrides,
  }) as HulyProject

// --- Test Helpers ---

interface MockConfig {
  projects?: HulyProject[]
  captureQuery?: { query?: Record<string, unknown>; options?: Record<string, unknown> }
}

const createTestLayerWithMocks = (config: MockConfig) => {
  const projects = config.projects ?? []

  const findAllImpl: HulyClientOperations["findAll"] = ((_class: unknown, query: unknown, options: unknown) => {
    if (_class === tracker.class.Project) {
      if (config.captureQuery) {
        config.captureQuery.query = query as Record<string, unknown>
        config.captureQuery.options = options as Record<string, unknown>
      }

      // Filter by archived if specified in query
      const q = query as Record<string, unknown>
      let filtered = projects
      if (q.archived !== undefined) {
        filtered = projects.filter(p => p.archived === q.archived)
      }

      // Apply limit
      const opts = options as { limit?: number } | undefined
      const limit = opts?.limit ?? filtered.length
      const limited = filtered.slice(0, limit)

      // Return with total
      const result = limited as unknown as FindResult<Doc>
      ;(result as { total?: number }).total = filtered.length
      return Effect.succeed(result)
    }
    return Effect.succeed([] as unknown as FindResult<Doc>)
  }) as HulyClientOperations["findAll"]

  return HulyClient.testLayer({
    findAll: findAllImpl,
  })
}

// --- Tests ---

describe("listProjects", () => {
  describe("basic functionality", () => {
    it("returns all active projects by default", async () => {
      const projects = [
        makeProject({ identifier: "PROJ1", name: "Project 1", archived: false }),
        makeProject({ identifier: "PROJ2", name: "Project 2", archived: false }),
        makeProject({ identifier: "ARCHIVED", name: "Archived Project", archived: true }),
      ]

      const testLayer = createTestLayerWithMocks({ projects })

      const result = await Effect.runPromise(
        listProjects({}).pipe(Effect.provide(testLayer))
      )

      expect(result.projects).toHaveLength(2)
      expect(result.projects.map(p => p.identifier)).toEqual(["PROJ1", "PROJ2"])
      expect(result.total).toBe(2)
    })

    it("transforms project fields correctly", async () => {
      const project = makeProject({
        identifier: "TEST",
        name: "Test Project",
        description: "A description",
        archived: false,
      })

      const testLayer = createTestLayerWithMocks({ projects: [project] })

      const result = await Effect.runPromise(
        listProjects({}).pipe(Effect.provide(testLayer))
      )

      expect(result.projects).toHaveLength(1)
      expect(result.projects[0]).toEqual({
        identifier: "TEST",
        name: "Test Project",
        description: "A description",
        archived: false,
      })
    })

    it("handles empty description", async () => {
      const project = makeProject({
        identifier: "TEST",
        name: "No Description",
        description: "",
      })

      const testLayer = createTestLayerWithMocks({ projects: [project] })

      const result = await Effect.runPromise(
        listProjects({}).pipe(Effect.provide(testLayer))
      )

      expect(result.projects[0].description).toBeUndefined()
    })

    it("returns empty array when no projects", async () => {
      const testLayer = createTestLayerWithMocks({ projects: [] })

      const result = await Effect.runPromise(
        listProjects({}).pipe(Effect.provide(testLayer))
      )

      expect(result.projects).toHaveLength(0)
      expect(result.total).toBe(0)
    })
  })

  describe("archived filtering", () => {
    it("excludes archived projects by default", async () => {
      const captureQuery: MockConfig["captureQuery"] = {}
      const projects = [
        makeProject({ identifier: "ACTIVE", archived: false }),
        makeProject({ identifier: "ARCHIVED", archived: true }),
      ]

      const testLayer = createTestLayerWithMocks({ projects, captureQuery })

      await Effect.runPromise(
        listProjects({}).pipe(Effect.provide(testLayer))
      )

      expect(captureQuery.query?.archived).toBe(false)
    })

    it("includes archived when includeArchived=true", async () => {
      const captureQuery: MockConfig["captureQuery"] = {}
      const projects = [
        makeProject({ identifier: "ACTIVE", archived: false }),
        makeProject({ identifier: "ARCHIVED", archived: true }),
      ]

      const testLayer = createTestLayerWithMocks({ projects, captureQuery })

      const result = await Effect.runPromise(
        listProjects({ includeArchived: true }).pipe(Effect.provide(testLayer))
      )

      // When includeArchived=true, no filter applied (shows all)
      expect(captureQuery.query?.archived).toBeUndefined()
      expect(result.projects).toHaveLength(2)
      expect(result.total).toBe(2)
    })

    it("excludes archived when includeArchived=false explicitly", async () => {
      const captureQuery: MockConfig["captureQuery"] = {}
      const projects = [
        makeProject({ identifier: "ACTIVE", archived: false }),
      ]

      const testLayer = createTestLayerWithMocks({ projects, captureQuery })

      await Effect.runPromise(
        listProjects({ includeArchived: false }).pipe(Effect.provide(testLayer))
      )

      expect(captureQuery.query?.archived).toBe(false)
    })
  })

  describe("limit handling", () => {
    it("uses default limit of 50", async () => {
      const captureQuery: MockConfig["captureQuery"] = {}

      const testLayer = createTestLayerWithMocks({ projects: [], captureQuery })

      await Effect.runPromise(
        listProjects({}).pipe(Effect.provide(testLayer))
      )

      expect(captureQuery.options?.limit).toBe(50)
    })

    it("uses provided limit", async () => {
      const captureQuery: MockConfig["captureQuery"] = {}

      const testLayer = createTestLayerWithMocks({ projects: [], captureQuery })

      await Effect.runPromise(
        listProjects({ limit: 10 }).pipe(Effect.provide(testLayer))
      )

      expect(captureQuery.options?.limit).toBe(10)
    })

    it("enforces max limit of 200", async () => {
      const captureQuery: MockConfig["captureQuery"] = {}

      const testLayer = createTestLayerWithMocks({ projects: [], captureQuery })

      await Effect.runPromise(
        listProjects({ limit: 500 }).pipe(Effect.provide(testLayer))
      )

      expect(captureQuery.options?.limit).toBe(200)
    })
  })

  describe("sorting", () => {
    it("sorts by name ascending", async () => {
      const captureQuery: MockConfig["captureQuery"] = {}

      const testLayer = createTestLayerWithMocks({ projects: [], captureQuery })

      await Effect.runPromise(
        listProjects({}).pipe(Effect.provide(testLayer))
      )

      // SortingOrder.Ascending = 1
      expect((captureQuery.options?.sort as Record<string, number>)?.name).toBe(1)
    })
  })

  describe("pagination info", () => {
    it("returns total count", async () => {
      const projects = [
        makeProject({ identifier: "P1", archived: false }),
        makeProject({ identifier: "P2", archived: false }),
        makeProject({ identifier: "P3", archived: false }),
      ]

      const testLayer = createTestLayerWithMocks({ projects })

      const result = await Effect.runPromise(
        listProjects({ limit: 2 }).pipe(Effect.provide(testLayer))
      )

      expect(result.projects).toHaveLength(2)
      expect(result.total).toBe(3)
    })
  })
})
