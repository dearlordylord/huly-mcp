import { describe, expect, it } from "vitest"
import { advanceAdmission } from "../../src/resident/admission-attempt-state.js"
import { advanceMember, type AdmissionAccess } from "../../src/resident/admission-member-state.js"
import { advanceLifetime } from "../../src/resident/admission-lifetime-state.js"
import {
  admissionInventory,
  admissionIsEligible,
  admissionLeaseDelay,
  lookupAdmissionMember,
  makeAdmissionIdentity,
  makeAdmissionsState
} from "../../src/resident/admissions-state.js"
import {
  admissionStatePolicy as policy,
  firstOwner,
  makeOwnedAdmission,
  type StateTestOwner
} from "./admission-state-fixture.js"

const IDLE_NANOS = 5_000_000_000n
const LEASE_NANOS = BigInt(policy.lease.durationMillis) * 1_000_000n

describe("pure admission ownership outcomes", () => {
  it("counts the same pending identity once without extending idle on duplicate start", () => {
    const id = makeAdmissionIdentity()
    const queued = advanceAdmission(
      makeAdmissionsState<StateTestOwner>(0n),
      { _tag: "Begin", id, now: 0n },
      policy
    ).state
    const duplicate = advanceAdmission(queued, { _tag: "Begin", id, now: 100n }, policy)
    expect(duplicate.decision._tag).toBe("Proceed")
    expect(admissionInventory(duplicate.state).pending).toBe(1)
    expect(duplicate.state).toEqual(queued)
  })

  it("keeps a closed owner's pending finalization separate from resource ownership", () => {
    const id = makeAdmissionIdentity()
    const owned = makeOwnedAdmission(makeAdmissionsState<StateTestOwner>(0n), id, "key")
    const fenced = advanceLifetime(owned, { _tag: "Fence" }).state
    const closed = advanceMember(fenced, { _tag: "Closed", id, now: 10n }).state
    expect(admissionInventory(closed)).toEqual({ pending: 1, members: [] })
    expect(admissionIsEligible(closed, id, 10n)).toBe(false)
    expect(admissionLeaseDelay(closed, id, 10n)).toBe(0n)
    const settled = advanceLifetime(closed, { _tag: "FinishAttempt", id, now: 20n }).state
    expect(admissionInventory(settled)).toEqual({ pending: 0, members: [] })
    expect(settled.accepting).toBe(false)
    expect(advanceMember(settled, { _tag: "Closed", id, now: 100n }).state).toEqual(settled)
    expect(advanceLifetime(settled, { _tag: "FinishAttempt", id, now: 100n }).state).toEqual(settled)
  })

  it("retains a late acquired owner even when the generation has already fenced", () => {
    const id = makeAdmissionIdentity()
    const begun = advanceAdmission(
      makeAdmissionsState<StateTestOwner>(0n),
      { _tag: "Begin", id, now: 0n },
      policy
    ).state
    const prepared = advanceAdmission(begun, { _tag: "PrepareOwner", id, key: "late", now: 0n }, policy).state
    expect(admissionIsEligible(prepared, id, 0n)).toBe(true)
    const fenced = advanceLifetime(prepared, { _tag: "Fence" }).state
    const published = advanceAdmission(fenced, { _tag: "PublishOwner", id, owner: firstOwner }, policy)
    expect(published.decision).toEqual({ _tag: "Close", id, owner: firstOwner })
    const blocked = advanceMember(published.state, { _tag: "CleanupBlocked", id }).state
    const finished = advanceLifetime(blocked, { _tag: "FinishAttempt", id, now: 1n }).state
    expect(admissionInventory(finished)).toEqual({ pending: 0, members: [{ id, owner: firstOwner, blocked: true }] })
    expect(admissionIsEligible(finished, id, 1n)).toBe(false)
  })

  it("never binds old eligibility or cleanup to a successor with the same digest", () => {
    const oldId = makeAdmissionIdentity()
    const old = makeOwnedAdmission(makeAdmissionsState<StateTestOwner>(0n), oldId, "reused")
    const finished = advanceLifetime(old, { _tag: "FinishAttempt", id: oldId, now: 0n }).state
    const closed = advanceMember(finished, { _tag: "Closed", id: oldId, now: 1n }).state
    const nextId = makeAdmissionIdentity()
    const successor = makeOwnedAdmission(closed, nextId, "reused", Object.freeze({ name: "next" }), 2n)
    expect(admissionIsEligible(successor, oldId, 2n)).toBe(false)
    expect(admissionIsEligible(successor, nextId, 2n)).toBe(true)
    for (const stale of [
      advanceMember(successor, { _tag: "CleanupBlocked", id: oldId }),
      advanceMember(successor, { _tag: "Closed", id: oldId, now: 100n }),
      advanceMember(successor, { _tag: "Retire", target: { _tag: "Identity", id: oldId } })
    ])
      expect(stale.state).toEqual(successor)
    expect(lookupAdmissionMember(successor, "reused")?.id).toBe(nextId)
  })

  it("requires the same owned identity, key, owner authority and strictly live lease for access", () => {
    const id = makeAdmissionIdentity()
    const owned = makeOwnedAdmission(makeAdmissionsState<StateTestOwner>(0n), id, "live")
    const access: AdmissionAccess = {
      _tag: "Access",
      id,
      key: "live",
      now: 0n,
      ownerAccepting: true,
      renew: true,
      durationMillis: policy.lease.durationMillis
    }

    expect(advanceMember(owned, { ...access, key: "wrong" }).decision._tag).toBe("Refuse")
    expect(advanceMember(owned, { ...access, ownerAccepting: false }).decision._tag).toBe("Refuse")
    expect(advanceMember(owned, { ...access, id: makeAdmissionIdentity() }).decision._tag).toBe("Refuse")
    expect(advanceMember(owned, { ...access, now: LEASE_NANOS }).decision._tag).toBe("Refuse")
    const renewed = advanceMember(owned, { ...access, now: 1n }).state
    expect(admissionLeaseDelay(renewed, id, LEASE_NANOS)).toBe(1n)
    const retired = advanceMember(renewed, { _tag: "Retire", target: { _tag: "Digest", key: "live" } }).state
    expect(advanceMember(retired, access).decision._tag).toBe("Refuse")
  })

  it("does not allocate on stale/colliding admission events or silently publish an untracked owner", () => {
    const empty = makeAdmissionsState<StateTestOwner>(0n)
    const id = makeAdmissionIdentity()
    expect(advanceAdmission(empty, { _tag: "CheckCapacity", id }, policy).decision._tag).toBe("Refuse")
    expect(advanceAdmission(empty, { _tag: "PrepareOwner", id, key: "missing", now: 0n }, policy).decision._tag).toBe(
      "Refuse"
    )
    expect(() => advanceAdmission(empty, { _tag: "PublishOwner", id, owner: firstOwner }, policy)).toThrow(
      "requires its acquiring admission identity"
    )
    expect(advanceMember(empty, { _tag: "Retire", target: { _tag: "Digest", key: "absent" } }).decision._tag).toBe(
      "Done"
    )
    const queued = advanceAdmission(empty, { _tag: "Begin", id, now: 0n }, policy).state
    expect(admissionIsEligible(queued, id, 0n)).toBe(false)
    expect(admissionLeaseDelay(queued, id, 0n)).toBe(0n)
    expect(advanceLifetime(queued, { _tag: "FinishAttempt", id, now: 1n }).state.entries.size).toBe(0)
    const prepared = advanceAdmission(queued, { _tag: "PrepareOwner", id, key: "pending", now: 0n }, policy).state
    expect(advanceLifetime(prepared, { _tag: "FinishAttempt", id, now: 1n }).state.entries.size).toBe(0)
  })

  it("waits for the full idle interval after confirmed removal and fences at exact equality", () => {
    const id = makeAdmissionIdentity()
    const owned = makeOwnedAdmission(makeAdmissionsState<StateTestOwner>(0n), id, "idle")
    const finished = advanceLifetime(owned, { _tag: "FinishAttempt", id, now: 0n }).state
    expect(advanceLifetime(finished, { _tag: "Idle", now: IDLE_NANOS }).decision._tag).toBe("Wait")
    const closed = advanceMember(finished, { _tag: "Closed", id, now: IDLE_NANOS }).state
    expect(advanceLifetime(closed, { _tag: "Idle", now: IDLE_NANOS * 2n - 1n }).decision).toEqual({
      _tag: "Wait",
      nanos: 1n
    })
    const elapsed = advanceLifetime(closed, { _tag: "Idle", now: IDLE_NANOS * 2n })
    expect(elapsed.decision._tag).toBe("Done")
    expect(elapsed.state.accepting).toBe(false)
  })
})
