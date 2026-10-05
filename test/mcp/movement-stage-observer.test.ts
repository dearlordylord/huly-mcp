import { it } from "@effect/vitest"
import { Cause, Deferred, Effect, Exit, Fiber, Schema } from "effect"
import { TestClock } from "effect/testing"
import { expect } from "vitest"
import {
  MOVEMENT_OBSERVER_REPORT_BUDGET,
  makeMovementStageObserver,
  MovementObserverError,
  MovementStageReportSchema,
  type MovementStageReport,
  type MovementObserverStatus
} from "../../src/mcp/movement-stage-observer.js"

it.effect("projects concurrent real spans with deterministic timings and omits attributes and arbitrary names", () =>
  Effect.gen(function* () {
    const reports: Array<MovementStageReport> = []
    const statuses: Array<MovementObserverStatus> = []
    const observe = makeMovementStageObserver({
      write: (report) =>
        Effect.sync(() => {
          reports.push(report)
        }),
      publishStatus: (status) =>
        Effect.sync(() => {
          statuses.push(status)
        })
    })
    const operation = Effect.all(
      [
        Effect.sleep("1 second").pipe(
          Effect.as("first"),
          Effect.withSpan("transfer.inspectForest", { attributes: { token: "PRIVATE_SECRET" } })
        ),
        Effect.sleep("2 seconds").pipe(Effect.as("second"), Effect.withSpan("transfer.inspectTasks")),
        Effect.void.pipe(Effect.withSpan("PRIVATE_SECRET"))
      ],
      { concurrency: "unbounded" }
    )
    const fiber = yield* observe(operation).pipe(Effect.forkChild)
    yield* TestClock.adjust("2 seconds")
    expect(yield* Fiber.join(fiber)).toEqual(["first", "second", undefined])
    expect(reports).toHaveLength(1)
    const report = yield* Schema.decodeUnknownEffect(MovementStageReportSchema)(reports[0])
    expect(report.stages.map((stage) => stage.stage)).toEqual(["transfer.inspectForest", "transfer.inspectTasks"])
    expect(report.stages.map((stage) => stage.timing)).toEqual([
      { status: "observed", elapsedMilliseconds: 1000 },
      { status: "observed", elapsedMilliseconds: 2000 }
    ])
    expect(JSON.stringify(report)).not.toContain("PRIVATE_SECRET")
    expect(statuses).toEqual([{ observerStatus: "recorded" }])
  })
)

it.effect("reporting failure preserves an exact typed operation failure and emits unavailable observer status", () =>
  Effect.gen(function* () {
    const failure = new MovementObserverError({ phase: "configuration" })
    const statuses: Array<MovementObserverStatus> = []
    const observe = makeMovementStageObserver({
      write: () => Effect.fail(new MovementObserverError({ phase: "report" })),
      publishStatus: (status) =>
        Effect.sync(() => {
          statuses.push(status)
        })
    })
    const result = yield* Effect.result(observe(Effect.fail(failure).pipe(Effect.withSpan("moveIssue"))))
    expect(result._tag).toBe("Failure")
    if (result._tag === "Failure") expect(result.failure).toBe(failure)
    expect(statuses).toEqual([{ observerStatus: "unavailable" }])
  })
)

it.effect("interrupted spans are reported while interruption remains interruption", () =>
  Effect.gen(function* () {
    const ready = yield* Deferred.make<void>()
    const reports: Array<MovementStageReport> = []
    const observe = makeMovementStageObserver({
      write: (report) =>
        Effect.sync(() => {
          reports.push(report)
        }),
      publishStatus: () => Effect.void
    })
    const fiber = yield* observe(
      Deferred.succeed(ready, undefined).pipe(
        Effect.andThen(Effect.never),
        Effect.withSpan("transfer.inspectAdmission")
      )
    ).pipe(Effect.forkChild)
    yield* Deferred.await(ready)
    yield* Fiber.interrupt(fiber)
    expect(reports[0]?.stages[0]?.outcome).toBe("interrupted")
  })
)

it.effect("observer defects and status publication defects do not replace a successful operation", () =>
  Effect.gen(function* () {
    const observe = makeMovementStageObserver({
      write: () => Effect.die("PRIVATE_SECRET"),
      publishStatus: () => Effect.die("PRIVATE_SECRET")
    })
    expect(yield* observe(Effect.succeed("unchanged"))).toBe("unchanged")
  })
)

it.effect("an unavailable reporter cannot indefinitely delay the completed operation", () =>
  Effect.gen(function* () {
    const statuses: Array<MovementObserverStatus> = []
    const observe = makeMovementStageObserver({
      write: () => Effect.never,
      publishStatus: (status) =>
        Effect.sync(() => {
          statuses.push(status)
        })
    })
    const fiber = yield* observe(Effect.succeed("completed")).pipe(Effect.forkChild)
    yield* TestClock.adjust(MOVEMENT_OBSERVER_REPORT_BUDGET)
    expect(yield* Fiber.join(fiber)).toBe("completed")
    expect(statuses).toEqual([{ observerStatus: "unavailable" }])
  })
)

it.effect("a synchronous reporting constructor defect preserves success, typed failure and interruption", () =>
  Effect.gen(function* () {
    const statuses: Array<MovementObserverStatus> = []
    const observe = makeMovementStageObserver({
      write: () => {
        throw new Error("PRIVATE_SECRET")
      },
      publishStatus: (status) =>
        Effect.sync(() => {
          statuses.push(status)
        })
    })
    expect(yield* observe(Effect.succeed("same"))).toBe("same")
    const failure = new MovementObserverError({ phase: "configuration" })
    const result = yield* Effect.result(observe(Effect.fail(failure)))
    if (result._tag !== "Failure") throw new Error("Expected unchanged failure")
    expect(result.failure).toBe(failure)
    const ready = yield* Deferred.make<void>()
    const fiber = yield* observe(Deferred.succeed(ready, undefined).pipe(Effect.andThen(Effect.never))).pipe(
      Effect.forkChild
    )
    yield* Deferred.await(ready)
    yield* Fiber.interrupt(fiber)
    const interrupted = yield* Fiber.await(fiber)
    expect(Exit.isFailure(interrupted) && Cause.hasInterrupts(interrupted.cause)).toBe(true)
    expect(statuses).toEqual(Array.from({ length: 3 }, () => ({ observerStatus: "unavailable" })))
  })
)

// Internal read ports exercise actual Effect span completion and interruption without SDK I/O.
it.effect("distinguishes completed frontier reads from the one interrupted read", () =>
  Effect.gen(function* () {
    const readCount = 8
    const reports: Array<MovementStageReport> = []
    const pendingStarted = yield* Deferred.make<void>()
    const observe = makeMovementStageObserver({
      write: (report) =>
        Effect.sync(() => {
          reports.push(report)
        }),
      publishStatus: () => Effect.void
    })
    const read = (ordinal: number) =>
      ordinal === readCount - 1
        ? Deferred.succeed(pendingStarted, undefined).pipe(Effect.andThen(Effect.never))
        : Effect.void
    const operation = Effect.forEach(
      Array.from({ length: readCount }, (_, ordinal) => ordinal),
      (ordinal) => read(ordinal).pipe(Effect.withSpan("transfer.readForestOwners")),
      { concurrency: readCount }
    ).pipe(Effect.withSpan("transfer.inspectForestFrontier"))
    const fiber = yield* observe(operation).pipe(Effect.forkChild)
    yield* Deferred.await(pendingStarted)
    yield* TestClock.adjust("1 second")
    yield* Fiber.interrupt(fiber)
    const report = yield* Schema.decodeUnknownEffect(MovementStageReportSchema)(reports[0])
    const reads = report.stages.filter((stage) => stage.stage === "transfer.readForestOwners")
    expect(reads).toHaveLength(readCount)
    expect(reads.filter((stage) => stage.outcome === "success")).toHaveLength(readCount - 1)
    expect(reads.filter((stage) => stage.outcome === "interrupted")).toHaveLength(1)
    expect(report.stages.find((stage) => stage.stage === "transfer.inspectForestFrontier")?.outcome).toBe("interrupted")
  })
)

it.effect("an unfinished producer span is reported without inventing elapsed time or changing success", () =>
  Effect.gen(function* () {
    const reports: Array<MovementStageReport> = []
    const observe = makeMovementStageObserver({
      write: (report) =>
        Effect.sync(() => {
          reports.push(report)
        }),
      publishStatus: () => Effect.void
    })
    const result = yield* observe(Effect.makeSpan("transfer.inspectForest").pipe(Effect.as("unchanged")))
    expect(result).toBe("unchanged")
    expect(reports[0]?.stages).toEqual([
      { stage: "transfer.inspectForest", outcome: "unfinished", timing: { status: "unavailable" } }
    ])
  })
)

it.effect("invalid producer span timing is unavailable while its successful result remains unchanged", () =>
  Effect.gen(function* () {
    const reports: Array<MovementStageReport> = []
    const observe = makeMovementStageObserver({
      write: (report) =>
        Effect.sync(() => {
          reports.push(report)
        }),
      publishStatus: () => Effect.void
    })
    const result = yield* observe(
      Effect.gen(function* () {
        const span = yield* Effect.makeSpan("transfer.inspectForest")
        span.end(-1n, Exit.succeed(undefined))
        return "unchanged"
      })
    )
    expect(result).toBe("unchanged")
    expect(reports[0]?.stages).toEqual([
      { stage: "transfer.inspectForest", outcome: "success", timing: { status: "unavailable" } }
    ])
  })
)

it.effect("a recorded typed operation failure remains the original failure and has a failure outcome", () =>
  Effect.gen(function* () {
    const failure = new MovementObserverError({ phase: "configuration" })
    const reports: Array<MovementStageReport> = []
    const observe = makeMovementStageObserver({
      write: (report) =>
        Effect.sync(() => {
          reports.push(report)
        }),
      publishStatus: () => Effect.void
    })
    const result = yield* Effect.result(observe(Effect.fail(failure).pipe(Effect.withSpan("moveIssue"))))
    expect(result._tag).toBe("Failure")
    if (result._tag === "Failure") expect(result.failure).toBe(failure)
    expect(reports[0]?.stages[0]?.outcome).toBe("failure")
  })
)
