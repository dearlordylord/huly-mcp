import { Effect, Ref } from "effect"
import type { MovementUncertaintyEvidence } from "../../domain/schemas/issue-movement-uncertainty.js"
import { projectVerification, type VerificationProof } from "./issue-transfer-verification-proof.js"

type Verification = MovementUncertaintyEvidence["verification"]
export type VerificationFactsRef = Ref.Ref<VerificationProof | undefined>
const mergePartialProof = (previous: VerificationProof | undefined, next: VerificationProof): VerificationProof => {
  if (previous === undefined || next.limitations.length === 0) return next
  const presentIds = new Set(next.tasks.map((task) => task.issueId))
  const absentIssueIds = [...new Set([...previous.absentIssueIds, ...next.absentIssueIds])].filter(
    (id) => !presentIds.has(id)
  )
  const absentIds = new Set(absentIssueIds)
  const tasks = [...new Map([...previous.tasks, ...next.tasks].map((task) => [task.issueId, task])).values()].filter(
    (task) => !absentIds.has(task.issueId)
  )
  const records = [
    ...new Map([...previous.records, ...next.records].map((record) => [record.recordId, record])).values()
  ]
  return {
    tasks,
    records,
    absentIssueIds,
    problems: next.problems,
    historicalProblems: [...new Set([...previous.historicalProblems, ...previous.problems])].filter(
      (problem) => !next.problems.includes(problem)
    ),
    limitations: [...new Set([...previous.limitations, ...next.limitations])]
  }
}

// Request-owned sink of structured facts; a partial pass cannot erase earlier completed observations.
export const publishVerification = Effect.fn("transfer.publishVerification")(function* (
  ref: Ref.Ref<Verification>,
  facts: VerificationFactsRef,
  next: VerificationProof
): Effect.fn.Return<void> {
  const proof = mergePartialProof(yield* Ref.get(facts), next)
  yield* Ref.set(facts, proof)
  yield* Ref.set(ref, projectVerification(proof))
})
export const interruptVerification = Effect.fn("transfer.interruptVerification")(function* (
  ref: Ref.Ref<Verification>,
  facts: VerificationFactsRef,
  reason: string
): Effect.fn.Return<Verification> {
  const previous = yield* Ref.get(facts)
  if (previous === undefined) {
    const unavailable: Verification = { status: "unavailable", reason }
    yield* Ref.set(ref, unavailable)
    return unavailable
  }
  yield* publishVerification(ref, facts, { ...previous, limitations: [...previous.limitations, reason] })
  return yield* Ref.get(ref)
})
