import { it, expect } from "@effect/vitest"
import { Deferred, Effect, Fiber, Scope, Exit } from "effect"
import { acquirePendingClosableClient } from "../../src/huly/scoped-client.js"

it.effect("joins pending SDK acquisition and closes late success before confirming retirement", () =>
  Effect.gen(function* () {
    const started = yield* Deferred.make<void>()
    const settled = yield* Deferred.make<void>()
    const scope = yield* Scope.make()
    let resolve: (value: { client: { close: () => Promise<void> } }) => void = () => {}
    let closes = 0
    let published = false
    const pending = new Promise<{ client: { close: () => Promise<void> } }>((done) => {
      resolve = done
    })
    const acquisition = acquirePendingClosableClient(() => {
      Effect.runSync(Deferred.succeed(started, undefined))
      return pending
    }).pipe(
      Scope.provide(scope),
      Effect.tap(() =>
        Effect.sync(() => {
          published = true
        })
      )
    )
    const fiber = yield* Effect.forkIn(acquisition, scope)
    yield* Deferred.await(started)
    const closing = yield* Scope.close(scope, Exit.void).pipe(Effect.forkChild)
    yield* Effect.yieldNow
    expect(closing.pollUnsafe()).toBeUndefined()
    resolve({
      client: {
        close: async () => {
          closes++
          Effect.runSync(Deferred.succeed(settled, undefined))
        }
      }
    })
    yield* Deferred.await(settled)
    yield* Fiber.join(closing)
    expect(Exit.hasInterrupts(yield* Fiber.await(fiber))).toBe(true)
    expect(closes).toBe(1)
    expect(published).toBe(false)
    yield* Scope.close(scope, Exit.void)
    expect(closes).toBe(1)
  })
)

it.effect("closes a ready SDK client exactly once", () =>
  Effect.gen(function* () {
    let closes = 0
    yield* acquirePendingClosableClient(async () => ({
      client: {
        close: async () => {
          closes++
        }
      }
    })).pipe(Effect.scoped)
    expect(closes).toBe(1)
  })
)

it.effect("keeps SDK rejection in the typed error channel", () =>
  Effect.gen(function* () {
    const failure = new Error("offline")
    const error = yield* acquirePendingClosableClient(async () => {
      throw failure
    }).pipe(Effect.flip, Effect.scoped)
    expect(error).toBe(failure)
  })
)

it.effect("joins a late SDK rejection before its owner closes", () =>
  Effect.gen(function* () {
    const started = yield* Deferred.make<void>()
    const scope = yield* Scope.make()
    let reject: (error: Error) => void = () => {}
    const pending = new Promise<{ client: { close: () => Promise<void> } }>((_resolve, fail) => {
      reject = fail
    })
    const fiber = yield* Effect.forkIn(
      acquirePendingClosableClient(() => {
        Effect.runSync(Deferred.succeed(started, undefined))
        return pending
      }).pipe(Scope.provide(scope)),
      scope
    )
    yield* Deferred.await(started)
    const closing = yield* Scope.close(scope, Exit.void).pipe(Effect.forkChild)
    yield* Effect.yieldNow
    expect(closing.pollUnsafe()).toBeUndefined()
    reject(new Error("late network failure"))
    yield* Fiber.join(closing)
    expect(Exit.hasInterrupts(yield* Fiber.await(fiber))).toBe(true)
  })
)
