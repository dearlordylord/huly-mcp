import { Deferred, Effect, Ref } from "effect"

export const STDIO_DRAIN_ALLOWANCE = "5 seconds"
export const STDIO_SHUTDOWN_DEADLINE = "10 seconds"
export const FORCED_STDIO_EXIT_CODE = 1
export const FORCED_STDIO_EXIT_DIAGNOSTIC = "Huly MCP stdio shutdown exceeded 10 seconds; forcing process exit"

export type StdioShutdownReason = "stdin-eof" | "stdin-close" | "sigint" | "sigterm" | "stop" | "runtime-interruption"

export type StdioShutdownOutcome = "graceful" | "forced"

export type StdioShutdownState =
  | { readonly _tag: "Running" }
  | { readonly _tag: "Quiescing"; readonly reason: StdioShutdownReason }
  | { readonly _tag: "Closing"; readonly reason: StdioShutdownReason }
  | { readonly _tag: "Complete"; readonly reason: StdioShutdownReason; readonly outcome: StdioShutdownOutcome }

export interface StdioShutdownCoordinator {
  readonly request: (reason: StdioShutdownReason) => Effect.Effect<boolean>
  readonly awaitRequest: Effect.Effect<StdioShutdownReason>
  readonly claimExecution: Effect.Effect<boolean>
  readonly beginClosing: Effect.Effect<void>
  readonly complete: (outcome: StdioShutdownOutcome) => Effect.Effect<void>
  readonly awaitComplete: Effect.Effect<void>
  readonly state: Effect.Effect<StdioShutdownState>
}

export interface StdioShutdownResources {
  readonly drain: Effect.Effect<void, unknown>
  readonly closeWire: Effect.Effect<void, unknown>
  readonly closeTelemetry: Effect.Effect<void, unknown>
  readonly closeClients: Effect.Effect<void, unknown>
  readonly forceExit: (code: typeof FORCED_STDIO_EXIT_CODE) => Effect.Effect<void>
  readonly writeDiagnostic: (message: typeof FORCED_STDIO_EXIT_DIAGNOSTIC) => Effect.Effect<void>
}

export interface StdioShutdownHandlers {
  readonly stdinEof: () => void
  readonly stdinClose: () => void
  readonly sigint: () => void
  readonly sigterm: () => void
}

export interface StdioProcessPort {
  readonly listen: (handlers: StdioShutdownHandlers) => () => void
  readonly forceExit: (code: typeof FORCED_STDIO_EXIT_CODE) => void
}

export const liveStdioProcessPort: StdioProcessPort = {
  listen: (handlers) => {
    process.stdin.on("end", handlers.stdinEof)
    process.stdin.on("close", handlers.stdinClose)
    process.on("SIGINT", handlers.sigint)
    process.on("SIGTERM", handlers.sigterm)
    return () => {
      process.stdin.off("end", handlers.stdinEof)
      process.stdin.off("close", handlers.stdinClose)
      process.off("SIGINT", handlers.sigint)
      process.off("SIGTERM", handlers.sigterm)
    }
  },
  forceExit: (code) => process.exit(code)
}

const beginClosing = (state: StdioShutdownState): StdioShutdownState =>
  state._tag === "Quiescing" ? { _tag: "Closing", reason: state.reason } : state

const complete = (state: StdioShutdownState, outcome: StdioShutdownOutcome): StdioShutdownState => {
  if (state._tag === "Complete" || state._tag === "Running") return state
  return { _tag: "Complete", reason: state.reason, outcome }
}

const completeTransition = (
  state: StdioShutdownState,
  outcome: StdioShutdownOutcome
): readonly [boolean, StdioShutdownState] => {
  const next = complete(state, outcome)
  return [next !== state, next]
}

export const makeStdioShutdownCoordinator = (
  onQuiesce: () => void = () => {}
): Effect.Effect<StdioShutdownCoordinator> =>
  Effect.gen(function* () {
    const state = yield* Ref.make<StdioShutdownState>({ _tag: "Running" })
    const requested = yield* Deferred.make<StdioShutdownReason>()
    const completed = yield* Deferred.make<void>()
    const executionClaimed = yield* Ref.make(false)

    const request = (reason: StdioShutdownReason): Effect.Effect<boolean> =>
      Ref.modify(state, (current): readonly [boolean, StdioShutdownState] =>
        current._tag === "Running" ? [true, { _tag: "Quiescing", reason }] : [false, current]
      ).pipe(
        Effect.tap((accepted) =>
          accepted ? Effect.sync(onQuiesce).pipe(Effect.zipRight(Deferred.succeed(requested, reason))) : Effect.void
        )
      )

    return {
      request,
      awaitRequest: Deferred.await(requested),
      claimExecution: Ref.getAndSet(executionClaimed, true).pipe(Effect.map((claimed) => !claimed)),
      beginClosing: Ref.update(state, beginClosing),
      complete: (outcome) =>
        Ref.modify(state, (current) => completeTransition(current, outcome)).pipe(
          Effect.flatMap((transitioned) =>
            transitioned ? Deferred.succeed(completed, undefined).pipe(Effect.asVoid) : Effect.void
          )
        ),
      awaitComplete: Deferred.await(completed),
      state: Ref.get(state)
    }
  })

const ignoreCloseFailure = (effect: Effect.Effect<void, unknown>): Effect.Effect<void> => Effect.ignore(effect)

const runGracefulShutdown = (
  coordinator: StdioShutdownCoordinator,
  resources: StdioShutdownResources
): Effect.Effect<void> =>
  Effect.gen(function* () {
    yield* resources.drain.pipe(Effect.disconnect, Effect.timeoutOption(STDIO_DRAIN_ALLOWANCE), Effect.ignore)
    yield* coordinator.beginClosing
    yield* Effect.all([resources.closeWire, resources.closeTelemetry, resources.closeClients].map(ignoreCloseFailure), {
      concurrency: "unbounded",
      discard: true
    })
    yield* coordinator.complete("graceful")
  })

const forceShutdown = (coordinator: StdioShutdownCoordinator, resources: StdioShutdownResources): Effect.Effect<void> =>
  Effect.sleep(STDIO_SHUTDOWN_DEADLINE).pipe(
    Effect.zipRight(resources.writeDiagnostic(FORCED_STDIO_EXIT_DIAGNOSTIC)),
    Effect.zipRight(resources.forceExit(FORCED_STDIO_EXIT_CODE)),
    Effect.zipRight(coordinator.complete("forced"))
  )

export const executeBoundedStdioShutdown = (
  coordinator: StdioShutdownCoordinator,
  resources: StdioShutdownResources
): Effect.Effect<void> =>
  Effect.gen(function* () {
    yield* coordinator.awaitRequest
    if (!(yield* coordinator.claimExecution)) return yield* coordinator.awaitComplete
    yield* Effect.raceFirst(
      runGracefulShutdown(coordinator, resources).pipe(Effect.disconnect, Effect.interruptible),
      forceShutdown(coordinator, resources).pipe(Effect.disconnect, Effect.interruptible)
    )
  }).pipe(Effect.asVoid)
