import { Deferred, Effect, Exit, Fiber } from "effect"
import { it, expect } from "@effect/vitest"
import { makeSharedResource } from "../../src/runtime/shared-resource.js"

it.effect("keeps acquisition alive when a waiter is canceled and closes its resource once", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const started = yield* Deferred.make<void>()
      const release = yield* Deferred.make<void>()
      let acquisitions = 0
      let closes = 0
      const resource = yield* makeSharedResource(
        Effect.acquireRelease(
          Effect.gen(function* () {
            acquisitions++
            yield* Deferred.succeed(started, undefined)
            yield* Deferred.await(release)
            return "ready"
          }),
          () =>
            Effect.sync(() => {
              closes++
            })
        )
      )
      const waiter = yield* Effect.forkChild(resource)
      yield* Deferred.await(started)
      yield* Fiber.interrupt(waiter)
      yield* Deferred.succeed(release, undefined)
      expect(yield* Effect.all([resource, resource], { concurrency: "unbounded" })).toEqual(["ready", "ready"])
      expect(acquisitions).toBe(1)
      expect(closes).toBe(0)
    })
  )
)

it.effect("allows a fresh acquisition after a failed initialization", () =>
  Effect.scoped(
    Effect.gen(function* () {
      let attempts = 0
      const resource = yield* makeSharedResource(
        Effect.suspend(() => (++attempts === 1 ? Effect.fail("offline") : Effect.succeed("ready")))
      )
      expect(yield* Effect.flip(resource)).toBe("offline")
      expect(yield* resource).toBe("ready")
      expect(attempts).toBe(2)
    })
  )
)

it.effect("closes the acquired resource once and rejects use after its owner closes", () =>
  Effect.gen(function* () {
    let closes = 0
    const resource = yield* Effect.scoped(
      Effect.gen(function* () {
        const get = yield* makeSharedResource(
          Effect.acquireRelease(Effect.succeed("ready"), () =>
            Effect.sync(() => {
              closes++
            })
          )
        )
        yield* get
        yield* get
        return get
      })
    )
    expect(closes).toBe(1)
    expect(Exit.hasInterrupts(yield* Effect.exit(resource))).toBe(true)
  })
)
