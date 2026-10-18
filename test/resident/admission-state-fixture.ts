import { Schema } from "effect"
import { expect } from "vitest"
import { AdmissionPolicy, DEFAULT_LEASE_POLICY } from "../../src/resident/admission-contract.js"
import { advanceAdmission } from "../../src/resident/admission-attempt-state.js"
import type { AdmissionIdentity, AdmissionsState, AttachmentDigest } from "../../src/resident/admissions-state.js"

export const admissionStatePolicy = Schema.decodeUnknownSync(AdmissionPolicy)({
  capacity: 2,
  closeAllowanceMillis: 1_000,
  lease: DEFAULT_LEASE_POLICY
})
// Opaque internal capability stand-in: the pure core must never invoke its owner.
export interface StateTestOwner {
  readonly name: string
}
export const firstOwner: StateTestOwner = Object.freeze({ name: "first" })
export const makeOwnedAdmission = (
  state: AdmissionsState<StateTestOwner>,
  id: AdmissionIdentity,
  key: AttachmentDigest,
  owner: StateTestOwner = firstOwner,
  now = 0n
): AdmissionsState<StateTestOwner> => {
  const begun = advanceAdmission(state, { _tag: "Begin", id, now }, admissionStatePolicy)
  expect(begun.decision._tag).toBe("Proceed")
  const checked = advanceAdmission(begun.state, { _tag: "CheckCapacity", id }, admissionStatePolicy)
  expect(checked.decision._tag).toBe("Proceed")
  const prepared = advanceAdmission(checked.state, { _tag: "PrepareOwner", id, key, now }, admissionStatePolicy)
  expect(prepared.decision._tag).toBe("Proceed")
  return advanceAdmission(prepared.state, { _tag: "PublishOwner", id, owner }, admissionStatePolicy).state
}
