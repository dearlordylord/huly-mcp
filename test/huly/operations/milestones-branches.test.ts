/**
 * Branch coverage tests for milestones.ts.
 *
 * Lines 70-71 and 86-87 are `default: absurd(status)` branches in exhaustive
 * switch statements. These are intentionally unreachable at runtime with valid
 * TypeScript types - they exist purely as a compile-time exhaustiveness guard.
 * Cannot be tested without fabricating invalid enum values.
 *
 * This file is a placeholder acknowledging the gap.
 */
import { describe, it } from "@effect/vitest"
import { type PersonId, type Ref, type Space, toFindResult } from "@hcengineering/core"
import type { ProjectType } from "@hcengineering/task"
import { type Milestone as HulyMilestone, MilestoneStatus, type Project as HulyProject } from "@hcengineering/tracker"
import { Effect } from "effect"
import { expect } from "vitest"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import { tracker } from "../../../src/huly/huly-plugins.js"
import { listMilestones } from "../../../src/huly/operations/milestones.js"
import { projectIdentifier } from "../../helpers/brands.js"

const makeProject = (overrides?: Partial<HulyProject>): HulyProject => {
  const base = {
    _id: "project-1" as Ref<HulyProject>,
    _class: tracker.class.Project,
    space: "space-1" as Ref<Space>,
    identifier: "TEST",
    name: "Test Project",
    description: "",
    private: false,
    members: [],
    archived: false,
    sequence: 1,
    type: "project-type-1" as Ref<ProjectType>,
    modifiedBy: "user-1" as PersonId,
    modifiedOn: 0,
    createdBy: "user-1" as PersonId,
    createdOn: 0,
    ...overrides
  }
  return base as HulyProject
}

const makeMilestone = (overrides?: Partial<HulyMilestone>): HulyMilestone => {
  const base = {
    _id: "milestone-1" as Ref<HulyMilestone>,
    _class: tracker.class.Milestone,
    space: "project-1" as Ref<HulyProject>,
    label: "Sprint 1",
    description: "",
    status: MilestoneStatus.Planned,
    targetDate: 1706500000000,
    comments: 0,
    modifiedBy: "user-1" as PersonId,
    modifiedOn: 0,
    createdBy: "user-1" as PersonId,
    createdOn: 0,
    ...overrides
  }
  return base as HulyMilestone
}

describe("milestones - status mapping exhaustiveness", () => {
  it.effect("all MilestoneStatus enum values map to correct domain strings via listMilestones", () =>
    Effect.gen(function*() {
      const project = makeProject()
      const milestones = [
        makeMilestone({ _id: "m-1" as Ref<HulyMilestone>, status: MilestoneStatus.Planned, modifiedOn: 4000 }),
        makeMilestone({ _id: "m-2" as Ref<HulyMilestone>, status: MilestoneStatus.InProgress, modifiedOn: 3000 }),
        makeMilestone({ _id: "m-3" as Ref<HulyMilestone>, status: MilestoneStatus.Completed, modifiedOn: 2000 }),
        makeMilestone({ _id: "m-4" as Ref<HulyMilestone>, status: MilestoneStatus.Canceled, modifiedOn: 1000 })
      ]

      const findAllImpl: HulyClientOperations["findAll"] = ((_class: unknown, query: unknown, options: unknown) => {
        if (_class === tracker.class.Milestone) {
          const opts = options as { sort?: Record<string, number>; limit?: number } | undefined
          let result = [...milestones]
          if (opts?.sort?.modifiedOn !== undefined) {
            const direction = opts.sort.modifiedOn
            result = result.sort((a, b) => direction * (a.modifiedOn - b.modifiedOn))
          }
          if (opts?.limit) {
            result = result.slice(0, opts.limit)
          }
          return Effect.succeed(toFindResult(result))
        }
        return Effect.succeed(toFindResult([]))
      }) as HulyClientOperations["findAll"]

      const findOneImpl: HulyClientOperations["findOne"] = ((_class: unknown, _query: unknown) => {
        if (_class === tracker.class.Project) {
          return Effect.succeed(project)
        }
        return Effect.succeed(undefined)
      }) as HulyClientOperations["findOne"]

      const testLayer = HulyClient.testLayer({ findAll: findAllImpl, findOne: findOneImpl })

      const result = yield* listMilestones({ project: projectIdentifier("TEST") }).pipe(Effect.provide(testLayer))

      expect(result).toHaveLength(4)
      expect(result[0].status).toBe("planned")
      expect(result[1].status).toBe("in-progress")
      expect(result[2].status).toBe("completed")
      expect(result[3].status).toBe("canceled")
    }))
})
