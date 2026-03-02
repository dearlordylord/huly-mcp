import { describe, it } from "@effect/vitest"
import { type Class, type Doc, type PersonId, type Ref, type Space, toFindResult } from "@hcengineering/core"
import type { Asset } from "@hcengineering/platform"
import type { TagCategory as HulyTagCategory } from "@hcengineering/tags"
import { Effect } from "effect"
import { expect } from "vitest"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import type { TagCategoryNotFoundError } from "../../../src/huly/errors.js"
import { tags, tracker } from "../../../src/huly/huly-plugins.js"
import {
  createTagCategory,
  deleteTagCategory,
  listTagCategories,
  updateTagCategory
} from "../../../src/huly/operations/tag-categories.js"
import { tagCategoryIdentifier } from "../../helpers/brands.js"

const makeTagCategory = (overrides?: Partial<HulyTagCategory>): HulyTagCategory => {
  const base = {
    _id: "cat-1" as Ref<HulyTagCategory>,
    _class: tags.class.TagCategory,
    space: "core:space:Workspace" as Ref<Space>,
    icon: "" as Asset,
    label: "Priority",
    targetClass: tracker.class.Issue,
    tags: [],
    default: false,
    modifiedBy: "user-1" as PersonId,
    modifiedOn: Date.now(),
    createdBy: "user-1" as PersonId,
    createdOn: Date.now(),
    ...overrides
  }
  return base as HulyTagCategory
}

interface MockConfig {
  categories?: Array<HulyTagCategory>
  captureCreateDoc?: { attributes?: Record<string, unknown>; id?: string }
  captureUpdateDoc?: { operations?: Record<string, unknown> }
  captureRemoveDoc?: { called?: boolean }
}

const createTestLayerWithMocks = (config: MockConfig) => {
  const categories = config.categories ?? []

  const findAllImpl: HulyClientOperations["findAll"] = ((_class: unknown, query: unknown) => {
    if (_class === tags.class.TagCategory) {
      const q = query as Record<string, unknown>
      const filtered = categories.filter(c => !q.targetClass || c.targetClass === q.targetClass)
      return Effect.succeed(toFindResult(filtered))
    }
    return Effect.succeed(toFindResult([]))
  }) as HulyClientOperations["findAll"]

  const findOneImpl: HulyClientOperations["findOne"] = ((_class: unknown, query: unknown) => {
    if (_class === tags.class.TagCategory) {
      const q = query as Record<string, unknown>
      const found = categories.find(c =>
        (q._id && c._id === q._id)
        || (q.label && c.label === q.label && (!q.targetClass || c.targetClass === q.targetClass))
      )
      return Effect.succeed(found)
    }
    return Effect.succeed(undefined)
  }) as HulyClientOperations["findOne"]

  const createDocImpl: HulyClientOperations["createDoc"] = ((
    _class: unknown,
    _space: unknown,
    attributes: unknown,
    id?: unknown
  ) => {
    if (config.captureCreateDoc) {
      config.captureCreateDoc.attributes = attributes as Record<string, unknown>
      config.captureCreateDoc.id = id as string
    }
    return Effect.succeed((id ?? "new-cat-id") as Ref<Doc>)
  }) as HulyClientOperations["createDoc"]

  const updateDocImpl: HulyClientOperations["updateDoc"] = (
    (_class: unknown, _space: unknown, _objectId: unknown, operations: unknown) => {
      if (config.captureUpdateDoc) {
        config.captureUpdateDoc.operations = operations as Record<string, unknown>
      }
      return Effect.succeed({} as never)
    }
  ) as HulyClientOperations["updateDoc"]

  const removeDocImpl: HulyClientOperations["removeDoc"] = (
    (_class: unknown, _space: unknown, _objectId: unknown) => {
      if (config.captureRemoveDoc) {
        config.captureRemoveDoc.called = true
      }
      return Effect.succeed({} as never)
    }
  ) as HulyClientOperations["removeDoc"]

  return HulyClient.testLayer({
    findAll: findAllImpl,
    findOne: findOneImpl,
    createDoc: createDocImpl,
    updateDoc: updateDocImpl,
    removeDoc: removeDocImpl
  })
}

describe("listTagCategories", () => {
  it.effect("returns categories", () =>
    Effect.gen(function*() {
      const categories = [
        makeTagCategory({ _id: "c-1" as Ref<HulyTagCategory>, label: "Priority" }),
        makeTagCategory({ _id: "c-2" as Ref<HulyTagCategory>, label: "Type" })
      ]

      const testLayer = createTestLayerWithMocks({ categories })

      const result = yield* listTagCategories({}).pipe(Effect.provide(testLayer))

      expect(result).toHaveLength(2)
      expect(result[0].label).toBe("Priority")
      expect(result[1].label).toBe("Type")
    }))

  it.effect("returns empty array when no categories", () =>
    Effect.gen(function*() {
      const testLayer = createTestLayerWithMocks({ categories: [] })

      const result = yield* listTagCategories({}).pipe(Effect.provide(testLayer))

      expect(result).toHaveLength(0)
    }))

  it.effect("filters by targetClass", () =>
    Effect.gen(function*() {
      const categories = [
        makeTagCategory({ _id: "c-1" as Ref<HulyTagCategory>, label: "Issues", targetClass: tracker.class.Issue }),
        makeTagCategory({
          _id: "c-2" as Ref<HulyTagCategory>,
          label: "Candidates",
          targetClass: "recruit:mixin:Candidate" as Ref<Class<Doc>>
        })
      ]

      const testLayer = createTestLayerWithMocks({ categories })

      const result = yield* listTagCategories({ targetClass: "tracker:class:Issue" }).pipe(Effect.provide(testLayer))

      expect(result).toHaveLength(1)
      expect(result[0].label).toBe("Issues")
    }))
})

describe("createTagCategory", () => {
  it.effect("creates new category", () =>
    Effect.gen(function*() {
      const captureCreateDoc: MockConfig["captureCreateDoc"] = {}

      const testLayer = createTestLayerWithMocks({
        categories: [],
        captureCreateDoc
      })

      const result = yield* createTagCategory({ label: "Priority" }).pipe(Effect.provide(testLayer))

      expect(result.label).toBe("Priority")
      expect(result.created).toBe(true)
      expect(captureCreateDoc.attributes?.label).toBe("Priority")
      expect(captureCreateDoc.attributes?.default).toBe(false)
    }))

  it.effect("returns existing category if label matches", () =>
    Effect.gen(function*() {
      const existing = makeTagCategory({ _id: "existing-1" as Ref<HulyTagCategory>, label: "Priority" })
      const captureCreateDoc: MockConfig["captureCreateDoc"] = {}

      const testLayer = createTestLayerWithMocks({
        categories: [existing],
        captureCreateDoc
      })

      const result = yield* createTagCategory({ label: "Priority" }).pipe(Effect.provide(testLayer))

      expect(result.id).toBe("existing-1")
      expect(result.label).toBe("Priority")
      expect(result.created).toBe(false)
      expect(captureCreateDoc.attributes).toBeUndefined()
    }))

  it.effect("creates with default flag", () =>
    Effect.gen(function*() {
      const captureCreateDoc: MockConfig["captureCreateDoc"] = {}

      const testLayer = createTestLayerWithMocks({
        categories: [],
        captureCreateDoc
      })

      const result = yield* createTagCategory({ label: "Main", default: true }).pipe(Effect.provide(testLayer))

      expect(result.created).toBe(true)
      expect(captureCreateDoc.attributes?.default).toBe(true)
    }))

  it.effect("creates with explicit targetClass", () =>
    Effect.gen(function*() {
      const captureCreateDoc: MockConfig["captureCreateDoc"] = {}

      const testLayer = createTestLayerWithMocks({
        categories: [],
        captureCreateDoc
      })

      const result = yield* createTagCategory({
        label: "HR Skills",
        targetClass: "recruit:mixin:Candidate"
      }).pipe(Effect.provide(testLayer))

      expect(result.created).toBe(true)
      expect(captureCreateDoc.attributes?.targetClass).toBe("recruit:mixin:Candidate")
    }))
})

describe("updateTagCategory", () => {
  it.effect("updates label", () =>
    Effect.gen(function*() {
      const cat = makeTagCategory({ label: "Old Name" })
      const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}

      const testLayer = createTestLayerWithMocks({
        categories: [cat],
        captureUpdateDoc
      })

      const result = yield* updateTagCategory({
        category: tagCategoryIdentifier("Old Name"),
        label: "New Name"
      }).pipe(Effect.provide(testLayer))

      expect(result.updated).toBe(true)
      expect(captureUpdateDoc.operations?.label).toBe("New Name")
    }))

  it.effect("updates default flag", () =>
    Effect.gen(function*() {
      const cat = makeTagCategory({ label: "Test" })
      const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}

      const testLayer = createTestLayerWithMocks({
        categories: [cat],
        captureUpdateDoc
      })

      const result = yield* updateTagCategory({
        category: tagCategoryIdentifier("Test"),
        default: true
      }).pipe(Effect.provide(testLayer))

      expect(result.updated).toBe(true)
      expect(captureUpdateDoc.operations?.default).toBe(true)
    }))

  it.effect("returns updated=false when no fields provided", () =>
    Effect.gen(function*() {
      const cat = makeTagCategory({ label: "Test" })

      const testLayer = createTestLayerWithMocks({ categories: [cat] })

      const result = yield* updateTagCategory({
        category: tagCategoryIdentifier("Test")
      }).pipe(Effect.provide(testLayer))

      expect(result.updated).toBe(false)
    }))

  it.effect("returns TagCategoryNotFoundError for nonexistent category", () =>
    Effect.gen(function*() {
      const testLayer = createTestLayerWithMocks({ categories: [] })

      const error = yield* Effect.flip(
        updateTagCategory({
          category: tagCategoryIdentifier("nonexistent"),
          label: "new"
        }).pipe(Effect.provide(testLayer))
      )

      expect(error._tag).toBe("TagCategoryNotFoundError")
      expect((error as TagCategoryNotFoundError).identifier).toBe("nonexistent")
    }))
})

describe("deleteTagCategory", () => {
  it.effect("deletes category by label", () =>
    Effect.gen(function*() {
      const cat = makeTagCategory({ _id: "c-1" as Ref<HulyTagCategory>, label: "to-delete" })
      const captureRemoveDoc: MockConfig["captureRemoveDoc"] = {}

      const testLayer = createTestLayerWithMocks({
        categories: [cat],
        captureRemoveDoc
      })

      const result = yield* deleteTagCategory({
        category: tagCategoryIdentifier("to-delete")
      }).pipe(Effect.provide(testLayer))

      expect(result.id).toBe("c-1")
      expect(result.deleted).toBe(true)
      expect(captureRemoveDoc.called).toBe(true)
    }))

  it.effect("deletes category by ID", () =>
    Effect.gen(function*() {
      const cat = makeTagCategory({ _id: "cat-abc" as Ref<HulyTagCategory>, label: "my-cat" })
      const captureRemoveDoc: MockConfig["captureRemoveDoc"] = {}

      const testLayer = createTestLayerWithMocks({
        categories: [cat],
        captureRemoveDoc
      })

      const result = yield* deleteTagCategory({
        category: tagCategoryIdentifier("cat-abc")
      }).pipe(Effect.provide(testLayer))

      expect(result.id).toBe("cat-abc")
      expect(result.deleted).toBe(true)
      expect(captureRemoveDoc.called).toBe(true)
    }))

  it.effect("returns TagCategoryNotFoundError for nonexistent category", () =>
    Effect.gen(function*() {
      const testLayer = createTestLayerWithMocks({ categories: [] })

      const error = yield* Effect.flip(
        deleteTagCategory({
          category: tagCategoryIdentifier("nonexistent")
        }).pipe(Effect.provide(testLayer))
      )

      expect(error._tag).toBe("TagCategoryNotFoundError")
    }))
})
