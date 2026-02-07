import { Schema } from "effect"

import {
  ColorCode,
  ComponentId,
  ComponentIdentifier,
  ComponentLabel,
  Email,
  IssueId,
  IssueIdentifier,
  IssueTemplateId,
  LimitParam,
  makeJsonSchema,
  NonEmptyString,
  PersonId,
  PersonName,
  PositiveNumber,
  ProjectIdentifier,
  StatusName,
  TemplateIdentifier,
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
  component: Schema.optional(Schema.String.annotations({
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

export const listIssuesParamsJsonSchema = makeJsonSchema(ListIssuesParamsSchema)
export const getIssueParamsJsonSchema = makeJsonSchema(GetIssueParamsSchema)
export const createIssueParamsJsonSchema = makeJsonSchema(CreateIssueParamsSchema)
export const updateIssueParamsJsonSchema = makeJsonSchema(UpdateIssueParamsSchema)
export const addLabelParamsJsonSchema = makeJsonSchema(AddLabelParamsSchema)
export const deleteIssueParamsJsonSchema = makeJsonSchema(DeleteIssueParamsSchema)

export const parseIssue = Schema.decodeUnknown(IssueSchema)
export const parseIssueSummary = Schema.decodeUnknown(IssueSummarySchema)
export const parseListIssuesParams = Schema.decodeUnknown(ListIssuesParamsSchema)
export const parseGetIssueParams = Schema.decodeUnknown(GetIssueParamsSchema)
export const parseCreateIssueParams = Schema.decodeUnknown(CreateIssueParamsSchema)
export const parseUpdateIssueParams = Schema.decodeUnknown(UpdateIssueParamsSchema)
export const parseAddLabelParams = Schema.decodeUnknown(AddLabelParamsSchema)
export const parseDeleteIssueParams = Schema.decodeUnknown(DeleteIssueParamsSchema)

// --- Component Schemas ---

export const ComponentSummarySchema = Schema.Struct({
  id: ComponentId,
  label: ComponentLabel,
  lead: Schema.optional(PersonName),
  modifiedOn: Schema.optional(Timestamp)
}).annotations({
  title: "ComponentSummary",
  description: "Component summary for list operations"
})

export type ComponentSummary = Schema.Schema.Type<typeof ComponentSummarySchema>

export const ComponentSchema = Schema.Struct({
  id: ComponentId,
  label: ComponentLabel,
  description: Schema.optional(Schema.String),
  lead: Schema.optional(PersonName),
  project: ProjectIdentifier,
  modifiedOn: Schema.optional(Timestamp),
  createdOn: Schema.optional(Timestamp)
}).annotations({
  title: "Component",
  description: "Full component with all fields"
})

export type Component = Schema.Schema.Type<typeof ComponentSchema>

export const ListComponentsParamsSchema = Schema.Struct({
  project: ProjectIdentifier.annotations({
    description: "Project identifier (e.g., 'HULY')"
  }),
  limit: Schema.optional(
    LimitParam.annotations({
      description: "Maximum number of components to return (default: 50)"
    })
  )
}).annotations({
  title: "ListComponentsParams",
  description: "Parameters for listing components"
})

export type ListComponentsParams = Schema.Schema.Type<typeof ListComponentsParamsSchema>

export const GetComponentParamsSchema = Schema.Struct({
  project: ProjectIdentifier.annotations({
    description: "Project identifier (e.g., 'HULY')"
  }),
  component: ComponentIdentifier.annotations({
    description: "Component ID or label"
  })
}).annotations({
  title: "GetComponentParams",
  description: "Parameters for getting a single component"
})

export type GetComponentParams = Schema.Schema.Type<typeof GetComponentParamsSchema>

export const CreateComponentParamsSchema = Schema.Struct({
  project: ProjectIdentifier.annotations({
    description: "Project identifier (e.g., 'HULY')"
  }),
  label: NonEmptyString.annotations({
    description: "Component name/label"
  }),
  description: Schema.optional(Schema.String.annotations({
    description: "Component description (markdown supported)"
  })),
  lead: Schema.optional(Email.annotations({
    description: "Lead person email address"
  }))
}).annotations({
  title: "CreateComponentParams",
  description: "Parameters for creating a component"
})

export type CreateComponentParams = Schema.Schema.Type<typeof CreateComponentParamsSchema>

export const UpdateComponentParamsSchema = Schema.Struct({
  project: ProjectIdentifier.annotations({
    description: "Project identifier (e.g., 'HULY')"
  }),
  component: ComponentIdentifier.annotations({
    description: "Component ID or label"
  }),
  label: Schema.optional(NonEmptyString.annotations({
    description: "New component name/label"
  })),
  description: Schema.optional(Schema.String.annotations({
    description: "New component description (markdown supported)"
  })),
  lead: Schema.optional(
    Schema.NullOr(Email).annotations({
      description: "New lead person email (null to unassign)"
    })
  )
}).annotations({
  title: "UpdateComponentParams",
  description: "Parameters for updating a component"
})

export type UpdateComponentParams = Schema.Schema.Type<typeof UpdateComponentParamsSchema>

export const SetIssueComponentParamsSchema = Schema.Struct({
  project: ProjectIdentifier.annotations({
    description: "Project identifier (e.g., 'HULY')"
  }),
  identifier: IssueIdentifier.annotations({
    description: "Issue identifier (e.g., 'HULY-123')"
  }),
  component: Schema.NullOr(ComponentIdentifier).annotations({
    description: "Component ID or label (null to clear)"
  })
}).annotations({
  title: "SetIssueComponentParams",
  description: "Parameters for setting component on an issue"
})

export type SetIssueComponentParams = Schema.Schema.Type<typeof SetIssueComponentParamsSchema>

export const DeleteComponentParamsSchema = Schema.Struct({
  project: ProjectIdentifier.annotations({
    description: "Project identifier (e.g., 'HULY')"
  }),
  component: ComponentIdentifier.annotations({
    description: "Component ID or label"
  })
}).annotations({
  title: "DeleteComponentParams",
  description: "Parameters for deleting a component"
})

export type DeleteComponentParams = Schema.Schema.Type<typeof DeleteComponentParamsSchema>

export const listComponentsParamsJsonSchema = makeJsonSchema(ListComponentsParamsSchema)
export const getComponentParamsJsonSchema = makeJsonSchema(GetComponentParamsSchema)
export const createComponentParamsJsonSchema = makeJsonSchema(CreateComponentParamsSchema)
export const updateComponentParamsJsonSchema = makeJsonSchema(UpdateComponentParamsSchema)
export const setIssueComponentParamsJsonSchema = makeJsonSchema(SetIssueComponentParamsSchema)
export const deleteComponentParamsJsonSchema = makeJsonSchema(DeleteComponentParamsSchema)

export const parseComponent = Schema.decodeUnknown(ComponentSchema)
export const parseComponentSummary = Schema.decodeUnknown(ComponentSummarySchema)
export const parseListComponentsParams = Schema.decodeUnknown(ListComponentsParamsSchema)
export const parseGetComponentParams = Schema.decodeUnknown(GetComponentParamsSchema)
export const parseCreateComponentParams = Schema.decodeUnknown(CreateComponentParamsSchema)
export const parseUpdateComponentParams = Schema.decodeUnknown(UpdateComponentParamsSchema)
export const parseSetIssueComponentParams = Schema.decodeUnknown(SetIssueComponentParamsSchema)
export const parseDeleteComponentParams = Schema.decodeUnknown(DeleteComponentParamsSchema)

// --- Issue Template Schemas ---

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
  component: Schema.optional(Schema.String.annotations({
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
    Schema.NullOr(Schema.String).annotations({
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

export const listIssueTemplatesParamsJsonSchema = makeJsonSchema(ListIssueTemplatesParamsSchema)
export const getIssueTemplateParamsJsonSchema = makeJsonSchema(GetIssueTemplateParamsSchema)
export const createIssueTemplateParamsJsonSchema = makeJsonSchema(CreateIssueTemplateParamsSchema)
export const createIssueFromTemplateParamsJsonSchema = makeJsonSchema(CreateIssueFromTemplateParamsSchema)
export const updateIssueTemplateParamsJsonSchema = makeJsonSchema(UpdateIssueTemplateParamsSchema)
export const deleteIssueTemplateParamsJsonSchema = makeJsonSchema(DeleteIssueTemplateParamsSchema)

export const parseIssueTemplate = Schema.decodeUnknown(IssueTemplateSchema)
export const parseIssueTemplateSummary = Schema.decodeUnknown(IssueTemplateSummarySchema)
export const parseListIssueTemplatesParams = Schema.decodeUnknown(ListIssueTemplatesParamsSchema)
export const parseGetIssueTemplateParams = Schema.decodeUnknown(GetIssueTemplateParamsSchema)
export const parseCreateIssueTemplateParams = Schema.decodeUnknown(CreateIssueTemplateParamsSchema)
export const parseCreateIssueFromTemplateParams = Schema.decodeUnknown(CreateIssueFromTemplateParamsSchema)
export const parseUpdateIssueTemplateParams = Schema.decodeUnknown(UpdateIssueTemplateParamsSchema)
export const parseDeleteIssueTemplateParams = Schema.decodeUnknown(DeleteIssueTemplateParamsSchema)

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

export const CreateComponentResultSchema = Schema.Struct({
  id: ComponentId,
  label: ComponentLabel
}).annotations({
  title: "CreateComponentResult",
  description: "Result of creating a component"
})

export type CreateComponentResult = Schema.Schema.Type<typeof CreateComponentResultSchema>

export const UpdateComponentResultSchema = Schema.Struct({
  id: ComponentId,
  updated: Schema.Boolean
}).annotations({
  title: "UpdateComponentResult",
  description: "Result of updating a component"
})

export type UpdateComponentResult = Schema.Schema.Type<typeof UpdateComponentResultSchema>

export const SetIssueComponentResultSchema = Schema.Struct({
  identifier: IssueIdentifier,
  componentSet: Schema.Boolean
}).annotations({
  title: "SetIssueComponentResult",
  description: "Result of setting a component on an issue"
})

export type SetIssueComponentResult = Schema.Schema.Type<typeof SetIssueComponentResultSchema>

export const DeleteComponentResultSchema = Schema.Struct({
  id: ComponentId,
  deleted: Schema.Boolean
}).annotations({
  title: "DeleteComponentResult",
  description: "Result of deleting a component"
})

export type DeleteComponentResult = Schema.Schema.Type<typeof DeleteComponentResultSchema>

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
