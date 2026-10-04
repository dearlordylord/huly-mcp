import { SocialIdentityId } from "./person-administration.js"
import { Schema } from "effect"
import {
  DocId,
  IssueId,
  NonEmptyString,
  ObjectClassName,
  PositiveInteger,
  Timestamp,
  AccountUuid,
  IssueIdentifier
} from "./shared.js"

export const AutomaticHistoryClass = ObjectClassName.make("activity:class:DocUpdateMessage")
export const TransferHistorySchema = Schema.Struct({
  objectId: DocId,
  objectClass: ObjectClassName,
  action: Schema.Literals(["create", "update", "remove"]),
  txId: Schema.optionalKey(DocId),
  createdBy: Schema.optionalKey(NonEmptyString),
  createdOn: Schema.optionalKey(Timestamp),
  updateCollection: Schema.optionalKey(Schema.String),
  // Encoded snapshot of parsed SDK historical updates; these values are never rewritten.
  attributeUpdates: Schema.optionalKey(Schema.String)
})
const RecordFields = {
  _id: DocId,
  space: DocId,
  attachedTo: DocId,
  modifiedOn: Timestamp,
  modifiedBy: SocialIdentityId,
  attachedToClass: Schema.optionalKey(ObjectClassName),
  collection: Schema.optionalKey(Schema.String),
  snapshot: Schema.optionalKey(Schema.String)
}
export const TransferHistoryRecordSchema = Schema.Struct({
  ...RecordFields,
  kind: Schema.Literal("history"),
  _class: Schema.Literal(AutomaticHistoryClass),
  history: TransferHistorySchema
})
export type TransferHistoryRecord = Schema.Schema.Type<typeof TransferHistoryRecordSchema>
export const TransferOwnedRecordSchema = Schema.Struct({
  ...RecordFields,
  kind: Schema.Literal("owned"),
  _class: ObjectClassName,
  attachedToClass: ObjectClassName,
  collection: Schema.String,
  snapshot: Schema.String,
  ownerId: DocId,
  ownerClass: ObjectClassName
})
export const TransferSupportedRecordSchema = Schema.Union([TransferHistoryRecordSchema, TransferOwnedRecordSchema])
export type TransferSupportedRecord = Schema.Schema.Type<typeof TransferSupportedRecordSchema>
export const TransferRecordSchema = Schema.Union([
  TransferOwnedRecordSchema,
  TransferHistoryRecordSchema,
  Schema.Struct({
    ...RecordFields,
    kind: Schema.Literal("unsupported"),
    _class: ObjectClassName.check(Schema.makeFilter((value) => value !== AutomaticHistoryClass))
  })
])
export type TransferRecord = Schema.Schema.Type<typeof TransferRecordSchema>
export const TransferInspectionSchema = Schema.Struct({
  discovery: Schema.Literals(["complete", "incomplete"]),
  classes: Schema.optionalKey(Schema.Array(ObjectClassName)),
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
  identifier: IssueIdentifier,
  rank: NonEmptyString,
  records: Schema.Array(TransferSupportedRecordSchema),
  recordClasses: Schema.optionalKey(Schema.Array(ObjectClassName))
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
  members: Schema.Array(AccountUuid),
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
  identifier: IssueIdentifier,
  reason: Schema.String
})
export type TransferConflict = Schema.Schema.Type<typeof TransferConflictSchema>
