import { it } from "@effect/vitest"
import { Deferred, Effect, Exit, Fiber, Ref, Schema, Scope } from "effect"
import { expect } from "vitest"
import { TestClock } from "effect/testing"

import { AdmissionPolicy, AttachmentToken, DEFAULT_LEASE_POLICY } from "../../src/resident/admission-contract.js"
import { makeResidentAdmissions } from "../../src/resident/admissions.js"
import { makeAttachmentOwner } from "../../src/resident/attachment-owner.js"

const policy = Schema.decodeUnknownSync(AdmissionPolicy)({
  capacity: 2,
  closeAllowanceMillis: 1_000,
  lease: DEFAULT_LEASE_POLICY
})

it.effect("closes a newly acquired owner instead of publishing it if fencing wins during acquisition", () =>
  Effect.gen(function* () {
    const acquired = yield* Deferred.make<Effect.Success<ReturnType<typeof makeAttachmentOwner>>>()
    const resume = yield* Deferred.make<void>()
    const token = Schema.decodeUnknownSync(AttachmentToken)("b".repeat(64))
    const registry = yield* makeResidentAdmissions(policy, Effect.succeed(token), (eligible) =>
      makeAttachmentOwner(eligible).pipe(
        Effect.tap((owner) => Deferred.succeed(acquired, owner)),
        Effect.tap(() => Deferred.await(resume))
      )
    )
    const admitting = yield* registry.admit.pipe(Effect.result, Effect.forkChild)
    const owner = yield* Deferred.await(acquired)
    try {
      yield* registry.fence
      expect((yield* Effect.flip(registry.admit)).kind).toBe("closing")
    } finally {
      yield* Deferred.succeed(resume, undefined)
    }
    const result = yield* Fiber.join(admitting)
    expect(result._tag).toBe("Failure")
    if (result._tag === "Failure") expect(result.failure.kind).toBe("closing")
    yield* owner.closed
    expect((yield* Effect.flip(registry.find(token))).kind).toBe("unknown")
  }).pipe(Effect.scoped)
)

it.effect("irreversibly fences new admission, renewal, lookup and previously captured work authority", () =>
  Effect.gen(function* () {
    const registry = yield* makeResidentAdmissions(policy)
    const member = yield* registry.admit
    const owner = yield* registry.find(member.token)
    yield* registry.fence
    yield* registry.fence
    expect((yield* Effect.flip(registry.admit)).kind).toBe("closing")
    expect((yield* Effect.flip(registry.find(member.token))).kind).toBe("unknown")
    expect((yield* Effect.flip(registry.renew(member.token))).kind).toBe("unknown")
    const entered = yield* Ref.make(false)
    const denied = yield* Effect.flip(owner.withWork({ use: () => Ref.set(entered, true), cleanup: () => Effect.void }))
    expect(denied._tag).toBe("RequestWorkRejected")
    expect(yield* Ref.get(entered)).toBe(false)
    yield* registry.release(member.token)
    expect((yield* Effect.flip(registry.admit)).kind).toBe("closing")
  }).pipe(Effect.scoped)
)

it.effect("does not wait for paused admission and refuses queued admissions when ownership is fenced", () =>
  Effect.gen(function* () {
    const started = yield* Deferred.make<void>()
    const token = yield* Deferred.make<AttachmentToken>()
    const tokens = Deferred.succeed(started, undefined).pipe(Effect.andThen(Deferred.await(token)))
    const registry = yield* makeResidentAdmissions(policy, tokens)
    const first = yield* registry.admit.pipe(Effect.result, Effect.forkChild)
    yield* Deferred.await(started)
    const second = yield* registry.admit.pipe(Effect.result, Effect.forkChild)
    yield* Effect.yieldNow
    try {
      yield* registry.fence
      expect((yield* Effect.flip(registry.admit)).kind).toBe("closing")
    } finally {
      yield* Deferred.succeed(token, Schema.decodeUnknownSync(AttachmentToken)("a".repeat(64)))
    }
    for (const running of [first, second]) {
      const outcome = yield* Fiber.join(running)
      expect(outcome._tag).toBe("Failure")
      if (outcome._tag === "Failure") expect(outcome.failure.kind).toBe("closing")
    }
  }).pipe(Effect.scoped)
)

it.effect("keeps admitted work and native ownership until explicit drain confirms cleanup", () =>
  Effect.gen(function* () {
    const registry = yield* makeResidentAdmissions(policy)
    const member = yield* registry.admit
    const owner = yield* registry.find(member.token)
    const started = yield* Deferred.make<void>()
    const cleaning = yield* Deferred.make<void>()
    const finish = yield* Deferred.make<void>()
    const released = yield* Ref.make(false)
    const work = yield* owner
      .withWork({
        use: (session) =>
          session
            .adopt({ id: "retained", release: Ref.set(released, true).pipe(Effect.as(true)) })
            .pipe(Effect.andThen(Deferred.succeed(started, undefined)), Effect.andThen(Effect.never)),
        cleanup: () => Deferred.succeed(cleaning, undefined).pipe(Effect.andThen(Deferred.await(finish)))
      })
      .pipe(Effect.exit, Effect.forkChild)
    yield* Deferred.await(started)
    yield* registry.fence
    expect(yield* Deferred.isDone(cleaning)).toBe(false)
    expect(yield* owner.ownsSession("retained")).toBe(true)
    const close = yield* registry.release(member.token).pipe(Effect.forkChild)
    yield* Deferred.await(cleaning)
    try {
      expect(yield* owner.ownsSession("retained")).toBe(true)
      expect(yield* Ref.get(released)).toBe(false)
    } finally {
      yield* Deferred.succeed(finish, undefined)
    }
    yield* Fiber.join(close)
    expect(Exit.isFailure(yield* Fiber.join(work))).toBe(true)
    expect(yield* Ref.get(released)).toBe(true)
  }).pipe(Effect.scoped)
)

it.effect("does not allow a captured admission service to allocate after its owning scope closes", () =>
  Effect.gen(function* () {
    const scope = yield* Scope.make()
    const registry = yield* makeResidentAdmissions(policy).pipe(Scope.provide(scope))
    yield* Scope.close(scope, Exit.void)
    expect((yield* Effect.flip(registry.admit)).kind).toBe("closing")
  }).pipe(Effect.scoped)
)

it.effect("retains failed cleanup for an owner acquired while generation fencing wins", () =>
  Effect.gen(function* () {
    const acquired = yield* Deferred.make<Effect.Success<ReturnType<typeof makeAttachmentOwner>>>()
    const resume = yield* Deferred.make<void>()
    const released = yield* Ref.make(false)
    const token = Schema.decodeUnknownSync(AttachmentToken)("d".repeat(64))
    const registry = yield* makeResidentAdmissions(policy, Effect.succeed(token), (eligible) =>
      Effect.gen(function* () {
        const owner = yield* makeAttachmentOwner(eligible)
        const started = yield* Deferred.make<void>()
        yield* owner
          .withWork({
            use: (session) =>
              session
                .adopt({ id: "unpublished-retained", release: Ref.set(released, true).pipe(Effect.as(true)) })
                .pipe(Effect.andThen(Deferred.succeed(started, undefined)), Effect.andThen(Effect.never)),
            cleanup: () => Effect.fail("Unconfirmed fixture cleanup")
          })
          .pipe(Effect.exit, Effect.forkScoped)
        yield* Deferred.await(started)
        yield* Deferred.succeed(acquired, owner)
        yield* Deferred.await(resume)
        return owner
      })
    )
    const admitting = yield* registry.admit.pipe(Effect.flip, Effect.forkChild)
    const owner = yield* Deferred.await(acquired)
    yield* registry.fence
    yield* Deferred.succeed(resume, undefined)
    expect((yield* Fiber.join(admitting)).kind).toBe("cleanup")
    expect(yield* owner.ownsSession("unpublished-retained")).toBe(true)
    expect(yield* Ref.get(released)).toBe(false)
    expect(Exit.isFailure(yield* registry.drain.pipe(Effect.exit))).toBe(true)
    expect(Exit.isFailure(yield* registry.drain.pipe(Effect.exit))).toBe(true)
  }).pipe(Effect.scoped)
)

it.effect("bounds an unpublished owner's cleanup wait and retains it until late cleanup confirms closure", () =>
  Effect.gen(function* () {
    const acquired = yield* Deferred.make<void>()
    const resume = yield* Deferred.make<void>()
    const finish = yield* Deferred.make<void>()
    const cleaning = yield* Deferred.make<void>()
    const done = yield* Deferred.make<void>()
    const token = Schema.decodeUnknownSync(AttachmentToken)("e".repeat(64))
    const registry = yield* makeResidentAdmissions(policy, Effect.succeed(token), (eligible) =>
      Effect.gen(function* () {
        const owner = yield* makeAttachmentOwner(eligible)
        const started = yield* Deferred.make<void>()
        yield* owner
          .withWork({
            use: () => Deferred.succeed(started, undefined).pipe(Effect.andThen(Effect.never)),
            cleanup: () => Deferred.succeed(cleaning, undefined).pipe(Effect.andThen(Deferred.await(finish)))
          })
          .pipe(Effect.exit, Effect.forkScoped)
        yield* Deferred.await(started)
        yield* Deferred.succeed(acquired, undefined)
        yield* Deferred.await(resume)
        return owner
      })
    )
    const admitting = yield* registry.admit.pipe(
      Effect.flip,
      Effect.tap(() => Deferred.succeed(done, undefined)),
      Effect.forkChild
    )
    yield* Deferred.await(acquired)
    yield* registry.fence
    yield* Deferred.succeed(resume, undefined)
    yield* Deferred.await(cleaning)
    try {
      yield* TestClock.adjust("1 second")
      expect(yield* Deferred.isDone(done)).toBe(true)
    } finally {
      yield* Deferred.succeed(finish, undefined)
    }
    expect((yield* Fiber.join(admitting)).kind).toBe("pending")
    yield* registry.drain
  }).pipe(Effect.scoped)
)
