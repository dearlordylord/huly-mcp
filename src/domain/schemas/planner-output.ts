import { Schema } from "effect"

import { TodoAttachmentTitle, TodoPrioritySchema, TodoTitle, TodoVisibilitySchema } from "./planner.js"
import {
  Count,
  DocId,
  Email,
  IssueId,
  IssueIdentifier,
  ObjectClassName,
  PersonId,
  PersonName,
  ProjectIdentifier,
  SpaceId,
  Timestamp,
  TodoId,
  WorkSlotId
} from "./shared.js"

export const TodoAttachmentSummarySchema = Schema.Union(
  Schema.Struct({
    type: Schema.Literal("none")
  }),
  Schema.Struct({
    type: Schema.Literal("issue"),
    id: IssueId,
    project: ProjectIdentifier,
    identifier: IssueIdentifier,
    title: TodoAttachmentTitle
  }),
  Schema.Struct({
    type: Schema.Literal("unknown"),
    id: DocId,
    class: ObjectClassName
  })
)
export type TodoAttachmentSummary = Schema.Schema.Type<typeof TodoAttachmentSummarySchema>
export const TodoOwnerSummarySchema = Schema.Struct({
  id: PersonId,
  name: Schema.optional(PersonName),
  email: Schema.optional(Email)
})
export type TodoOwnerSummary = Schema.Schema.Type<typeof TodoOwnerSummarySchema>
export const TodoSummarySchema = Schema.Struct({
  id: TodoId,
  title: TodoTitle,
  dueDate: Schema.optional(Schema.Union(Timestamp, Schema.Null)),
  priority: TodoPrioritySchema,
  visibility: TodoVisibilitySchema,
  doneOn: Schema.optional(Schema.Union(Timestamp, Schema.Null)),
  owner: TodoOwnerSummarySchema,
  attachedTo: TodoAttachmentSummarySchema,
  workslots: Count,
  labels: Schema.optional(Count)
})
export type TodoSummary = Schema.Schema.Type<typeof TodoSummarySchema>
export const TodoDetailSchema = Schema.Struct({
  ...TodoSummarySchema.fields,
  description: Schema.optional(Schema.String),
  attachedSpace: Schema.optional(SpaceId),
  createdOn: Schema.optional(Timestamp),
  modifiedOn: Schema.optional(Timestamp)
})
export type TodoDetail = Schema.Schema.Type<typeof TodoDetailSchema>
export const CreateTodoResultSchema = Schema.Struct({
  todoId: TodoId
})
export type CreateTodoResult = Schema.Schema.Type<typeof CreateTodoResultSchema>
export const TodoMutationResultSchema = Schema.Struct({
  todoId: TodoId,
  updated: Schema.Boolean
})
export type TodoMutationResult = Schema.Schema.Type<typeof TodoMutationResultSchema>
export const DeleteTodoResultSchema = Schema.Struct({
  todoId: TodoId,
  deleted: Schema.Boolean
})
export type DeleteTodoResult = Schema.Schema.Type<typeof DeleteTodoResultSchema>
export const ScheduleTodoResultSchema = Schema.Struct({
  todoId: TodoId,
  workSlotId: WorkSlotId
})
export type ScheduleTodoResult = Schema.Schema.Type<typeof ScheduleTodoResultSchema>
export const UnscheduleTodoResultSchema = Schema.Struct({
  todoId: Schema.optional(TodoId),
  removed: Count
})
export type UnscheduleTodoResult = Schema.Schema.Type<typeof UnscheduleTodoResultSchema>
