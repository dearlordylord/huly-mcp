import { describe, it } from "@effect/vitest"
import { type Doc, type PersonId, type Ref, type Space, toFindResult } from "@hcengineering/core"
import { type Project as HulyProject } from "@hcengineering/tracker"
import { Effect } from "effect"
import { expect } from "vitest"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import { listProjects } from "../../../src/huly/operations/projects.js"

import { tracker } from "../../../src/huly/huly-plugins.js"

// --- Mock Data Builders ---

const asProject = (v: unknown) => v as HulyProject

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
    modifiedOn: Date.now(),
    createdBy: "user-1" as PersonId,
    createdOn: Date.now(),
    ...overrides
  })
  return result
}

// --- Test Helpers ---

interface MockConfig {
  projects?: Array<HulyProject>
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
      const result = toFindResult(limited as Array<Doc>)
      ;(result as { total?: number }).total = filtered.length
      return Effect.succeed(result)
    }
    return Effect.succeed(toFindResult([]))
  }) as HulyClientOperations["findAll"]

  return HulyClient.testLayer({
    findAll: findAllImpl
  })
}

// --- Tests ---

describe("listProjects", () => {
  describe("basic functionality", () => {
    // test-revizorro: approved
    it.effect("returns all active projects by default", () =>
      Effect.gen(function*() {
        const projects = [
          makeProject({ identifier: "PROJ1", name: "Project 1", archived: false }),
          makeProject({ identifier: "PROJ2", name: "Project 2", archived: false }),
          makeProject({ identifier: "ARCHIVED", name: "Archived Project", archived: true })
        ]

        const testLayer = createTestLayerWithMocks({ projects })

        const result = yield* listProjects({}).pipe(Effect.provide(testLayer))

        expect(result.projects).toHaveLength(2)
        expect(result.projects.map(p => p.identifier)).toEqual(["PROJ1", "PROJ2"])
        expect(result.total).toBe(2)
      }))

    // test-revizorro: approved
    it.effect("transforms project fields correctly", () =>
      Effect.gen(function*() {
        const project = makeProject({
          identifier: "TEST",
          name: "Test Project",
          description: "A description",
          archived: false
        })

        const testLayer = createTestLayerWithMocks({ projects: [project] })

        const result = yield* listProjects({}).pipe(Effect.provide(testLayer))

        expect(result.projects).toHaveLength(1)
        expect(result.projects[0]).toEqual({
          identifier: "TEST",
          name: "Test Project",
          description: "A description",
          archived: false
        })
      }))

    // test-revizorro: approved
    it.effect("handles empty description", () =>
      Effect.gen(function*() {
        const project = makeProject({
          identifier: "TEST",
          name: "No Description",
          description: ""
        })

        const testLayer = createTestLayerWithMocks({ projects: [project] })

        const result = yield* listProjects({}).pipe(Effect.provide(testLayer))

        expect(result.projects[0].description).toBeUndefined()
      }))

    // test-revizorro: approved
    it.effect("returns empty array when no projects", () =>
      Effect.gen(function*() {
        const testLayer = createTestLayerWithMocks({ projects: [] })

        const result = yield* listProjects({}).pipe(Effect.provide(testLayer))

        expect(result.projects).toHaveLength(0)
        expect(result.total).toBe(0)
      }))
  })

  describe("archived filtering", () => {
    // test-revizorro: suspect | only checks query params, not actual filtered results returned
    it.effect("excludes archived projects by default", () =>
      Effect.gen(function*() {
        const captureQuery: MockConfig["captureQuery"] = {}
        const projects = [
          makeProject({ identifier: "ACTIVE", archived: false }),
          makeProject({ identifier: "ARCHIVED", archived: true })
        ]

        const testLayer = createTestLayerWithMocks({ projects, captureQuery })

        yield* listProjects({}).pipe(Effect.provide(testLayer))

        expect(captureQuery.query?.archived).toBe(false)
      }))

    // test-revizorro: approved
    it.effect("includes archived when includeArchived=true", () =>
      Effect.gen(function*() {
        const captureQuery: MockConfig["captureQuery"] = {}
        const projects = [
          makeProject({ identifier: "ACTIVE", archived: false }),
          makeProject({ identifier: "ARCHIVED", archived: true })
        ]

        const testLayer = createTestLayerWithMocks({ projects, captureQuery })

        const result = yield* listProjects({ includeArchived: true }).pipe(Effect.provide(testLayer))

        // When includeArchived=true, no filter applied (shows all)
        expect(captureQuery.query?.archived).toBeUndefined()
        expect(result.projects).toHaveLength(2)
        expect(result.total).toBe(2)
      }))

    // test-revizorro: suspect | only checks query param, not actual filtered results; should verify archived projects excluded from output
    it.effect("excludes archived when includeArchived=false explicitly", () =>
      Effect.gen(function*() {
        const captureQuery: MockConfig["captureQuery"] = {}
        const projects = [
          makeProject({ identifier: "ACTIVE", archived: false })
        ]

        const testLayer = createTestLayerWithMocks({ projects, captureQuery })

        yield* listProjects({ includeArchived: false }).pipe(Effect.provide(testLayer))

        expect(captureQuery.query?.archived).toBe(false)
      }))
  })

  describe("limit handling", () => {
    // test-revizorro: approved
    it.effect("uses default limit of 50", () =>
      Effect.gen(function*() {
        const captureQuery: MockConfig["captureQuery"] = {}

        const testLayer = createTestLayerWithMocks({ projects: [], captureQuery })

        yield* listProjects({}).pipe(Effect.provide(testLayer))

        expect(captureQuery.options?.limit).toBe(50)
      }))

    // test-revizorro: approved
    it.effect("uses provided limit", () =>
      Effect.gen(function*() {
        const captureQuery: MockConfig["captureQuery"] = {}

        const testLayer = createTestLayerWithMocks({ projects: [], captureQuery })

        yield* listProjects({ limit: 10 }).pipe(Effect.provide(testLayer))

        expect(captureQuery.options?.limit).toBe(10)
      }))

    // test-revizorro: approved
    it.effect("enforces max limit of 200", () =>
      Effect.gen(function*() {
        const captureQuery: MockConfig["captureQuery"] = {}

        const testLayer = createTestLayerWithMocks({ projects: [], captureQuery })

        yield* listProjects({ limit: 500 }).pipe(Effect.provide(testLayer))

        expect(captureQuery.options?.limit).toBe(200)
      }))
  })

  describe("sorting", () => {
    // test-revizorro: suspect | weak assertion: checks magic number 1 instead of SortingOrder.Ascending constant; doesn't verify sorting works
    it.effect("sorts by name ascending", () =>
      Effect.gen(function*() {
        const captureQuery: MockConfig["captureQuery"] = {}

        const testLayer = createTestLayerWithMocks({ projects: [], captureQuery })

        yield* listProjects({}).pipe(Effect.provide(testLayer))

        // SortingOrder.Ascending = 1
        expect((captureQuery.options?.sort as Record<string, number>).name).toBe(1)
      }))
  })

  describe("pagination info", () => {
    // test-revizorro: approved
    it.effect("returns total count", () =>
      Effect.gen(function*() {
        const projects = [
          makeProject({ identifier: "P1", archived: false }),
          makeProject({ identifier: "P2", archived: false }),
          makeProject({ identifier: "P3", archived: false })
        ]

        const testLayer = createTestLayerWithMocks({ projects })

        const result = yield* listProjects({ limit: 2 }).pipe(Effect.provide(testLayer))

        expect(result.projects).toHaveLength(2)
        expect(result.total).toBe(3)
      }))
  })
})
