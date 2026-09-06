import type { AnyAttribute, Doc } from "@hcengineering/core"
import { ClassifierKind } from "@hcengineering/core"
import { Effect, Option, Schema } from "effect"

import type { CustomFieldInfo } from "../../domain/schemas/custom-fields.js"
import { type CustomFieldId, ObjectClassName } from "../../domain/schemas/shared.js"
import type { HulyClient, HulyClientError } from "../client.js"
import type { CustomFieldMetadataMalformedError } from "../errors-custom-fields.js"
import { core } from "../huly-plugins.js"
import { clampLimit, hulyQuery } from "./query-helpers.js"
import { toClassRef, toRef } from "./sdk-boundary.js"
import {
  decodeCustomFieldAttribute,
  decodeTypeDescriptor,
  modelLabelProjection,
  type CustomFieldAttributeMetadata,
  type CustomFieldTypeDescriptor
} from "./custom-fields-metadata-decode.js"

const SdkDynamicRecordSchema = Schema.Record(Schema.String, Schema.Unknown)
type SdkDynamicRecord = Schema.Schema.Type<typeof SdkDynamicRecordSchema>
const decodeSdkDynamicRecord = Schema.decodeUnknownOption(SdkDynamicRecordSchema)

export interface DecodedClassInfo {
  readonly label: string
  readonly kind: ClassifierKind
  readonly labelFallback: boolean
}

const ClassLabelMetadataSchema = Schema.Struct({ label: Schema.optionalKey(Schema.Json) })
const decodeClassLabelMetadata = Schema.decodeUnknownOption(ClassLabelMetadataSchema)
const ClassKindMetadataSchema = Schema.Struct({
  kind: Schema.optionalKey(Schema.Literals([ClassifierKind.CLASS, ClassifierKind.INTERFACE, ClassifierKind.MIXIN]))
})
const decodeClassKindMetadata = Schema.decodeUnknownOption(ClassKindMetadataSchema)

const classRef = toClassRef<Doc>(core.class.Class)

const decodeClassInfo = (value: Doc): DecodedClassInfo => {
  const labelRecord = Option.getOrElse(
    decodeClassLabelMetadata(value),
    (): Schema.Schema.Type<typeof ClassLabelMetadataSchema> => ({})
  )
  const kindRecord = Option.getOrElse(
    decodeClassKindMetadata(value),
    (): Schema.Schema.Type<typeof ClassKindMetadataSchema> => ({})
  )
  const kind = kindRecord.kind ?? ClassifierKind.CLASS
  const label = modelLabelProjection(labelRecord.label, String(value._id))
  return { label: label.label, kind, labelFallback: label.usedFallback }
}

export const resolveClassInfo = Effect.fn("CustomFields.resolveClassInfo")(function* (
  client: HulyClient["Service"],
  classId: ObjectClassName
): Effect.fn.Return<DecodedClassInfo, HulyClientError> {
  const cls = yield* client.findOne<Doc>(classRef, hulyQuery<Doc>({ _id: toRef<Doc>(classId) }))
  return cls !== undefined ? decodeClassInfo(cls) : { label: classId, kind: ClassifierKind.CLASS, labelFallback: true }
})

interface OwnerLabelProjection {
  readonly label: string
  readonly usedFallback: boolean
}

const batchResolveClassLabels = Effect.fn("CustomFields.batchResolveClassLabels")(function* (
  client: HulyClient["Service"],
  classIds: ReadonlyArray<ObjectClassName>
): Effect.fn.Return<Map<ObjectClassName, OwnerLabelProjection>, HulyClientError> {
  if (classIds.length === 0) return new Map()

  const classes = yield* client.findAll<Doc>(classRef, hulyQuery<Doc>({ _id: { $in: classIds.map(toRef<Doc>) } }))

  const labels = new Map<ObjectClassName, OwnerLabelProjection>()
  for (const cls of classes) {
    const classId = ObjectClassName.make(String(cls._id))
    const info = decodeClassInfo(cls)
    labels.set(classId, { label: info.label, usedFallback: info.labelFallback })
  }
  for (const classId of classIds) {
    if (!labels.has(classId)) {
      labels.set(classId, { label: classId, usedFallback: true })
    }
  }
  return labels
})

const labelForOwner = (
  labels: ReadonlyMap<ObjectClassName, OwnerLabelProjection>,
  ownerClassId: ObjectClassName
): OwnerLabelProjection => {
  const label = labels.get(ownerClassId)
  /* v8 ignore start -- every owner id is inserted by batchResolveClassLabels */
  if (label === undefined) return { label: ownerClassId, usedFallback: true }
  /* v8 ignore stop */
  return label
}

export type CustomFieldMetadataDegradationReason = "field_label_fallback" | "owner_label_fallback"

export interface CustomFieldInfoProjection {
  readonly info: CustomFieldInfo
  readonly degradationReasons: ReadonlyArray<CustomFieldMetadataDegradationReason>
}

type CustomFieldInfoBase = Omit<CustomFieldInfo, "type" | "typeDetails">
type SimpleCustomFieldTypeDescriptor = Extract<
  CustomFieldTypeDescriptor,
  { readonly typeName: "string" | "number" | "boolean" | "date" | "markup" }
>

const simpleCustomFieldInfo = (
  base: CustomFieldInfoBase,
  descriptor: SimpleCustomFieldTypeDescriptor
): CustomFieldInfo => {
  switch (descriptor.typeName) {
    case "string":
      return { ...base, type: "string", typeDetails: {} }
    case "number":
      return { ...base, type: "number", typeDetails: {} }
    case "boolean":
      return { ...base, type: "boolean", typeDetails: {} }
    case "date":
      return { ...base, type: "date", typeDetails: {} }
    case "markup":
      return { ...base, type: "markup", typeDetails: {} }
  }
}

const customFieldInfoFromDescriptor = (
  base: CustomFieldInfoBase,
  descriptor: CustomFieldTypeDescriptor
): CustomFieldInfo => {
  switch (descriptor.typeName) {
    case "enum":
      return { ...base, type: "enum", typeDetails: descriptor.typeDetails }
    case "array":
      return { ...base, type: "array", typeDetails: descriptor.typeDetails }
    case "ref":
      return { ...base, type: "ref", typeDetails: descriptor.typeDetails }
    case "unknown":
      return { ...base, type: "unknown", typeDetails: descriptor.typeDetails }
    default:
      return simpleCustomFieldInfo(base, descriptor)
  }
}

const toCustomFieldInfoProjection = (
  attr: CustomFieldAttributeMetadata,
  owner: OwnerLabelProjection
): CustomFieldInfoProjection => {
  const typeDescriptor = decodeTypeDescriptor(attr.type)
  const label = modelLabelProjection(attr.label, attr.name)
  const base = {
    id: attr._id,
    name: attr.name,
    label: label.label,
    ownerClassId: attr.attributeOf,
    ownerLabel: owner.label
  }
  const degradationReasons: Array<CustomFieldMetadataDegradationReason> = []
  if (label.usedFallback) degradationReasons.push("field_label_fallback")
  if (owner.usedFallback) degradationReasons.push("owner_label_fallback")

  const info = customFieldInfoFromDescriptor(base, typeDescriptor)
  return { info, degradationReasons }
}

const toCustomFieldInfosFromDecoded = Effect.fn("CustomFields.toInfosFromDecoded")(function* (
  client: HulyClient["Service"],
  decodedAttrs: ReadonlyArray<CustomFieldAttributeMetadata>
): Effect.fn.Return<Array<CustomFieldInfo>, HulyClientError> {
  const ownerLabels = yield* batchResolveClassLabels(client, [...new Set(decodedAttrs.map((attr) => attr.attributeOf))])
  return decodedAttrs.map(
    (attr) => toCustomFieldInfoProjection(attr, labelForOwner(ownerLabels, attr.attributeOf)).info
  )
})

const toCustomFieldInfoProjectionsFromDecoded = Effect.fn("CustomFields.toInfoProjectionsFromDecoded")(function* (
  client: HulyClient["Service"],
  decodedAttrs: ReadonlyArray<CustomFieldAttributeMetadata>
): Effect.fn.Return<Array<CustomFieldInfoProjection>, HulyClientError> {
  const ownerLabels = yield* batchResolveClassLabels(client, [...new Set(decodedAttrs.map((attr) => attr.attributeOf))])
  return decodedAttrs.map((attr) => toCustomFieldInfoProjection(attr, labelForOwner(ownerLabels, attr.attributeOf)))
})

export const toCustomFieldInfos = Effect.fn("CustomFields.toInfos")(function* (
  client: HulyClient["Service"],
  attrs: ReadonlyArray<AnyAttribute>
): Effect.fn.Return<Array<CustomFieldInfo>, HulyClientError | CustomFieldMetadataMalformedError> {
  const decodedAttrs = yield* Effect.forEach(attrs, decodeCustomFieldAttribute)
  return yield* toCustomFieldInfosFromDecoded(client, decodedAttrs)
})

export const toCustomFieldInfoProjections = Effect.fn("CustomFields.toInfoProjections")(function* (
  client: HulyClient["Service"],
  attrs: ReadonlyArray<AnyAttribute>
): Effect.fn.Return<Array<CustomFieldInfoProjection>, HulyClientError | CustomFieldMetadataMalformedError> {
  const decodedAttrs = yield* Effect.forEach(attrs, decodeCustomFieldAttribute)
  return yield* toCustomFieldInfoProjectionsFromDecoded(client, decodedAttrs)
})

export const listCustomFieldDefinitionProjectionsForOwners = Effect.fn(
  "CustomFields.listDefinitionProjectionsForOwners"
)(function* (
  client: HulyClient["Service"],
  ownerClassIds: ReadonlyArray<ObjectClassName>,
  limit?: number
): Effect.fn.Return<Array<CustomFieldInfoProjection>, HulyClientError | CustomFieldMetadataMalformedError> {
  const customAttrs = yield* client.findAll<AnyAttribute>(
    core.class.Attribute,
    hulyQuery<AnyAttribute>({ isCustom: true })
  )
  const owners = new Set(ownerClassIds)
  const decodedAttrs = yield* Effect.forEach(customAttrs, decodeCustomFieldAttribute)
  const matching = decodedAttrs.filter((attr) => owners.has(attr.attributeOf))
  const projections = yield* toCustomFieldInfoProjectionsFromDecoded(client, matching)
  return limit === undefined ? projections : projections.slice(0, clampLimit(limit))
})

export const getCustomFieldDefinitionProjection = Effect.fn("CustomFields.getDefinitionProjection")(function* (
  client: HulyClient["Service"],
  fieldId: CustomFieldId
): Effect.fn.Return<CustomFieldInfoProjection | undefined, HulyClientError | CustomFieldMetadataMalformedError> {
  const attr = yield* client.findOne<AnyAttribute>(
    core.class.Attribute,
    hulyQuery<AnyAttribute>({ _id: toRef<AnyAttribute>(fieldId), isCustom: true })
  )
  if (attr === undefined) return undefined
  const decoded = yield* decodeCustomFieldAttribute(attr)
  const [projection] = yield* toCustomFieldInfoProjectionsFromDecoded(client, [decoded])
  /* v8 ignore start -- one decoded attribute always yields one mapped projection */
  if (projection === undefined) return undefined
  /* v8 ignore stop */
  return projection
})

const isRecord = Schema.is(SdkDynamicRecordSchema)

export const readCustomFieldValue = (doc: Doc, ownerClassId: ObjectClassName, fieldName: string): unknown => {
  const values: SdkDynamicRecord = Option.getOrElse(decodeSdkDynamicRecord(doc), (): SdkDynamicRecord => ({}))
  const mixinValues = values[String(ownerClassId)]
  if (isRecord(mixinValues) && Object.hasOwn(mixinValues, fieldName)) return mixinValues[fieldName]
  if (Object.hasOwn(values, fieldName)) return values[fieldName]
  return undefined
}
