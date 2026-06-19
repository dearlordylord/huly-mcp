import * as fc from "fast-check"
import { describe, expect, it } from "vitest"

import { NonEmptyString } from "../../src/domain/schemas/shared.js"
import {
  HULY_ATTRIBUTE_TYPE_CLASSES_WITH_UNKNOWN_KIND,
  HULY_ATTRIBUTE_TYPE_KIND_BY_CLASS,
  hulyAttributeTypeKindFromClass,
  hulyCustomFieldTypeNameFromClass
} from "../../src/huly/huly-attribute-types.js"
import { decodeHulyModelLabelTail, hulyModelLabelTail } from "../../src/huly/huly-labels.js"
import { assertAt } from "../../src/utils/assertions.js"
import { propertyTestParameters } from "../helpers/property.js"

const labelSegmentArbitrary = fc.stringMatching(/^[A-Za-z][A-Za-z0-9_-]{0,18}$/)
const knownAttributeClassIds = new Set([
  ...HULY_ATTRIBUTE_TYPE_KIND_BY_CLASS.map(([classId]) => classId),
  ...HULY_ATTRIBUTE_TYPE_CLASSES_WITH_UNKNOWN_KIND
])

const expectedCustomFieldTypeByKind = {
  string: "string",
  number: "number",
  boolean: "boolean",
  date: "date",
  markup: "markup",
  ref: "ref",
  enum: "enum",
  array: "array",
  collection: "unknown"
} as const

describe("Huly model label and attribute type properties", () => {
  it("hulyModelLabelTail returns the final colon-delimited segment", () => {
    fc.assert(
      fc.property(fc.array(labelSegmentArbitrary, { minLength: 1, maxLength: 5 }), (segments) => {
        const label = segments.join(":")

        expect(hulyModelLabelTail(label)).toBe(segments[segments.length - 1])
      }),
      propertyTestParameters
    )
  })

  it("decodeHulyModelLabelTail roundtrips generated labels to a non-empty tail", () => {
    fc.assert(
      fc.property(fc.array(labelSegmentArbitrary, { minLength: 1, maxLength: 5 }), (segments) => {
        const decoded = decodeHulyModelLabelTail(segments.join(":"))

        expect(decoded._tag).toBe("Right")
        if (decoded._tag === "Right") {
          expect(decoded.right).toBe(NonEmptyString.make(assertAt(segments, segments.length - 1)))
        }
      }),
      propertyTestParameters
    )
  })

  it("decodeHulyModelLabelTail rejects non-strings and labels with empty final tails", () => {
    fc.assert(
      fc.property(fc.oneof(fc.integer(), fc.boolean(), fc.array(fc.string({ maxLength: 10 }))), (value) => {
        expect(decodeHulyModelLabelTail(value)._tag).toBe("Left")
      }),
      propertyTestParameters
    )

    fc.assert(
      fc.property(fc.array(labelSegmentArbitrary, { minLength: 1, maxLength: 4 }), (segments) => {
        expect(decodeHulyModelLabelTail(`${segments.join(":")}:`)._tag).toBe("Left")
      }),
      propertyTestParameters
    )
  })

  it("attribute type class mappings agree with the exported mapping table", () => {
    fc.assert(
      fc.property(fc.constantFrom(...HULY_ATTRIBUTE_TYPE_KIND_BY_CLASS), ([classId, kind]) => {
        expect(hulyAttributeTypeKindFromClass(classId)).toBe(kind)
        expect(hulyCustomFieldTypeNameFromClass(classId)).toBe(expectedCustomFieldTypeByKind[kind])
      }),
      propertyTestParameters
    )
  })

  it("unknown and non-string attribute type classes map to unknown", () => {
    fc.assert(
      fc.property(fc.stringMatching(/^custom:class:[A-Za-z][A-Za-z0-9]{0,18}$/), (classId) => {
        if (!knownAttributeClassIds.has(classId)) {
          expect(hulyAttributeTypeKindFromClass(classId)).toBe("unknown")
          expect(hulyCustomFieldTypeNameFromClass(classId)).toBe("unknown")
        }
      }),
      propertyTestParameters
    )

    fc.assert(
      fc.property(
        fc.oneof(fc.integer(), fc.boolean(), fc.record({ classId: fc.string({ maxLength: 20 }) })),
        (value) => {
          expect(hulyAttributeTypeKindFromClass(value)).toBe("unknown")
          expect(hulyCustomFieldTypeNameFromClass(value)).toBe("unknown")
        }
      ),
      propertyTestParameters
    )
  })
})
