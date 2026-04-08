import { describe, it } from "@effect/vitest"
import type { AnyAttribute, Doc, FindResult, PersonId, Ref, Space } from "@hcengineering/core"
import { ClassifierKind } from "@hcengineering/core"
import { Effect } from "effect"
import { expect } from "vitest"

import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import { core } from "../../../src/huly/huly-plugins.js"
import { getCustomFieldValues, listCustomFields, setCustomField } from "../../../src/huly/operations/custom-fields.js"

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
        type: { _class: "core:class:EnumOf", of: "enum:priority" }
      })
      const ownerClass = makeDoc({
        _id: "tracker:mixin:IssueTypeData",
        label: "tracker:class:Issue Type Data",
        kind: ClassifierKind.MIXIN
      })

      const result = yield* listCustomFields({}).pipe(
        Effect.provide(createTestLayer({ attributes: [attr], classDocs: [ownerClass] }))
      )

      expect(result).toEqual([
        {
          id: "attr-enum",
          name: "priorityBand",
          label: "Priority Band",
          ownerClassId: "tracker:mixin:IssueTypeData",
          ownerLabel: "Issue Type Data",
          type: "enum",
          typeDetails: { enumRef: "enum:priority" }
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
        objectId: "issue-1",
        objectClass: "tracker:class:Issue"
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
        objectId: "issue-1",
        objectClass: "tracker:class:Issue",
        fieldId: "attr-bool",
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
