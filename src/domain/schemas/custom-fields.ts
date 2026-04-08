import { JSONSchema, Schema } from "effect"

import type { CustomFieldId, ObjectClassName } from "./shared.js"
import { LimitParam, NonEmptyString } from "./shared.js"

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

export type CustomFieldTypeName =
  | "string"
  | "number"
  | "boolean"
  | "enum"
  | "array"
  | "ref"
  | "date"
  | "markup"
  | "unknown"

export interface CustomFieldInfo {
  readonly id: CustomFieldId
  readonly name: string
  readonly label: string
  readonly ownerClassId: ObjectClassName
  readonly ownerLabel: string
  readonly type: CustomFieldTypeName
  readonly typeDetails: Record<string, unknown>
}

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

export const listCustomFieldsParamsJsonSchema = JSONSchema.make(ListCustomFieldsParamsSchema)
export const getCustomFieldValuesParamsJsonSchema = JSONSchema.make(GetCustomFieldValuesParamsSchema)
export const setCustomFieldParamsJsonSchema = JSONSchema.make(SetCustomFieldParamsSchema)

export const parseListCustomFieldsParams = Schema.decodeUnknown(ListCustomFieldsParamsSchema)
export const parseGetCustomFieldValuesParams = Schema.decodeUnknown(GetCustomFieldValuesParamsSchema)
export const parseSetCustomFieldParams = Schema.decodeUnknown(SetCustomFieldParamsSchema)
