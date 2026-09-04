import { Schema } from "effect"

import { HULY_NATIVE_REFERENCE_MARKDOWN_INPUT } from "./document-native-references.js"
import { toDraft07JsonSchema, withJsonSchemaPropertyDescriptions } from "./json-schema.js"
import {
  AccountUuid,
  assertUpdateFields,
  atLeastOneUpdateFieldMessage,
  Count,
  hasAtLeastOneDefined,
  ListTotal,
  NonEmptyString,
  Timestamp,
  withAtLeastOneRequired
} from "./shared.js"
import { FunnelIdentifier, FunnelReference } from "./leads.js"
import { ProjectTypeRefSchema } from "./task-management.js"

export const FunnelImpactSchema = Schema.Struct({
  leads: ListTotal,
  comments: Count,
  attachments: Count,
  totalAffected: ListTotal
})
export type FunnelImpact = Schema.Schema.Type<typeof FunnelImpactSchema>

export const FunnelWorkflowStatusSchema = Schema.Struct({ id: NonEmptyString, name: NonEmptyString })
export const FunnelWorkflowTaskTypeSchema = Schema.Struct({
  id: NonEmptyString,
  name: NonEmptyString,
  statuses: Schema.Array(FunnelWorkflowStatusSchema)
})
export const FunnelUnsupportedFieldSchema = Schema.Struct({ field: NonEmptyString, reason: NonEmptyString })

export const FunnelDetailSchema = Schema.Struct({
  identifier: FunnelIdentifier,
  name: NonEmptyString,
  description: Schema.String,
  fullDescription: Schema.optional(Schema.String),
  archived: Schema.Boolean,
  private: Schema.Boolean,
  members: Schema.Array(AccountUuid),
  owners: Schema.Array(AccountUuid),
  autoJoin: Schema.Boolean,
  autoJoinForRoles: Schema.Array(NonEmptyString),
  restricted: Schema.Boolean,
  projectType: Schema.Struct({ id: NonEmptyString, name: NonEmptyString }),
  workflow: Schema.Array(FunnelWorkflowTaskTypeSchema),
  impact: FunnelImpactSchema,
  createdOn: Schema.optional(Timestamp),
  createdBy: Schema.optional(NonEmptyString),
  modifiedOn: Timestamp,
  modifiedBy: NonEmptyString,
  unsupportedFields: Schema.Array(FunnelUnsupportedFieldSchema)
}).annotate({ title: "FunnelDetail", description: "Complete stable Huly funnel projection and impact summary." })
export type FunnelDetail = Schema.Schema.Type<typeof FunnelDetailSchema>

export const GetFunnelParamsSchema = Schema.Struct({
  funnel: FunnelReference.annotateKey({ description: "Funnel _id or exact name; ambiguous names are rejected." })
})
export type GetFunnelParams = Schema.Schema.Type<typeof GetFunnelParamsSchema>

const createFunnelFields = {
  name: NonEmptyString.annotateKey({ description: "Exact funnel name." }),
  description: Schema.optional(Schema.String.annotateKey({ description: "Plain-text funnel summary." })),
  fullDescription: Schema.optional(
    Schema.String.annotateKey({
      description: `Full funnel description in Markdown. ${HULY_NATIVE_REFERENCE_MARKDOWN_INPUT}`
    })
  ),
  private: Schema.optional(Schema.Boolean.annotateKey({ description: "Whether the funnel is private." })),
  members: Schema.optional(Schema.Array(AccountUuid).annotateKey({ description: "Workspace account UUID members." })),
  owners: Schema.optional(Schema.Array(AccountUuid).annotateKey({ description: "Workspace account UUID owners." })),
  autoJoin: Schema.optional(Schema.Boolean.annotateKey({ description: "Automatically join new workspace members." })),
  projectType: Schema.optional(
    ProjectTypeRefSchema.annotateKey({
      description: "Funnel project type _id or exact name; omit only when one valid Funnel project type exists."
    })
  )
}

const validMembership = (params: {
  readonly members?: ReadonlyArray<AccountUuid> | undefined
  readonly owners?: ReadonlyArray<AccountUuid> | undefined
}): string | undefined => {
  if (params.members !== undefined && params.members.length === 0) return "members must not be empty"
  if (params.owners !== undefined && params.owners.length === 0) return "owners must not be empty"
  if (params.members !== undefined && params.owners?.some((owner) => !params.members?.includes(owner))) {
    return "every owner must also be a member"
  }
  return undefined
}

export const CreateFunnelParamsSchema = Schema.Struct(createFunnelFields)
  .pipe(Schema.check(Schema.makeFilter(validMembership)))
  .annotate({ title: "CreateFunnelParams", description: "Create a workflow-backed Huly funnel." })
export type CreateFunnelParams = Schema.Schema.Type<typeof CreateFunnelParamsSchema>

export const UPDATE_FUNNEL_FIELDS = [
  "name",
  "description",
  "fullDescription",
  "private",
  "members",
  "owners",
  "autoJoin"
] as const

export const UpdateFunnelParamsSchema = Schema.Struct({
  funnel: FunnelReference,
  name: Schema.optional(NonEmptyString),
  description: Schema.optional(Schema.NullOr(Schema.String)),
  fullDescription: Schema.optional(Schema.NullOr(Schema.String)),
  private: Schema.optional(Schema.Boolean),
  members: Schema.optional(Schema.Array(AccountUuid)),
  owners: Schema.optional(Schema.Array(AccountUuid)),
  autoJoin: Schema.optional(Schema.Boolean)
})
  .pipe(
    Schema.check(
      Schema.makeFilter((params) =>
        hasAtLeastOneDefined(params, UPDATE_FUNNEL_FIELDS)
          ? validMembership(params)
          : atLeastOneUpdateFieldMessage(UPDATE_FUNNEL_FIELDS)
      )
    )
  )
  .annotate({ title: "UpdateFunnelParams", description: "Update mutable stable Huly funnel fields." })
export type UpdateFunnelParams = Schema.Schema.Type<typeof UpdateFunnelParamsSchema>
assertUpdateFields<UpdateFunnelParams>()(["funnel"], UPDATE_FUNNEL_FIELDS)

export const FunnelMutationParamsSchema = GetFunnelParamsSchema
export type FunnelMutationParams = Schema.Schema.Type<typeof FunnelMutationParamsSchema>

export const getFunnelParamsJsonSchema = toDraft07JsonSchema(GetFunnelParamsSchema)
export const createFunnelParamsJsonSchema = withJsonSchemaPropertyDescriptions(
  toDraft07JsonSchema(CreateFunnelParamsSchema),
  { fullDescription: `Full funnel description in Markdown. ${HULY_NATIVE_REFERENCE_MARKDOWN_INPUT}` }
)
export const updateFunnelParamsJsonSchema = withAtLeastOneRequired(
  withJsonSchemaPropertyDescriptions(toDraft07JsonSchema(UpdateFunnelParamsSchema), {
    fullDescription: `Full funnel description in Markdown; null clears it. ${HULY_NATIVE_REFERENCE_MARKDOWN_INPUT}`
  }),
  UPDATE_FUNNEL_FIELDS
)
export const funnelMutationParamsJsonSchema = getFunnelParamsJsonSchema

export const parseGetFunnelParams = Schema.decodeUnknownEffect(GetFunnelParamsSchema)
export const parseCreateFunnelParams = Schema.decodeUnknownEffect(CreateFunnelParamsSchema, {
  onExcessProperty: "error"
})
export const parseUpdateFunnelParams = Schema.decodeUnknownEffect(UpdateFunnelParamsSchema, {
  onExcessProperty: "error"
})
export const parseFunnelMutationParams = parseGetFunnelParams

export const CreateFunnelResultSchema = Schema.Struct({
  identifier: FunnelIdentifier,
  name: NonEmptyString,
  created: Schema.Boolean,
  archived: Schema.Boolean
})
export type CreateFunnelResult = Schema.Schema.Type<typeof CreateFunnelResultSchema>

export const FunnelMutationResultSchema = Schema.Struct({
  identifier: FunnelIdentifier,
  updated: Schema.Boolean,
  impact: FunnelImpactSchema
})
export type FunnelMutationResult = Schema.Schema.Type<typeof FunnelMutationResultSchema>

export const DeleteFunnelResultSchema = Schema.Struct({
  identifier: FunnelIdentifier,
  deleted: Schema.Boolean,
  impact: FunnelImpactSchema
})
export type DeleteFunnelResult = Schema.Schema.Type<typeof DeleteFunnelResultSchema>
