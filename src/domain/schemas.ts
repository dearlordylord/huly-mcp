/**
 * Domain type schemas for Huly MCP server.
 *
 * Type-safe representations of Huly domain objects (issues, projects, people)
 * with validation
 * @module
 */
import { JSONSchema, Schema } from "effect"

const NonEmptyString = Schema.Trim.pipe(Schema.nonEmptyString())

const Timestamp = Schema.NonNegativeInt.annotations({
  identifier: "Timestamp",
  title: "Timestamp",
  description: "Unix timestamp in milliseconds (non-negative integer)"
})

export const IssuePriorityValues = ["urgent", "high", "medium", "low", "no-priority"] as const

export const IssuePrioritySchema = Schema.Literal(...IssuePriorityValues).annotations({
  title: "IssuePriority",
  description: "Issue priority level"
})

export type IssuePriority = Schema.Schema.Type<typeof IssuePrioritySchema>

export const LabelSchema = Schema.Struct({
  title: NonEmptyString,
  color: Schema.optional(Schema.Number)
}).annotations({
  title: "Label",
  description: "Issue label/tag"
})

export type Label = Schema.Schema.Type<typeof LabelSchema>

export const PersonRefSchema = Schema.Struct({
  id: NonEmptyString,
  name: Schema.optional(Schema.String),
  email: Schema.optional(Schema.String)
}).annotations({
  title: "PersonRef",
  description: "Reference to a person (assignee, reporter)"
})

export type PersonRef = Schema.Schema.Type<typeof PersonRefSchema>

export const ProjectSummarySchema = Schema.Struct({
  identifier: NonEmptyString,
  name: Schema.String,
  description: Schema.optional(Schema.String),
  archived: Schema.Boolean
}).annotations({
  title: "ProjectSummary",
  description: "Project summary for list operations"
})

export type ProjectSummary = Schema.Schema.Type<typeof ProjectSummarySchema>

export const ListProjectsParamsSchema = Schema.Struct({
  includeArchived: Schema.optional(Schema.Boolean.annotations({
    description: "Include archived projects in results (default: false, showing only active)"
  })),
  limit: Schema.optional(
    Schema.Number.pipe(
      Schema.int(),
      Schema.positive(),
      Schema.lessThanOrEqualTo(200)
    ).annotations({
      description: "Maximum number of projects to return (default: 50)"
    })
  )
}).annotations({
  title: "ListProjectsParams",
  description: "Parameters for listing projects"
})

export type ListProjectsParams = Schema.Schema.Type<typeof ListProjectsParamsSchema>

export const ListProjectsResultSchema = Schema.Struct({
  projects: Schema.Array(ProjectSummarySchema),
  total: Schema.Number.pipe(Schema.int(), Schema.nonNegative())
}).annotations({
  title: "ListProjectsResult",
  description: "Result of listing projects"
})

export type ListProjectsResult = Schema.Schema.Type<typeof ListProjectsResultSchema>

export const ProjectSchema = Schema.Struct({
  identifier: NonEmptyString,
  name: Schema.String,
  description: Schema.optional(Schema.String),
  defaultStatus: Schema.optional(Schema.String),
  statuses: Schema.optional(Schema.Array(Schema.String))
}).annotations({
  title: "Project",
  description: "Full project with status information"
})

export type Project = Schema.Schema.Type<typeof ProjectSchema>

export const IssueSummarySchema = Schema.Struct({
  identifier: NonEmptyString,
  title: Schema.String,
  status: Schema.String,
  priority: Schema.optional(IssuePrioritySchema),
  assignee: Schema.optional(Schema.String),
  modifiedOn: Schema.optional(Timestamp)
}).annotations({
  title: "IssueSummary",
  description: "Issue summary for list operations"
})

export type IssueSummary = Schema.Schema.Type<typeof IssueSummarySchema>

export const IssueSchema = Schema.Struct({
  identifier: NonEmptyString,
  title: Schema.String,
  description: Schema.optional(Schema.String),
  status: Schema.String,
  priority: Schema.optional(IssuePrioritySchema),
  assignee: Schema.optional(Schema.String),
  assigneeRef: Schema.optional(PersonRefSchema),
  labels: Schema.optional(Schema.Array(LabelSchema)),
  project: NonEmptyString,
  modifiedOn: Schema.optional(Timestamp),
  createdOn: Schema.optional(Timestamp),
  dueDate: Schema.optional(Schema.NullOr(Timestamp)),
  estimation: Schema.optional(Schema.Number)
}).annotations({
  title: "Issue",
  description: "Full issue with all fields"
})

export type Issue = Schema.Schema.Type<typeof IssueSchema>

export const ListIssuesParamsSchema = Schema.Struct({
  project: NonEmptyString.annotations({
    description: "Project identifier (e.g., 'HULY')"
  }),
  status: Schema.optional(Schema.String.annotations({
    description: "Filter by status name"
  })),
  assignee: Schema.optional(Schema.String.annotations({
    description: "Filter by assignee email"
  })),
  limit: Schema.optional(
    Schema.Number.pipe(
      Schema.int(),
      Schema.positive(),
      Schema.lessThanOrEqualTo(200)
    ).annotations({
      description: "Maximum number of issues to return (default: 50)"
    })
  )
}).annotations({
  title: "ListIssuesParams",
  description: "Parameters for listing issues"
})

export type ListIssuesParams = Schema.Schema.Type<typeof ListIssuesParamsSchema>

export const GetIssueParamsSchema = Schema.Struct({
  project: NonEmptyString.annotations({
    description: "Project identifier (e.g., 'HULY')"
  }),
  identifier: NonEmptyString.annotations({
    description: "Issue identifier (e.g., 'HULY-123')"
  })
}).annotations({
  title: "GetIssueParams",
  description: "Parameters for getting a single issue"
})

export type GetIssueParams = Schema.Schema.Type<typeof GetIssueParamsSchema>

export const CreateIssueParamsSchema = Schema.Struct({
  project: NonEmptyString.annotations({
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
  assignee: Schema.optional(Schema.String.annotations({
    description: "Assignee email address"
  })),
  status: Schema.optional(Schema.String.annotations({
    description: "Initial status (uses project default if not specified)"
  }))
}).annotations({
  title: "CreateIssueParams",
  description: "Parameters for creating an issue"
})

export type CreateIssueParams = Schema.Schema.Type<typeof CreateIssueParamsSchema>

export const UpdateIssueParamsSchema = Schema.Struct({
  project: NonEmptyString.annotations({
    description: "Project identifier (e.g., 'HULY')"
  }),
  identifier: NonEmptyString.annotations({
    description: "Issue identifier (e.g., 'HULY-123')"
  }),
  title: Schema.optional(NonEmptyString.annotations({
    description: "New issue title"
  })),
  description: Schema.optional(Schema.String.annotations({
    description: "New issue description (markdown supported)"
  })),
  priority: Schema.optional(IssuePrioritySchema.annotations({
    description: "New issue priority"
  })),
  assignee: Schema.optional(
    Schema.NullOr(Schema.String).annotations({
      description: "New assignee email (null to unassign)"
    })
  ),
  status: Schema.optional(Schema.String.annotations({
    description: "New status"
  }))
}).annotations({
  title: "UpdateIssueParams",
  description: "Parameters for updating an issue"
})

export type UpdateIssueParams = Schema.Schema.Type<typeof UpdateIssueParamsSchema>

export const AddLabelParamsSchema = Schema.Struct({
  project: NonEmptyString.annotations({
    description: "Project identifier (e.g., 'HULY')"
  }),
  identifier: NonEmptyString.annotations({
    description: "Issue identifier (e.g., 'HULY-123')"
  }),
  label: NonEmptyString.annotations({
    description: "Label name to add"
  }),
  color: Schema.optional(
    Schema.Number.pipe(
      Schema.int(),
      Schema.greaterThanOrEqualTo(0),
      Schema.lessThanOrEqualTo(9)
    ).annotations({
      description: "Color code (0-9, default: 0)"
    })
  )
}).annotations({
  title: "AddLabelParams",
  description: "Parameters for adding a label to an issue"
})

export type AddLabelParams = Schema.Schema.Type<typeof AddLabelParamsSchema>

export const DeleteIssueParamsSchema = Schema.Struct({
  project: NonEmptyString.annotations({
    description: "Project identifier (e.g., 'HULY')"
  }),
  identifier: NonEmptyString.annotations({
    description: "Issue identifier (e.g., 'HULY-123')"
  })
}).annotations({
  title: "DeleteIssueParams",
  description: "Parameters for deleting an issue"
})

export type DeleteIssueParams = Schema.Schema.Type<typeof DeleteIssueParamsSchema>

export const makeJsonSchema = <A, I, R>(
  schema: Schema.Schema<A, I, R>
): ReturnType<typeof JSONSchema.make> => JSONSchema.make(schema)

export const listProjectsParamsJsonSchema = makeJsonSchema(ListProjectsParamsSchema)
export const listIssuesParamsJsonSchema = makeJsonSchema(ListIssuesParamsSchema)
export const getIssueParamsJsonSchema = makeJsonSchema(GetIssueParamsSchema)
export const createIssueParamsJsonSchema = makeJsonSchema(CreateIssueParamsSchema)
export const updateIssueParamsJsonSchema = makeJsonSchema(UpdateIssueParamsSchema)
export const addLabelParamsJsonSchema = makeJsonSchema(AddLabelParamsSchema)
export const deleteIssueParamsJsonSchema = makeJsonSchema(DeleteIssueParamsSchema)


export const parseIssue = Schema.decodeUnknown(IssueSchema)

export const parseIssueSummary = Schema.decodeUnknown(IssueSummarySchema)

export const parseProject = Schema.decodeUnknown(ProjectSchema)

export const parseListIssuesParams = Schema.decodeUnknown(ListIssuesParamsSchema)

export const parseGetIssueParams = Schema.decodeUnknown(GetIssueParamsSchema)

export const parseCreateIssueParams = Schema.decodeUnknown(CreateIssueParamsSchema)

export const parseUpdateIssueParams = Schema.decodeUnknown(UpdateIssueParamsSchema)

export const parseAddLabelParams = Schema.decodeUnknown(AddLabelParamsSchema)

export const parseListProjectsParams = Schema.decodeUnknown(ListProjectsParamsSchema)

export const parseDeleteIssueParams = Schema.decodeUnknown(DeleteIssueParamsSchema)
