import { describe, it } from "@effect/vitest"
import {
  type AttachedDoc,
  type Class,
  type Doc,
  type FindOptions,
  type PersonId,
  type Ref,
  SortingOrder,
  type Space,
  toFindResult
} from "@hcengineering/core"
import type {
  Category as HulyInventoryCategory,
  Product as HulyInventoryProduct,
  Variant as HulyInventoryVariant
} from "@hcengineering/inventory"
import { Effect } from "effect"
import { expect } from "vitest"
import { assertAt } from "../../utils/assertions.js"

import {
  parseCreateInventoryCategoryParams,
  parseUpdateInventoryCategoryParams,
  parseUpdateInventoryProductParams,
  parseUpdateInventoryVariantParams
} from "../../domain/schemas/inventory.js"
import type {
  InventoryCategoryIdentifier,
  InventoryProductIdentifier,
  InventoryVariantIdentifier
} from "../../domain/schemas/shared.js"
import { HulyClient, type HulyClientOperations } from "../client.js"
import {
  InventoryCategoryIdentifierAmbiguousError,
  InventoryConflictError,
  InventoryMutationUnsupportedError,
  InventoryNotEmptyError,
  InventoryProductIdentifierAmbiguousError,
  InventoryProductNotFoundError,
  InventoryVariantIdentifierAmbiguousError,
  InventoryVariantNotFoundError
} from "../errors.js"
import { inventory } from "../huly-plugins.js"
import { findAllCategories, findAllProducts, findAllVariants } from "./inventory-shared.js"
import {
  createInventoryCategory,
  createInventoryProduct,
  createInventoryVariant,
  deleteInventoryCategory,
  deleteInventoryProduct,
  deleteInventoryVariant,
  getInventoryCategory,
  getInventoryProduct,
  getInventoryVariant,
  listInventoryCategories,
  listInventoryProducts,
  listInventoryVariants,
  updateInventoryCategory,
  updateInventoryProduct,
  updateInventoryVariant
} from "./inventory.js"

const workspace = "core:space:Workspace" as Ref<Space>
const person = "person-1" as PersonId

interface AddCall {
  readonly class: string
  readonly attachedTo: string
  readonly attachedToClass: string
  readonly collection: string
  readonly attributes: Readonly<Record<string, unknown>>
}

interface RemoveCall {
  readonly class: string
  readonly objectId: string
  readonly attachedTo: string
  readonly collection: string
}

interface UpdateCollectionCall {
  readonly class: string
  readonly objectId: string
  readonly attachedTo: string
  readonly attachedToClass: string
  readonly collection: string
  readonly operations: Readonly<Record<string, unknown>>
}

interface Store {
  readonly categories: Array<HulyInventoryCategory>
  readonly products: Array<HulyInventoryProduct>
  readonly variants: Array<HulyInventoryVariant>
  readonly addCalls: Array<AddCall>
  readonly updateCollectionCalls: Array<UpdateCollectionCall>
  readonly removeCalls: Array<RemoveCall>
}

const ref = <T extends Doc>(id: string): Ref<T> => id as Ref<T>
const catIdent = (id: string): InventoryCategoryIdentifier => id as InventoryCategoryIdentifier
const prodIdent = (id: string): InventoryProductIdentifier => id as InventoryProductIdentifier
const variantIdent = (id: string): InventoryVariantIdentifier => id as InventoryVariantIdentifier

const baseDoc = {
  space: workspace,
  modifiedBy: person,
  modifiedOn: 1,
  createdBy: person,
  createdOn: 1
}

const category = (
  id: string,
  name: string,
  attachedTo: Ref<HulyInventoryCategory> = inventory.global.Category
): HulyInventoryCategory => ({
  ...baseDoc,
  _id: ref<HulyInventoryCategory>(id),
  _class: inventory.class.Category,
  attachedTo,
  attachedToClass: inventory.class.Category,
  collection: "categories",
  name
})

const product = (
  id: string,
  name: string,
  attachedTo: Ref<HulyInventoryCategory>,
  counts?: Partial<Pick<HulyInventoryProduct, "attachments" | "photos" | "variants">>
): HulyInventoryProduct => ({
  ...baseDoc,
  _id: ref<HulyInventoryProduct>(id),
  _class: inventory.class.Product,
  attachedTo,
  attachedToClass: inventory.class.Category,
  collection: "products",
  name,
  attachments: counts?.attachments ?? 0,
  photos: counts?.photos ?? 0,
  variants: counts?.variants ?? 0
})

const productWithoutCounts = (
  id: string,
  name: string,
  attachedTo: Ref<HulyInventoryCategory>
): HulyInventoryProduct => ({
  ...baseDoc,
  _id: ref<HulyInventoryProduct>(id),
  _class: inventory.class.Product,
  attachedTo,
  attachedToClass: inventory.class.Category,
  collection: "products",
  name
})

const productWithVariantCountOnly = (
  id: string,
  name: string,
  attachedTo: Ref<HulyInventoryCategory>
): HulyInventoryProduct => ({
  ...productWithoutCounts(id, name, attachedTo),
  variants: 1
})

const variant = (
  id: string,
  name: string,
  sku: string,
  attachedTo: Ref<HulyInventoryProduct>
): HulyInventoryVariant => ({
  ...baseDoc,
  _id: ref<HulyInventoryVariant>(id),
  _class: inventory.class.Variant,
  attachedTo,
  attachedToClass: inventory.class.Product,
  collection: "variants",
  name,
  sku
})

const matches = (doc: object, query: Record<string, unknown>): boolean => {
  const record = doc as Record<string, unknown>
  return Object.entries(query).every(([key, value]) => record[key] === value)
}

const updateArray = <T extends Doc>(
  docs: Array<T>,
  id: Ref<T>,
  operations: Record<string, unknown>
): void => {
  const index = docs.findIndex((doc) => doc._id === id)
  if (index >= 0) {
    Object.assign(assertAt(docs, index), operations)
  }
}

const removeFromArray = <T extends Doc>(docs: Array<T>, id: Ref<T>): void => {
  const index = docs.findIndex((doc) => doc._id === id)
  if (index >= 0) docs.splice(index, 1)
}

const createStore = (): Store => {
  const electronics = category("cat-electronics", "Electronics")
  const clothing = category("cat-clothing", "Clothing")
  const phones = category("cat-phones", "Phones", electronics._id)
  const camera = product("prod-camera", "Camera", electronics._id)
  const shirt = product("prod-shirt", "Camera", clothing._id)
  const cameraBlack = variant("var-black", "Black", "CAM-BLK", camera._id)
  const cameraSilver = variant("var-silver", "Silver", "CAM-SLV", camera._id)
  return {
    categories: [electronics, clothing, phones],
    products: [camera, shirt],
    variants: [cameraBlack, cameraSilver],
    addCalls: [],
    updateCollectionCalls: [],
    removeCalls: []
  }
}

const createLayer = (store: Store, includeRemoveCollection = true, includeUpdateCollection = true) => {
  const applyFindOptions = <T extends Doc & { readonly name?: string }>(
    docs: ReadonlyArray<T>,
    options: FindOptions<T> | undefined
  ): ReadonlyArray<T> => {
    const sorted = options?.sort?.name === SortingOrder.Ascending
      ? [...docs].sort((left, right) => (left.name ?? "").localeCompare(right.name ?? ""))
      : [...docs]
    return options?.limit === undefined ? sorted : sorted.slice(0, options.limit)
  }

  const findAll: HulyClientOperations["findAll"] = ((
    _class: Ref<Class<Doc>>,
    query: Record<string, unknown>,
    options?: FindOptions<Doc & { readonly name?: string }>
  ) => {
    const source: ReadonlyArray<Doc & { readonly name?: string }> = _class === inventory.class.Category
      ? store.categories
      : _class === inventory.class.Product
      ? store.products
      : _class === inventory.class.Variant
      ? store.variants
      : []
    return Effect.succeed(toFindResult([...applyFindOptions(source.filter((doc) => matches(doc, query)), options)]))
  }) as HulyClientOperations["findAll"]

  const findOne: HulyClientOperations["findOne"] =
    ((_class: Ref<Class<Doc>>, query: Record<string, unknown>) =>
      Effect.map(findAll(_class, query), (results) => results.at(0))) as HulyClientOperations["findOne"]

  const addCollection: HulyClientOperations["addCollection"] = ((
    _class: Ref<Class<AttachedDoc>>,
    _space: Ref<Space>,
    attachedTo: Ref<Doc>,
    attachedToClass: Ref<Class<Doc>>,
    collection: string,
    attributes: Record<string, unknown>,
    id?: Ref<AttachedDoc>
  ) => {
    store.addCalls.push({
      class: String(_class),
      attachedTo: String(attachedTo),
      attachedToClass: String(attachedToClass),
      collection,
      attributes
    })
    const newId = String(id ?? `${collection}-${store.addCalls.length}`)
    if (_class === inventory.class.Category) {
      store.categories.push(category(newId, String(attributes.name), attachedTo as Ref<HulyInventoryCategory>))
    } else if (_class === inventory.class.Product) {
      store.products.push(product(newId, String(attributes.name), attachedTo as Ref<HulyInventoryCategory>))
    } else if (_class === inventory.class.Variant) {
      store.variants.push(
        variant(newId, String(attributes.name), String(attributes.sku), attachedTo as Ref<HulyInventoryProduct>)
      )
    }
    return Effect.succeed(ref<AttachedDoc>(newId))
  }) as HulyClientOperations["addCollection"]

  const updateDoc: HulyClientOperations["updateDoc"] = ((
    _class: Ref<Class<Doc>>,
    _space: Ref<Space>,
    objectId: Ref<Doc>,
    operations: Record<string, unknown>
  ) => {
    if (_class === inventory.class.Category) {
      updateArray(store.categories, objectId as Ref<HulyInventoryCategory>, operations)
    } else if (_class === inventory.class.Product) {
      updateArray(store.products, objectId as Ref<HulyInventoryProduct>, operations)
    } else if (_class === inventory.class.Variant) {
      updateArray(store.variants, objectId as Ref<HulyInventoryVariant>, operations)
    }
    return Effect.succeed({} as never)
  }) as HulyClientOperations["updateDoc"]

  const updateCollection: NonNullable<HulyClientOperations["updateCollection"]> = ((
    _class: Ref<Class<AttachedDoc>>,
    _space: Ref<Space>,
    objectId: Ref<AttachedDoc>,
    attachedTo: Ref<Doc>,
    attachedToClass: Ref<Class<Doc>>,
    collection: string,
    operations: Record<string, unknown>
  ) => {
    store.updateCollectionCalls.push({
      class: String(_class),
      objectId: String(objectId),
      attachedTo: String(attachedTo),
      attachedToClass: String(attachedToClass),
      collection,
      operations
    })
    if (_class === inventory.class.Category) {
      updateArray(store.categories, objectId as Ref<HulyInventoryCategory>, operations)
    } else if (_class === inventory.class.Product) {
      updateArray(store.products, objectId as Ref<HulyInventoryProduct>, operations)
    } else if (_class === inventory.class.Variant) {
      updateArray(store.variants, objectId as Ref<HulyInventoryVariant>, operations)
    }
    return Effect.succeed(attachedTo)
  }) as NonNullable<HulyClientOperations["updateCollection"]>

  const removeCollection: NonNullable<HulyClientOperations["removeCollection"]> = ((
    _class: Ref<Class<AttachedDoc>>,
    _space: Ref<Space>,
    objectId: Ref<AttachedDoc>,
    attachedTo: Ref<Doc>,
    _attachedToClass: Ref<Class<Doc>>,
    collection: string
  ) => {
    store.removeCalls.push({
      class: String(_class),
      objectId: String(objectId),
      attachedTo: String(attachedTo),
      collection
    })
    if (_class === inventory.class.Category) removeFromArray(store.categories, objectId as Ref<HulyInventoryCategory>)
    if (_class === inventory.class.Product) removeFromArray(store.products, objectId as Ref<HulyInventoryProduct>)
    if (_class === inventory.class.Variant) removeFromArray(store.variants, objectId as Ref<HulyInventoryVariant>)
    return Effect.succeed(attachedTo)
  }) as NonNullable<HulyClientOperations["removeCollection"]>

  if (includeRemoveCollection && includeUpdateCollection) {
    return HulyClient.testLayer({ findAll, findOne, addCollection, updateDoc, updateCollection, removeCollection })
  }
  if (includeRemoveCollection) {
    return HulyClient.testLayer({ findAll, findOne, addCollection, updateDoc, removeCollection })
  }
  if (includeUpdateCollection) {
    return HulyClient.testLayer({ findAll, findOne, addCollection, updateDoc, updateCollection })
  }
  return HulyClient.testLayer({ findAll, findOne, addCollection, updateDoc })
}

describe("inventory schemas", () => {
  it.effect("trims names and rejects no-op updates", () =>
    Effect.gen(function*() {
      const create = yield* parseCreateInventoryCategoryParams({ name: "  Hardware  " })
      expect(create.name).toBe("Hardware")

      const categoryUpdate = yield* parseUpdateInventoryCategoryParams({
        category: catIdent("cat-electronics"),
        name: "Audio"
      })
      expect(categoryUpdate.name).toBe("Audio")

      const variantUpdate = yield* parseUpdateInventoryVariantParams({
        variant: variantIdent("var-black"),
        sku: "CAM-BLK-2"
      })
      expect(variantUpdate.sku).toBe("CAM-BLK-2")

      const productUpdate = yield* parseUpdateInventoryProductParams({
        product: prodIdent("prod-camera"),
        newCategory: catIdent("cat-clothing")
      })
      expect(productUpdate.newCategory).toBe("cat-clothing")

      const categoryFailed = yield* Effect.exit(
        parseUpdateInventoryCategoryParams({ category: catIdent("cat-electronics") })
      )
      expect(categoryFailed._tag).toBe("Failure")

      const variantFailed = yield* Effect.exit(
        parseUpdateInventoryVariantParams({ variant: variantIdent("var-black") })
      )
      expect(variantFailed._tag).toBe("Failure")

      const failed = yield* Effect.exit(parseUpdateInventoryProductParams({ product: prodIdent("prod-camera") }))
      expect(failed._tag).toBe("Failure")
    }))
})

describe("inventory operations", () => {
  it.effect("lists, gets, creates, updates, and deletes categories", () =>
    Effect.gen(function*() {
      const store = createStore()
      const layer = createLayer(store)

      const unscoped = yield* listInventoryCategories({ query: "o" }).pipe(Effect.provide(layer))
      expect(unscoped.total).toBe(3)

      const limited = yield* listInventoryCategories({ limit: 1 }).pipe(Effect.provide(layer))
      expect(limited.categories).toHaveLength(1)

      const helperCounts = yield* Effect.gen(function*() {
        const client = yield* HulyClient
        const categories = yield* findAllCategories(client, {}, 1)
        const products = yield* findAllProducts(client, {}, 1)
        const variants = yield* findAllVariants(client, {}, 1)
        return [categories.length, products.length, variants.length]
      }).pipe(Effect.provide(layer))
      expect(helperCounts).toEqual([1, 1, 1])

      const rootCategories = yield* listInventoryCategories({ parentCategory: catIdent("root") }).pipe(
        Effect.provide(layer)
      )
      expect(rootCategories.categories.map((c) => c.name)).toEqual(["Clothing", "Electronics"])

      const byId = yield* getInventoryCategory({ category: catIdent("cat-electronics") }).pipe(Effect.provide(layer))
      expect(byId.name).toBe("Electronics")

      const detail = yield* getInventoryCategory({
        category: catIdent("Phones"),
        parentCategory: catIdent("Electronics")
      }).pipe(
        Effect.provide(layer)
      )
      expect(detail.parentCategory).toBe("cat-electronics")

      const { createdOn: _createdOn, ...categoryWithoutCreatedOn } = category("cat-no-created", "No Created")
      store.categories.push(categoryWithoutCreatedOn)
      const noCreatedOn = yield* getInventoryCategory({ category: catIdent("No Created") }).pipe(
        Effect.provide(layer)
      )
      expect(noCreatedOn.createdOn).toBeUndefined()
      expect(noCreatedOn.modifiedOn).toBe(1)

      const missing = yield* Effect.flip(
        getInventoryCategory({ category: catIdent("Missing") }).pipe(Effect.provide(layer))
      )
      expect(missing._tag).toBe("InventoryCategoryNotFoundError")

      const rootError = yield* Effect.flip(
        getInventoryCategory({ category: catIdent("root") }).pipe(Effect.provide(layer))
      )
      expect(rootError).toBeInstanceOf(InventoryMutationUnsupportedError)

      const created = yield* createInventoryCategory({ name: "Accessories", parentCategory: catIdent("Electronics") })
        .pipe(
          Effect.provide(layer)
        )
      expect(created.created).toBe(true)
      expect(assertAt(store.addCalls, 0)).toMatchObject({ collection: "categories", attachedTo: "cat-electronics" })

      const updated = yield* updateInventoryCategory({
        category: catIdent("Accessories"),
        parentCategory: catIdent("Electronics"),
        name: "Parts",
        newParentCategory: catIdent("Clothing")
      }).pipe(Effect.provide(layer))
      expect(updated.updated).toBe(true)
      expect(store.updateCollectionCalls.at(-1)).toMatchObject({
        collection: "categories",
        attachedTo: "cat-clothing",
        attachedToClass: inventory.class.Category
      })
      expect(store.categories.find((c) => c.name === "Parts")?.attachedTo).toBe("cat-clothing")

      yield* updateInventoryCategory({
        category: catIdent("Clothing"),
        newParentCategory: catIdent("root")
      }).pipe(Effect.provide(layer))
      expect(store.categories.find((c) => c.name === "Clothing")?.attachedTo).toBe(inventory.global.Category)

      yield* updateInventoryCategory({
        category: catIdent("Parts"),
        parentCategory: catIdent("Clothing"),
        name: "Accessories"
      }).pipe(Effect.provide(layer))
      expect(store.categories.find((c) => c.name === "Accessories")?.attachedTo).toBe("cat-clothing")

      yield* deleteInventoryCategory({ category: catIdent("Accessories"), parentCategory: catIdent("Clothing") }).pipe(
        Effect.provide(layer)
      )
      expect(store.removeCalls.at(-1)).toMatchObject({ collection: "categories" })
    }))

  it.effect("rejects ambiguous, duplicate, descendant, and non-empty category mutations", () =>
    Effect.gen(function*() {
      const store = createStore()
      store.categories.push(category("cat-dup", "Phones", assertAt(store.categories, 1)._id))
      const layer = createLayer(store)

      const ambiguous = yield* Effect.flip(
        getInventoryCategory({ category: catIdent("Phones") }).pipe(Effect.provide(layer))
      )
      expect(ambiguous).toBeInstanceOf(InventoryCategoryIdentifierAmbiguousError)

      const duplicate = yield* Effect.flip(
        createInventoryCategory({ name: "Phones", parentCategory: catIdent("Electronics") }).pipe(Effect.provide(layer))
      )
      expect(duplicate).toBeInstanceOf(InventoryConflictError)

      const descendant = yield* Effect.flip(
        updateInventoryCategory({ category: catIdent("Electronics"), newParentCategory: catIdent("cat-phones") }).pipe(
          Effect.provide(layer)
        )
      )
      expect(descendant).toBeInstanceOf(InventoryMutationUnsupportedError)

      const nonEmpty = yield* Effect.flip(
        deleteInventoryCategory({ category: catIdent("Electronics") }).pipe(Effect.provide(layer))
      )
      expect(nonEmpty).toBeInstanceOf(InventoryNotEmptyError)

      store.categories.push(category("cat-orphan", "Orphan", ref<HulyInventoryCategory>("cat-missing-parent")))
      yield* updateInventoryCategory({ category: catIdent("Clothing"), newParentCategory: catIdent("Orphan") }).pipe(
        Effect.provide(layer)
      )
      expect(store.categories.find((c) => c.name === "Clothing")?.attachedTo).toBe("cat-orphan")
    }))

  it.effect("manages products with category scoping and delete guards", () =>
    Effect.gen(function*() {
      const store = createStore()
      const layer = createLayer(store)

      const unscoped = yield* listInventoryProducts({ query: "cam" }).pipe(Effect.provide(layer))
      expect(unscoped.total).toBe(2)

      const limited = yield* listInventoryProducts({ limit: 1 }).pipe(Effect.provide(layer))
      expect(limited.products).toHaveLength(1)

      const listed = yield* listInventoryProducts({ category: catIdent("Electronics"), query: "cam" }).pipe(
        Effect.provide(layer)
      )
      expect(listed.products).toHaveLength(1)
      expect(
        (yield* getInventoryProduct({ product: prodIdent("Camera"), category: catIdent("Electronics") }).pipe(
          Effect.provide(layer)
        )).id
      )
        .toBe("prod-camera")
      expect((yield* getInventoryProduct({ product: prodIdent("prod-camera") }).pipe(Effect.provide(layer))).name).toBe(
        "Camera"
      )

      const ambiguous = yield* Effect.flip(
        getInventoryProduct({ product: prodIdent("Camera") }).pipe(Effect.provide(layer))
      )
      expect(ambiguous).toBeInstanceOf(InventoryProductIdentifierAmbiguousError)

      const missing = yield* Effect.flip(
        getInventoryProduct({ product: prodIdent("Missing") }).pipe(Effect.provide(layer))
      )
      expect(missing).toBeInstanceOf(InventoryProductNotFoundError)

      const duplicate = yield* Effect.flip(
        createInventoryProduct({ name: "Camera", category: catIdent("Electronics") }).pipe(Effect.provide(layer))
      )
      expect(duplicate).toBeInstanceOf(InventoryConflictError)

      yield* createInventoryProduct({ name: "Tripod", category: catIdent("Electronics") }).pipe(Effect.provide(layer))
      expect(store.addCalls.at(-1)).toMatchObject({ collection: "products", attachedTo: "cat-electronics" })

      yield* updateInventoryProduct({
        product: prodIdent("Tripod"),
        category: catIdent("Electronics"),
        newCategory: catIdent("Clothing")
      }).pipe(
        Effect.provide(layer)
      )
      expect(store.updateCollectionCalls.at(-1)).toMatchObject({
        collection: "products",
        attachedTo: "cat-clothing",
        attachedToClass: inventory.class.Category
      })
      expect(store.products.find((p) => p.name === "Tripod")?.attachedTo).toBe("cat-clothing")

      yield* updateInventoryProduct({
        product: prodIdent("Tripod"),
        category: catIdent("Clothing"),
        name: "Monopod"
      }).pipe(
        Effect.provide(layer)
      )
      expect(store.products.find((p) => p.name === "Monopod")?.attachedTo).toBe("cat-clothing")

      const guarded = yield* Effect.flip(
        deleteInventoryProduct({ product: prodIdent("Camera"), category: catIdent("Electronics") }).pipe(
          Effect.provide(layer)
        )
      )
      expect(guarded).toBeInstanceOf(InventoryNotEmptyError)

      store.products.push(
        productWithVariantCountOnly("prod-counted-variant", "Counted Variant", assertAt(store.categories, 0)._id)
      )
      const countedVariant = yield* Effect.flip(
        deleteInventoryProduct({
          product: prodIdent("Counted Variant"),
          category: catIdent("Electronics")
        }).pipe(Effect.provide(layer))
      )
      expect(countedVariant).toBeInstanceOf(InventoryNotEmptyError)

      store.products.push(product("prod-photo", "Photo Product", assertAt(store.categories, 0)._id, { photos: 1 }))
      const photoGuarded = yield* Effect.flip(
        deleteInventoryProduct({
          product: prodIdent("Photo Product"),
          category: catIdent("Electronics")
        }).pipe(Effect.provide(layer))
      )
      expect(photoGuarded).toBeInstanceOf(InventoryNotEmptyError)

      store.products.push(
        product("prod-attachment", "Attachment Product", assertAt(store.categories, 0)._id, { attachments: 1 })
      )
      const attachmentGuarded = yield* Effect.flip(
        deleteInventoryProduct({
          product: prodIdent("Attachment Product"),
          category: catIdent("Electronics")
        }).pipe(Effect.provide(layer))
      )
      expect(attachmentGuarded).toBeInstanceOf(InventoryNotEmptyError)

      store.products.push(productWithoutCounts("prod-plain", "Plain Product", assertAt(store.categories, 0)._id))
      const plain = yield* getInventoryProduct({
        product: prodIdent("Plain Product"),
        category: catIdent("Electronics")
      }).pipe(Effect.provide(layer))
      expect(plain).toMatchObject({ variants: 0, photos: 0, attachments: 0 })

      const { createdOn: _productCreatedOn, ...productWithoutCreatedOn } = product(
        "prod-no-created",
        "No Created Product",
        assertAt(store.categories, 0)._id
      )
      store.products.push(productWithoutCreatedOn)
      const productDetail = yield* getInventoryProduct({
        product: prodIdent("No Created Product"),
        category: catIdent("Electronics")
      }).pipe(Effect.provide(layer))
      expect(productDetail.createdOn).toBeUndefined()
      expect(productDetail.modifiedOn).toBe(1)

      yield* deleteInventoryProduct({
        product: prodIdent("Plain Product"),
        category: catIdent("Electronics")
      }).pipe(Effect.provide(layer))
      expect(store.products.some((p) => p._id === "prod-plain")).toBe(false)

      yield* deleteInventoryProduct({ product: prodIdent("Monopod"), category: catIdent("Clothing") }).pipe(
        Effect.provide(layer)
      )
      expect(store.removeCalls.at(-1)).toMatchObject({ collection: "products" })
    }))

  it.effect("manages variants by name or SKU", () =>
    Effect.gen(function*() {
      const store = createStore()
      const layer = createLayer(store)

      const unscoped = yield* listInventoryVariants({ query: "CAM" }).pipe(Effect.provide(layer))
      expect(unscoped.total).toBe(2)

      const limited = yield* listInventoryVariants({ limit: 1 }).pipe(Effect.provide(layer))
      expect(limited.variants).toHaveLength(1)

      const listed = yield* listInventoryVariants({
        product: prodIdent("Camera"),
        category: catIdent("Electronics"),
        query: "CAM"
      }).pipe(
        Effect.provide(layer)
      )
      expect(listed.variants).toHaveLength(2)
      expect((yield* getInventoryVariant({ variant: variantIdent("CAM-BLK") }).pipe(Effect.provide(layer))).name).toBe(
        "Black"
      )
      expect((yield* getInventoryVariant({ variant: variantIdent("var-black") }).pipe(Effect.provide(layer))).sku).toBe(
        "CAM-BLK"
      )

      const missing = yield* Effect.flip(
        getInventoryVariant({ variant: variantIdent("Missing") }).pipe(Effect.provide(layer))
      )
      expect(missing).toBeInstanceOf(InventoryVariantNotFoundError)

      store.variants.push(variant("var-other", "Black", "OTHER-BLK", assertAt(store.products, 1)._id))
      const ambiguous = yield* Effect.flip(
        getInventoryVariant({ variant: variantIdent("Black") }).pipe(Effect.provide(layer))
      )
      expect(ambiguous).toBeInstanceOf(InventoryVariantIdentifierAmbiguousError)

      const duplicate = yield* Effect.flip(
        createInventoryVariant({
          product: prodIdent("Camera"),
          category: catIdent("Electronics"),
          name: "Black",
          sku: "CAM-BLK-2"
        }).pipe(
          Effect.provide(layer)
        )
      )
      expect(duplicate).toBeInstanceOf(InventoryConflictError)

      const duplicateSku = yield* Effect.flip(
        createInventoryVariant({
          product: prodIdent("Camera"),
          category: catIdent("Electronics"),
          name: "Graphite",
          sku: "CAM-BLK"
        }).pipe(
          Effect.provide(layer)
        )
      )
      expect(duplicateSku).toBeInstanceOf(InventoryConflictError)

      yield* createInventoryVariant({
        product: prodIdent("Camera"),
        category: catIdent("Electronics"),
        name: "Blue",
        sku: "CAM-BLU"
      }).pipe(
        Effect.provide(layer)
      )
      expect(store.addCalls.at(-1)).toMatchObject({ collection: "variants", attachedTo: "prod-camera" })

      yield* updateInventoryVariant({
        variant: variantIdent("CAM-BLU"),
        product: prodIdent("Camera"),
        category: catIdent("Electronics"),
        sku: "CAM-NAVY"
      })
        .pipe(Effect.provide(layer))
      expect(store.variants.find((v) => v.name === "Blue")?.sku).toBe("CAM-NAVY")

      yield* updateInventoryVariant({
        variant: variantIdent("CAM-NAVY"),
        product: prodIdent("Camera"),
        category: catIdent("Electronics"),
        name: "Navy"
      })
        .pipe(Effect.provide(layer))
      expect(store.variants.find((v) => v.name === "Navy")?.sku).toBe("CAM-NAVY")

      const { createdOn: _variantCreatedOn, ...variantWithoutCreatedOn } = variant(
        "var-no-created",
        "No Created Variant",
        "CAM-NC",
        assertAt(store.products, 0)._id
      )
      store.variants.push(variantWithoutCreatedOn)
      const variantDetail = yield* getInventoryVariant({
        variant: variantIdent("CAM-NC"),
        product: prodIdent("Camera"),
        category: catIdent("Electronics")
      }).pipe(Effect.provide(layer))
      expect(variantDetail.createdOn).toBeUndefined()
      expect(variantDetail.modifiedOn).toBe(1)

      yield* deleteInventoryVariant({
        variant: variantIdent("Navy"),
        product: prodIdent("Camera"),
        category: catIdent("Electronics")
      }).pipe(
        Effect.provide(layer)
      )
      expect(store.removeCalls.at(-1)).toMatchObject({ collection: "variants" })
    }))

  it.effect("reports unsupported removeCollection", () =>
    Effect.gen(function*() {
      const store = createStore()
      const layer = createLayer(store, false)
      yield* createInventoryCategory({ name: "Empty" }).pipe(Effect.provide(layer))
      const error = yield* Effect.flip(
        deleteInventoryCategory({ category: catIdent("Empty") }).pipe(Effect.provide(layer))
      )
      expect(error).toBeInstanceOf(InventoryMutationUnsupportedError)

      const productError = yield* Effect.flip(
        deleteInventoryProduct({ product: prodIdent("Camera"), category: catIdent("Clothing") }).pipe(
          Effect.provide(layer)
        )
      )
      expect(productError).toBeInstanceOf(InventoryMutationUnsupportedError)

      const variantError = yield* Effect.flip(
        deleteInventoryVariant({
          variant: variantIdent("CAM-BLK"),
          product: prodIdent("Camera"),
          category: catIdent("Electronics")
        }).pipe(Effect.provide(layer))
      )
      expect(variantError).toBeInstanceOf(InventoryMutationUnsupportedError)
    }))

  it.effect("reports unsupported updateCollection for moves", () =>
    Effect.gen(function*() {
      const store = createStore()
      yield* createInventoryProduct({ name: "Tripod", category: catIdent("Electronics") }).pipe(
        Effect.provide(createLayer(store))
      )

      const layer = createLayer(store, true, false)
      const categoryError = yield* Effect.flip(
        updateInventoryCategory({ category: catIdent("Clothing"), newParentCategory: catIdent("Electronics") }).pipe(
          Effect.provide(layer)
        )
      )
      expect(categoryError).toBeInstanceOf(InventoryMutationUnsupportedError)

      const productError = yield* Effect.flip(
        updateInventoryProduct({
          product: prodIdent("Tripod"),
          category: catIdent("Electronics"),
          newCategory: catIdent("Clothing")
        }).pipe(Effect.provide(layer))
      )
      expect(productError).toBeInstanceOf(InventoryMutationUnsupportedError)
    }))
})
