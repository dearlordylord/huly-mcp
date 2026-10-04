import { MilestoneStatus } from "@hcengineering/tracker"
import { Schema } from "effect"
import { DocId, IssueId, Timestamp } from "./shared.js"

export const TransferAttributeFieldSchema = Schema.Literals(["component", "milestone"])
export type TransferAttributeField = Schema.Schema.Type<typeof TransferAttributeFieldSchema>
export const TransferMilestoneStatusSchema = Schema.Literals([
  MilestoneStatus.Planned,
  MilestoneStatus.InProgress,
  MilestoneStatus.Completed,
  MilestoneStatus.Canceled
])
export const TransferAttributeValueSchema = Schema.Struct({
  _id: DocId,
  _class: DocId,
  space: DocId,
  label: Schema.String,
  lead: Schema.optionalKey(Schema.NullOr(DocId)),
  status: Schema.optionalKey(TransferMilestoneStatusSchema),
  targetDate: Schema.optionalKey(Timestamp)
})
export type TransferAttributeValue = Schema.Schema.Type<typeof TransferAttributeValueSchema>
export const TransferAttributeChangeSchema = Schema.Struct({
  issueId: IssueId,
  field: TransferAttributeFieldSchema,
  from: DocId,
  to: Schema.NullOr(DocId),
  reason: Schema.Literals(["explicit-replacement", "explicit-clear", "exact-name"])
})
export type TransferAttributeChange = Schema.Schema.Type<typeof TransferAttributeChangeSchema>
export const TransferAttributeConflictFields = {
  field: TransferAttributeFieldSchema,
  from: Schema.NullOr(DocId),
  sourceName: Schema.optionalKey(Schema.String),
  candidates: Schema.Array(TransferAttributeValueSchema),
  clearingAllowed: Schema.Literal(true)
}
