import { it } from "@effect/vitest"
import { Deferred, Effect, Exit, Fiber, Ref, Result, Schema } from "effect"
import { TestClock } from "effect/testing"
import { expect } from "vitest"

import { AdmissionPolicy, AttachmentToken, DEFAULT_LEASE_POLICY } from "../../src/resident/admission-contract.js"
import { makeResidentAdmissions } from "../../src/resident/admissions.js"

const policy = Schema.decodeUnknownSync(AdmissionPolicy)({
  capacity: 1,
  closeAllowanceMillis: 1_000,
  lease: DEFAULT_LEASE_POLICY
})

it.effect("serializes admission capacity and never resurrects a released capability", () =>
  Effect.gen(function* () {
    const registry = yield* makeResidentAdmissions(policy)
    const attempts = yield* Effect.all([registry.admit, registry.admit], { concurrency: "unbounded", mode: "result" })
    expect(attempts.filter(Result.isSuccess)).toHaveLength(1)
    expect(attempts.filter(Result.isFailure)).toHaveLength(1)
    for (const attempt of attempts) {
      if (Result.isFailure(attempt)) {
        expect(attempt.failure.kind).toBe("capacity")
        continue
      }
      yield* registry.release(attempt.success.token)
      yield* registry.release(attempt.success.token)
      const next = yield* registry.admit
      expect((yield* Effect.result(registry.find(attempt.success.token)))._tag).toBe("Failure")
      expect((yield* Effect.result(registry.find(next.token)))._tag).toBe("Success")
      yield* registry.release(next.token)
    }
  }).pipe(Effect.scoped)
)

it.effect("keeps timed-out cleanup owned and reclaims its slot when cleanup later completes", () =>
  Effect.gen(function* () {
    const registry = yield* makeResidentAdmissions(policy)
    const admitted = yield* registry.admit
    const owner = yield* registry.find(admitted.token)
    const started = yield* Deferred.make<void>()
    const cleaning = yield* Deferred.make<void>()
    const finish = yield* Deferred.make<void>()
    const released = yield* Ref.make(false)
    const work = yield* owner
      .withWork({
        use: (sessionOwner) =>
          sessionOwner
            .adopt({ id: "held", release: Ref.set(released, true).pipe(Effect.as(true)) })
            .pipe(Effect.andThen(Deferred.succeed(started, undefined)), Effect.andThen(Effect.never)),
        cleanup: () => Deferred.succeed(cleaning, undefined).pipe(Effect.andThen(Deferred.await(finish)))
      })
      .pipe(Effect.exit, Effect.forkScoped)
    yield* Deferred.await(started)
    const closing = yield* Effect.result(registry.release(admitted.token)).pipe(Effect.forkScoped)
    yield* Deferred.await(cleaning)
    yield* TestClock.adjust("1 second")
    try {
      const outcome = yield* Fiber.join(closing)
      expect(Result.isFailure(outcome) && outcome.failure.kind).toBe("pending")
      expect((yield* Effect.result(registry.admit))._tag).toBe("Failure")
      expect((yield* Effect.result(registry.find(admitted.token)))._tag).toBe("Failure")
      expect(yield* owner.ownsSession("held")).toBe(true)
      expect(yield* Ref.get(released)).toBe(false)
    } finally {
      yield* Deferred.succeed(finish, undefined)
    }
    yield* owner.closed
    expect(Exit.isFailure(yield* Fiber.join(work))).toBe(true)
    yield* Effect.yieldNow
    const next = yield* registry.admit
    expect((yield* Effect.result(registry.find(admitted.token)))._tag).toBe("Failure")
    yield* registry.release(next.token)
  }).pipe(Effect.scoped)
)

it.effect("retains capacity and the native capability after typed cleanup failure", () =>
  Effect.gen(function* () {
    const registry = yield* makeResidentAdmissions(policy)
    const admitted = yield* registry.admit
    const owner = yield* registry.find(admitted.token)
    yield* Effect.exit(
      owner.withWork({
        use: (sessionOwner) =>
          sessionOwner
            .adopt({ id: "unverified", release: Effect.die("Must retain this resource") })
            .pipe(Effect.asVoid),
        cleanup: () => Effect.fail("Fixture cleanup unavailable")
      })
    )
    const closing = yield* Effect.result(registry.release(admitted.token))
    expect(Result.isFailure(closing) && closing.failure.kind).toBe("cleanup")
    yield* TestClock.adjust("30 seconds")
    expect((yield* Effect.result(registry.admit))._tag).toBe("Failure")
    expect(yield* owner.ownsSession("unverified")).toBe(true)
    expect((yield* Effect.result(registry.find(admitted.token)))._tag).toBe("Failure")
  }).pipe(Effect.scoped)
)

it.effect("refuses a colliding capability without overwriting its live owner", () =>
  Effect.gen(function* () {
    const token = Schema.decodeUnknownSync(AttachmentToken)("a".repeat(64))
    const capacity = Schema.decodeUnknownSync(AdmissionPolicy)({ ...policy, capacity: 2 })
    const registry = yield* makeResidentAdmissions(capacity, Effect.succeed(token))
    const first = yield* registry.admit
    const owner = yield* registry.find(first.token)
    const collision = yield* Effect.result(registry.admit)
    expect(Result.isFailure(collision) && collision.failure.kind).toBe("unknown")
    expect(yield* registry.find(first.token)).toBe(owner)
    yield* registry.release(first.token)
  }).pipe(Effect.scoped)
)
