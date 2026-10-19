import { Effect, Result, type Scope } from "effect"

export interface ClosableClient {
  readonly close: () => Promise<void>
}

export const acquireClosableClient = <A extends { readonly client: ClosableClient }, E, R>(
  acquire: Effect.Effect<A, E, R>
): Effect.Effect<A, E, R | Scope.Scope> =>
  Effect.acquireRelease(acquire, ({ client }) => Effect.promise(() => client.close()))

/** Retirement joins SDK acquisition and its close, including a late success. */
export const acquirePendingClosableClient = <A extends { readonly client: ClosableClient }>(
  create: () => Promise<A>
): Effect.Effect<A, unknown, Scope.Scope> =>
  Effect.gen(function* () {
    let closed = false
    const pending = yield* Effect.acquireRelease(
      Effect.sync(() => {
        const outcome = Promise.resolve()
          .then(create)
          .then(Result.succeed, (error: unknown) => Result.fail(error))
        return { join: () => outcome }
      }),
      (pending) =>
        Effect.promise(async () => {
          closed = true
          const result = await pending.join()
          if (Result.isSuccess(result)) await result.success.client.close()
        })
    )
    const result = yield* Effect.promise(pending.join)
    return yield* closed ? Effect.interrupt : Effect.fromResult(result)
  })
