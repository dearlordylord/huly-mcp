import { expect, it } from "vitest"

import { advanceCandidateSelection, type CandidateSelection } from "../../src/resident/candidate-selection-state.js"
import { advancePublication, makePublicationState, publicationIsReady } from "../../src/resident/publication-state.js"

it("chooses an existing candidate before capacity and refuses every second match", () => {
  const empty: CandidateSelection<object> = { _tag: "Empty" }
  expect(advanceCandidateSelection(empty, { _tag: "Completed", recordCount: 2, capacity: 2 })._tag).toBe("Capacity")
  expect(advanceCandidateSelection(empty, { _tag: "Completed", recordCount: 1, capacity: 2 })._tag).toBe("Absent")
  const candidate = Object.freeze({ name: "owned exchange" })
  const selected = advanceCandidateSelection(empty, { _tag: "Matched", candidate })
  expect(selected._tag).toBe("Continue")
  if (selected._tag !== "Continue") throw new Error("First candidate must be retained")
  expect(advanceCandidateSelection(selected.state, { _tag: "Matched", candidate })._tag).toBe("Duplicate")
  expect(advanceCandidateSelection(selected.state, { _tag: "Completed", recordCount: 2, capacity: 2 })).toEqual({
    _tag: "Existing",
    candidate
  })
  expect(empty).toEqual({ _tag: "Empty" })
})

it("consumes readiness before directory refusal and never permits another attempt", () => {
  const original = makePublicationState<object>()
  const refused = advancePublication(original, { _tag: "Begin", sameDirectory: false })
  expect(refused.decision._tag).toBe("RefuseDirectory")
  expect(advancePublication(refused.state, { _tag: "Begin", sameDirectory: true }).decision._tag).toBe("RefuseAttempt")
  expect(publicationIsReady(refused.state)).toBe(false)
  expect(original.attempt._tag).toBe("Unattempted")
})

it("records a late receipt after fencing and authorizes only one post-join retirement", () => {
  const receipt = Object.freeze({ name: "exact retire capability" })
  const started = advancePublication(makePublicationState<typeof receipt>(), { _tag: "Begin", sameDirectory: true })
  expect(started.decision._tag).toBe("Done")
  const fenced = advancePublication(started.state, { _tag: "Fence", outcome: "interrupts-only" })
  expect(advancePublication(fenced.state, { _tag: "Begin", sameDirectory: true }).decision._tag).toBe("RefuseAttempt")
  const recorded = advancePublication(fenced.state, { _tag: "Recorded", receipt })
  expect(publicationIsReady(recorded.state)).toBe(true)
  const repeatedFence = advancePublication(recorded.state, { _tag: "Fence", outcome: "failure" })
  expect(repeatedFence.state).toBe(recorded.state)
  const settled = advancePublication(repeatedFence.state, { _tag: "Settled" })
  expect(settled.decision).toEqual({ _tag: "Retire", receipt })
  expect(advancePublication(settled.state, { _tag: "Settled" }).decision._tag).toBe("Retain")
  expect(advancePublication(settled.state, { _tag: "Fence", outcome: "success" }).state).toBe(settled.state)
  expect(() => advancePublication(settled.state, { _tag: "Recorded", receipt })).toThrow()
  expect(fenced.state.attempt._tag).toBe("Attempted")
})

it("retains the receipt after shutdown failure and keeps unpublished settlement harmless", () => {
  const receipt = { name: "retained" }
  const started = advancePublication(makePublicationState<typeof receipt>(), { _tag: "Begin", sameDirectory: true })
  const recorded = advancePublication(started.state, { _tag: "Recorded", receipt })
  const fenced = advancePublication(recorded.state, { _tag: "Fence", outcome: "failure" })
  const settled = advancePublication(fenced.state, { _tag: "Settled" })
  expect(settled.decision._tag).toBe("Retain")
  expect(settled.state.attempt).toEqual({ _tag: "Recorded", receipt })
  const unpublished = advancePublication(makePublicationState<object>(), { _tag: "Fence", outcome: "success" })
  expect(advancePublication(unpublished.state, { _tag: "Settled" }).decision._tag).toBe("Retain")
  expect(advancePublication(unpublished.state, { _tag: "Begin", sameDirectory: false }).decision._tag).toBe(
    "RefuseAttempt"
  )
})

it("treats out-of-order receipt transfer and settlement as defects without discarding evidence", () => {
  const state = makePublicationState<object>()
  expect(() => advancePublication(state, { _tag: "Recorded", receipt: {} })).toThrow()
  expect(() => advancePublication(state, { _tag: "Settled" })).toThrow()
  const started = advancePublication(state, { _tag: "Begin", sameDirectory: true })
  const recorded = advancePublication(started.state, { _tag: "Recorded", receipt: {} })
  expect(() => advancePublication(recorded.state, { _tag: "Recorded", receipt: {} })).toThrow()
  const unfinished = advancePublication(started.state, { _tag: "Fence", outcome: "success" })
  const settled = advancePublication(unfinished.state, { _tag: "Settled" })
  expect(() => advancePublication(settled.state, { _tag: "Recorded", receipt: {} })).toThrow()
  expect(state.attempt._tag).toBe("Unattempted")
})
