import { JSONSchema, Schema } from "effect"

import {
  CustomFieldId,
  DocId,
  enumValuesDescription,
  LimitParam,
  MAX_LIMIT,
  NonEmptyString,
  ObjectClassName
} from "./shared.js"

export const CUSTOM_FIELDS_DEFAULT_LIMIT = MAX_LIMIT

export const ListCustomFieldsParamsSchema = Schema.Struct({
  targetClass: Schema.optional(
    NonEmptyString.annotations({
      description:
        "Filter by owner class/mixin ID (e.g. 'tracker:mixin:IssueTypeData' or a dynamic class ID). Returns fields defined on that class only."
    })
  ),
  limit: Schema.optional(
    LimitParam.annotations({
      description: `Maximum number of fields to return (default: ${CUSTOM_FIELDS_DEFAULT_LIMIT})`
    })
  )
}).annotations({
  title: "ListCustomFieldsParams",
  description: "Parameters for listing custom field definitions"
})

export type ListCustomFieldsParams = Schema.Schema.Type<typeof ListCustomFieldsParamsSchema>

export const GetCustomFieldValuesParamsSchema = Schema.Struct({
  objectId: DocId.annotations({
    description: "Document ID to read custom field values from"
  }),
  objectClass: ObjectClassName.annotations({
    description:
      "Class of the document (e.g. 'tracker:class:Issue', 'card:class:Card', or a dynamic master tag class ID)"
  })
}).annotations({
  title: "GetCustomFieldValuesParams",
  description: "Parameters for reading custom field values from a document"
})

export type GetCustomFieldValuesParams = Schema.Schema.Type<typeof GetCustomFieldValuesParamsSchema>

export const SetCustomFieldParamsSchema = Schema.Struct({
  objectId: DocId.annotations({
    description: "Document ID to set the custom field value on"
  }),
  objectClass: ObjectClassName.annotations({
    description:
      "Class of the document (e.g. 'tracker:class:Issue', 'card:class:Card', or a dynamic master tag class ID)"
  }),
  fieldId: CustomFieldId.annotations({
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

export const CustomFieldTypeNameSchema = Schema.Literal(...CUSTOM_FIELD_TYPE_NAMES).annotations({
  description: `Custom field type: ${enumValuesDescription(CUSTOM_FIELD_TYPE_NAMES)}`
})

export type CustomFieldTypeName = typeof CUSTOM_FIELD_TYPE_NAMES[number]
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

export const EmptyCustomFieldTypeDetailsSchema = Schema.Record({ key: Schema.String, value: Schema.Never })
export type EmptyCustomFieldTypeDetails = Schema.Schema.Type<typeof EmptyCustomFieldTypeDetailsSchema>

const CustomFieldTypeDetailsRecordSchema = Schema.Record({ key: Schema.String, value: Schema.Unknown })

export const EnumCustomFieldTypeDetailsSchema = CustomFieldTypeDetailsRecordSchema.pipe(
  Schema.filter((details) =>
    Object.hasOwn(details, "enumRef") ? undefined : "enum custom field typeDetails must include enumRef"
  )
)
export type EnumCustomFieldTypeDetails = Schema.Schema.Type<typeof EnumCustomFieldTypeDetailsSchema>
export const ArrayCustomFieldTypeDetailsSchema = CustomFieldTypeDetailsRecordSchema.pipe(
  Schema.filter((details) =>
    Object.hasOwn(details, "of") ? undefined : "array custom field typeDetails must include of"
  )
)
export type ArrayCustomFieldTypeDetails = Schema.Schema.Type<typeof ArrayCustomFieldTypeDetailsSchema>
export const RefCustomFieldTypeDetailsSchema = CustomFieldTypeDetailsRecordSchema.pipe(
  Schema.filter((details) => Object.hasOwn(details, "to") ? undefined : "ref custom field typeDetails must include to")
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
export type CustomFieldInfo = Schema.Schema.Type<typeof CustomFieldInfoWireSchema>

export const CustomFieldValueWireSchema = Schema.Struct({
  fieldId: CustomFieldId,
  label: Schema.String,
  value: Schema.Unknown,
  type: CustomFieldTypeNameSchema
})

export const SetCustomFieldResultWireSchema = Schema.Struct({
  objectId: DocId,
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
