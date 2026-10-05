import { Cause, Effect, Exit, Schema, Tracer } from "effect"

const StageSchema = Schema.Literals([
  "moveIssue",
  "transferIssue",
  "transfer.inspectPlan",
  "transfer.reinspectTree",
  "transfer.inspectAdmission",
  "transfer.inspectContext",
  "movement.inspectProject",
  "transfer.inspectTree",
  "movement.inspectClosureState",
  "transfer.inspectAttributes",
  "transfer.inspectForest",
  "transfer.seedForestStates",
  "transfer.prepareForestFrontier",
  "transfer.inspectForestFrontier",
  "transfer.readForestOwners",
  "transfer.auditForestClassResult",
  "transfer.inspectTasks",
  "transfer.inspectTaskWorkflow",
  "transfer.executeTree",
  "transfer.executeWithinBudget",
  "transfer.executePlannedWrite",
  "transfer.finishVerification",
  "transfer.interruptedExecution",
  "transfer.commitAndVerify",
  "transfer.verifyTree",
  "transfer.observeClosure"
])
const ElapsedMilliseconds = Schema.Number.check(Schema.isFinite(), Schema.isGreaterThanOrEqualTo(0)).pipe(
  Schema.brand("MovementStageElapsedMilliseconds")
)
const StageObservationSchema = Schema.Struct({
  stage: StageSchema,
  outcome: Schema.Literals(["success", "failure", "interrupted", "unfinished"]),
  timing: Schema.Union([
    Schema.Struct({ status: Schema.Literal("observed"), elapsedMilliseconds: ElapsedMilliseconds }),
    Schema.Struct({ status: Schema.Literal("unavailable") })
  ])
})
export const MovementStageReportSchema = Schema.Struct({ stages: Schema.Array(StageObservationSchema) })
export type MovementStageReport = Schema.Schema.Type<typeof MovementStageReportSchema>
export const MovementObserverStatusSchema = Schema.Struct({
  observerStatus: Schema.Literals(["recorded", "unavailable"])
})
export type MovementObserverStatus = Schema.Schema.Type<typeof MovementObserverStatusSchema>
export class MovementObserverError extends Schema.TaggedError<MovementObserverError>()("MovementObserverError", {
  phase: Schema.Literals(["configuration", "report"])
}) {}
// Internal Effect wrapper and reporting ports; serialized observations are schema-owned above.
export type MovementStageObserver = <A, E, R>(operation: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>
interface ReportPorts {
  readonly write: (report: MovementStageReport) => Effect.Effect<void, MovementObserverError>
  readonly publishStatus: (status: MovementObserverStatus) => Effect.Effect<void>
}
export const MOVEMENT_OBSERVER_REPORT_BUDGET = "1 second"
const NANOSECONDS_PER_MILLISECOND = 1_000_000
const projectSpan = (span: Tracer.NativeSpan): Schema.Schema.Type<typeof StageObservationSchema> | undefined => {
  const stage = Schema.decodeUnknownOption(StageSchema)(span.name)
  if (stage._tag === "None") return undefined
  const status = span.status
  if (status._tag === "Started") return { stage: stage.value, outcome: "unfinished", timing: { status: "unavailable" } }
  const elapsed = Schema.decodeUnknownOption(ElapsedMilliseconds)(
    Number(status.endTime - status.startTime) / NANOSECONDS_PER_MILLISECOND
  )
  return {
    stage: stage.value,
    outcome: Exit.isSuccess(status.exit)
      ? "success"
      : Cause.hasInterrupts(status.exit.cause)
        ? "interrupted"
        : "failure",
    timing:
      elapsed._tag === "Some" ? { status: "observed", elapsedMilliseconds: elapsed.value } : { status: "unavailable" }
  }
}
export const makeMovementStageObserver =
  (ports: ReportPorts): MovementStageObserver =>
  (operation) =>
    Effect.suspend(() => {
      const spans: Array<Tracer.NativeSpan> = []
      const tracer = Tracer.make({
        span(options) {
          const span = new Tracer.NativeSpan(options)
          if (Schema.decodeUnknownOption(StageSchema)(span.name)._tag === "Some") spans.push(span)
          return span
        }
      })
      const report = Effect.suspend(() => {
        const stages = spans.flatMap((span) => {
          const projected = projectSpan(span)
          return projected === undefined ? [] : [projected]
        })
        return ports.write({ stages })
      }).pipe(
        Effect.timeout(MOVEMENT_OBSERVER_REPORT_BUDGET),
        Effect.matchCauseEffect({
          onFailure: () => ports.publishStatus({ observerStatus: "unavailable" }),
          onSuccess: () => ports.publishStatus({ observerStatus: "recorded" })
        }),
        Effect.catchCause(() => Effect.void)
      )
      return operation.pipe(Effect.withTracer(tracer), Effect.ensuring(report))
    })
