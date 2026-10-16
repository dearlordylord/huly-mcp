import { Duration, Effect, Exit, Fiber, Scope } from "effect"

/** The scope owns acquisition; individual callers only wait for its fiber. */
export const makeSharedResource = <A, E>(
  acquire: Effect.Effect<A, E, Scope.Scope>
): Effect.Effect<Effect.Effect<A, E>, never, Scope.Scope> =>
  Effect.gen(function* () {
    const scope = yield* Effect.scope
    let closed = false
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        closed = true
      })
    )
    let invalidate = Effect.void
    const owned = acquire.pipe(
      Scope.provide(scope),
      Effect.onExit((exit) => (Exit.isFailure(exit) ? invalidate : Effect.void))
    )
    const [getFiber, reset] = yield* Effect.cachedInvalidateWithTTL(
      Effect.forkIn(owned, scope, { startImmediately: false }),
      Duration.infinity
    )
    invalidate = reset
    return Effect.suspend(() => (closed ? Effect.interrupt : Effect.flatMap(getFiber, Fiber.join)))
  })
