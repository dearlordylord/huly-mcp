import { it } from "@effect/vitest"
import { Deferred, Effect, Fiber, Result, Schema } from "effect"
import { TestClock } from "effect/testing"
import { expect } from "vitest"

import { AdmissionPolicy } from "../../src/resident/admission-contract.js"
import { makeResidentAdmissions } from "../../src/resident/admissions.js"

const LEASE_MILLIS = 1_000
const RENEW_MILLIS = 200
const CLOSE_MILLIS = 500
const policy = Schema.decodeUnknownSync(AdmissionPolicy)({
  capacity: 1,
  closeAllowanceMillis: CLOSE_MILLIS,
  lease: { durationMillis: LEASE_MILLIS, renewEveryMillis: RENEW_MILLIS }
})

it.effect("reclaims a lost admission receipt without needing its unknown token", () =>
  Effect.gen(function* () {
    const registry = yield* makeResidentAdmissions(policy)
    yield* registry.admit
    expect((yield* Effect.result(registry.admit))._tag).toBe("Failure")
    yield* TestClock.adjust("1 second")
    const recovered = yield* registry.admit
    yield* registry.release(recovered.token)
  }).pipe(Effect.scoped)
)

it.effect("renewal extends eligibility but cannot revive an expired identity", () =>
  Effect.gen(function* () {
    const registry = yield* makeResidentAdmissions(policy)
    const admitted = yield* registry.admit
    yield* TestClock.adjust("500 millis")
    yield* registry.renew(admitted.token)
    yield* TestClock.adjust("500 millis")
    expect((yield* Effect.result(registry.find(admitted.token)))._tag).toBe("Success")
    yield* TestClock.adjust("500 millis")
    expect((yield* Effect.result(registry.renew(admitted.token)))._tag).toBe("Failure")
    expect((yield* Effect.result(registry.find(admitted.token)))._tag).toBe("Failure")
    const next = yield* registry.admit
    yield* registry.release(next.token)
  }).pipe(Effect.scoped)
)

it.effect("expiry fences a captured owner before releasing its retained work or slot", () =>
  Effect.gen(function* () {
    const registry = yield* makeResidentAdmissions(policy)
    const admitted = yield* registry.admit
    const owner = yield* registry.find(admitted.token)
    const started = yield* Deferred.make<void>()
    const cleaning = yield* Deferred.make<void>()
    const finish = yield* Deferred.make<void>()
    const request = yield* owner
      .withWork({
        use: () => Deferred.succeed(started, undefined).pipe(Effect.andThen(Effect.never)),
        cleanup: () => Deferred.succeed(cleaning, undefined).pipe(Effect.andThen(Deferred.await(finish)))
      })
      .pipe(Effect.exit, Effect.forkScoped)
    yield* Deferred.await(started)
    yield* TestClock.adjust("1 second")
    yield* Deferred.await(cleaning)
    try {
      expect((yield* Effect.result(registry.renew(admitted.token)))._tag).toBe("Failure")
      expect((yield* Effect.result(owner.withWork({ use: () => Effect.void, cleanup: () => Effect.void })))._tag).toBe(
        "Failure"
      )
      const capacity = yield* Effect.result(registry.admit)
      expect(Result.isFailure(capacity) && capacity.failure.kind).toBe("capacity")
    } finally {
      yield* Deferred.succeed(finish, undefined)
    }
    yield* Fiber.join(request)
    yield* owner.closed
    yield* Effect.yieldNow
    const next = yield* registry.admit
    yield* registry.release(next.token)
  }).pipe(Effect.scoped)
)
