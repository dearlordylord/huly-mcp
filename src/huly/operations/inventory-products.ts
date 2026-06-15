import type { Attachment as HulyAttachment } from "@hcengineering/attachment"
import type { ChatMessage } from "@hcengineering/chunter"
import type { AttachedData, DocumentUpdate } from "@hcengineering/core"
import { generateId } from "@hcengineering/core"
import type { Category as HulyInventoryCategory, Product as HulyInventoryProduct } from "@hcengineering/inventory"
import { Effect } from "effect"

import {
  type CreateInventoryProductParams,
  type DeleteInventoryProductParams,
  type GetInventoryProductParams,
  type InventoryCreatedResult,
  type InventoryDeletedResult,
  type InventoryProductDetail,
  type InventoryUpdatedResult,
  type ListInventoryProductsParams,
  type ListInventoryProductsResult,
  UPDATE_INVENTORY_PRODUCT_FIELDS,
  type UpdateInventoryProductParams
} from "../../domain/schemas/inventory.js"
import { InventoryProductId } from "../../domain/schemas/shared.js"
import { HulyClient } from "../client.js"
import { InventoryMutationUnsupportedError, InventoryNotEmptyError } from "../errors.js"
import { attachment, chunter, inventory } from "../huly-plugins.js"
import {
  ensureProductNameAvailable,
  findAllProducts,
  findAllVariants,
  type InventoryError,
  listTotal,
  matchesText,
  PRODUCTS_COLLECTION,
  requireRemoveCollection,
  requireUpdateCollection,
  resolveCategory,
  resolveProduct,
  toProductDetail,
  toProductSummary,
  workspace
} from "./inventory-shared.js"
import { clampLimit, findResultTotal, hulyQuery, type StrictDocumentQuery } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"
import { mergeUpdateEntries, requireUpdateFields } from "./update-guards.js"

export const listInventoryProducts = (
  params: ListInventoryProductsParams
): Effect.Effect<ListInventoryProductsResult, InventoryError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const query: StrictDocumentQuery<HulyInventoryProduct> = params.category === undefined
      ? {}
      : yield* Effect.map(
        resolveCategory(client, params.category, undefined),
        (category): StrictDocumentQuery<HulyInventoryProduct> => ({ attachedTo: category._id })
      )
    const products = yield* findAllProducts(client, query)
    const filtered = products.filter((product) => matchesText(product.name, params.query))
    return {
      products: filtered.slice(0, clampLimit(params.limit)).map(toProductSummary),
      total: listTotal(filtered.length)
    }
  })

export const getInventoryProduct = (
  params: GetInventoryProductParams
): Effect.Effect<InventoryProductDetail, InventoryError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const product = yield* resolveProduct(client, params.product, params.category)
    return toProductDetail(product)
  })

export const createInventoryProduct = (
  params: CreateInventoryProductParams
): Effect.Effect<InventoryCreatedResult, InventoryError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const category = yield* resolveCategory(client, params.category, undefined)
    yield* ensureProductNameAvailable(client, category._id, params.name)
    const id = generateId<HulyInventoryProduct>()
    const data: AttachedData<HulyInventoryProduct> = { name: params.name, variants: 0, photos: 0, attachments: 0 }
    yield* client.addCollection(
      inventory.class.Product,
      workspace,
      category._id,
      inventory.class.Category,
      PRODUCTS_COLLECTION,
      data,
      id
    )
    return { id: InventoryProductId.make(id), created: true }
  })

export const updateInventoryProduct = (
  params: UpdateInventoryProductParams
): Effect.Effect<InventoryUpdatedResult, InventoryError, HulyClient> =>
  Effect.gen(function*() {
    yield* requireUpdateFields("update_inventory_product", params, UPDATE_INVENTORY_PRODUCT_FIELDS)
    const client = yield* HulyClient
    const product = yield* resolveProduct(client, params.product, params.category)
    const newCategory = params.newCategory === undefined
      ? undefined
      : yield* resolveCategory(client, params.newCategory, undefined)
    yield* ensureProductNameAvailable(
      client,
      newCategory?._id ?? toRef<HulyInventoryCategory>(product.attachedTo),
      params.name ?? product.name,
      product._id
    )
    const entries: ReadonlyArray<DocumentUpdate<HulyInventoryProduct>> = [
      params.name === undefined ? {} : { name: params.name },
      newCategory === undefined ? {} : {
        attachedTo: newCategory._id,
        attachedToClass: inventory.class.Category,
        collection: PRODUCTS_COLLECTION
      }
    ]
    const update = mergeUpdateEntries(entries)
    if (newCategory === undefined) {
      yield* client.updateDoc(inventory.class.Product, workspace, product._id, update)
    } else {
      const updateCollection = requireUpdateCollection(client)
      if (updateCollection instanceof InventoryMutationUnsupportedError) return yield* updateCollection
      yield* updateCollection(
        inventory.class.Product,
        workspace,
        product._id,
        newCategory._id,
        inventory.class.Category,
        PRODUCTS_COLLECTION,
        update
      )
    }
    return { id: InventoryProductId.make(product._id), updated: true }
  })

export const deleteInventoryProduct = (
  params: DeleteInventoryProductParams
): Effect.Effect<InventoryDeletedResult, InventoryError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const product = yield* resolveProduct(client, params.product, params.category)
    const variants = yield* findAllVariants(client, { attachedTo: product._id })
    const attachments = yield* client.findAll<HulyAttachment>(
      attachment.class.Attachment,
      hulyQuery<HulyAttachment>({
        attachedTo: product._id,
        attachedToClass: inventory.class.Product,
        collection: "attachments"
      }),
      { total: true }
    )
    const photos = yield* client.findAll<HulyAttachment>(
      attachment.class.Photo,
      hulyQuery<HulyAttachment>({
        attachedTo: product._id,
        attachedToClass: inventory.class.Product,
        collection: "photos"
      }),
      { total: true }
    )
    const comments = yield* client.findAll<ChatMessage>(
      chunter.class.ChatMessage,
      hulyQuery<ChatMessage>({
        attachedTo: product._id,
        attachedToClass: inventory.class.Product,
        collection: "comments"
      }),
      { total: true }
    )
    const variantCount = Math.max(product.variants ?? 0, variants.length)
    const attachmentCount = Math.max(product.attachments ?? 0, findResultTotal(attachments))
    const photoCount = Math.max(product.photos ?? 0, findResultTotal(photos))
    const commentCount = findResultTotal(comments)
    if (variantCount > 0 || photoCount > 0 || attachmentCount > 0 || commentCount > 0) {
      return yield* new InventoryNotEmptyError({
        message:
          `Inventory product '${product.name}' is not empty: ${variantCount} variants, ${photoCount} photos, ${attachmentCount} attachments, ${commentCount} comments`
      })
    }
    const removeCollection = requireRemoveCollection(client)
    if (removeCollection instanceof InventoryMutationUnsupportedError) return yield* removeCollection
    yield* removeCollection(
      inventory.class.Product,
      workspace,
      product._id,
      product.attachedTo,
      product.attachedToClass,
      product.collection
    )
    return { id: InventoryProductId.make(product._id), deleted: true }
  })
