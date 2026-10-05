import { Schema } from "effect"
import { DocId, IssueId, NonEmptyString } from "../src/domain/schemas/shared.js"

export const TreeLedgerRecord = Schema.Struct({
  kind: Schema.Literals(["comment", "attachment", "report"]),
  id: DocId,
  ownerId: DocId
})
export const TreeLedgerSnapshot = Schema.Struct({
  stage: Schema.Literals(["intent", "acknowledged", "cleanup"]),
  tool: NonEmptyString,
  unresolvedCreation: Schema.Boolean,
  issueIds: Schema.Array(IssueId),
  projectIds: Schema.Array(DocId),
  componentIds: Schema.Array(DocId),
  milestoneIds: Schema.Array(DocId),
  documentIds: Schema.Array(DocId),
  teamspaceIds: Schema.Array(DocId),
  referenceIds: Schema.Array(DocId),
  records: Schema.Array(TreeLedgerRecord),
  tagIdsUnreturned: Schema.Boolean,
  referencePartialIdsUnobservable: Schema.Boolean
})
export type TreeLedgerSnapshot = Schema.Schema.Type<typeof TreeLedgerSnapshot>
const sameRecord = (left: typeof TreeLedgerRecord.Type, right: typeof TreeLedgerRecord.Type) =>
  left.kind === right.kind && left.id === right.id && left.ownerId === right.ownerId
export const mergeTreeLedger = (previous: TreeLedgerSnapshot | undefined, next: TreeLedgerSnapshot) => {
  const records = [...(previous?.records ?? [])]
  for (const record of next.records) {
    const existing = records.find((entry) => entry.id === record.id)
    if (existing !== undefined && !sameRecord(existing, record)) return undefined
    if (existing === undefined) records.push(record)
  }
  const comments = records.filter((record) => record.kind === "comment").map((record) => record.id)
  if (
    records.some(
      (record) =>
        ![...(previous?.issueIds ?? []), ...next.issueIds].some((id) => id === record.ownerId) &&
        !(record.kind === "attachment" && comments.includes(record.ownerId))
    )
  )
    return undefined
  return {
    ...next,
    issueIds: [...new Set([...(previous?.issueIds ?? []), ...next.issueIds])],
    projectIds: [...new Set([...(previous?.projectIds ?? []), ...next.projectIds])],
    componentIds: [...new Set([...(previous?.componentIds ?? []), ...next.componentIds])],
    milestoneIds: [...new Set([...(previous?.milestoneIds ?? []), ...next.milestoneIds])],
    documentIds: [...new Set([...(previous?.documentIds ?? []), ...next.documentIds])],
    teamspaceIds: [...new Set([...(previous?.teamspaceIds ?? []), ...next.teamspaceIds])],
    referenceIds: [...new Set([...(previous?.referenceIds ?? []), ...next.referenceIds])],
    records,
    tagIdsUnreturned: next.tagIdsUnreturned || previous?.tagIdsUnreturned === true,
    referencePartialIdsUnobservable:
      next.referencePartialIdsUnobservable || previous?.referencePartialIdsUnobservable === true
  }
}
