import { it } from "@effect/vitest"
import { Deferred, Effect, Exit, Fiber, Ref, Schema } from "effect"
import { TestClock } from "effect/testing"
import type { McpSchema } from "effect/ai"
import { expect } from "vitest"

import { makeAttachmentOwner } from "../../src/resident/attachment-owner.js"
import { MAX_ADAPTER_REQUESTS } from "../../src/resident/adapter-limits.js"

// Native in-memory capability, not a boundary payload.
type Owner = McpSchema.McpHttpSessionOwner["Service"]

it.effect("bounds retained work and cancels only its attachment's requests", () =>
  Effect.gen(function* () {
    const attachment = yield* makeAttachmentOwner(Effect.succeed(true))
    const survivor = yield* makeAttachmentOwner(Effect.succeed(true))
    const cleaned = yield* Ref.make(0)
    for (let index = 0; index < MAX_ADAPTER_REQUESTS; index++) {
      const started = yield* Deferred.make<void>()
      yield* attachment
        .withWork({
          use: () => Deferred.succeed(started, undefined).pipe(Effect.andThen(Effect.never)),
          cleanup: () => Ref.update(cleaned, (count) => count + 1)
        })
        .pipe(Effect.exit, Effect.forkScoped)
      yield* Deferred.await(started)
    }
    expect(
      Exit.isFailure(
        yield* Effect.exit(
          attachment.withWork({
            use: () => Effect.die("Excess work must not dispatch"),
            cleanup: () => Effect.die("Unadmitted work owns no cleanup")
          })
        )
      )
    ).toBe(true)
    const survivorStarted = yield* Deferred.make<void>()
    const survivorFinish = yield* Deferred.make<void>()
    const survivorDone = yield* Deferred.make<void>()
    const request = yield* survivor
      .withWork({
        use: () => Deferred.succeed(survivorStarted, undefined).pipe(Effect.andThen(Deferred.await(survivorFinish))),
        cleanup: () => Deferred.succeed(survivorDone, undefined).pipe(Effect.asVoid)
      })
      .pipe(Effect.forkScoped)
    yield* Deferred.await(survivorStarted)
    yield* attachment.close
    expect(yield* Ref.get(cleaned)).toBe(MAX_ADAPTER_REQUESTS)
    expect(yield* Deferred.isDone(survivorDone)).toBe(false)
    yield* Deferred.succeed(survivorFinish, undefined)
    yield* Fiber.join(request)
    yield* survivor.close
  }).pipe(Effect.scoped)
)

it.effect("declines adoption after a reservation ends and rejects duplicate ownership", () =>
  Effect.gen(function* () {
    const attachment = yield* makeAttachmentOwner(Effect.succeed(true))
    const captured = yield* Deferred.make<Owner>()
    const releases = yield* Ref.make(0)
    const session = { id: "session", release: Ref.update(releases, (count) => count + 1).pipe(Effect.as(true)) }
    yield* attachment.withWork({
      use: (owner) =>
        Effect.gen(function* () {
          yield* Deferred.succeed(captured, owner)
          expect(yield* owner.adopt(session)).toBe(true)
          expect(yield* owner.adopt(session)).toBe(false)
          expect(yield* owner.adopt({ ...session, id: "another-initialization" })).toBe(false)
        }),
      cleanup: () => Effect.void
    })
    expect(yield* (yield* Deferred.await(captured)).adopt({ ...session, id: "late-session" })).toBe(false)
    yield* Effect.all([attachment.close, attachment.close], { concurrency: "unbounded" })
    yield* attachment.close
    expect(yield* Ref.get(releases)).toBe(1)
    expect(yield* attachment.ownsSession(session.id)).toBe(false)
  }).pipe(Effect.scoped)
)

it.effect("allows an already retained initialization to adopt during its cancellation cleanup", () =>
  Effect.gen(function* () {
    const attachment = yield* makeAttachmentOwner(Effect.succeed(true))
    const started = yield* Deferred.make<void>()
    const adopted = yield* Ref.make(false)
    const released = yield* Ref.make(false)
    const request = yield* attachment
      .withWork({
        use: () => Deferred.succeed(started, undefined).pipe(Effect.andThen(Effect.never)),
        cleanup: (owner) =>
          owner
            .adopt({ id: "initializing", release: Ref.set(released, true).pipe(Effect.as(true)) })
            .pipe(Effect.flatMap((accepted) => Ref.set(adopted, accepted)))
      })
      .pipe(Effect.exit, Effect.forkScoped)
    yield* Deferred.await(started)
    yield* attachment.close
    expect(Exit.isFailure(yield* Fiber.join(request))).toBe(true)
    expect(yield* Ref.get(adopted)).toBe(true)
    expect(yield* Ref.get(released)).toBe(true)
  }).pipe(Effect.scoped)
)

class CleanupUnavailable extends Schema.TaggedError<CleanupUnavailable>()("CleanupUnavailable", {}) {}

it.effect.each(["typed", "defect"])("keeps sessions and fences admission after %s cleanup failure", (mode) =>
  Effect.gen(function* () {
    const attachment = yield* makeAttachmentOwner(Effect.succeed(true))
    const released = yield* Ref.make(false)
    const failed = yield* Effect.exit(
      attachment.withWork({
        use: (owner) =>
          owner.adopt({ id: "unverified", release: Ref.set(released, true).pipe(Effect.as(true)) }).pipe(Effect.asVoid),
        cleanup: () =>
          mode === "typed" ? Effect.fail(new CleanupUnavailable({})) : Effect.die(new Error("Fixture cleanup defect"))
      })
    )
    expect(Exit.isFailure(failed)).toBe(true)
    const closed = yield* Effect.result(attachment.close)
    expect(closed._tag).toBe("Failure")
    expect(yield* Effect.result(attachment.close)).toEqual(closed)
    expect(yield* attachment.ownsSession("unverified")).toBe(true)
    expect(yield* Ref.get(released)).toBe(false)
    expect(
      Exit.isFailure(yield* Effect.exit(attachment.withWork({ use: () => Effect.void, cleanup: () => Effect.void })))
    ).toBe(true)
  }).pipe(Effect.scoped)
)

it.effect("bounds a close waiter without cancelling retained cleanup or reopening admission", () =>
  Effect.gen(function* () {
    const attachment = yield* makeAttachmentOwner(Effect.succeed(true))
    const started = yield* Deferred.make<void>()
    const cleaning = yield* Deferred.make<void>()
    const complete = yield* Deferred.make<void>()
    const released = yield* Ref.make(false)
    const request = yield* attachment
      .withWork({
        use: (owner) =>
          owner
            .adopt({ id: "held", release: Ref.set(released, true).pipe(Effect.as(true)) })
            .pipe(Effect.andThen(Deferred.succeed(started, undefined)), Effect.andThen(Effect.never)),
        cleanup: () => Deferred.succeed(cleaning, undefined).pipe(Effect.andThen(Deferred.await(complete)))
      })
      .pipe(Effect.exit, Effect.forkScoped)
    yield* Deferred.await(started)
    const waiting = yield* Effect.result(attachment.close.pipe(Effect.timeout("1 second"))).pipe(Effect.forkScoped)
    yield* Deferred.await(cleaning)
    yield* TestClock.adjust("1 second")
    try {
      expect((yield* Fiber.join(waiting))._tag).toBe("Failure")
      expect(yield* attachment.ownsSession("held")).toBe(true)
      expect(yield* Ref.get(released)).toBe(false)
      expect(
        Exit.isFailure(yield* Effect.exit(attachment.withWork({ use: () => Effect.void, cleanup: () => Effect.void })))
      ).toBe(true)
    } finally {
      yield* Deferred.succeed(complete, undefined)
    }
    yield* attachment.close
    yield* Fiber.join(request)
    expect(yield* Ref.get(released)).toBe(true)
  }).pipe(Effect.scoped)
)
