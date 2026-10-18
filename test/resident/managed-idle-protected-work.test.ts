import { it } from "@effect/vitest"
import { Deferred, Effect, Exit, Fiber, Ref, Schema } from "effect"
import { TestClock } from "effect/testing"
import { expect } from "vitest"

import { AdmissionPolicy } from "../../src/resident/admission-contract.js"
import { makeResidentAdmissions } from "../../src/resident/admissions.js"
import { MANAGED_IDLE_MILLIS } from "../../src/resident/managed-contract.js"

const LEASE_MILLIS = 1_000
const policy = Schema.decodeUnknownSync(AdmissionPolicy)({
  capacity: 1,
  closeAllowanceMillis: 500,
  lease: { durationMillis: LEASE_MILLIS, renewEveryMillis: 200 }
})

it.effect("retains expired work through slow cleanup and starts idle only after confirmed release", () =>
  Effect.gen(function* () {
    const registry = yield* makeResidentAdmissions(policy)
    const member = yield* registry.admit
    const owner = yield* registry.find(member.token)
    const started = yield* Deferred.make<void>()
    const cleaning = yield* Deferred.make<void>()
    const finish = yield* Deferred.make<void>()
    const idleDone = yield* Deferred.make<void>()
    const releases = yield* Ref.make(0)
    const request = yield* owner
      .withWork({
        use: (session) =>
          session
            .adopt({
              id: "idle-retained-session",
              release: Ref.update(releases, (count) => count + 1).pipe(Effect.as(true))
            })
            .pipe(Effect.andThen(Deferred.succeed(started, undefined)), Effect.andThen(Effect.never)),
        cleanup: () => Deferred.succeed(cleaning, undefined).pipe(Effect.andThen(Deferred.await(finish)))
      })
      .pipe(Effect.exit, Effect.forkScoped)
    yield* Deferred.await(started)
    const idle = yield* registry.awaitIdleAndFence.pipe(
      Effect.tap(() => Deferred.succeed(idleDone, undefined)),
      Effect.forkScoped
    )
    yield* TestClock.adjust(LEASE_MILLIS)
    yield* Deferred.await(cleaning)
    try {
      yield* TestClock.adjust(MANAGED_IDLE_MILLIS * 2)
      expect(yield* Deferred.isDone(idleDone)).toBe(false)
      expect(yield* owner.ownsSession("idle-retained-session")).toBe(true)
      expect(yield* Ref.get(releases)).toBe(0)
      expect((yield* Effect.flip(registry.admit)).kind).toBe("capacity")
    } finally {
      yield* Deferred.succeed(finish, undefined)
    }
    expect(Exit.isFailure(yield* Fiber.join(request))).toBe(true)
    yield* registry.release(member.token)
    expect(yield* Ref.get(releases)).toBe(1)
    yield* TestClock.adjust(MANAGED_IDLE_MILLIS - 1)
    expect(yield* Deferred.isDone(idleDone)).toBe(false)
    yield* TestClock.adjust(1)
    yield* Fiber.join(idle)
    expect((yield* Effect.flip(registry.admit)).kind).toBe("closing")
  }).pipe(Effect.scoped)
)

it.effect("failed cleanup prevents idle retirement after expiry and repeated release", () =>
  Effect.gen(function* () {
    const registry = yield* makeResidentAdmissions(policy)
    const member = yield* registry.admit
    const owner = yield* registry.find(member.token)
    const released = yield* Ref.make(false)
    const failure = yield* owner
      .withWork({
        use: (session) =>
          session.adopt({ id: "idle-blocked-session", release: Ref.set(released, true).pipe(Effect.as(true)) }),
        cleanup: () => Effect.fail("Fixture cleanup unavailable")
      })
      .pipe(Effect.exit)
    expect(Exit.isFailure(failure)).toBe(true)
    const idleDone = yield* Deferred.make<void>()
    yield* registry.awaitIdleAndFence.pipe(
      Effect.tap(() => Deferred.succeed(idleDone, undefined)),
      Effect.forkScoped
    )
    yield* TestClock.adjust(LEASE_MILLIS + MANAGED_IDLE_MILLIS * 2)
    for (let attempt = 0; attempt < 2; attempt++) {
      expect((yield* Effect.flip(registry.release(member.token))).kind).toBe("cleanup")
    }
    expect(yield* Deferred.isDone(idleDone)).toBe(false)
    expect(yield* owner.ownsSession("idle-blocked-session")).toBe(true)
    expect(yield* Ref.get(released)).toBe(false)
    expect((yield* Effect.flip(registry.admit)).kind).toBe("capacity")
  }).pipe(Effect.scoped)
)
