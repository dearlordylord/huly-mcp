import { describe, expect, it } from "@effect/vitest"
import { Deferred, Effect, Fiber, Layer, Ref } from "effect"

import {
  makeRalphAgentNotes,
  makeRalphBranchName,
  makeRalphCommitSha,
  makeRalphLaneId,
  makeRalphPlanFile,
  makeRalphPromptText,
  makeRalphTaskId,
  makeRalphTaskLoad,
  makeRalphTaskTitle,
  RalphAgent,
  RalphLanesFailedError,
  RalphPlanNotFoundError,
  RalphPlanStore,
  RalphReviewFailedError,
  renderRalphPlanMarkdown,
  runRalphLane,
  runRalphLanes,
  type RalphLanePlan,
  type RalphLaneSpec,
  type RalphReviewDecision,
  type RalphTaskStatus
} from "../src/ralph-loop.js"

const lane = (id = "lane-a"): RalphLaneSpec => ({
  laneId: makeRalphLaneId(id),
  branch: makeRalphBranchName(`ralph/${id}`),
  prompt: makeRalphPromptText(`Work for ${id}`),
  planFile: makeRalphPlanFile(`${id}.md`)
})

const planFor = (
  spec: RalphLaneSpec,
  tasks: ReadonlyArray<{ readonly id: string; readonly title: string; readonly load?: string }>
): RalphLanePlan => ({
  laneId: spec.laneId,
  branch: spec.branch,
  planFile: spec.planFile,
  tasks: tasks.map((task) => ({
    id: makeRalphTaskId(task.id),
    title: makeRalphTaskTitle(task.title),
    load: makeRalphTaskLoad(task.load ?? `Atomic load for ${task.id}`),
    status: "todo"
  }))
})

const makeInspectableStore = () =>
  Effect.gen(function*() {
    const plansRef = yield* Ref.make(new Map<RalphLaneSpec["laneId"], RalphLanePlan>())

    const layer = Layer.succeed(RalphPlanStore, {
      writePlan: (plan) => Ref.update(plansRef, (plans) => new Map(plans).set(plan.laneId, plan)),
      readPlan: (laneId) =>
        Ref.get(plansRef).pipe(
          Effect.flatMap((plans) =>
            Effect.fromNullable(plans.get(laneId)).pipe(
              Effect.mapError(() => new RalphPlanNotFoundError(laneId))
            )
          )
        ),
      updateTaskStatus: ({ laneId, taskId, status }) =>
        Effect.gen(function*() {
          const plans = yield* Ref.get(plansRef)
          const plan = yield* Effect.fromNullable(plans.get(laneId)).pipe(
            Effect.mapError(() => new RalphPlanNotFoundError(laneId))
          )
          yield* Ref.set(
            plansRef,
            new Map(plans).set(laneId, {
              ...plan,
              tasks: plan.tasks.map((task) => task.id === taskId ? { ...task, status } : task)
            })
          )
        })
    })

    return { layer, plansRef }
  })

const taskStatus = (
  plan: RalphLanePlan | undefined,
  taskId: string
): RalphTaskStatus | undefined =>
  plan?.tasks.find((task) => task.id === makeRalphTaskId(taskId))?.status

describe("Ralph Sandcastle loop", () => {
  it.effect("feeds review notes back to the same task before cleanup marks done", () =>
    Effect.gen(function*() {
      const spec = lane()
      const store = yield* makeInspectableStore()
      const implementationInputs = yield* Ref.make<ReadonlyArray<ReadonlyArray<string>>>([])
      const cleanupCalls = yield* Ref.make<ReadonlyArray<string>>([])

      const agentLayer = Layer.succeed(RalphAgent, {
        planLane: () => Effect.succeed(planFor(spec, [{ id: "task-1", title: "First task" }])),
        implementTask: ({ attempt, previousReviewNotes }) =>
          Ref.update(implementationInputs, (inputs) => [
            ...inputs,
            previousReviewNotes.map((note) => String(note))
          ]).pipe(
            Effect.as({
              summary: makeRalphAgentNotes(`implemented on attempt ${attempt}`),
              commits: [makeRalphCommitSha(`impl-${attempt}`)]
            })
          ),
        reviewTask: ({ attempt }) =>
          Effect.succeed(
            attempt === 1
              ? {
                status: "changes_requested",
                notes: makeRalphAgentNotes("Use stronger branded values")
              }
              : {
                status: "approved",
                notes: makeRalphAgentNotes("Looks good")
              }
          ),
        cleanupTask: ({ task }) =>
          Ref.update(cleanupCalls, (calls) => [...calls, String(task.id)]).pipe(
            Effect.as({ commits: [makeRalphCommitSha("cleanup-1")] })
          )
      })

      const result = yield* runRalphLane(spec, { maxReviewAttempts: 3 }).pipe(
        Effect.provide(Layer.merge(agentLayer, store.layer))
      )
      const inputs = yield* Ref.get(implementationInputs)
      const calls = yield* Ref.get(cleanupCalls)
      const plans = yield* Ref.get(store.plansRef)

      expect(result.completedTasks).toHaveLength(1)
      expect(result.completedTasks[0]?.attempts).toBe(2)
      expect(inputs).toEqual([[], ["Use stronger branded values"]])
      expect(calls).toEqual(["task-1"])
      expect(taskStatus(plans.get(spec.laneId), "task-1")).toBe("done")
    })
  )

  it.effect("stops after the configured number of atomic tasks", () =>
    Effect.gen(function*() {
      const spec = lane()
      const store = yield* makeInspectableStore()
      const agentLayer = Layer.succeed(RalphAgent, {
        planLane: () =>
          Effect.succeed(planFor(spec, [
            { id: "task-1", title: "First task" },
            { id: "task-2", title: "Second task" }
          ])),
        implementTask: ({ task }) =>
          Effect.succeed({ summary: makeRalphAgentNotes(String(task.title)), commits: [makeRalphCommitSha(task.id)] }),
        reviewTask: () => Effect.succeed({ status: "approved", notes: makeRalphAgentNotes("Approved") }),
        cleanupTask: () => Effect.succeed({ commits: [] })
      })

      const result = yield* runRalphLane(spec, {
        maxReviewAttempts: 1,
        maxTasksPerLane: 1
      }).pipe(Effect.provide(Layer.merge(agentLayer, store.layer)))
      const plans = yield* Ref.get(store.plansRef)

      expect(result.completedTasks.map((task) => String(task.taskId))).toEqual(["task-1"])
      expect(taskStatus(plans.get(spec.laneId), "task-1")).toBe("done")
      expect(taskStatus(plans.get(spec.laneId), "task-2")).toBe("todo")
    })
  )

  it.effect("runs three lanes concurrently", () =>
    Effect.gen(function*() {
      const specs = [lane("a"), lane("b"), lane("c")]
      const store = yield* makeInspectableStore()
      const active = yield* Ref.make(0)
      const allActive = yield* Deferred.make<void>()
      const release = yield* Deferred.make<void>()

      const agentLayer = Layer.succeed(RalphAgent, {
        planLane: (spec) =>
          Effect.succeed(planFor(spec, [{ id: `${spec.laneId}-task`, title: "Task" }])),
        implementTask: ({ task }) =>
          Effect.gen(function*() {
            const activeCount = yield* Ref.updateAndGet(active, (value) => value + 1)
            if (activeCount === 3) {
              yield* Deferred.succeed(allActive, undefined)
            }
            yield* Deferred.await(release)
            yield* Ref.update(active, (value) => value - 1)
            return { summary: makeRalphAgentNotes(String(task.id)), commits: [makeRalphCommitSha(task.id)] }
          }),
        reviewTask: () => Effect.succeed({ status: "approved", notes: makeRalphAgentNotes("Approved") }),
        cleanupTask: () => Effect.succeed({ commits: [] })
      })

      const fiber = yield* runRalphLanes(specs, { maxReviewAttempts: 1 }).pipe(
        Effect.provide(Layer.merge(agentLayer, store.layer)),
        Effect.fork
      )
      yield* Deferred.await(allActive)
      yield* Deferred.succeed(release, undefined)
      const result = yield* Fiber.join(fiber)

      expect(result.map((laneResult) => String(laneResult.laneId)).sort()).toEqual(["a", "b", "c"])
    })
  )

  it.effect("lets sibling lanes complete before reporting a lane failure", () =>
    Effect.gen(function*() {
      const specs = [lane("a"), lane("b"), lane("c")]
      const store = yield* makeInspectableStore()
      const agentLayer = Layer.succeed(RalphAgent, {
        planLane: (spec) =>
          Effect.succeed(planFor(spec, [{ id: "task-1", title: `Task ${spec.laneId}` }])),
        implementTask: ({ lane }) =>
          Effect.succeed({
            summary: makeRalphAgentNotes(`implemented ${lane.laneId}`),
            commits: [makeRalphCommitSha(`impl-${lane.laneId}`)]
          }),
        reviewTask: ({ lane }): Effect.Effect<RalphReviewDecision, Error> =>
          Effect.succeed(
            lane.laneId === makeRalphLaneId("a")
              ? {
                status: "changes_requested",
                notes: makeRalphAgentNotes("Lane a still needs work")
              }
              : {
                status: "approved",
                notes: makeRalphAgentNotes("Approved")
              }
          ),
        cleanupTask: ({ lane }) =>
          Effect.succeed({ commits: [makeRalphCommitSha(`cleanup-${lane.laneId}`)] })
      })

      const result = yield* Effect.either(
        runRalphLanes(specs, { maxReviewAttempts: 1 }).pipe(
          Effect.provide(Layer.merge(agentLayer, store.layer))
        )
      )
      const plans = yield* Ref.get(store.plansRef)

      expect(result._tag).toBe("Left")
      if (result._tag === "Left") {
        expect(result.left).toBeInstanceOf(RalphLanesFailedError)
      }
      expect(taskStatus(plans.get(makeRalphLaneId("a")), "task-1")).toBe("in_progress")
      expect(taskStatus(plans.get(makeRalphLaneId("b")), "task-1")).toBe("done")
      expect(taskStatus(plans.get(makeRalphLaneId("c")), "task-1")).toBe("done")
    })
  )

  it.effect("fails after repeated requested changes and skips cleanup", () =>
    Effect.gen(function*() {
      const spec = lane()
      const store = yield* makeInspectableStore()
      const cleanupCalls = yield* Ref.make(0)
      const agentLayer = Layer.succeed(RalphAgent, {
        planLane: () => Effect.succeed(planFor(spec, [{ id: "task-1", title: "Task" }])),
        implementTask: () =>
          Effect.succeed({ summary: makeRalphAgentNotes("implemented"), commits: [makeRalphCommitSha("impl")] }),
        reviewTask: (): Effect.Effect<RalphReviewDecision, Error> =>
          Effect.succeed({
            status: "changes_requested",
            notes: makeRalphAgentNotes("Still not acceptable")
          }),
        cleanupTask: () => Ref.updateAndGet(cleanupCalls, (count) => count + 1).pipe(Effect.as({ commits: [] }))
      })

      const result = yield* Effect.either(
        runRalphLane(spec, { maxReviewAttempts: 2 }).pipe(
          Effect.provide(Layer.merge(agentLayer, store.layer))
        )
      )
      const plans = yield* Ref.get(store.plansRef)
      const cleanupCount = yield* Ref.get(cleanupCalls)

      expect(result._tag).toBe("Left")
      if (result._tag === "Left") {
        expect(result.left).toBeInstanceOf(RalphReviewFailedError)
      }
      expect(cleanupCount).toBe(0)
      expect(taskStatus(plans.get(spec.laneId), "task-1")).toBe("in_progress")
    })
  )

  it("renders a checkable Markdown plan file", () => {
    const spec = lane()
    const markdown = renderRalphPlanMarkdown(
      planFor(spec, [{ id: "task-1", title: "First task", load: "Do one thing." }])
    )

    expect(markdown).toContain("# Ralph Lane lane-a")
    expect(markdown).toContain("- [ ] `task-1` First task")
    expect(markdown).toContain("### Load\n\nDo one thing.")
  })
})
