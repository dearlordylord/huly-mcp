import { it, expect } from "@effect/vitest"
import { Deferred, Effect, Fiber, Scope, Exit } from "effect"
import { acquirePendingClosableClient } from "../../src/huly/scoped-client.js"

it.effect("closes its owner while SDK acquisition is pending and releases late success once", () =>
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
    yield* Scope.close(scope, Exit.void)
    expect(Exit.hasInterrupts(yield* Fiber.await(fiber))).toBe(true)
    resolve({
      client: {
        close: async () => {
          closes++
          Effect.runSync(Deferred.succeed(settled, undefined))
        }
      }
    })
    yield* Deferred.await(settled)
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

it.effect("observes a late SDK rejection after its owner has closed", () =>
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
    yield* Scope.close(scope, Exit.void)
    reject(new Error("late network failure"))
    yield* Effect.yieldNow
    expect(Exit.hasInterrupts(yield* Fiber.await(fiber))).toBe(true)
  })
)
