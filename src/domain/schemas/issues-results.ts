import { Schema } from "effect"

import { IssueSchema, IssueSummarySchema } from "./issues.js"
import { IssueId, IssueIdentifier } from "./shared.js"

export const CreateIssueResultSchema = Schema.Struct({
  identifier: IssueIdentifier,
  issueId: IssueId
})
export type CreateIssueResult = Schema.Schema.Type<typeof CreateIssueResultSchema>

export const UpdateIssueResultSchema = Schema.Struct({
  identifier: IssueIdentifier,
  updated: Schema.Boolean
})
export type UpdateIssueResult = Schema.Schema.Type<typeof UpdateIssueResultSchema>

export const AddLabelResultSchema = Schema.Struct({
  identifier: IssueIdentifier,
  labelAdded: Schema.Boolean
})
export type AddLabelResult = Schema.Schema.Type<typeof AddLabelResultSchema>

export const RemoveLabelResultSchema = Schema.Struct({
  identifier: IssueIdentifier,
  labelRemoved: Schema.Boolean
})
export type RemoveLabelResult = Schema.Schema.Type<typeof RemoveLabelResultSchema>

export const DeleteIssueResultSchema = Schema.Struct({
  identifier: IssueIdentifier,
  deleted: Schema.Boolean
})
export type DeleteIssueResult = Schema.Schema.Type<typeof DeleteIssueResultSchema>

export const MoveIssueResultSchema = Schema.Struct({
  identifier: IssueIdentifier,
  moved: Schema.Boolean,
  newParent: Schema.optional(IssueIdentifier)
})
export type MoveIssueResult = Schema.Schema.Type<typeof MoveIssueResultSchema>

export const ListIssuesResultSchema = Schema.Array(IssueSummarySchema)
export const GetIssueResultSchema = IssueSchema
export const AddIssueLabelResultSchema = AddLabelResultSchema
export const RemoveIssueLabelResultSchema = RemoveLabelResultSchema
