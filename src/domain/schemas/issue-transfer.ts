import { SocialIdentityId } from "./person-administration.js"
import { Schema } from "effect"
import { DocId, IssueId, NonEmptyString, ObjectClassName, PositiveInteger, Timestamp } from "./shared.js"

const HistoryValueSchema = Schema.Union([Schema.String, Schema.Number, Schema.Null])
export const TransferHistorySchema = Schema.Struct({
  objectId: DocId,
  objectClass: ObjectClassName,
  action: Schema.Literals(["create", "update", "remove"]),
  txId: Schema.optionalKey(DocId),
  createdBy: Schema.optionalKey(NonEmptyString),
  createdOn: Schema.optionalKey(Timestamp),
  updateCollection: Schema.optionalKey(Schema.String),
  attributeUpdates: Schema.optionalKey(
    Schema.Struct({
      attrKey: Schema.String,
      attrClass: ObjectClassName,
      set: Schema.Array(HistoryValueSchema),
      added: Schema.Array(HistoryValueSchema),
      removed: Schema.Array(HistoryValueSchema),
      isMixin: Schema.Boolean,
      // The SDK allows arbitrary serialized historical attribute values.
      prevValue: Schema.optionalKey(Schema.Json)
    })
  )
})
export const TransferRecordSchema = Schema.Struct({
  _id: DocId,
  _class: ObjectClassName,
  space: DocId,
  attachedTo: DocId,
  modifiedOn: Timestamp,
  modifiedBy: SocialIdentityId,
  history: Schema.optionalKey(TransferHistorySchema),
  automaticHistory: Schema.Boolean
})
export type TransferRecord = Schema.Schema.Type<typeof TransferRecordSchema>
export const TransferInspectionSchema = Schema.Struct({
  records: Schema.Array(TransferRecordSchema),
  blockers: Schema.Array(Schema.String),
  limitation: Schema.String
})
export type TransferInspection = Schema.Schema.Type<typeof TransferInspectionSchema>
export const TransferWriteSchema = Schema.Struct({
  issueId: IssueId,
  sourceId: DocId,
  destinationId: DocId,
  previousParent: IssueId,
  parentId: IssueId,
  modifiedOn: Timestamp,
  number: PositiveInteger,
  identifier: NonEmptyString,
  rank: NonEmptyString,
  records: Schema.Array(TransferRecordSchema)
})
export type TransferWrite = Schema.Schema.Type<typeof TransferWriteSchema>

export const TransferIssueSchema = Schema.Struct({
  kind: DocId,
  status: DocId,
  number: PositiveInteger,
  rank: NonEmptyString,
  description: Schema.optionalKey(Schema.NullOr(Schema.String)),
  createdBy: Schema.optionalKey(NonEmptyString),
  createdOn: Schema.optionalKey(Timestamp),
  component: Schema.optionalKey(Schema.NullOr(DocId)),
  milestone: Schema.optionalKey(Schema.NullOr(DocId)),
  relations: Schema.optionalKey(Schema.Array(Schema.Struct({ _id: DocId, _class: ObjectClassName }))),
  blockedBy: Schema.optionalKey(Schema.Array(Schema.Struct({ _id: DocId, _class: ObjectClassName })))
})
export type TransferIssue = Schema.Schema.Type<typeof TransferIssueSchema>
export const TransferProjectSchema = Schema.Struct({
  type: DocId,
  private: Schema.Boolean,
  archived: Schema.Boolean,
  members: Schema.Array(NonEmptyString),
  restricted: Schema.optionalKey(Schema.Boolean)
})
export const TransferWorkflowSchema = Schema.Struct({
  tasks: Schema.Array(DocId),
  statuses: Schema.Array(Schema.Struct({ _id: DocId, taskType: DocId }))
})
export const TransferKindSchema = Schema.Struct({
  _id: DocId,
  parent: DocId,
  statuses: Schema.Array(DocId),
  kind: Schema.Literals(["task", "subtask", "both"]),
  allowedAsChildOf: Schema.optionalKey(Schema.Array(DocId))
})
export const TransferSequenceSchema = Schema.Struct({ object: Schema.Struct({ sequence: PositiveInteger }) })

export const TransferConflictSchema = Schema.Struct({
  code: Schema.Literals([
    "unsupported-structure",
    "unsupported-attribute",
    "workflow",
    "authorization",
    "discovery",
    "invalid-resolution"
  ]),
  issueId: IssueId,
  identifier: NonEmptyString,
  reason: Schema.String
})
export type TransferConflict = Schema.Schema.Type<typeof TransferConflictSchema>
