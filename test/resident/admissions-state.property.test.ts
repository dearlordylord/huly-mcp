import * as fc from "fast-check"
import { expect, it } from "vitest"
import { advanceAdmission } from "../../src/resident/admission-attempt-state.js"
import { advanceMember } from "../../src/resident/admission-member-state.js"
import { advanceLifetime } from "../../src/resident/admission-lifetime-state.js"
import {
  admissionInventory,
  admissionIsEligible,
  makeAdmissionIdentity,
  makeAdmissionsState,
  type AdmissionsState,
  type AdmissionIdentity
} from "../../src/resident/admissions-state.js"
import { propertyTestParameters } from "../helpers/property.js"
import { admissionStatePolicy as policy, makeOwnedAdmission, type StateTestOwner } from "./admission-state-fixture.js"

const names = fc.constantFrom("left", "right")
const IDLE_NANOS = 5_000_000_000n
const freezeState = (state: AdmissionsState<StateTestOwner>) => {
  for (const entry of state.entries.values()) {
    if ("lease" in entry) Object.freeze(entry.lease)
    Object.freeze(entry)
  }
  Object.freeze(state)
  return [...state.entries]
}

it("settles exact pending identities once, without negative counts or extending idle on duplicates", () => {
  fc.assert(
    fc.property(fc.array(names, { maxLength: 80 }), (history) => {
      const ids = { left: makeAdmissionIdentity(), right: makeAdmissionIdentity() }
      let state = makeAdmissionsState<StateTestOwner>(0n)
      for (const id of Object.values(ids)) state = advanceAdmission(state, { _tag: "Begin", id, now: 0n }, policy).state
      const pending = new Set(Object.values(ids))
      for (const [index, name] of history.entries()) {
        const id = ids[name]
        const before = state
        const entries = freezeState(before)
        state = advanceLifetime(state, { _tag: "FinishAttempt", id, now: BigInt(index + 1) }).state
        pending.delete(id)
        expect(admissionInventory(state).pending).toBe(pending.size)
        expect([...before.entries]).toEqual(entries)
        expect(advanceLifetime(state, { _tag: "FinishAttempt", id, now: BigInt(index + 2) }).state).toEqual(state)
      }
    }),
    propertyTestParameters
  )
})

it("never drops owned capabilities without confirmed closure or restores fenced/retired authority", () => {
  const actions = fc.tuple(names, fc.constantFrom("fence", "retire", "closeFailed", "closed", "settle"))
  fc.assert(
    fc.property(fc.array(actions, { maxLength: 80 }), (history) => {
      const ids = { left: makeAdmissionIdentity(), right: makeAdmissionIdentity() }
      let state = makeAdmissionsState<StateTestOwner>(0n)
      for (const [name, id] of Object.entries(ids)) state = makeOwnedAdmission(state, id, name, Object.freeze({ name }))
      const retained = new Set<AdmissionIdentity>(Object.values(ids))
      const revoked = new Set<AdmissionIdentity>()
      let fenced = false
      for (const [index, [name, action]] of history.entries()) {
        const id = ids[name]
        const now = BigInt(index + 1)
        const before = state
        const entries = freezeState(before)
        switch (action) {
          case "fence":
            state = advanceLifetime(state, { _tag: "Fence" }).state
            fenced = true
            break
          case "retire":
            state = advanceMember(state, { _tag: "Retire", target: { _tag: "Identity", id } }).state
            revoked.add(id)
            break
          case "closeFailed":
            state = advanceMember(state, { _tag: "Retire", target: { _tag: "Identity", id } }).state
            state = advanceMember(state, { _tag: "CleanupBlocked", id }).state
            revoked.add(id)
            break
          case "closed":
            state = advanceMember(state, { _tag: "Closed", id, now }).state
            retained.delete(id)
            revoked.add(id)
            break
          case "settle":
            state = advanceLifetime(state, { _tag: "FinishAttempt", id, now }).state
            break
        }
        expect(new Set(admissionInventory(state).members.map((member) => member.id))).toEqual(retained)
        expect([...before.entries]).toEqual(entries)
        for (const identity of Object.values(ids)) {
          if (fenced || revoked.has(identity)) expect(admissionIsEligible(state, identity, now)).toBe(false)
        }
        if (fenced) expect(state.accepting).toBe(false)
      }
    }),
    propertyTestParameters
  )
})

it("makes idle decisions independent of the monotonic clock's origin", () => {
  fc.assert(
    fc.property(
      fc.bigInt({ min: 0n, max: 1_000_000_000_000n }),
      fc.bigInt({ min: 0n, max: IDLE_NANOS * 2n }),
      (origin, elapsed) => {
        const zero = advanceLifetime(makeAdmissionsState<StateTestOwner>(0n), { _tag: "Idle", now: elapsed })
        const shifted = advanceLifetime(makeAdmissionsState<StateTestOwner>(origin), {
          _tag: "Idle",
          now: origin + elapsed
        })
        expect(shifted.decision).toEqual(zero.decision)
        expect(shifted.state.accepting).toBe(zero.state.accepting)
      }
    ),
    propertyTestParameters
  )
})

it("rejects renewal at and after exact expiry regardless of the lease clock origin", () => {
  fc.assert(
    fc.property(
      fc.bigInt({ min: 0n, max: 1_000_000_000_000n }),
      fc.bigInt({ min: 0n, max: IDLE_NANOS }),
      (origin, late) => {
        const id = makeAdmissionIdentity()
        const state = makeOwnedAdmission(
          makeAdmissionsState<StateTestOwner>(origin),
          id,
          "expiry",
          Object.freeze({ name: "expiry" }),
          origin
        )
        const now = origin + BigInt(policy.lease.durationMillis) * 1_000_000n + late
        const next = advanceMember(state, {
          _tag: "Access",
          id,
          key: "expiry",
          now,
          ownerAccepting: true,
          renew: true,
          durationMillis: policy.lease.durationMillis
        })
        expect(next.decision._tag).toBe("Refuse")
        expect(admissionIsEligible(next.state, id, now)).toBe(false)
      }
    ),
    propertyTestParameters
  )
})
