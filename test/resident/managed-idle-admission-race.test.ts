import { it } from "@effect/vitest"
import { Deferred, Effect, Fiber, Ref, Schema } from "effect"
import { TestClock } from "effect/testing"
import { expect } from "vitest"

import { AdmissionPolicy, AttachmentToken, DEFAULT_LEASE_POLICY } from "../../src/resident/admission-contract.js"
import { makeResidentAdmissions } from "../../src/resident/admissions.js"
import { MANAGED_IDLE_MILLIS } from "../../src/resident/managed-contract.js"

const policy = Schema.decodeUnknownSync(AdmissionPolicy)({
  capacity: 1,
  closeAllowanceMillis: 1_000,
  lease: DEFAULT_LEASE_POLICY
})
const token = Schema.decodeUnknownSync(AttachmentToken)("a".repeat(64))

it.effect("protects admission begun just before idle expiry across token acquisition and subsequent work", () =>
  Effect.gen(function* () {
    const acquiring = yield* Deferred.make<void>()
    const resume = yield* Deferred.make<void>()
    const registry = yield* makeResidentAdmissions(
      policy,
      Deferred.succeed(acquiring, undefined).pipe(Effect.andThen(Deferred.await(resume)), Effect.as(token))
    )
    const fenced = yield* Deferred.make<void>()
    const idle = yield* registry.awaitIdleAndFence.pipe(
      Effect.tap(() => Deferred.succeed(fenced, undefined)),
      Effect.forkScoped
    )
    yield* TestClock.adjust(MANAGED_IDLE_MILLIS - 1)
    const admitting = yield* registry.admit.pipe(Effect.forkScoped)
    yield* Deferred.await(acquiring)
    try {
      yield* TestClock.adjust(MANAGED_IDLE_MILLIS)
      expect(yield* Deferred.isDone(fenced)).toBe(false)
    } finally {
      yield* Deferred.succeed(resume, undefined)
    }
    const member = yield* Fiber.join(admitting)
    const owner = yield* registry.find(member.token)
    expect(yield* owner.withWork({ use: () => Effect.succeed("accepted"), cleanup: () => Effect.void })).toBe(
      "accepted"
    )
    yield* TestClock.adjust(MANAGED_IDLE_MILLIS)
    expect(yield* Deferred.isDone(fenced)).toBe(false)
    yield* registry.release(member.token)
    yield* TestClock.adjust(MANAGED_IDLE_MILLIS - 1)
    expect(yield* Deferred.isDone(fenced)).toBe(false)
    yield* TestClock.adjust(1)
    yield* Fiber.join(idle)
    expect((yield* Effect.flip(registry.admit)).kind).toBe("closing")
  }).pipe(Effect.scoped)
)

it.effect("refuses a new attachment after idle fencing without acquiring a token", () =>
  Effect.gen(function* () {
    const acquisitions = yield* Ref.make(0)
    const registry = yield* makeResidentAdmissions(
      policy,
      Ref.update(acquisitions, (count) => count + 1).pipe(Effect.as(token))
    )
    const idle = yield* registry.awaitIdleAndFence.pipe(Effect.forkScoped)
    yield* TestClock.adjust(MANAGED_IDLE_MILLIS)
    yield* Fiber.join(idle)
    expect((yield* Effect.flip(registry.admit)).kind).toBe("closing")
    expect(yield* Ref.get(acquisitions)).toBe(0)
    yield* registry.awaitIdleAndFence
    expect((yield* Effect.flip(registry.admit)).kind).toBe("closing")
    expect(yield* Ref.get(acquisitions)).toBe(0)
  }).pipe(Effect.scoped)
)
