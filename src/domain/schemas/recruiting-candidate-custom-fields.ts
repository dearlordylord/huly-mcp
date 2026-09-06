import { Schema } from "effect"

import { CandidateIdentifier, CandidateRefSchema } from "./recruiting-common.js"
import { toDraft07JsonSchema } from "./json-schema.js"
import { CUSTOM_FIELDS_DEFAULT_LIMIT } from "./custom-fields.js"
import { CustomFieldId, LimitParam, ObjectClassName } from "./shared.js"

export const ListRecruitingCandidateCustomFieldsParamsSchema = Schema.Struct({
  candidate: CandidateIdentifier.annotate({
    description: "Candidate locator: person _id, exact email, or exact person display name."
  }),
  limit: Schema.optional(
    LimitParam.annotateKey({
      description: `Maximum number of custom fields to return (default: ${CUSTOM_FIELDS_DEFAULT_LIMIT}).`
    })
  )
})
export type ListRecruitingCandidateCustomFieldsParams = Schema.Schema.Type<
  typeof ListRecruitingCandidateCustomFieldsParamsSchema
>

export const GetRecruitingCandidateCustomFieldValuesParamsSchema = Schema.Struct({
  candidate: CandidateIdentifier.annotate({
    description: "Candidate locator: person _id, exact email, or exact person display name."
  })
})
export type GetRecruitingCandidateCustomFieldValuesParams = Schema.Schema.Type<
  typeof GetRecruitingCandidateCustomFieldValuesParamsSchema
>

export const SetRecruitingCandidateCustomFieldParamsSchema = Schema.Struct({
  candidate: CandidateIdentifier.annotate({
    description: "Candidate locator: person _id, exact email, or exact person display name."
  }),
  fieldId: CustomFieldId.annotate({
    description: "Custom field attribute ID returned by list_recruiting_candidate_custom_fields."
  }),
  value: Schema.String.annotate({
    description:
      "Value in the field's documented wire format. Numbers use numeric strings, booleans use true/false, and dates use YYYY-MM-DD or canonical epoch milliseconds. Array, ref, and unknown fields cannot be written."
  })
})
export type SetRecruitingCandidateCustomFieldParams = Schema.Schema.Type<
  typeof SetRecruitingCandidateCustomFieldParamsSchema
>

const RecruitingCandidateCustomFieldMutationResultBaseFields = {
  candidate: CandidateRefSchema,
  fieldId: CustomFieldId,
  name: Schema.String,
  label: Schema.String,
  ownerClassId: ObjectClassName
} as const

export const RecruitingCandidateCustomFieldMutationResultSchema = Schema.Union([
  Schema.Struct({
    ...RecruitingCandidateCustomFieldMutationResultBaseFields,
    type: Schema.Literals(["string", "markup", "enum"]),
    value: Schema.String,
    updated: Schema.Literal(true)
  }),
  Schema.Struct({
    ...RecruitingCandidateCustomFieldMutationResultBaseFields,
    type: Schema.Literals(["number", "date"]),
    value: Schema.Number,
    updated: Schema.Literal(true)
  }),
  Schema.Struct({
    ...RecruitingCandidateCustomFieldMutationResultBaseFields,
    type: Schema.Literal("boolean"),
    value: Schema.Boolean,
    updated: Schema.Literal(true)
  })
])
export type RecruitingCandidateCustomFieldMutationResult = Schema.Schema.Type<
  typeof RecruitingCandidateCustomFieldMutationResultSchema
>

export const listRecruitingCandidateCustomFieldsParamsJsonSchema = toDraft07JsonSchema(
  ListRecruitingCandidateCustomFieldsParamsSchema
)
export const getRecruitingCandidateCustomFieldValuesParamsJsonSchema = toDraft07JsonSchema(
  GetRecruitingCandidateCustomFieldValuesParamsSchema
)
export const setRecruitingCandidateCustomFieldParamsJsonSchema = toDraft07JsonSchema(
  SetRecruitingCandidateCustomFieldParamsSchema
)

export const parseListRecruitingCandidateCustomFieldsParams = Schema.decodeUnknownEffect(
  ListRecruitingCandidateCustomFieldsParamsSchema
)
export const parseGetRecruitingCandidateCustomFieldValuesParams = Schema.decodeUnknownEffect(
  GetRecruitingCandidateCustomFieldValuesParamsSchema
)
export const parseSetRecruitingCandidateCustomFieldParams = Schema.decodeUnknownEffect(
  SetRecruitingCandidateCustomFieldParamsSchema
)
