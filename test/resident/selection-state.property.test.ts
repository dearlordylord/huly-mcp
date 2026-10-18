import * as fc from "fast-check"
import { expect, it } from "vitest"

import { advanceCandidateSelection, type CandidateSelection } from "../../src/resident/candidate-selection-state.js"
import { advancePublication, makePublicationState, type OwnerOutcome } from "../../src/resident/publication-state.js"
import { propertyTestParameters } from "../helpers/property.js"

it("always prefers the exact retained candidate to capacity without mutating the empty search", () => {
  fc.assert(
    fc.property(fc.nat(100), fc.nat(100), (recordCount, capacity) => {
      const empty: CandidateSelection<object> = Object.freeze({ _tag: "Empty" })
      const candidate = Object.freeze({ recordCount, capacity })
      const matched = advanceCandidateSelection(empty, { _tag: "Matched", candidate })
      if (matched._tag !== "Continue") throw new Error("First match must succeed")
      Object.freeze(matched.state)
      const decision = advanceCandidateSelection(matched.state, { _tag: "Completed", recordCount, capacity })
      expect(decision._tag === "Existing" && decision.candidate === candidate).toBe(true)
      expect(
        advanceCandidateSelection(matched.state, { _tag: "Matched", candidate: { recordCount, capacity } })._tag
      ).toBe("Duplicate")
      expect(advanceCandidateSelection(empty, { _tag: "Completed", recordCount, capacity })._tag).toBe(
        recordCount === capacity ? "Capacity" : "Absent"
      )
    }),
    propertyTestParameters
  )
})

it("retains late receipt identity and grants at most one retirement for the first owner outcome", () => {
  fc.assert(
    fc.property(
      fc.constantFrom<OwnerOutcome>("success", "interrupts-only", "failure"),
      fc.boolean(),
      fc.nat(30),
      (outcome, late, repeats) => {
        const receipt = Object.freeze({ name: "owned receipt" })
        const started = advancePublication(makePublicationState<typeof receipt>(), {
          _tag: "Begin",
          sameDirectory: true
        })
        Object.freeze(started.state.attempt)
        Object.freeze(started.state.scope)
        Object.freeze(started.state)
        const beforeFence = late
          ? started.state
          : advancePublication(started.state, { _tag: "Recorded", receipt }).state
        const fenced = advancePublication(beforeFence, { _tag: "Fence", outcome }).state
        let state = late ? advancePublication(fenced, { _tag: "Recorded", receipt }).state : fenced
        let retirements = 0
        for (let index = 0; index <= repeats; index += 1) {
          state = advancePublication(state, { _tag: "Fence", outcome: "success" }).state
          const settled = advancePublication(state, { _tag: "Settled" })
          if (settled.decision._tag === "Retire") {
            retirements += 1
            expect(settled.decision.receipt).toBe(receipt)
          }
          state = settled.state
          expect(state.attempt._tag === "Recorded" && state.attempt.receipt === receipt).toBe(true)
        }
        expect(retirements).toBe(outcome === "failure" ? 0 : 1)
        expect(started.state.attempt._tag).toBe("Attempted")
        expect(started.state.scope._tag).toBe("Open")
      }
    ),
    propertyTestParameters
  )
})

it("never restores a consumed readiness attempt after any number of duplicate requests", () => {
  fc.assert(
    fc.property(fc.boolean(), fc.array(fc.boolean(), { maxLength: 40 }), (first, repeats) => {
      let state = advancePublication(makePublicationState<object>(), { _tag: "Begin", sameDirectory: first }).state
      for (const sameDirectory of repeats) {
        const next = advancePublication(state, { _tag: "Begin", sameDirectory })
        expect(next.decision._tag).toBe("RefuseAttempt")
        expect(next.state).toBe(state)
        state = next.state
      }
    }),
    propertyTestParameters
  )
})
