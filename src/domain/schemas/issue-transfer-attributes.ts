import { MilestoneStatus } from "@hcengineering/tracker"
import { Schema } from "effect"
import { DocId, IssueId, ObjectClassName, Timestamp } from "./shared.js"

export const MAX_SUPPORTED_ATTRIBUTE_VALUES = 1_000
export const TransferComponentClass = ObjectClassName.make("tracker:class:Component")
export const TransferMilestoneClass = ObjectClassName.make("tracker:class:Milestone")
export const TransferAttributeFieldSchema = Schema.Literals(["component", "milestone"])
const TransferMilestoneStatusSchema = Schema.Literals([
  MilestoneStatus.Planned,
  MilestoneStatus.InProgress,
  MilestoneStatus.Completed,
  MilestoneStatus.Canceled
])
const ValueFields = { _id: DocId, space: DocId, label: Schema.String }
export const TransferComponentValueSchema = Schema.Struct({
  ...ValueFields,
  _class: Schema.Literal(TransferComponentClass),
  lead: Schema.NullOr(DocId)
})
export type TransferComponentValue = Schema.Schema.Type<typeof TransferComponentValueSchema>
export const TransferMilestoneValueSchema = Schema.Struct({
  ...ValueFields,
  _class: Schema.Literal(TransferMilestoneClass),
  status: TransferMilestoneStatusSchema,
  targetDate: Timestamp
})
export type TransferMilestoneValue = Schema.Schema.Type<typeof TransferMilestoneValueSchema>
const ChangeFields = { issueId: IssueId, field: TransferAttributeFieldSchema, from: DocId }
export const TransferAttributeChangeSchema = Schema.Union([
  Schema.Struct({ ...ChangeFields, to: Schema.Null, reason: Schema.Literal("explicit-clear") }),
  Schema.Struct({ ...ChangeFields, to: DocId, reason: Schema.Literals(["explicit-replacement", "exact-name"]) })
])
export type TransferAttributeChange = Schema.Schema.Type<typeof TransferAttributeChangeSchema>
export const TransferComponentConflictFields = {
  field: Schema.Literal("component"),
  candidates: Schema.Array(TransferComponentValueSchema)
}
export const TransferMilestoneConflictFields = {
  field: Schema.Literal("milestone"),
  candidates: Schema.Array(TransferMilestoneValueSchema)
}
