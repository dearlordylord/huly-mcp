import { JSONSchema, Schema } from "effect"

import {
  AssociationId,
  CardIdentifier,
  CardSpaceIdentifier,
  DocId,
  DocumentIdentifier,
  enumValuesDescription,
  IssueIdentifier,
  LimitParam,
  NonEmptyString,
  ObjectClassName,
  ProjectIdentifier,
  RelationId,
  TeamspaceIdentifier,
  Timestamp
} from "./shared.js"

export const AssociationIdentifier = NonEmptyString.pipe(Schema.brand("AssociationIdentifier"))
export type AssociationIdentifier = Schema.Schema.Type<typeof AssociationIdentifier>

export const AssociationName = NonEmptyString.pipe(Schema.brand("AssociationName"))
export type AssociationName = Schema.Schema.Type<typeof AssociationName>

export const AssociationRoleName = NonEmptyString.pipe(Schema.brand("AssociationRoleName"))
export type AssociationRoleName = Schema.Schema.Type<typeof AssociationRoleName>

export const RelationIdentifier = NonEmptyString.pipe(Schema.brand("RelationIdentifier"))
export type RelationIdentifier = Schema.Schema.Type<typeof RelationIdentifier>

export const ListRelationsWarning = NonEmptyString.pipe(Schema.brand("ListRelationsWarning"))
export type ListRelationsWarning = Schema.Schema.Type<typeof ListRelationsWarning>

const CardinalityValues = [
  "one-to-one",
  "one-to-many",
  "many-to-many"
] as const
// MCP-facing vocabulary derived from Huly SDK Association["type"]; operations maintain the exact SDK mapping.
export const CardinalitySchema = Schema.Literal(...CardinalityValues).annotations({
  description: `Association cardinality: ${enumValuesDescription(CardinalityValues)}`
})
export type Cardinality = Schema.Schema.Type<typeof CardinalitySchema>

const RelationDirectionValues = ["source-to-target", "target-to-source", "either"] as const
// MCP-only traversal vocabulary; it controls how caller source/target map onto Huly Relation docA/docB.
export const RelationDirectionSchema = Schema.Literal(...RelationDirectionValues)
export type RelationDirection = Schema.Schema.Type<typeof RelationDirectionSchema>
export const DefaultRelationDirection = "source-to-target" satisfies RelationDirection
const relationDirectionDescription = `Relation traversal direction: ${
  enumValuesDescription(RelationDirectionValues)
}. Defaults to ${DefaultRelationDirection}.`

export const RelationIfExistsSchema = Schema.Literal("return_existing", "fail")
export type RelationIfExists = Schema.Schema.Type<typeof RelationIfExistsSchema>

export const RelationEndpointFieldSchema = Schema.Literal("source", "target")
export type RelationEndpointField = Schema.Schema.Type<typeof RelationEndpointFieldSchema>

const AssociationIfExistsSchema = Schema.Literal("return_existing", "fail")

const RawObjectLocatorSchema = Schema.Struct({
  kind: Schema.Literal("raw"),
  id: DocId.annotations({
    description: "Raw Huly document _id"
  }),
  class: Schema.optional(ObjectClassName.annotations({
    description:
      "Raw Huly document class, such as tracker:class:Issue. Required unless the association side determines the expected class."
  }))
})

const IssueObjectLocatorSchema = Schema.Struct({
  kind: Schema.Literal("issue"),
  issue: IssueIdentifier.annotations({
    description: "Issue identifier, such as HULY-123, or a numeric issue number when project is also provided."
  }),
  project: Schema.optional(ProjectIdentifier.annotations({
    description: "Project identifier. Optional when issue already includes a project prefix like HULY-123."
  }))
})

const DocumentObjectLocatorSchema = Schema.Struct({
  kind: Schema.Literal("document"),
  document: DocumentIdentifier.annotations({
    description: "Document title or ID"
  }),
  teamspace: Schema.optional(TeamspaceIdentifier.annotations({
    description: "Teamspace name or ID. If omitted, document title matches must be unique across the workspace."
  }))
})

const CardObjectLocatorSchema = Schema.Struct({
  kind: Schema.Literal("card"),
  card: CardIdentifier.annotations({
    description:
      "Card ID or exact card title. Card IDs can be resolved without cardSpace; title lookup requires cardSpace."
  }),
  cardSpace: Schema.optional(CardSpaceIdentifier.annotations({
    description:
      "Card space name or ID. Required when card is a title so title lookup is scoped and not ambiguous across the workspace."
  }))
})

export const GenericObjectLocatorSchema = Schema.Union(
  RawObjectLocatorSchema,
  IssueObjectLocatorSchema,
  DocumentObjectLocatorSchema,
  CardObjectLocatorSchema
).annotations({
  title: "GenericObjectLocator",
  description:
    "Explicit locator for a Huly document endpoint. Use raw for known _id/class pairs, issue for tracker issues, document for Huly documents, or card for Huly cards."
})
export type GenericObjectLocator = Schema.Schema.Type<typeof GenericObjectLocatorSchema>

export const ResolvedObjectSummarySchema = Schema.Struct({
  id: DocId,
  class: ObjectClassName,
  display: NonEmptyString,
  locatorKind: Schema.Literal("raw", "issue", "document", "card"),
  warning: Schema.optional(Schema.String)
})
export type ResolvedObjectSummary = Schema.Schema.Type<typeof ResolvedObjectSummarySchema>

export const AssociationSummarySchema = Schema.Struct({
  associationId: AssociationId,
  name: Schema.optional(AssociationName),
  label: Schema.optional(NonEmptyString),
  description: Schema.optional(Schema.String),
  sourceClass: ObjectClassName,
  sourceClassLabel: Schema.optional(NonEmptyString.annotations({
    description: "Best-effort human display label for sourceClass when the class is known to this server"
  })),
  targetClass: ObjectClassName,
  targetClassLabel: Schema.optional(NonEmptyString.annotations({
    description: "Best-effort human display label for targetClass when the class is known to this server"
  })),
  sourceRole: Schema.optional(AssociationRoleName),
  targetRole: Schema.optional(AssociationRoleName),
  relationClass: Schema.optional(ObjectClassName),
  cardinality: CardinalitySchema,
  symmetric: Schema.Boolean,
  system: Schema.Boolean,
  canListRelations: Schema.Boolean,
  canCreateRelation: Schema.Boolean,
  canDeleteRelation: Schema.Boolean,
  unsupportedReason: Schema.optional(Schema.String)
})
export type AssociationSummary = Schema.Schema.Type<typeof AssociationSummarySchema>

export const RelationSummarySchema = Schema.Struct({
  relationId: RelationId,
  associationId: AssociationId,
  associationName: Schema.optional(AssociationName),
  source: ResolvedObjectSummarySchema,
  target: ResolvedObjectSummarySchema,
  createdOn: Schema.optional(Timestamp),
  modifiedOn: Schema.optional(Timestamp)
})
export type RelationSummary = Schema.Schema.Type<typeof RelationSummarySchema>

export const ListAssociationsParamsSchema = Schema.Struct({
  association: Schema.optional(AssociationIdentifier.annotations({
    description: "Association _id, source/target role name, or stable association name"
  })),
  sourceClass: Schema.optional(ObjectClassName.annotations({
    description: "Only return associations whose source class matches this Huly class ID"
  })),
  targetClass: Schema.optional(ObjectClassName.annotations({
    description: "Only return associations whose target class matches this Huly class ID"
  })),
  writableOnly: Schema.optional(Schema.Boolean.annotations({
    description: "Only return associations whose relation create/delete path has been validated and allowlisted"
  })),
  includeSystem: Schema.optional(Schema.Boolean.annotations({
    description: "Include internal/system associations. Defaults to false."
  })),
  limit: Schema.optional(LimitParam.annotations({
    description: "Maximum number of associations to return (default: 50)"
  }))
}).annotations({
  title: "ListAssociationsParams",
  description: "Parameters for listing generic Huly association definitions"
})
export type ListAssociationsParams = Schema.Schema.Type<typeof ListAssociationsParamsSchema>

export const ListAssociationsResultSchema = Schema.Struct({
  associations: Schema.Array(AssociationSummarySchema),
  total: Schema.Number
})
export type ListAssociationsResult = Schema.Schema.Type<typeof ListAssociationsResultSchema>

const CreateAssociationParamsSchema = Schema.Struct({
  sourceClass: ObjectClassName.annotations({
    description: "Source Huly class ID, such as tracker:class:Issue. core:class:* system classes are rejected."
  }),
  targetClass: ObjectClassName.annotations({
    description: "Target Huly class ID, such as tracker:class:Issue. core:class:* system classes are rejected."
  }),
  sourceRole: AssociationRoleName.annotations({
    description: "Role name stored on the source side of the association."
  }),
  targetRole: AssociationRoleName.annotations({
    description: "Role name stored on the target side of the association."
  }),
  cardinality: CardinalitySchema,
  automationOnly: Schema.optional(Schema.Boolean.annotations({
    description:
      "Whether Huly automation-only UI paths should own relation writes for this association. Defaults to false."
  })),
  ifExists: Schema.optional(AssociationIfExistsSchema.annotations({
    description:
      "return_existing (default) returns an identical existing association; fail reports an existing association as an error"
  }))
}).annotations({
  title: "CreateAssociationParams",
  description:
    "Parameters for idempotently creating a Huly association definition in the model space. The created association can then be used with create_relation."
})
export type CreateAssociationParams = Schema.Schema.Type<typeof CreateAssociationParamsSchema>

export const CreateAssociationResultSchema = Schema.Struct({
  association: AssociationSummarySchema,
  created: Schema.Boolean,
  existing: Schema.Boolean
})
export type CreateAssociationResult = Schema.Schema.Type<typeof CreateAssociationResultSchema>

export const DeleteAssociationParamsSchema = Schema.Struct({
  association: AssociationIdentifier.annotations({
    description:
      "Association _id or unambiguous name returned by list_associations. Deleting a missing association is a successful no-op."
  })
}).annotations({
  title: "DeleteAssociationParams",
  description:
    "Parameters for idempotently deleting a Huly association definition. The association must have zero concrete relations."
})
export type DeleteAssociationParams = Schema.Schema.Type<typeof DeleteAssociationParamsSchema>

export const DeleteAssociationResultSchema = Schema.Struct({
  association: AssociationIdentifier,
  associationId: Schema.optional(AssociationId),
  deleted: Schema.Boolean,
  relationCount: Schema.Number,
  reason: Schema.optional(Schema.Literal("not_found", "deleted"))
})
export type DeleteAssociationResult = Schema.Schema.Type<typeof DeleteAssociationResultSchema>

const ListRelationsParamsBaseSchema = Schema.Struct({
  association: Schema.optional(AssociationIdentifier.annotations({
    description: "Association _id or name. If omitted, relations are listed only across supported visible associations."
  })),
  source: Schema.optional(GenericObjectLocatorSchema.annotations({
    description: "Optional source endpoint filter"
  })),
  target: Schema.optional(GenericObjectLocatorSchema.annotations({
    description: "Optional target endpoint filter"
  })),
  direction: Schema.optional(RelationDirectionSchema.annotations({
    description: relationDirectionDescription
  })),
  limit: Schema.optional(LimitParam.annotations({
    description: "Maximum number of relations to return (default: 50)"
  }))
}).annotations({
  title: "ListRelationsParams",
  description: "Parameters for listing concrete Huly relation instances"
})

export const ListRelationsParamsSchema = ListRelationsParamsBaseSchema.pipe(
  Schema.filter((params) =>
    params.association === undefined && params.source === undefined && params.target === undefined
      ? "Provide at least one of association, source, or target to avoid broad workspace scans."
      : undefined
  )
).annotations({
  title: "ListRelationsParams",
  description: "Parameters for listing concrete Huly relation instances"
})
export type ListRelationsParams = Schema.Schema.Type<typeof ListRelationsParamsSchema>

export const ListRelationsResultSchema = Schema.Struct({
  relations: Schema.Array(RelationSummarySchema),
  total: Schema.Number,
  warnings: Schema.optional(
    Schema.NonEmptyArray(ListRelationsWarning).annotations({
      description:
        "Non-fatal warnings about result completeness or resolution. Treat these as guidance for narrowing a follow-up call."
    })
  )
})
export type ListRelationsResult = Schema.Schema.Type<typeof ListRelationsResultSchema>

export const CreateRelationParamsSchema = Schema.Struct({
  association: AssociationIdentifier.annotations({
    description: "Association _id or unambiguous name returned by list_associations"
  }),
  source: GenericObjectLocatorSchema.annotations({
    description: "Source endpoint document"
  }),
  target: GenericObjectLocatorSchema.annotations({
    description: "Target endpoint document"
  }),
  direction: Schema.optional(RelationDirectionSchema.annotations({
    description: relationDirectionDescription
  })),
  ifExists: Schema.optional(RelationIfExistsSchema.annotations({
    description: "return_existing (default) returns an existing relation; fail reports an existing relation as an error"
  }))
}).annotations({
  title: "CreateRelationParams",
  description: "Parameters for idempotently creating a concrete generic relation"
})
export type CreateRelationParams = Schema.Schema.Type<typeof CreateRelationParamsSchema>

export const CreateRelationResultSchema = Schema.Struct({
  relationId: RelationId,
  associationId: AssociationId,
  source: ResolvedObjectSummarySchema,
  target: ResolvedObjectSummarySchema,
  created: Schema.Boolean,
  existing: Schema.Boolean
})
export type CreateRelationResult = Schema.Schema.Type<typeof CreateRelationResultSchema>

const DeleteRelationByIdParamsSchema = Schema.Struct({
  relation: RelationIdentifier.annotations({
    description: "Concrete relation _id to delete"
  })
}).annotations({
  title: "DeleteRelationByIdParams",
  description: "Delete one concrete relation by its relation ID."
})

const DeleteRelationByTripleParamsSchema = Schema.Struct({
  association: AssociationIdentifier.annotations({
    description: "Association _id or unambiguous name"
  }),
  source: GenericObjectLocatorSchema.annotations({
    description: "Source endpoint"
  }),
  target: GenericObjectLocatorSchema.annotations({
    description: "Target endpoint"
  }),
  direction: Schema.optional(RelationDirectionSchema.annotations({
    description: relationDirectionDescription
  }))
}).annotations({
  title: "DeleteRelationByTripleParams",
  description: "Delete one concrete relation by exact association + source + target triple."
})

export const DeleteRelationParamsSchema = Schema.Union(
  DeleteRelationByIdParamsSchema,
  DeleteRelationByTripleParamsSchema
).annotations({
  title: "DeleteRelationParams",
  description:
    "Parameters for idempotently deleting one concrete generic relation. Provide either relation, or the full association + source + target triple."
})
export type DeleteRelationParams = Schema.Schema.Type<typeof DeleteRelationParamsSchema>

export const DeleteRelationResultSchema = Schema.Struct({
  relationId: Schema.optional(RelationId),
  associationId: Schema.optional(AssociationId),
  deleted: Schema.Boolean,
  reason: Schema.optional(Schema.Literal("not_found", "deleted"))
})
export type DeleteRelationResult = Schema.Schema.Type<typeof DeleteRelationResultSchema>

export const listAssociationsParamsJsonSchema = JSONSchema.make(ListAssociationsParamsSchema)
export const createAssociationParamsJsonSchema = JSONSchema.make(CreateAssociationParamsSchema)
export const deleteAssociationParamsJsonSchema = JSONSchema.make(DeleteAssociationParamsSchema)
export const listRelationsParamsJsonSchema = {
  ...JSONSchema.make(ListRelationsParamsBaseSchema),
  anyOf: [
    { required: ["association"] },
    { required: ["source"] },
    { required: ["target"] }
  ]
}
export const createRelationParamsJsonSchema = JSONSchema.make(CreateRelationParamsSchema)
export const deleteRelationParamsJsonSchema = {
  ...JSONSchema.make(DeleteRelationParamsSchema),
  type: "object"
}

const strictParseOptions = { onExcessProperty: "error" } as const

export const parseListAssociationsParams = Schema.decodeUnknown(ListAssociationsParamsSchema, strictParseOptions)
export const parseCreateAssociationParams = Schema.decodeUnknown(CreateAssociationParamsSchema, strictParseOptions)
export const parseDeleteAssociationParams = Schema.decodeUnknown(DeleteAssociationParamsSchema, strictParseOptions)
export const parseListRelationsParams = Schema.decodeUnknown(ListRelationsParamsSchema, strictParseOptions)
export const parseCreateRelationParams = Schema.decodeUnknown(CreateRelationParamsSchema, strictParseOptions)
export const parseDeleteRelationParams = Schema.decodeUnknown(DeleteRelationParamsSchema, strictParseOptions)
