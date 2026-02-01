/**
 * Domain type schemas for Huly MCP server.
 *
 * Type-safe representations of Huly domain objects (issues, projects, people)
 * with validation. Schemas enable:
 * - Parsing Huly API responses into typed objects
 * - Validating MCP tool parameters
 * - JSON Schema generation for MCP tool definitions
 *
 * @module
 */
import { JSONSchema, Schema } from "effect"

// --- Primitive Schemas ---

/**
 * Non-empty string schema that trims whitespace before validation.
 * Uses built-in Schema.Trim transformation followed by nonEmptyString filter.
 */
const NonEmptyString = Schema.Trim.pipe(Schema.nonEmptyString())

/**
 * ISO timestamp schema (number representing milliseconds since epoch).
 * Uses built-in Schema.NonNegativeInt for cleaner definition.
 */
const Timestamp = Schema.NonNegativeInt.annotations({
  identifier: "Timestamp",
  title: "Timestamp",
  description: "Unix timestamp in milliseconds (non-negative integer)",
})

// --- Priority Schema ---

/**
 * Issue priority values.
 * Maps to Huly IssuePriority enum: NoPriority=0, Urgent=1, High=2, Medium=3, Low=4
 */
export const IssuePriorityValues = ["urgent", "high", "medium", "low", "no-priority"] as const

/**
 * Issue priority schema.
 */
export const IssuePrioritySchema = Schema.Literal(...IssuePriorityValues).annotations({
  title: "IssuePriority",
  description: "Issue priority level",
})

export type IssuePriority = Schema.Schema.Type<typeof IssuePrioritySchema>

// --- Label Schema ---

/**
 * Label schema for issue tags/labels.
 */
export const LabelSchema = Schema.Struct({
  title: NonEmptyString,
  color: Schema.optional(Schema.Number),
}).annotations({
  title: "Label",
  description: "Issue label/tag",
})

export type Label = Schema.Schema.Type<typeof LabelSchema>

// --- Person Schema ---

/**
 * Person reference schema (assignee, reporter).
 */
export const PersonRefSchema = Schema.Struct({
  id: NonEmptyString,
  name: Schema.optional(Schema.String),
  email: Schema.optional(Schema.String),
}).annotations({
  title: "PersonRef",
  description: "Reference to a person (assignee, reporter)",
})

export type PersonRef = Schema.Schema.Type<typeof PersonRefSchema>

// --- Project Schema ---

/**
 * Project summary schema for list operations.
 */
export const ProjectSummarySchema = Schema.Struct({
  identifier: NonEmptyString,
  name: Schema.String,
  description: Schema.optional(Schema.String),
  archived: Schema.Boolean,
}).annotations({
  title: "ProjectSummary",
  description: "Project summary for list operations",
})

export type ProjectSummary = Schema.Schema.Type<typeof ProjectSummarySchema>

/**
 * Parameters for list_projects tool.
 */
export const ListProjectsParamsSchema = Schema.Struct({
  includeArchived: Schema.optional(Schema.Boolean.annotations({
    description: "Include archived projects in results (default: false, showing only active)",
  })),
  limit: Schema.optional(Schema.Number.pipe(
    Schema.int(),
    Schema.positive()
  ).annotations({
    description: "Maximum number of projects to return (default: 50)",
  })),
}).annotations({
  title: "ListProjectsParams",
  description: "Parameters for listing projects",
})

export type ListProjectsParams = Schema.Schema.Type<typeof ListProjectsParamsSchema>

/**
 * Result schema for list_projects tool.
 */
export const ListProjectsResultSchema = Schema.Struct({
  projects: Schema.Array(ProjectSummarySchema),
  total: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
}).annotations({
  title: "ListProjectsResult",
  description: "Result of listing projects",
})

export type ListProjectsResult = Schema.Schema.Type<typeof ListProjectsResultSchema>

/**
 * Full project schema with statuses.
 */
export const ProjectSchema = Schema.Struct({
  identifier: NonEmptyString,
  name: Schema.String,
  description: Schema.optional(Schema.String),
  defaultStatus: Schema.optional(Schema.String),
  statuses: Schema.optional(Schema.Array(Schema.String)),
}).annotations({
  title: "Project",
  description: "Full project with status information",
})

export type Project = Schema.Schema.Type<typeof ProjectSchema>

// --- Issue Schemas ---

/**
 * Issue summary schema for list operations.
 * Lighter weight than full Issue - used when listing multiple issues.
 */
export const IssueSummarySchema = Schema.Struct({
  identifier: NonEmptyString,
  title: Schema.String,
  status: Schema.String,
  priority: Schema.optional(IssuePrioritySchema),
  assignee: Schema.optional(Schema.String),
  modifiedOn: Schema.optional(Timestamp),
}).annotations({
  title: "IssueSummary",
  description: "Issue summary for list operations",
})

export type IssueSummary = Schema.Schema.Type<typeof IssueSummarySchema>

/**
 * Full issue schema with all fields.
 */
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
  estimation: Schema.optional(Schema.Number),
}).annotations({
  title: "Issue",
  description: "Full issue with all fields",
})

export type Issue = Schema.Schema.Type<typeof IssueSchema>

// --- MCP Tool Parameter Schemas ---

/**
 * Parameters for list_issues tool.
 */
export const ListIssuesParamsSchema = Schema.Struct({
  project: NonEmptyString.annotations({
    description: "Project identifier (e.g., 'HULY')",
  }),
  status: Schema.optional(Schema.String.annotations({
    description: "Filter by status name",
  })),
  assignee: Schema.optional(Schema.String.annotations({
    description: "Filter by assignee email",
  })),
  limit: Schema.optional(Schema.Number.pipe(
    Schema.int(),
    Schema.positive()
  ).annotations({
    description: "Maximum number of issues to return (default: 20)",
  })),
}).annotations({
  title: "ListIssuesParams",
  description: "Parameters for listing issues",
})

export type ListIssuesParams = Schema.Schema.Type<typeof ListIssuesParamsSchema>

/**
 * Parameters for get_issue tool.
 */
export const GetIssueParamsSchema = Schema.Struct({
  project: NonEmptyString.annotations({
    description: "Project identifier (e.g., 'HULY')",
  }),
  identifier: NonEmptyString.annotations({
    description: "Issue identifier (e.g., 'HULY-123')",
  }),
}).annotations({
  title: "GetIssueParams",
  description: "Parameters for getting a single issue",
})

export type GetIssueParams = Schema.Schema.Type<typeof GetIssueParamsSchema>

/**
 * Parameters for create_issue tool.
 */
export const CreateIssueParamsSchema = Schema.Struct({
  project: NonEmptyString.annotations({
    description: "Project identifier (e.g., 'HULY')",
  }),
  title: NonEmptyString.annotations({
    description: "Issue title",
  }),
  description: Schema.optional(Schema.String.annotations({
    description: "Issue description (markdown supported)",
  })),
  priority: Schema.optional(IssuePrioritySchema.annotations({
    description: "Issue priority (urgent, high, medium, low, no-priority)",
  })),
  assignee: Schema.optional(Schema.String.annotations({
    description: "Assignee email address",
  })),
  status: Schema.optional(Schema.String.annotations({
    description: "Initial status (uses project default if not specified)",
  })),
}).annotations({
  title: "CreateIssueParams",
  description: "Parameters for creating an issue",
})

export type CreateIssueParams = Schema.Schema.Type<typeof CreateIssueParamsSchema>

/**
 * Parameters for update_issue tool.
 */
export const UpdateIssueParamsSchema = Schema.Struct({
  project: NonEmptyString.annotations({
    description: "Project identifier (e.g., 'HULY')",
  }),
  identifier: NonEmptyString.annotations({
    description: "Issue identifier (e.g., 'HULY-123')",
  }),
  title: Schema.optional(NonEmptyString.annotations({
    description: "New issue title",
  })),
  description: Schema.optional(Schema.String.annotations({
    description: "New issue description (markdown supported)",
  })),
  priority: Schema.optional(IssuePrioritySchema.annotations({
    description: "New issue priority",
  })),
  assignee: Schema.optional(Schema.NullOr(Schema.String).annotations({
    description: "New assignee email (null to unassign)",
  })),
  status: Schema.optional(Schema.String.annotations({
    description: "New status",
  })),
}).annotations({
  title: "UpdateIssueParams",
  description: "Parameters for updating an issue",
})

export type UpdateIssueParams = Schema.Schema.Type<typeof UpdateIssueParamsSchema>

/**
 * Parameters for add_label tool.
 */
export const AddLabelParamsSchema = Schema.Struct({
  project: NonEmptyString.annotations({
    description: "Project identifier (e.g., 'HULY')",
  }),
  identifier: NonEmptyString.annotations({
    description: "Issue identifier (e.g., 'HULY-123')",
  }),
  label: NonEmptyString.annotations({
    description: "Label name to add",
  }),
  color: Schema.optional(Schema.Number.pipe(
    Schema.int(),
    Schema.greaterThanOrEqualTo(0),
    Schema.lessThanOrEqualTo(9)
  ).annotations({
    description: "Color code (0-9, default: 0)",
  })),
}).annotations({
  title: "AddLabelParams",
  description: "Parameters for adding a label to an issue",
})

export type AddLabelParams = Schema.Schema.Type<typeof AddLabelParamsSchema>

// --- JSON Schema Generation ---

/**
 * Generate JSON Schema from an Effect Schema.
 * Use for MCP tool parameter definitions.
 */
export const makeJsonSchema = <A, I, R>(
  schema: Schema.Schema<A, I, R>
): ReturnType<typeof JSONSchema.make> => JSONSchema.make(schema)

// Pre-generated JSON schemas for MCP tools
export const listProjectsParamsJsonSchema = makeJsonSchema(ListProjectsParamsSchema)
export const listIssuesParamsJsonSchema = makeJsonSchema(ListIssuesParamsSchema)
export const getIssueParamsJsonSchema = makeJsonSchema(GetIssueParamsSchema)
export const createIssueParamsJsonSchema = makeJsonSchema(CreateIssueParamsSchema)
export const updateIssueParamsJsonSchema = makeJsonSchema(UpdateIssueParamsSchema)
export const addLabelParamsJsonSchema = makeJsonSchema(AddLabelParamsSchema)

// --- Parsing Utilities ---

/**
 * Parse unknown data into an Issue.
 */
export const parseIssue = Schema.decodeUnknown(IssueSchema)

/**
 * Parse unknown data into an IssueSummary.
 */
export const parseIssueSummary = Schema.decodeUnknown(IssueSummarySchema)

/**
 * Parse unknown data into a Project.
 */
export const parseProject = Schema.decodeUnknown(ProjectSchema)

/**
 * Parse unknown data into ListIssuesParams.
 */
export const parseListIssuesParams = Schema.decodeUnknown(ListIssuesParamsSchema)

/**
 * Parse unknown data into GetIssueParams.
 */
export const parseGetIssueParams = Schema.decodeUnknown(GetIssueParamsSchema)

/**
 * Parse unknown data into CreateIssueParams.
 */
export const parseCreateIssueParams = Schema.decodeUnknown(CreateIssueParamsSchema)

/**
 * Parse unknown data into UpdateIssueParams.
 */
export const parseUpdateIssueParams = Schema.decodeUnknown(UpdateIssueParamsSchema)

/**
 * Parse unknown data into AddLabelParams.
 */
export const parseAddLabelParams = Schema.decodeUnknown(AddLabelParamsSchema)

/**
 * Parse unknown data into ListProjectsParams.
 */
export const parseListProjectsParams = Schema.decodeUnknown(ListProjectsParamsSchema)
