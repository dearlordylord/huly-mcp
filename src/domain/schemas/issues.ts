import { JSONSchema, ParseResult, Schema } from "effect"

import { normalizeForComparison } from "../../utils/normalize.js"
import { clearableText } from "./clearable.js"
import {
  assertUpdateFields,
  atLeastOneUpdateFieldMessage,
  ColorCode,
  ComponentIdentifier,
  Count,
  DEFAULT_COLOR_INDEX,
  DEFAULT_LIMIT,
  Email,
  enumValuesDescription,
  hasAtLeastOneDefined,
  IssueId,
  IssueIdentifier,
  LimitParam,
  MAX_COLOR_INDEX,
  NonEmptyString,
  PersonId,
  PersonName,
  PersonRefInput,
  PositiveNumber,
  ProjectIdentifier,
  StatusName,
  Timestamp,
  withAtLeastOneRequired
} from "./shared.js"
import {
  type KnownStatusCategoryValue,
  KnownStatusCategoryValueSchema,
  StatusCategoryValues,
  TaskTypeRefSchema
} from "./task-management.js"

export type IssueStatusCategoryFilter = KnownStatusCategoryValue

export const IssuePriorityValues = ["urgent", "high", "medium", "low", "no-priority"] as const

const IssuePriorityLiteral = Schema.Literal(...IssuePriorityValues)

const normalizedPriorityLookup = new Map(
  IssuePriorityValues.map(v => [normalizeForComparison(v), v] as const)
)

export const IssuePrioritySchema = Schema.transformOrFail(
  Schema.String,
  IssuePriorityLiteral,
  {
    strict: true,
    decode: (input, _options, ast) => {
      const match = normalizedPriorityLookup.get(normalizeForComparison(input))
      return match !== undefined
        ? ParseResult.succeed(match)
        : ParseResult.fail(
          new ParseResult.Type(ast, input, `Expected one of: ${enumValuesDescription(IssuePriorityValues)}`)
        )
    },
    encode: ParseResult.succeed
  }
).annotations({
  title: "IssuePriority",
  description: `Issue priority level: ${enumValuesDescription(IssuePriorityValues)}`,
  jsonSchema: { type: "string", enum: [...IssuePriorityValues] }
})

export type IssuePriority = Schema.Schema.Type<typeof IssuePrioritySchema>
export const DEFAULT_ISSUE_PRIORITY: IssuePriority = "no-priority"

export const LabelSchema = Schema.Struct({
  title: NonEmptyString,
  color: Schema.optional(ColorCode)
}).annotations({
  title: "Label",
  description: "Issue label/tag"
})

export type Label = Schema.Schema.Type<typeof LabelSchema>

export const PersonRefSchema = Schema.Struct({
  id: PersonId,
  name: Schema.optional(PersonName),
  email: Schema.optional(Email)
}).annotations({
  title: "PersonRef",
  description: "Reference to a person (assignee, reporter)"
})

export type PersonRef = Schema.Schema.Type<typeof PersonRefSchema>

const IssueIdOutputSchema = IssueId.annotations({
  description:
    "Raw Huly issue _id. For raw objectId/objectClass tools, pair this with objectClass 'tracker:class:Issue'. Prefer friendly issue locators when a tool provides them."
})

export const IssueSummarySchema = Schema.Struct({
  issueId: IssueIdOutputSchema,
  identifier: IssueIdentifier,
  // String, not NonEmptyString: Huly allows storing issues with empty titles
  title: Schema.String,
  status: StatusName,
  priority: Schema.optional(IssuePrioritySchema),
  assignee: Schema.optional(PersonName),
  parentIssue: Schema.optional(IssueIdentifier),
  subIssues: Schema.optional(Count),
  modifiedOn: Schema.optional(Timestamp)
}).annotations({
  title: "IssueSummary",
  description: "Issue summary for list operations"
})

export type IssueSummary = Schema.Schema.Type<typeof IssueSummarySchema>

export const IssueSchema = Schema.Struct({
  issueId: IssueIdOutputSchema,
  identifier: IssueIdentifier,
  // String, not NonEmptyString: Huly allows storing issues with empty titles
  title: Schema.String,
  description: Schema.optional(Schema.String),
  status: StatusName,
  priority: Schema.optional(IssuePrioritySchema),
  assignee: Schema.optional(PersonName),
  assigneeRef: Schema.optional(PersonRefSchema),
  labels: Schema.optional(Schema.Array(LabelSchema)),
  project: ProjectIdentifier,
  parentIssue: Schema.optional(IssueIdentifier),
  subIssues: Schema.optional(Count),
  modifiedOn: Schema.optional(Timestamp),
  createdOn: Schema.optional(Timestamp),
  dueDate: Schema.optional(Schema.NullOr(Timestamp)),
  estimation: Schema.optional(PositiveNumber)
}).annotations({
  title: "Issue",
  description: "Full issue with all fields"
})

export type Issue = Schema.Schema.Type<typeof IssueSchema>

const ListIssuesParamsBase = Schema.Struct({
  project: ProjectIdentifier.annotations({
    description: "Project identifier (e.g., 'HULY')"
  }),
  status: Schema.optional(StatusName.annotations({
    description: "Filter by exact workflow status name. Does not accept category aliases."
  })),
  statusCategory: Schema.optional(KnownStatusCategoryValueSchema.annotations({
    description: `Filter by Huly SDK task.statusCategory key: ${
      enumValuesDescription(StatusCategoryValues)
    }. Use status for exact project-specific status names.`
  })),
  assignee: Schema.optional(PersonRefInput.annotations({
    description: "Filter by assignee email or display name"
  })),
  parentIssue: Schema.optional(IssueIdentifier.annotations({
    description: "Filter to children of this parent issue (e.g., 'HULY-42')"
  })),
  titleSearch: Schema.optional(Schema.String.annotations({
    description: "Search issues by title substring (case-insensitive). Mutually exclusive with titleRegex."
  })),
  titleRegex: Schema.optional(Schema.String.annotations({
    description:
      "Filter issues by title using Huly $regex. On the supported Postgres backend this is SQL SIMILAR TO, not JavaScript RegExp; matching is case-sensitive and the pattern must match the whole title: use '%' for any string (e.g., '%BUG%' contains, 'BUG%' prefix). Mutually exclusive with titleSearch; use titleSearch for simple substring matching."
  })),
  descriptionSearch: Schema.optional(Schema.String.annotations({
    description: "Search issues by description content (fulltext search)"
  })),
  component: Schema.optional(ComponentIdentifier.annotations({
    description: "Filter by component ID or label"
  })),
  hasAssignee: Schema.optional(Schema.Boolean.annotations({
    description: "Filter by assignee presence. true = only assigned issues, false = only unassigned issues."
  })),
  hasDueDate: Schema.optional(Schema.Boolean.annotations({
    description: "Filter by due date presence. true = only issues with a due date, false = only issues without."
  })),
  hasComponent: Schema.optional(Schema.Boolean.annotations({
    description: "Filter by component presence. true = only issues with a component, false = only issues without."
  })),
  isTopLevel: Schema.optional(Schema.Boolean.annotations({
    description: "When true, only return top-level issues (not sub-issues). false or omitted returns all issues."
  })),
  limit: Schema.optional(
    LimitParam.annotations({
      description: `Maximum number of issues to return (default: ${DEFAULT_LIMIT})`
    })
  )
})

export const ListIssuesParamsSchema = ListIssuesParamsBase.pipe(
  Schema.filter((params) => {
    if (params.titleSearch !== undefined && params.titleRegex !== undefined) {
      return "Cannot provide both 'titleSearch' and 'titleRegex'. Use one or the other."
    }
    if (params.status !== undefined && params.statusCategory !== undefined) {
      return "Cannot provide both 'status' and 'statusCategory'. Use status for exact workflow status names or statusCategory for Huly workflow categories."
    }
    if (params.assignee !== undefined && params.hasAssignee !== undefined) {
      return "Cannot provide both 'assignee' and 'hasAssignee'. Use one or the other."
    }
    if (params.component !== undefined && params.hasComponent !== undefined) {
      return "Cannot provide both 'component' and 'hasComponent'. Use one or the other."
    }
    if (params.parentIssue !== undefined && params.isTopLevel === true) {
      return "Cannot provide both 'parentIssue' and 'isTopLevel: true'. parentIssue requests children; isTopLevel requests parentless issues."
    }
    return undefined
  })
).annotations({
  title: "ListIssuesParams",
  description: "Parameters for listing issues"
})

export type ListIssuesParams = Schema.Schema.Type<typeof ListIssuesParamsSchema>

export const GetIssueParamsSchema = Schema.Struct({
  project: ProjectIdentifier.annotations({
    description: "Project identifier (e.g., 'HULY')"
  }),
  identifier: IssueIdentifier.annotations({
    description: "Issue identifier (e.g., 'HULY-123')"
  })
}).annotations({
  title: "GetIssueParams",
  description: "Parameters for getting a single issue"
})

export type GetIssueParams = Schema.Schema.Type<typeof GetIssueParamsSchema>

export const CreateIssueParamsSchema = Schema.Struct({
  project: ProjectIdentifier.annotations({
    description: "Project identifier (e.g., 'HULY')"
  }),
  title: NonEmptyString.annotations({
    description: "Issue title"
  }),
  description: Schema.optional(Schema.String.annotations({
    description: "Issue description (markdown supported)"
  })),
  priority: Schema.optional(IssuePrioritySchema.annotations({
    description: "Issue priority (urgent, high, medium, low, no-priority)"
  })),
  assignee: Schema.optional(PersonRefInput.annotations({
    description: "Assignee email address or display name"
  })),
  status: Schema.optional(StatusName.annotations({
    description: "Initial status (uses project default if not specified)"
  })),
  taskType: Schema.optional(TaskTypeRefSchema.annotations({
    description:
      "Issue/task type ID or display name. Resolved within the target project's project type; use list_task_types or get_project_type to discover valid values. If omitted, creates the default Issue type."
  })),
  parentIssue: Schema.optional(IssueIdentifier.annotations({
    description: "Parent issue identifier (e.g., 'HULY-42') to create as sub-issue"
  })),
  dueDate: Schema.optional(
    Schema.NullOr(Timestamp).annotations({
      description: "Due date as Unix timestamp in milliseconds (e.g., 1719792000000 for 2024-07-01), or null to clear"
    })
  ),
  estimation: Schema.optional(PositiveNumber.annotations({
    description: "Time estimation in minutes"
  }))
}).annotations({
  title: "CreateIssueParams",
  description: "Parameters for creating an issue"
})

export type CreateIssueParams = Schema.Schema.Type<typeof CreateIssueParamsSchema>

export const UPDATE_ISSUE_FIELDS = [
  "title",
  "description",
  "priority",
  "assignee",
  "status",
  "taskType",
  "dueDate",
  "estimation"
] as const satisfies ReadonlyArray<
  "title" | "description" | "priority" | "assignee" | "status" | "taskType" | "dueDate" | "estimation"
>

export const UpdateIssueParamsSchema = Schema.Struct({
  project: ProjectIdentifier.annotations({
    description: "Project identifier (e.g., 'HULY')"
  }),
  identifier: IssueIdentifier.annotations({
    description: "Issue identifier (e.g., 'HULY-123')"
  }),
  title: Schema.optional(NonEmptyString.annotations({
    description: "New issue title"
  })),
  description: Schema.optional(clearableText("New issue description (markdown supported).")),
  priority: Schema.optional(IssuePrioritySchema.annotations({
    description: "New issue priority"
  })),
  assignee: Schema.optional(
    Schema.NullOr(PersonRefInput).annotations({
      description: "New assignee email or display name (null to unassign)"
    })
  ),
  status: Schema.optional(StatusName.annotations({
    description: "New status"
  })),
  taskType: Schema.optional(TaskTypeRefSchema.annotations({
    description:
      "New issue/task type ID or display name. Resolved within the target project's project type; status is preserved only if valid for that task type. Use list_task_types or get_project_type to discover valid values."
  })),
  dueDate: Schema.optional(
    Schema.NullOr(Timestamp).annotations({
      description: "Due date as Unix timestamp in milliseconds (e.g., 1719792000000 for 2024-07-01), or null to clear"
    })
  ),
  estimation: Schema.optional(
    Schema.NullOr(PositiveNumber).annotations({
      description: "Time estimation in minutes, or null to clear"
    })
  )
}).pipe(
  Schema.filter((params) =>
    hasAtLeastOneDefined(params, UPDATE_ISSUE_FIELDS) ? undefined : atLeastOneUpdateFieldMessage(UPDATE_ISSUE_FIELDS)
  )
).annotations({
  title: "UpdateIssueParams",
  description: `Parameters for updating an issue. ${atLeastOneUpdateFieldMessage(UPDATE_ISSUE_FIELDS)}`
})

export type UpdateIssueParams = Schema.Schema.Type<typeof UpdateIssueParamsSchema>
assertUpdateFields<UpdateIssueParams>()(["project", "identifier"], UPDATE_ISSUE_FIELDS)

export const AddLabelParamsSchema = Schema.Struct({
  project: ProjectIdentifier.annotations({
    description: "Project identifier (e.g., 'HULY')"
  }),
  identifier: IssueIdentifier.annotations({
    description: "Issue identifier (e.g., 'HULY-123')"
  }),
  label: NonEmptyString.annotations({
    description: "Label name to add"
  }),
  color: Schema.optional(
    ColorCode.annotations({
      description:
        `Huly platform color palette index from 0 through ${MAX_COLOR_INDEX} (default: ${DEFAULT_COLOR_INDEX})`
    })
  )
}).annotations({
  title: "AddLabelParams",
  description: "Parameters for adding a label to an issue"
})

export type AddLabelParams = Schema.Schema.Type<typeof AddLabelParamsSchema>

export const DeleteIssueParamsSchema = Schema.Struct({
  project: ProjectIdentifier.annotations({
    description: "Project identifier (e.g., 'HULY')"
  }),
  identifier: IssueIdentifier.annotations({
    description: "Issue identifier (e.g., 'HULY-123')"
  })
}).annotations({
  title: "DeleteIssueParams",
  description: "Parameters for deleting an issue"
})

export type DeleteIssueParams = Schema.Schema.Type<typeof DeleteIssueParamsSchema>

export const RemoveLabelParamsSchema = Schema.Struct({
  project: ProjectIdentifier.annotations({
    description: "Project identifier (e.g., 'HULY')"
  }),
  identifier: IssueIdentifier.annotations({
    description: "Issue identifier (e.g., 'HULY-123')"
  }),
  label: NonEmptyString.annotations({
    description: "Label name to remove"
  })
}).annotations({
  title: "RemoveLabelParams",
  description: "Parameters for removing a label from an issue"
})

export type RemoveLabelParams = Schema.Schema.Type<typeof RemoveLabelParamsSchema>

export const MoveIssueParamsSchema = Schema.Struct({
  project: ProjectIdentifier.annotations({
    description: "Project identifier (e.g., 'HULY')"
  }),
  identifier: IssueIdentifier.annotations({
    description: "Issue to move (e.g., 'HULY-123')"
  }),
  newParent: Schema.NullOr(IssueIdentifier).annotations({
    description: "New parent issue identifier, or null to make top-level"
  })
}).annotations({
  title: "MoveIssueParams",
  description: "Parameters for moving an issue to a new parent or to top-level"
})

export type MoveIssueParams = Schema.Schema.Type<typeof MoveIssueParamsSchema>

export const listIssuesParamsJsonSchema = JSONSchema.make(ListIssuesParamsSchema)
export const getIssueParamsJsonSchema = JSONSchema.make(GetIssueParamsSchema)
export const createIssueParamsJsonSchema = JSONSchema.make(CreateIssueParamsSchema)
export const updateIssueParamsJsonSchema = withAtLeastOneRequired(
  JSONSchema.make(UpdateIssueParamsSchema),
  UPDATE_ISSUE_FIELDS
)
export const addLabelParamsJsonSchema = JSONSchema.make(AddLabelParamsSchema)
export const removeLabelParamsJsonSchema = JSONSchema.make(RemoveLabelParamsSchema)
export const deleteIssueParamsJsonSchema = JSONSchema.make(DeleteIssueParamsSchema)
export const moveIssueParamsJsonSchema = JSONSchema.make(MoveIssueParamsSchema)

export const parseIssue = Schema.decodeUnknown(IssueSchema)
export const parseIssueSummary = Schema.decodeUnknown(IssueSummarySchema)
export const parseListIssuesParams = Schema.decodeUnknown(ListIssuesParamsSchema)
export const parseGetIssueParams = Schema.decodeUnknown(GetIssueParamsSchema)
export const parseCreateIssueParams = Schema.decodeUnknown(CreateIssueParamsSchema)
export const parseUpdateIssueParams = Schema.decodeUnknown(UpdateIssueParamsSchema)
export const parseAddLabelParams = Schema.decodeUnknown(AddLabelParamsSchema)
export const parseRemoveLabelParams = Schema.decodeUnknown(RemoveLabelParamsSchema)
export const parseDeleteIssueParams = Schema.decodeUnknown(DeleteIssueParamsSchema)
export const parseMoveIssueParams = Schema.decodeUnknown(MoveIssueParamsSchema)
