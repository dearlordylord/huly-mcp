import type { Visibility as HulyVisibility } from "@hcengineering/calendar"
import { Schema } from "effect"

import { toDraft07JsonSchema } from "./json-schema.js"
import { clearableText } from "./clearable.js"
import { HULY_NATIVE_REFERENCE_MARKDOWN_INPUT } from "./document-native-references.js"
import {
  assertUpdateFields,
  atLeastOneUpdateFieldMessage,
  Count,
  DEFAULT_LIMIT,
  DocId,
  DocumentId,
  DocumentIdentifier,
  Email,
  enumValuesDescription,
  hasAtLeastOneDefined,
  IssueId,
  IssueIdentifier,
  LimitParam,
  NonEmptyString,
  ObjectClassName,
  PersonId,
  PersonName,
  ProjectIdentifier,
  TeamspaceId,
  TeamspaceIdentifier,
  SpaceId,
  Timestamp,
  TodoId,
  withAtLeastOneRequired,
  WorkSlotId
} from "./shared.js"

export const TodoTitle = NonEmptyString.pipe(Schema.brand("TodoTitle")).annotate({
  identifier: "TodoTitle",
  title: "TodoTitle",
  description: "Non-empty Planner ToDo title."
})
export type TodoTitle = Schema.Schema.Type<typeof TodoTitle>

export const TodoAttachmentTitle = NonEmptyString.pipe(Schema.brand("TodoAttachmentTitle")).annotate({
  identifier: "TodoAttachmentTitle",
  title: "TodoAttachmentTitle",
  description: "Non-empty title of the Huly object attached to a ToDo."
})
export type TodoAttachmentTitle = Schema.Schema.Type<typeof TodoAttachmentTitle>

// Internal Huly LexoRank token used only to create ordered ToDos; never expose it in MCP output.
export const TodoRank = NonEmptyString.pipe(Schema.brand("TodoRank"))
export type TodoRank = Schema.Schema.Type<typeof TodoRank>

// Kept 1:1 with Huly ToDoPriority by the bidirectional maps in planner-shared.ts.
export const TodoPriorityValues = ["no-priority", "low", "medium", "high", "urgent"] as const
export const TodoPrioritySchema = Schema.Literals(TodoPriorityValues).annotate({
  title: "TodoPriority",
  description: `Planner ToDo priority. Allowed values: ${enumValuesDescription(TodoPriorityValues)}.`
})
export type TodoPriority = Schema.Schema.Type<typeof TodoPrioritySchema>

export const TodoVisibilityValues = ["public", "freeBusy", "private"] as const
type TodoVisibilityValue = (typeof TodoVisibilityValues)[number]
type ExactTodoVisibilityValues = [HulyVisibility] extends [TodoVisibilityValue]
  ? [TodoVisibilityValue] extends [HulyVisibility]
    ? true
    : never
  : never
const exactTodoVisibilityValues = <T extends true>(value: T): T => value
exactTodoVisibilityValues<ExactTodoVisibilityValues>(true)

export const TodoVisibilitySchema = Schema.Literals(TodoVisibilityValues).annotate({
  title: "TodoVisibility",
  description: `Planner ToDo visibility. Allowed values: ${enumValuesDescription(TodoVisibilityValues)}.`
})
export type TodoVisibility = Schema.Schema.Type<typeof TodoVisibilitySchema>

export const TodoCompletionStateValues = ["open", "completed", "all"] as const
const DEFAULT_TODO_COMPLETION_STATE: (typeof TodoCompletionStateValues)[number] = "all"
export const TodoCompletionStateSchema = Schema.Literals(TodoCompletionStateValues).annotate({
  title: "TodoCompletionState",
  description:
    "Local MCP filter over Huly doneOn: open means doneOn is null, completed means doneOn is set, all applies no doneOn filter."
})
export type TodoCompletionState = Schema.Schema.Type<typeof TodoCompletionStateSchema>
export const DEFAULT_TODO_PRIORITY: TodoPriority = "no-priority"
export const DEFAULT_PERSONAL_TODO_VISIBILITY: TodoVisibility = "private"
export const DEFAULT_ISSUE_TODO_VISIBILITY: TodoVisibility = "public"
export const DEFAULT_DOCUMENT_TODO_VISIBILITY: TodoVisibility = "private"

export const IssueTodoLocatorSchema = Schema.Struct({
  project: ProjectIdentifier.annotate({ description: "Project identifier, such as HULY." }),
  identifier: IssueIdentifier.annotate({ description: "Issue identifier, such as HULY-123 or 123." })
})
export type IssueTodoLocator = Schema.Schema.Type<typeof IssueTodoLocatorSchema>

export const DocumentTodoLocatorSchema = Schema.Struct({
  teamspace: TeamspaceIdentifier.annotate({ description: "Teamspace name or ID containing the document." }),
  document: DocumentIdentifier.annotate({ description: "Document title or ID within the teamspace." })
})
export type DocumentTodoLocator = Schema.Schema.Type<typeof DocumentTodoLocatorSchema>

export const TodoAttachmentInputSchema = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("none").annotate({
      description: "Create a personal ToDo not attached to another Huly object."
    })
  }),
  Schema.Struct({
    type: Schema.Literal("issue"),
    project: ProjectIdentifier.annotate({ description: "Project identifier containing the issue." }),
    identifier: IssueIdentifier.annotate({ description: "Issue identifier, such as HULY-123 or 123." })
  }),
  Schema.Struct({
    type: Schema.Literal("document"),
    teamspace: TeamspaceIdentifier.annotate({ description: "Teamspace name or ID containing the document." }),
    document: DocumentIdentifier.annotate({ description: "Document title or ID within the teamspace." })
  })
]).annotate({
  title: "TodoAttachmentInput",
  description:
    "Where to create the ToDo. Use none for personal Planner ToDos, issue for issue action items, or document for a document action item."
})
export type TodoAttachmentInput = Schema.Schema.Type<typeof TodoAttachmentInputSchema>

export const TodoLocatorSchema = Schema.Union([
  Schema.Struct({ todoId: TodoId.annotate({ description: "Raw Huly ToDo _id." }) }),
  Schema.Struct({
    issue: IssueTodoLocatorSchema,
    title: Schema.optional(
      TodoTitle.annotate({ description: "Optional exact title when more than one ToDo is attached to the issue." })
    ),
    owner: Schema.optional(NonEmptyString.annotate({ description: "Owner exact email or display name." })),
    completionState: Schema.optional(TodoCompletionStateSchema)
  }),
  Schema.Struct({
    title: TodoTitle.annotate({ description: "Exact ToDo title." }),
    owner: Schema.optional(
      NonEmptyString.annotate({ description: "Owner exact email or display name to disambiguate." })
    ),
    attachedTo: Schema.optional(
      TodoAttachmentInputSchema.annotate({ description: "Attached object to disambiguate the title." })
    ),
    completionState: Schema.optional(TodoCompletionStateSchema)
  })
]).annotate({
  title: "TodoLocator",
  description:
    "LLM-first ToDo locator. Prefer issue/title/owner or attachedTo.type=document with teamspace/document + title when you do not know the raw Huly ToDo ID."
})
export type TodoLocator = Schema.Schema.Type<typeof TodoLocatorSchema>

const ListTodosFilterFields = {
  owner: Schema.optionalKey(
    NonEmptyString.annotate({
      description: "Filter by owner exact email, exact display name, or raw person/employee ID."
    })
  ),
  title: Schema.optionalKey(TodoTitle.annotate({ description: "Exact ToDo title filter." })),
  titleSearch: Schema.optionalKey(NonEmptyString.annotate({ description: "Case-insensitive title substring filter." })),
  dueFrom: Schema.optionalKey(Timestamp.annotate({ description: "Only ToDos due at or after this timestamp." })),
  dueTo: Schema.optionalKey(Timestamp.annotate({ description: "Only ToDos due at or before this timestamp." })),
  completionState: Schema.optionalKey(
    TodoCompletionStateSchema.annotate({ description: `Completion filter. Default: ${DEFAULT_TODO_COMPLETION_STATE}.` })
  ),
  priority: Schema.optionalKey(TodoPrioritySchema),
  visibility: Schema.optionalKey(TodoVisibilitySchema),
  limit: Schema.optionalKey(
    LimitParam.annotate({ description: `Maximum number of ToDos to return (default: ${DEFAULT_LIMIT}).` })
  )
}

const ListTodosWithoutAttachmentSchema = Schema.Struct({
  ...ListTodosFilterFields,
  issue: Schema.optionalKey(Schema.Never),
  document: Schema.optionalKey(Schema.Never)
})

const ListTodosIssueSchema = Schema.Struct({
  ...ListTodosFilterFields,
  issue: IssueTodoLocatorSchema.annotate({ description: "Filter ToDos attached to one issue." }),
  document: Schema.optionalKey(Schema.Never)
})

const ListTodosDocumentSchema = Schema.Struct({
  ...ListTodosFilterFields,
  issue: Schema.optionalKey(Schema.Never),
  document: DocumentTodoLocatorSchema.annotate({ description: "Filter ToDos attached to one document." })
})

export const ListTodosParamsSchema = Schema.Union([
  ListTodosWithoutAttachmentSchema,
  ListTodosIssueSchema,
  ListTodosDocumentSchema
]).annotate({
  title: "ListTodosParams",
  description: `Parameters for listing Planner ToDos. Empty input is allowed: returns up to ${DEFAULT_LIMIT} ToDos, ordered by Huly planner order, with completionState=all. Use either issue or document, not both.`
})
export type ListTodosParams = Schema.Schema.Type<typeof ListTodosParamsSchema>

export const GetTodoParamsSchema = Schema.Struct({ locator: TodoLocatorSchema }).annotate({
  title: "GetTodoParams",
  description: "Get one Planner ToDo by raw ID or human-oriented locator."
})
export type GetTodoParams = Schema.Schema.Type<typeof GetTodoParamsSchema>

export const CreateTodoParamsSchema = Schema.Struct({
  title: TodoTitle.annotate({ description: "ToDo title." }),
  description: Schema.optional(
    Schema.String.annotate({ description: `ToDo description in markdown. ${HULY_NATIVE_REFERENCE_MARKDOWN_INPUT}` })
  ),
  owner: Schema.optional(
    NonEmptyString.annotate({
      description: "Owner exact email or display name. If omitted, uses the authenticated user."
    })
  ),
  dueDate: Schema.optional(Timestamp.annotate({ description: "Due date as Unix timestamp in milliseconds." })),
  priority: Schema.optional(
    TodoPrioritySchema.annotate({ description: `Priority. Default: ${DEFAULT_TODO_PRIORITY}.` })
  ),
  visibility: Schema.optional(
    TodoVisibilitySchema.annotate({
      description: `Visibility. Default: ${DEFAULT_PERSONAL_TODO_VISIBILITY} for personal/document ToDos, ${DEFAULT_ISSUE_TODO_VISIBILITY} for issue ToDos.`
    })
  ),
  attachedTo: Schema.optional(
    TodoAttachmentInputSchema.annotate({
      description: "Attachment target. If omitted, creates a personal ToDo; document targets create document ToDos."
    })
  )
}).annotate({
  title: "CreateTodoParams",
  description: "Create a personal, issue-attached, or document-attached Planner ToDo without requiring Huly class IDs."
})
export type CreateTodoParams = Schema.Schema.Type<typeof CreateTodoParamsSchema>

export const UPDATE_TODO_FIELDS = [
  "title",
  "description",
  "owner",
  "dueDate",
  "priority",
  "visibility"
] as const satisfies ReadonlyArray<"title" | "description" | "owner" | "dueDate" | "priority" | "visibility">

export const UpdateTodoParamsSchema = Schema.Struct({
  locator: TodoLocatorSchema,
  title: Schema.optional(TodoTitle.annotate({ description: "New ToDo title." })),
  description: Schema.optional(
    clearableText(`New ToDo description in markdown. ${HULY_NATIVE_REFERENCE_MARKDOWN_INPUT}`)
  ),
  owner: Schema.optional(NonEmptyString.annotate({ description: "New owner exact email or display name." })),
  dueDate: Schema.optional(
    Schema.NullOr(Timestamp).annotate({ description: "New due date timestamp, or null to clear." })
  ),
  priority: Schema.optional(TodoPrioritySchema),
  visibility: Schema.optional(TodoVisibilitySchema)
})
  .pipe(
    Schema.check(
      Schema.makeFilter((params) =>
        hasAtLeastOneDefined(params, UPDATE_TODO_FIELDS) ? undefined : atLeastOneUpdateFieldMessage(UPDATE_TODO_FIELDS)
      )
    )
  )
  .annotate({
    title: "UpdateTodoParams",
    description: `Parameters for updating a Planner ToDo. ${atLeastOneUpdateFieldMessage(UPDATE_TODO_FIELDS)}`
  })
export type UpdateTodoParams = Schema.Schema.Type<typeof UpdateTodoParamsSchema>
assertUpdateFields<UpdateTodoParams>()(["locator"], UPDATE_TODO_FIELDS)

export const CompleteTodoParamsSchema = Schema.Struct({
  locator: TodoLocatorSchema,
  doneOn: Schema.optional(
    Timestamp.annotate({ description: "Completion timestamp. If omitted, uses the current time." })
  )
}).annotate({
  title: "CompleteTodoParams",
  description: "Complete a Planner ToDo. Huly may trim future work slots and run issue automation."
})
export type CompleteTodoParams = Schema.Schema.Type<typeof CompleteTodoParamsSchema>

export const ReopenTodoParamsSchema = Schema.Struct({ locator: TodoLocatorSchema }).annotate({
  title: "ReopenTodoParams",
  description:
    "Reopen a completed Planner ToDo by clearing doneOn. Human locators search completed ToDos by default for this tool."
})
export type ReopenTodoParams = Schema.Schema.Type<typeof ReopenTodoParamsSchema>

export const DeleteTodoParamsSchema = Schema.Struct({ locator: TodoLocatorSchema }).annotate({
  title: "DeleteTodoParams",
  description: "Delete a Planner ToDo. Removing issue ToDos can trigger Huly issue automation."
})
export type DeleteTodoParams = Schema.Schema.Type<typeof DeleteTodoParamsSchema>

export const ScheduleTodoParamsSchema = Schema.Struct({
  locator: TodoLocatorSchema,
  date: Timestamp.annotate({ description: "Work slot start timestamp." }),
  dueDate: Timestamp.annotate({ description: "Work slot end timestamp." })
}).annotate({
  title: "ScheduleTodoParams",
  description:
    "Schedule a ToDo by raw ToDo ID or human locator as a blocking work slot on the authenticated user's personal calendar."
})
export type ScheduleTodoParams = Schema.Schema.Type<typeof ScheduleTodoParamsSchema>

export const UnscheduleTodoParamsSchema = Schema.Union([
  Schema.Struct({ workSlotId: WorkSlotId.annotate({ description: "Specific work slot ID to remove." }) }).annotate({
    description: "Remove one specific work slot by ID."
  }),
  Schema.Struct({
    locator: TodoLocatorSchema,
    scope: Schema.Literal("all").annotate({ description: "Remove all work slots for the located ToDo." })
  }).annotate({ description: "Remove all work slots for one ToDo." }),
  Schema.Struct({
    locator: TodoLocatorSchema,
    scope: Schema.Literal("future").annotate({ description: "Remove future work slots for the located ToDo." }),
    from: Schema.optional(
      Timestamp.annotate({ description: "Reference timestamp for future work slots. If omitted, uses current time." })
    )
  }).annotate({ description: "Remove future work slots for one ToDo." })
]).annotate({
  title: "UnscheduleTodoParams",
  description: "Remove ToDo work slots. Pass workSlotId, or pass locator with scope all/future."
})
export type UnscheduleTodoParams = Schema.Schema.Type<typeof UnscheduleTodoParamsSchema>

export const TodoOwnerSummarySchema = Schema.Struct({
  id: PersonId,
  name: Schema.optional(PersonName),
  email: Schema.optional(Email)
})
export type TodoOwnerSummary = Schema.Schema.Type<typeof TodoOwnerSummarySchema>

export const TodoAttachmentSummarySchema = Schema.Union([
  Schema.Struct({ type: Schema.Literal("none") }),
  Schema.Struct({
    type: Schema.Literal("issue"),
    id: IssueId,
    project: ProjectIdentifier,
    identifier: IssueIdentifier,
    title: TodoAttachmentTitle
  }),
  Schema.Struct({
    type: Schema.Literal("document"),
    id: DocumentId,
    title: TodoAttachmentTitle,
    teamspaceId: TeamspaceId,
    teamspaceName: NonEmptyString
  }),
  Schema.Struct({ type: Schema.Literal("unknown"), id: DocId, class: ObjectClassName }).annotate({
    description: "Attached to a Huly object type this Planner tool does not resolve yet."
  })
])
export type TodoAttachmentSummary = Schema.Schema.Type<typeof TodoAttachmentSummarySchema>

export const TodoSummarySchema = Schema.Struct({
  id: TodoId,
  title: TodoTitle,
  dueDate: Schema.optional(Schema.NullOr(Timestamp)),
  priority: TodoPrioritySchema,
  visibility: TodoVisibilitySchema,
  doneOn: Schema.optional(Schema.NullOr(Timestamp)),
  owner: TodoOwnerSummarySchema,
  attachedTo: TodoAttachmentSummarySchema,
  workslots: Count,
  labels: Schema.optional(Count)
})
export type TodoSummary = Schema.Schema.Type<typeof TodoSummarySchema>

export const TodoDetailSchema = TodoSummarySchema.pipe(
  Schema.fieldsAssign({
    description: Schema.optional(
      Schema.String.annotate({ description: "Markdown ToDo description; empty string is valid." })
    ),
    attachedSpace: Schema.optional(SpaceId),
    createdOn: Schema.optional(Timestamp),
    modifiedOn: Schema.optional(Timestamp)
  })
)
export type TodoDetail = Schema.Schema.Type<typeof TodoDetailSchema>

export const CreateTodoResultSchema = Schema.Struct({ todoId: TodoId })
export type CreateTodoResult = Schema.Schema.Type<typeof CreateTodoResultSchema>
export const TodoMutationResultSchema = Schema.Struct({ todoId: TodoId, updated: Schema.Boolean })
export type TodoMutationResult = Schema.Schema.Type<typeof TodoMutationResultSchema>
export const UpdateTodoResultSchema = TodoMutationResultSchema
export const CompleteTodoResultSchema = TodoMutationResultSchema
export const ReopenTodoResultSchema = TodoMutationResultSchema
export const DeleteTodoResultSchema = Schema.Struct({ todoId: TodoId, deleted: Schema.Boolean })
export type DeleteTodoResult = Schema.Schema.Type<typeof DeleteTodoResultSchema>
export const ScheduleTodoResultSchema = Schema.Struct({ todoId: TodoId, workSlotId: WorkSlotId })
export type ScheduleTodoResult = Schema.Schema.Type<typeof ScheduleTodoResultSchema>
export const UnscheduleTodoResultSchema = Schema.Struct({ todoId: Schema.optional(TodoId), removed: Count })
export type UnscheduleTodoResult = Schema.Schema.Type<typeof UnscheduleTodoResultSchema>

export const ListTodosResultSchema = Schema.Array(TodoSummarySchema)

export const listTodosParamsJsonSchema = toDraft07JsonSchema(ListTodosParamsSchema)
export const getTodoParamsJsonSchema = toDraft07JsonSchema(GetTodoParamsSchema)
export const createTodoParamsJsonSchema = toDraft07JsonSchema(CreateTodoParamsSchema)
export const updateTodoParamsJsonSchema = withAtLeastOneRequired(
  toDraft07JsonSchema(UpdateTodoParamsSchema),
  UPDATE_TODO_FIELDS
)
export const completeTodoParamsJsonSchema = toDraft07JsonSchema(CompleteTodoParamsSchema)
export const reopenTodoParamsJsonSchema = toDraft07JsonSchema(ReopenTodoParamsSchema)
export const deleteTodoParamsJsonSchema = toDraft07JsonSchema(DeleteTodoParamsSchema)
export const scheduleTodoParamsJsonSchema = toDraft07JsonSchema(ScheduleTodoParamsSchema)
export const unscheduleTodoParamsJsonSchema = toDraft07JsonSchema(UnscheduleTodoParamsSchema)

export const parseListTodosParams = Schema.decodeUnknownEffect(ListTodosParamsSchema)
export const parseGetTodoParams = Schema.decodeUnknownEffect(GetTodoParamsSchema)
export const parseCreateTodoParams = Schema.decodeUnknownEffect(CreateTodoParamsSchema)
export const parseUpdateTodoParams = Schema.decodeUnknownEffect(UpdateTodoParamsSchema)
export const parseCompleteTodoParams = Schema.decodeUnknownEffect(CompleteTodoParamsSchema)
export const parseReopenTodoParams = Schema.decodeUnknownEffect(ReopenTodoParamsSchema)
export const parseDeleteTodoParams = Schema.decodeUnknownEffect(DeleteTodoParamsSchema)
export const parseScheduleTodoParams = Schema.decodeUnknownEffect(ScheduleTodoParamsSchema)
export const parseUnscheduleTodoParams = Schema.decodeUnknownEffect(UnscheduleTodoParamsSchema)
