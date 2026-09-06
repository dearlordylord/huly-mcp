import type { AnyAttribute } from "@hcengineering/core"
import { Effect, Option, Result } from "effect"

import type {
  ArrayCustomFieldTypeDetails,
  EmptyCustomFieldTypeDetails,
  EnumCustomFieldTypeDetails,
  RefCustomFieldTypeDetails,
  UnknownCustomFieldTypeDetails
} from "../../domain/schemas/custom-fields.js"
import { CustomFieldMetadataMalformedError } from "../errors-custom-fields.js"
import { hulyCustomFieldTypeNameFromClass } from "../huly-attribute-types.js"
import { decodeHulyModelLabelTail } from "../huly-labels.js"
import {
  decodeArrOfMetadata,
  decodeCustomFieldAttributeMetadata,
  decodeEnumOfMetadata,
  decodeRefToMetadata,
  type CustomFieldAttributeMetadata,
  type CustomFieldTypeMetadata
} from "./custom-fields-metadata-schemas.js"

export type { CustomFieldAttributeMetadata } from "./custom-fields-metadata-schemas.js"

export type CustomFieldTypeDescriptor =
  | {
      readonly typeName: "string" | "number" | "boolean" | "date" | "markup"
      readonly typeDetails: EmptyCustomFieldTypeDetails
    }
  | { readonly typeName: "enum"; readonly typeDetails: EnumCustomFieldTypeDetails }
  | { readonly typeName: "array"; readonly typeDetails: ArrayCustomFieldTypeDetails }
  | { readonly typeName: "ref"; readonly typeDetails: RefCustomFieldTypeDetails }
  | { readonly typeName: "unknown"; readonly typeDetails: UnknownCustomFieldTypeDetails }

export const modelLabelOrDefault = (value: unknown, fallback: string): string =>
  Result.getOrElse(decodeHulyModelLabelTail(value), () => fallback)

export interface LabelProjection {
  readonly label: string
  readonly usedFallback: boolean
}

export const modelLabelProjection = (value: unknown, fallback: string): LabelProjection => {
  const decoded = decodeHulyModelLabelTail(value)
  return Result.isSuccess(decoded)
    ? { label: decoded.success, usedFallback: false }
    : { label: fallback, usedFallback: true }
}

type SimpleCustomFieldType = "boolean" | "date" | "markup" | "number" | "string"

const simpleCustomFieldType = (
  typeName: ReturnType<typeof hulyCustomFieldTypeNameFromClass>
): SimpleCustomFieldType | undefined => {
  switch (typeName) {
    case "string":
    case "number":
    case "boolean":
    case "date":
    case "markup":
      return typeName
    default:
      return undefined
  }
}

export const decodeTypeDescriptor = (record: CustomFieldTypeMetadata): CustomFieldTypeDescriptor => {
  const enumMetadata = decodeEnumOfMetadata(record)
  if (Option.isSome(enumMetadata)) {
    return { typeName: "enum", typeDetails: { ...enumMetadata.value, enumRef: enumMetadata.value.of } }
  }
  const arrayMetadata = decodeArrOfMetadata(record)
  if (Option.isSome(arrayMetadata)) {
    return { typeName: "array", typeDetails: { ...arrayMetadata.value, of: arrayMetadata.value.of } }
  }
  const refMetadata = decodeRefToMetadata(record)
  if (Option.isSome(refMetadata)) {
    return { typeName: "ref", typeDetails: { ...refMetadata.value, to: refMetadata.value.to } }
  }
  const typeName = hulyCustomFieldTypeNameFromClass(record._class)
  const simpleType = simpleCustomFieldType(typeName)
  return simpleType === undefined
    ? { typeName: "unknown", typeDetails: record }
    : { typeName: simpleType, typeDetails: {} }
}

export const decodeCustomFieldAttribute = Effect.fn("CustomFields.decodeAttribute")(function* (
  attr: AnyAttribute
): Effect.fn.Return<CustomFieldAttributeMetadata, CustomFieldMetadataMalformedError> {
  return yield* decodeCustomFieldAttributeMetadata(attr).pipe(
    Effect.mapError(
      () =>
        new CustomFieldMetadataMalformedError({
          identifier: String(attr._id),
          reason: "expected a custom attribute with non-empty id, name, owner, type class, and isCustom=true"
        })
    )
  )
})
