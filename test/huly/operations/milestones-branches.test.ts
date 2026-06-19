import { assertAt } from "../../../src/utils/assertions.js"
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
import { listMilestones, updateMilestone } from "../../../src/huly/operations/milestones.js"
import { milestoneIdentifier, projectIdentifier } from "../../helpers/brands.js"

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
      expect(assertAt(result, 0).status).toBe("planned")
      expect(assertAt(result, 1).status).toBe("in-progress")
      expect(assertAt(result, 2).status).toBe("completed")
      expect(assertAt(result, 3).status).toBe("canceled")
    }))
})

describe("updateMilestone - description dual-write", () => {
  it.effect("uploads markup when a non-empty description is provided", () =>
    Effect.gen(function*() {
      const project = makeProject()
      const milestone = makeMilestone({ _id: "m-1" as Ref<HulyMilestone>, label: "Sprint 1" })

      const uploads: Array<{ readonly attr: string; readonly value: string }> = []
      const updates: Array<Record<string, unknown>> = []

      const findOneImpl: HulyClientOperations["findOne"] = ((_class: unknown) => {
        if (_class === tracker.class.Project) return Effect.succeed(project)
        if (_class === tracker.class.Milestone) return Effect.succeed(milestone)
        return Effect.succeed(undefined)
      }) as HulyClientOperations["findOne"]

      // eslint-disable-next-line no-restricted-syntax -- stub returns Effect<string> which doesn't overlap the SDK's Effect<MarkupRef> return
      const uploadMarkupImpl: HulyClientOperations["uploadMarkup"] = ((
        _objectClass: unknown,
        _objectId: unknown,
        objectAttr: unknown,
        value: unknown
      ) => {
        uploads.push({ attr: String(objectAttr), value: String(value) })
        return Effect.succeed("markup-ref")
      }) as unknown as HulyClientOperations["uploadMarkup"]

      const updateDocImpl: HulyClientOperations["updateDoc"] = ((
        _class: unknown,
        _space: unknown,
        _objectId: unknown,
        operations: Record<string, unknown>
      ) => {
        updates.push(operations)
        return Effect.succeed({})
      }) as HulyClientOperations["updateDoc"]

      const testLayer = HulyClient.testLayer({
        findOne: findOneImpl,
        updateDoc: updateDocImpl,
        uploadMarkup: uploadMarkupImpl
      })

      const result = yield* updateMilestone({
        project: projectIdentifier("TEST"),
        milestone: milestoneIdentifier("Sprint 1"),
        description: "Updated milestone notes"
      }).pipe(Effect.provide(testLayer))

      expect(result).toEqual({ id: "m-1", updated: true })
      expect(uploads).toEqual([{ attr: "description", value: "Updated milestone notes" }])
      expect(assertAt(updates, 0)).toHaveProperty("description")
    }))

  it.effect("skips markup upload when the description is blank", () =>
    Effect.gen(function*() {
      const project = makeProject()
      const milestone = makeMilestone({ _id: "m-1" as Ref<HulyMilestone>, label: "Sprint 1" })

      const uploads: Array<string> = []
      const updates: Array<Record<string, unknown>> = []

      const findOneImpl: HulyClientOperations["findOne"] = ((_class: unknown) => {
        if (_class === tracker.class.Project) return Effect.succeed(project)
        if (_class === tracker.class.Milestone) return Effect.succeed(milestone)
        return Effect.succeed(undefined)
      }) as HulyClientOperations["findOne"]

      // eslint-disable-next-line no-restricted-syntax -- stub returns Effect<string> which doesn't overlap the SDK's Effect<MarkupRef> return
      const uploadMarkupImpl: HulyClientOperations["uploadMarkup"] = ((
        _objectClass: unknown,
        _objectId: unknown,
        objectAttr: unknown
      ) => {
        uploads.push(String(objectAttr))
        return Effect.succeed("markup-ref")
      }) as unknown as HulyClientOperations["uploadMarkup"]

      const updateDocImpl: HulyClientOperations["updateDoc"] = ((
        _class: unknown,
        _space: unknown,
        _objectId: unknown,
        operations: Record<string, unknown>
      ) => {
        updates.push(operations)
        return Effect.succeed({})
      }) as HulyClientOperations["updateDoc"]

      const testLayer = HulyClient.testLayer({
        findOne: findOneImpl,
        updateDoc: updateDocImpl,
        uploadMarkup: uploadMarkupImpl
      })

      const result = yield* updateMilestone({
        project: projectIdentifier("TEST"),
        milestone: milestoneIdentifier("Sprint 1"),
        description: "   "
      }).pipe(Effect.provide(testLayer))

      expect(result).toEqual({ id: "m-1", updated: true })
      expect(uploads).toEqual([])
    }))

  it.effect("clears description and skips markup upload when the description is null", () =>
    Effect.gen(function*() {
      const project = makeProject()
      const milestone = makeMilestone({ _id: "m-1" as Ref<HulyMilestone>, label: "Sprint 1" })
      const uploads: Array<string> = []
      const updates: Array<Record<string, unknown>> = []

      const findOneImpl: HulyClientOperations["findOne"] = ((_class: unknown) => {
        if (_class === tracker.class.Project) return Effect.succeed(project)
        if (_class === tracker.class.Milestone) return Effect.succeed(milestone)
        return Effect.succeed(undefined)
      }) as HulyClientOperations["findOne"]
      // eslint-disable-next-line no-restricted-syntax -- stub returns Effect<string> which doesn't overlap the SDK's Effect<MarkupRef> return
      const uploadMarkupImpl: HulyClientOperations["uploadMarkup"] = ((
        _objectClass: unknown,
        _objectId: unknown,
        objectAttr: unknown
      ) => {
        uploads.push(String(objectAttr))
        return Effect.succeed("markup-ref")
      }) as unknown as HulyClientOperations["uploadMarkup"]
      const updateDocImpl: HulyClientOperations["updateDoc"] = ((
        _class: unknown,
        _space: unknown,
        _objectId: unknown,
        operations: Record<string, unknown>
      ) => {
        updates.push(operations)
        return Effect.succeed({})
      }) as HulyClientOperations["updateDoc"]

      const result = yield* updateMilestone({
        project: projectIdentifier("TEST"),
        milestone: milestoneIdentifier("Sprint 1"),
        description: null
      }).pipe(
        Effect.provide(
          HulyClient.testLayer({ findOne: findOneImpl, updateDoc: updateDocImpl, uploadMarkup: uploadMarkupImpl })
        )
      )

      expect(result).toEqual({ id: "m-1", updated: true })
      expect(uploads).toEqual([])
      expect(updates[0]?.description).toBe("")
    }))
})
