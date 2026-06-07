import type { AnyAttribute, Class, Doc, Enum as HulyEnum, Interface, Obj, Ref } from "@hcengineering/core"
import { Either, Option, Schema } from "effect"

import type {
  HulyAttributeSummary,
  HulyAttributeType,
  HulyClassifierKind,
  HulyClassSummary,
  HulyEnumSummary
} from "../../domain/schemas/sdk-discovery.js"
import { HulyDiscoveryCount, HulyDomainName, HulySdkClassifierKindSchema } from "../../domain/schemas/sdk-discovery.js"
import { HulyAttributeId, HulyEnumId, NonEmptyString, ObjectClassName } from "../../domain/schemas/shared.js"
import { hulyAttributeTypeKindFromClass } from "../huly-attribute-types.js"
import { decodeHulyModelLabelTail } from "../huly-labels.js"
import { firstClassToolHints } from "./sdk-discovery-tool-hints.js"

export type DirectAncestorRef = Ref<Class<Obj>> | Ref<Interface<Doc>>

export interface MetadataClassDoc extends Doc {
  readonly label: unknown
  readonly kind: number
  readonly extends?: Ref<Class<Obj>> | Array<Ref<Interface<Doc>>>
  readonly implements?: ReadonlyArray<Ref<Interface<Doc>>>
  readonly domain?: string
  readonly shortLabel?: unknown
  readonly pluralLabel?: unknown
  readonly hidden?: boolean
  readonly readonly?: boolean
}

type JsonMap = Readonly<Record<string, unknown>>

const decodeSdkRecord = (value: unknown): JsonMap => {
  // Huly model docs carry dynamic fields not fully represented in generated TypeScript declarations.
  // eslint-disable-next-line no-restricted-syntax -- SDK boundary cast contained in one adapter
  return typeof value === "object" && value !== null ? value as JsonMap : { value }
}

const labelOrDefault = (value: unknown, fallback: NonEmptyString): NonEmptyString =>
  Either.getOrElse(decodeHulyModelLabelTail(value), () => fallback)

const nonEmptyLabelOption = (value: unknown): Option.Option<NonEmptyString> =>
  Either.getRight(decodeHulyModelLabelTail(value))

// Attribute names and enum values are verbatim identifiers/user data, NOT namespaced IntlString
// model labels, so they must not be run through the ":"-splitting label-tail decoder.
const decodeVerbatim = Schema.decodeUnknownEither(NonEmptyString)

const verbatimOrDefault = (value: unknown, fallback: NonEmptyString): NonEmptyString =>
  Either.getOrElse(decodeVerbatim(value), () => fallback)

const nonEmptyTrimmed = (value: unknown): Option.Option<string> => {
  if (typeof value !== "string") return Option.none()
  const normalized = value.trim()
  return normalized === "" ? Option.none() : Option.some(normalized)
}

const classNameOption = (value: unknown): Option.Option<ObjectClassName> =>
  Option.map(nonEmptyTrimmed(value), ObjectClassName.make)

const enumIdOption = (value: unknown): Option.Option<HulyEnumId> => Option.map(nonEmptyTrimmed(value), HulyEnumId.make)

const decodeSdkClassifierKind = (kind: unknown): HulyClassifierKind =>
  Either.getOrElse(Schema.decodeUnknownEither(HulySdkClassifierKindSchema)(kind), () => "unknown")

export const encodeClassifierKindFilter = (kind: HulyClassifierKind): Option.Option<number> =>
  kind === "unknown" ? Option.none() : Option.some(Schema.encodeSync(HulySdkClassifierKindSchema)(kind))

const stringOptionValues = (value: Option.Option<string>): ReadonlyArray<string> =>
  Option.isSome(value) ? [value.value] : []

export const classSearchText = (summary: HulyClassSummary): string =>
  [
    summary.classId,
    summary.label,
    summary.kind,
    ...summary.directAncestors,
    ...stringOptionValues(Option.fromNullable(summary.domain)),
    ...stringOptionValues(Option.fromNullable(summary.shortLabel)),
    ...stringOptionValues(Option.fromNullable(summary.pluralLabel))
  ].join(" ").toLowerCase()

export const directAncestorRefs = (cls: MetadataClassDoc): ReadonlyArray<DirectAncestorRef> => {
  const extended: ReadonlyArray<DirectAncestorRef> = cls.extends === undefined
    ? []
    : Array.isArray(cls.extends)
    ? cls.extends
    : [cls.extends]
  return [...extended, ...(cls.implements ?? [])].reduce<{
    readonly refs: ReadonlyArray<DirectAncestorRef>
    readonly seen: ReadonlySet<string>
  }>(
    (state, ref) => {
      const key = String(ref)
      return state.seen.has(key)
        ? state
        : {
          refs: [...state.refs, ref],
          seen: new Set([...state.seen, key])
        }
    },
    { refs: [], seen: new Set([String(cls._id)]) }
  ).refs
}

const directAncestorIds = (cls: MetadataClassDoc): ReadonlyArray<ObjectClassName> =>
  directAncestorRefs(cls).map((ancestor) => ObjectClassName.make(String(ancestor)))

const shortLabelField = (shortLabel: Option.Option<NonEmptyString>) =>
  Option.isSome(shortLabel) ? { shortLabel: shortLabel.value } : {}

const pluralLabelField = (pluralLabel: Option.Option<NonEmptyString>) =>
  Option.isSome(pluralLabel) ? { pluralLabel: pluralLabel.value } : {}

const typeClassIdField = (classId: Option.Option<ObjectClassName>) =>
  Option.isSome(classId) ? { classId: classId.value } : {}

export const toClassSummary = (
  cls: MetadataClassDoc,
  attributesCount?: number
): HulyClassSummary => {
  const record = decodeSdkRecord(cls)
  const classId = ObjectClassName.make(String(cls._id))
  const shortLabel = nonEmptyLabelOption(cls.shortLabel)
  const pluralLabel = nonEmptyLabelOption(cls.pluralLabel)
  return {
    classId,
    label: labelOrDefault(cls.label, NonEmptyString.make(String(cls._id))),
    kind: decodeSdkClassifierKind(cls.kind),
    directAncestors: directAncestorIds(cls),
    ...(cls.domain === undefined ? {} : { domain: HulyDomainName.make(String(cls.domain)) }),
    ...shortLabelField(shortLabel),
    ...pluralLabelField(pluralLabel),
    ...(typeof record.hidden === "boolean" ? { hidden: record.hidden } : {}),
    ...(typeof record.readonly === "boolean" ? { readonly: record.readonly } : {}),
    ...(attributesCount === undefined ? {} : { attributesCount: HulyDiscoveryCount.make(attributesCount) }),
    firstClassToolHints: (firstClassToolHints.get(String(cls._id)) ?? []).map((item) => ({
      category: item.category,
      exampleTools: [...item.exampleTools]
    }))
  }
}

const decodeAttributeType = (value: unknown): HulyAttributeType => {
  const record = decodeSdkRecord(value)
  const rawClass = String(record._class ?? "")
  const rawKind = hulyAttributeTypeKindFromClass(rawClass)
  const base = { ...typeClassIdField(classNameOption(rawClass)) }
  // `raw` is only emitted when the type family could not be determined, to keep modeled
  // attributes compact for the LLM consumer instead of carrying the full descriptor every time.
  const unknownType = { kind: "unknown" as const, ...base, raw: record }

  switch (rawKind) {
    case "ref": {
      const refTo = classNameOption(record.to)
      return Option.isSome(refTo) ? { kind: rawKind, ...base, refTo: refTo.value } : unknownType
    }
    case "enum": {
      const enumId = enumIdOption(record.of)
      return Option.isSome(enumId) ? { kind: rawKind, ...base, enumId: enumId.value } : unknownType
    }
    case "collection": {
      const collectionOf = classNameOption(record.of)
      return Option.isSome(collectionOf) ? { kind: rawKind, ...base, collectionOf: collectionOf.value } : unknownType
    }
    case "array":
      // Recurse so the element carries a structured kind (e.g. ref/enum/string) instead of a raw descriptor.
      return "of" in record ? { kind: rawKind, ...base, arrayOf: decodeAttributeType(record.of) } : unknownType
    default:
      return rawKind === "unknown" ? unknownType : { kind: rawKind, ...base }
  }
}

export const attributeSearchText = (attr: HulyAttributeSummary): string =>
  [
    attr.attributeId,
    attr.name,
    attr.label,
    attr.ownerClassId,
    attr.ownerClassLabel,
    attr.type.kind,
    ...stringOptionValues(Option.fromNullable(attr.type.classId)),
    ...("refTo" in attr.type ? [attr.type.refTo] : []),
    ...("enumId" in attr.type ? [attr.type.enumId] : []),
    ...("collectionOf" in attr.type ? [attr.type.collectionOf] : [])
  ].join(" ").toLowerCase()

export const toAttributeSummary = (
  attr: AnyAttribute,
  ownerLabel: NonEmptyString,
  requestedClass?: ObjectClassName
): HulyAttributeSummary => {
  const attributeId = HulyAttributeId.make(String(attr._id))
  const ownerClassId = ObjectClassName.make(String(attr.attributeOf))
  const record = decodeSdkRecord(attr)
  return {
    attributeId,
    name: verbatimOrDefault(attr.name, NonEmptyString.make(String(attr._id))),
    label: labelOrDefault(attr.label, verbatimOrDefault(attr.name, NonEmptyString.make(String(attr._id)))),
    ownerClassId,
    ownerClassLabel: ownerLabel,
    type: decodeAttributeType(attr.type),
    ...(attr.index === undefined ? {} : { index: attr.index }),
    ...(attr.isCustom === undefined ? {} : { isCustom: attr.isCustom }),
    ...("defaultValue" in record ? { defaultValue: record.defaultValue } : {}),
    ...(attr.automationOnly === undefined ? {} : { automationOnly: attr.automationOnly }),
    inherited: requestedClass !== undefined && ownerClassId !== requestedClass
  }
}

export const toEnumSummary = (doc: HulyEnum): HulyEnumSummary => ({
  enumId: HulyEnumId.make(String(doc._id)),
  name: verbatimOrDefault(doc.name, NonEmptyString.make(String(doc._id))),
  values: doc.enumValues.flatMap((value) => {
    const decoded = decodeVerbatim(value)
    return Either.isRight(decoded) ? [decoded.right] : []
  })
})

export const enumSearchText = (summary: HulyEnumSummary): string =>
  [summary.enumId, summary.name, ...summary.values].join(" ").toLowerCase()
