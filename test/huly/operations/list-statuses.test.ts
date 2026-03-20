import { describe, it } from "@effect/vitest"
import type { PersonId, Ref, Space, Status } from "@hcengineering/core"
import { toFindResult } from "@hcengineering/core"
import type { ProjectType } from "@hcengineering/task"
import type { Project as HulyProject } from "@hcengineering/tracker"
import { Effect } from "effect"
import { expect } from "vitest"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import { core, task, tracker } from "../../../src/huly/huly-plugins.js"
import { listStatuses } from "../../../src/huly/operations/projects.js"
import { projectIdentifier } from "../../helpers/brands.js"

const asProject = (v: unknown) => v as HulyProject
const asProjectType = (v: unknown) => v as ProjectType

const makeProject = (overrides?: Partial<HulyProject>): HulyProject =>
  asProject({
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
    modifiedOn: 1700000000000,
    createdBy: "user-1" as PersonId,
    createdOn: 1700000000000,
    defaultIssueStatus: "status-1" as Ref<Status>,
    ...overrides
  })

interface MockConfig {
  projects?: Array<HulyProject>
  statuses?: Array<{ _id: Ref<Status>; name: string; category?: string }>
  projectType?: ProjectType
}

const createTestLayerWithMocks = (config: MockConfig) => {
  const projects = config.projects ?? []
  const statuses = config.statuses ?? []

  const findAllImpl: HulyClientOperations["findAll"] = ((_class: unknown, _query: unknown) => {
    if (_class === core.class.Status) {
      return Effect.succeed(toFindResult(statuses as Array<never>))
    }
    return Effect.succeed(toFindResult([]))
  }) as HulyClientOperations["findAll"]

  const findOneImpl: HulyClientOperations["findOne"] = ((_class: unknown, query: unknown, options?: unknown) => {
    if (_class === tracker.class.Project) {
      const q = query as Record<string, unknown>
      const found = projects.find(p => q.identifier ? p.identifier === q.identifier : false)
      if (found && options) {
        const opts = options as { lookup?: Record<string, unknown> }
        if (opts.lookup?.type === task.class.ProjectType && config.projectType) {
          return Effect.succeed({ ...found, $lookup: { type: config.projectType } })
        }
      }
      return Effect.succeed(found)
    }
    return Effect.succeed(undefined)
  }) as HulyClientOperations["findOne"]

  return HulyClient.testLayer({
    findAll: findAllImpl,
    findOne: findOneImpl
  })
}

describe("listStatuses", () => {
  it.effect("returns statuses with isDone, isCanceled, isDefault flags", () =>
    Effect.gen(function*() {
      const project = makeProject({ identifier: "TEST", defaultIssueStatus: "status-1" as Ref<Status> })
      const projectType = asProjectType({
        statuses: [
          { _id: "status-1" as Ref<Status> },
          { _id: "status-2" as Ref<Status> },
          { _id: "status-3" as Ref<Status> }
        ]
      })
      const statuses = [
        { _id: "status-1" as Ref<Status>, name: "Todo", category: "" },
        { _id: "status-2" as Ref<Status>, name: "Done", category: task.statusCategory.Won },
        { _id: "status-3" as Ref<Status>, name: "Cancelled", category: task.statusCategory.Lost }
      ]

      const testLayer = createTestLayerWithMocks({
        projects: [project],
        statuses,
        projectType
      })

      const result = yield* listStatuses({ project: projectIdentifier("TEST") }).pipe(Effect.provide(testLayer))

      expect(result.total).toBe(3)
      expect(result.statuses).toHaveLength(3)

      const todo = result.statuses.find(s => s.name === "Todo")
      expect(todo).toBeDefined()
      expect(todo?.isDone).toBe(false)
      expect(todo?.isCanceled).toBe(false)
      expect(todo?.isDefault).toBe(true)

      const done = result.statuses.find(s => s.name === "Done")
      expect(done?.isDone).toBe(true)
      expect(done?.isCanceled).toBe(false)
      expect(done?.isDefault).toBe(false)

      const cancelled = result.statuses.find(s => s.name === "Cancelled")
      expect(cancelled?.isDone).toBe(false)
      expect(cancelled?.isCanceled).toBe(true)
      expect(cancelled?.isDefault).toBe(false)
    }))

  it.effect("returns empty array when project has no statuses", () =>
    Effect.gen(function*() {
      const project = makeProject({ identifier: "EMPTY" })
      const projectType = asProjectType({ statuses: [] })

      const testLayer = createTestLayerWithMocks({
        projects: [project],
        projectType
      })

      const result = yield* listStatuses({ project: projectIdentifier("EMPTY") }).pipe(Effect.provide(testLayer))

      expect(result.total).toBe(0)
      expect(result.statuses).toHaveLength(0)
    }))

  it.effect("fails with ProjectNotFoundError for unknown project", () =>
    Effect.gen(function*() {
      const testLayer = createTestLayerWithMocks({ projects: [] })

      const result = yield* listStatuses({ project: projectIdentifier("NOPE") }).pipe(
        Effect.provide(testLayer),
        Effect.flip
      )

      expect(result._tag).toBe("ProjectNotFoundError")
    }))
})
