import type { TodoPriority, TodoVisibility } from "./planner.js"
import type {
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

export type TodoAttachmentSummary =
  | { readonly type: "none" }
  | {
    readonly type: "issue"
    readonly id: IssueId
    readonly project: ProjectIdentifier
    readonly identifier: IssueIdentifier
    readonly title: string
  }
  | {
    readonly type: "unknown"
    readonly id: DocId
    readonly class: ObjectClassName
  }

export interface TodoOwnerSummary {
  readonly id: PersonId
  readonly name?: PersonName | undefined
  readonly email?: Email | undefined
}

export interface TodoSummary {
  readonly id: TodoId
  readonly title: string
  readonly dueDate?: Timestamp | null | undefined
  readonly priority: TodoPriority
  readonly visibility: TodoVisibility
  readonly doneOn?: Timestamp | null | undefined
  readonly owner: TodoOwnerSummary
  readonly attachedTo: TodoAttachmentSummary
  readonly workslots: Count
  readonly labels?: Count | undefined
  readonly rank?: string | undefined
}

export interface TodoDetail extends TodoSummary {
  readonly description?: string | undefined
  readonly attachedSpace?: SpaceId | undefined
  readonly createdOn?: Timestamp | undefined
  readonly modifiedOn?: Timestamp | undefined
}

export interface CreateTodoResult {
  readonly todoId: TodoId
}

export interface TodoMutationResult {
  readonly todoId: TodoId
  readonly updated: boolean
}

export interface DeleteTodoResult {
  readonly todoId: TodoId
  readonly deleted: boolean
}

export interface ScheduleTodoResult {
  readonly todoId: TodoId
  readonly workSlotId: WorkSlotId
}

export interface UnscheduleTodoResult {
  readonly todoId?: TodoId | undefined
  readonly removed: Count
}

export interface TodoAutomationHelperSummary {
  readonly id: string
  readonly onDoneTester: string
}
