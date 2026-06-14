import type { AttachedData, DocumentUpdate } from "@hcengineering/core"
import { generateId } from "@hcengineering/core"
import type { Product as HulyInventoryProduct, Variant as HulyInventoryVariant } from "@hcengineering/inventory"
import { Effect } from "effect"

import {
  type CreateInventoryVariantParams,
  type DeleteInventoryVariantParams,
  type GetInventoryVariantParams,
  type InventoryCreatedResult,
  type InventoryDeletedResult,
  type InventoryUpdatedResult,
  type InventoryVariantDetail,
  type ListInventoryVariantsParams,
  type ListInventoryVariantsResult,
  UPDATE_INVENTORY_VARIANT_FIELDS,
  type UpdateInventoryVariantParams
} from "../../domain/schemas/inventory.js"
import { InventoryVariantId } from "../../domain/schemas/shared.js"
import { HulyClient } from "../client.js"
import { InventoryMutationUnsupportedError } from "../errors.js"
import { inventory } from "../huly-plugins.js"
import {
  ensureVariantAvailable,
  findAllVariants,
  type InventoryError,
  listTotal,
  matchesText,
  requireRemoveCollection,
  resolveProduct,
  resolveVariant,
  toVariantDetail,
  toVariantSummary,
  VARIANTS_COLLECTION,
  workspace
} from "./inventory-shared.js"
import { clampLimit, type StrictDocumentQuery } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"
import { mergeUpdateEntries, requireUpdateFields } from "./update-guards.js"

export const listInventoryVariants = (
  params: ListInventoryVariantsParams
): Effect.Effect<ListInventoryVariantsResult, InventoryError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const query: StrictDocumentQuery<HulyInventoryVariant> = params.product === undefined
      ? {}
      : yield* Effect.map(
        resolveProduct(client, params.product, params.category),
        (product): StrictDocumentQuery<HulyInventoryVariant> => ({ attachedTo: product._id })
      )
    const variants = yield* findAllVariants(client, query)
    const filtered = variants.filter((variant) =>
      matchesText(variant.name, params.query) || matchesText(variant.sku, params.query)
    )
    return {
      variants: filtered.slice(0, clampLimit(params.limit)).map(toVariantSummary),
      total: listTotal(filtered.length)
    }
  })

export const getInventoryVariant = (
  params: GetInventoryVariantParams
): Effect.Effect<InventoryVariantDetail, InventoryError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const variant = yield* resolveVariant(client, params.variant, params.product, params.category)
    return toVariantDetail(variant)
  })

export const createInventoryVariant = (
  params: CreateInventoryVariantParams
): Effect.Effect<InventoryCreatedResult, InventoryError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const product = yield* resolveProduct(client, params.product, params.category)
    yield* ensureVariantAvailable(client, product._id, params.name, params.sku)
    const id = generateId<HulyInventoryVariant>()
    const data: AttachedData<HulyInventoryVariant> = { name: params.name, sku: params.sku }
    yield* client.addCollection(
      inventory.class.Variant,
      workspace,
      product._id,
      inventory.class.Product,
      VARIANTS_COLLECTION,
      data,
      id
    )
    return { id: InventoryVariantId.make(id), created: true }
  })

export const updateInventoryVariant = (
  params: UpdateInventoryVariantParams
): Effect.Effect<InventoryUpdatedResult, InventoryError, HulyClient> =>
  Effect.gen(function*() {
    yield* requireUpdateFields("update_inventory_variant", params, UPDATE_INVENTORY_VARIANT_FIELDS)
    const client = yield* HulyClient
    const variant = yield* resolveVariant(client, params.variant, params.product, params.category)
    yield* ensureVariantAvailable(
      client,
      toRef<HulyInventoryProduct>(variant.attachedTo),
      params.name ?? variant.name,
      params.sku ?? variant.sku,
      variant._id
    )
    const entries: ReadonlyArray<DocumentUpdate<HulyInventoryVariant>> = [
      params.name === undefined ? {} : { name: params.name },
      params.sku === undefined ? {} : { sku: params.sku }
    ]
    yield* client.updateDoc(inventory.class.Variant, workspace, variant._id, mergeUpdateEntries(entries))
    return { id: InventoryVariantId.make(variant._id), updated: true }
  })

export const deleteInventoryVariant = (
  params: DeleteInventoryVariantParams
): Effect.Effect<InventoryDeletedResult, InventoryError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const variant = yield* resolveVariant(client, params.variant, params.product, params.category)
    const removeCollection = requireRemoveCollection(client)
    if (removeCollection instanceof InventoryMutationUnsupportedError) return yield* removeCollection
    yield* removeCollection(
      inventory.class.Variant,
      workspace,
      variant._id,
      variant.attachedTo,
      variant.attachedToClass,
      variant.collection
    )
    return { id: InventoryVariantId.make(variant._id), deleted: true }
  })
