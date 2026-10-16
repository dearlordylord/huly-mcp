import { Effect, Result, type Scope } from "effect"

export interface ClosableClient {
  readonly close: () => Promise<void>
}

export const acquireClosableClient = <A extends { readonly client: ClosableClient }, E, R>(
  acquire: Effect.Effect<A, E, R>
): Effect.Effect<A, E, R | Scope.Scope> =>
  Effect.acquireRelease(acquire, ({ client }) => Effect.promise(() => client.close()))

/** Own the promise before waiting so late SDK success cannot escape a closed scope. */
export const acquirePendingClosableClient = <A extends { readonly client: ClosableClient }>(
  create: () => Promise<A>
): Effect.Effect<A, unknown, Scope.Scope> =>
  Effect.gen(function* () {
    let closed = false
    let acquired: A | undefined
    let closing: Promise<void> | undefined
    const close = (value: A) => (closing ??= value.client.close())
    yield* Effect.addFinalizer(() =>
      Effect.promise(async () => {
        closed = true
        if (acquired !== undefined) await close(acquired)
      })
    )
    const outcome = Promise.resolve()
      .then(create)
      .then(async (value) => {
        acquired = value
        if (closed) await close(value)
        return Result.succeed(value)
      })
      .catch((error: unknown) => Result.fail(error))
    return yield* Effect.flatMap(
      Effect.promise(() => outcome),
      Effect.fromResult
    )
  })
