import type { MoveIssueParams } from "../../domain/schemas/issue-movement.js"
import type { TransferConflict } from "../../domain/schemas/issue-transfer.js"
import { IssueIdentifier, type IssueId } from "../../domain/schemas/shared.js"

export const transferRetryCall = (
  params: MoveIssueParams,
  issueId: IssueId,
  conflicts: ReadonlyArray<TransferConflict>
): MoveIssueParams => {
  const resolutions = params.resolutions?.filter((entry, index, all) => {
    if (entry.issueId !== issueId) return false
    if (
      all.some(
        (other, otherIndex) => otherIndex !== index && other.issueId === entry.issueId && other.field === entry.field
      )
    )
      return false
    return !conflicts.some(
      (conflict) =>
        "field" in conflict &&
        conflict.field === entry.field &&
        (conflict.code === "stale-resolution" || conflict.code === "invalid-resolution")
    )
  })
  return {
    issue: IssueIdentifier.make(issueId),
    destination: params.destination,
    ...(resolutions === undefined ? {} : { resolutions })
  }
}
