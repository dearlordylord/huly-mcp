import type { Ref, Space } from "@hcengineering/core"
import { SortingOrder } from "@hcengineering/core"
import type {
  Category as HulyInventoryCategory,
  Product as HulyInventoryProduct,
  Variant as HulyInventoryVariant
} from "@hcengineering/inventory"
import { Effect } from "effect"

import type {
  InventoryCategorySummary,
  InventoryProductDetail,
  InventoryProductSummary,
  InventoryVariantDetail,
  InventoryVariantSummary
} from "../../domain/schemas/inventory.js"
import {
  Count,
  InventoryCategoryId,
  type InventoryCategoryIdentifier,
  InventoryProductId,
  type InventoryProductIdentifier,
  InventoryVariantId,
  type InventoryVariantIdentifier,
  type ListTotal,
  Timestamp
} from "../../domain/schemas/shared.js"
import { isSingle } from "../../utils/assertions.js"
import { type HulyClient, type HulyClientError } from "../client.js"
import type { InventoryNotEmptyError } from "../errors-inventory.js"
import {
  InventoryCategoryIdentifierAmbiguousError,
  InventoryCategoryNotFoundError,
  InventoryConflictError,
  InventoryMutationUnsupportedError,
  InventoryProductIdentifierAmbiguousError,
  InventoryProductNotFoundError,
  InventoryVariantIdentifierAmbiguousError,
  InventoryVariantNotFoundError
} from "../errors-inventory.js"
import type { NoUpdateFieldsError } from "../errors.js"
import { core, inventory } from "../huly-plugins.js"
import { hulyQuery, type StrictDocumentQuery } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"

export type InventoryError =
  | HulyClientError
  | InventoryCategoryNotFoundError
  | InventoryProductNotFoundError
  | InventoryVariantNotFoundError
  | InventoryCategoryIdentifierAmbiguousError
  | InventoryProductIdentifierAmbiguousError
  | InventoryVariantIdentifierAmbiguousError
  | InventoryConflictError
  | InventoryNotEmptyError
  | InventoryMutationUnsupportedError
  | NoUpdateFieldsError

const ROOT_CATEGORY_ALIASES = new Set(["root", String(inventory.global.Category)])

export const CATEGORIES_COLLECTION = "categories"
export const PRODUCTS_COLLECTION = "products"
export const VARIANTS_COLLECTION = "variants"
export const workspace = toRef<Space>(core.space.Workspace)

interface ResolvedCategoryParent {
  readonly id: Ref<HulyInventoryCategory>
}

const isRootCategoryIdentifier = (identifier: string): boolean =>
  ROOT_CATEGORY_ALIASES.has(identifier.trim().toLowerCase())

export const matchesText = (value: string, query: string | undefined): boolean =>
  query === undefined || value.toLowerCase().includes(query.toLowerCase())

export const listTotal = (value: number): ListTotal => Count.make(value)

const count = (value: number | undefined): Count => Count.make(value ?? 0)

export const findAllCategories = (
  client: HulyClient["Type"],
  query: StrictDocumentQuery<HulyInventoryCategory>,
  limit?: number
): Effect.Effect<ReadonlyArray<HulyInventoryCategory>, HulyClientError> =>
  client.findAll<HulyInventoryCategory>(
    inventory.class.Category,
    hulyQuery(query),
    limit === undefined
      ? { sort: { name: SortingOrder.Ascending } }
      : { limit, sort: { name: SortingOrder.Ascending } }
  )

export const findAllProducts = (
  client: HulyClient["Type"],
  query: StrictDocumentQuery<HulyInventoryProduct>,
  limit?: number
): Effect.Effect<ReadonlyArray<HulyInventoryProduct>, HulyClientError> =>
  client.findAll<HulyInventoryProduct>(
    inventory.class.Product,
    hulyQuery(query),
    limit === undefined
      ? { sort: { name: SortingOrder.Ascending } }
      : { limit, sort: { name: SortingOrder.Ascending } }
  )

export const findAllVariants = (
  client: HulyClient["Type"],
  query: StrictDocumentQuery<HulyInventoryVariant>,
  limit?: number
): Effect.Effect<ReadonlyArray<HulyInventoryVariant>, HulyClientError> =>
  client.findAll<HulyInventoryVariant>(
    inventory.class.Variant,
    hulyQuery(query),
    limit === undefined
      ? { sort: { name: SortingOrder.Ascending } }
      : { limit, sort: { name: SortingOrder.Ascending } }
  )

export const categoryCounts = (
  client: HulyClient["Type"],
  category: HulyInventoryCategory
): Effect.Effect<Pick<InventoryCategorySummary, "childCategories" | "products">, HulyClientError> =>
  Effect.gen(function*() {
    const children = yield* findAllCategories(client, { attachedTo: category._id })
    const products = yield* findAllProducts(client, { attachedTo: category._id })
    return {
      childCategories: Count.make(children.length),
      products: Count.make(products.length)
    }
  })

const categoryParentId = (category: HulyInventoryCategory): InventoryCategoryId | undefined =>
  String(category.attachedTo) === String(inventory.global.Category)
    ? undefined
    : InventoryCategoryId.make(category.attachedTo)

export const toCategorySummary = (
  client: HulyClient["Type"],
  category: HulyInventoryCategory
): Effect.Effect<InventoryCategorySummary, HulyClientError> =>
  Effect.gen(function*() {
    const counts = yield* categoryCounts(client, category)
    const summary = {
      id: InventoryCategoryId.make(category._id),
      name: category.name,
      ...counts
    }
    const parentCategory = categoryParentId(category)
    return parentCategory === undefined ? summary : { ...summary, parentCategory }
  })

export const toProductSummary = (product: HulyInventoryProduct): InventoryProductSummary => ({
  id: InventoryProductId.make(product._id),
  name: product.name,
  category: InventoryCategoryId.make(product.attachedTo),
  variants: count(product.variants),
  photos: count(product.photos),
  attachments: count(product.attachments)
})

export const toProductDetail = (product: HulyInventoryProduct): InventoryProductDetail => ({
  ...toProductSummary(product),
  ...(product.createdOn === undefined ? {} : { createdOn: Timestamp.make(product.createdOn) }),
  modifiedOn: Timestamp.make(product.modifiedOn)
})

export const toVariantSummary = (variant: HulyInventoryVariant): InventoryVariantSummary => ({
  id: InventoryVariantId.make(variant._id),
  name: variant.name,
  sku: variant.sku,
  product: InventoryProductId.make(variant.attachedTo)
})

export const toVariantDetail = (variant: HulyInventoryVariant): InventoryVariantDetail => ({
  ...toVariantSummary(variant),
  ...(variant.createdOn === undefined ? {} : { createdOn: Timestamp.make(variant.createdOn) }),
  modifiedOn: Timestamp.make(variant.modifiedOn)
})

export const resolveCategoryParent = (
  client: HulyClient["Type"],
  identifier: InventoryCategoryIdentifier | undefined
): Effect.Effect<ResolvedCategoryParent, InventoryError> =>
  Effect.gen(function*() {
    if (identifier === undefined || isRootCategoryIdentifier(identifier)) {
      return { id: inventory.global.Category }
    }
    const category = yield* resolveCategory(client, identifier, undefined)
    return { id: category._id }
  })

export const resolveCategory = (
  client: HulyClient["Type"],
  identifier: InventoryCategoryIdentifier,
  parentIdentifier: InventoryCategoryIdentifier | undefined
): Effect.Effect<HulyInventoryCategory, InventoryError> =>
  Effect.gen(function*() {
    if (isRootCategoryIdentifier(identifier)) {
      return yield* new InventoryMutationUnsupportedError({
        message: "The Inventory root category is a container and cannot be used as a category record"
      })
    }

    const byId = yield* client.findOne<HulyInventoryCategory>(
      inventory.class.Category,
      hulyQuery<HulyInventoryCategory>({ _id: toRef<HulyInventoryCategory>(identifier) })
    )
    if (byId !== undefined) return byId

    const query: StrictDocumentQuery<HulyInventoryCategory> = parentIdentifier === undefined
      ? { name: identifier }
      : yield* Effect.map(
        resolveCategoryParent(client, parentIdentifier),
        (parent): StrictDocumentQuery<HulyInventoryCategory> => ({ name: identifier, attachedTo: parent.id })
      )
    const matches = yield* findAllCategories(client, query)
    if (isSingle(matches)) return matches[0]
    if (matches.length > 1) {
      return yield* new InventoryCategoryIdentifierAmbiguousError({ identifier, matches: matches.length })
    }
    return yield* new InventoryCategoryNotFoundError({ identifier })
  })

export const resolveProduct = (
  client: HulyClient["Type"],
  identifier: InventoryProductIdentifier,
  categoryIdentifier: InventoryCategoryIdentifier | undefined
): Effect.Effect<HulyInventoryProduct, InventoryError> =>
  Effect.gen(function*() {
    const byId = yield* client.findOne<HulyInventoryProduct>(
      inventory.class.Product,
      hulyQuery<HulyInventoryProduct>({ _id: toRef<HulyInventoryProduct>(identifier) })
    )
    if (byId !== undefined) return byId

    const query: StrictDocumentQuery<HulyInventoryProduct> = categoryIdentifier === undefined
      ? { name: identifier }
      : yield* Effect.map(
        resolveCategory(client, categoryIdentifier, undefined),
        (category): StrictDocumentQuery<HulyInventoryProduct> => ({ name: identifier, attachedTo: category._id })
      )
    const matches = yield* findAllProducts(client, query)
    if (isSingle(matches)) return matches[0]
    if (matches.length > 1) {
      return yield* new InventoryProductIdentifierAmbiguousError({ identifier, matches: matches.length })
    }
    return yield* new InventoryProductNotFoundError({ identifier })
  })

export const resolveVariant = (
  client: HulyClient["Type"],
  identifier: InventoryVariantIdentifier,
  productIdentifier: InventoryProductIdentifier | undefined,
  categoryIdentifier: InventoryCategoryIdentifier | undefined
): Effect.Effect<HulyInventoryVariant, InventoryError> =>
  Effect.gen(function*() {
    const byId = yield* client.findOne<HulyInventoryVariant>(
      inventory.class.Variant,
      hulyQuery<HulyInventoryVariant>({ _id: toRef<HulyInventoryVariant>(identifier) })
    )
    if (byId !== undefined) return byId

    const query: StrictDocumentQuery<HulyInventoryVariant> = productIdentifier === undefined
      ? {}
      : yield* Effect.map(
        resolveProduct(client, productIdentifier, categoryIdentifier),
        (product): StrictDocumentQuery<HulyInventoryVariant> => ({ attachedTo: product._id })
      )

    const candidates = yield* findAllVariants(client, query)
    const matches = candidates.filter((variant) => variant.name === identifier || variant.sku === identifier)
    if (isSingle(matches)) return matches[0]
    if (matches.length > 1) {
      return yield* new InventoryVariantIdentifierAmbiguousError({ identifier, matches: matches.length })
    }
    return yield* new InventoryVariantNotFoundError({ identifier })
  })

export const ensureCategoryNameAvailable = (
  client: HulyClient["Type"],
  parent: Ref<HulyInventoryCategory>,
  name: string,
  except?: Ref<HulyInventoryCategory>
): Effect.Effect<void, InventoryError> =>
  Effect.gen(function*() {
    const matches = yield* findAllCategories(client, { attachedTo: parent, name })
    if (matches.some((category) => category._id !== except)) {
      return yield* new InventoryConflictError({
        message: `Inventory category '${name}' already exists under the same parent`
      })
    }
  })

export const ensureProductNameAvailable = (
  client: HulyClient["Type"],
  category: Ref<HulyInventoryCategory>,
  name: string,
  except?: Ref<HulyInventoryProduct>
): Effect.Effect<void, InventoryError> =>
  Effect.gen(function*() {
    const matches = yield* findAllProducts(client, { attachedTo: category, name })
    if (matches.some((product) => product._id !== except)) {
      return yield* new InventoryConflictError({
        message: `Inventory product '${name}' already exists in the same category`
      })
    }
  })

export const ensureVariantAvailable = (
  client: HulyClient["Type"],
  product: Ref<HulyInventoryProduct>,
  name: string,
  sku: string,
  except?: Ref<HulyInventoryVariant>
): Effect.Effect<void, InventoryError> =>
  Effect.gen(function*() {
    const variants = yield* findAllVariants(client, { attachedTo: product })
    if (variants.some((variant) => variant._id !== except && variant.name === name)) {
      return yield* new InventoryConflictError({
        message: `Inventory variant '${name}' already exists for the same product`
      })
    }
    if (variants.some((variant) => variant._id !== except && variant.sku === sku)) {
      return yield* new InventoryConflictError({
        message: `Inventory SKU '${sku}' already exists for the same product`
      })
    }
  })

export const requireRemoveCollection = (
  client: HulyClient["Type"]
): Exclude<HulyClient["Type"]["removeCollection"], undefined> | InventoryMutationUnsupportedError => {
  if (client.removeCollection === undefined) {
    return new InventoryMutationUnsupportedError({ message: "Huly client does not support removeCollection" })
  }
  return client.removeCollection
}

export const requireUpdateCollection = (
  client: HulyClient["Type"]
): Exclude<HulyClient["Type"]["updateCollection"], undefined> | InventoryMutationUnsupportedError => {
  if (client.updateCollection === undefined) {
    return new InventoryMutationUnsupportedError({ message: "Huly client does not support updateCollection" })
  }
  return client.updateCollection
}

export const isDescendantCategory = (
  client: HulyClient["Type"],
  category: HulyInventoryCategory,
  possibleDescendant: Ref<HulyInventoryCategory>
): Effect.Effect<boolean, HulyClientError> =>
  Effect.gen(function*() {
    const visit = (
      current: Ref<HulyInventoryCategory> | undefined
    ): Effect.Effect<boolean, HulyClientError> =>
      Effect.gen(function*() {
        if (current === undefined || String(current) === String(inventory.global.Category)) return false
        if (current === category._id) return true
        const parent: HulyInventoryCategory | undefined = yield* client.findOne<HulyInventoryCategory>(
          inventory.class.Category,
          hulyQuery<HulyInventoryCategory>({ _id: current })
        )
        return yield* visit(parent === undefined ? undefined : toRef<HulyInventoryCategory>(parent.attachedTo))
      })

    return yield* visit(possibleDescendant)
  })
