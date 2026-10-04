import type { MovementUncertaintyEvidence } from "../../domain/schemas/issue-movement-uncertainty.js"
import type { TransferTreeWrite } from "../../domain/schemas/issue-transfer-tree.js"
type TransferTreeVerification = MovementUncertaintyEvidence["verification"]
type Observation = Extract<TransferTreeVerification, { readonly status: "observed" }>
// Internal proof separates independently established contradictions from unavailable observations.
export interface VerificationProof {
  readonly tasks: Observation["tasks"]
  readonly records: Observation["records"]
  readonly absentIssueIds: ReadonlyArray<TransferTreeWrite["rootId"]>
  readonly problems: ReadonlyArray<string>
  readonly limitations: ReadonlyArray<string>
  readonly historicalProblems: ReadonlyArray<string>
}

export const projectVerification = (proof: VerificationProof): Observation => {
  const { tasks, records } = proof
  const absence = proof.absentIssueIds.length === 0 ? {} : { absentIssueIds: proof.absentIssueIds }
  const inconsistent = proof.problems.length > 0 || proof.historicalProblems.length > 0
  const historical =
    proof.historicalProblems.length === 0
      ? []
      : [
          `Earlier observed discrepancies remain unresolved by subsequent incomplete reads: ${proof.historicalProblems.join(" ")}`
        ]
  const reason = [...historical, ...proof.problems, ...proof.limitations].join(" ")
  if (proof.limitations.length > 0) {
    return inconsistent
      ? {
          status: "observed",
          completeness: "incomplete",
          consistency: "inconsistent",
          reason,
          tasks,
          records,
          ...absence
        }
      : { status: "observed", completeness: "incomplete", consistency: "undetermined", reason, tasks, records }
  }
  return inconsistent
    ? { status: "observed", completeness: "complete", consistency: "inconsistent", reason, tasks, records, ...absence }
    : { status: "observed", completeness: "complete", consistency: "consistent", tasks, records }
}
