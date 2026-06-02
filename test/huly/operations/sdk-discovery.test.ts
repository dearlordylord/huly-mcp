import { describe, it } from "@effect/vitest"
import type { AnyAttribute, Doc, Enum as HulyEnum, PersonId, Ref, Space } from "@hcengineering/core"
import { ClassifierKind, toFindResult } from "@hcengineering/core"
import { Effect, Exit, Schema } from "effect"
import { expect } from "vitest"

import {
  GetHulyClassResultSchema,
  HulyModelSearch,
  ListHulyAttributesResultSchema,
  ListHulyClassesResultSchema,
  ListHulyEnumsResultSchema,
  SDK_DISCOVERY_DEFAULT_LIMIT
} from "../../../src/domain/schemas/sdk-discovery.js"
import { ObjectClassName } from "../../../src/domain/schemas/shared.js"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import { contact, core, tracker } from "../../../src/huly/huly-plugins.js"
import {
  getHulyClass,
  listHulyAttributes,
  listHulyClasses,
  listHulyEnums
} from "../../../src/huly/operations/sdk-discovery.js"

const person = "person-1" as PersonId
const space = "space-1" as Ref<Space>

const makeClassDoc = (overrides: Record<string, unknown>): Doc =>
  // eslint-disable-next-line no-restricted-syntax -- SDK-shaped model fixture
  ({
    _id: "tracker:class:Issue",
    _class: core.class.Class,
    space,
    modifiedBy: person,
    modifiedOn: 0,
    label: "tracker:class:Issue",
    kind: ClassifierKind.CLASS,
    domain: "tracker",
    ...overrides
  }) as unknown as Doc

const makeAttribute = (overrides: Record<string, unknown>): AnyAttribute =>
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- SDK-shaped attribute fixture
  ({
    _id: "attr:issue.title",
    _class: core.class.Attribute,
    space,
    modifiedBy: person,
    modifiedOn: 0,
    name: "title",
    label: "tracker:field:Title",
    attributeOf: tracker.class.Issue,
    type: { _class: core.class.TypeString },
    ...overrides
  }) as AnyAttribute

const makeEnum = (overrides: Record<string, unknown>): HulyEnum =>
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- SDK-shaped enum fixture
  ({
    _id: "enum:priority",
    _class: core.class.Enum,
    space,
    modifiedBy: person,
    modifiedOn: 0,
    name: "Priority",
    enumValues: ["Low", "High"],
    ...overrides
  }) as HulyEnum

interface TestLayerConfig {
  readonly classes?: ReadonlyArray<Doc>
  readonly attributes?: ReadonlyArray<AnyAttribute>
  readonly enums?: ReadonlyArray<HulyEnum>
}

const queryIdMatches = (docId: string, query: Record<string, unknown>): boolean => {
  const idQuery = query._id
  if (idQuery === undefined) return true
  if (typeof idQuery === "string") return docId === idQuery
  if (typeof idQuery === "object" && idQuery !== null && "$in" in idQuery) {
    const ids = (idQuery as { readonly $in?: ReadonlyArray<string> }).$in ?? []
    return ids.includes(docId)
  }
  return false
}

const queryAttributeOfMatches = (attributeOf: string, query: Record<string, unknown>): boolean => {
  const ownerQuery = query.attributeOf
  if (ownerQuery === undefined) return true
  if (typeof ownerQuery === "string") return attributeOf === ownerQuery
  if (typeof ownerQuery === "object" && ownerQuery !== null && "$in" in ownerQuery) {
    const ids = (ownerQuery as { readonly $in?: ReadonlyArray<string> }).$in ?? []
    return ids.includes(attributeOf)
  }
  return false
}

const createTestLayer = (config: TestLayerConfig) => {
  const classes = config.classes ?? []
  const attributes = config.attributes ?? []
  const enums = config.enums ?? []

  const findAllImpl: HulyClientOperations["findAll"] = ((_class: unknown, queryValue: unknown) => {
    const query = queryValue as Record<string, unknown>
    if (_class === core.class.Class) {
      const filtered = classes.filter((doc) =>
        queryIdMatches(String(doc._id), query)
        && (query.kind === undefined || query.kind === (doc as { readonly kind?: unknown }).kind)
        && (query.domain === undefined || query.domain === (doc as { readonly domain?: unknown }).domain)
      )
      return Effect.succeed(toFindResult(filtered))
    }
    if (_class === core.class.Attribute) {
      const filtered = attributes.filter((attr) =>
        queryIdMatches(String(attr._id), query)
        && queryAttributeOfMatches(String(attr.attributeOf), query)
        && (query.isCustom === undefined || query.isCustom === attr.isCustom)
      )
      return Effect.succeed(toFindResult(filtered))
    }
    if (_class === core.class.Enum) {
      return Effect.succeed(toFindResult(enums.filter((doc) => queryIdMatches(String(doc._id), query))))
    }
    return Effect.succeed(toFindResult([]))
  }) as HulyClientOperations["findAll"]

  const findOneImpl: HulyClientOperations["findOne"] = ((_class: unknown, queryValue: unknown) => {
    const query = queryValue as Record<string, unknown>
    if (_class === core.class.Class) {
      return Effect.succeed(classes.find((doc) => queryIdMatches(String(doc._id), query)))
    }
    return Effect.succeed(undefined)
  }) as HulyClientOperations["findOne"]

  return HulyClient.testLayer({
    findAll: findAllImpl,
    findOne: findOneImpl
  })
}

describe("sdk discovery operations", () => {
  it.effect("lists classes with labels, attribute counts, and first-class tool hints", () =>
    Effect.gen(function*() {
      const classes = [
        makeClassDoc({ _id: tracker.class.Issue, label: "tracker:class:Issue" }),
        makeClassDoc({ _id: contact.class.Person, label: "contact:class:Person", domain: "contact" })
      ]
      const attributes = [
        makeAttribute({ _id: "attr:title", attributeOf: tracker.class.Issue }),
        makeAttribute({ _id: "attr:assignee", attributeOf: tracker.class.Issue })
      ]

      const result = yield* listHulyClasses({ query: HulyModelSearch.make("issue"), limit: 10 }).pipe(
        Effect.provide(createTestLayer({ classes, attributes }))
      )
      const encoded = yield* Schema.encodeUnknown(ListHulyClassesResultSchema)(result)

      expect(encoded).toEqual({
        classes: [{
          classId: tracker.class.Issue,
          label: "Issue",
          kind: "class",
          directAncestors: [],
          domain: "tracker",
          attributesCount: 2,
          firstClassToolHints: [{
            category: "issues",
            exampleTools: ["list_issues", "get_issue", "create_issue"]
          }]
        }],
        total: 1
      })
    }))

  it.effect("filters classes by unknown classifier kind after SDK query hydration", () =>
    Effect.gen(function*() {
      const classes = [
        makeClassDoc({ _id: tracker.class.Issue, label: "tracker:class:Issue" }),
        makeClassDoc({ _id: "test:class:Unexpected", label: "test:class:Unexpected", kind: 999 })
      ]

      const result = yield* listHulyClasses({ kind: "unknown", limit: 10 }).pipe(
        Effect.provide(createTestLayer({ classes }))
      )
      const encoded = yield* Schema.encodeUnknown(ListHulyClassesResultSchema)(result)

      expect(encoded).toEqual({
        classes: [{
          classId: "test:class:Unexpected",
          label: "Unexpected",
          kind: "unknown",
          directAncestors: [],
          domain: "tracker",
          attributesCount: 0,
          firstClassToolHints: []
        }],
        total: 1
      })
    }))

  it.effect("uses the schema SDK discovery default limit when no limit is provided", () =>
    Effect.gen(function*() {
      const classCount = SDK_DISCOVERY_DEFAULT_LIMIT + 1
      const classes = Array.from({ length: classCount }, (_, index) =>
        makeClassDoc({
          _id: `test:class:Item${index}`,
          label: `test:class:Item${index}`,
          domain: "test"
        }))

      const result = yield* listHulyClasses({}).pipe(
        Effect.provide(createTestLayer({ classes }))
      )
      const encoded = yield* Schema.encodeUnknown(ListHulyClassesResultSchema)(result)

      expect(encoded.classes).toHaveLength(SDK_DISCOVERY_DEFAULT_LIMIT)
      expect(encoded.total).toBe(SDK_DISCOVERY_DEFAULT_LIMIT)
    }))

  it.effect("gets a class with inherited attributes and decoded ref/enum types", () =>
    Effect.gen(function*() {
      const classes = [
        makeClassDoc({ _id: core.class.Doc, label: "core:class:Doc", domain: "model" }),
        makeClassDoc({ _id: tracker.class.Issue, label: "tracker:class:Issue", extends: core.class.Doc })
      ]
      const attributes = [
        makeAttribute({ _id: "attr:title", name: "title", attributeOf: core.class.Doc }),
        makeAttribute({
          _id: "attr:assignee",
          name: "assignee",
          attributeOf: tracker.class.Issue,
          type: { _class: core.class.RefTo, to: contact.class.Person }
        }),
        makeAttribute({
          _id: "attr:priority",
          name: "priority",
          attributeOf: tracker.class.Issue,
          type: { _class: core.class.EnumOf, of: "enum:priority" }
        })
      ]

      const result = yield* getHulyClass({ class: ObjectClassName.make(tracker.class.Issue) }).pipe(
        Effect.provide(createTestLayer({ classes, attributes }))
      )
      const encoded = yield* Schema.encodeUnknown(GetHulyClassResultSchema)(result)

      expect(encoded.ancestors.map((ancestor) => ancestor.classId)).toEqual([core.class.Doc])
      expect(encoded.class.directAncestors).toEqual([core.class.Doc])
      expect(encoded.attributes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "title", inherited: true }),
          expect.objectContaining({
            name: "assignee",
            inherited: false,
            type: expect.objectContaining({ refTo: contact.class.Person })
          }),
          expect.objectContaining({ name: "priority", type: expect.objectContaining({ enumId: "enum:priority" }) })
        ])
      )
    }))

  it.effect("decodes array attribute element types recursively", () =>
    Effect.gen(function*() {
      const classes = [makeClassDoc({ _id: tracker.class.Issue, label: "tracker:class:Issue" })]
      const attributes = [
        makeAttribute({
          _id: "attr:assignees",
          name: "assignees",
          attributeOf: tracker.class.Issue,
          type: { _class: core.class.ArrOf, of: { _class: core.class.RefTo, to: contact.class.Person } }
        }),
        makeAttribute({
          _id: "attr:tagMatrix",
          name: "tagMatrix",
          attributeOf: tracker.class.Issue,
          type: { _class: core.class.ArrOf, of: { _class: core.class.ArrOf, of: { _class: core.class.TypeString } } }
        })
      ]

      const result = yield* getHulyClass({ class: ObjectClassName.make(tracker.class.Issue) }).pipe(
        Effect.provide(createTestLayer({ classes, attributes }))
      )
      const encoded = yield* Schema.encodeUnknown(GetHulyClassResultSchema)(result)

      expect(encoded.attributes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: "assignees",
            type: expect.objectContaining({
              kind: "array",
              arrayOf: expect.objectContaining({ kind: "ref", refTo: contact.class.Person })
            })
          }),
          expect.objectContaining({
            name: "tagMatrix",
            type: expect.objectContaining({
              kind: "array",
              arrayOf: expect.objectContaining({
                kind: "array",
                arrayOf: expect.objectContaining({ kind: "string" })
              })
            })
          })
        ])
      )
    }))

  it.effect("gets attributes from implemented interfaces and interface ancestors", () =>
    Effect.gen(function*() {
      const timestampInterface = "core:interface:Timestamped"
      const auditableInterface = "core:interface:Auditable"
      const classes = [
        makeClassDoc({
          _id: timestampInterface,
          label: "core:interface:Timestamped",
          kind: ClassifierKind.INTERFACE
        }),
        makeClassDoc({
          _id: auditableInterface,
          label: "core:interface:Auditable",
          kind: ClassifierKind.INTERFACE,
          extends: [timestampInterface]
        }),
        makeClassDoc({
          _id: tracker.class.Issue,
          label: "tracker:class:Issue",
          implements: [auditableInterface]
        })
      ]
      const attributes = [
        makeAttribute({ _id: "attr:createdOn", name: "createdOn", attributeOf: timestampInterface }),
        makeAttribute({ _id: "attr:reviewedBy", name: "reviewedBy", attributeOf: auditableInterface }),
        makeAttribute({ _id: "attr:title", name: "title", attributeOf: tracker.class.Issue })
      ]

      const result = yield* getHulyClass({ class: ObjectClassName.make(tracker.class.Issue) }).pipe(
        Effect.provide(createTestLayer({ classes, attributes }))
      )
      const encoded = yield* Schema.encodeUnknown(GetHulyClassResultSchema)(result)

      expect(encoded.ancestors.map((ancestor) => ancestor.classId)).toEqual([
        auditableInterface,
        timestampInterface
      ])
      expect(encoded.class.directAncestors).toEqual([auditableInterface])
      expect(encoded.ancestors[0]?.directAncestors).toEqual([timestampInterface])
      expect(encoded.attributes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "createdOn", inherited: true }),
          expect.objectContaining({ name: "reviewedBy", inherited: true }),
          expect.objectContaining({ name: "title", inherited: false })
        ])
      )
    }))

  it.effect("keeps ancestors but omits inherited attributes when requested", () =>
    Effect.gen(function*() {
      const classes = [
        makeClassDoc({ _id: core.class.Doc, label: "core:class:Doc", domain: "model" }),
        makeClassDoc({ _id: tracker.class.Issue, label: "tracker:class:Issue", extends: core.class.Doc })
      ]
      const attributes = [
        makeAttribute({ _id: "attr:title", name: "title", attributeOf: core.class.Doc }),
        makeAttribute({ _id: "attr:identifier", name: "identifier", attributeOf: tracker.class.Issue })
      ]

      const result = yield* getHulyClass({
        class: ObjectClassName.make(tracker.class.Issue),
        includeInheritedAttributes: false
      }).pipe(
        Effect.provide(createTestLayer({ classes, attributes }))
      )
      const encoded = yield* Schema.encodeUnknown(GetHulyClassResultSchema)(result)

      expect(encoded.ancestors.map((ancestor) => ancestor.classId)).toEqual([core.class.Doc])
      expect(encoded.class.attributesCount).toBe(1)
      expect(encoded.ancestors[0]?.attributesCount).toBe(1)
      expect(encoded.attributes.map((attr) => attr.name)).toEqual(["identifier"])
    }))

  it.effect("fails get_huly_class for unknown classes", () =>
    Effect.gen(function*() {
      const exit = yield* getHulyClass({ class: ObjectClassName.make("missing:class:Thing") }).pipe(
        Effect.provide(createTestLayer({})),
        Effect.exit
      )

      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) {
        expect(exit.cause.toString()).toContain("HulyClassNotFoundError")
      }
    }))

  it.effect("fails get_huly_class when an ancestor class is missing from the model", () =>
    Effect.gen(function*() {
      const classes = [
        makeClassDoc({ _id: tracker.class.Issue, label: "tracker:class:Issue", extends: "missing:class:Parent" })
      ]

      const exit = yield* getHulyClass({ class: ObjectClassName.make(tracker.class.Issue) }).pipe(
        Effect.provide(createTestLayer({ classes })),
        Effect.exit
      )

      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) {
        expect(exit.cause.toString()).toContain("HulyClassNotFoundError")
      }
    }))

  it.effect("lists attributes with custom-only and text filters", () =>
    Effect.gen(function*() {
      const classes = [makeClassDoc({ _id: tracker.class.Issue, label: "tracker:class:Issue" })]
      const attributes = [
        makeAttribute({ _id: "attr:storyPoints", name: "storyPoints", label: "Story Points", isCustom: true }),
        makeAttribute({ _id: "attr:title", name: "title", label: "Title", isCustom: false })
      ]

      const result = yield* listHulyAttributes({
        class: ObjectClassName.make(tracker.class.Issue),
        customOnly: true,
        query: HulyModelSearch.make("story")
      }).pipe(
        Effect.provide(createTestLayer({ classes, attributes }))
      )
      const encoded = yield* Schema.encodeUnknown(ListHulyAttributesResultSchema)(result)

      expect(encoded.attributes.map((attr) => attr.name)).toEqual(["storyPoints"])
      expect(encoded.total).toBe(1)
    }))

  it.effect("does not coerce malformed SDK attribute label and type target values", () =>
    Effect.gen(function*() {
      const classes = [makeClassDoc({ _id: tracker.class.Issue, label: "tracker:class:Issue" })]
      const attributes = [
        makeAttribute({
          _id: "attr:malformed",
          name: 123,
          label: { value: "tracker:field:Malformed" },
          type: { _class: core.class.RefTo, to: { _id: contact.class.Person } }
        })
      ]

      const result = yield* listHulyAttributes({ class: ObjectClassName.make(tracker.class.Issue) }).pipe(
        Effect.provide(createTestLayer({ classes, attributes }))
      )
      const encoded = yield* Schema.encodeUnknown(ListHulyAttributesResultSchema)(result)

      expect(encoded.attributes).toEqual([
        expect.objectContaining({
          attributeId: "attr:malformed",
          name: "attr:malformed",
          label: "attr:malformed",
          type: expect.objectContaining({ kind: "unknown" })
        })
      ])
      expect(encoded.attributes[0]?.type).not.toHaveProperty("refTo")
    }))

  it.effect("lists enums and supports query filtering", () =>
    Effect.gen(function*() {
      const result = yield* listHulyEnums({ query: HulyModelSearch.make("high") }).pipe(
        Effect.provide(createTestLayer({ enums: [makeEnum({})] }))
      )
      const encoded = yield* Schema.encodeUnknown(ListHulyEnumsResultSchema)(result)

      expect(encoded).toEqual({
        enums: [{ enumId: "enum:priority", name: "Priority", values: ["Low", "High"] }],
        total: 1
      })
    }))
})
