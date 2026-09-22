import { Deferred, Effect, Fiber, Ref } from "effect"

export const STDIO_DRAIN_ALLOWANCE = "2 seconds"
export const STDIO_EOF_DRAIN_ALLOWANCE = "30 seconds"
export const STDIO_CLOSE_ALLOWANCE = "3 seconds"
export const STDIO_SHUTDOWN_DEADLINE = "10 seconds"
export const STDIO_EOF_SHUTDOWN_DEADLINE = "35 seconds"
export const FORCED_STDIO_EXIT_CODE = 1
export const FORCED_STDIO_EXIT_DIAGNOSTIC = "Huly MCP stdio shutdown exceeded 10 seconds; forcing process exit"
export const FORCED_STDIO_EOF_EXIT_DIAGNOSTIC = "Huly MCP stdio EOF shutdown exceeded 35 seconds; forcing process exit"

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
  readonly awaitComplete: Effect.Effect<void>
  readonly state: Effect.Effect<StdioShutdownState>
  readonly execute: (resources: StdioShutdownResources) => Effect.Effect<void>
}

interface StdioShutdownInternals {
  readonly claimExecution: Effect.Effect<boolean>
  readonly beginClosing: (reason: StdioShutdownReason) => Effect.Effect<void>
  readonly complete: (reason: StdioShutdownReason, outcome: StdioShutdownOutcome) => Effect.Effect<void>
}

export interface StdioShutdownResources {
  readonly drain: Effect.Effect<void, unknown>
  readonly closeWire: Effect.Effect<void, unknown>
  readonly closeTelemetry: Effect.Effect<void, unknown>
  readonly closeClients: Effect.Effect<void, unknown>
  readonly forceExit: (code: typeof FORCED_STDIO_EXIT_CODE) => Effect.Effect<void>
  readonly writeDiagnostic: (
    message: typeof FORCED_STDIO_EXIT_DIAGNOSTIC | typeof FORCED_STDIO_EOF_EXIT_DIAGNOSTIC
  ) => Effect.Effect<void>
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
          accepted ? Effect.sync(onQuiesce).pipe(Effect.andThen(Deferred.succeed(requested, reason))) : Effect.void
        )
      )

    const internals: StdioShutdownInternals = {
      claimExecution: Ref.getAndSet(executionClaimed, true).pipe(Effect.map((claimed) => !claimed)),
      beginClosing: (reason) => Ref.set(state, { _tag: "Closing", reason }),
      complete: (reason, outcome) =>
        Ref.set(state, { _tag: "Complete", reason, outcome }).pipe(
          Effect.andThen(Deferred.succeed(completed, undefined)),
          Effect.asVoid
        )
    }
    const coordinator: StdioShutdownCoordinator = {
      request,
      awaitRequest: Deferred.await(requested),
      awaitComplete: Deferred.await(completed),
      state: Ref.get(state),
      execute: (resources) => executeShutdown(coordinator, internals, resources)
    }
    return coordinator
  })

const ignoreCloseFailure = (effect: Effect.Effect<void, unknown>): Effect.Effect<void> =>
  effect.pipe(Effect.timeoutOption(STDIO_CLOSE_ALLOWANCE), Effect.ignore)

const drainAllowance = (
  reason: StdioShutdownReason
): typeof STDIO_DRAIN_ALLOWANCE | typeof STDIO_EOF_DRAIN_ALLOWANCE =>
  reason === "stdin-eof" || reason === "stdin-close" ? STDIO_EOF_DRAIN_ALLOWANCE : STDIO_DRAIN_ALLOWANCE

const runGracefulShutdown = (
  internals: StdioShutdownInternals,
  reason: StdioShutdownReason,
  resources: StdioShutdownResources
): Effect.Effect<void> =>
  Effect.gen(function* () {
    yield* resources.drain.pipe(Effect.timeoutOption(drainAllowance(reason)), Effect.ignore)
    yield* internals.beginClosing(reason)
    yield* Effect.all([resources.closeWire, resources.closeTelemetry, resources.closeClients].map(ignoreCloseFailure), {
      concurrency: "unbounded",
      discard: true
    })
    yield* internals.complete(reason, "graceful")
  })

const forceShutdown = (
  internals: StdioShutdownInternals,
  reason: StdioShutdownReason,
  resources: StdioShutdownResources
): Effect.Effect<void> => {
  const isEof = reason === "stdin-eof" || reason === "stdin-close"
  const deadline = isEof ? STDIO_EOF_SHUTDOWN_DEADLINE : STDIO_SHUTDOWN_DEADLINE
  const diagnostic = isEof ? FORCED_STDIO_EOF_EXIT_DIAGNOSTIC : FORCED_STDIO_EXIT_DIAGNOSTIC
  return Effect.sleep(deadline).pipe(
    Effect.andThen(resources.writeDiagnostic(diagnostic)),
    Effect.andThen(resources.forceExit(FORCED_STDIO_EXIT_CODE)),
    Effect.andThen(internals.complete(reason, "forced"))
  )
}

const raceDetachedShutdowns = (graceful: Effect.Effect<void>, forced: Effect.Effect<void>): Effect.Effect<void> =>
  Effect.gen(function* () {
    const gracefulFiber = yield* graceful.pipe(Effect.forkDetach({ startImmediately: true }))
    const forcedFiber = yield* forced.pipe(Effect.forkDetach({ startImmediately: true }))
    yield* Effect.raceFirst(Fiber.join(gracefulFiber), Fiber.join(forcedFiber), {
      onWinner: ({ index }) => {
        if (index === 0) forcedFiber.interruptUnsafe()
        else gracefulFiber.interruptUnsafe()
      }
    })
  })

const executeShutdown = (
  coordinator: StdioShutdownCoordinator,
  internals: StdioShutdownInternals,
  resources: StdioShutdownResources
): Effect.Effect<void> =>
  Effect.gen(function* () {
    const reason = yield* coordinator.awaitRequest
    if (!(yield* internals.claimExecution)) return yield* coordinator.awaitComplete
    yield* raceDetachedShutdowns(
      runGracefulShutdown(internals, reason, resources).pipe(Effect.interruptible),
      forceShutdown(internals, reason, resources).pipe(Effect.interruptible)
    )
  }).pipe(Effect.asVoid)

export const executeBoundedStdioShutdown = (
  coordinator: StdioShutdownCoordinator,
  resources: StdioShutdownResources
): Effect.Effect<void> => coordinator.execute(resources)
