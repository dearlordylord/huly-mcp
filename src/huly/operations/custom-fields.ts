import type { AnyAttribute, Class, Doc, Ref } from "@hcengineering/core"
import { ClassifierKind, SortingOrder } from "@hcengineering/core"
import { Effect } from "effect"

import type {
  CustomFieldInfo,
  CustomFieldTypeName,
  CustomFieldValue,
  GetCustomFieldValuesParams,
  ListCustomFieldsParams,
  SetCustomFieldParams,
  SetCustomFieldResult
} from "../../domain/schemas/custom-fields.js"
import { CustomFieldId, NonEmptyString, ObjectClassName } from "../../domain/schemas/shared.js"
import { HulyClient, type HulyClientError } from "../client.js"
import { CustomFieldNotFoundError, CustomFieldObjectNotFoundError } from "../errors-custom-fields.js"
import { core } from "../huly-plugins.js"
import { clampLimit } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"

type ListCustomFieldsError = HulyClientError
type GetCustomFieldValuesError = HulyClientError | CustomFieldObjectNotFoundError
type SetCustomFieldError = HulyClientError | CustomFieldNotFoundError | CustomFieldObjectNotFoundError

const DEFAULT_LIMIT = 200

type JsonMap = Record<string, unknown>

interface TypeDescriptor {
  readonly typeName: CustomFieldTypeName
  readonly typeDetails: Record<string, unknown>
}

interface DecodedCustomFieldAttribute {
  readonly id: CustomFieldId
  readonly name: string
  readonly label: string
  readonly ownerClassId: ObjectClassName
  readonly typeDescriptor: TypeDescriptor
}

interface DecodedClassInfo {
  readonly label: string
  readonly kind: number
}

interface DecodedCustomFieldDocument {
  readonly values: JsonMap
  readonly space: Doc["space"]
}

// Huly plugin constants are compatible with Ref<Class<Doc>> at runtime; the SDK types are narrower than usage here.
// eslint-disable-next-line no-restricted-syntax -- SDK boundary cast for class document queries
const classRef = core.class.Class as Ref<Class<Doc>>

const extractLabel = (label: unknown): string => {
  if (typeof label === "string") {
    const parts = label.split(":")
    return parts.length > 0 ? parts[parts.length - 1] : label
  }
  return String(label ?? "")
}

const decodeSdkRecord = (value: unknown): JsonMap => {
  // Huly SDK documents expose dynamic metadata fields not represented in the generated TS types.
  // This cast is contained here so feature logic does not operate on raw unknown values directly.
  // eslint-disable-next-line no-restricted-syntax -- SDK boundary cast contained in one adapter
  return value as JsonMap
}

const decodeTypeDescriptor = (value: unknown): TypeDescriptor => {
  const record = decodeSdkRecord(value)
  const _class = String(record._class ?? "")

  if (_class.includes("TypeString")) return { typeName: "string", typeDetails: {} }
  if (_class.includes("TypeNumber")) return { typeName: "number", typeDetails: {} }
  if (_class.includes("TypeBoolean")) return { typeName: "boolean", typeDetails: {} }
  if (_class.includes("EnumOf")) return { typeName: "enum", typeDetails: { enumRef: record.of } }
  if (_class.includes("ArrOf")) return { typeName: "array", typeDetails: { of: record.of } }
  if (_class.includes("RefTo")) return { typeName: "ref", typeDetails: { to: record.to } }
  if (_class.includes("TypeDate")) return { typeName: "date", typeDetails: {} }
  if (_class.includes("TypeMarkup")) return { typeName: "markup", typeDetails: {} }

  return { typeName: "unknown", typeDetails: record }
}

const decodeCustomFieldAttribute = (attr: AnyAttribute): DecodedCustomFieldAttribute => ({
  id: CustomFieldId.make(String(attr._id)),
  name: attr.name,
  label: extractLabel(attr.label),
  ownerClassId: ObjectClassName.make(String(attr.attributeOf)),
  typeDescriptor: decodeTypeDescriptor(attr.type)
})

const decodeClassInfo = (value: Doc): DecodedClassInfo => {
  const record = decodeSdkRecord(value)
  const kind = typeof record.kind === "number" ? record.kind : ClassifierKind.CLASS
  return {
    label: extractLabel(record.label),
    kind
  }
}

const decodeCustomFieldDocument = (doc: Doc): DecodedCustomFieldDocument => ({
  values: decodeSdkRecord(doc),
  space: doc.space
})

const resolveClassInfo = (
  client: HulyClient["Type"],
  classId: ObjectClassName
): Effect.Effect<DecodedClassInfo, HulyClientError> =>
  Effect.gen(function*() {
    const cls = yield* client.findOne<Doc>(
      classRef,
      { _id: toRef<Doc>(classId) }
    )
    return cls !== undefined
      ? decodeClassInfo(cls)
      : { label: classId, kind: ClassifierKind.CLASS }
  })

const batchResolveClassLabels = (
  client: HulyClient["Type"],
  classIds: ReadonlyArray<ObjectClassName>
): Effect.Effect<Map<ObjectClassName, string>, HulyClientError> =>
  Effect.gen(function*() {
    if (classIds.length === 0) return new Map()

    const classes = yield* client.findAll<Doc>(
      classRef,
      { _id: { $in: classIds.map(toRef<Doc>) } }
    )

    const labels = new Map<ObjectClassName, string>()
    for (const cls of classes) {
      const classId = ObjectClassName.make(String(cls._id))
      labels.set(classId, decodeClassInfo(cls).label)
    }
    for (const classId of classIds) {
      if (!labels.has(classId)) {
        labels.set(classId, classId)
      }
    }
    return labels
  })

const parseValueForType = (value: string, typeName: CustomFieldTypeName): unknown => {
  switch (typeName) {
    case "number": {
      const num = Number(value)
      return Number.isNaN(num) ? value : num
    }
    case "boolean":
      return value.toLowerCase() === "true"
    default:
      return value
  }
}

export const listCustomFields = (
  params: ListCustomFieldsParams
): Effect.Effect<Array<CustomFieldInfo>, ListCustomFieldsError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const limit = clampLimit(params.limit ?? DEFAULT_LIMIT)

    const query: Record<string, unknown> = { isCustom: true }
    if (params.targetClass !== undefined) {
      query.attributeOf = params.targetClass
    }

    const customAttrs = yield* client.findAll<AnyAttribute>(
      core.class.Attribute,
      query,
      { limit, sort: { modifiedOn: SortingOrder.Descending } }
    )

    const decodedAttrs = customAttrs.map(decodeCustomFieldAttribute)
    const ownerLabels = yield* batchResolveClassLabels(
      client,
      [...new Set(decodedAttrs.map((attr) => attr.ownerClassId))]
    )

    return decodedAttrs.map((attr) => ({
      id: attr.id,
      name: attr.name,
      label: attr.label,
      ownerClassId: attr.ownerClassId,
      ownerLabel: ownerLabels.get(attr.ownerClassId) ?? attr.ownerClassId,
      type: attr.typeDescriptor.typeName,
      typeDetails: attr.typeDescriptor.typeDetails
    }))
  })

export const getCustomFieldValues = (
  params: GetCustomFieldValuesParams
): Effect.Effect<Array<CustomFieldValue>, GetCustomFieldValuesError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const objectClassRef = toRef<Class<Doc>>(params.objectClass)
    const objectRef = toRef<Doc>(params.objectId)

    const [doc, customAttrs] = yield* Effect.all([
      client.findOne<Doc>(objectClassRef, { _id: objectRef }),
      client.findAll<AnyAttribute>(core.class.Attribute, { isCustom: true })
    ])

    if (doc === undefined) {
      return yield* new CustomFieldObjectNotFoundError({
        objectId: params.objectId,
        objectClass: params.objectClass
      })
    }

    const decodedDoc = decodeCustomFieldDocument(doc)
    const docKeys = new Set(Object.keys(decodedDoc.values))

    return customAttrs
      .map(decodeCustomFieldAttribute)
      .filter((attr) => docKeys.has(attr.name))
      .map((attr) => ({
        fieldId: attr.id,
        label: attr.label,
        value: decodedDoc.values[attr.name],
        type: attr.typeDescriptor.typeName
      }))
  })

export const setCustomField = (
  params: SetCustomFieldParams
): Effect.Effect<SetCustomFieldResult, SetCustomFieldError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const objectClassRef = toRef<Class<Doc>>(params.objectClass)
    const objectRef = toRef<Doc>(params.objectId)

    const [attr, doc] = yield* Effect.all([
      client.findOne<AnyAttribute>(
        core.class.Attribute,
        { _id: toRef<AnyAttribute>(params.fieldId), isCustom: true }
      ),
      client.findOne<Doc>(objectClassRef, { _id: objectRef })
    ])

    if (attr === undefined) {
      return yield* new CustomFieldNotFoundError({ identifier: params.fieldId })
    }

    if (doc === undefined) {
      return yield* new CustomFieldObjectNotFoundError({
        objectId: params.objectId,
        objectClass: params.objectClass
      })
    }

    const decodedAttr = decodeCustomFieldAttribute(attr)
    const parsedValue = parseValueForType(params.value, decodedAttr.typeDescriptor.typeName)
    const decodedDoc = decodeCustomFieldDocument(doc)
    const ownerInfo = yield* resolveClassInfo(client, decodedAttr.ownerClassId)

    if (ownerInfo.kind === ClassifierKind.MIXIN) {
      // Huly updateMixin expects the mixin class as Ref<Class<Doc>>. Brands are erased at runtime.
      // eslint-disable-next-line no-restricted-syntax -- SDK boundary cast for mixin class ref
      const mixinRef = toRef<Doc>(decodedAttr.ownerClassId) as Ref<Class<Doc>>
      yield* client.updateMixin(
        objectRef,
        objectClassRef,
        decodedDoc.space,
        mixinRef,
        {
          [decodedAttr.name]: parsedValue
        }
      )
    } else {
      yield* client.updateDoc(
        toRef<Class<Doc>>(decodedAttr.ownerClassId),
        decodedDoc.space,
        objectRef,
        { [decodedAttr.name]: parsedValue }
      )
    }

    return {
      objectId: NonEmptyString.make(params.objectId),
      fieldId: decodedAttr.id,
      label: decodedAttr.label,
      value: parsedValue,
      updated: true
    }
  })
