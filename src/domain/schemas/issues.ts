import { JSONSchema, Schema } from "effect"

import {
  ColorCode,
  ComponentIdentifier,
  Email,
  IssueId,
  IssueIdentifier,
  LimitParam,
  NonEmptyString,
  PersonId,
  PersonName,
  PositiveNumber,
  ProjectIdentifier,
  StatusName,
  Timestamp
} from "./shared.js"

export const IssuePriorityValues = ["urgent", "high", "medium", "low", "no-priority"] as const

export const IssuePrioritySchema = Schema.Literal(...IssuePriorityValues).annotations({
  title: "IssuePriority",
  description: "Issue priority level"
})

export type IssuePriority = Schema.Schema.Type<typeof IssuePrioritySchema>

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

export const IssueSummarySchema = Schema.Struct({
  identifier: IssueIdentifier,
  title: Schema.String,
  status: StatusName,
  priority: Schema.optional(IssuePrioritySchema),
  assignee: Schema.optional(PersonName),
  modifiedOn: Schema.optional(Timestamp)
}).annotations({
  title: "IssueSummary",
  description: "Issue summary for list operations"
})

export type IssueSummary = Schema.Schema.Type<typeof IssueSummarySchema>

export const IssueSchema = Schema.Struct({
  identifier: IssueIdentifier,
  title: Schema.String,
  description: Schema.optional(Schema.String),
  status: StatusName,
  priority: Schema.optional(IssuePrioritySchema),
  assignee: Schema.optional(PersonName),
  assigneeRef: Schema.optional(PersonRefSchema),
  labels: Schema.optional(Schema.Array(LabelSchema)),
  project: ProjectIdentifier,
  modifiedOn: Schema.optional(Timestamp),
  createdOn: Schema.optional(Timestamp),
  dueDate: Schema.optional(Schema.NullOr(Timestamp)),
  estimation: Schema.optional(PositiveNumber)
}).annotations({
  title: "Issue",
  description: "Full issue with all fields"
})

export type Issue = Schema.Schema.Type<typeof IssueSchema>

export const ListIssuesParamsSchema = Schema.Struct({
  project: ProjectIdentifier.annotations({
    description: "Project identifier (e.g., 'HULY')"
  }),
  status: Schema.optional(StatusName.annotations({
    description: "Filter by status name"
  })),
  assignee: Schema.optional(Email.annotations({
    description: "Filter by assignee email"
  })),
  titleSearch: Schema.optional(Schema.String.annotations({
    description: "Search issues by title substring (case-insensitive)"
  })),
  descriptionSearch: Schema.optional(Schema.String.annotations({
    description: "Search issues by description content (fulltext search)"
  })),
  component: Schema.optional(ComponentIdentifier.annotations({
    description: "Filter by component ID or label"
  })),
  limit: Schema.optional(
    LimitParam.annotations({
      description: "Maximum number of issues to return (default: 50)"
    })
  )
}).annotations({
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
  assignee: Schema.optional(Email.annotations({
    description: "Assignee email address"
  })),
  status: Schema.optional(StatusName.annotations({
    description: "Initial status (uses project default if not specified)"
  }))
}).annotations({
  title: "CreateIssueParams",
  description: "Parameters for creating an issue"
})

export type CreateIssueParams = Schema.Schema.Type<typeof CreateIssueParamsSchema>

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
  description: Schema.optional(Schema.String.annotations({
    description: "New issue description (markdown supported)"
  })),
  priority: Schema.optional(IssuePrioritySchema.annotations({
    description: "New issue priority"
  })),
  assignee: Schema.optional(
    Schema.NullOr(Email).annotations({
      description: "New assignee email (null to unassign)"
    })
  ),
  status: Schema.optional(StatusName.annotations({
    description: "New status"
  }))
}).annotations({
  title: "UpdateIssueParams",
  description: "Parameters for updating an issue"
})

export type UpdateIssueParams = Schema.Schema.Type<typeof UpdateIssueParamsSchema>

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
      description: "Color code (0-9, default: 0)"
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

export const listIssuesParamsJsonSchema = JSONSchema.make(ListIssuesParamsSchema)
export const getIssueParamsJsonSchema = JSONSchema.make(GetIssueParamsSchema)
export const createIssueParamsJsonSchema = JSONSchema.make(CreateIssueParamsSchema)
export const updateIssueParamsJsonSchema = JSONSchema.make(UpdateIssueParamsSchema)
export const addLabelParamsJsonSchema = JSONSchema.make(AddLabelParamsSchema)
export const deleteIssueParamsJsonSchema = JSONSchema.make(DeleteIssueParamsSchema)

export const parseIssue = Schema.decodeUnknown(IssueSchema)
export const parseIssueSummary = Schema.decodeUnknown(IssueSummarySchema)
export const parseListIssuesParams = Schema.decodeUnknown(ListIssuesParamsSchema)
export const parseGetIssueParams = Schema.decodeUnknown(GetIssueParamsSchema)
export const parseCreateIssueParams = Schema.decodeUnknown(CreateIssueParamsSchema)
export const parseUpdateIssueParams = Schema.decodeUnknown(UpdateIssueParamsSchema)
export const parseAddLabelParams = Schema.decodeUnknown(AddLabelParamsSchema)
export const parseDeleteIssueParams = Schema.decodeUnknown(DeleteIssueParamsSchema)

// --- Result Schemas ---

// issueId: internal UUID (Ref<Issue>), identifier: human-readable key (e.g. "HULY-123")
export const CreateIssueResultSchema = Schema.Struct({
  identifier: IssueIdentifier,
  issueId: IssueId
}).annotations({
  title: "CreateIssueResult",
  description: "Result of creating an issue"
})

export type CreateIssueResult = Schema.Schema.Type<typeof CreateIssueResultSchema>

export const UpdateIssueResultSchema = Schema.Struct({
  identifier: IssueIdentifier,
  updated: Schema.Boolean
}).annotations({
  title: "UpdateIssueResult",
  description: "Result of updating an issue"
})

export type UpdateIssueResult = Schema.Schema.Type<typeof UpdateIssueResultSchema>

export const AddLabelResultSchema = Schema.Struct({
  identifier: IssueIdentifier,
  labelAdded: Schema.Boolean
}).annotations({
  title: "AddLabelResult",
  description: "Result of adding a label to an issue"
})

export type AddLabelResult = Schema.Schema.Type<typeof AddLabelResultSchema>

export const DeleteIssueResultSchema = Schema.Struct({
  identifier: IssueIdentifier,
  deleted: Schema.Boolean
}).annotations({
  title: "DeleteIssueResult",
  description: "Result of deleting an issue"
})

export type DeleteIssueResult = Schema.Schema.Type<typeof DeleteIssueResultSchema>
