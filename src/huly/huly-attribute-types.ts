import type { CustomFieldTypeName } from "../domain/schemas/custom-fields.js"
import type { HulyAttributeTypeKind } from "../domain/schemas/sdk-discovery.js"
import { core } from "./huly-plugins.js"

type HulyMappedAttributeTypeKind = Exclude<HulyAttributeTypeKind, "unknown">

export const HULY_ATTRIBUTE_TYPE_KIND_BY_CLASS = [
  [String(core.class.TypeString), "string"],
  [String(core.class.TypeIntlString), "string"],
  [String(core.class.TypeIdentifier), "string"],
  [String(core.class.TypeHyperlink), "string"],
  [String(core.class.TypeRank), "string"],
  [String(core.class.TypePersonId), "string"],
  [String(core.class.TypeAccountUuid), "string"],
  [String(core.class.TypeRelation), "string"],
  [String(core.class.TypeNumber), "number"],
  [String(core.class.TypeFileSize), "number"],
  [String(core.class.TypeBoolean), "boolean"],
  [String(core.class.TypeTimestamp), "date"],
  [String(core.class.TypeDate), "date"],
  [String(core.class.TypeMarkup), "markup"],
  [String(core.class.TypeCollaborativeDoc), "markup"],
  [String(core.class.RefTo), "ref"],
  [String(core.class.EnumOf), "enum"],
  [String(core.class.ArrOf), "array"],
  [String(core.class.Collection), "collection"]
] as const satisfies ReadonlyArray<readonly [string, HulyMappedAttributeTypeKind]>

export const HULY_ATTRIBUTE_TYPE_CLASSES_WITH_UNKNOWN_KIND = [
  String(core.class.Type),
  String(core.class.TypeAny),
  String(core.class.TypeBlob),
  String(core.class.TypeRecord),
  String(core.class.TypeRelatedDocument)
] as const

const attributeTypeKindByClass = new Map<string, HulyMappedAttributeTypeKind>(HULY_ATTRIBUTE_TYPE_KIND_BY_CLASS)

const customFieldTypeByAttributeTypeKind = {
  string: "string",
  number: "number",
  boolean: "boolean",
  date: "date",
  markup: "markup",
  ref: "ref",
  enum: "enum",
  array: "array",
  collection: "unknown",
  unknown: "unknown"
} as const satisfies Record<HulyAttributeTypeKind, CustomFieldTypeName>

export const hulyAttributeTypeKindFromClass = (classId: unknown): HulyAttributeTypeKind =>
  typeof classId === "string" ? attributeTypeKindByClass.get(classId) ?? "unknown" : "unknown"

export const hulyCustomFieldTypeNameFromClass = (classId: unknown): CustomFieldTypeName =>
  customFieldTypeByAttributeTypeKind[hulyAttributeTypeKindFromClass(classId)]
