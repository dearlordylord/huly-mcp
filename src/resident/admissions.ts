import { createHash, randomBytes } from "node:crypto"
import { Clock, Duration, Effect, Exit, Redacted, Schema, Scope, Semaphore } from "effect"

import { type AdmissionPolicy, AdmissionError, AttachmentAdmitted, AttachmentToken } from "./admission-contract.js"
import {
  leaseIsEligible,
  leaseWaitNanos,
  makeAttachmentLease,
  type AttachmentLease,
  type MonotonicNanos
} from "./attachment-lease.js"
import { makeAttachmentOwner } from "./attachment-owner.js"

const TOKEN_BYTES = 32
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
const randomToken = Effect.sync(() => randomBytes(TOKEN_BYTES).toString("hex")).pipe(
  Effect.flatMap(Schema.decodeUnknownEffect(AttachmentToken)),
  Effect.mapError(unknownAttachment)
)

// Internal entropy port permits deterministic collision tests without replacing node:crypto.
export const makeResidentAdmissions = Effect.fn("makeResidentAdmissions")(function* (
  policy: AdmissionPolicy,
  tokens: Effect.Effect<AttachmentToken, AdmissionError> = randomToken
) {
  const generationScope = yield* Effect.scope
  const members = new Map<AttachmentDigest, Member>()
  const admission = yield* Semaphore.make(1)
  const forget = (key: AttachmentDigest, member: Member) =>
    Effect.sync(() => {
      if (members.get(key) === member) members.delete(key)
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

  const admit = admission.withPermits(1)(
    Effect.gen(function* () {
      if (members.size >= policy.capacity)
        return yield* new AdmissionError({ kind: "capacity", message: "Resident attachment capacity reached" })
      const token = yield* tokens
      const key = digest(token)
      if (members.has(key)) return yield* unknownAttachment()
      const authority = { lease: makeAttachmentLease(yield* Clock.monotonicTimeNanos, policy.lease.durationMillis) }
      const eligible = Clock.clockWith((clock) =>
        Effect.sync(() => leaseIsEligible(authority.lease, clock.monotonicTimeNanosUnsafe()))
      )
      const owner = yield* makeAttachmentOwner(eligible).pipe(Scope.provide(generationScope))
      const member: Member = { owner, authority }
      members.set(key, member)
      yield* watch(key, member).pipe(Effect.forkIn(generationScope))
      return AttachmentAdmitted.make({ version: 1, token, lease: policy.lease })
    }).pipe(Effect.uninterruptible)
  )

  const withLiveMember = <A>(token: AttachmentToken, use: (member: Member, now: MonotonicNanos) => A) =>
    Effect.gen(function* () {
      const member = members.get(digest(token))
      if (member === undefined) return yield* unknownAttachment()
      const accepting = yield* member.owner.accepting
      return yield* Clock.clockWith((clock) =>
        Effect.suspend(() => {
          const now = clock.monotonicTimeNanosUnsafe()
          return accepting && leaseIsEligible(member.authority.lease, now)
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
    if (member === undefined) return
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

  return { admit, find, renew, release }
})
