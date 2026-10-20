import { createHash, randomBytes } from "node:crypto"
import { Clock, Duration, Effect, Exit, Redacted, Schedule, Schema, Scope, Semaphore } from "effect"
import { observeHttpAdmission } from "../mcp/http-admission-observations.js"

import { type AdmissionPolicy, AdmissionError, AttachmentAdmitted, AttachmentToken } from "./admission-contract.js"
import { advanceAdmission } from "./admission-attempt-state.js"
import { advanceMember } from "./admission-member-state.js"
import { advanceLifetime } from "./admission-lifetime-state.js"
import {
  admissionInventory,
  admissionIsEligible,
  admissionLeaseDelay,
  lookupAdmissionMember,
  makeAdmissionIdentity,
  makeAdmissionsState,
  type AttachmentDigest,
  type AdmissionIdentity,
  type AdmissionsState,
  type AdmissionTransition,
  type AdmissionProceed,
  type AdmissionRefusal
} from "./admissions-state.js"
import { makeAttachmentOwner } from "./attachment-owner.js"
import { makeResidentWorkStatus } from "./work-status.js"

const TOKEN_BYTES = 32
const DRAIN_POLL_MILLIS = 25
// Internal resource capability; transition state owns the sole inventory.
type AttachmentOwner = Effect.Success<ReturnType<typeof makeAttachmentOwner>>
const digest = (token: AttachmentToken): AttachmentDigest =>
  createHash("sha256").update(Redacted.value(token)).digest("hex")
const unknownAttachment = () =>
  new AdmissionError({ kind: "unknown", message: "Resident attachment is unavailable or expired" })
const generationClosing = () =>
  new AdmissionError({ kind: "closing", message: "Resident generation no longer admits attachments" })
const refusalError = (kind: AdmissionRefusal["kind"]) => {
  switch (kind) {
    case "unknown":
      return unknownAttachment()
    case "closing":
      return generationClosing()
    case "capacity":
      return new AdmissionError({ kind, message: "Resident attachment capacity reached" })
  }
}
const requireProceed = (decision: AdmissionProceed | AdmissionRefusal) =>
  decision._tag === "Refuse" ? Effect.fail(refusalError(decision.kind)) : Effect.void
const randomToken = Effect.sync(() => randomBytes(TOKEN_BYTES).toString("hex")).pipe(
  Effect.flatMap(Schema.decodeUnknownEffect(AttachmentToken)),
  Effect.mapError(unknownAttachment)
)

// Internal entropy/resource ports preserve deterministic tests without module replacement.
export const makeResidentAdmissions = Effect.fn("makeResidentAdmissions")(function* (
  policy: AdmissionPolicy,
  tokens: Effect.Effect<AttachmentToken, AdmissionError> = randomToken,
  createOwner: (eligible: Effect.Effect<boolean>) => ReturnType<typeof makeAttachmentOwner> = makeAttachmentOwner
) {
  const generationScope = yield* Effect.scope
  const admission = yield* Semaphore.make(1)
  let state = makeAdmissionsState<AttachmentOwner>(yield* Clock.monotonicTimeNanos)
  const update = <Decision>(
    run: (current: AdmissionsState<AttachmentOwner>) => AdmissionTransition<AttachmentOwner, Decision>
  ) => {
    const next = run(state)
    state = next.state
    return next.decision
  }
  const touch = Clock.clockWith((clock) =>
    Effect.sync(() =>
      update((current) => advanceLifetime(current, { _tag: "TouchIdle", now: clock.monotonicTimeNanosUnsafe() }))
    )
  )
  const fence = Effect.sync(() => {
    update((current) => advanceLifetime(current, { _tag: "Fence" }))
  })
  yield* Effect.addFinalizer(() => fence)
  const forget = (id: AdmissionIdentity) =>
    Clock.clockWith((clock) =>
      Effect.sync(() => {
        update((current) => advanceMember(current, { _tag: "Closed", id, now: clock.monotonicTimeNanosUnsafe() }))
      })
    )
  const closeOwned = (id: AdmissionIdentity, owner: AttachmentOwner) =>
    Effect.gen(function* () {
      update((current) => advanceMember(current, { _tag: "Retire", target: { _tag: "Identity", id } }))
      yield* owner.close.pipe(
        Effect.mapError(
          () => new AdmissionError({ kind: "cleanup", message: "Resident attachment cleanup is unverified" })
        ),
        Effect.timeoutOrElse({
          duration: policy.closeAllowanceMillis,
          orElse: () =>
            Effect.fail(new AdmissionError({ kind: "pending", message: "Resident attachment cleanup remains pending" }))
        }),
        Effect.tapError(() =>
          Effect.sync(() => {
            update((current) => advanceMember(current, { _tag: "CleanupBlocked", id }))
          })
        )
      )
      yield* forget(id)
    })
  const watch = (id: AdmissionIdentity, owner: AttachmentOwner) => {
    const expire = Effect.gen(function* () {
      const now = yield* Clock.monotonicTimeNanos
      const remaining = admissionLeaseDelay(state, id, now)
      if (remaining > 0n) {
        yield* Effect.sleep(Duration.nanos(remaining))
        return false
      }
      update((current) => advanceMember(current, { _tag: "Retire", target: { _tag: "Identity", id } }))
      yield* owner.close
      return true
    }).pipe(Effect.repeat({ until: (closed) => closed }))
    return Effect.exit(Effect.raceFirst(expire, owner.closed)).pipe(
      Effect.flatMap((exit) => (Exit.isSuccess(exit) ? forget(id) : Effect.void))
    )
  }
  const begin = Clock.clockWith((clock) =>
    Effect.suspend(() => {
      const id = makeAdmissionIdentity()
      const decision = update((current) =>
        advanceAdmission(current, { _tag: "Begin", id, now: clock.monotonicTimeNanosUnsafe() }, policy)
      )
      return requireProceed(decision).pipe(Effect.as(id))
    })
  )
  const admit = Effect.acquireUseRelease(
    begin,
    (id) =>
      admission.withPermits(1)(
        Effect.gen(function* () {
          yield* requireProceed(update((current) => advanceAdmission(current, { _tag: "CheckCapacity", id }, policy)))
          const token = yield* tokens
          const key = digest(token)
          yield* Clock.clockWith((clock) =>
            Effect.suspend(() =>
              requireProceed(
                update((current) =>
                  advanceAdmission(
                    current,
                    { _tag: "PrepareOwner", id, key, now: clock.monotonicTimeNanosUnsafe() },
                    policy
                  )
                )
              )
            )
          )
          const eligible = Clock.clockWith((clock) =>
            Effect.sync(() => admissionIsEligible(state, id, clock.monotonicTimeNanosUnsafe()))
          )
          const owner = yield* createOwner(eligible).pipe(Scope.provide(generationScope))
          const published = update((current) => advanceAdmission(current, { _tag: "PublishOwner", id, owner }, policy))
          if (published._tag === "Close") {
            yield* closeOwned(published.id, published.owner)
            return yield* generationClosing()
          }
          yield* watch(id, owner).pipe(Effect.forkIn(generationScope))
          return AttachmentAdmitted.make({ version: 1, token, lease: policy.lease })
        }).pipe(Effect.uninterruptible)
      ),
    (id) =>
      Clock.clockWith((clock) =>
        Effect.sync(() => {
          update((current) =>
            advanceLifetime(current, { _tag: "FinishAttempt", id, now: clock.monotonicTimeNanosUnsafe() })
          )
        })
      )
  )
  const access = (token: AttachmentToken, renew: boolean) =>
    Effect.gen(function* () {
      const key = digest(token)
      const member = lookupAdmissionMember(state, key)
      if (member === undefined) return yield* unknownAttachment()
      const ownerAccepting = yield* member.owner.accepting
      return yield* Clock.clockWith((clock) =>
        Effect.suspend(() => {
          const decision = update((current) =>
            advanceMember(current, {
              _tag: "Access",
              id: member.id,
              key,
              now: clock.monotonicTimeNanosUnsafe(),
              ownerAccepting,
              renew,
              durationMillis: policy.lease.durationMillis
            })
          )
          return decision._tag === "Refuse" ? Effect.fail(unknownAttachment()) : Effect.succeed(decision.owner)
        })
      )
    })
  const find = (token: AttachmentToken) => access(token, false)
  const renew = (token: AttachmentToken) => access(token, true).pipe(Effect.asVoid)
  const release = Effect.fn("ResidentAdmissions.release")(function* (token: AttachmentToken) {
    const retired = update((current) =>
      advanceMember(current, { _tag: "Retire", target: { _tag: "Digest", key: digest(token) } })
    )
    if (retired._tag === "Close") yield* closeOwned(retired.id, retired.owner)
  })
  const drain = Effect.gen(function* () {
    yield* fence
    const view = admissionInventory(state)
    observeHttpAdmission("ResidentAdmissions_drainStarted", {
      attachments: view.members.length,
      pendingAdmissions: view.pending
    })
    yield* Effect.sync(() => admissionInventory(state).pending === 0).pipe(
      Effect.repeat({ until: (settled) => settled, schedule: Schedule.spaced(DRAIN_POLL_MILLIS) })
    )
    yield* Effect.forEach(admissionInventory(state).members, ({ id, owner }) => closeOwned(id, owner), {
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
    }),
    Effect.tapError(() =>
      Effect.sync(() => {
        update((current) => advanceLifetime(current, { _tag: "DrainFailed" }))
      })
    )
  )
  const awaitIdleAndFence = Effect.gen(function* () {
    yield* touch
    while (true) {
      const decision = yield* Clock.clockWith((clock) =>
        Effect.sync(() =>
          update((current) => advanceLifetime(current, { _tag: "Idle", now: clock.monotonicTimeNanosUnsafe() }))
        )
      )
      if (decision._tag === "Done") return
      yield* Effect.sleep(Duration.nanos(decision.nanos))
    }
  })
  const status = Effect.gen(function* () {
    const owners = yield* Effect.forEach(admissionInventory(state).members, ({ blocked, owner }) =>
      owner.status.pipe(Effect.map((observation) => ({ ...observation, blocked })))
    )
    return makeResidentWorkStatus({
      accepting: state.accepting,
      pending: admissionInventory(state).pending,
      drainFailed: state.drainFailed,
      owners
    })
  })
  return { admit, find, renew, release, fence, drain, awaitIdleAndFence, status, leasePolicy: policy.lease }
})
