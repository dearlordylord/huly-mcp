import { Schema } from "effect"

import {
  toDraft07JsonSchema,
  withJsonSchemaPropertyDescriptions,
  withJsonSchemaUnionPropertyDescriptions
} from "./json-schema.js"

import {
  AssociationId,
  CardIdentifier,
  CardSpaceIdentifier,
  Count,
  DEFAULT_LIMIT,
  DocId,
  DocumentIdentifier,
  enumValuesDescription,
  IssueIdentifier,
  LimitParam,
  ListTotal,
  NonEmptyString,
  ObjectClassName,
  ProjectIdentifier,
  RelationId,
  TeamspaceIdentifier,
  Timestamp
} from "./shared.js"
import { FunnelReference, LeadIdentifier } from "./leads.js"

export const DEFAULT_INCLUDE_SYSTEM_ASSOCIATIONS = false
export const DEFAULT_ASSOCIATION_AUTOMATION_ONLY = false

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

const CardinalityValues = ["one-to-one", "one-to-many", "many-to-many"] as const
// MCP-facing vocabulary derived from Huly SDK Association["type"]; operations maintain the exact SDK mapping.
export const CardinalitySchema = Schema.Literals(CardinalityValues).annotate({
  description: `Association cardinality: ${enumValuesDescription(CardinalityValues)}`
})
export type Cardinality = Schema.Schema.Type<typeof CardinalitySchema>

const RelationDirectionValues = ["source-to-target", "target-to-source", "either"] as const
// MCP-only traversal vocabulary; it controls how caller source/target map onto Huly Relation docA/docB.
export const RelationDirectionSchema = Schema.Literals(RelationDirectionValues)
export type RelationDirection = Schema.Schema.Type<typeof RelationDirectionSchema>
export const DefaultRelationDirection = "source-to-target" satisfies RelationDirection
const relationDirectionDescription = `Relation traversal direction: ${enumValuesDescription(
  RelationDirectionValues
)}. Defaults to ${DefaultRelationDirection}.`

export const RelationIfExistsSchema = Schema.Literals(["return_existing", "fail"])
export type RelationIfExists = Schema.Schema.Type<typeof RelationIfExistsSchema>

export const RelationEndpointFieldSchema = Schema.Literals(["source", "target"])
export type RelationEndpointField = Schema.Schema.Type<typeof RelationEndpointFieldSchema>

const AssociationIfExistsSchema = Schema.Literals(["return_existing", "fail"])

const RawObjectLocatorSchema = Schema.Struct({
  kind: Schema.Literal("raw"),
  id: DocId.annotate({ description: "Raw Huly document _id" }),
  class: Schema.optional(
    ObjectClassName.annotate({
      description:
        "Raw Huly document class, such as tracker:class:Issue. Required unless the association side determines the expected class."
    })
  )
})

const IssueObjectLocatorSchema = Schema.Struct({
  kind: Schema.Literal("issue"),
  issue: IssueIdentifier.annotate({
    description: "Issue identifier, such as HULY-123, or a numeric issue number when project is also provided."
  }),
  project: Schema.optional(
    ProjectIdentifier.annotate({
      description: "Project identifier. Optional when issue already includes a project prefix like HULY-123."
    })
  )
})

const DocumentObjectLocatorSchema = Schema.Struct({
  kind: Schema.Literal("document"),
  document: DocumentIdentifier.annotate({ description: "Document title or ID" }),
  teamspace: Schema.optional(
    TeamspaceIdentifier.annotate({
      description: "Teamspace name or ID. If omitted, document title matches must be unique across the workspace."
    })
  )
})

const CardObjectLocatorSchema = Schema.Struct({
  kind: Schema.Literal("card"),
  card: CardIdentifier.annotate({
    description:
      "Card ID or exact card title. Card IDs can be resolved without cardSpace; title lookup requires cardSpace."
  }),
  cardSpace: Schema.optional(
    CardSpaceIdentifier.annotate({
      description:
        "Card space name or ID. Required when card is a title so title lookup is scoped and not ambiguous across the workspace."
    })
  )
})

const LeadObjectLocatorSchema = Schema.Struct({
  kind: Schema.Literal("lead"),
  funnel: FunnelReference.annotate({ description: "Funnel stable ID or exact unambiguous name." }),
  identifier: LeadIdentifier.annotate({ description: "Lead identifier, such as LEAD-1." })
})

export const GenericObjectLocatorSchema = Schema.Union([
  RawObjectLocatorSchema,
  IssueObjectLocatorSchema,
  DocumentObjectLocatorSchema,
  CardObjectLocatorSchema,
  LeadObjectLocatorSchema
]).annotate({
  title: "GenericObjectLocator",
  description:
    "Explicit locator for a Huly document endpoint. Use raw for known _id/class pairs, issue for tracker issues, document for Huly documents, card for Huly cards, or lead for an exact funnel and LEAD-<number>."
})
export type GenericObjectLocator = Schema.Schema.Type<typeof GenericObjectLocatorSchema>

export const ResolvedObjectSummarySchema = Schema.Struct({
  id: DocId,
  class: ObjectClassName,
  display: NonEmptyString,
  locatorKind: Schema.Literals(["raw", "issue", "document", "card", "lead"]),
  warning: Schema.optional(Schema.String)
})
export type ResolvedObjectSummary = Schema.Schema.Type<typeof ResolvedObjectSummarySchema>

export const AssociationSummarySchema = Schema.Struct({
  associationId: AssociationId,
  name: Schema.optional(AssociationName),
  label: Schema.optional(NonEmptyString),
  description: Schema.optional(Schema.String),
  sourceClass: ObjectClassName,
  sourceClassLabel: Schema.optional(
    NonEmptyString.annotate({
      description: "Best-effort human display label for sourceClass when the class is known to this server"
    })
  ),
  targetClass: ObjectClassName,
  targetClassLabel: Schema.optional(
    NonEmptyString.annotate({
      description: "Best-effort human display label for targetClass when the class is known to this server"
    })
  ),
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
  association: Schema.optional(
    AssociationIdentifier.annotate({
      description: "Association _id, source/target role name, or stable association name"
    })
  ),
  sourceClass: Schema.optional(
    ObjectClassName.annotate({ description: "Only return associations whose source class matches this Huly class ID" })
  ),
  targetClass: Schema.optional(
    ObjectClassName.annotate({ description: "Only return associations whose target class matches this Huly class ID" })
  ),
  writableOnly: Schema.optional(
    Schema.Boolean.annotate({
      description: "Only return associations whose relation create/delete path has been validated and allowlisted"
    })
  ),
  includeSystem: Schema.optional(
    Schema.Boolean.annotate({
      description: `Include internal/system associations. Defaults to ${DEFAULT_INCLUDE_SYSTEM_ASSOCIATIONS}.`
    })
  ),
  limit: Schema.optional(
    LimitParam.annotate({ description: `Maximum number of associations to return (default: ${DEFAULT_LIMIT})` })
  )
}).annotate({
  title: "ListAssociationsParams",
  description: "Parameters for listing generic Huly association definitions"
})
export type ListAssociationsParams = Schema.Schema.Type<typeof ListAssociationsParamsSchema>

export const ListAssociationsResultSchema = Schema.Struct({
  associations: Schema.Array(AssociationSummarySchema),
  total: ListTotal
})
export type ListAssociationsResult = Schema.Schema.Type<typeof ListAssociationsResultSchema>

const CreateAssociationParamsSchema = Schema.Struct({
  sourceClass: ObjectClassName.annotate({
    description: "Source Huly class ID, such as tracker:class:Issue. core:class:* system classes are rejected."
  }),
  targetClass: ObjectClassName.annotate({
    description: "Target Huly class ID, such as tracker:class:Issue. core:class:* system classes are rejected."
  }),
  sourceRole: AssociationRoleName.annotate({ description: "Role name stored on the source side of the association." }),
  targetRole: AssociationRoleName.annotate({ description: "Role name stored on the target side of the association." }),
  cardinality: CardinalitySchema,
  automationOnly: Schema.optional(
    Schema.Boolean.annotate({
      description: `Whether Huly automation-only UI paths should own relation writes for this association. Defaults to ${DEFAULT_ASSOCIATION_AUTOMATION_ONLY}.`
    })
  ),
  ifExists: Schema.optional(
    AssociationIfExistsSchema.annotate({
      description:
        "return_existing (default) returns an identical existing association; fail reports an existing association as an error"
    })
  )
}).annotate({
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
  association: AssociationIdentifier.annotate({
    description:
      "Association _id or unambiguous name returned by list_associations. Deleting a missing association is a successful no-op."
  })
}).annotate({
  title: "DeleteAssociationParams",
  description:
    "Parameters for idempotently deleting a Huly association definition. The association must have zero concrete relations."
})
export type DeleteAssociationParams = Schema.Schema.Type<typeof DeleteAssociationParamsSchema>

export const DeleteAssociationResultSchema = Schema.Struct({
  association: AssociationIdentifier,
  associationId: Schema.optional(AssociationId),
  deleted: Schema.Boolean,
  relationCount: Count,
  reason: Schema.optional(Schema.Literals(["not_found", "deleted"]))
})
export type DeleteAssociationResult = Schema.Schema.Type<typeof DeleteAssociationResultSchema>

const ListRelationsParamsBaseSchema = Schema.Struct({
  association: Schema.optional(
    AssociationIdentifier.annotate({
      description:
        "Association _id or name. If omitted, relations are listed only across supported visible associations."
    })
  ),
  source: Schema.optional(GenericObjectLocatorSchema.annotate({ description: "Optional source endpoint filter" })),
  target: Schema.optional(GenericObjectLocatorSchema.annotate({ description: "Optional target endpoint filter" })),
  direction: Schema.optional(RelationDirectionSchema.annotate({ description: relationDirectionDescription })),
  limit: Schema.optional(
    LimitParam.annotate({ description: `Maximum number of relations to return (default: ${DEFAULT_LIMIT})` })
  )
}).annotate({ title: "ListRelationsParams", description: "Parameters for listing concrete Huly relation instances" })

export const ListRelationsParamsSchema = ListRelationsParamsBaseSchema.check(
  Schema.makeFilter((params) =>
    params.association === undefined && params.source === undefined && params.target === undefined
      ? "Provide at least one of association, source, or target to avoid broad workspace scans."
      : undefined
  )
).annotate({ title: "ListRelationsParams", description: "Parameters for listing concrete Huly relation instances" })
export type ListRelationsParams = Schema.Schema.Type<typeof ListRelationsParamsSchema>

export const ListRelationsResultSchema = Schema.Struct({
  relations: Schema.Array(RelationSummarySchema),
  total: ListTotal,
  warnings: Schema.optional(
    Schema.Array(ListRelationsWarning)
      .pipe(Schema.check(Schema.isMinLength(1)))
      .annotate({
        description:
          "Non-fatal warnings about result completeness or resolution. Treat these as guidance for narrowing a follow-up call."
      })
  )
})
export type ListRelationsResult = Schema.Schema.Type<typeof ListRelationsResultSchema>

export const CreateRelationParamsSchema = Schema.Struct({
  association: AssociationIdentifier.annotate({
    description: "Association _id or unambiguous name returned by list_associations"
  }),
  source: GenericObjectLocatorSchema.annotate({ description: "Source endpoint document" }),
  target: GenericObjectLocatorSchema.annotate({ description: "Target endpoint document" }),
  direction: Schema.optional(RelationDirectionSchema.annotate({ description: relationDirectionDescription })),
  ifExists: Schema.optional(
    RelationIfExistsSchema.annotate({
      description:
        "return_existing (default) returns an existing relation; fail reports an existing relation as an error"
    })
  )
}).annotate({
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
  relation: RelationIdentifier.annotate({ description: "Concrete relation _id to delete" })
}).annotate({ title: "DeleteRelationByIdParams", description: "Delete one concrete relation by its relation ID." })

const DeleteRelationByTripleParamsSchema = Schema.Struct({
  association: AssociationIdentifier.annotate({ description: "Association _id or unambiguous name" }),
  source: GenericObjectLocatorSchema.annotate({ description: "Source endpoint" }),
  target: GenericObjectLocatorSchema.annotate({ description: "Target endpoint" }),
  direction: Schema.optional(RelationDirectionSchema.annotate({ description: relationDirectionDescription }))
}).annotate({
  title: "DeleteRelationByTripleParams",
  description: "Delete one concrete relation by exact association + source + target triple."
})

export const DeleteRelationParamsSchema = Schema.Union([
  DeleteRelationByIdParamsSchema,
  DeleteRelationByTripleParamsSchema
]).annotate({
  title: "DeleteRelationParams",
  description:
    "Parameters for idempotently deleting one concrete generic relation. Provide either relation, or the full association + source + target triple."
})
export type DeleteRelationParams = Schema.Schema.Type<typeof DeleteRelationParamsSchema>

export const DeleteRelationResultSchema = Schema.Struct({
  relationId: Schema.optional(RelationId),
  associationId: Schema.optional(AssociationId),
  deleted: Schema.Boolean,
  reason: Schema.optional(Schema.Literals(["not_found", "deleted"]))
})
export type DeleteRelationResult = Schema.Schema.Type<typeof DeleteRelationResultSchema>

export const listAssociationsParamsJsonSchema = withJsonSchemaPropertyDescriptions(
  toDraft07JsonSchema(ListAssociationsParamsSchema),
  {
    association: "Association ID, source or target role name, or stable association name.",
    sourceClass: "Only return associations whose source class matches this Huly class ID.",
    targetClass: "Only return associations whose target class matches this Huly class ID.",
    writableOnly: "Only return associations whose relation write path is validated and allowlisted.",
    includeSystem: `Include internal system associations. Defaults to ${DEFAULT_INCLUDE_SYSTEM_ASSOCIATIONS}.`,
    limit: `Maximum number of associations to return (default: ${DEFAULT_LIMIT}).`
  }
)
export const createAssociationParamsJsonSchema = withJsonSchemaPropertyDescriptions(
  toDraft07JsonSchema(CreateAssociationParamsSchema),
  {
    sourceClass: "Source Huly class ID. core:class:* system classes are rejected.",
    targetClass: "Target Huly class ID. core:class:* system classes are rejected.",
    sourceRole: "Role name stored on the source side of the association.",
    targetRole: "Role name stored on the target side of the association.",
    cardinality: "Association cardinality: one-to-one, one-to-many, or many-to-many.",
    automationOnly: `Whether Huly automation owns relation writes. Defaults to ${DEFAULT_ASSOCIATION_AUTOMATION_ONLY}.`,
    ifExists: "return_existing returns an identical association; fail reports it as an error."
  }
)
export const deleteAssociationParamsJsonSchema = withJsonSchemaPropertyDescriptions(
  toDraft07JsonSchema(DeleteAssociationParamsSchema),
  { association: "Association ID or unambiguous name. A missing association is a successful no-op." }
)
export const listRelationsParamsJsonSchema = {
  ...withJsonSchemaPropertyDescriptions(toDraft07JsonSchema(ListRelationsParamsBaseSchema), {
    association: "Association ID or name. Omit only when a source or target filter is provided.",
    source: "Optional source endpoint filter.",
    target: "Optional target endpoint filter.",
    direction: relationDirectionDescription,
    limit: `Maximum number of relations to return (default: ${DEFAULT_LIMIT}).`
  }),
  anyOf: [{ required: ["association"] }, { required: ["source"] }, { required: ["target"] }]
}
export const createRelationParamsJsonSchema = withJsonSchemaPropertyDescriptions(
  toDraft07JsonSchema(CreateRelationParamsSchema),
  {
    association: "Association ID or unambiguous name returned by list_associations.",
    source: "Source endpoint document.",
    target: "Target endpoint document.",
    direction: relationDirectionDescription,
    ifExists: "return_existing returns an existing relation; fail reports it as an error."
  }
)
export const deleteRelationParamsJsonSchema = {
  ...withJsonSchemaUnionPropertyDescriptions(toDraft07JsonSchema(DeleteRelationParamsSchema), {
    relation: "Concrete relation ID to delete.",
    association: "Association ID or unambiguous name.",
    source: "Source endpoint document.",
    target: "Target endpoint document.",
    direction: relationDirectionDescription
  }),
  type: "object"
}

const strictParseOptions = { onExcessProperty: "error" } as const

export const parseListAssociationsParams = Schema.decodeUnknownEffect(ListAssociationsParamsSchema, strictParseOptions)
export const parseCreateAssociationParams = Schema.decodeUnknownEffect(
  CreateAssociationParamsSchema,
  strictParseOptions
)
export const parseDeleteAssociationParams = Schema.decodeUnknownEffect(
  DeleteAssociationParamsSchema,
  strictParseOptions
)
export const parseListRelationsParams = Schema.decodeUnknownEffect(ListRelationsParamsSchema, strictParseOptions)
export const parseCreateRelationParams = Schema.decodeUnknownEffect(CreateRelationParamsSchema, strictParseOptions)
export const parseDeleteRelationParams = Schema.decodeUnknownEffect(DeleteRelationParamsSchema, strictParseOptions)
