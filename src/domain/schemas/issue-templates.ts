import { JSONSchema, Schema } from "effect"

import { IssuePrioritySchema } from "./issues.js"
import {
  ComponentIdentifier,
  ComponentLabel,
  Email,
  IssueTemplateId,
  LimitParam,
  NonEmptyString,
  PersonName,
  PositiveNumber,
  ProjectIdentifier,
  StatusName,
  TemplateIdentifier,
  Timestamp
} from "./shared.js"

export const IssueTemplateSummarySchema = Schema.Struct({
  id: IssueTemplateId,
  title: Schema.String,
  priority: Schema.optional(IssuePrioritySchema),
  modifiedOn: Schema.optional(Timestamp)
}).annotations({
  title: "IssueTemplateSummary",
  description: "Issue template summary for list operations"
})

export type IssueTemplateSummary = Schema.Schema.Type<typeof IssueTemplateSummarySchema>

export const IssueTemplateSchema = Schema.Struct({
  id: IssueTemplateId,
  title: Schema.String,
  description: Schema.optional(Schema.String),
  priority: Schema.optional(IssuePrioritySchema),
  assignee: Schema.optional(PersonName),
  component: Schema.optional(ComponentLabel),
  estimation: Schema.optional(PositiveNumber),
  project: ProjectIdentifier,
  modifiedOn: Schema.optional(Timestamp),
  createdOn: Schema.optional(Timestamp)
}).annotations({
  title: "IssueTemplate",
  description: "Full issue template with all fields"
})

export type IssueTemplate = Schema.Schema.Type<typeof IssueTemplateSchema>

export const ListIssueTemplatesParamsSchema = Schema.Struct({
  project: ProjectIdentifier.annotations({
    description: "Project identifier (e.g., 'HULY')"
  }),
  limit: Schema.optional(
    LimitParam.annotations({
      description: "Maximum number of templates to return (default: 50)"
    })
  )
}).annotations({
  title: "ListIssueTemplatesParams",
  description: "Parameters for listing issue templates"
})

export type ListIssueTemplatesParams = Schema.Schema.Type<typeof ListIssueTemplatesParamsSchema>

export const GetIssueTemplateParamsSchema = Schema.Struct({
  project: ProjectIdentifier.annotations({
    description: "Project identifier (e.g., 'HULY')"
  }),
  template: TemplateIdentifier.annotations({
    description: "Template ID or title"
  })
}).annotations({
  title: "GetIssueTemplateParams",
  description: "Parameters for getting a single issue template"
})

export type GetIssueTemplateParams = Schema.Schema.Type<typeof GetIssueTemplateParamsSchema>

export const CreateIssueTemplateParamsSchema = Schema.Struct({
  project: ProjectIdentifier.annotations({
    description: "Project identifier (e.g., 'HULY')"
  }),
  title: NonEmptyString.annotations({
    description: "Template title"
  }),
  description: Schema.optional(Schema.String.annotations({
    description: "Template description (markdown supported)"
  })),
  priority: Schema.optional(IssuePrioritySchema.annotations({
    description: "Default priority for issues created from this template"
  })),
  assignee: Schema.optional(Email.annotations({
    description: "Default assignee email address"
  })),
  component: Schema.optional(ComponentIdentifier.annotations({
    description: "Default component ID or label"
  })),
  estimation: Schema.optional(PositiveNumber.annotations({
    description: "Default estimation in minutes"
  }))
}).annotations({
  title: "CreateIssueTemplateParams",
  description: "Parameters for creating an issue template"
})

export type CreateIssueTemplateParams = Schema.Schema.Type<typeof CreateIssueTemplateParamsSchema>

export const CreateIssueFromTemplateParamsSchema = Schema.Struct({
  project: ProjectIdentifier.annotations({
    description: "Project identifier (e.g., 'HULY')"
  }),
  template: TemplateIdentifier.annotations({
    description: "Template ID or title"
  }),
  title: Schema.optional(NonEmptyString.annotations({
    description: "Override title (uses template title if not specified)"
  })),
  description: Schema.optional(Schema.String.annotations({
    description: "Override description (uses template description if not specified)"
  })),
  priority: Schema.optional(IssuePrioritySchema.annotations({
    description: "Override priority"
  })),
  assignee: Schema.optional(Email.annotations({
    description: "Override assignee email"
  })),
  status: Schema.optional(StatusName.annotations({
    description: "Initial status (uses project default if not specified)"
  }))
}).annotations({
  title: "CreateIssueFromTemplateParams",
  description: "Parameters for creating an issue from a template"
})

export type CreateIssueFromTemplateParams = Schema.Schema.Type<typeof CreateIssueFromTemplateParamsSchema>

export const UpdateIssueTemplateParamsSchema = Schema.Struct({
  project: ProjectIdentifier.annotations({
    description: "Project identifier (e.g., 'HULY')"
  }),
  template: TemplateIdentifier.annotations({
    description: "Template ID or title"
  }),
  title: Schema.optional(NonEmptyString.annotations({
    description: "New template title"
  })),
  description: Schema.optional(Schema.String.annotations({
    description: "New template description (markdown supported)"
  })),
  priority: Schema.optional(IssuePrioritySchema.annotations({
    description: "New default priority"
  })),
  assignee: Schema.optional(
    Schema.NullOr(Email).annotations({
      description: "New default assignee email (null to unassign)"
    })
  ),
  component: Schema.optional(
    Schema.NullOr(ComponentIdentifier).annotations({
      description: "New default component ID or label (null to clear)"
    })
  ),
  estimation: Schema.optional(PositiveNumber.annotations({
    description: "New default estimation in minutes"
  }))
}).annotations({
  title: "UpdateIssueTemplateParams",
  description: "Parameters for updating an issue template"
})

export type UpdateIssueTemplateParams = Schema.Schema.Type<typeof UpdateIssueTemplateParamsSchema>

export const DeleteIssueTemplateParamsSchema = Schema.Struct({
  project: ProjectIdentifier.annotations({
    description: "Project identifier (e.g., 'HULY')"
  }),
  template: TemplateIdentifier.annotations({
    description: "Template ID or title"
  })
}).annotations({
  title: "DeleteIssueTemplateParams",
  description: "Parameters for deleting an issue template"
})

export type DeleteIssueTemplateParams = Schema.Schema.Type<typeof DeleteIssueTemplateParamsSchema>

export const listIssueTemplatesParamsJsonSchema = JSONSchema.make(ListIssueTemplatesParamsSchema)
export const getIssueTemplateParamsJsonSchema = JSONSchema.make(GetIssueTemplateParamsSchema)
export const createIssueTemplateParamsJsonSchema = JSONSchema.make(CreateIssueTemplateParamsSchema)
export const createIssueFromTemplateParamsJsonSchema = JSONSchema.make(CreateIssueFromTemplateParamsSchema)
export const updateIssueTemplateParamsJsonSchema = JSONSchema.make(UpdateIssueTemplateParamsSchema)
export const deleteIssueTemplateParamsJsonSchema = JSONSchema.make(DeleteIssueTemplateParamsSchema)

export const parseIssueTemplate = Schema.decodeUnknown(IssueTemplateSchema)
export const parseIssueTemplateSummary = Schema.decodeUnknown(IssueTemplateSummarySchema)
export const parseListIssueTemplatesParams = Schema.decodeUnknown(ListIssueTemplatesParamsSchema)
export const parseGetIssueTemplateParams = Schema.decodeUnknown(GetIssueTemplateParamsSchema)
export const parseCreateIssueTemplateParams = Schema.decodeUnknown(CreateIssueTemplateParamsSchema)
export const parseCreateIssueFromTemplateParams = Schema.decodeUnknown(CreateIssueFromTemplateParamsSchema)
export const parseUpdateIssueTemplateParams = Schema.decodeUnknown(UpdateIssueTemplateParamsSchema)
export const parseDeleteIssueTemplateParams = Schema.decodeUnknown(DeleteIssueTemplateParamsSchema)

// --- Result Schemas ---

export const CreateIssueTemplateResultSchema = Schema.Struct({
  id: IssueTemplateId,
  title: Schema.String
}).annotations({
  title: "CreateIssueTemplateResult",
  description: "Result of creating an issue template"
})

export type CreateIssueTemplateResult = Schema.Schema.Type<typeof CreateIssueTemplateResultSchema>

export const UpdateIssueTemplateResultSchema = Schema.Struct({
  id: IssueTemplateId,
  updated: Schema.Boolean
}).annotations({
  title: "UpdateIssueTemplateResult",
  description: "Result of updating an issue template"
})

export type UpdateIssueTemplateResult = Schema.Schema.Type<typeof UpdateIssueTemplateResultSchema>

export const DeleteIssueTemplateResultSchema = Schema.Struct({
  id: IssueTemplateId,
  deleted: Schema.Boolean
}).annotations({
  title: "DeleteIssueTemplateResult",
  description: "Result of deleting an issue template"
})

export type DeleteIssueTemplateResult = Schema.Schema.Type<typeof DeleteIssueTemplateResultSchema>
