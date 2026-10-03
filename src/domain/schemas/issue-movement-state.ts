import { Schema } from "effect"

import {
  Count,
  DocId,
  IssueId,
  IssueIdentifier,
  NonNegativeNumber,
  ObjectClassName,
  ProjectIdentifier,
  Timestamp
} from "./shared.js"

export const MovementIssueSchema = Schema.Struct({
  _id: IssueId,
  space: DocId,
  identifier: IssueIdentifier,
  title: Schema.String,
  attachedTo: IssueId,
  attachedToClass: ObjectClassName,
  collection: Schema.String,
  modifiedOn: Timestamp,
  subIssues: Count,
  estimation: NonNegativeNumber,
  reportedTime: NonNegativeNumber,
  parents: Schema.Array(
    Schema.Struct({ parentId: IssueId, identifier: IssueIdentifier, parentTitle: Schema.String, space: DocId })
  ),
  childInfo: Schema.Array(
    Schema.Struct({ childId: IssueId, estimation: NonNegativeNumber, reportedTime: NonNegativeNumber })
  )
})
export type MovementIssue = Schema.Schema.Type<typeof MovementIssueSchema>
export const parseMovementIssue = Schema.decodeUnknownEffect(MovementIssueSchema)

export const MovementProjectSchema = Schema.Struct({ _id: DocId, identifier: ProjectIdentifier })
export type MovementProject = Schema.Schema.Type<typeof MovementProjectSchema>
export const parseMovementProject = Schema.decodeUnknownEffect(MovementProjectSchema)
