import { describe, it } from "@effect/vitest"
import type { AnyAttribute, Doc, FindResult, PersonId, Ref, Space } from "@hcengineering/core"
import { ClassifierKind } from "@hcengineering/core"
import { Effect, Schema } from "effect"
import { expect } from "vitest"

import { ListCustomFieldsResultSchema } from "../../../src/domain/schemas/custom-fields.js"
import { NonEmptyString } from "../../../src/domain/schemas/shared.js"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import { core } from "../../../src/huly/huly-plugins.js"
import { getCustomFieldValues, listCustomFields, setCustomField } from "../../../src/huly/operations/custom-fields.js"
import { customFieldId, docId, objectClassName } from "../../helpers/brands.js"

const toFindResult = <T extends Doc>(docs: Array<T>): FindResult<T> => {
  const result = docs as FindResult<T>
  result.total = docs.length
  return result
}

const makeAttribute = (overrides: Record<string, unknown> = {}): AnyAttribute =>
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- test fixture for SDK-shaped custom attribute
  ({
    _id: "attr-1",
    _class: core.class.Attribute,
    space: "space-1" as Ref<Space>,
    name: "storyPoints",
    label: "tracker:field:Story Points",
    attributeOf: "tracker:mixin:IssueTypeData",
    type: { _class: "core:class:TypeNumber" },
    isCustom: true,
    modifiedBy: "user-1" as PersonId,
    modifiedOn: 0,
    createdBy: "user-1" as PersonId,
    createdOn: 0,
    ...overrides
  }) as AnyAttribute

const makeDoc = (overrides: Record<string, unknown> = {}): Doc =>
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- test fixture for SDK-shaped dynamic document
  ({
    _id: "doc-1",
    _class: "tracker:class:Issue",
    space: "space-1" as Ref<Space>,
    modifiedBy: "user-1" as PersonId,
    modifiedOn: 0,
    createdBy: "user-1" as PersonId,
    createdOn: 0,
    ...overrides
  }) as Doc

interface MockConfig {
  readonly attributes?: ReadonlyArray<AnyAttribute>
  readonly doc?: Doc | undefined
  readonly classDocs?: ReadonlyArray<Doc>
  readonly captureUpdateDoc?: { readonly operations?: Record<string, unknown> }
  readonly captureUpdateMixin?: { readonly mixin?: string; readonly attributes?: Record<string, unknown> }
}

const createTestLayer = (config: MockConfig) => {
  const attributes = config.attributes ?? []
  const classDocs = config.classDocs ?? []

  const findAllImpl: HulyClientOperations["findAll"] = ((_class: unknown, query: unknown) => {
    if (_class === core.class.Attribute) {
      return Effect.succeed(toFindResult([...attributes]))
    }
    if (_class === core.class.Class) {
      const ids = ((query as Record<string, unknown>)._id as { $in?: Array<string> } | undefined)?.$in ?? []
      return Effect.succeed(toFindResult(classDocs.filter((doc) => ids.includes(String(doc._id)))))
    }
    return Effect.succeed(toFindResult([]))
  }) as HulyClientOperations["findAll"]

  const findOneImpl: HulyClientOperations["findOne"] = ((_class: unknown, query: unknown) => {
    if (_class === core.class.Attribute) {
      const id = String((query as Record<string, unknown>)._id)
      return Effect.succeed(attributes.find((attr) => String(attr._id) === id))
    }
    if (_class === core.class.Class) {
      const id = String((query as Record<string, unknown>)._id)
      return Effect.succeed(classDocs.find((doc) => String(doc._id) === id))
    }
    return Effect.succeed(config.doc)
  }) as HulyClientOperations["findOne"]

  const updateDocImpl: HulyClientOperations["updateDoc"] = (
    (_class: unknown, _space: unknown, _objectId: unknown, operations: unknown) => {
      if (config.captureUpdateDoc) {
        ;(config.captureUpdateDoc as { operations?: Record<string, unknown> }).operations = operations as Record<
          string,
          unknown
        >
      }
      return Effect.succeed({} as never)
    }
  ) as HulyClientOperations["updateDoc"]

  const updateMixinImpl: HulyClientOperations["updateMixin"] = (
    (_objectId: unknown, _objectClass: unknown, _objectSpace: unknown, mixin: unknown, attributesUpdate: unknown) => {
      if (config.captureUpdateMixin) {
        ;(config.captureUpdateMixin as { mixin?: string; attributes?: Record<string, unknown> }).mixin = String(mixin)
        ;(config.captureUpdateMixin as { mixin?: string; attributes?: Record<string, unknown> }).attributes =
          attributesUpdate as Record<string, unknown>
      }
      return Effect.succeed({} as never)
    }
  ) as HulyClientOperations["updateMixin"]

  return HulyClient.testLayer({
    findAll: findAllImpl,
    findOne: findOneImpl,
    updateDoc: updateDocImpl,
    updateMixin: updateMixinImpl
  })
}

describe("custom-fields operations", () => {
  it.effect("lists custom fields through the decoded metadata boundary", () =>
    Effect.gen(function*() {
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
      const encoded = yield* Schema.encodeUnknown(ListCustomFieldsResultSchema)(result)

      expect(encoded).toEqual([
        {
          id: "attr-enum",
          name: "priorityBand",
          label: "Priority Band",
          ownerClassId: "tracker:mixin:IssueTypeData",
          ownerLabel: "Issue Type Data",
          type: "enum",
          typeDetails: {
            _class: "core:class:EnumOf",
            enumRef: "enum:priority",
            label: "Priority",
            of: "enum:priority"
          }
        }
      ])
    }))

  it.effect("preserves typed custom field typeDetails for array, ref, and unknown metadata", () =>
    Effect.gen(function*() {
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

      const result = yield* listCustomFields({}).pipe(
        Effect.provide(createTestLayer({ attributes: attrs }))
      )
      const encoded = yield* Schema.encodeUnknown(ListCustomFieldsResultSchema)(result)

      expect(encoded).toEqual([
        {
          id: "attr-array",
          name: "reviewers",
          label: "Reviewers",
          ownerClassId: "tracker:mixin:IssueTypeData",
          ownerLabel: "tracker:mixin:IssueTypeData",
          type: "array",
          typeDetails: {
            _class: "core:class:ArrOf",
            itemLabel: "Reviewer",
            of: { _class: "core:class:TypeString" }
          }
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
    }))

  it.effect("reads custom field values from a decoded document map", () =>
    Effect.gen(function*() {
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

      expect(result).toEqual([
        {
          fieldId: "attr-bool",
          label: "QA Approved",
          value: true,
          type: "boolean"
        }
      ])
    }))

  it.effect("sets custom field values through mixin updates with parsed values", () =>
    Effect.gen(function*() {
      const attr = makeAttribute({
        _id: "attr-bool",
        name: "qaApproved",
        label: "tracker:field:QA Approved",
        type: { _class: "core:class:TypeBoolean" }
      })
      const doc = makeDoc({ _id: "issue-1", space: "space-1" as Ref<Space> })
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
      }).pipe(
        Effect.provide(
          createTestLayer({
            attributes: [attr],
            doc,
            classDocs: [ownerClass],
            captureUpdateMixin
          })
        )
      )

      expect(result).toEqual({
        objectId: "issue-1",
        fieldId: "attr-bool",
        label: "QA Approved",
        value: true,
        updated: true
      })
      expect(captureUpdateMixin.mixin).toBe("tracker:mixin:IssueTypeData")
      expect(captureUpdateMixin.attributes).toEqual({ qaApproved: true })
    }))
})

describe("custom-fields branch coverage", () => {
  it.effect("lists primitive string and number fields filtered by targetClass", () =>
    Effect.gen(function*() {
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
    }))

  it.effect("returns an empty list when there are no custom attributes", () =>
    Effect.gen(function*() {
      const result = yield* listCustomFields({}).pipe(Effect.provide(createTestLayer({ attributes: [] })))
      expect(result).toEqual([])
    }))

  it.effect("falls back to the attribute name when the label cannot be decoded", () =>
    Effect.gen(function*() {
      const attr = makeAttribute({
        _id: "attr-raw",
        name: "raw",
        label: 12345,
        type: { _class: "core:class:TypeString" }
      })
      const result = yield* listCustomFields({}).pipe(Effect.provide(createTestLayer({ attributes: [attr] })))
      expect(result[0]?.label).toBe("raw")
    }))

  it.effect("defaults a non-numeric class kind to CLASS when resolving owner labels", () =>
    Effect.gen(function*() {
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
    }))

  it.effect("reports object-not-found when reading values for a missing document", () =>
    Effect.gen(function*() {
      const error = yield* Effect.flip(
        getCustomFieldValues({
          objectId: docId("ghost"),
          objectClass: objectClassName("tracker:class:Issue")
        }).pipe(Effect.provide(createTestLayer({ attributes: [], doc: undefined })))
      )
      expect(error._tag).toBe("CustomFieldObjectNotFoundError")
    }))

  it.effect("reports field-not-found when setting an unknown field", () =>
    Effect.gen(function*() {
      const error = yield* Effect.flip(
        setCustomField({
          objectId: docId("issue-1"),
          objectClass: objectClassName("tracker:class:Issue"),
          fieldId: customFieldId("nonexistent"),
          value: "x"
        }).pipe(Effect.provide(createTestLayer({ attributes: [], doc: makeDoc() })))
      )
      expect(error._tag).toBe("CustomFieldNotFoundError")
    }))

  it.effect("reports object-not-found when setting a field on a missing document", () =>
    Effect.gen(function*() {
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
    }))

  it.effect("updates a non-mixin field via updateDoc with a string value", () =>
    Effect.gen(function*() {
      const attr = makeAttribute({
        _id: "attr-str",
        name: "code",
        attributeOf: "tracker:class:Issue",
        type: { _class: "core:class:TypeString" }
      })
      const doc = makeDoc({ _id: "issue-1", space: "space-1" as Ref<Space> })
      const captureUpdateDoc: { operations?: Record<string, unknown> } = {}
      const result = yield* setCustomField({
        objectId: docId("issue-1"),
        objectClass: objectClassName("tracker:class:Issue"),
        fieldId: customFieldId("attr-str"),
        value: "ABC"
      }).pipe(Effect.provide(createTestLayer({ attributes: [attr], doc, classDocs: [], captureUpdateDoc })))
      expect(result.value).toBe("ABC")
      expect(captureUpdateDoc.operations).toEqual({ code: "ABC" })
    }))

  it.effect("parses numeric and non-numeric values for a number field", () =>
    Effect.gen(function*() {
      const attr = makeAttribute({ _id: "attr-num", name: "points", type: { _class: "core:class:TypeNumber" } })
      const ownerClass = makeDoc({
        _id: "tracker:mixin:IssueTypeData",
        label: "tracker:class:Issue Type Data",
        kind: ClassifierKind.MIXIN
      })
      const baseConfig = {
        attributes: [attr],
        doc: makeDoc({ _id: "issue-1", space: "space-1" as Ref<Space> }),
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
    }))
})
