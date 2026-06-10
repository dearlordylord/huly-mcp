import type { Visibility as HulyVisibility } from "@hcengineering/calendar"
import { JSONSchema, Schema } from "effect"

import { clearableText } from "./clearable.js"
import {
  assertUpdateFields,
  atLeastOneUpdateFieldMessage,
  Count,
  DEFAULT_LIMIT,
  DocId,
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
  SpaceId,
  Timestamp,
  TodoId,
  withAtLeastOneRequired,
  WorkSlotId
} from "./shared.js"

export const TodoTitle = NonEmptyString.pipe(Schema.brand("TodoTitle")).annotations({
  identifier: "TodoTitle",
  title: "TodoTitle",
  description: "Non-empty Planner ToDo title."
})
export type TodoTitle = Schema.Schema.Type<typeof TodoTitle>

export const TodoAttachmentTitle = NonEmptyString.pipe(Schema.brand("TodoAttachmentTitle")).annotations({
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
export const TodoPrioritySchema = Schema.Literal(...TodoPriorityValues).annotations({
  title: "TodoPriority",
  description: `Planner ToDo priority. Allowed values: ${enumValuesDescription(TodoPriorityValues)}.`
})
export type TodoPriority = Schema.Schema.Type<typeof TodoPrioritySchema>

export const TodoVisibilityValues = ["public", "freeBusy", "private"] as const
type TodoVisibilityValue = typeof TodoVisibilityValues[number]
type ExactTodoVisibilityValues = [HulyVisibility] extends [TodoVisibilityValue]
  ? [TodoVisibilityValue] extends [HulyVisibility] ? true : never
  : never
const exactTodoVisibilityValues = <T extends true>(value: T): T => value
exactTodoVisibilityValues<ExactTodoVisibilityValues>(true)

export const TodoVisibilitySchema = Schema.Literal(...TodoVisibilityValues).annotations({
  title: "TodoVisibility",
  description: `Planner ToDo visibility. Allowed values: ${enumValuesDescription(TodoVisibilityValues)}.`
})
export type TodoVisibility = Schema.Schema.Type<typeof TodoVisibilitySchema>

export const TodoCompletionStateValues = ["open", "completed", "all"] as const
export const TodoCompletionStateSchema = Schema.Literal(...TodoCompletionStateValues).annotations({
  title: "TodoCompletionState",
  description:
    "Local MCP filter over Huly doneOn: open means doneOn is null, completed means doneOn is set, all applies no doneOn filter."
})
export type TodoCompletionState = Schema.Schema.Type<typeof TodoCompletionStateSchema>

export const IssueTodoLocatorSchema = Schema.Struct({
  project: ProjectIdentifier.annotations({
    description: "Project identifier, such as HULY."
  }),
  identifier: IssueIdentifier.annotations({
    description: "Issue identifier, such as HULY-123 or 123."
  })
})
export type IssueTodoLocator = Schema.Schema.Type<typeof IssueTodoLocatorSchema>

export const TodoAttachmentInputSchema = Schema.Union(
  Schema.Struct({
    type: Schema.Literal("none").annotations({
      description: "Create a personal ToDo not attached to another Huly object."
    })
  }),
  Schema.Struct({
    type: Schema.Literal("issue"),
    project: ProjectIdentifier.annotations({
      description: "Project identifier containing the issue."
    }),
    identifier: IssueIdentifier.annotations({
      description: "Issue identifier, such as HULY-123 or 123."
    })
  })
).annotations({
  title: "TodoAttachmentInput",
  description: "Where to create the ToDo. Use none for personal Planner ToDos or issue for issue action items."
})
export type TodoAttachmentInput = Schema.Schema.Type<typeof TodoAttachmentInputSchema>

export const TodoLocatorSchema = Schema.Union(
  Schema.Struct({
    todoId: TodoId.annotations({
      description: "Raw Huly ToDo _id."
    })
  }),
  Schema.Struct({
    issue: IssueTodoLocatorSchema,
    title: Schema.optional(TodoTitle.annotations({
      description: "Optional exact title when more than one ToDo is attached to the issue."
    })),
    owner: Schema.optional(NonEmptyString.annotations({
      description: "Owner exact email or display name."
    })),
    completionState: Schema.optional(TodoCompletionStateSchema)
  }),
  Schema.Struct({
    title: TodoTitle.annotations({
      description: "Exact ToDo title."
    }),
    owner: Schema.optional(NonEmptyString.annotations({
      description: "Owner exact email or display name to disambiguate."
    })),
    attachedTo: Schema.optional(TodoAttachmentInputSchema.annotations({
      description: "Attached object to disambiguate the title."
    })),
    completionState: Schema.optional(TodoCompletionStateSchema)
  })
).annotations({
  title: "TodoLocator",
  description: "LLM-first ToDo locator. Prefer issue/title/owner forms when you do not know the raw Huly ToDo ID."
})
export type TodoLocator = Schema.Schema.Type<typeof TodoLocatorSchema>

export const ListTodosParamsSchema = Schema.Struct({
  owner: Schema.optional(NonEmptyString.annotations({
    description: "Filter by owner exact email, exact display name, or raw person/employee ID."
  })),
  issue: Schema.optional(IssueTodoLocatorSchema.annotations({
    description: "Filter ToDos attached to one issue."
  })),
  title: Schema.optional(TodoTitle.annotations({
    description: "Exact ToDo title filter."
  })),
  titleSearch: Schema.optional(NonEmptyString.annotations({
    description: "Case-insensitive title substring filter."
  })),
  dueFrom: Schema.optional(Timestamp.annotations({
    description: "Only ToDos due at or after this timestamp."
  })),
  dueTo: Schema.optional(Timestamp.annotations({
    description: "Only ToDos due at or before this timestamp."
  })),
  completionState: Schema.optional(TodoCompletionStateSchema.annotations({
    description: "Completion filter. Default: all."
  })),
  priority: Schema.optional(TodoPrioritySchema),
  visibility: Schema.optional(TodoVisibilitySchema),
  limit: Schema.optional(LimitParam.annotations({
    description: `Maximum number of ToDos to return (default: ${DEFAULT_LIMIT}).`
  }))
}).annotations({
  title: "ListTodosParams",
  description:
    `Parameters for listing Planner ToDos. Empty input is allowed: returns up to ${DEFAULT_LIMIT} ToDos, ordered by Huly planner order, with completionState=all.`
})
export type ListTodosParams = Schema.Schema.Type<typeof ListTodosParamsSchema>

export const GetTodoParamsSchema = Schema.Struct({
  locator: TodoLocatorSchema
}).annotations({
  title: "GetTodoParams",
  description: "Get one Planner ToDo by raw ID or human-oriented locator."
})
export type GetTodoParams = Schema.Schema.Type<typeof GetTodoParamsSchema>

export const CreateTodoParamsSchema = Schema.Struct({
  title: TodoTitle.annotations({
    description: "ToDo title."
  }),
  description: Schema.optional(Schema.String.annotations({
    description: "ToDo description in markdown."
  })),
  owner: Schema.optional(NonEmptyString.annotations({
    description: "Owner exact email or display name. If omitted, uses the authenticated user."
  })),
  dueDate: Schema.optional(Timestamp.annotations({
    description: "Due date as Unix timestamp in milliseconds."
  })),
  priority: Schema.optional(TodoPrioritySchema.annotations({
    description: "Priority. Default: no-priority."
  })),
  visibility: Schema.optional(TodoVisibilitySchema.annotations({
    description: "Visibility. Default: private for personal ToDos, public for issue ToDos."
  })),
  attachedTo: Schema.optional(TodoAttachmentInputSchema.annotations({
    description: "Attachment target. If omitted, creates a personal ToDo."
  }))
}).annotations({
  title: "CreateTodoParams",
  description: "Create a personal or issue-attached Planner ToDo without requiring Huly class IDs."
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
  title: Schema.optional(TodoTitle.annotations({
    description: "New ToDo title."
  })),
  description: Schema.optional(clearableText("New ToDo description in markdown.")),
  owner: Schema.optional(NonEmptyString.annotations({
    description: "New owner exact email or display name."
  })),
  dueDate: Schema.optional(
    Schema.NullOr(Timestamp).annotations({
      description: "New due date timestamp, or null to clear."
    })
  ),
  priority: Schema.optional(TodoPrioritySchema),
  visibility: Schema.optional(TodoVisibilitySchema)
}).pipe(
  Schema.filter((params) =>
    hasAtLeastOneDefined(params, UPDATE_TODO_FIELDS) ? undefined : atLeastOneUpdateFieldMessage(UPDATE_TODO_FIELDS)
  )
).annotations({
  title: "UpdateTodoParams",
  description: `Parameters for updating a Planner ToDo. ${atLeastOneUpdateFieldMessage(UPDATE_TODO_FIELDS)}`
})
export type UpdateTodoParams = Schema.Schema.Type<typeof UpdateTodoParamsSchema>
assertUpdateFields<UpdateTodoParams>()(["locator"], UPDATE_TODO_FIELDS)

export const CompleteTodoParamsSchema = Schema.Struct({
  locator: TodoLocatorSchema,
  doneOn: Schema.optional(Timestamp.annotations({
    description: "Completion timestamp. If omitted, uses the current time."
  }))
}).annotations({
  title: "CompleteTodoParams",
  description: "Complete a Planner ToDo. Huly may trim future work slots and run issue automation."
})
export type CompleteTodoParams = Schema.Schema.Type<typeof CompleteTodoParamsSchema>

export const ReopenTodoParamsSchema = Schema.Struct({
  locator: TodoLocatorSchema
}).annotations({
  title: "ReopenTodoParams",
  description:
    "Reopen a completed Planner ToDo by clearing doneOn. Human locators search completed ToDos by default for this tool."
})
export type ReopenTodoParams = Schema.Schema.Type<typeof ReopenTodoParamsSchema>

export const DeleteTodoParamsSchema = Schema.Struct({
  locator: TodoLocatorSchema
}).annotations({
  title: "DeleteTodoParams",
  description: "Delete a Planner ToDo. Removing issue ToDos can trigger Huly issue automation."
})
export type DeleteTodoParams = Schema.Schema.Type<typeof DeleteTodoParamsSchema>

export const ScheduleTodoParamsSchema = Schema.Struct({
  locator: TodoLocatorSchema,
  date: Timestamp.annotations({
    description: "Work slot start timestamp."
  }),
  dueDate: Timestamp.annotations({
    description: "Work slot end timestamp."
  })
}).annotations({
  title: "ScheduleTodoParams",
  description: "Schedule a ToDo by raw ToDo ID or human locator."
})
export type ScheduleTodoParams = Schema.Schema.Type<typeof ScheduleTodoParamsSchema>

export const UnscheduleTodoParamsSchema = Schema.Union(
  Schema.Struct({
    workSlotId: WorkSlotId.annotations({
      description: "Specific work slot ID to remove."
    })
  }).annotations({
    description: "Remove one specific work slot by ID."
  }),
  Schema.Struct({
    locator: TodoLocatorSchema,
    scope: Schema.Literal("all").annotations({
      description: "Remove all work slots for the located ToDo."
    })
  }).annotations({
    description: "Remove all work slots for one ToDo."
  }),
  Schema.Struct({
    locator: TodoLocatorSchema,
    scope: Schema.Literal("future").annotations({
      description: "Remove future work slots for the located ToDo."
    }),
    from: Schema.optional(Timestamp.annotations({
      description: "Reference timestamp for future work slots. If omitted, uses current time."
    }))
  }).annotations({
    description: "Remove future work slots for one ToDo."
  })
).annotations({
  title: "UnscheduleTodoParams",
  description: "Remove ToDo work slots. Pass workSlotId, or pass locator with scope all/future."
})
export type UnscheduleTodoParams = Schema.Schema.Type<typeof UnscheduleTodoParamsSchema>

export type {
  CreateTodoResult,
  DeleteTodoResult,
  ScheduleTodoResult,
  TodoAttachmentSummary,
  TodoDetail,
  TodoMutationResult,
  TodoOwnerSummary,
  TodoSummary,
  UnscheduleTodoResult
} from "./planner-output.js"

const TodoOwnerSummarySchema = Schema.Struct({
  id: PersonId,
  name: Schema.optional(PersonName),
  email: Schema.optional(Email)
})

const TodoAttachmentSummarySchema = Schema.Union(
  Schema.Struct({ type: Schema.Literal("none") }),
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
  }).annotations({
    description: "Attached to a Huly object type this Planner tool does not resolve yet."
  })
)

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

export const TodoDetailSchema = Schema.extend(
  TodoSummarySchema,
  Schema.Struct({
    description: Schema.optional(Schema.String.annotations({
      description: "Markdown ToDo description; empty string is valid."
    })),
    attachedSpace: Schema.optional(SpaceId),
    createdOn: Schema.optional(Timestamp),
    modifiedOn: Schema.optional(Timestamp)
  })
)

export const CreateTodoResultSchema = Schema.Struct({
  todoId: TodoId
})
export const TodoMutationResultSchema = Schema.Struct({
  todoId: TodoId,
  updated: Schema.Boolean
})
export const UpdateTodoResultSchema = TodoMutationResultSchema
export const CompleteTodoResultSchema = TodoMutationResultSchema
export const ReopenTodoResultSchema = TodoMutationResultSchema
export const DeleteTodoResultSchema = Schema.Struct({
  todoId: TodoId,
  deleted: Schema.Boolean
})
export const ScheduleTodoResultSchema = Schema.Struct({
  todoId: TodoId,
  workSlotId: WorkSlotId
})
export const UnscheduleTodoResultSchema = Schema.Struct({
  todoId: Schema.optional(TodoId),
  removed: Count
})

export const ListTodosResultSchema = Schema.Array(TodoSummarySchema)

export const listTodosParamsJsonSchema = JSONSchema.make(ListTodosParamsSchema)
export const getTodoParamsJsonSchema = JSONSchema.make(GetTodoParamsSchema)
export const createTodoParamsJsonSchema = JSONSchema.make(CreateTodoParamsSchema)
export const updateTodoParamsJsonSchema = withAtLeastOneRequired(
  JSONSchema.make(UpdateTodoParamsSchema),
  UPDATE_TODO_FIELDS
)
export const completeTodoParamsJsonSchema = JSONSchema.make(CompleteTodoParamsSchema)
export const reopenTodoParamsJsonSchema = JSONSchema.make(ReopenTodoParamsSchema)
export const deleteTodoParamsJsonSchema = JSONSchema.make(DeleteTodoParamsSchema)
export const scheduleTodoParamsJsonSchema = JSONSchema.make(ScheduleTodoParamsSchema)
export const unscheduleTodoParamsJsonSchema = JSONSchema.make(UnscheduleTodoParamsSchema)

export const parseListTodosParams = Schema.decodeUnknown(ListTodosParamsSchema)
export const parseGetTodoParams = Schema.decodeUnknown(GetTodoParamsSchema)
export const parseCreateTodoParams = Schema.decodeUnknown(CreateTodoParamsSchema)
export const parseUpdateTodoParams = Schema.decodeUnknown(UpdateTodoParamsSchema)
export const parseCompleteTodoParams = Schema.decodeUnknown(CompleteTodoParamsSchema)
export const parseReopenTodoParams = Schema.decodeUnknown(ReopenTodoParamsSchema)
export const parseDeleteTodoParams = Schema.decodeUnknown(DeleteTodoParamsSchema)
export const parseScheduleTodoParams = Schema.decodeUnknown(ScheduleTodoParamsSchema)
export const parseUnscheduleTodoParams = Schema.decodeUnknown(UnscheduleTodoParamsSchema)
