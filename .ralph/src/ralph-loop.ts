import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { Context, Effect, Layer, Ref, Schema } from "effect"

const NonEmptyString = Schema.String.pipe(Schema.nonEmptyString())

export const RalphLaneId = NonEmptyString.pipe(Schema.brand("RalphLaneId"))
export type RalphLaneId = Schema.Schema.Type<typeof RalphLaneId>

export const RalphBranchName = NonEmptyString.pipe(Schema.brand("RalphBranchName"))
export type RalphBranchName = Schema.Schema.Type<typeof RalphBranchName>

export const RalphPlanFile = NonEmptyString.pipe(Schema.brand("RalphPlanFile"))
export type RalphPlanFile = Schema.Schema.Type<typeof RalphPlanFile>

export const RalphPromptText = NonEmptyString.pipe(Schema.brand("RalphPromptText"))
export type RalphPromptText = Schema.Schema.Type<typeof RalphPromptText>

export const RalphTaskId = NonEmptyString.pipe(Schema.brand("RalphTaskId"))
export type RalphTaskId = Schema.Schema.Type<typeof RalphTaskId>

export const RalphTaskTitle = NonEmptyString.pipe(Schema.brand("RalphTaskTitle"))
export type RalphTaskTitle = Schema.Schema.Type<typeof RalphTaskTitle>

export const RalphTaskLoad = NonEmptyString.pipe(Schema.brand("RalphTaskLoad"))
export type RalphTaskLoad = Schema.Schema.Type<typeof RalphTaskLoad>

export const RalphAgentNotes = Schema.String.pipe(Schema.brand("RalphAgentNotes"))
export type RalphAgentNotes = Schema.Schema.Type<typeof RalphAgentNotes>

export const RalphCommitSha = NonEmptyString.pipe(Schema.brand("RalphCommitSha"))
export type RalphCommitSha = Schema.Schema.Type<typeof RalphCommitSha>

export const RalphTaskStatusSchema = Schema.Literal("todo", "in_progress", "done")
export type RalphTaskStatus = Schema.Schema.Type<typeof RalphTaskStatusSchema>

export interface RalphTask {
  readonly id: RalphTaskId
  readonly title: RalphTaskTitle
  readonly load: RalphTaskLoad
  readonly status: RalphTaskStatus
}

export interface RalphLanePlan {
  readonly laneId: RalphLaneId
  readonly branch: RalphBranchName
  readonly planFile: RalphPlanFile
  readonly tasks: ReadonlyArray<RalphTask>
}

export interface RalphLaneSpec {
  readonly laneId: RalphLaneId
  readonly branch: RalphBranchName
  readonly prompt: RalphPromptText
  readonly planFile: RalphPlanFile
}

export interface RalphImplementationResult {
  readonly summary: RalphAgentNotes
  readonly commits: ReadonlyArray<RalphCommitSha>
}

export type RalphReviewDecision =
  | {
    readonly status: "approved"
    readonly notes: RalphAgentNotes
  }
  | {
    readonly status: "changes_requested"
    readonly notes: RalphAgentNotes
  }

export interface RalphCleanupResult {
  readonly commits: ReadonlyArray<RalphCommitSha>
}

export interface RalphTaskResult {
  readonly taskId: RalphTaskId
  readonly attempts: number
  readonly implementation: RalphImplementationResult
  readonly review: RalphReviewDecision & { readonly status: "approved" }
  readonly cleanup: RalphCleanupResult
}

export interface RalphLaneResult {
  readonly laneId: RalphLaneId
  readonly completedTasks: ReadonlyArray<RalphTaskResult>
}

export type RalphStage =
  | "planning"
  | "planned"
  | "implementing"
  | "reviewing"
  | "cleanup"
  | "task_done"
  | "lane_done"
  | "failed"

export interface RalphLoopObserver {
  readonly laneStage?: (input: {
    readonly lane: RalphLaneSpec
    readonly stage: RalphStage
    readonly task?: RalphTask
    readonly attempt?: number
    readonly error?: Error
  }) => Effect.Effect<void, Error>
  readonly planWritten?: (plan: RalphLanePlan) => Effect.Effect<void, Error>
  readonly taskStatusChanged?: (input: {
    readonly lane: RalphLaneSpec
    readonly task: RalphTask
    readonly status: RalphTaskStatus
  }) => Effect.Effect<void, Error>
}

export interface RalphLoopOptions {
  readonly maxReviewAttempts: number
  readonly maxTasksPerLane?: number
  readonly observer?: RalphLoopObserver
}

export class RalphReviewFailedError extends Error {
  constructor(
    readonly taskId: RalphTaskId,
    readonly attempts: number,
    readonly lastNotes: RalphAgentNotes
  ) {
    super(`Task ${taskId} still had requested changes after ${attempts} review attempt(s): ${lastNotes}`)
  }
}

export class RalphPlanNotFoundError extends Error {
  constructor(readonly laneId: RalphLaneId) {
    super(`No Ralph plan found for lane ${laneId}`)
  }
}

export class RalphAgent extends Context.Tag("RalphAgent")<
  RalphAgent,
  {
    readonly planLane: (lane: RalphLaneSpec) => Effect.Effect<RalphLanePlan, Error>
    readonly implementTask: (input: {
      readonly lane: RalphLaneSpec
      readonly task: RalphTask
      readonly attempt: number
      readonly previousReviewNotes: ReadonlyArray<RalphAgentNotes>
    }) => Effect.Effect<RalphImplementationResult, Error>
    readonly reviewTask: (input: {
      readonly lane: RalphLaneSpec
      readonly task: RalphTask
      readonly attempt: number
      readonly implementation: RalphImplementationResult
    }) => Effect.Effect<RalphReviewDecision, Error>
    readonly cleanupTask: (input: {
      readonly lane: RalphLaneSpec
      readonly plan: RalphLanePlan
      readonly task: RalphTask
      readonly implementation: RalphImplementationResult
      readonly review: RalphReviewDecision & { readonly status: "approved" }
    }) => Effect.Effect<RalphCleanupResult, Error>
  }
>() {}

export class RalphPlanStore extends Context.Tag("RalphPlanStore")<
  RalphPlanStore,
  {
    readonly writePlan: (plan: RalphLanePlan) => Effect.Effect<void, Error>
    readonly readPlan: (laneId: RalphLaneId) => Effect.Effect<RalphLanePlan, Error>
    readonly updateTaskStatus: (input: {
      readonly laneId: RalphLaneId
      readonly taskId: RalphTaskId
      readonly status: RalphTaskStatus
    }) => Effect.Effect<void, Error>
  }
>() {}

export const makeRalphLaneId = Schema.decodeUnknownSync(RalphLaneId)
export const makeRalphBranchName = Schema.decodeUnknownSync(RalphBranchName)
export const makeRalphPlanFile = Schema.decodeUnknownSync(RalphPlanFile)
export const makeRalphPromptText = Schema.decodeUnknownSync(RalphPromptText)
export const makeRalphTaskId = Schema.decodeUnknownSync(RalphTaskId)
export const makeRalphTaskTitle = Schema.decodeUnknownSync(RalphTaskTitle)
export const makeRalphTaskLoad = Schema.decodeUnknownSync(RalphTaskLoad)
export const makeRalphAgentNotes = Schema.decodeUnknownSync(RalphAgentNotes)
export const makeRalphCommitSha = Schema.decodeUnknownSync(RalphCommitSha)

const replaceTaskStatus = (
  plan: RalphLanePlan,
  taskId: RalphTaskId,
  status: RalphTaskStatus
): RalphLanePlan => ({
  ...plan,
  tasks: plan.tasks.map((task) => task.id === taskId ? { ...task, status } : task)
})

const nextOpenTask = (plan: RalphLanePlan): RalphTask | undefined =>
  plan.tasks.find((task) => task.status !== "done")

const observeLaneStage = (
  options: RalphLoopOptions,
  input: Parameters<NonNullable<RalphLoopObserver["laneStage"]>>[0]
): Effect.Effect<void, Error> => options.observer?.laneStage?.(input) ?? Effect.void

const observePlanWritten = (
  options: RalphLoopOptions,
  plan: RalphLanePlan
): Effect.Effect<void, Error> => options.observer?.planWritten?.(plan) ?? Effect.void

const observeTaskStatusChanged = (
  options: RalphLoopOptions,
  input: Parameters<NonNullable<RalphLoopObserver["taskStatusChanged"]>>[0]
): Effect.Effect<void, Error> => options.observer?.taskStatusChanged?.(input) ?? Effect.void

export const renderRalphPlanMarkdown = (plan: RalphLanePlan): string => {
  const taskList = plan.tasks
    .map((task) => `- [${task.status === "done" ? "x" : " "}] \`${task.id}\` ${task.title}`)
    .join("\n")

  const taskDetails = plan.tasks
    .map((task) => [`## ${task.id}`, "", `Status: \`${task.status}\``, "", "### Load", "", task.load].join("\n"))
    .join("\n\n")

  return [`# Ralph Lane ${plan.laneId}`, "", `Branch: \`${plan.branch}\``, "", "## Tasks", "", taskList, "", taskDetails]
    .join("\n")
    .concat("\n")
}

export const makeMemoryRalphPlanStore = (
  initialPlans: ReadonlyArray<RalphLanePlan> = []
): Layer.Layer<RalphPlanStore> => {
  const plansRef = Ref.unsafeMake(new Map(initialPlans.map((plan) => [plan.laneId, plan])))

  return Layer.succeed(RalphPlanStore, {
    writePlan: (plan) =>
      Ref.update(plansRef, (plans) => new Map(plans).set(plan.laneId, plan)),
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
        yield* Ref.set(plansRef, new Map(plans).set(laneId, replaceTaskStatus(plan, taskId, status)))
      })
  })
}

export const makeFileBackedRalphPlanStore = (rootDir: string): Layer.Layer<RalphPlanStore> => {
  const memory = new Map<RalphLaneId, RalphLanePlan>()

  const persist = (plan: RalphLanePlan): Effect.Effect<void, Error> =>
    Effect.tryPromise({
      try: async () => {
        await mkdir(rootDir, { recursive: true })
        await writeFile(join(rootDir, plan.planFile), renderRalphPlanMarkdown(plan))
      },
      catch: (cause) => cause instanceof Error ? cause : new Error(String(cause))
    })

  return Layer.succeed(RalphPlanStore, {
    writePlan: (plan) =>
      Effect.sync(() => {
        memory.set(plan.laneId, plan)
      }).pipe(Effect.zipRight(persist(plan))),
    readPlan: (laneId) =>
      Effect.sync(() => memory.get(laneId)).pipe(
        Effect.flatMap((plan) =>
          Effect.fromNullable(plan).pipe(Effect.mapError(() => new RalphPlanNotFoundError(laneId)))
        )
      ),
    updateTaskStatus: ({ laneId, taskId, status }) =>
      Effect.gen(function*() {
        const plan = yield* Effect.fromNullable(memory.get(laneId)).pipe(
          Effect.mapError(() => new RalphPlanNotFoundError(laneId))
        )
        const updated = replaceTaskStatus(plan, taskId, status)
        memory.set(laneId, updated)
        yield* persist(updated)
      })
  })
}

export const runRalphTaskMicroloop = (
  lane: RalphLaneSpec,
  plan: RalphLanePlan,
  task: RalphTask,
  options: RalphLoopOptions
): Effect.Effect<RalphTaskResult, Error, RalphAgent> => {
  const attemptLoop = (
    attempt: number,
    previousReviewNotes: ReadonlyArray<RalphAgentNotes>
  ): Effect.Effect<RalphTaskResult, Error, RalphAgent> =>
    Effect.gen(function*() {
      if (attempt > options.maxReviewAttempts) {
        return yield* Effect.fail(
          new RalphReviewFailedError(
            task.id,
            options.maxReviewAttempts,
            previousReviewNotes.at(-1) ?? makeRalphAgentNotes("No review notes")
          )
        )
      }

      const agent = yield* RalphAgent
      yield* observeLaneStage(options, { lane, stage: "implementing", task, attempt })
      const implementation = yield* agent.implementTask({ lane, task, attempt, previousReviewNotes })
      yield* observeLaneStage(options, { lane, stage: "reviewing", task, attempt })
      const review = yield* agent.reviewTask({ lane, task, attempt, implementation })

      if (review.status === "approved") {
        yield* observeLaneStage(options, { lane, stage: "cleanup", task, attempt })
        const cleanup = yield* agent.cleanupTask({ lane, plan, task, implementation, review })
        return { taskId: task.id, attempts: attempt, implementation, review, cleanup }
      }

      return yield* attemptLoop(attempt + 1, [...previousReviewNotes, review.notes])
    })

  return attemptLoop(1, [])
}

export const runRalphLane = (
  lane: RalphLaneSpec,
  options: RalphLoopOptions
): Effect.Effect<RalphLaneResult, Error, RalphAgent | RalphPlanStore> => {
  const runLane = Effect.gen(function*() {
    const agent = yield* RalphAgent
    const store = yield* RalphPlanStore
    yield* observeLaneStage(options, { lane, stage: "planning" })
    const planned = yield* agent.planLane(lane)
    yield* store.writePlan(planned)
    yield* observePlanWritten(options, planned)
    yield* observeLaneStage(options, { lane, stage: "planned" })

    const runNext = (
      completedTasks: ReadonlyArray<RalphTaskResult>
    ): Effect.Effect<ReadonlyArray<RalphTaskResult>, Error, RalphAgent | RalphPlanStore> =>
      Effect.gen(function*() {
        if (options.maxTasksPerLane !== undefined && completedTasks.length >= options.maxTasksPerLane) {
          return completedTasks
        }

        const plan = yield* store.readPlan(lane.laneId)
        const task = nextOpenTask(plan)
        if (task === undefined) {
          return completedTasks
        }

        yield* store.updateTaskStatus({ laneId: lane.laneId, taskId: task.id, status: "in_progress" })
        yield* observeTaskStatusChanged(options, { lane, task, status: "in_progress" })
        const result = yield* runRalphTaskMicroloop(lane, plan, { ...task, status: "in_progress" }, options)
        yield* store.updateTaskStatus({ laneId: lane.laneId, taskId: task.id, status: "done" })
        yield* observeTaskStatusChanged(options, { lane, task, status: "done" })
        yield* observeLaneStage(options, { lane, stage: "task_done", task })
        return yield* runNext([...completedTasks, result])
      })

    const completedTasks = yield* runNext([])
    yield* observeLaneStage(options, { lane, stage: "lane_done" })
    return { laneId: lane.laneId, completedTasks }
  })

  return Effect.tapError(
    runLane,
    (error) => observeLaneStage(options, { lane, stage: "failed", error })
  )
}

export const runRalphLanes = (
  lanes: ReadonlyArray<RalphLaneSpec>,
  options: RalphLoopOptions
): Effect.Effect<ReadonlyArray<RalphLaneResult>, Error, RalphAgent | RalphPlanStore> =>
  Effect.forEach(lanes, (lane) => runRalphLane(lane, options), { concurrency: 3 })
