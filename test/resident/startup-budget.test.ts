import { it } from "@effect/vitest"
import { Deferred, Effect, Fiber } from "effect"
import { TestClock } from "effect/testing"
import { expect } from "vitest"

import { makeStartupBudget } from "../../src/resident/startup-budget.js"

it.effect("shares one thirty-second deadline across startup operations", () =>
  Effect.gen(function* () {
    const budget = yield* makeStartupBudget
    yield* TestClock.adjust("20 seconds")
    expect(yield* budget.within(Effect.succeed("first"))).toBe("first")
    const entered = yield* Deferred.make<void>()
    const waiting = yield* budget
      .within(Deferred.succeed(entered, undefined).pipe(Effect.andThen(Effect.never)))
      .pipe(Effect.flip, Effect.forkChild)
    yield* Deferred.await(entered)
    yield* TestClock.adjust("10 seconds")
    expect((yield* Fiber.join(waiting)).reason).toBe("deadline")
    let dispatched = false
    const expired = yield* budget
      .within(
        Effect.sync(() => {
          dispatched = true
        })
      )
      .pipe(Effect.flip)
    expect(expired.reason).toBe("deadline")
    expect(dispatched).toBe(false)
  })
)

it.effect("preserves operation failures and does not expire work outside startup acquisition", () =>
  Effect.gen(function* () {
    const budget = yield* makeStartupBudget
    expect(yield* budget.within(Effect.fail("operation failed")).pipe(Effect.flip)).toBe("operation failed")
    const session = yield* budget.within(Effect.succeed(Effect.succeed("session still usable")))
    yield* TestClock.adjust("31 seconds")
    expect(yield* session).toBe("session still usable")
  })
)
