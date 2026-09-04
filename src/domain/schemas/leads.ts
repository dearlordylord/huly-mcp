import { Effect, Schema, SchemaGetter, SchemaIssue } from "effect"

import {
  assertUpdateFields,
  atLeastOneUpdateFieldMessage,
  DEFAULT_INCLUDE_ARCHIVED,
  DEFAULT_LIMIT,
  DocId,
  Count,
  hasAtLeastOneDefined,
  LimitParam,
  ListTotal,
  NonEmptyString,
  PersonName,
  PersonRefInput,
  StatusName,
  Timestamp,
  withAtLeastOneRequired
} from "./shared.js"
import { PersonLocator } from "./hr-departments.js"
import { TaskTypeRefSchema } from "./task-management.js"
import { toDraft07JsonSchema, withJsonSchemaPropertyDescriptions } from "./json-schema.js"

// --- Lead IDs ---
// Upstream Huly reference:
// https://github.com/hcengineering/platform/blob/b9657d53d130a2ed8034c1b71ab0cf8b7a0b4994/plugins/lead/src/index.ts#L71-L82
// Funnel is a Project-derived space; expose the stable `_id` as the machine identifier.
// Lead identifiers use the upstream `LEAD-<number>` convention.

export const FunnelReference = NonEmptyString.pipe(Schema.brand("FunnelReference"))
export type FunnelReference = Schema.Schema.Type<typeof FunnelReference>

export const FunnelIdentifier = DocId.pipe(Schema.brand("FunnelIdentifier"))
export type FunnelIdentifier = Schema.Schema.Type<typeof FunnelIdentifier>

// Specific upstream proof for the LEAD prefix:
// - https://github.com/hcengineering/platform/blob/b9657d53d130a2ed8034c1b71ab0cf8b7a0b4994/models/lead/src/types.ts#L70
// - https://github.com/hcengineering/platform/blob/b9657d53d130a2ed8034c1b71ab0cf8b7a0b4994/models/lead/src/migration.ts#L67
export const CanonicalLeadIdentifier = Schema.String.check(
  Schema.isPattern(/^LEAD-[0-9]+$/, { message: "Expected lead identifier like 'LEAD-1'" })
).pipe(Schema.brand("LeadIdentifier"))

const leadIdentifierPattern = /^(?:LEAD-)?(\d+)$/i

export const LeadIdentifier = Schema.String.pipe(
  Schema.decodeTo(CanonicalLeadIdentifier, {
    decode: SchemaGetter.transformOrFail((input, options) => {
      const match = leadIdentifierPattern.exec(input.trim())
      return match !== null
        ? Effect.succeed(`LEAD-${match[1]}`)
        : Effect.fail(
            new SchemaIssue.InvalidValue({ message: "Expected lead identifier like 'LEAD-1'" }, input, options)
          )
    }),
    encode: SchemaGetter.passthrough()
  })
).annotate({ jsonSchema: { type: "string", pattern: "^LEAD-[0-9]+$" } })
export type LeadIdentifier = Schema.Schema.Type<typeof LeadIdentifier>

// --- Output Schemas ---

export const FunnelSummarySchema = Schema.Struct({
  identifier: FunnelIdentifier,
  name: Schema.String,
  description: Schema.optional(Schema.String),
  archived: Schema.Boolean
}).annotate({ title: "FunnelSummary", description: "Sales funnel summary" })

export type FunnelSummary = Schema.Schema.Type<typeof FunnelSummarySchema>

export const LeadSummarySchema = Schema.Struct({
  identifier: LeadIdentifier,
  title: Schema.String,
  status: StatusName,
  assignee: Schema.optional(PersonName),
  customer: Schema.optional(Schema.String),
  modifiedOn: Schema.optional(Timestamp)
}).annotate({ title: "LeadSummary", description: "Lead summary for list operations" })

export type LeadSummary = Schema.Schema.Type<typeof LeadSummarySchema>

export const LeadDetailSchema = Schema.Struct({
  identifier: LeadIdentifier,
  title: Schema.String,
  description: Schema.optional(Schema.String),
  status: StatusName,
  assignee: Schema.optional(PersonName),
  customer: Schema.optional(Schema.String),
  funnel: FunnelIdentifier,
  funnelName: Schema.String,
  modifiedOn: Schema.optional(Timestamp),
  createdOn: Schema.optional(Timestamp)
}).annotate({ title: "LeadDetail", description: "Full lead with all fields" })

export type LeadDetail = Schema.Schema.Type<typeof LeadDetailSchema>

// --- Param Schemas ---

export const ListFunnelsParamsSchema = Schema.Struct({
  includeArchived: Schema.optional(
    Schema.Boolean.annotateKey({
      description: `Include archived funnels in results (default: ${DEFAULT_INCLUDE_ARCHIVED}, showing only active)`
    })
  ),
  limit: Schema.optional(
    LimitParam.annotateKey({ description: `Maximum number of funnels to return (default: ${DEFAULT_LIMIT})` })
  )
}).annotate({ title: "ListFunnelsParams", description: "Parameters for listing funnels" })

export type ListFunnelsParams = Schema.Schema.Type<typeof ListFunnelsParamsSchema>

const ListLeadsParamsBase = Schema.Struct({
  funnel: FunnelReference.annotateKey({
    description: "Funnel ID returned by list_funnels, or funnel name for convenience lookup."
  }),
  status: Schema.optional(StatusName.annotateKey({ description: "Filter by status name" })),
  assignee: Schema.optional(PersonRefInput.annotateKey({ description: "Filter by assignee email or display name" })),
  titleSearch: Schema.optional(
    Schema.String.annotateKey({ description: "Search leads by title substring (case-insensitive)" })
  ),
  limit: Schema.optional(
    LimitParam.annotateKey({ description: `Maximum number of leads to return (default: ${DEFAULT_LIMIT})` })
  )
})

export const ListLeadsParamsSchema = ListLeadsParamsBase.annotate({
  title: "ListLeadsParams",
  description: "Parameters for listing leads in a funnel"
})

export type ListLeadsParams = Schema.Schema.Type<typeof ListLeadsParamsSchema>

export const GetLeadParamsSchema = Schema.Struct({
  funnel: FunnelReference.annotateKey({
    description: "Funnel ID returned by list_funnels, or funnel name for convenience lookup."
  }),
  identifier: LeadIdentifier.annotateKey({ description: "Lead identifier (e.g., 'LEAD-1')" })
}).annotate({ title: "GetLeadParams", description: "Parameters for getting a single lead" })

export type GetLeadParams = Schema.Schema.Type<typeof GetLeadParamsSchema>

const LeadPersonCustomerLocatorSchema = Schema.Struct({
  kind: Schema.Literal("person"),
  identifier: PersonRefInput.annotateKey({
    description: "Existing person _id, exact email address, or exact display name."
  })
})

const LeadOrganizationCustomerLocatorSchema = Schema.Struct({
  kind: Schema.Literal("organization"),
  identifier: NonEmptyString.annotateKey({
    description: "Existing organization _id or exact unique organization name."
  })
})

export const LeadCustomerLocatorSchema = Schema.Union([
  LeadPersonCustomerLocatorSchema,
  LeadOrganizationCustomerLocatorSchema
]).annotate({
  title: "LeadCustomerLocator",
  description:
    "Explicit locator for an existing Huly customer contact. Use person for a person _id, exact email, or exact display name; use organization for an organization _id or exact unique name. This tool never creates contacts inline."
})

export type LeadCustomerLocator = Schema.Schema.Type<typeof LeadCustomerLocatorSchema>

export const CreateLeadParamsSchema = Schema.Struct({
  funnel: FunnelReference.annotateKey({
    description: "Active funnel ID returned by list_funnels, or exact funnel name."
  }),
  customer: LeadCustomerLocatorSchema.annotateKey({
    description:
      "Existing person or organization to attach as the customer. The contact is promoted to a Huly Customer idempotently when needed."
  }),
  title: NonEmptyString.annotateKey({ description: "Non-empty lead title." }),
  description: Schema.optional(
    Schema.String.annotateKey({
      description: "Optional Markdown description. Current-workspace Huly links are preserved as native references."
    })
  ),
  assignee: Schema.optional(
    PersonRefInput.annotateKey({
      description: "Optional employee assignee by person/employee ID, exact email, or exact display name."
    })
  ),
  status: Schema.optional(
    StatusName.annotateKey({
      description:
        "Optional status name matched exactly after normalization (trimmed, case-insensitive, and ignoring spaces, hyphens, and underscores)."
    })
  ),
  taskType: Schema.optional(
    TaskTypeRefSchema.annotateKey({
      description:
        "Optional native Lead task type _id or exact display name within the funnel. Omit when the funnel has one deterministic Lead type."
    })
  )
}).annotate({
  title: "CreateLeadParams",
  description: "Create one native Huly lead for an existing person or organization in an active funnel."
})

export type CreateLeadParams = Schema.Schema.Type<typeof CreateLeadParamsSchema>

export const UPDATE_LEAD_FIELDS = [
  "title",
  "description",
  "status",
  "assignee",
  "startDate",
  "dueDate",
  "customerDescription"
] as const satisfies ReadonlyArray<
  "title" | "description" | "status" | "assignee" | "startDate" | "dueDate" | "customerDescription"
>

const updateLeadFieldMessage = atLeastOneUpdateFieldMessage(UPDATE_LEAD_FIELDS)

export const UpdateLeadParamsSchema = Schema.Struct({
  funnel: FunnelReference.annotateKey({ description: "Source funnel ID or exact funnel name." }),
  identifier: LeadIdentifier.annotateKey({ description: "Lead identifier, such as LEAD-1." }),
  title: Schema.optional(NonEmptyString.annotateKey({ description: "Replacement non-empty lead title." })),
  description: Schema.optional(
    Schema.NullOr(Schema.String).annotateKey({ description: "Replacement Markdown description; null clears it." })
  ),
  status: Schema.optional(
    StatusName.annotateKey({
      description:
        "Replacement workflow status name matched exactly after normalization (trimmed, case-insensitive, and ignoring spaces, hyphens, and underscores)."
    })
  ),
  assignee: Schema.optional(
    Schema.NullOr(PersonRefInput).annotateKey({
      description: "Replacement employee ID, exact email address, or exact display name; null unassigns."
    })
  ),
  startDate: Schema.optional(
    Schema.NullOr(Timestamp).annotateKey({ description: "Start timestamp in milliseconds; null clears it." })
  ),
  dueDate: Schema.optional(
    Schema.NullOr(Timestamp).annotateKey({ description: "Due timestamp in milliseconds; null clears it." })
  ),
  customerDescription: Schema.optional(
    Schema.NullOr(Schema.String).annotateKey({
      description: "Replacement Markdown customer description; null clears it."
    })
  )
})
  .pipe(
    Schema.check(
      Schema.makeFilter((params) =>
        hasAtLeastOneDefined(params, UPDATE_LEAD_FIELDS) ? undefined : updateLeadFieldMessage
      )
    )
  )
  .annotate({ title: "UpdateLeadParams", description: `Update a native Huly lead. ${updateLeadFieldMessage}` })

export type UpdateLeadParams = Schema.Schema.Type<typeof UpdateLeadParamsSchema>
assertUpdateFields<UpdateLeadParams>()(["funnel", "identifier"], UPDATE_LEAD_FIELDS)

export const MoveLeadParamsSchema = Schema.Struct({
  funnel: FunnelReference.annotateKey({ description: "Current funnel ID or exact funnel name." }),
  identifier: LeadIdentifier.annotateKey({ description: "Lead identifier, such as LEAD-1." }),
  destinationFunnel: FunnelReference.annotateKey({ description: "Destination funnel ID or exact funnel name." }),
  status: Schema.optional(
    StatusName.annotateKey({
      description:
        "Optional destination workflow status matched exactly after normalization (trimmed, case-insensitive, and ignoring spaces, hyphens, and underscores); omit to map by status name."
    })
  )
}).annotate({
  title: "MoveLeadParams",
  description:
    "Move a native lead between validated Lead funnels. When status is omitted, the current status name must exist in the destination workflow."
})

export type MoveLeadParams = Schema.Schema.Type<typeof MoveLeadParamsSchema>

const DeleteLeadPreviewSchema = Schema.Struct({
  funnel: FunnelReference.annotateKey({ description: "Funnel ID or exact funnel name." }),
  identifier: LeadIdentifier.annotateKey({ description: "Lead identifier, such as LEAD-1." }),
  execute: Schema.optional(Schema.Literal(false))
})

const DeleteLeadExecuteSchema = Schema.Struct({
  funnel: FunnelReference.annotateKey({ description: "Funnel ID or exact funnel name." }),
  identifier: LeadIdentifier.annotateKey({ description: "Lead identifier, such as LEAD-1." }),
  execute: Schema.Literal(true),
  expectedComments: Count.annotateKey({ description: "Comment count observed during deletion preflight." }),
  expectedAttachments: Count.annotateKey({ description: "Attachment count observed during deletion preflight." }),
  expectedLabels: Count.annotateKey({ description: "Label count observed during deletion preflight." })
})

export const DeleteLeadParamsSchema = Schema.Union([DeleteLeadPreviewSchema, DeleteLeadExecuteSchema]).annotate({
  title: "DeleteLeadParams",
  description:
    "Preview lead deletion impact by default. To execute, pass execute=true and the exact observed comment, attachment, and label counts."
})

export type DeleteLeadParams = Schema.Schema.Type<typeof DeleteLeadParamsSchema>

export const MakePersonCustomerParamsSchema = Schema.Struct({
  identifier: PersonLocator.annotateKey({
    description: "Existing person ID, exact email address, or exact display name. No person is created."
  })
}).annotate({
  title: "MakePersonCustomerParams",
  description: "Apply the native Customer mixin to one exact existing person, idempotently."
})

export type MakePersonCustomerParams = Schema.Schema.Type<typeof MakePersonCustomerParamsSchema>

// --- JSON Schemas & Parsers ---

export const listFunnelsParamsJsonSchema = withJsonSchemaPropertyDescriptions(
  toDraft07JsonSchema(ListFunnelsParamsSchema),
  {
    includeArchived: `Include archived funnels (default: ${DEFAULT_INCLUDE_ARCHIVED}).`,
    limit: `Maximum number of funnels to return (default: ${DEFAULT_LIMIT}).`
  }
)
export const listLeadsParamsJsonSchema = withJsonSchemaPropertyDescriptions(
  toDraft07JsonSchema(ListLeadsParamsSchema),
  {
    funnel: "Funnel ID returned by list_funnels, or exact funnel name.",
    status:
      "Filter by a status name matched exactly after normalization (trimmed, case-insensitive, and ignoring spaces, hyphens, and underscores).",
    assignee: "Filter by assignee email or display name.",
    titleSearch: "Search leads by title substring (case-insensitive).",
    limit: `Maximum number of leads to return (default: ${DEFAULT_LIMIT}).`
  }
)
export const getLeadParamsJsonSchema = withJsonSchemaPropertyDescriptions(toDraft07JsonSchema(GetLeadParamsSchema), {
  funnel: "Funnel ID returned by list_funnels, or exact funnel name.",
  identifier: "Lead identifier, such as LEAD-1."
})
export const createLeadParamsJsonSchema = withJsonSchemaPropertyDescriptions(
  toDraft07JsonSchema(CreateLeadParamsSchema),
  {
    funnel: "Active funnel ID returned by list_funnels, or exact funnel name.",
    customer: "Existing person or organization customer locator.",
    title: "Non-empty lead title.",
    description: "Optional Markdown description.",
    assignee: "Optional employee assignee by ID, exact email, or exact display name.",
    status:
      "Optional workflow status name matched exactly after normalization (trimmed, case-insensitive, and ignoring spaces, hyphens, and underscores).",
    taskType: "Optional native Lead task type ID or exact display name."
  }
)
export const updateLeadParamsJsonSchema = withJsonSchemaPropertyDescriptions(
  withAtLeastOneRequired(toDraft07JsonSchema(UpdateLeadParamsSchema), UPDATE_LEAD_FIELDS),
  {
    description: "Replacement Markdown description; null clears it.",
    customerDescription: "Replacement Markdown customer description; null clears it.",
    assignee: "Replacement employee ID, exact email address, or exact display name; null unassigns.",
    startDate: "Start timestamp in milliseconds; null clears it.",
    dueDate: "Due timestamp in milliseconds; null clears it."
  }
)
export const moveLeadParamsJsonSchema = toDraft07JsonSchema(MoveLeadParamsSchema)
export const deleteLeadParamsJsonSchema = toDraft07JsonSchema(DeleteLeadParamsSchema)
export const makePersonCustomerParamsJsonSchema = toDraft07JsonSchema(MakePersonCustomerParamsSchema)

export const parseListFunnelsParams = Schema.decodeUnknownEffect(ListFunnelsParamsSchema)
export const parseListLeadsParams = Schema.decodeUnknownEffect(ListLeadsParamsSchema)
export const parseGetLeadParams = Schema.decodeUnknownEffect(GetLeadParamsSchema)
export const parseCreateLeadParams = Schema.decodeUnknownEffect(CreateLeadParamsSchema, { onExcessProperty: "error" })
export const parseUpdateLeadParams = Schema.decodeUnknownEffect(UpdateLeadParamsSchema, { onExcessProperty: "error" })
export const parseMoveLeadParams = Schema.decodeUnknownEffect(MoveLeadParamsSchema, { onExcessProperty: "error" })
export const parseDeleteLeadParams = Schema.decodeUnknownEffect(DeleteLeadParamsSchema, { onExcessProperty: "error" })
export const parseMakePersonCustomerParams = Schema.decodeUnknownEffect(MakePersonCustomerParamsSchema, {
  onExcessProperty: "error"
})
export const parseLeadDetail = Schema.decodeUnknownEffect(LeadDetailSchema)
export const parseLeadSummary = Schema.decodeUnknownEffect(LeadSummarySchema)
export const ListFunnelsResultSchema = Schema.Struct({ funnels: Schema.Array(FunnelSummarySchema), total: ListTotal })
export type ListFunnelsResult = Schema.Schema.Type<typeof ListFunnelsResultSchema>

export const ListLeadsResultSchema = Schema.Array(LeadSummarySchema)
export const GetLeadResultSchema = LeadDetailSchema

export const CreateLeadResultSchema = Schema.Struct({
  leadId: DocId.annotateKey({ description: "Raw Huly Lead document _id." }),
  identifier: CanonicalLeadIdentifier.annotateKey({ description: "Human lead identifier in LEAD-<number> form." })
}).annotate({ title: "CreateLeadResult", description: "Identifiers for the newly created native Huly lead." })

export type CreateLeadResult = Schema.Schema.Type<typeof CreateLeadResultSchema>
