import { Schema } from "effect"

import { CustomFieldDateTimestamp } from "./custom-field-date.js"
import { toDraft07JsonSchema, withJsonSchemaPropertyDescriptions } from "./json-schema.js"

import {
  CustomFieldId,
  DocId,
  enumValuesDescription,
  HulyEnumId,
  LimitParam,
  MAX_LIMIT,
  NonEmptyString,
  ObjectClassName
} from "./shared.js"

export const CUSTOM_FIELDS_DEFAULT_LIMIT = MAX_LIMIT

export const ListCustomFieldsParamsSchema = Schema.Struct({
  targetClass: Schema.optional(
    NonEmptyString.annotate({
      description:
        "Filter by owner class/mixin ID (e.g. 'tracker:mixin:IssueTypeData' or a dynamic class ID). Returns fields defined on that class only."
    })
  ),
  limit: Schema.optional(
    LimitParam.annotate({ description: `Maximum number of fields to return (default: ${CUSTOM_FIELDS_DEFAULT_LIMIT})` })
  )
}).annotate({ title: "ListCustomFieldsParams", description: "Parameters for listing custom field definitions" })

export type ListCustomFieldsParams = Schema.Schema.Type<typeof ListCustomFieldsParamsSchema>

export const GetCustomFieldValuesParamsSchema = Schema.Struct({
  objectId: DocId.annotate({ description: "Document ID to read custom field values from" }),
  objectClass: ObjectClassName.annotate({
    description:
      "Class of the document (e.g. 'tracker:class:Issue', 'card:class:Card', or a dynamic master tag class ID)"
  })
}).annotate({
  title: "GetCustomFieldValuesParams",
  description: "Parameters for reading custom field values from a document"
})

export type GetCustomFieldValuesParams = Schema.Schema.Type<typeof GetCustomFieldValuesParamsSchema>

export const SetCustomFieldParamsSchema = Schema.Struct({
  objectId: DocId.annotate({ description: "Document ID to set the custom field value on" }),
  objectClass: ObjectClassName.annotate({
    description:
      "Class of the document (e.g. 'tracker:class:Issue', 'card:class:Card', or a dynamic master tag class ID)"
  }),
  fieldId: CustomFieldId.annotate({ description: "Custom field attribute ID (the _id from list_custom_fields)" }),
  value: Schema.String.annotate({
    description:
      "Value to set. Strings are passed as-is. For numbers, pass a numeric string (e.g. '42'). For dates, pass a real ISO calendar date in YYYY-MM-DD form (stored as UTC midnight) or a canonical non-negative epoch-millisecond string from 0 through 8640000000000000. Date-times, time-zone suffixes, signs, whitespace, decimals, and exponents are rejected. For booleans, pass 'true' or 'false'. For enums, pass the enum value string."
  })
}).annotate({ title: "SetCustomFieldParams", description: "Parameters for setting a custom field value on a document" })

export type SetCustomFieldParams = Schema.Schema.Type<typeof SetCustomFieldParamsSchema>

const CUSTOM_FIELD_PRIMITIVE_TYPE_NAMES = ["string", "number", "boolean", "date", "markup"] as const
export type PrimitiveCustomFieldTypeName = (typeof CUSTOM_FIELD_PRIMITIVE_TYPE_NAMES)[number]

const CUSTOM_FIELD_TYPE_NAMES = [...CUSTOM_FIELD_PRIMITIVE_TYPE_NAMES, "enum", "array", "ref", "unknown"] as const

export const CustomFieldTypeNameSchema = Schema.Literals(CUSTOM_FIELD_TYPE_NAMES).annotate({
  description: `Custom field type: ${enumValuesDescription(CUSTOM_FIELD_TYPE_NAMES)}`
})

export type CustomFieldTypeName = (typeof CUSTOM_FIELD_TYPE_NAMES)[number]
export const CustomFieldValueSchema = Schema.Struct({
  fieldId: CustomFieldId,
  label: Schema.String,
  value: Schema.Unknown,
  type: CustomFieldTypeNameSchema
})
export type CustomFieldValue = Schema.Schema.Type<typeof CustomFieldValueSchema>
export const SetCustomFieldResultSchema = Schema.Struct({
  objectId: DocId,
  fieldId: CustomFieldId,
  label: Schema.String,
  value: Schema.Unknown,
  updated: Schema.Boolean
})
export type SetCustomFieldResult = Schema.Schema.Type<typeof SetCustomFieldResultSchema>

export const EmptyCustomFieldTypeDetailsSchema = Schema.Record(Schema.String, Schema.Never)
export type EmptyCustomFieldTypeDetails = Schema.Schema.Type<typeof EmptyCustomFieldTypeDetailsSchema>

const CustomFieldTypeDetailsRecordSchema = Schema.Record(Schema.String, Schema.Json)

export type NestedCustomFieldTypeDetails = Readonly<Record<string, Schema.Json>> & {
  readonly _class: NonEmptyString
  readonly enumRef?: HulyEnumId
  readonly of?: NonEmptyString | NestedCustomFieldTypeDetails
  readonly to?: ObjectClassName
}

export type NestedCustomFieldTypeDetailsEncoded = Readonly<Record<string, Schema.Json>> & {
  readonly _class: string
  readonly enumRef?: string
  readonly of?: string | NestedCustomFieldTypeDetailsEncoded
  readonly to?: string
}

const NestedCustomFieldTypeDetailsSchema: Schema.Codec<
  NestedCustomFieldTypeDetails,
  NestedCustomFieldTypeDetailsEncoded
> = Schema.StructWithRest(
  Schema.Struct({
    _class: NonEmptyString,
    enumRef: Schema.optionalKey(HulyEnumId),
    of: Schema.optionalKey(
      Schema.Union([
        NonEmptyString,
        Schema.suspend(
          (): Schema.Codec<NestedCustomFieldTypeDetails, NestedCustomFieldTypeDetailsEncoded> =>
            NestedCustomFieldTypeDetailsSchema
        )
      ])
    ),
    to: Schema.optionalKey(ObjectClassName)
  }),
  [CustomFieldTypeDetailsRecordSchema]
)

const CustomFieldTypeDetailsClassField = Schema.optionalKey(NonEmptyString)

export const EnumCustomFieldTypeDetailsSchema = Schema.StructWithRest(
  Schema.Struct({
    _class: CustomFieldTypeDetailsClassField,
    enumRef: HulyEnumId.pipe(
      Schema.annotateKey({ messageMissingKey: "enum custom field typeDetails must include enumRef" })
    ),
    of: Schema.optionalKey(HulyEnumId)
  }),
  [CustomFieldTypeDetailsRecordSchema]
)
export type EnumCustomFieldTypeDetails = Schema.Schema.Type<typeof EnumCustomFieldTypeDetailsSchema>
export const ArrayCustomFieldTypeDetailsSchema = Schema.StructWithRest(
  Schema.Struct({
    _class: CustomFieldTypeDetailsClassField,
    of: Schema.Union([NonEmptyString, NestedCustomFieldTypeDetailsSchema]).pipe(
      Schema.annotateKey({ messageMissingKey: "array custom field typeDetails must include of" })
    )
  }),
  [CustomFieldTypeDetailsRecordSchema]
)
export type ArrayCustomFieldTypeDetails = Schema.Schema.Type<typeof ArrayCustomFieldTypeDetailsSchema>
export const RefCustomFieldTypeDetailsSchema = Schema.StructWithRest(
  Schema.Struct({
    _class: CustomFieldTypeDetailsClassField,
    to: ObjectClassName.pipe(Schema.annotateKey({ messageMissingKey: "ref custom field typeDetails must include to" }))
  }),
  [CustomFieldTypeDetailsRecordSchema]
)
export type RefCustomFieldTypeDetails = Schema.Schema.Type<typeof RefCustomFieldTypeDetailsSchema>
export const UnknownCustomFieldTypeDetailsSchema = CustomFieldTypeDetailsRecordSchema
export type UnknownCustomFieldTypeDetails = Schema.Schema.Type<typeof UnknownCustomFieldTypeDetailsSchema>

const CustomFieldInfoBaseWireFields = {
  id: CustomFieldId,
  name: Schema.String,
  label: Schema.String,
  ownerClassId: ObjectClassName,
  ownerLabel: Schema.String
} as const

export const CustomFieldInfoWireSchema = Schema.Union([
  Schema.Struct({
    ...CustomFieldInfoBaseWireFields,
    type: Schema.Literal("string"),
    typeDetails: EmptyCustomFieldTypeDetailsSchema
  }),
  Schema.Struct({
    ...CustomFieldInfoBaseWireFields,
    type: Schema.Literal("number"),
    typeDetails: EmptyCustomFieldTypeDetailsSchema
  }),
  Schema.Struct({
    ...CustomFieldInfoBaseWireFields,
    type: Schema.Literal("boolean"),
    typeDetails: EmptyCustomFieldTypeDetailsSchema
  }),
  Schema.Struct({
    ...CustomFieldInfoBaseWireFields,
    type: Schema.Literal("date"),
    typeDetails: EmptyCustomFieldTypeDetailsSchema
  }),
  Schema.Struct({
    ...CustomFieldInfoBaseWireFields,
    type: Schema.Literal("markup"),
    typeDetails: EmptyCustomFieldTypeDetailsSchema
  }),
  Schema.Struct({
    ...CustomFieldInfoBaseWireFields,
    type: Schema.Literal("enum"),
    typeDetails: EnumCustomFieldTypeDetailsSchema
  }),
  Schema.Struct({
    ...CustomFieldInfoBaseWireFields,
    type: Schema.Literal("array"),
    typeDetails: ArrayCustomFieldTypeDetailsSchema
  }),
  Schema.Struct({
    ...CustomFieldInfoBaseWireFields,
    type: Schema.Literal("ref"),
    typeDetails: RefCustomFieldTypeDetailsSchema
  }),
  Schema.Struct({
    ...CustomFieldInfoBaseWireFields,
    type: Schema.Literal("unknown"),
    typeDetails: UnknownCustomFieldTypeDetailsSchema
  })
])
export type CustomFieldInfo = Schema.Schema.Type<typeof CustomFieldInfoWireSchema>

export const CustomFieldValueWireSchema = Schema.Struct({
  fieldId: CustomFieldId,
  label: Schema.String,
  value: Schema.Unknown,
  type: CustomFieldTypeNameSchema
})

const RecruitingCandidateCustomFieldValueBaseWireFields = {
  fieldId: CustomFieldId,
  name: Schema.String,
  label: Schema.String,
  ownerClassId: ObjectClassName,
  ownerLabel: Schema.String
} as const

export const RecruitingCandidateCustomFieldValueWireSchema = Schema.Union([
  Schema.Struct({
    ...RecruitingCandidateCustomFieldValueBaseWireFields,
    type: Schema.Literals(["string", "markup", "enum"]),
    value: Schema.optionalKey(Schema.String)
  }),
  Schema.Struct({
    ...RecruitingCandidateCustomFieldValueBaseWireFields,
    type: Schema.Literal("number"),
    value: Schema.optionalKey(Schema.Number)
  }),
  Schema.Struct({
    ...RecruitingCandidateCustomFieldValueBaseWireFields,
    type: Schema.Literal("date"),
    value: Schema.optionalKey(CustomFieldDateTimestamp)
  }),
  Schema.Struct({
    ...RecruitingCandidateCustomFieldValueBaseWireFields,
    type: Schema.Literal("boolean"),
    value: Schema.optionalKey(Schema.Boolean)
  }),
  Schema.Struct({
    ...RecruitingCandidateCustomFieldValueBaseWireFields,
    type: Schema.Literal("array"),
    value: Schema.optionalKey(Schema.Array(Schema.Json))
  }),
  Schema.Struct({
    ...RecruitingCandidateCustomFieldValueBaseWireFields,
    type: Schema.Literal("ref"),
    value: Schema.optionalKey(Schema.String)
  }),
  Schema.Struct({
    ...RecruitingCandidateCustomFieldValueBaseWireFields,
    type: Schema.Literal("unknown"),
    value: Schema.optionalKey(Schema.Json)
  })
])
export type RecruitingCandidateCustomFieldValue = Schema.Schema.Type<
  typeof RecruitingCandidateCustomFieldValueWireSchema
>

export const SetCustomFieldResultWireSchema = Schema.Struct({
  objectId: DocId,
  fieldId: CustomFieldId,
  label: Schema.String,
  value: Schema.Unknown,
  updated: Schema.Boolean
})

export const ListCustomFieldsResultSchema = Schema.Array(CustomFieldInfoWireSchema)
export const GetCustomFieldValuesResultSchema = Schema.Array(CustomFieldValueWireSchema)
export const GetRecruitingCandidateCustomFieldValuesResultSchema = Schema.Array(
  RecruitingCandidateCustomFieldValueWireSchema
)

export const listCustomFieldsParamsJsonSchema = withJsonSchemaPropertyDescriptions(
  toDraft07JsonSchema(ListCustomFieldsParamsSchema),
  {
    targetClass: "Filter by owner class or mixin ID. Returns fields defined directly on that class or mixin only.",
    limit: `Maximum number of fields to return (default: ${CUSTOM_FIELDS_DEFAULT_LIMIT}).`
  }
)
export const getCustomFieldValuesParamsJsonSchema = withJsonSchemaPropertyDescriptions(
  toDraft07JsonSchema(GetCustomFieldValuesParamsSchema),
  {
    objectId: "Document ID to read custom field values from.",
    objectClass: "Document class ID, such as tracker:class:Issue or card:class:Card."
  }
)
export const setCustomFieldParamsJsonSchema = withJsonSchemaPropertyDescriptions(
  toDraft07JsonSchema(SetCustomFieldParamsSchema),
  {
    objectId: "Document ID to set the custom field value on.",
    objectClass: "Document class ID, such as tracker:class:Issue or card:class:Card.",
    fieldId: "Custom field attribute ID returned by list_custom_fields.",
    value:
      "Value to set using the field's documented wire format. Dates accept YYYY-MM-DD or canonical non-negative epoch milliseconds."
  }
)

export const parseListCustomFieldsParams = Schema.decodeUnknownEffect(ListCustomFieldsParamsSchema)
export const parseGetCustomFieldValuesParams = Schema.decodeUnknownEffect(GetCustomFieldValuesParamsSchema)
export const parseSetCustomFieldParams = Schema.decodeUnknownEffect(SetCustomFieldParamsSchema)
