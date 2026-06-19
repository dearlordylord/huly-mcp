import { describe, it } from "@effect/vitest"
import {
  type AttachedData,
  type Class,
  type Doc,
  type PersonId,
  type Ref,
  type Space,
  toFindResult
} from "@hcengineering/core"
import type { Asset } from "@hcengineering/platform"
import type { TagCategory as HulyTagCategory, TagElement as HulyTagElement, TagReference } from "@hcengineering/tags"
import { Effect } from "effect"
import { expect } from "vitest"
import { assertAt } from "../../../src/utils/assertions.js"

import { MAX_COLOR_INDEX } from "../../../src/domain/schemas/shared.js"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import { tags, tracker } from "../../../src/huly/huly-plugins.js"
import { toRef } from "../../../src/huly/operations/sdk-boundary.js"
import { normalizeColorCode } from "../../../src/huly/operations/tags-shared.js"
import {
  attachTag,
  createTag,
  deleteTag,
  detachTag,
  listAttachedTags,
  listTags,
  updateTag
} from "../../../src/huly/operations/tags.js"
import {
  colorCode,
  docId,
  objectClassName,
  spaceBrandId,
  tagCategoryIdentifier,
  tagIdentifier
} from "../../helpers/brands.js"

const USER = "user-1" as PersonId
const WORKSPACE_SPACE = "core:space:Workspace" as Ref<Space>
const TARGET_CLASS = objectClassName("tracker:class:Issue")

describe("normalizeColorCode", () => {
  it("normalizes non-finite colors to zero", () => {
    expect(normalizeColorCode(Infinity)).toBe(0)
  })

  it("clamps colors to the Huly palette range", () => {
    expect(normalizeColorCode(MAX_COLOR_INDEX + 1)).toBe(MAX_COLOR_INDEX)
  })
})

const makeTagElement = (overrides?: Partial<HulyTagElement>): HulyTagElement => ({
  _id: toRef<HulyTagElement>("tag-1"),
  _class: tags.class.TagElement,
  space: WORKSPACE_SPACE,
  title: "bug",
  description: "",
  targetClass: tracker.class.Issue,
  color: 1,
  category: tracker.category.Other,
  modifiedBy: USER,
  modifiedOn: 0,
  createdBy: USER,
  createdOn: 0,
  ...overrides
})

const makeTagCategory = (overrides?: Partial<HulyTagCategory>): HulyTagCategory => ({
  _id: toRef<HulyTagCategory>("cat-1"),
  _class: tags.class.TagCategory,
  space: WORKSPACE_SPACE,
  icon: "" as Asset,
  label: "General",
  targetClass: tracker.class.Issue,
  tags: [],
  default: false,
  modifiedBy: USER,
  modifiedOn: 0,
  createdBy: USER,
  createdOn: 0,
  ...overrides
})

const makeTagReference = (overrides?: Partial<TagReference>): TagReference => ({
  _id: toRef<TagReference>("tagref-1"),
  _class: tags.class.TagReference,
  space: toRef<Space>("project-1"),
  attachedTo: toRef<Doc>("issue-1"),
  attachedToClass: tracker.class.Issue,
  collection: "labels",
  title: "bug",
  color: 1,
  tag: toRef<HulyTagElement>("tag-1"),
  modifiedBy: USER,
  modifiedOn: 0,
  createdBy: USER,
  createdOn: 0,
  ...overrides
})

interface CreateDocCall {
  readonly classId: string
  readonly attributes: unknown
  readonly id: unknown
}

interface UpdateDocCall {
  readonly classId: string
  readonly space: unknown
  readonly objectId: unknown
  readonly operations: unknown
}

interface AddCollectionCall {
  readonly classId: string
  readonly space: unknown
  readonly attachedTo: unknown
  readonly attachedToClass: unknown
  readonly collection: string
  readonly attributes: unknown
}

interface RemoveDocCall {
  readonly classId: string
  readonly space: unknown
  readonly objectId: unknown
}

interface Captures {
  readonly createDocs: Array<CreateDocCall>
  readonly updateDocs: Array<UpdateDocCall>
  readonly addCollections: Array<AddCollectionCall>
  readonly removeDocs: Array<RemoveDocCall>
}

interface FixtureConfig {
  readonly tagElements?: ReadonlyArray<HulyTagElement>
  readonly tagCategories?: ReadonlyArray<HulyTagCategory>
  readonly tagReferences?: ReadonlyArray<TagReference>
  readonly captures?: Captures
}

const createFixtureLayer = (config: FixtureConfig) => {
  const tagElements = config.tagElements ?? []
  const tagCategories = config.tagCategories ?? []
  const tagReferences = config.tagReferences ?? []

  const findAllImpl: HulyClientOperations["findAll"] = ((_class: unknown, query: unknown) => {
    const q = query as Record<string, unknown>
    if (_class === tags.class.TagElement) {
      const titleLike = (q.title as { readonly $like?: string } | undefined)?.$like
      const titleNeedle = titleLike === undefined ? undefined : titleLike.replace(/^%|%$/g, "")
      const filtered = tagElements.filter((tag) =>
        (!q.targetClass || tag.targetClass === q.targetClass)
        && (!q.category || tag.category === q.category)
        && (titleNeedle === undefined || tag.title.includes(titleNeedle))
      )
      return Effect.succeed(toFindResult(filtered))
    }
    if (_class === tags.class.TagReference) {
      const filtered = tagReferences.filter((tagRef) =>
        (!q.attachedTo || tagRef.attachedTo === q.attachedTo)
        && (!q.attachedToClass || tagRef.attachedToClass === q.attachedToClass)
        && (!q.collection || tagRef.collection === q.collection)
      )
      return Effect.succeed(toFindResult(filtered))
    }
    return Effect.succeed(toFindResult([]))
  }) as HulyClientOperations["findAll"]

  const findOneImpl: HulyClientOperations["findOne"] = ((_class: unknown, query: unknown) => {
    const q = query as Record<string, unknown>
    if (_class === tags.class.TagElement) {
      const found = tagElements.find((tag) =>
        (!q.targetClass || tag.targetClass === q.targetClass)
        && ((q._id && tag._id === q._id) || (q.title && tag.title === q.title))
      )
      return Effect.succeed(found)
    }
    if (_class === tags.class.TagCategory) {
      const found = tagCategories.find((category) =>
        (!q.targetClass || category.targetClass === q.targetClass)
        && (
          (q._id && category._id === q._id)
          || (q.label && category.label === q.label)
          || (q.default === true && category.default)
        )
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
    config.captures?.createDocs.push({ classId: String(_class), attributes, id })
    return Effect.succeed(toRef<Doc>(String(id ?? "new-tag-id")))
  }) as HulyClientOperations["createDoc"]

  const updateDocImpl: HulyClientOperations["updateDoc"] = ((
    _class: unknown,
    space: unknown,
    objectId: unknown,
    operations: unknown
  ) => {
    config.captures?.updateDocs.push({ classId: String(_class), space, objectId, operations })
    return Effect.succeed({})
  }) as HulyClientOperations["updateDoc"]

  const addCollectionImpl: HulyClientOperations["addCollection"] = ((
    _class: unknown,
    space: unknown,
    attachedTo: unknown,
    attachedToClass: unknown,
    collection: string,
    attributes: AttachedData<TagReference>
  ) => {
    config.captures?.addCollections.push({
      classId: String(_class),
      space,
      attachedTo,
      attachedToClass,
      collection,
      attributes
    })
    return Effect.succeed(toRef<TagReference>("new-tagref-id"))
  }) as HulyClientOperations["addCollection"]

  const removeDocImpl: HulyClientOperations["removeDoc"] = ((
    _class: unknown,
    space: unknown,
    objectId: unknown
  ) => {
    config.captures?.removeDocs.push({ classId: String(_class), space, objectId })
    return Effect.succeed({})
  }) as HulyClientOperations["removeDoc"]

  return HulyClient.testLayer({
    addCollection: addCollectionImpl,
    createDoc: createDocImpl,
    findAll: findAllImpl,
    findOne: findOneImpl,
    removeDoc: removeDocImpl,
    updateDoc: updateDocImpl
  })
}

const emptyCaptures = (): Captures => ({
  addCollections: [],
  createDocs: [],
  removeDocs: [],
  updateDocs: []
})

describe("listTags", () => {
  it.effect("lists tag definitions for the requested target class", () =>
    Effect.gen(function*() {
      const tagsForIssues = [
        makeTagElement({ _id: toRef<HulyTagElement>("tag-bug"), title: "bug", refCount: 3 }),
        makeTagElement({ _id: toRef<HulyTagElement>("tag-feature"), title: "feature", color: 2 })
      ]
      const testLayer = createFixtureLayer({
        tagElements: [
          ...tagsForIssues,
          makeTagElement({
            _id: toRef<HulyTagElement>("tag-skill"),
            title: "typescript",
            targetClass: toRef<Class<Doc>>("recruit:mixin:Candidate")
          })
        ]
      })

      const result = yield* listTags({ targetClass: TARGET_CLASS }).pipe(Effect.provide(testLayer))

      expect(result.map((tag) => tag.title)).toEqual(["bug", "feature"])
      expect(assertAt(result, 0).refCount).toBe(3)
    }))

  it.effect("resolves category labels before listing", () =>
    Effect.gen(function*() {
      const category = makeTagCategory({ _id: toRef<HulyTagCategory>("cat-priority"), label: "Priority" })
      const testLayer = createFixtureLayer({
        tagCategories: [category],
        tagElements: [
          makeTagElement({ _id: toRef<HulyTagElement>("tag-p0"), title: "p0", category: category._id }),
          makeTagElement({ _id: toRef<HulyTagElement>("tag-bug"), title: "bug" })
        ]
      })

      const result = yield* listTags({
        targetClass: TARGET_CLASS,
        category: tagCategoryIdentifier("Priority")
      }).pipe(Effect.provide(testLayer))

      expect(result.map((tag) => tag.title)).toEqual(["p0"])
    }))

  it.effect("filters by a title substring when titleSearch is provided", () =>
    Effect.gen(function*() {
      const testLayer = createFixtureLayer({
        tagElements: [
          makeTagElement({ _id: toRef<HulyTagElement>("tag-bug"), title: "bug" }),
          makeTagElement({ _id: toRef<HulyTagElement>("tag-debug"), title: "debug-helper" }),
          makeTagElement({ _id: toRef<HulyTagElement>("tag-feature"), title: "feature" })
        ]
      })

      const result = yield* listTags({
        targetClass: TARGET_CLASS,
        titleSearch: "bug"
      }).pipe(Effect.provide(testLayer))

      expect(result.map((tag) => tag.title).sort()).toEqual(["bug", "debug-helper"])
    }))
})

describe("createTag", () => {
  it.effect("returns an existing tag definition without creating a duplicate", () =>
    Effect.gen(function*() {
      const captures = emptyCaptures()
      const testLayer = createFixtureLayer({
        captures,
        tagElements: [makeTagElement({ _id: toRef<HulyTagElement>("tag-existing"), title: "bug" })]
      })

      const result = yield* createTag({
        targetClass: TARGET_CLASS,
        title: tagIdentifier("bug")
      }).pipe(Effect.provide(testLayer))

      expect(result).toMatchObject({ id: "tag-existing", title: "bug", created: false })
      expect(captures.createDocs).toEqual([])
    }))

  it.effect("creates a tag definition with the target class default category", () =>
    Effect.gen(function*() {
      const captures = emptyCaptures()
      const defaultCategory = makeTagCategory({
        _id: toRef<HulyTagCategory>("cat-default"),
        default: true
      })
      const testLayer = createFixtureLayer({
        captures,
        tagCategories: [defaultCategory]
      })

      const result = yield* createTag({
        targetClass: TARGET_CLASS,
        title: tagIdentifier("needs-review"),
        color: colorCode(4)
      }).pipe(Effect.provide(testLayer))

      expect(result.created).toBe(true)
      expect(captures.createDocs).toHaveLength(1)
      expect(assertAt(captures.createDocs, 0).attributes).toMatchObject({
        category: "cat-default",
        color: 4,
        targetClass: "tracker:class:Issue",
        title: "needs-review"
      })
    }))
})

describe("updateTag", () => {
  it.effect("updates fields and resolves a category label", () =>
    Effect.gen(function*() {
      const captures = emptyCaptures()
      const category = makeTagCategory({ _id: toRef<HulyTagCategory>("cat-updated"), label: "Updated" })
      const testLayer = createFixtureLayer({
        captures,
        tagCategories: [category],
        tagElements: [makeTagElement({ _id: toRef<HulyTagElement>("tag-1") })]
      })

      const result = yield* updateTag({
        targetClass: TARGET_CLASS,
        tag: tagIdentifier("bug"),
        title: tagIdentifier("defect"),
        color: colorCode(2),
        description: "User-visible defect",
        category: tagCategoryIdentifier("Updated")
      }).pipe(Effect.provide(testLayer))

      expect(result).toEqual({ id: "tag-1", updated: true })
      expect(assertAt(captures.updateDocs, 0).operations).toMatchObject({
        category: "cat-updated",
        color: 2,
        description: "User-visible defect",
        title: "defect"
      })
    }))

  it.effect("clears description when set to null", () =>
    Effect.gen(function*() {
      const captures = emptyCaptures()
      const testLayer = createFixtureLayer({
        captures,
        tagElements: [makeTagElement({ _id: toRef<HulyTagElement>("tag-1"), description: "Old description" })]
      })

      yield* updateTag({
        targetClass: TARGET_CLASS,
        tag: tagIdentifier("bug"),
        description: null
      }).pipe(Effect.provide(testLayer))

      expect(assertAt(captures.updateDocs, 0).operations).toMatchObject({ description: "" })
    }))

  it.effect("fails when a requested category does not exist", () =>
    Effect.gen(function*() {
      const testLayer = createFixtureLayer({
        tagElements: [makeTagElement({ _id: toRef<HulyTagElement>("tag-1") })]
      })

      const exit = yield* updateTag({
        targetClass: TARGET_CLASS,
        tag: tagIdentifier("bug"),
        category: tagCategoryIdentifier("Missing")
      }).pipe(Effect.provide(testLayer), Effect.exit)

      expect(exit._tag).toBe("Failure")
      if (exit._tag === "Failure") {
        expect(exit.cause.toString()).toContain("TagCategoryNotFound")
      }
    }))
})

describe("deleteTag", () => {
  it.effect("deletes a tag definition by title", () =>
    Effect.gen(function*() {
      const captures = emptyCaptures()
      const testLayer = createFixtureLayer({
        captures,
        tagElements: [makeTagElement({ _id: toRef<HulyTagElement>("tag-delete") })]
      })

      const result = yield* deleteTag({
        targetClass: TARGET_CLASS,
        tag: tagIdentifier("bug")
      }).pipe(Effect.provide(testLayer))

      expect(result).toEqual({ id: "tag-delete", deleted: true })
      expect(captures.removeDocs).toEqual([
        { classId: String(tags.class.TagElement), objectId: "tag-delete", space: "core:space:Workspace" }
      ])
    }))
})

describe("attached tag references", () => {
  it.effect("lists references attached to one object collection", () =>
    Effect.gen(function*() {
      const testLayer = createFixtureLayer({
        tagReferences: [
          makeTagReference({ _id: toRef<TagReference>("ref-1"), title: "bug", weight: 6 }),
          makeTagReference({
            _id: toRef<TagReference>("ref-other"),
            attachedTo: toRef<Doc>("other-issue"),
            title: "other"
          })
        ]
      })

      const result = yield* listAttachedTags({
        collection: "labels",
        objectClass: TARGET_CLASS,
        objectId: docId("issue-1"),
        space: spaceBrandId("project-1")
      }).pipe(Effect.provide(testLayer))

      expect(result).toEqual([
        { color: 1, id: "ref-1", tag: "tag-1", title: "bug", weight: 6 }
      ])
    }))

  it.effect("attaches an existing tag idempotently when a reference already exists", () =>
    Effect.gen(function*() {
      const captures = emptyCaptures()
      const tag = makeTagElement({ _id: toRef<HulyTagElement>("tag-1"), title: "bug" })
      const testLayer = createFixtureLayer({
        captures,
        tagElements: [tag],
        tagReferences: [makeTagReference({ tag: tag._id })]
      })

      const result = yield* attachTag({
        object: {
          collection: "labels",
          objectClass: TARGET_CLASS,
          objectId: docId("issue-1"),
          space: spaceBrandId("project-1")
        },
        tag: tagIdentifier("bug"),
        targetClass: TARGET_CLASS
      }).pipe(Effect.provide(testLayer))

      expect(result).toEqual({ attached: false, id: "tagref-1", tag: "tag-1", title: "bug" })
      expect(captures.addCollections).toEqual([])
    }))

  it.effect("creates a missing tag definition and attaches a weighted reference", () =>
    Effect.gen(function*() {
      const captures = emptyCaptures()
      const category = makeTagCategory({
        _id: toRef<HulyTagCategory>("cat-skills"),
        label: "Skills",
        targetClass: toRef<Class<Doc>>("recruit:mixin:Candidate")
      })
      const testLayer = createFixtureLayer({ captures, tagCategories: [category] })

      const result = yield* attachTag({
        category: tagCategoryIdentifier("Skills"),
        color: colorCode(5),
        object: {
          collection: "skills",
          objectClass: objectClassName("recruit:mixin:Candidate"),
          objectId: docId("candidate-1"),
          space: spaceBrandId("recruit-space")
        },
        tag: tagIdentifier("TypeScript"),
        targetClass: objectClassName("recruit:mixin:Candidate"),
        weight: 8
      }).pipe(Effect.provide(testLayer))

      expect(result.attached).toBe(true)
      expect(assertAt(captures.createDocs, 0).attributes).toMatchObject({
        category: "cat-skills",
        color: 5,
        targetClass: "recruit:mixin:Candidate",
        title: "TypeScript"
      })
      expect(assertAt(captures.addCollections, 0)).toMatchObject({
        attachedTo: "candidate-1",
        attachedToClass: "recruit:mixin:Candidate",
        collection: "skills",
        space: "recruit-space"
      })
      expect(assertAt(captures.addCollections, 0).attributes).toMatchObject({
        color: 5,
        title: "TypeScript",
        weight: 8
      })
    }))

  it.effect("detaches all matching references and ignores other tags", () =>
    Effect.gen(function*() {
      const captures = emptyCaptures()
      const tag = makeTagElement({ _id: toRef<HulyTagElement>("tag-1"), title: "bug" })
      const testLayer = createFixtureLayer({
        captures,
        tagElements: [tag],
        tagReferences: [
          makeTagReference({ _id: toRef<TagReference>("ref-1"), tag: tag._id }),
          makeTagReference({ _id: toRef<TagReference>("ref-2"), tag: tag._id }),
          makeTagReference({
            _id: toRef<TagReference>("ref-other"),
            tag: toRef<HulyTagElement>("tag-other"),
            title: "other"
          })
        ]
      })

      const result = yield* detachTag({
        object: {
          collection: "labels",
          objectClass: TARGET_CLASS,
          objectId: docId("issue-1"),
          space: spaceBrandId("project-1")
        },
        tag: tagIdentifier("bug"),
        targetClass: TARGET_CLASS
      }).pipe(Effect.provide(testLayer))

      expect(result).toEqual({ detached: true, detachedCount: 2 })
      expect(captures.removeDocs.map((call) => call.objectId)).toEqual(["ref-1", "ref-2"])
    }))

  it.effect("reports not detached when the tag is valid but not attached", () =>
    Effect.gen(function*() {
      const captures = emptyCaptures()
      const testLayer = createFixtureLayer({
        captures,
        tagElements: [makeTagElement({ _id: toRef<HulyTagElement>("tag-1"), title: "bug" })]
      })

      const result = yield* detachTag({
        object: {
          collection: "labels",
          objectClass: TARGET_CLASS,
          objectId: docId("issue-1"),
          space: spaceBrandId("project-1")
        },
        tag: tagIdentifier("bug"),
        targetClass: TARGET_CLASS
      }).pipe(Effect.provide(testLayer))

      expect(result).toEqual({ detached: false, detachedCount: 0 })
      expect(captures.removeDocs).toEqual([])
    }))

  it.effect("fails attach when the requested category is unknown", () =>
    Effect.gen(function*() {
      const testLayer = createFixtureLayer({})

      const exit = yield* attachTag({
        category: tagCategoryIdentifier("Missing"),
        object: {
          collection: "labels",
          objectClass: TARGET_CLASS,
          objectId: docId("issue-1"),
          space: spaceBrandId("project-1")
        },
        tag: tagIdentifier("bug"),
        targetClass: TARGET_CLASS
      }).pipe(Effect.provide(testLayer), Effect.exit)

      expect(exit._tag).toBe("Failure")
      if (exit._tag === "Failure") {
        expect(exit.cause.toString()).toContain("TagCategoryNotFound")
      }
    }))

  it.effect("fails detach when the tag definition is unknown", () =>
    Effect.gen(function*() {
      const testLayer = createFixtureLayer({})

      const exit = yield* detachTag({
        object: {
          collection: "labels",
          objectClass: TARGET_CLASS,
          objectId: docId("issue-1"),
          space: spaceBrandId("project-1")
        },
        tag: tagIdentifier("missing"),
        targetClass: TARGET_CLASS
      }).pipe(Effect.provide(testLayer), Effect.exit)

      expect(exit._tag).toBe("Failure")
      if (exit._tag === "Failure") {
        expect(exit.cause.toString()).toContain("TagNotFound")
      }
    }))
})
