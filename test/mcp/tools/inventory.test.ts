import { describe, it } from "@effect/vitest"
import type { AccountUuid, FindResult } from "@hcengineering/core"
import { toFindResult } from "@hcengineering/core"
import type { Category as HulyInventoryCategory, Product as HulyInventoryProduct } from "@hcengineering/inventory"
import { Effect } from "effect"
import { expect } from "vitest"

import type { HulyClientOperations } from "../../../src/huly/client.js"
import { inventory } from "../../../src/huly/huly-plugins.js"
import { testMarkupUrlConfig } from "../../../src/huly/operations/markup.js"
import type { HulyStorageOperations } from "../../../src/huly/storage.js"
import { testWorkbenchUrlConfig } from "../../../src/huly/url-builders.js"
import { McpErrorCode } from "../../../src/mcp/error-mapping.js"
import { toolRegistry } from "../../../src/mcp/tools/index.js"
import { corePersonId, docRef, spaceRef } from "../../helpers/huly-sdk.js"

// AccountUuid is a branded SDK string; integration-test fixtures use literal strings at runtime.
const accountUuid = (value: string): AccountUuid => value as AccountUuid

// HulyClientOperations requires generic SDK methods; these empty fixtures never inspect or construct SDK documents.
const emptyFindAll: HulyClientOperations["findAll"] =
  (() => Effect.succeed(toFindResult([])) as Effect.Effect<FindResult<never>>) as HulyClientOperations["findAll"]

const emptyFindOne: HulyClientOperations["findOne"] =
  (() => Effect.succeed(undefined)) as HulyClientOperations["findOne"]

const hulyClient: HulyClientOperations = {
  getAccountUuid: () => accountUuid("00000000-0000-4000-8000-000000000000"),
  getPrimarySocialId: () => corePersonId("test-primary-social-id"),
  markupUrlConfig: testMarkupUrlConfig,
  workbenchUrlConfig: testWorkbenchUrlConfig,
  findAll: emptyFindAll,
  findAllInModel: emptyFindAll,
  findOne: emptyFindOne,
  createDoc: () => Effect.die(new Error("not implemented")),
  updateDoc: () => Effect.die(new Error("not implemented")),
  addCollection: () => Effect.die(new Error("not implemented")),
  removeDoc: () => Effect.die(new Error("not implemented")),
  uploadMarkup: () => Effect.die(new Error("not implemented")),
  fetchMarkup: () => Effect.succeed(""),
  updateMarkup: () => Effect.die(new Error("not implemented")),
  updateMixin: () => Effect.die(new Error("not implemented")),
  createMixin: () => Effect.die(new Error("not implemented")),
  searchFulltext: () => Effect.die(new Error("not implemented"))
}

const productDoc: HulyInventoryProduct = {
  _id: docRef<HulyInventoryProduct>("prod-camera"),
  _class: inventory.class.Product,
  space: spaceRef("core:space:Workspace"),
  attachedTo: docRef<HulyInventoryCategory>("cat-electronics"),
  attachedToClass: inventory.class.Category,
  collection: "products",
  name: "Camera",
  variants: 0,
  photos: 0,
  attachments: 0,
  modifiedBy: corePersonId("test-person"),
  modifiedOn: 1,
  createdBy: corePersonId("test-person"),
  createdOn: 1
}

const duplicateProductDoc: HulyInventoryProduct = {
  ...productDoc,
  _id: docRef<HulyInventoryProduct>("prod-camera-duplicate"),
  attachedTo: docRef<HulyInventoryCategory>("cat-other")
}

const hulyClientWithInventoryProduct: HulyClientOperations = {
  ...hulyClient,
  // HulyClientOperations is generic over every SDK Doc; this fixture only needs Product rows and returns an empty result otherwise.
  findAll: ((_class: unknown, query: Record<string, unknown>) => {
    if (_class === inventory.class.Product) {
      const matches = productDoc._id === query._id
        ? [productDoc]
        : productDoc.name === query.name
        ? [productDoc, duplicateProductDoc]
        : []
      return Effect.succeed(toFindResult(matches))
    }
    return Effect.succeed(toFindResult([]))
  }) as HulyClientOperations["findAll"],
  // HulyClientOperations is generic over every SDK Doc; this fixture only needs Product lookup for product wrapper tools.
  findOne: ((_class: unknown, query: Record<string, unknown>) => {
    if (_class === inventory.class.Product && productDoc._id === query._id) return Effect.succeed(productDoc)
    return Effect.succeed(undefined)
  }) as HulyClientOperations["findOne"]
}

const storageClient: HulyStorageOperations = {
  uploadFile: () => Effect.die(new Error("not implemented")),
  getFileUrl: (blobId: string) => `https://test.huly.io/files?file=${blobId}`
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const toolInputPropertyDescription = (toolName: string, propertyName: string): string | undefined => {
  const tool = toolRegistry.definitions.find((definition) => definition.name === toolName)
  const inputSchema = tool?.inputSchema
  if (!isRecord(inputSchema)) return undefined
  const properties = inputSchema.properties
  if (!isRecord(properties)) return undefined
  const property = properties[propertyName]
  if (!isRecord(property)) return undefined
  return typeof property.description === "string" ? property.description : undefined
}

describe("inventory MCP tools", () => {
  it.effect("registers inventory tools in the inventory category", () =>
    Effect.gen(function*() {
      const names = new Set(
        toolRegistry.definitions.filter((tool) => tool.category === "inventory").map((tool) => tool.name)
      )

      expect(names).toEqual(
        new Set([
          "list_inventory_categories",
          "get_inventory_category",
          "create_inventory_category",
          "update_inventory_category",
          "delete_inventory_category",
          "list_inventory_products",
          "get_inventory_product",
          "create_inventory_product",
          "update_inventory_product",
          "delete_inventory_product",
          "list_inventory_product_attachments",
          "get_inventory_product_attachment",
          "add_inventory_product_attachment",
          "update_inventory_product_attachment",
          "delete_inventory_product_attachment",
          "list_inventory_product_photos",
          "get_inventory_product_photo",
          "add_inventory_product_photo",
          "update_inventory_product_photo",
          "delete_inventory_product_photo",
          "list_inventory_product_comments",
          "add_inventory_product_comment",
          "update_inventory_product_comment",
          "delete_inventory_product_comment",
          "list_inventory_product_activity",
          "list_inventory_variants",
          "get_inventory_variant",
          "create_inventory_variant",
          "update_inventory_variant",
          "delete_inventory_variant"
        ])
      )
    }))

  it("preserves LLM-facing descriptions on inventory product media input schemas", () => {
    expect(toolInputPropertyDescription("add_inventory_product_attachment", "product")).toContain(
      "Inventory product ID or exact product name"
    )
    expect(toolInputPropertyDescription("add_inventory_product_attachment", "fileUrl")).toContain("Remote URL")
    expect(toolInputPropertyDescription("add_inventory_product_photo", "contentType")).toContain("MIME type")
    expect(toolInputPropertyDescription("update_inventory_product_comment", "body")).toContain("Markdown")
  })

  it.effect("returns encoded structured inventory list responses", () =>
    Effect.gen(function*() {
      const result = yield* Effect.promise(() =>
        toolRegistry.handleToolCall("list_inventory_categories", {}, hulyClient, storageClient)
      )

      expect(result?.isError).toBeUndefined()
      expect(result?.content[0]?.text).toBe("{\"categories\":[],\"total\":0}")
    }))

  it.effect("returns encoded structured product attachment wrapper responses", () =>
    Effect.gen(function*() {
      const result = yield* Effect.promise(() =>
        toolRegistry.handleToolCall(
          "list_inventory_product_attachments",
          { product: "prod-camera" },
          hulyClientWithInventoryProduct,
          storageClient
        )
      )

      expect(result?.isError).toBeUndefined()
      expect(result?.content[0]?.text).toBe(
        "{\"product\":{\"id\":\"prod-camera\",\"name\":\"Camera\",\"category\":\"cat-electronics\"},\"attachments\":[],\"total\":0}"
      )
    }))

  it.effect("maps inventory not-found errors to invalid params", () =>
    Effect.gen(function*() {
      const result = yield* Effect.promise(() =>
        toolRegistry.handleToolCall(
          "get_inventory_category",
          { category: "Missing" },
          hulyClient,
          storageClient
        )
      )

      expect(result?.isError).toBe(true)
      expect(result?._meta?.errorCode).toBe(McpErrorCode.InvalidParams)
      expect(result?.content[0]?.text).toContain("Inventory category 'Missing' not found")
    }))

  it.effect("maps product wrapper not-found and ambiguous errors to invalid params", () =>
    Effect.gen(function*() {
      const attachmentResult = yield* Effect.promise(() =>
        toolRegistry.handleToolCall(
          "get_inventory_product_attachment",
          { product: "prod-camera", attachmentId: "missing-attachment" },
          hulyClientWithInventoryProduct,
          storageClient
        )
      )
      const commentResult = yield* Effect.promise(() =>
        toolRegistry.handleToolCall(
          "update_inventory_product_comment",
          { product: "prod-camera", commentId: "missing-comment", body: "Updated" },
          hulyClientWithInventoryProduct,
          storageClient
        )
      )
      const ambiguousResult = yield* Effect.promise(() =>
        toolRegistry.handleToolCall(
          "list_inventory_product_activity",
          { product: "Camera" },
          hulyClientWithInventoryProduct,
          storageClient
        )
      )

      expect(attachmentResult?.isError).toBe(true)
      expect(attachmentResult?._meta?.errorCode).toBe(McpErrorCode.InvalidParams)
      expect(attachmentResult?.content[0]?.text).toContain("Attachment 'missing-attachment' not found")
      expect(commentResult?.isError).toBe(true)
      expect(commentResult?._meta?.errorCode).toBe(McpErrorCode.InvalidParams)
      expect(commentResult?.content[0]?.text).toContain(
        "Comment 'missing-comment' not found on inventory product 'Camera'"
      )
      expect(ambiguousResult?.isError).toBe(true)
      expect(ambiguousResult?._meta?.errorCode).toBe(McpErrorCode.InvalidParams)
      expect(ambiguousResult?.content[0]?.text).toContain("Inventory product 'Camera' matched 2 products")
    }))
})
