import { Schema } from "effect"

import { CustomFieldId, HulyEnumId, NonEmptyString, ObjectClassName } from "../../domain/schemas/shared.js"
import { core } from "../huly-plugins.js"

const CustomFieldTypeMetadataRecordSchema = Schema.Record(Schema.String, Schema.Json)
const PrimitiveCustomFieldTypeMetadataSchema = Schema.StructWithRest(Schema.Struct({ _class: ObjectClassName }), [
  CustomFieldTypeMetadataRecordSchema
])

export interface NestedCustomFieldTypeMetadata extends Readonly<Record<string, Schema.Json>> {
  readonly _class: ObjectClassName
  readonly enumRef?: HulyEnumId
  readonly of?: NonEmptyString | NestedCustomFieldTypeMetadata
  readonly to?: ObjectClassName
}

export interface NestedCustomFieldTypeMetadataEncoded {
  readonly _class: string
  readonly enumRef?: string
  readonly of?: string | NestedCustomFieldTypeMetadataEncoded
  readonly to?: string
}

const NestedCustomFieldTypeMetadataSchema: Schema.Codec<
  NestedCustomFieldTypeMetadata,
  NestedCustomFieldTypeMetadataEncoded
> = Schema.StructWithRest(
  Schema.Struct({
    _class: ObjectClassName,
    enumRef: Schema.optionalKey(HulyEnumId),
    of: Schema.optionalKey(
      Schema.Union([
        NonEmptyString,
        Schema.suspend(
          (): Schema.Codec<NestedCustomFieldTypeMetadata, NestedCustomFieldTypeMetadataEncoded> =>
            NestedCustomFieldTypeMetadataSchema
        )
      ])
    ),
    to: Schema.optionalKey(ObjectClassName)
  }),
  [CustomFieldTypeMetadataRecordSchema]
)

const exactObjectClassName = (className: string): Schema.Codec<ObjectClassName, string> =>
  ObjectClassName.check(
    Schema.makeFilter((actual) =>
      actual === className ? undefined : `expected custom field type class '${className}'`
    )
  )

const EnumOfMetadataSchema = Schema.StructWithRest(
  Schema.Struct({ _class: exactObjectClassName(String(core.class.EnumOf)), of: HulyEnumId }),
  [CustomFieldTypeMetadataRecordSchema]
)
const ArrOfMetadataSchema = Schema.StructWithRest(
  Schema.Struct({
    _class: exactObjectClassName(String(core.class.ArrOf)),
    of: Schema.Union([NonEmptyString, NestedCustomFieldTypeMetadataSchema])
  }),
  [CustomFieldTypeMetadataRecordSchema]
)
const RefToMetadataSchema = Schema.StructWithRest(
  Schema.Struct({ _class: exactObjectClassName(String(core.class.RefTo)), to: ObjectClassName }),
  [CustomFieldTypeMetadataRecordSchema]
)
const GenericCustomFieldTypeMetadataSchema = PrimitiveCustomFieldTypeMetadataSchema.check(
  Schema.makeFilter((type) =>
    type._class === String(core.class.EnumOf) ||
    type._class === String(core.class.ArrOf) ||
    type._class === String(core.class.RefTo)
      ? "special custom field type metadata must use its structured schema"
      : undefined
  )
)
const CustomFieldTypeMetadataSchema = Schema.Union([
  EnumOfMetadataSchema,
  ArrOfMetadataSchema,
  RefToMetadataSchema,
  GenericCustomFieldTypeMetadataSchema
])
export type CustomFieldTypeMetadata = Schema.Schema.Type<typeof CustomFieldTypeMetadataSchema>

const CustomFieldAttributeMetadataSchema = Schema.Struct({
  _id: CustomFieldId,
  attributeOf: ObjectClassName,
  isCustom: Schema.Literal(true),
  name: NonEmptyString,
  label: Schema.optionalKey(Schema.Json),
  type: CustomFieldTypeMetadataSchema
})
export type CustomFieldAttributeMetadata = Schema.Schema.Type<typeof CustomFieldAttributeMetadataSchema>

export const decodeCustomFieldAttributeMetadata = Schema.decodeUnknownEffect(CustomFieldAttributeMetadataSchema)
export const decodeEnumOfMetadata = Schema.decodeUnknownOption(EnumOfMetadataSchema)
export const decodeArrOfMetadata = Schema.decodeUnknownOption(ArrOfMetadataSchema)
export const decodeRefToMetadata = Schema.decodeUnknownOption(RefToMetadataSchema)
