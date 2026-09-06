import type { AnyAttribute, Doc } from "@hcengineering/core"
import { ClassifierKind, SortingOrder } from "@hcengineering/core"
import { Data, Effect } from "effect"

import type { CustomFieldDateTimestamp } from "../../domain/schemas/custom-field-date.js"
import type {
  CustomFieldInfo,
  CustomFieldTypeName,
  CustomFieldValue,
  GetCustomFieldValuesParams,
  ListCustomFieldsParams,
  SetCustomFieldParams,
  SetCustomFieldResult
} from "../../domain/schemas/custom-fields.js"
import { CUSTOM_FIELDS_DEFAULT_LIMIT } from "../../domain/schemas/custom-fields.js"
import { HulyClient, type HulyClientError } from "../client.js"
import {
  InvalidCustomFieldBooleanValueError,
  CustomFieldNotFoundError,
  CustomFieldObjectNotFoundError,
  CustomFieldMetadataMalformedError,
  InvalidCustomFieldNumberValueError
} from "../errors-custom-fields.js"
import type { InvalidCustomFieldDateValueError } from "../errors-custom-fields.js"
import { Diagnostics } from "../diagnostics.js"
import { core } from "../huly-plugins.js"
import { CustomFieldMetadataDegradedWarningCode } from "../../domain/schemas/tool-warnings.js"
import { parseCustomFieldDateValue } from "./custom-field-date.js"
import { clampLimit, hulyQuery } from "./query-helpers.js"
import {
  getCustomFieldDefinitionProjection,
  listCustomFieldDefinitionProjectionsForOwners,
  readCustomFieldValue,
  resolveClassInfo,
  toCustomFieldInfoProjections,
  toCustomFieldInfos,
  type CustomFieldInfoProjection,
  type CustomFieldMetadataDegradationReason
} from "./custom-fields-metadata.js"
import {
  decodeCustomFieldAttribute,
  decodeTypeDescriptor,
  modelLabelOrDefault,
  type CustomFieldTypeDescriptor
} from "./custom-fields-metadata-decode.js"
import { toClassRef, toRef } from "./sdk-boundary.js"

export {
  decodeCustomFieldAttribute,
  decodeTypeDescriptor,
  getCustomFieldDefinitionProjection,
  listCustomFieldDefinitionProjectionsForOwners,
  modelLabelOrDefault,
  readCustomFieldValue,
  resolveClassInfo,
  toCustomFieldInfoProjections,
  toCustomFieldInfos
}
export type { CustomFieldInfoProjection, CustomFieldMetadataDegradationReason, CustomFieldTypeDescriptor }

const warnCustomFieldMetadataDegraded = (
  diagnostics: Diagnostics["Service"],
  projections: ReadonlyArray<CustomFieldInfoProjection>
): Effect.Effect<void> => {
  const degraded = projections.filter((projection) => projection.degradationReasons.length > 0)
  if (degraded.length === 0) return Effect.void
  const details = degraded
    .map(({ degradationReasons, info }) => `${info.id} (${degradationReasons.join(", ")})`)
    .join(", ")
  return diagnostics.warnAgent({
    code: CustomFieldMetadataDegradedWarningCode,
    message:
      `Custom-field metadata fidelity was degraded for ${degraded.length} field(s): ${details}. ` +
      "Fallback labels or owners are included; inspect the Huly class and attribute metadata if exact names are required."
  })
}

type ListCustomFieldsError = HulyClientError | CustomFieldMetadataMalformedError
type GetCustomFieldValuesError = HulyClientError | CustomFieldObjectNotFoundError | CustomFieldMetadataMalformedError
type SetCustomFieldError =
  | HulyClientError
  | CustomFieldMetadataMalformedError
  | CustomFieldNotFoundError
  | CustomFieldObjectNotFoundError
  | InvalidCustomFieldDateValueError

type ScalarCustomFieldWriteValue = string | number | boolean
type ParsedCustomFieldValue = Data.TaggedEnum<{
  Scalar: { readonly value: ScalarCustomFieldWriteValue }
  Date: { readonly value: CustomFieldDateTimestamp }
}>
const ParsedCustomFieldValue = Data.taggedEnum<ParsedCustomFieldValue>()

const parseValueForType = Effect.fn("CustomFields.parseValueForType")(function* (
  value: string,
  typeName: CustomFieldTypeName
): Effect.fn.Return<ParsedCustomFieldValue, InvalidCustomFieldDateValueError> {
  switch (typeName) {
    case "number": {
      const numberValue = Number(value)
      return ParsedCustomFieldValue.Scalar({ value: Number.isNaN(numberValue) ? value : numberValue })
    }
    case "date":
      return ParsedCustomFieldValue.Date({ value: yield* parseCustomFieldDateValue(value) })
    case "boolean":
      return ParsedCustomFieldValue.Scalar({ value: value.toLowerCase() === "true" })
    default:
      return ParsedCustomFieldValue.Scalar({ value })
  }
})

export type StrictCustomFieldValue = string | number | boolean | CustomFieldDateTimestamp
type StrictCustomFieldValueError =
  | InvalidCustomFieldBooleanValueError
  | InvalidCustomFieldDateValueError
  | InvalidCustomFieldNumberValueError

const parseStrictNumber = Effect.fn("CustomFields.parseStrictNumber")(function* (
  value: string
): Effect.fn.Return<number, InvalidCustomFieldNumberValueError> {
  if (value.length === 0 || value.trim() !== value) {
    return yield* new InvalidCustomFieldNumberValueError({ value })
  }
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : yield* new InvalidCustomFieldNumberValueError({ value })
})

const parseStrictBoolean = Effect.fn("CustomFields.parseStrictBoolean")(function* (
  value: string
): Effect.fn.Return<boolean, InvalidCustomFieldBooleanValueError> {
  const normalized = value.toLowerCase()
  if (normalized === "true") return true
  if (normalized === "false") return false
  return yield* new InvalidCustomFieldBooleanValueError({ value })
})

const parseStrictCustomFieldValue = Effect.fn("CustomFields.parseValue")(function* (
  value: string,
  typeName: CustomFieldTypeName
): Effect.fn.Return<StrictCustomFieldValue, StrictCustomFieldValueError> {
  switch (typeName) {
    case "number":
      return yield* parseStrictNumber(value)
    case "date":
      return yield* parseCustomFieldDateValue(value)
    case "boolean":
      return yield* parseStrictBoolean(value)
    default:
      return value
  }
})

export function parseCustomFieldValue(
  value: string,
  typeName: "number"
): Effect.Effect<number, InvalidCustomFieldNumberValueError>
export function parseCustomFieldValue(
  value: string,
  typeName: "date"
): Effect.Effect<CustomFieldDateTimestamp, InvalidCustomFieldDateValueError>
export function parseCustomFieldValue(
  value: string,
  typeName: "boolean"
): Effect.Effect<boolean, InvalidCustomFieldBooleanValueError>
export function parseCustomFieldValue(
  value: string,
  typeName: "string" | "markup" | "enum"
): Effect.Effect<string, never>
export function parseCustomFieldValue(
  value: string,
  typeName: CustomFieldTypeName
): Effect.Effect<StrictCustomFieldValue, StrictCustomFieldValueError>
export function parseCustomFieldValue(
  value: string,
  typeName: CustomFieldTypeName
): Effect.Effect<StrictCustomFieldValue, StrictCustomFieldValueError> {
  return parseStrictCustomFieldValue(value, typeName)
}

export const listCustomFields = Effect.fn("CustomFields.list")(function* (
  params: ListCustomFieldsParams
): Effect.fn.Return<ReadonlyArray<CustomFieldInfo>, ListCustomFieldsError, HulyClient | Diagnostics> {
  const client = yield* HulyClient
  const diagnostics = yield* Diagnostics
  const limit = clampLimit(params.limit ?? CUSTOM_FIELDS_DEFAULT_LIMIT)
  const customAttrs = yield* client.findAll<AnyAttribute>(
    core.class.Attribute,
    hulyQuery<AnyAttribute>({
      isCustom: true,
      ...(params.targetClass === undefined ? {} : { attributeOf: toClassRef<Doc>(params.targetClass) })
    }),
    { limit, sort: { modifiedOn: SortingOrder.Descending } }
  )
  const projections = yield* toCustomFieldInfoProjections(client, customAttrs)
  yield* warnCustomFieldMetadataDegraded(diagnostics, projections)
  return projections.map((projection) => projection.info)
})

export const getCustomFieldValues = Effect.fn("CustomFields.getValues")(function* (
  params: GetCustomFieldValuesParams
): Effect.fn.Return<ReadonlyArray<CustomFieldValue>, GetCustomFieldValuesError, HulyClient | Diagnostics> {
  const client = yield* HulyClient
  const diagnostics = yield* Diagnostics
  const objectClassRef = toClassRef<Doc>(params.objectClass)
  const objectRef = toRef<Doc>(params.objectId)

  const [doc, customAttrs] = yield* Effect.all([
    client.findOne<Doc>(objectClassRef, hulyQuery<Doc>({ _id: objectRef })),
    client.findAll<AnyAttribute>(core.class.Attribute, hulyQuery<AnyAttribute>({ isCustom: true }))
  ])

  if (doc === undefined) {
    return yield* new CustomFieldObjectNotFoundError({ objectId: params.objectId, objectClass: params.objectClass })
  }

  const projections = yield* toCustomFieldInfoProjections(client, customAttrs)
  yield* warnCustomFieldMetadataDegraded(diagnostics, projections)
  const values: Array<CustomFieldValue> = []
  for (const { info } of projections) {
    const value = readCustomFieldValue(doc, info.ownerClassId, info.name)
    if (value === undefined) continue
    values.push({ fieldId: info.id, label: info.label, value, type: info.type })
  }
  return values
})

export const setCustomField = Effect.fn("CustomFields.set")(function* (
  params: SetCustomFieldParams
): Effect.fn.Return<SetCustomFieldResult, SetCustomFieldError, HulyClient | Diagnostics> {
  const client = yield* HulyClient
  const diagnostics = yield* Diagnostics
  const objectClassRef = toClassRef<Doc>(params.objectClass)
  const objectRef = toRef<Doc>(params.objectId)

  const [attr, doc] = yield* Effect.all([
    client.findOne<AnyAttribute>(
      core.class.Attribute,
      hulyQuery<AnyAttribute>({ _id: toRef<AnyAttribute>(params.fieldId), isCustom: true })
    ),
    client.findOne<Doc>(objectClassRef, hulyQuery<Doc>({ _id: objectRef }))
  ])

  if (attr === undefined) {
    return yield* new CustomFieldNotFoundError({ identifier: params.fieldId })
  }

  if (doc === undefined) {
    return yield* new CustomFieldObjectNotFoundError({ objectId: params.objectId, objectClass: params.objectClass })
  }

  const projections = yield* toCustomFieldInfoProjections(client, [attr])
  const projection = projections[0]
  /* v8 ignore start -- one decoded attribute always yields one mapped projection */
  if (projection === undefined) {
    return yield* new CustomFieldMetadataMalformedError({
      identifier: params.fieldId,
      reason: "custom field metadata did not produce a definition"
    })
  }
  /* v8 ignore stop */
  yield* warnCustomFieldMetadataDegraded(diagnostics, [projection])
  const field = projection.info
  const parsedValue = yield* parseValueForType(params.value, field.type)
  const writeValue = ParsedCustomFieldValue.$match(parsedValue, {
    Scalar: ({ value }) => value,
    Date: ({ value }) => value
  })
  const ownerInfo = yield* resolveClassInfo(client, field.ownerClassId)

  if (ownerInfo.kind === ClassifierKind.MIXIN) {
    const mixinRef = toClassRef<Doc>(field.ownerClassId)
    yield* client.updateMixin(objectRef, objectClassRef, doc.space, mixinRef, { [field.name]: writeValue })
  } else {
    yield* client.updateDoc(toClassRef<Doc>(field.ownerClassId), doc.space, objectRef, { [field.name]: writeValue })
  }

  return { objectId: params.objectId, fieldId: field.id, label: field.label, value: writeValue, updated: true }
})
