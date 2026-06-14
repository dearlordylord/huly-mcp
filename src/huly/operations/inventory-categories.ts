import type { AttachedData, DocumentUpdate } from "@hcengineering/core"
import { generateId } from "@hcengineering/core"
import type { Category as HulyInventoryCategory } from "@hcengineering/inventory"
import { Effect } from "effect"

import {
  type CreateInventoryCategoryParams,
  type DeleteInventoryCategoryParams,
  type GetInventoryCategoryParams,
  type InventoryCategoryDetail,
  type InventoryCreatedResult,
  type InventoryDeletedResult,
  type InventoryUpdatedResult,
  type ListInventoryCategoriesParams,
  type ListInventoryCategoriesResult,
  UPDATE_INVENTORY_CATEGORY_FIELDS,
  type UpdateInventoryCategoryParams
} from "../../domain/schemas/inventory.js"
import { InventoryCategoryId, Timestamp } from "../../domain/schemas/shared.js"
import { HulyClient } from "../client.js"
import { InventoryMutationUnsupportedError, InventoryNotEmptyError } from "../errors.js"
import { inventory } from "../huly-plugins.js"
import {
  CATEGORIES_COLLECTION,
  categoryCounts,
  ensureCategoryNameAvailable,
  findAllCategories,
  type InventoryError,
  isDescendantCategory,
  listTotal,
  matchesText,
  requireRemoveCollection,
  requireUpdateCollection,
  resolveCategory,
  resolveCategoryParent,
  toCategorySummary,
  workspace
} from "./inventory-shared.js"
import { clampLimit, type StrictDocumentQuery } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"
import { mergeUpdateEntries, requireUpdateFields } from "./update-guards.js"

const toCategoryDetail = (
  client: HulyClient["Type"],
  category: HulyInventoryCategory
): Effect.Effect<InventoryCategoryDetail, InventoryError> =>
  Effect.gen(function*() {
    const summary = yield* toCategorySummary(client, category)
    return {
      ...summary,
      ...(category.createdOn === undefined ? {} : { createdOn: Timestamp.make(category.createdOn) }),
      modifiedOn: Timestamp.make(category.modifiedOn)
    }
  })

export const listInventoryCategories = (
  params: ListInventoryCategoriesParams
): Effect.Effect<ListInventoryCategoriesResult, InventoryError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const limit = clampLimit(params.limit)
    const query: StrictDocumentQuery<HulyInventoryCategory> = params.parentCategory === undefined
      ? {}
      : yield* Effect.map(
        resolveCategoryParent(client, params.parentCategory),
        (parent): StrictDocumentQuery<HulyInventoryCategory> => ({ attachedTo: parent.id })
      )
    const categories = yield* findAllCategories(client, query)
    const filtered = categories.filter((category) => matchesText(category.name, params.query))
    const summaries = yield* Effect.all(
      filtered.slice(0, limit).map((category) => toCategorySummary(client, category))
    )
    return { categories: summaries, total: listTotal(filtered.length) }
  })

export const getInventoryCategory = (
  params: GetInventoryCategoryParams
): Effect.Effect<InventoryCategoryDetail, InventoryError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const category = yield* resolveCategory(client, params.category, params.parentCategory)
    return yield* toCategoryDetail(client, category)
  })

export const createInventoryCategory = (
  params: CreateInventoryCategoryParams
): Effect.Effect<InventoryCreatedResult, InventoryError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const parent = yield* resolveCategoryParent(client, params.parentCategory)
    yield* ensureCategoryNameAvailable(client, parent.id, params.name)
    const id = generateId<HulyInventoryCategory>()
    const data: AttachedData<HulyInventoryCategory> = { name: params.name }
    yield* client.addCollection(
      inventory.class.Category,
      workspace,
      parent.id,
      inventory.class.Category,
      CATEGORIES_COLLECTION,
      data,
      id
    )
    return { id: InventoryCategoryId.make(id), created: true }
  })

export const updateInventoryCategory = (
  params: UpdateInventoryCategoryParams
): Effect.Effect<InventoryUpdatedResult, InventoryError, HulyClient> =>
  Effect.gen(function*() {
    yield* requireUpdateFields("update_inventory_category", params, UPDATE_INVENTORY_CATEGORY_FIELDS)
    const client = yield* HulyClient
    const category = yield* resolveCategory(client, params.category, params.parentCategory)
    const newParent = params.newParentCategory === undefined
      ? undefined
      : yield* resolveCategoryParent(client, params.newParentCategory)
    const destinationParent = newParent?.id ?? toRef<HulyInventoryCategory>(category.attachedTo)
    if (newParent !== undefined) {
      if (newParent.id === category._id || (yield* isDescendantCategory(client, category, newParent.id))) {
        return yield* new InventoryMutationUnsupportedError({
          message: "Cannot move an inventory category under itself or one of its descendants"
        })
      }
    }
    yield* ensureCategoryNameAvailable(client, destinationParent, params.name ?? category.name, category._id)
    const entries: ReadonlyArray<DocumentUpdate<HulyInventoryCategory>> = [
      params.name === undefined ? {} : { name: params.name },
      newParent === undefined ? {} : {
        attachedTo: newParent.id,
        attachedToClass: inventory.class.Category,
        collection: CATEGORIES_COLLECTION
      }
    ]
    const update = mergeUpdateEntries(entries)
    if (newParent === undefined) {
      yield* client.updateDoc(inventory.class.Category, workspace, category._id, update)
    } else {
      const updateCollection = requireUpdateCollection(client)
      if (updateCollection instanceof InventoryMutationUnsupportedError) return yield* updateCollection
      yield* updateCollection(
        inventory.class.Category,
        workspace,
        category._id,
        newParent.id,
        inventory.class.Category,
        CATEGORIES_COLLECTION,
        update
      )
    }
    return { id: InventoryCategoryId.make(category._id), updated: true }
  })

export const deleteInventoryCategory = (
  params: DeleteInventoryCategoryParams
): Effect.Effect<InventoryDeletedResult, InventoryError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const category = yield* resolveCategory(client, params.category, params.parentCategory)
    const counts = yield* categoryCounts(client, category)
    if (counts.childCategories > 0 || counts.products > 0) {
      return yield* new InventoryNotEmptyError({
        message:
          `Inventory category '${category.name}' is not empty: ${counts.childCategories} child categories, ${counts.products} products`
      })
    }
    const removeCollection = requireRemoveCollection(client)
    if (removeCollection instanceof InventoryMutationUnsupportedError) return yield* removeCollection
    yield* removeCollection(
      inventory.class.Category,
      workspace,
      category._id,
      category.attachedTo,
      category.attachedToClass,
      category.collection
    )
    return { id: InventoryCategoryId.make(category._id), deleted: true }
  })
