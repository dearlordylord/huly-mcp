import { JSONSchema, Schema } from "effect"

import { CustomFieldId, LimitParam, NonEmptyString, ObjectClassName } from "./shared.js"

export const ListCustomFieldsParamsSchema = Schema.Struct({
  targetClass: Schema.optional(
    NonEmptyString.annotations({
      description:
        "Filter by owner class/mixin ID (e.g. 'tracker:mixin:IssueTypeData' or a dynamic class ID). Returns fields defined on that class only."
    })
  ),
  limit: Schema.optional(
    LimitParam.annotations({
      description: "Maximum number of fields to return (default: 200)"
    })
  )
}).annotations({
  title: "ListCustomFieldsParams",
  description: "Parameters for listing custom field definitions"
})

export type ListCustomFieldsParams = Schema.Schema.Type<typeof ListCustomFieldsParamsSchema>

export const GetCustomFieldValuesParamsSchema = Schema.Struct({
  objectId: NonEmptyString.annotations({
    description: "Document ID to read custom field values from"
  }),
  objectClass: NonEmptyString.annotations({
    description:
      "Class of the document (e.g. 'tracker:class:Issue', 'card:class:Card', or a dynamic master tag class ID)"
  })
}).annotations({
  title: "GetCustomFieldValuesParams",
  description: "Parameters for reading custom field values from a document"
})

export type GetCustomFieldValuesParams = Schema.Schema.Type<typeof GetCustomFieldValuesParamsSchema>

export const SetCustomFieldParamsSchema = Schema.Struct({
  objectId: NonEmptyString.annotations({
    description: "Document ID to set the custom field value on"
  }),
  objectClass: NonEmptyString.annotations({
    description:
      "Class of the document (e.g. 'tracker:class:Issue', 'card:class:Card', or a dynamic master tag class ID)"
  }),
  fieldId: NonEmptyString.annotations({
    description: "Custom field attribute ID (the _id from list_custom_fields)"
  }),
  value: Schema.String.annotations({
    description:
      "Value to set. Strings are passed as-is. For numbers, pass a numeric string (e.g. '42'). For booleans, pass 'true' or 'false'. For enums, pass the enum value string."
  })
}).annotations({
  title: "SetCustomFieldParams",
  description: "Parameters for setting a custom field value on a document"
})

export type SetCustomFieldParams = Schema.Schema.Type<typeof SetCustomFieldParamsSchema>

const CUSTOM_FIELD_PRIMITIVE_TYPE_NAMES = ["string", "number", "boolean", "date", "markup"] as const
export type PrimitiveCustomFieldTypeName = typeof CUSTOM_FIELD_PRIMITIVE_TYPE_NAMES[number]

const CUSTOM_FIELD_TYPE_NAMES = [
  ...CUSTOM_FIELD_PRIMITIVE_TYPE_NAMES,
  "enum",
  "array",
  "ref",
  "unknown"
] as const

export const CustomFieldTypeNameSchema = Schema.Literal(...CUSTOM_FIELD_TYPE_NAMES)

export type CustomFieldTypeName = typeof CUSTOM_FIELD_TYPE_NAMES[number]

export type EmptyCustomFieldTypeDetails = Readonly<Record<string, never>>

export interface EnumCustomFieldTypeDetails {
  readonly [key: string]: unknown
  readonly enumRef: unknown
}

export interface ArrayCustomFieldTypeDetails {
  readonly [key: string]: unknown
  readonly of: unknown
}

export interface RefCustomFieldTypeDetails {
  readonly [key: string]: unknown
  readonly to: unknown
}

export type UnknownCustomFieldTypeDetails = Readonly<Record<string, unknown>>

interface CustomFieldInfoBase {
  readonly id: CustomFieldId
  readonly name: string
  readonly label: string
  readonly ownerClassId: ObjectClassName
  readonly ownerLabel: string
}

export type CustomFieldInfo =
  | (CustomFieldInfoBase & {
    readonly type: PrimitiveCustomFieldTypeName
    readonly typeDetails: EmptyCustomFieldTypeDetails
  })
  | (CustomFieldInfoBase & {
    readonly type: "enum"
    readonly typeDetails: EnumCustomFieldTypeDetails
  })
  | (CustomFieldInfoBase & {
    readonly type: "array"
    readonly typeDetails: ArrayCustomFieldTypeDetails
  })
  | (CustomFieldInfoBase & {
    readonly type: "ref"
    readonly typeDetails: RefCustomFieldTypeDetails
  })
  | (CustomFieldInfoBase & {
    readonly type: "unknown"
    readonly typeDetails: UnknownCustomFieldTypeDetails
  })

export interface CustomFieldValue {
  readonly fieldId: CustomFieldId
  readonly label: string
  readonly value: unknown
  readonly type: CustomFieldTypeName
}

export interface SetCustomFieldResult {
  readonly objectId: NonEmptyString
  readonly fieldId: CustomFieldId
  readonly label: string
  readonly value: unknown
  readonly updated: boolean
}

const EmptyCustomFieldTypeDetailsSchema = Schema.Record({ key: Schema.String, value: Schema.Never })
const CustomFieldTypeDetailsRecordSchema = Schema.Record({ key: Schema.String, value: Schema.Unknown })
const EnumCustomFieldTypeDetailsSchema = CustomFieldTypeDetailsRecordSchema.pipe(
  Schema.filter((details): details is EnumCustomFieldTypeDetails => "enumRef" in details, {
    message: () => "enum custom field typeDetails must include enumRef"
  })
)
const ArrayCustomFieldTypeDetailsSchema = CustomFieldTypeDetailsRecordSchema.pipe(
  Schema.filter((details): details is ArrayCustomFieldTypeDetails => "of" in details, {
    message: () => "array custom field typeDetails must include of"
  })
)
const RefCustomFieldTypeDetailsSchema = CustomFieldTypeDetailsRecordSchema.pipe(
  Schema.filter((details): details is RefCustomFieldTypeDetails => "to" in details, {
    message: () => "ref custom field typeDetails must include to"
  })
)
const UnknownCustomFieldTypeDetailsSchema = CustomFieldTypeDetailsRecordSchema

const CustomFieldInfoBaseWireFields = {
  id: CustomFieldId,
  name: Schema.String,
  label: Schema.String,
  ownerClassId: ObjectClassName,
  ownerLabel: Schema.String
} as const

export const CustomFieldInfoWireSchema = Schema.Union(
  Schema.Struct({
    ...CustomFieldInfoBaseWireFields,
    type: Schema.Literal(...CUSTOM_FIELD_PRIMITIVE_TYPE_NAMES),
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
)

export const CustomFieldValueWireSchema = Schema.Struct({
  fieldId: CustomFieldId,
  label: Schema.String,
  value: Schema.Unknown,
  type: CustomFieldTypeNameSchema
})

export const SetCustomFieldResultWireSchema = Schema.Struct({
  objectId: NonEmptyString,
  fieldId: CustomFieldId,
  label: Schema.String,
  value: Schema.Unknown,
  updated: Schema.Boolean
})

export const ListCustomFieldsResultSchema = Schema.Array(CustomFieldInfoWireSchema)
export const GetCustomFieldValuesResultSchema = Schema.Array(CustomFieldValueWireSchema)

export const listCustomFieldsParamsJsonSchema = JSONSchema.make(ListCustomFieldsParamsSchema)
export const getCustomFieldValuesParamsJsonSchema = JSONSchema.make(GetCustomFieldValuesParamsSchema)
export const setCustomFieldParamsJsonSchema = JSONSchema.make(SetCustomFieldParamsSchema)

export const parseListCustomFieldsParams = Schema.decodeUnknown(ListCustomFieldsParamsSchema)
export const parseGetCustomFieldValuesParams = Schema.decodeUnknown(GetCustomFieldValuesParamsSchema)
export const parseSetCustomFieldParams = Schema.decodeUnknown(SetCustomFieldParamsSchema)
