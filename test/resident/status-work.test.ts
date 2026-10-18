import { it } from "@effect/vitest"
import { Deferred, Effect, Fiber, Schema } from "effect"
import { expect } from "vitest"
import { TestClock } from "effect/testing"

import { AdmissionPolicy, AttachmentToken, DEFAULT_LEASE_POLICY } from "../../src/resident/admission-contract.js"
import { makeResidentAdmissions } from "../../src/resident/admissions.js"

const policy = Schema.decodeUnknownSync(AdmissionPolicy)({
  capacity: 2,
  closeAllowanceMillis: 1_000,
  lease: DEFAULT_LEASE_POLICY
})

it.effect("reports pending admission and blocked drain without manufacturing an attachment", () =>
  Effect.gen(function* () {
    const entered = yield* Deferred.make<void>()
    const token = yield* Deferred.make<AttachmentToken>()
    const admissions = yield* makeResidentAdmissions(
      policy,
      Deferred.succeed(entered, undefined).pipe(Effect.andThen(Deferred.await(token)))
    )
    const pending = yield* admissions.admit.pipe(Effect.exit, Effect.forkScoped)
    yield* Deferred.await(entered)
    expect(yield* admissions.status).toMatchObject({ pendingAdmissions: 1, attachments: 0, drain: "idle" })
    const drain = yield* admissions.drain.pipe(Effect.exit, Effect.forkScoped)
    yield* TestClock.adjust("1 second")
    yield* Fiber.join(drain)
    expect(yield* admissions.status).toMatchObject({ admission: "fenced", pendingAdmissions: 1, drain: "blocked" })
    yield* Deferred.succeed(token, Schema.decodeUnknownSync(AttachmentToken)("b".repeat(64)))
    yield* Fiber.join(pending)
    yield* admissions.drain
    expect(yield* admissions.status).toMatchObject({ pendingAdmissions: 0, attachments: 0, drain: "draining" })
  }).pipe(Effect.scoped)
)

it.effect("reports retained requests through drain until their cleanup actually finishes", () =>
  Effect.gen(function* () {
    const admissions = yield* makeResidentAdmissions(policy)
    expect(yield* admissions.status).toEqual({
      admission: "accepting",
      attachments: 0,
      pendingAdmissions: 0,
      retainedRequests: 0,
      blockedRequests: 0,
      drain: "idle"
    })
    const admitted = yield* admissions.admit
    const owner = yield* admissions.find(admitted.token)
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
    expect(yield* admissions.status).toMatchObject({ attachments: 1, retainedRequests: 1, drain: "idle" })
    const draining = yield* admissions.drain.pipe(Effect.forkScoped)
    yield* Deferred.await(cleaning)
    expect(yield* admissions.status).toMatchObject({
      admission: "fenced",
      attachments: 1,
      retainedRequests: 1,
      drain: "draining"
    })
    yield* Deferred.succeed(finish, undefined)
    yield* Fiber.join(draining)
    yield* Fiber.join(request)
    expect(yield* admissions.status).toMatchObject({ attachments: 0, retainedRequests: 0 })
  }).pipe(Effect.scoped)
)

it.effect("keeps failed request cleanup visible as blocked work", () =>
  Effect.gen(function* () {
    const admissions = yield* makeResidentAdmissions(policy)
    const admitted = yield* admissions.admit
    const owner = yield* admissions.find(admitted.token)
    yield* owner.withWork({ use: () => Effect.void, cleanup: () => Effect.fail("private-error") }).pipe(Effect.exit)
    expect(yield* admissions.status).toEqual({
      admission: "accepting",
      attachments: 1,
      pendingAdmissions: 0,
      retainedRequests: 1,
      blockedRequests: 1,
      drain: "blocked"
    })
    yield* admissions.drain.pipe(Effect.exit)
  }).pipe(Effect.scoped)
)
