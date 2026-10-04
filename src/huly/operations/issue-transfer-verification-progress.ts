import { Effect, Ref } from "effect"
import type { MovementUncertaintyEvidence } from "../../domain/schemas/issue-movement-uncertainty.js"

type Verification = MovementUncertaintyEvidence["verification"]
export const verificationUnavailable = (previous: Verification, reason: string): Verification => {
  if (previous.status !== "observed") return { status: "unavailable", reason }
  const limitation = previous.consistency === "consistent" ? reason : `${previous.reason} ${reason}`
  return previous.consistency === "inconsistent"
    ? { ...previous, completeness: "incomplete", consistency: "inconsistent", reason: limitation }
    : { ...previous, completeness: "incomplete", consistency: "undetermined", reason: limitation }
}
const retainVerifiedFact = (previous: Verification, next: Verification): Verification => {
  if (previous.status !== "observed" || previous.consistency !== "inconsistent") return next
  if (next.status === "observed" && next.consistency === "inconsistent") return next
  if (next.status === "observed" && next.completeness === "complete") return next
  return verificationUnavailable(
    previous,
    "Later verification remains unavailable; prior observed discrepancy is unresolved."
  )
}

// Request-owned observation sink; pending reads cannot erase an independently observed discrepancy.
export const publishVerification = Effect.fn("transfer.publishVerification")(function* (
  ref: Ref.Ref<Verification>,
  next: Verification
): Effect.fn.Return<void> {
  yield* Ref.update(ref, (previous) => retainVerifiedFact(previous, next))
})
export const interruptVerification = Effect.fn("transfer.interruptVerification")(function* (
  ref: Ref.Ref<Verification>,
  reason: string
): Effect.fn.Return<Verification> {
  return yield* Ref.updateAndGet(ref, (previous) => verificationUnavailable(previous, reason))
})
