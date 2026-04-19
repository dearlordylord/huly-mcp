import { JSONSchema, ParseResult, Schema } from "effect"

import { Email, LimitParam, PersonName, StatusName, Timestamp } from "./shared.js"

// --- Lead IDs ---
// Upstream Huly reference: .reference/huly-platform/plugins/lead/src/index.ts
// Funnel is a Project-derived space; expose the stable `_id` as the machine identifier.
// Lead identifiers use the upstream `LEAD-<number>` convention.

const HulyRef = <T extends string>(tag: T) => Schema.Trim.pipe(Schema.nonEmptyString(), Schema.brand(tag))

export const FunnelReference = HulyRef("FunnelReference")
export type FunnelReference = Schema.Schema.Type<typeof FunnelReference>

export const FunnelIdentifier = HulyRef("FunnelIdentifier")
export type FunnelIdentifier = Schema.Schema.Type<typeof FunnelIdentifier>

// Specific upstream proof for the LEAD prefix:
// - https://github.com/hcengineering/platform/blob/b9657d53d130a2ed8034c1b71ab0cf8b7a0b4994/models/lead/src/types.ts#L70
// - https://github.com/hcengineering/platform/blob/b9657d53d130a2ed8034c1b71ab0cf8b7a0b4994/models/lead/src/migration.ts#L67
const CanonicalLeadIdentifier = Schema.Trim.pipe(
  Schema.pattern(/^LEAD-\d+$/, {
    message: () => "Expected lead identifier like 'LEAD-1'"
  }),
  Schema.brand("LeadIdentifier")
)

const leadIdentifierPattern = /^(?:LEAD-)?(\d+)$/i

export const LeadIdentifier = Schema.transformOrFail(Schema.String, CanonicalLeadIdentifier, {
  strict: true,
  decode: (input, _options, ast) => {
    const match = leadIdentifierPattern.exec(input.trim())
    return match !== null
      ? ParseResult.succeed(`LEAD-${match[1]}`)
      : ParseResult.fail(new ParseResult.Type(ast, input, "Expected lead identifier like 'LEAD-1'"))
  },
  encode: ParseResult.succeed
}).annotations({
  jsonSchema: {
    type: "string",
    pattern: "^LEAD-[0-9]+$"
  }
})
export type LeadIdentifier = Schema.Schema.Type<typeof LeadIdentifier>

// --- Output Schemas ---

export const FunnelSummarySchema = Schema.Struct({
  identifier: FunnelIdentifier,
  name: Schema.String,
  description: Schema.optional(Schema.String),
  archived: Schema.Boolean
}).annotations({
  title: "FunnelSummary",
  description: "Sales funnel summary"
})

export type FunnelSummary = Schema.Schema.Type<typeof FunnelSummarySchema>

export const LeadSummarySchema = Schema.Struct({
  identifier: LeadIdentifier,
  title: Schema.String,
  status: StatusName,
  assignee: Schema.optional(PersonName),
  customer: Schema.optional(Schema.String),
  modifiedOn: Schema.optional(Timestamp)
}).annotations({
  title: "LeadSummary",
  description: "Lead summary for list operations"
})

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
}).annotations({
  title: "LeadDetail",
  description: "Full lead with all fields"
})

export type LeadDetail = Schema.Schema.Type<typeof LeadDetailSchema>

// --- Param Schemas ---

export const ListFunnelsParamsSchema = Schema.Struct({
  includeArchived: Schema.optional(Schema.Boolean.annotations({
    description: "Include archived funnels in results (default: false, showing only active)"
  })),
  limit: Schema.optional(
    LimitParam.annotations({
      description: "Maximum number of funnels to return (default: 50)"
    })
  )
}).annotations({
  title: "ListFunnelsParams",
  description: "Parameters for listing funnels"
})

export type ListFunnelsParams = Schema.Schema.Type<typeof ListFunnelsParamsSchema>

const ListLeadsParamsBase = Schema.Struct({
  funnel: FunnelReference.annotations({
    description: "Funnel ID returned by list_funnels, or funnel name for convenience lookup."
  }),
  status: Schema.optional(StatusName.annotations({
    description: "Filter by status name"
  })),
  assignee: Schema.optional(Email.annotations({
    description: "Filter by assignee email"
  })),
  titleSearch: Schema.optional(Schema.String.annotations({
    description: "Search leads by title substring (case-insensitive)"
  })),
  limit: Schema.optional(
    LimitParam.annotations({
      description: "Maximum number of leads to return (default: 50)"
    })
  )
})

export const ListLeadsParamsSchema = ListLeadsParamsBase.annotations({
  title: "ListLeadsParams",
  description: "Parameters for listing leads in a funnel"
})

export type ListLeadsParams = Schema.Schema.Type<typeof ListLeadsParamsSchema>

export const GetLeadParamsSchema = Schema.Struct({
  funnel: FunnelReference.annotations({
    description: "Funnel ID returned by list_funnels, or funnel name for convenience lookup."
  }),
  identifier: LeadIdentifier.annotations({
    description: "Lead identifier (e.g., 'LEAD-1')"
  })
}).annotations({
  title: "GetLeadParams",
  description: "Parameters for getting a single lead"
})

export type GetLeadParams = Schema.Schema.Type<typeof GetLeadParamsSchema>

// --- JSON Schemas & Parsers ---

export const listFunnelsParamsJsonSchema = JSONSchema.make(ListFunnelsParamsSchema)
export const listLeadsParamsJsonSchema = JSONSchema.make(ListLeadsParamsSchema)
export const getLeadParamsJsonSchema = JSONSchema.make(GetLeadParamsSchema)

export const parseListFunnelsParams = Schema.decodeUnknown(ListFunnelsParamsSchema)
export const parseListLeadsParams = Schema.decodeUnknown(ListLeadsParamsSchema)
export const parseGetLeadParams = Schema.decodeUnknown(GetLeadParamsSchema)
export const parseLeadDetail = Schema.decodeUnknown(LeadDetailSchema)
export const parseLeadSummary = Schema.decodeUnknown(LeadSummarySchema)

// --- Result Types ---

export interface ListFunnelsResult {
  readonly funnels: ReadonlyArray<FunnelSummary>
  readonly total: number
}
