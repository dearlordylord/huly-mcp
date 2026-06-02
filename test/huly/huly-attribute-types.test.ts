import { describe, it } from "@effect/vitest"
import { expect } from "vitest"

import {
  HULY_ATTRIBUTE_TYPE_CLASSES_WITH_UNKNOWN_KIND,
  HULY_ATTRIBUTE_TYPE_KIND_BY_CLASS,
  hulyAttributeTypeKindFromClass,
  hulyCustomFieldTypeNameFromClass
} from "../../src/huly/huly-attribute-types.js"
import { core } from "../../src/huly/huly-plugins.js"

const expectedSdkMappings = [
  [String(core.class.TypeString), "core:class:TypeString", "string", "string"],
  [String(core.class.TypeIntlString), "core:class:TypeIntlString", "string", "string"],
  [String(core.class.TypeIdentifier), "core:class:TypeIdentifier", "string", "string"],
  [String(core.class.TypeHyperlink), "core:class:TypeHyperlink", "string", "string"],
  [String(core.class.TypeRank), "core:class:TypeRank", "string", "string"],
  [String(core.class.TypePersonId), "core:class:TypePersonId", "string", "string"],
  [String(core.class.TypeAccountUuid), "core:class:TypeAccountUuid", "string", "string"],
  [String(core.class.TypeRelation), "core:class:TypeRelation", "string", "string"],
  [String(core.class.TypeNumber), "core:class:TypeNumber", "number", "number"],
  [String(core.class.TypeFileSize), "core:class:TypeFileSize", "number", "number"],
  [String(core.class.TypeBoolean), "core:class:TypeBoolean", "boolean", "boolean"],
  [String(core.class.TypeTimestamp), "core:class:TypeTimestamp", "date", "date"],
  [String(core.class.TypeDate), "core:class:TypeDate", "date", "date"],
  [String(core.class.TypeMarkup), "core:class:TypeMarkup", "markup", "markup"],
  [String(core.class.TypeCollaborativeDoc), "core:class:TypeCollaborativeDoc", "markup", "markup"],
  [String(core.class.RefTo), "core:class:RefTo", "ref", "ref"],
  [String(core.class.EnumOf), "core:class:EnumOf", "enum", "enum"],
  [String(core.class.ArrOf), "core:class:ArrOf", "array", "array"],
  [String(core.class.Collection), "core:class:Collection", "collection", "unknown"]
] as const

const modelTypeClassNames = ["RefTo", "ArrOf", "EnumOf", "Collection"] as const
const modelTypeClassNameSet = new Set<string>(modelTypeClassNames)

const sdkTypeClassIds = Object.entries(core.class)
  .filter(([name]) => name.startsWith("Type") || modelTypeClassNameSet.has(name))
  .filter(([name]) => name !== "TypedSpace")
  .map(([, classId]) => String(classId))
  .sort()

describe("huly attribute type mapping", () => {
  it("forces every Huly SDK type descriptor class to be mapped or explicitly unknown", () => {
    const knownClassIds = [
      ...HULY_ATTRIBUTE_TYPE_KIND_BY_CLASS.map(([classId]) => classId),
      ...HULY_ATTRIBUTE_TYPE_CLASSES_WITH_UNKNOWN_KIND
    ].sort()

    expect(knownClassIds).toEqual(sdkTypeClassIds)
  })

  it("maps exact real Huly SDK type class constants", () => {
    const mappedClassIds = HULY_ATTRIBUTE_TYPE_KIND_BY_CLASS.map(([classId]) => classId)

    expect(new Set(mappedClassIds).size).toBe(mappedClassIds.length)
    expect(HULY_ATTRIBUTE_TYPE_KIND_BY_CLASS).toHaveLength(expectedSdkMappings.length)

    for (const [sdkClassId, canonicalClassId, discoveryKind, customFieldType] of expectedSdkMappings) {
      expect(sdkClassId).toBe(canonicalClassId)
      expect(mappedClassIds).toContain(sdkClassId)
      expect(hulyAttributeTypeKindFromClass(sdkClassId)).toBe(discoveryKind)
      expect(hulyCustomFieldTypeNameFromClass(sdkClassId)).toBe(customFieldType)
    }
  })

  it("does not infer type families from partial class-name strings", () => {
    expect(hulyAttributeTypeKindFromClass("custom:class:TypeStringish")).toBe("unknown")
    expect(hulyCustomFieldTypeNameFromClass("custom:class:EnumOfSomething")).toBe("unknown")
  })

  it("keeps intentionally unmapped Huly SDK type classes as unknown", () => {
    for (const classId of HULY_ATTRIBUTE_TYPE_CLASSES_WITH_UNKNOWN_KIND) {
      expect(hulyAttributeTypeKindFromClass(classId)).toBe("unknown")
    }
  })

  it("does not coerce non-string type class IDs", () => {
    expect(hulyAttributeTypeKindFromClass({ _class: core.class.TypeString })).toBe("unknown")
    expect(hulyCustomFieldTypeNameFromClass(123)).toBe("unknown")
  })
})
