import { createHash, randomBytes } from "node:crypto"
import { Clock, Duration, Effect, Exit, Redacted, Schedule, Schema, Scope, Semaphore } from "effect"

import { type AdmissionPolicy, AdmissionError, AttachmentAdmitted, AttachmentToken } from "./admission-contract.js"
import {
  leaseIsEligible,
  leaseWaitNanos,
  makeAttachmentLease,
  type AttachmentLease,
  type MonotonicNanos
} from "./attachment-lease.js"
import { MANAGED_IDLE_MILLIS } from "./managed-contract.js"
import { makeAttachmentOwner } from "./attachment-owner.js"

const TOKEN_BYTES = 32
const DRAIN_POLL_MILLIS = 25
// Internal resource inventory; raw secrets stay in the channel adapter.
type AttachmentDigest = string
type AttachmentOwner = Effect.Success<ReturnType<typeof makeAttachmentOwner>>
interface Member {
  readonly owner: AttachmentOwner
  readonly authority: { lease: AttachmentLease }
}
const digest = (token: AttachmentToken): AttachmentDigest =>
  createHash("sha256").update(Redacted.value(token)).digest("hex")
const unknownAttachment = () =>
  new AdmissionError({ kind: "unknown", message: "Resident attachment is unavailable or expired" })
const generationClosing = () =>
  new AdmissionError({ kind: "closing", message: "Resident generation no longer admits attachments" })
const randomToken = Effect.sync(() => randomBytes(TOKEN_BYTES).toString("hex")).pipe(
  Effect.flatMap(Schema.decodeUnknownEffect(AttachmentToken)),
  Effect.mapError(unknownAttachment)
)

// Internal entropy port permits deterministic collision tests without replacing node:crypto.
export const makeResidentAdmissions = Effect.fn("makeResidentAdmissions")(function* (
  policy: AdmissionPolicy,
  tokens: Effect.Effect<AttachmentToken, AdmissionError> = randomToken,
  createOwner: (eligible: Effect.Effect<boolean>) => ReturnType<typeof makeAttachmentOwner> = makeAttachmentOwner
) {
  const generationScope = yield* Effect.scope
  const members = new Map<AttachmentDigest, Member>()
  const admission = yield* Semaphore.make(1)
  let accepting = true
  let pending = 0
  let idleSince = yield* Clock.monotonicTimeNanos
  const touch = Clock.clockWith((clock) =>
    Effect.sync(() => {
      idleSince = clock.monotonicTimeNanosUnsafe()
    })
  )
  const fence = Effect.sync(() => {
    accepting = false
  })
  const requireAccepting = Effect.suspend(() => (accepting ? Effect.void : Effect.fail(generationClosing())))
  yield* Effect.addFinalizer(() => fence)
  const forget = (key: AttachmentDigest, member: Member) =>
    Clock.clockWith((clock) =>
      Effect.sync(() => {
        if (members.get(key) !== member) return
        members.delete(key)
        idleSince = clock.monotonicTimeNanosUnsafe()
      })
    )

  const closeMember = (key: AttachmentDigest, member: Member) =>
    Effect.gen(function* () {
      member.authority.lease = { _tag: "Retired" }
      yield* member.owner.close.pipe(
        Effect.mapError(
          () => new AdmissionError({ kind: "cleanup", message: "Resident attachment cleanup is unverified" })
        ),
        Effect.timeoutOrElse({
          duration: policy.closeAllowanceMillis,
          orElse: () =>
            Effect.fail(new AdmissionError({ kind: "pending", message: "Resident attachment cleanup remains pending" }))
        })
      )
      yield* forget(key, member)
    })

  const watch = (key: AttachmentDigest, member: Member) => {
    const expire = Effect.gen(function* () {
      const now = yield* Clock.monotonicTimeNanos
      const remaining = leaseWaitNanos(member.authority.lease, now)
      if (remaining > 0n) {
        yield* Effect.sleep(Duration.nanos(remaining))
        return false
      }
      member.authority.lease = { _tag: "Retired" }
      yield* member.owner.close
      return true
    }).pipe(Effect.repeat({ until: (closed) => closed }))
    return Effect.exit(Effect.raceFirst(expire, member.owner.closed)).pipe(
      Effect.flatMap((exit) => (Exit.isSuccess(exit) ? forget(key, member) : Effect.void))
    )
  }

  const admit = Effect.andThen(
    requireAccepting,
    Effect.acquireUseRelease(
      Effect.sync(() => {
        pending++
      }).pipe(Effect.andThen(touch)),
      () =>
        admission.withPermits(1)(
          Effect.gen(function* () {
            yield* requireAccepting
            if (members.size >= policy.capacity)
              return yield* new AdmissionError({ kind: "capacity", message: "Resident attachment capacity reached" })
            const token = yield* tokens
            yield* requireAccepting
            const key = digest(token)
            if (members.has(key)) return yield* unknownAttachment()
            const authority = {
              lease: makeAttachmentLease(yield* Clock.monotonicTimeNanos, policy.lease.durationMillis)
            }
            const eligible = Clock.clockWith((clock) =>
              Effect.sync(() => accepting && leaseIsEligible(authority.lease, clock.monotonicTimeNanosUnsafe()))
            )
            const owner = yield* createOwner(eligible).pipe(Scope.provide(generationScope))
            const member: Member = { owner, authority }
            members.set(key, member)
            if (!accepting) {
              yield* closeMember(key, member)
              return yield* generationClosing()
            }
            yield* watch(key, member).pipe(Effect.forkIn(generationScope))
            return AttachmentAdmitted.make({ version: 1, token, lease: policy.lease })
          }).pipe(Effect.uninterruptible)
        ),
      () =>
        Effect.sync(() => {
          pending--
        }).pipe(Effect.andThen(touch))
    )
  )

  const withLiveMember = <A>(token: AttachmentToken, use: (member: Member, now: MonotonicNanos) => A) =>
    Effect.gen(function* () {
      const member = members.get(digest(token))
      if (member === undefined) return yield* unknownAttachment()
      const ownerAccepting = yield* member.owner.accepting
      return yield* Clock.clockWith((clock) =>
        Effect.suspend(() => {
          const now = clock.monotonicTimeNanosUnsafe()
          return accepting && ownerAccepting && leaseIsEligible(member.authority.lease, now)
            ? Effect.succeed(use(member, now))
            : Effect.fail(unknownAttachment())
        })
      )
    })

  const find = (token: AttachmentToken) => withLiveMember(token, (member) => member.owner)
  const renew = (token: AttachmentToken) =>
    withLiveMember(token, (member, now) => {
      member.authority.lease = makeAttachmentLease(now, policy.lease.durationMillis)
    })
  const release = Effect.fn("ResidentAdmissions.release")(function* (token: AttachmentToken) {
    const key = digest(token)
    const member = members.get(key)
    if (member !== undefined) yield* closeMember(key, member)
  })
  const drain = Effect.gen(function* () {
    yield* fence
    yield* Effect.sync(() => pending === 0).pipe(
      Effect.repeat({ until: (settled) => settled, schedule: Schedule.spaced(DRAIN_POLL_MILLIS) })
    )
    yield* Effect.forEach([...members], ([key, member]) => closeMember(key, member), {
      concurrency: "unbounded",
      discard: true
    })
  }).pipe(
    Effect.timeoutOrElse({
      duration: policy.closeAllowanceMillis,
      orElse: () =>
        Effect.fail(
          new AdmissionError({
            kind: "pending",
            message: "Resident generation cleanup remains pending; replacement is blocked"
          })
        )
    })
  )

  const awaitIdleAndFence = Effect.gen(function* () {
    yield* touch
    const idleNanos = BigInt(MANAGED_IDLE_MILLIS) * 1_000_000n
    const pollNanos = 250_000_000n
    while (true) {
      const remaining = yield* Clock.clockWith((clock) =>
        Effect.sync(() => {
          if (!accepting) return 0n
          if (members.size > 0 || pending > 0) return pollNanos
          const wait = idleSince + idleNanos - clock.monotonicTimeNanosUnsafe()
          if (wait <= 0n) {
            accepting = false
            return 0n
          }
          return wait < pollNanos ? wait : pollNanos
        })
      )
      if (remaining === 0n) return
      yield* Effect.sleep(Duration.nanos(remaining))
    }
  })

  return { admit, find, renew, release, fence, drain, awaitIdleAndFence }
})
