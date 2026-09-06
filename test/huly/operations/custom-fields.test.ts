import { describe, it } from "@effect/vitest"
import type { AnyAttribute, Class, Doc, DocumentQuery, FindOptions, Ref } from "@hcengineering/core"
import { ClassifierKind } from "@hcengineering/core"
import { Effect, Layer, Schema } from "effect"
import { expect } from "vitest"

import { ListCustomFieldsResultSchema } from "../../../src/domain/schemas/custom-fields.js"
import { NonEmptyString } from "../../../src/domain/schemas/shared.js"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import { Diagnostics } from "../../../src/huly/diagnostics.js"
import { core } from "../../../src/huly/huly-plugins.js"
import {
  getCustomFieldValues,
  listCustomFields,
  parseCustomFieldValue,
  readCustomFieldValue,
  setCustomField
} from "../../../src/huly/operations/custom-fields.js"
import { customFieldId, docId, objectClassName } from "../../helpers/brands.js"
import { CustomFieldMetadataDegradedWarningCode, type ToolWarning } from "../../../src/domain/schemas/tool-warnings.js"
import {
  customFieldAttribute,
  customFieldDocument,
  type CustomFieldAttributeFixture,
  type CustomFieldDocumentFixture,
  documentForTestClass,
  findResultForTestClass
} from "../../helpers/huly-sdk.js"

const makeAttribute = (overrides: Partial<CustomFieldAttributeFixture> = {}): AnyAttribute =>
  customFieldAttribute({
    _id: "attr-1",
    _class: core.class.Attribute,
    space: "space-1",
    name: "storyPoints",
    label: "tracker:field:Story Points",
    attributeOf: "tracker:mixin:IssueTypeData",
    type: { _class: "core:class:TypeNumber" },
    isCustom: true,
    modifiedBy: "user-1",
    modifiedOn: 0,
    createdBy: "user-1",
    createdOn: 0,
    ...overrides
  })

const makeDoc = (overrides: Partial<CustomFieldDocumentFixture> = {}): Doc =>
  customFieldDocument({
    _id: "doc-1",
    _class: "tracker:class:Issue",
    space: "space-1",
    modifiedBy: "user-1",
    modifiedOn: 0,
    createdBy: "user-1",
    createdOn: 0,
    ...overrides
  })

interface MockConfig {
  readonly attributes?: ReadonlyArray<AnyAttribute>
  readonly doc?: Doc | undefined
  readonly classDocs?: ReadonlyArray<Doc>
  readonly captureUpdateDoc?: { operations?: unknown }
  readonly captureUpdateMixin?: { mixin?: string; attributes?: unknown }
  readonly warnings?: Array<ToolWarning>
}

const createTestLayer = (config: MockConfig) => {
  const attributes = config.attributes ?? []
  const classDocs = config.classDocs ?? []

  const findAllImpl: HulyClientOperations["findAll"] = <T extends Doc>(
    _class: Ref<Class<T>>,
    _query: DocumentQuery<T>,
    _options?: FindOptions<T>
  ) => {
    if (_class === core.class.Attribute) {
      return Effect.succeed(findResultForTestClass<T>(attributes))
    }
    if (_class === core.class.Class) {
      return Effect.succeed(findResultForTestClass<T>(classDocs))
    }
    return Effect.succeed(findResultForTestClass<T>([]))
  }

  const findOneImpl: HulyClientOperations["findOne"] = <T extends Doc>(
    _class: Ref<Class<T>>,
    query: DocumentQuery<T>,
    _options?: FindOptions<T>
  ) => {
    if (_class === core.class.Attribute) {
      const queryId = query["_id"]
      const id = typeof queryId === "string" ? queryId : undefined
      return Effect.succeed(findResultForTestClass<T>(attributes.filter((attr) => String(attr._id) === id))[0])
    }
    if (_class === core.class.Class) {
      const queryId = query["_id"]
      const id = typeof queryId === "string" ? queryId : undefined
      return Effect.succeed(findResultForTestClass<T>(classDocs.filter((doc) => String(doc._id) === id))[0])
    }
    return Effect.succeed(documentForTestClass<T>(config.doc))
  }

  const updateDocImpl: HulyClientOperations["updateDoc"] = (
    _class: unknown,
    _space: unknown,
    _objectId: unknown,
    operations: unknown
  ) => {
    if (config.captureUpdateDoc) {
      config.captureUpdateDoc.operations = operations
    }
    return Effect.succeed({})
  }

  const updateMixinImpl: HulyClientOperations["updateMixin"] = (
    _objectId: unknown,
    _objectClass: unknown,
    _objectSpace: unknown,
    mixin: unknown,
    attributesUpdate: unknown
  ) => {
    if (config.captureUpdateMixin) {
      config.captureUpdateMixin.mixin = String(mixin)
      config.captureUpdateMixin.attributes = attributesUpdate
    }
    return Effect.succeed({})
  }

  const warnings = config.warnings ?? []
  return Layer.mergeAll(
    HulyClient.testLayer({
      findAll: findAllImpl,
      findOne: findOneImpl,
      updateDoc: updateDocImpl,
      updateMixin: updateMixinImpl
    }),
    Layer.succeed(Diagnostics, {
      warnAgent: (warning) => Effect.sync(() => warnings.push(warning)),
      trail: (_message: string) => Effect.void
    })
  )
}

describe("custom-fields operations", () => {
  it.effect("lists custom fields through the decoded metadata boundary", () =>
    Effect.gen(function* () {
      const attr = makeAttribute({
        _id: "attr-enum",
        name: "priorityBand",
        label: "tracker:field:Priority Band",
        type: { _class: "core:class:EnumOf", of: "enum:priority", label: "Priority" }
      })
      const ownerClass = makeDoc({
        _id: "tracker:mixin:IssueTypeData",
        label: "tracker:class:Issue Type Data",
        kind: ClassifierKind.MIXIN
      })

      const result = yield* listCustomFields({}).pipe(
        Effect.provide(createTestLayer({ attributes: [attr], classDocs: [ownerClass] }))
      )
      const encoded = yield* Schema.encodeUnknownEffect(ListCustomFieldsResultSchema)(result)

      expect(encoded).toEqual([
        {
          id: "attr-enum",
          name: "priorityBand",
          label: "Priority Band",
          ownerClassId: "tracker:mixin:IssueTypeData",
          ownerLabel: "Issue Type Data",
          type: "enum",
          typeDetails: { _class: "core:class:EnumOf", enumRef: "enum:priority", label: "Priority", of: "enum:priority" }
        }
      ])
    })
  )

  it.effect("preserves typed custom field typeDetails for array, ref, and unknown metadata", () =>
    Effect.gen(function* () {
      const attrs = [
        makeAttribute({
          _id: "attr-array",
          name: "reviewers",
          label: "tracker:field:Reviewers",
          type: { _class: "core:class:ArrOf", itemLabel: "Reviewer", of: { _class: "core:class:TypeString" } }
        }),
        makeAttribute({
          _id: "attr-ref",
          name: "owner",
          label: "tracker:field:Owner",
          type: { _class: "core:class:RefTo", to: "contact:class:Person", title: "Owner" }
        }),
        makeAttribute({
          _id: "attr-weird",
          name: "weird",
          label: "tracker:field:Weird",
          type: { _class: "custom:class:Weird", foo: "bar" }
        })
      ]

      const result = yield* listCustomFields({}).pipe(Effect.provide(createTestLayer({ attributes: attrs })))
      const encoded = yield* Schema.encodeUnknownEffect(ListCustomFieldsResultSchema)(result)

      expect(encoded).toEqual([
        {
          id: "attr-array",
          name: "reviewers",
          label: "Reviewers",
          ownerClassId: "tracker:mixin:IssueTypeData",
          ownerLabel: "tracker:mixin:IssueTypeData",
          type: "array",
          typeDetails: { _class: "core:class:ArrOf", itemLabel: "Reviewer", of: { _class: "core:class:TypeString" } }
        },
        {
          id: "attr-ref",
          name: "owner",
          label: "Owner",
          ownerClassId: "tracker:mixin:IssueTypeData",
          ownerLabel: "tracker:mixin:IssueTypeData",
          type: "ref",
          typeDetails: { _class: "core:class:RefTo", title: "Owner", to: "contact:class:Person" }
        },
        {
          id: "attr-weird",
          name: "weird",
          label: "Weird",
          ownerClassId: "tracker:mixin:IssueTypeData",
          ownerLabel: "tracker:mixin:IssueTypeData",
          type: "unknown",
          typeDetails: { _class: "custom:class:Weird", foo: "bar" }
        }
      ])
    })
  )

  it.effect("reads custom field values from a decoded document map", () =>
    Effect.gen(function* () {
      const attr = makeAttribute({
        _id: "attr-bool",
        name: "qaApproved",
        label: "tracker:field:QA Approved",
        type: { _class: "core:class:TypeBoolean" }
      })
      const doc = makeDoc({ qaApproved: true })

      const result = yield* getCustomFieldValues({
        objectId: docId("issue-1"),
        objectClass: objectClassName("tracker:class:Issue")
      }).pipe(Effect.provide(createTestLayer({ attributes: [attr], doc })))

      expect(result).toEqual([{ fieldId: "attr-bool", label: "QA Approved", value: true, type: "boolean" }])
    })
  )

  it.effect("sets custom field values through mixin updates with parsed values", () =>
    Effect.gen(function* () {
      const attr = makeAttribute({
        _id: "attr-bool",
        name: "qaApproved",
        label: "tracker:field:QA Approved",
        type: { _class: "core:class:TypeBoolean" }
      })
      const doc = makeDoc({ _id: "issue-1", space: "space-1" })
      const ownerClass = makeDoc({
        _id: "tracker:mixin:IssueTypeData",
        label: "tracker:class:Issue Type Data",
        kind: ClassifierKind.MIXIN
      })
      const captureUpdateMixin: { mixin?: string; attributes?: Record<string, unknown> } = {}

      const result = yield* setCustomField({
        objectId: docId("issue-1"),
        objectClass: objectClassName("tracker:class:Issue"),
        fieldId: customFieldId("attr-bool"),
        value: "true"
      }).pipe(Effect.provide(createTestLayer({ attributes: [attr], doc, classDocs: [ownerClass], captureUpdateMixin })))

      expect(result).toEqual({
        objectId: "issue-1",
        fieldId: "attr-bool",
        label: "QA Approved",
        value: true,
        updated: true
      })
      expect(captureUpdateMixin.mixin).toBe("tracker:mixin:IssueTypeData")
      expect(captureUpdateMixin.attributes).toEqual({ qaApproved: true })
    })
  )

  it.effect("parses strict ISO calendar and epoch-millisecond date values before updating Huly", () =>
    Effect.gen(function* () {
      const attr = makeAttribute({
        _id: "attr-date",
        name: "targetDate",
        label: "tracker:field:Target Date",
        type: { _class: "core:class:TypeDate" }
      })
      const ownerClass = makeDoc({
        _id: "tracker:mixin:IssueTypeData",
        label: "tracker:class:Issue Type Data",
        kind: ClassifierKind.MIXIN
      })
      const baseConfig = { attributes: [attr], doc: makeDoc({ _id: "issue-1" }), classDocs: [ownerClass] }
      const isoCapture: { attributes?: Record<string, unknown> } = {}
      const isoResult = yield* setCustomField({
        objectId: docId("issue-1"),
        objectClass: objectClassName("tracker:class:Issue"),
        fieldId: customFieldId("attr-date"),
        value: "2026-07-24"
      }).pipe(Effect.provide(createTestLayer({ ...baseConfig, captureUpdateMixin: isoCapture })))

      expect(isoResult.value).toBe(1_784_851_200_000)
      expect(isoCapture.attributes).toEqual({ targetDate: 1_784_851_200_000 })

      const epochCapture: { attributes?: Record<string, unknown> } = {}
      const epochResult = yield* setCustomField({
        objectId: docId("issue-1"),
        objectClass: objectClassName("tracker:class:Issue"),
        fieldId: customFieldId("attr-date"),
        value: "1719792000000"
      }).pipe(Effect.provide(createTestLayer({ ...baseConfig, captureUpdateMixin: epochCapture })))

      expect(epochResult.value).toBe(1_719_792_000_000)
      expect(epochCapture.attributes).toEqual({ targetDate: 1_719_792_000_000 })
    })
  )

  it.effect("rejects invalid and timezone-adjacent date values before any Huly update", () =>
    Effect.gen(function* () {
      const attr = makeAttribute({ _id: "attr-date", name: "targetDate", type: { _class: "core:class:TypeDate" } })
      const ownerClass = makeDoc({ _id: "tracker:mixin:IssueTypeData", kind: ClassifierKind.MIXIN })
      const invalidValues = [
        "",
        " ",
        "2026-02-29",
        "2026-07-25T00:00:00Z",
        "2026-07-24+01:00",
        "NaN",
        "Infinity",
        "1e3",
        "1719792000000.5",
        "-1",
        "8640000000000001"
      ]

      for (const value of invalidValues) {
        const captureUpdateMixin: { attributes?: Record<string, unknown> } = {}
        const error = yield* Effect.flip(
          setCustomField({
            objectId: docId("issue-1"),
            objectClass: objectClassName("tracker:class:Issue"),
            fieldId: customFieldId("attr-date"),
            value
          }).pipe(
            Effect.provide(
              createTestLayer({
                attributes: [attr],
                doc: makeDoc({ _id: "issue-1" }),
                classDocs: [ownerClass],
                captureUpdateMixin
              })
            )
          )
        )

        expect(error._tag).toBe("InvalidCustomFieldDateValueError")
        expect(captureUpdateMixin.attributes).toBeUndefined()
      }
    })
  )
})

describe("custom-fields branch coverage", () => {
  it.effect("lists primitive string and number fields filtered by targetClass", () =>
    Effect.gen(function* () {
      const attrs = [
        makeAttribute({
          _id: "attr-str",
          name: "code",
          label: "tracker:field:Code",
          type: { _class: "core:class:TypeString" }
        }),
        makeAttribute({
          _id: "attr-num",
          name: "points",
          label: "tracker:field:Points",
          type: { _class: "core:class:TypeNumber" }
        })
      ]
      const result = yield* listCustomFields({ targetClass: NonEmptyString.make("tracker:mixin:IssueTypeData") }).pipe(
        Effect.provide(createTestLayer({ attributes: attrs }))
      )
      expect(result.map((field) => field.type)).toEqual(["string", "number"])
    })
  )

  it.effect("returns an empty list when there are no custom attributes", () =>
    Effect.gen(function* () {
      const result = yield* listCustomFields({}).pipe(Effect.provide(createTestLayer({ attributes: [] })))
      expect(result).toEqual([])
    })
  )

  it.effect("falls back to the attribute name when the label cannot be decoded", () =>
    Effect.gen(function* () {
      const attr = makeAttribute({
        _id: "attr-raw",
        name: "raw",
        label: 12345,
        type: { _class: "core:class:TypeString" }
      })
      const result = yield* listCustomFields({}).pipe(Effect.provide(createTestLayer({ attributes: [attr] })))
      expect(result[0]?.label).toBe("raw")
    })
  )

  it.effect("routes generic metadata fallback degradation through Diagnostics", () =>
    Effect.gen(function* () {
      const warnings: Array<ToolWarning> = []
      const attr = makeAttribute({
        _id: "attr-warning",
        name: "raw",
        label: 12345,
        type: { _class: "core:class:TypeString" }
      })
      const result = yield* listCustomFields({}).pipe(Effect.provide(createTestLayer({ attributes: [attr], warnings })))

      expect(result[0]?.label).toBe("raw")
      expect(warnings).toEqual([expect.objectContaining({ code: CustomFieldMetadataDegradedWarningCode })])
      expect(warnings[0]?.message).toContain("field_label_fallback")
    })
  )

  it("does not read inherited custom-field values", () => {
    const mixinValues: Record<string, unknown> = {}
    Object.setPrototypeOf(mixinValues, { toString: "inherited-value" })
    const doc = makeDoc({ [String(objectClassName("tracker:mixin:IssueTypeData"))]: mixinValues })

    expect(readCustomFieldValue(doc, objectClassName("tracker:mixin:IssueTypeData"), "toString")).toBeUndefined()
  })

  it.effect("defaults a non-numeric class kind to CLASS when resolving owner labels", () =>
    Effect.gen(function* () {
      const attr = makeAttribute({
        _id: "attr-c",
        name: "c",
        attributeOf: "tracker:class:Issue",
        type: { _class: "core:class:TypeString" }
      })
      const ownerClass = makeDoc({ _id: "tracker:class:Issue", label: "tracker:class:Issue", kind: "not-a-number" })
      const result = yield* listCustomFields({}).pipe(
        Effect.provide(createTestLayer({ attributes: [attr], classDocs: [ownerClass] }))
      )
      expect(result[0]?.ownerLabel).toBe("Issue")
    })
  )

  it.effect("reports object-not-found when reading values for a missing document", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        getCustomFieldValues({ objectId: docId("ghost"), objectClass: objectClassName("tracker:class:Issue") }).pipe(
          Effect.provide(createTestLayer({ attributes: [], doc: undefined }))
        )
      )
      expect(error._tag).toBe("CustomFieldObjectNotFoundError")
    })
  )

  it.effect("reports field-not-found when setting an unknown field", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        setCustomField({
          objectId: docId("issue-1"),
          objectClass: objectClassName("tracker:class:Issue"),
          fieldId: customFieldId("nonexistent"),
          value: "x"
        }).pipe(Effect.provide(createTestLayer({ attributes: [], doc: makeDoc() })))
      )
      expect(error._tag).toBe("CustomFieldNotFoundError")
    })
  )

  it.effect("reports object-not-found when setting a field on a missing document", () =>
    Effect.gen(function* () {
      const attr = makeAttribute({ _id: "attr-1", type: { _class: "core:class:TypeString" } })
      const error = yield* Effect.flip(
        setCustomField({
          objectId: docId("ghost"),
          objectClass: objectClassName("tracker:class:Issue"),
          fieldId: customFieldId("attr-1"),
          value: "x"
        }).pipe(Effect.provide(createTestLayer({ attributes: [attr], doc: undefined })))
      )
      expect(error._tag).toBe("CustomFieldObjectNotFoundError")
    })
  )

  it.effect("updates a non-mixin field via updateDoc with a string value", () =>
    Effect.gen(function* () {
      const attr = makeAttribute({
        _id: "attr-str",
        name: "code",
        attributeOf: "tracker:class:Issue",
        type: { _class: "core:class:TypeString" }
      })
      const doc = makeDoc({ _id: "issue-1", space: "space-1" })
      const captureUpdateDoc: { operations?: Record<string, unknown> } = {}
      const result = yield* setCustomField({
        objectId: docId("issue-1"),
        objectClass: objectClassName("tracker:class:Issue"),
        fieldId: customFieldId("attr-str"),
        value: "ABC"
      }).pipe(Effect.provide(createTestLayer({ attributes: [attr], doc, classDocs: [], captureUpdateDoc })))
      expect(result.value).toBe("ABC")
      expect(captureUpdateDoc.operations).toEqual({ code: "ABC" })
    })
  )

  it.effect("parses numeric and non-numeric values for a number field", () =>
    Effect.gen(function* () {
      const attr = makeAttribute({ _id: "attr-num", name: "points", type: { _class: "core:class:TypeNumber" } })
      const ownerClass = makeDoc({
        _id: "tracker:mixin:IssueTypeData",
        label: "tracker:class:Issue Type Data",
        kind: ClassifierKind.MIXIN
      })
      const baseConfig = {
        attributes: [attr],
        doc: makeDoc({ _id: "issue-1", space: "space-1" }),
        classDocs: [ownerClass]
      }
      const parsed = yield* setCustomField({
        objectId: docId("issue-1"),
        objectClass: objectClassName("tracker:class:Issue"),
        fieldId: customFieldId("attr-num"),
        value: "42"
      }).pipe(Effect.provide(createTestLayer(baseConfig)))
      expect(parsed.value).toBe(42)

      const fallback = yield* setCustomField({
        objectId: docId("issue-1"),
        objectClass: objectClassName("tracker:class:Issue"),
        fieldId: customFieldId("attr-num"),
        value: "not-a-number"
      }).pipe(Effect.provide(createTestLayer(baseConfig)))
      expect(fallback.value).toBe("not-a-number")
    })
  )

  it.effect("strictly rejects padded numbers and accepts the false boolean literal", () =>
    Effect.gen(function* () {
      const paddedNumberError = yield* Effect.flip(parseCustomFieldValue(" 42", "number"))
      const falseValue = yield* parseCustomFieldValue("false", "boolean")

      expect(paddedNumberError).toMatchObject({ _tag: "InvalidCustomFieldNumberValueError", value: " 42" })
      expect(falseValue).toBe(false)
    })
  )

  it.effect("omits definitions whose document has no runtime value", () =>
    Effect.gen(function* () {
      const attr = makeAttribute({ _id: "attr-unset", name: "unsetValue", type: { _class: "core:class:TypeString" } })
      const result = yield* getCustomFieldValues({
        objectId: docId("issue-1"),
        objectClass: objectClassName("tracker:class:Issue")
      }).pipe(Effect.provide(createTestLayer({ attributes: [attr], doc: makeDoc({ _id: "issue-1" }) })))

      expect(result).toEqual([])
    })
  )
})
