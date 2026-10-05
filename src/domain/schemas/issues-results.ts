import { MovementUncertaintyFields } from "./issue-movement-uncertainty.js"
import { MoveIssueParamsSchema } from "./issue-movement.js"
import { TransferAttributeChangeSchema } from "./issue-transfer-attributes.js"
import { Schema } from "effect"

import { TransferConflictSchema } from "./issue-transfer.js"
import { IssueSchema, IssueSummarySchema } from "./issues.js"
import { DocId, IssueId, IssueIdentifier, UrlString } from "./shared.js"

export const CreateIssueResultSchema = Schema.Struct({ identifier: IssueIdentifier, issueId: IssueId })
export type CreateIssueResult = Schema.Schema.Type<typeof CreateIssueResultSchema>

export const UpdateIssueResultSchema = Schema.Struct({ identifier: IssueIdentifier, updated: Schema.Boolean })
export type UpdateIssueResult = Schema.Schema.Type<typeof UpdateIssueResultSchema>

export const AddLabelResultSchema = Schema.Struct({ identifier: IssueIdentifier, labelAdded: Schema.Boolean })
export type AddLabelResult = Schema.Schema.Type<typeof AddLabelResultSchema>

export const RemoveLabelResultSchema = Schema.Struct({ identifier: IssueIdentifier, labelRemoved: Schema.Boolean })
export type RemoveLabelResult = Schema.Schema.Type<typeof RemoveLabelResultSchema>

export const DeleteIssueResultSchema = Schema.Struct({ identifier: IssueIdentifier, deleted: Schema.Boolean })
export type DeleteIssueResult = Schema.Schema.Type<typeof DeleteIssueResultSchema>

const MovementCompletedFields = {
  attributeChanges: Schema.optionalKey(Schema.Array(TransferAttributeChangeSchema)),
  issueId: IssueId,
  projectId: DocId,
  parentId: Schema.NullOr(IssueId),
  tasks: Schema.Array(
    Schema.Struct({
      issueId: IssueId,
      previousIdentifier: IssueIdentifier,
      identifier: IssueIdentifier,
      parentId: Schema.NullOr(IssueId),
      url: UrlString
    })
  )
}
export const MoveIssueResultSchema = Schema.Union([
  Schema.Struct({ ...MovementCompletedFields, outcome: Schema.Literal("completed"), changed: Schema.Literal(true) }),
  Schema.Struct({ ...MovementCompletedFields, outcome: Schema.Literal("no-op"), changed: Schema.Literal(false) }),
  Schema.Struct({
    discovery: Schema.optionalKey(Schema.Literals(["complete", "incomplete"])),
    nextCall: Schema.optionalKey(MoveIssueParamsSchema),
    conflicts: Schema.optionalKey(Schema.Array(TransferConflictSchema)),
    destinationId: Schema.optionalKey(DocId),
    outcome: Schema.Literal("blocked"),
    changed: Schema.Literal(false),
    reason: Schema.String,
    issueIds: Schema.Array(IssueId),
    inspection: Schema.String
  }),
  Schema.Struct({
    ...MovementUncertaintyFields,
    outcome: Schema.Literals(["incomplete", "indeterminate"]),
    recordIds: Schema.optionalKey(Schema.Array(DocId)),
    reason: Schema.String,
    issueIds: Schema.Array(IssueId),
    inspection: Schema.String
  })
])
export type MoveIssueResult = Schema.Schema.Type<typeof MoveIssueResultSchema>

export const ListIssuesResultSchema = Schema.Array(IssueSummarySchema)
export const GetIssueResultSchema = IssueSchema
export const AddIssueLabelResultSchema = AddLabelResultSchema
export const RemoveIssueLabelResultSchema = RemoveLabelResultSchema
