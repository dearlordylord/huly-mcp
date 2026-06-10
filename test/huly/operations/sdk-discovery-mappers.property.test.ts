import type { AnyAttribute, Enum as HulyEnum } from "@hcengineering/core"
import { ClassifierKind } from "@hcengineering/core"
import { Option, Schema } from "effect"
import * as fc from "fast-check"
import { describe, expect, it } from "vitest"

import {
  HulyAttributeSummarySchema,
  HulyClassifierKindSchema,
  HulyClassSummarySchema,
  HulyEnumSummarySchema,
  HulySdkClassifierKindSchema
} from "../../../src/domain/schemas/sdk-discovery.js"
import { HulyAttributeId, HulyEnumId, NonEmptyString, ObjectClassName } from "../../../src/domain/schemas/shared.js"
import { core } from "../../../src/huly/huly-plugins.js"
import type { DirectAncestorRef, MetadataClassDoc } from "../../../src/huly/operations/sdk-discovery-mappers.js"
import {
  attributeSearchText,
  classSearchText,
  directAncestorRefs,
  encodeClassifierKindFilter,
  enumSearchText,
  toAttributeSummary,
  toClassSummary,
  toEnumSummary
} from "../../../src/huly/operations/sdk-discovery-mappers.js"
import { assertDecodeFailure, assertDecodeSuccess, propertyTestParameters } from "../../helpers/property.js"

const labelSegmentArbitrary = fc.stringMatching(/^[A-Za-z][A-Za-z0-9_-]{0,18}$/)
const refTailArbitrary = fc.stringMatching(/^[A-Za-z][A-Za-z0-9_-]{0,20}$/)
const classRefStringArbitrary = refTailArbitrary.map((tail) => `test:class:${tail}`)
const interfaceRefStringArbitrary = refTailArbitrary.map((tail) => `test:interface:${tail}`)
const hulyRefStringArbitrary = fc.oneof(classRefStringArbitrary, interfaceRefStringArbitrary)
const domainArbitrary = fc.stringMatching(/^[a-z][a-z0-9_-]{0,16}$/)
const attributeNameArbitrary = fc.stringMatching(/^[A-Za-z][A-Za-z0-9_ -]{0,20}$/)
const enumValueArbitrary = fc.stringMatching(/^[A-Za-z][A-Za-z0-9_ -]{0,20}$/)
const invalidNonEmptyStringArbitrary = fc.oneof(
  fc.constant(""),
  fc.constant("   "),
  fc.integer(),
  fc.boolean(),
  fc.record({ label: fc.string({ maxLength: 10 }) })
)

const sdkClassifierKinds = [
  [ClassifierKind.CLASS, "class"],
  [ClassifierKind.INTERFACE, "interface"],
  [ClassifierKind.MIXIN, "mixin"]
] as const

const nonSelfRefArbitrary = (classId: string): fc.Arbitrary<string> =>
  hulyRefStringArbitrary.filter((ref) => ref !== classId)

const toDirectAncestorRef = (value: string): DirectAncestorRef => {
  // SDK boundary fixture: generated ref strings are intentionally shaped like Huly model refs.
  return value as DirectAncestorRef
}

const makeClassDoc = (overrides: Readonly<Record<string, unknown>> & { readonly _id: string }): MetadataClassDoc => {
  const { _id, ...rest } = overrides
  const value: unknown = {
    _class: core.class.Class,
    space: "space",
    modifiedBy: "person",
    modifiedOn: 0,
    label: `${_id}`,
    kind: ClassifierKind.CLASS,
    _id,
    ...rest
  }
  // SDK boundary fixture: generated model docs only need the fields read by sdk-discovery-mappers.
  return value as MetadataClassDoc
}

const makeAttribute = (
  overrides: Readonly<Record<string, unknown>> & { readonly _id: string; readonly attributeOf: string }
): AnyAttribute => {
  const { _id, attributeOf, ...rest } = overrides
  const value: unknown = {
    _class: core.class.Attribute,
    space: "space",
    modifiedBy: "person",
    modifiedOn: 0,
    name: "field",
    label: "test:field:Field",
    type: { _class: core.class.TypeString },
    _id,
    attributeOf,
    ...rest
  }
  // SDK boundary fixture: generated attributes contain the dynamic SDK fields consumed by the mapper.
  return value as AnyAttribute
}

const makeEnum = (
  overrides: Readonly<Record<string, unknown>> & { readonly _id: string; readonly enumValues: ReadonlyArray<unknown> }
): HulyEnum => {
  const { _id, ...rest } = overrides
  const value: unknown = {
    _class: core.class.Enum,
    space: "space",
    modifiedBy: "person",
    modifiedOn: 0,
    name: "Enum",
    _id,
    ...rest
  }
  // SDK boundary fixture: generated enum docs contain the SDK shape consumed by toEnumSummary.
  return value as HulyEnum
}

const expectedUniqueDirectAncestors = (
  classId: string,
  extended: ReadonlyArray<string>,
  implemented: ReadonlyArray<string>
): ReadonlyArray<string> => {
  const seen = new Set([classId])
  const unique: Array<string> = []
  for (const ref of [...extended, ...implemented]) {
    if (!seen.has(ref)) {
      unique.push(ref)
      seen.add(ref)
    }
  }
  return unique
}

const expectSearchTextContains = (text: string, values: ReadonlyArray<string>): void => {
  expect(text).toBe(text.toLowerCase())
  expect(text).not.toContain("[object object]")
  for (const value of values) {
    expect(text).toContain(value.toLowerCase())
  }
}

const validAttributeTypeArbitrary = fc.oneof(
  fc.record({
    kind: fc.constant("string" as const),
    classId: fc.option(classRefStringArbitrary.map(ObjectClassName.make), { nil: undefined })
  }),
  fc.record({
    kind: fc.constant("ref" as const),
    classId: fc.option(classRefStringArbitrary.map(ObjectClassName.make), { nil: undefined }),
    refTo: classRefStringArbitrary.map(ObjectClassName.make)
  }),
  fc.record({
    kind: fc.constant("enum" as const),
    classId: fc.option(classRefStringArbitrary.map(ObjectClassName.make), { nil: undefined }),
    enumId: refTailArbitrary.map((tail) => HulyEnumId.make(`test:enum:${tail}`))
  }),
  fc.record({
    kind: fc.constant("collection" as const),
    classId: fc.option(classRefStringArbitrary.map(ObjectClassName.make), { nil: undefined }),
    collectionOf: classRefStringArbitrary.map(ObjectClassName.make)
  }),
  fc.record({
    kind: fc.constant("unknown" as const),
    classId: fc.option(classRefStringArbitrary.map(ObjectClassName.make), { nil: undefined }),
    raw: fc.record({ descriptor: fc.string({ maxLength: 20 }) })
  })
)

describe("SDK discovery mapper properties", () => {
  it("directAncestorRefs preserves extends-before-implements order while dropping duplicates and self references", () => {
    const directAncestorFixtureArbitrary = hulyRefStringArbitrary.chain((classId) =>
      fc.boolean().chain((singleExtends) =>
        fc.record({
          classId: fc.constant(classId),
          extendedInput: fc.array(hulyRefStringArbitrary, { maxLength: 12 }),
          implementedInput: fc.array(hulyRefStringArbitrary, { maxLength: 12 }),
          scalarExtends: singleExtends ? nonSelfRefArbitrary(classId) : fc.constant(undefined),
          singleExtends: fc.constant(singleExtends)
        })
      )
    )

    fc.assert(
      fc.property(
        directAncestorFixtureArbitrary,
        ({ classId, extendedInput, implementedInput, scalarExtends, singleExtends }) => {
          const extended = [classId, scalarExtends, ...extendedInput].flatMap((ref) => ref === undefined ? [] : [ref])
            .map(toDirectAncestorRef)
          const implemented = [classId, ...implementedInput].map(toDirectAncestorRef)
          const doc = makeClassDoc({
            _id: classId,
            extends: singleExtends ? toDirectAncestorRef(scalarExtends ?? classId) : extended,
            implements: implemented
          })

          expect(directAncestorRefs(doc).map(String)).toEqual(
            expectedUniqueDirectAncestors(
              classId,
              singleExtends ? [String(scalarExtends ?? classId)] : extended.map(String),
              implemented.map(String)
            )
          )
        }
      ),
      propertyTestParameters
    )
  })

  it("toClassSummary normalizes labels, classifier kind, direct ancestors, and optional source fields", () => {
    fc.assert(
      fc.property(
        classRefStringArbitrary,
        fc.array(labelSegmentArbitrary, { minLength: 1, maxLength: 4 }),
        fc.constantFrom(...sdkClassifierKinds),
        fc.array(hulyRefStringArbitrary, { maxLength: 8 }),
        domainArbitrary,
        fc.boolean(),
        fc.boolean(),
        fc.integer({ min: 0, max: 200 }),
        (classId, labelSegments, [sdkKind, kind], ancestors, domain, hidden, readonly, attributesCount) => {
          const doc = makeClassDoc({
            _id: classId,
            label: labelSegments.join(":"),
            kind: sdkKind,
            extends: ancestors.map(toDirectAncestorRef),
            domain,
            hidden,
            readonly
          })
          const summary = toClassSummary(doc, attributesCount)

          assertDecodeSuccess(HulyClassSummarySchema, summary)
          expect(summary).toMatchObject({
            classId: ObjectClassName.make(classId),
            label: labelSegments[labelSegments.length - 1],
            kind,
            directAncestors: expectedUniqueDirectAncestors(classId, ancestors, []),
            domain,
            hidden,
            readonly,
            attributesCount
          })
        }
      ),
      propertyTestParameters
    )
  })

  it("toClassSummary falls back to class IDs and omits undecodable optional labels", () => {
    fc.assert(
      fc.property(
        classRefStringArbitrary,
        invalidNonEmptyStringArbitrary,
        invalidNonEmptyStringArbitrary,
        invalidNonEmptyStringArbitrary,
        fc.integer({ min: 10_000, max: 20_000 }),
        (classId, label, shortLabel, pluralLabel, unknownKind) => {
          const summary = toClassSummary(makeClassDoc({
            _id: classId,
            label,
            shortLabel,
            pluralLabel,
            kind: unknownKind
          }))

          assertDecodeSuccess(HulyClassSummarySchema, summary)
          expect(summary.label).toBe(classId)
          expect(summary.kind).toBe("unknown")
          expect(summary).not.toHaveProperty("shortLabel")
          expect(summary).not.toHaveProperty("pluralLabel")
        }
      ),
      propertyTestParameters
    )
  })

  it("classSearchText indexes searchable class fields without leaking object stringification", () => {
    fc.assert(
      fc.property(
        classRefStringArbitrary,
        labelSegmentArbitrary,
        fc.constantFrom("class", "interface", "mixin", "unknown" as const),
        fc.uniqueArray(hulyRefStringArbitrary, { maxLength: 6 }),
        domainArbitrary,
        labelSegmentArbitrary,
        labelSegmentArbitrary,
        labelSegmentArbitrary,
        labelSegmentArbitrary,
        (classId, label, kind, directAncestors, domain, shortLabel, pluralLabel, hintCategory, hintTool) => {
          const summary = assertDecodeSuccess(HulyClassSummarySchema, {
            classId,
            label,
            kind,
            directAncestors,
            domain,
            shortLabel,
            pluralLabel,
            firstClassToolHints: [{
              category: hintCategory,
              exampleTools: [hintTool]
            }],
            routingHints: []
          })

          expectSearchTextContains(classSearchText(summary), [
            classId,
            label,
            kind,
            ...directAncestors,
            domain,
            shortLabel,
            pluralLabel
          ])
        }
      ),
      propertyTestParameters
    )
  })

  it("toAttributeSummary preserves source fields and normalizes searchable type descriptors", () => {
    fc.assert(
      fc.property(
        refTailArbitrary,
        classRefStringArbitrary,
        attributeNameArbitrary,
        fc.oneof(
          fc.constant({ _class: core.class.TypeString }),
          classRefStringArbitrary.map((refTo) => ({ _class: core.class.RefTo, to: refTo })),
          refTailArbitrary.map((tail) => ({ _class: core.class.EnumOf, of: `test:enum:${tail}` })),
          classRefStringArbitrary.map((collectionOf) => ({ _class: core.class.Collection, of: collectionOf })),
          fc.constant({ _class: core.class.ArrOf, of: { _class: core.class.TypeString } }),
          fc.record({ _class: fc.constant("custom:class:UnknownType"), detail: fc.string({ maxLength: 12 }) })
        ),
        fc.boolean(),
        (tail, ownerClassId, name, type, customOnly) => {
          const attr = makeAttribute({
            _id: `attr:${tail}`,
            attributeOf: ownerClassId,
            name,
            label: `test:field:${name}`,
            type,
            isCustom: customOnly
          })
          const summary = toAttributeSummary(
            attr,
            NonEmptyString.make("Owner"),
            ObjectClassName.make(`${ownerClassId}:Requested`)
          )

          assertDecodeSuccess(HulyAttributeSummarySchema, summary)
          expect(summary).toMatchObject({
            attributeId: HulyAttributeId.make(`attr:${tail}`),
            name: name.trim(),
            label: name.trim(),
            ownerClassId,
            ownerClassLabel: "Owner",
            isCustom: customOnly,
            inherited: true
          })
          expect(attributeSearchText(summary)).not.toContain("[object object]")
        }
      ),
      propertyTestParameters
    )
  })

  it("attributeSearchText indexes direct searchable fields and type targets", () => {
    fc.assert(
      fc.property(
        refTailArbitrary,
        attributeNameArbitrary,
        labelSegmentArbitrary,
        classRefStringArbitrary,
        labelSegmentArbitrary,
        validAttributeTypeArbitrary,
        (tail, name, label, ownerClassId, ownerClassLabel, type) => {
          const summary = assertDecodeSuccess(HulyAttributeSummarySchema, {
            attributeId: `attr:${tail}`,
            name,
            label,
            ownerClassId,
            ownerClassLabel,
            type,
            inherited: false
          })
          const expectedTypeTargets = [
            type.classId,
            "refTo" in type ? type.refTo : undefined,
            "enumId" in type ? type.enumId : undefined,
            "collectionOf" in type ? type.collectionOf : undefined
          ].flatMap((value) => value === undefined ? [] : [String(value)])

          expectSearchTextContains(attributeSearchText(summary), [
            `attr:${tail}`,
            summary.name,
            summary.label,
            summary.ownerClassId,
            summary.ownerClassLabel,
            type.kind,
            ...expectedTypeTargets
          ])
        }
      ),
      propertyTestParameters
    )
  })

  it("toEnumSummary keeps valid option order and filters invalid option values", () => {
    fc.assert(
      fc.property(
        refTailArbitrary,
        attributeNameArbitrary,
        fc.array(fc.oneof(enumValueArbitrary, invalidNonEmptyStringArbitrary), { maxLength: 25 }),
        (tail, name, enumValues) => {
          const doc = makeEnum({
            _id: `test:enum:${tail}`,
            name,
            enumValues
          })
          const summary = toEnumSummary(doc)
          const expectedValues = enumValues.flatMap((value) =>
            typeof value === "string" && value.trim() !== "" ? [value.trim()] : []
          )

          assertDecodeSuccess(HulyEnumSummarySchema, summary)
          expect(summary).toEqual({
            enumId: HulyEnumId.make(`test:enum:${tail}`),
            name: name.trim(),
            values: expectedValues
          })
        }
      ),
      propertyTestParameters
    )
  })

  it("enumSearchText indexes enum IDs, names, and ordered values without object leaks", () => {
    fc.assert(
      fc.property(
        refTailArbitrary,
        attributeNameArbitrary,
        fc.array(enumValueArbitrary, { maxLength: 12 }),
        (tail, name, values) => {
          const summary = assertDecodeSuccess(HulyEnumSummarySchema, {
            enumId: `test:enum:${tail}`,
            name,
            values
          })

          expectSearchTextContains(enumSearchText(summary), [summary.enumId, summary.name, ...summary.values])
        }
      ),
      propertyTestParameters
    )
  })

  it("encodeClassifierKindFilter encodes recognized kinds, omits unknown, and relies on schema rejection for invalids", () => {
    fc.assert(
      fc.property(fc.constantFrom(...sdkClassifierKinds), ([sdkKind, kind]) => {
        const encoded = encodeClassifierKindFilter(kind)

        expect(Option.isSome(encoded)).toBe(true)
        if (Option.isSome(encoded)) {
          expect(encoded.value).toBe(sdkKind)
          expect(Schema.encodeSync(HulySdkClassifierKindSchema)(kind)).toBe(sdkKind)
        }
      }),
      propertyTestParameters
    )

    expect(Option.isNone(encodeClassifierKindFilter("unknown"))).toBe(true)

    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 30 })
          .filter((value) => !["class", "interface", "mixin", "unknown"].includes(value)),
        (invalidKind) => {
          assertDecodeFailure(HulyClassifierKindSchema, invalidKind)
        }
      ),
      propertyTestParameters
    )
  })
})

describe("SDK discovery mapper edge cases", () => {
  const owner = NonEmptyString.make("Owner")
  const summarize = (type: unknown): ReturnType<typeof toAttributeSummary> =>
    toAttributeSummary(makeAttribute({ _id: "attr:edge", attributeOf: "test:class:Owner", type }), owner)

  it("includes decoded short and plural labels when present", () => {
    const summary = toClassSummary(makeClassDoc({
      _id: "test:class:Foo",
      shortLabel: "core:label:Short",
      pluralLabel: "core:label:Plural"
    }))
    expect(summary).toMatchObject({ shortLabel: "Short", pluralLabel: "Plural" })
  })

  it("wraps a non-object type descriptor and maps it to unknown", () => {
    const summary = summarize("scalar")
    expect(summary.type.kind).toBe("unknown")
  })

  it("drops the classId when the type descriptor has no _class", () => {
    const summary = summarize({ foo: "bar" })
    expect(summary.type.kind).toBe("unknown")
    expect(summary.type).not.toHaveProperty("classId")
  })

  it("maps a ref/enum/collection with a blank target to unknown", () => {
    expect(summarize({ _class: core.class.RefTo, to: "" }).type.kind).toBe("unknown")
    expect(summarize({ _class: core.class.EnumOf, of: "   " }).type.kind).toBe("unknown")
    expect(summarize({ _class: core.class.Collection, of: "" }).type.kind).toBe("unknown")
  })

  it("maps an array descriptor without an element type to unknown", () => {
    expect(summarize({ _class: core.class.ArrOf }).type.kind).toBe("unknown")
  })

  it("preserves index, defaultValue, and automationOnly when present", () => {
    const summary = toAttributeSummary(
      makeAttribute({
        _id: "attr:opts",
        attributeOf: "test:class:Owner",
        index: 1,
        defaultValue: "preset",
        automationOnly: true
      }),
      owner
    )
    expect(summary).toMatchObject({ index: 1, defaultValue: "preset", automationOnly: true })
  })
})
