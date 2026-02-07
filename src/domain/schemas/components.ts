import { Schema } from "effect"

import {
  ComponentId,
  ComponentIdentifier,
  ComponentLabel,
  Email,
  IssueIdentifier,
  LimitParam,
  makeJsonSchema,
  NonEmptyString,
  PersonName,
  ProjectIdentifier,
  Timestamp
} from "./shared.js"

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

// --- Result Schemas ---

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
