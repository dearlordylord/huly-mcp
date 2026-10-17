import { it } from "@effect/vitest"
import { Deferred, Effect, Fiber } from "effect"
import { TestClock } from "effect/testing"
import { expect } from "vitest"

import { closeResidentClients } from "../../src/runtime/server-startup.js"

it.effect("confirms successful process-client closure once", () =>
  Effect.gen(function* () {
    let calls = 0
    yield* closeResidentClients(async () => {
      calls++
    })
    expect(calls).toBe(1)
  })
)

it.effect("keeps a rejected client closure typed and does not disclose its raw failure", () =>
  Effect.gen(function* () {
    const error = yield* closeResidentClients(() => Promise.reject(new Error("fixture-private-token"))).pipe(
      Effect.flip
    )
    expect(error.reason).toBe("retirement")
    expect(JSON.stringify(error)).not.toContain("fixture-private-token")
  })
)

it.effect("bounds unconfirmed closure and retains its failure after a late completion", () =>
  Effect.gen(function* () {
    const started = yield* Deferred.make<void>()
    const finished = yield* Deferred.make<void>()
    const close = yield* closeResidentClients(() => {
      Effect.runSync(Deferred.succeed(started, undefined))
      return Effect.runPromise(Deferred.await(finished))
    }).pipe(Effect.flip, Effect.forkChild)
    yield* Deferred.await(started)
    yield* TestClock.adjust("5 seconds")
    const error = yield* Fiber.join(close)
    expect(error.reason).toBe("retirement")
    expect(error.message).toContain("timed out")
    yield* Deferred.succeed(finished, undefined)
    expect((yield* Fiber.join(close)).reason).toBe("retirement")
  })
)
