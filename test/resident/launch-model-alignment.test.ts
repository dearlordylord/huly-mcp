import { Schema } from "effect"
import { expect, it } from "vitest"

import { AdmissionPolicy, DEFAULT_LEASE_POLICY } from "../../src/resident/admission-contract.js"
import { advanceAdmission } from "../../src/resident/admission-attempt-state.js"
import { advanceLifetime } from "../../src/resident/admission-lifetime-state.js"
import { advanceMember } from "../../src/resident/admission-member-state.js"
import {
  admissionInventory,
  makeAdmissionIdentity,
  makeAdmissionsState,
  type AdmissionsState
} from "../../src/resident/admissions-state.js"
import {
  type AdmissionObservation,
  replayResidentAdmissions,
  ResidentObservationRejected
} from "../helpers/resident-launch-replay.js"

const policy = Schema.decodeUnknownSync(AdmissionPolicy)({
  capacity: 2,
  closeAllowanceMillis: 5_000,
  lease: DEFAULT_LEASE_POLICY
})
const now = 0n
const observe = (state: AdmissionsState<string>, event: AdmissionObservation["event"], allowed: boolean) => {
  const view = admissionInventory(state)
  return { event, allowed, pending: view.pending, members: view.members.length, accepting: state.accepting }
}
const actualAdmission = (late: boolean): ReadonlyArray<AdmissionObservation> => {
  const id = makeAdmissionIdentity()
  const observations: Array<AdmissionObservation> = []
  let state = makeAdmissionsState<string>(now)
  const begun = advanceAdmission(state, { _tag: "Begin", id, now }, policy)
  state = begun.state
  observations.push(observe(state, "Begin", begun.decision._tag === "Proceed"))
  state = advanceAdmission(state, { _tag: "PrepareOwner", id, key: "fixture-owner", now }, policy).state
  if (late) {
    state = advanceLifetime(state, { _tag: "Fence" }).state
    observations.push(observe(state, "Fence", true))
  }
  const published = advanceAdmission(state, { _tag: "PublishOwner", id, owner: "actual-owner" }, policy)
  state = published.state
  if (late) observations.push(observe(state, "LateOwner", published.decision._tag === "Close"))
  else {
    state = advanceLifetime(state, { _tag: "FinishAttempt", id, now }).state
    observations.push(observe(state, "Finish", published.decision._tag === "Proceed"))
    state = advanceLifetime(state, { _tag: "Fence" }).state
    observations.push(observe(state, "Fence", true))
    const retiring = advanceMember(state, { _tag: "Retire", target: { _tag: "Identity", id } })
    state = retiring.state
    observations.push(observe(state, "LateOwner", retiring.decision._tag === "Close"))
  }
  state = advanceMember(state, { _tag: "Closed", id, now }).state
  state = advanceLifetime(state, { _tag: "FinishAttempt", id, now }).state
  observations.push(observe(state, "Closed", true))
  return observations
}

it.each([false, true])("replays actual admission inventory through owner cleanup (late=%s)", async (late) => {
  await replayResidentAdmissions(actualAdmission(late))
})
it("rejects a contradictory inventory observation from the same real transition trace", async () => {
  const contradictory = actualAdmission(true).map((observation) =>
    observation.event === "LateOwner" ? { ...observation, members: 0 } : observation
  )
  await expect(replayResidentAdmissions(contradictory)).rejects.toBeInstanceOf(ResidentObservationRejected)
})
