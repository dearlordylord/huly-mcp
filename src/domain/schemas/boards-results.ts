import { Schema } from "effect"

import {
  BoardCardCoverSchema,
  BoardCardId,
  BoardCardSequenceIdentifier,
  BoardCardTitle,
  BoardId,
  BoardName
} from "./boards.js"
import {
  Count,
  IssueStatusId,
  ListTotal,
  NonEmptyString,
  PersonName,
  ProjectTypeId,
  StatusName,
  TaskTypeId
} from "./shared.js"

const OutputInteger = Schema.Number.pipe(Schema.int(), Schema.nonNegative())

export const BoardSummarySchema = Schema.Struct({
  id: BoardId,
  name: BoardName,
  description: Schema.optional(Schema.String),
  archived: Schema.Boolean,
  private: Schema.Boolean,
  cards: Schema.optional(Count)
})
export type BoardSummary = Schema.Schema.Type<typeof BoardSummarySchema>

export const BoardDetailSchema = Schema.Struct({
  id: BoardId,
  name: BoardName,
  description: Schema.optional(Schema.String),
  archived: Schema.Boolean,
  private: Schema.Boolean,
  cards: Schema.optional(Count),
  projectTypeId: ProjectTypeId,
  projectTypeName: Schema.optional(NonEmptyString),
  color: Schema.optional(Schema.Number),
  background: Schema.optional(Schema.String)
})
export type BoardDetail = Schema.Schema.Type<typeof BoardDetailSchema>

export const ListBoardsResultSchema = Schema.Struct({
  boards: Schema.Array(BoardSummarySchema),
  total: ListTotal
})
export type ListBoardsResult = Schema.Schema.Type<typeof ListBoardsResultSchema>

export const BoardCardSummarySchema = Schema.Struct({
  id: BoardCardId,
  identifier: BoardCardSequenceIdentifier,
  number: OutputInteger,
  title: BoardCardTitle,
  board: BoardName,
  status: StatusName,
  statusId: IssueStatusId,
  kind: NonEmptyString,
  kindId: TaskTypeId,
  archived: Schema.Boolean,
  assignee: Schema.optional(PersonName),
  modifiedOn: Schema.optional(OutputInteger),
  dueDate: Schema.optional(OutputInteger)
})
export type BoardCardSummary = Schema.Schema.Type<typeof BoardCardSummarySchema>

export const BoardCardDetailSchema = Schema.Struct({
  id: BoardCardId,
  identifier: BoardCardSequenceIdentifier,
  number: OutputInteger,
  title: BoardCardTitle,
  board: BoardName,
  status: StatusName,
  statusId: IssueStatusId,
  kind: NonEmptyString,
  kindId: TaskTypeId,
  archived: Schema.Boolean,
  assignee: Schema.optional(PersonName),
  modifiedOn: Schema.optional(OutputInteger),
  dueDate: Schema.optional(OutputInteger),
  description: Schema.optional(Schema.String),
  members: Schema.Array(PersonName),
  location: Schema.optional(Schema.String),
  cover: Schema.optional(BoardCardCoverSchema),
  startDate: Schema.optional(OutputInteger),
  createdOn: Schema.optional(OutputInteger)
})
export type BoardCardDetail = Schema.Schema.Type<typeof BoardCardDetailSchema>

export const ListBoardCardsResultSchema = Schema.Struct({
  cards: Schema.Array(BoardCardSummarySchema),
  total: ListTotal
})
export type ListBoardCardsResult = Schema.Schema.Type<typeof ListBoardCardsResultSchema>

export const BoardMutationResultSchema = Schema.Struct({
  id: BoardId,
  updated: Schema.Boolean
})
export type BoardMutationResult = Schema.Schema.Type<typeof BoardMutationResultSchema>

export const CreateBoardResultSchema = Schema.Struct({
  id: BoardId,
  name: BoardName,
  created: Schema.Boolean
})
export type CreateBoardResult = Schema.Schema.Type<typeof CreateBoardResultSchema>

export const BoardCardMutationResultSchema = Schema.Struct({
  id: BoardCardId,
  updated: Schema.Boolean
})
export type BoardCardMutationResult = Schema.Schema.Type<typeof BoardCardMutationResultSchema>

export const CreateBoardCardResultSchema = Schema.Struct({
  id: BoardCardId,
  identifier: BoardCardSequenceIdentifier,
  number: OutputInteger,
  title: BoardCardTitle
})
export type CreateBoardCardResult = Schema.Schema.Type<typeof CreateBoardCardResultSchema>

export const DeleteBoardCardResultSchema = Schema.Struct({
  id: BoardCardId,
  deleted: Schema.Boolean
})
export type DeleteBoardCardResult = Schema.Schema.Type<typeof DeleteBoardCardResultSchema>
