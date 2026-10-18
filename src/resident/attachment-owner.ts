import { Deferred, Effect, Exit, Fiber, Schema } from "effect"
import type { McpSchema } from "effect/ai"

import { RequestWorkRejected } from "../runtime/request-work.js"
import { MAX_ADAPTER_REQUESTS } from "./adapter-limits.js"

export class AttachmentCleanupFailed extends Schema.TaggedError<AttachmentCleanupFailed>()("AttachmentCleanupFailed", {
  message: Schema.String
}) {}

// Internal resource capabilities: native sessions and work tickets are never serialized.
type SessionOwner = McpSchema.McpHttpSessionOwner["Service"]
type Session = Parameters<SessionOwner["adopt"]>[0]
interface Work {
  readonly cancel: Deferred.Deferred<void>
  readonly done: Deferred.Deferred<void, AttachmentCleanupFailed>
  status: "running" | "blocked"
}

/** One admitted adapter. The caller must put the entire request cleanup inside withWork. */
export const makeAttachmentOwner = Effect.fn("makeAttachmentOwner")(function* (eligible: Effect.Effect<boolean>) {
  const work = new Set<Work>()
  const sessions = new Map<string, Session>()
  let accepting = true

  const acquire = Effect.gen(function* () {
    const ticket: Work = {
      cancel: yield* Deferred.make<void>(),
      done: yield* Deferred.make<void, AttachmentCleanupFailed>(),
      status: "running"
    }
    const eligibility = yield* eligible
    if (!accepting || !eligibility)
      return yield* new RequestWorkRejected({ message: "Resident attachment no longer accepts work" })
    if (work.size >= MAX_ADAPTER_REQUESTS)
      return yield* new RequestWorkRejected({ message: "Resident attachment reached its retained work limit" })
    work.add(ticket)
    return ticket
  })

  const finish = <E>(ticket: Work, exit: Exit.Exit<void, E>) =>
    Effect.gen(function* () {
      if (Exit.isFailure(exit)) {
        ticket.status = "blocked"
        accepting = false
        yield* Deferred.fail(
          ticket.done,
          new AttachmentCleanupFailed({ message: "Resident work cleanup is unverified" })
        )
        return yield* Effect.failCause(exit.cause)
      } else {
        work.delete(ticket)
        yield* Deferred.succeed(ticket.done, undefined)
      }
    })

  const sessionOwner = (ticket: Work): SessionOwner => ({
    adopt: (session) =>
      Effect.sync(() => {
        if (!work.has(ticket) || ticket.status !== "running" || sessions.size > 0) return false
        sessions.set(session.id, session)
        return true
      })
  })

  const withWork = <A, E, R, CleanupError, CleanupServices>(options: {
    readonly use: (owner: SessionOwner) => Effect.Effect<A, E, R>
    readonly cleanup: (owner: SessionOwner) => Effect.Effect<void, CleanupError, CleanupServices>
  }) =>
    Effect.acquireUseRelease(
      acquire,
      (ticket) =>
        Effect.raceFirst(
          Effect.suspend(() => options.use(sessionOwner(ticket))),
          Deferred.await(ticket.cancel).pipe(Effect.andThen(Effect.interrupt))
        ),
      (ticket) =>
        Effect.exit(Effect.suspend(() => options.cleanup(sessionOwner(ticket)))).pipe(
          Effect.flatMap((exit) => finish(ticket, exit))
        )
    )

  const closing = yield* Deferred.make<void>()
  const drain = yield* Effect.gen(function* () {
    yield* Deferred.await(closing)
    const retained = [...work]
    yield* Effect.forEach(retained, (ticket) => Deferred.succeed(ticket.cancel, undefined), { discard: true })
    yield* Effect.forEach(retained, (ticket) => Deferred.await(ticket.done), { discard: true })
    for (const session of sessions.values()) yield* session.release
    sessions.clear()
  }).pipe(Effect.forkScoped)

  // Joining is interruptible; timing out a caller does not cancel the generation's drain.
  const close = Effect.sync(() => {
    accepting = false
  }).pipe(
    Effect.andThen(Deferred.succeed(closing, undefined)),
    Effect.uninterruptible,
    Effect.andThen(Fiber.join(drain))
  )

  return {
    withWork,
    close,
    closed: Fiber.join(drain),
    accepting: Effect.sync(() => accepting),
    status: Effect.sync(() => ({
      retainedRequests: work.size,
      blockedRequests: [...work].filter((ticket) => ticket.status === "blocked").length,
      closing: !accepting
    })),
    ownsSession: (id: string) => Effect.sync(() => sessions.has(id))
  }
})
