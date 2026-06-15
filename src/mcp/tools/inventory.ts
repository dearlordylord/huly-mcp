import {
  createInventoryCategoryParamsJsonSchema,
  createInventoryProductParamsJsonSchema,
  createInventoryVariantParamsJsonSchema,
  deleteInventoryCategoryParamsJsonSchema,
  deleteInventoryProductParamsJsonSchema,
  deleteInventoryVariantParamsJsonSchema,
  getInventoryCategoryParamsJsonSchema,
  getInventoryProductParamsJsonSchema,
  getInventoryVariantParamsJsonSchema,
  InventoryCategoryDetailSchema,
  InventoryCreatedResultSchema,
  InventoryDeletedResultSchema,
  InventoryProductDetailSchema,
  InventoryUpdatedResultSchema,
  InventoryVariantDetailSchema,
  listInventoryCategoriesParamsJsonSchema,
  ListInventoryCategoriesResultSchema,
  listInventoryProductsParamsJsonSchema,
  ListInventoryProductsResultSchema,
  listInventoryVariantsParamsJsonSchema,
  ListInventoryVariantsResultSchema,
  parseCreateInventoryCategoryParams,
  parseCreateInventoryProductParams,
  parseCreateInventoryVariantParams,
  parseDeleteInventoryCategoryParams,
  parseDeleteInventoryProductParams,
  parseDeleteInventoryVariantParams,
  parseGetInventoryCategoryParams,
  parseGetInventoryProductParams,
  parseGetInventoryVariantParams,
  parseListInventoryCategoriesParams,
  parseListInventoryProductsParams,
  parseListInventoryVariantsParams,
  parseUpdateInventoryCategoryParams,
  parseUpdateInventoryProductParams,
  parseUpdateInventoryVariantParams,
  updateInventoryCategoryParamsJsonSchema,
  updateInventoryProductParamsJsonSchema,
  updateInventoryVariantParamsJsonSchema
} from "../../domain/schemas/inventory.js"
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
} from "../../huly/operations/inventory.js"
import { createEncodedToolHandler, type RegisteredTool } from "./registry.js"

const CATEGORY = "inventory" as const

export const inventoryTools: ReadonlyArray<RegisteredTool> = [
  {
    name: "list_inventory_categories",
    description:
      "List inventory categories sorted by name. Omit parentCategory to search all categories, or pass a parent category ID/exact name/root to list direct children. query filters names case-insensitively.",
    category: CATEGORY,
    inputSchema: listInventoryCategoriesParamsJsonSchema,
    handler: createEncodedToolHandler(
      "list_inventory_categories",
      parseListInventoryCategoriesParams,
      listInventoryCategories,
      ListInventoryCategoriesResultSchema
    )
  },
  {
    name: "get_inventory_category",
    description:
      "Get one inventory category by ID or exact name. If the name is duplicated under different parents, pass parentCategory or use the category ID.",
    category: CATEGORY,
    inputSchema: getInventoryCategoryParamsJsonSchema,
    handler: createEncodedToolHandler(
      "get_inventory_category",
      parseGetInventoryCategoryParams,
      getInventoryCategory,
      InventoryCategoryDetailSchema
    )
  },
  {
    name: "create_inventory_category",
    description:
      "Create an inventory category. Defaults parentCategory to the Inventory root. Rejects duplicate category names under the same parent.",
    category: CATEGORY,
    inputSchema: createInventoryCategoryParamsJsonSchema,
    handler: createEncodedToolHandler(
      "create_inventory_category",
      parseCreateInventoryCategoryParams,
      createInventoryCategory,
      InventoryCreatedResultSchema
    )
  },
  {
    name: "update_inventory_category",
    description:
      "Rename and/or move an inventory category. category accepts ID or exact name; pass parentCategory when a name may be duplicated. Rejects duplicate names in the destination parent and self/descendant moves.",
    category: CATEGORY,
    inputSchema: updateInventoryCategoryParamsJsonSchema,
    handler: createEncodedToolHandler(
      "update_inventory_category",
      parseUpdateInventoryCategoryParams,
      updateInventoryCategory,
      InventoryUpdatedResultSchema
    )
  },
  {
    name: "delete_inventory_category",
    description:
      "Delete an empty inventory category by ID or exact name. Refuses categories that still contain child categories or products; this action does not cascade.",
    category: CATEGORY,
    inputSchema: deleteInventoryCategoryParamsJsonSchema,
    handler: createEncodedToolHandler(
      "delete_inventory_category",
      parseDeleteInventoryCategoryParams,
      deleteInventoryCategory,
      InventoryDeletedResultSchema
    )
  },
  {
    name: "list_inventory_products",
    description:
      "List inventory products sorted by name. Optionally scope to category by ID/exact name and filter product names with query.",
    category: CATEGORY,
    inputSchema: listInventoryProductsParamsJsonSchema,
    handler: createEncodedToolHandler(
      "list_inventory_products",
      parseListInventoryProductsParams,
      listInventoryProducts,
      ListInventoryProductsResultSchema
    )
  },
  {
    name: "get_inventory_product",
    description:
      "Get one inventory product by ID or exact product name. If product names are duplicated, pass category or use the product ID.",
    category: CATEGORY,
    inputSchema: getInventoryProductParamsJsonSchema,
    handler: createEncodedToolHandler(
      "get_inventory_product",
      parseGetInventoryProductParams,
      getInventoryProduct,
      InventoryProductDetailSchema
    )
  },
  {
    name: "create_inventory_product",
    description:
      "Create an inventory product in a category resolved by ID or exact name. Rejects duplicate product names in the same category.",
    category: CATEGORY,
    inputSchema: createInventoryProductParamsJsonSchema,
    handler: createEncodedToolHandler(
      "create_inventory_product",
      parseCreateInventoryProductParams,
      createInventoryProduct,
      InventoryCreatedResultSchema
    )
  },
  {
    name: "update_inventory_product",
    description:
      "Rename and/or move an inventory product. product accepts ID or exact name; pass category when a name may be duplicated. Rejects duplicate names in the destination category.",
    category: CATEGORY,
    inputSchema: updateInventoryProductParamsJsonSchema,
    handler: createEncodedToolHandler(
      "update_inventory_product",
      parseUpdateInventoryProductParams,
      updateInventoryProduct,
      InventoryUpdatedResultSchema
    )
  },
  {
    name: "delete_inventory_product",
    description:
      "Delete an inventory product by ID or exact name. Refuses products with variants, photos, attachments, or comments; this action does not cascade.",
    category: CATEGORY,
    inputSchema: deleteInventoryProductParamsJsonSchema,
    handler: createEncodedToolHandler(
      "delete_inventory_product",
      parseDeleteInventoryProductParams,
      deleteInventoryProduct,
      InventoryDeletedResultSchema
    )
  },
  {
    name: "list_inventory_variants",
    description:
      "List inventory variants/SKUs sorted by name. Optionally scope to product by ID/exact name; category can disambiguate product names. query filters variant names and SKUs.",
    category: CATEGORY,
    inputSchema: listInventoryVariantsParamsJsonSchema,
    handler: createEncodedToolHandler(
      "list_inventory_variants",
      parseListInventoryVariantsParams,
      listInventoryVariants,
      ListInventoryVariantsResultSchema
    )
  },
  {
    name: "get_inventory_variant",
    description:
      "Get one inventory variant by ID, exact variant name, or exact SKU. If the name/SKU is duplicated, pass product or use the variant ID.",
    category: CATEGORY,
    inputSchema: getInventoryVariantParamsJsonSchema,
    handler: createEncodedToolHandler(
      "get_inventory_variant",
      parseGetInventoryVariantParams,
      getInventoryVariant,
      InventoryVariantDetailSchema
    )
  },
  {
    name: "create_inventory_variant",
    description:
      "Create an inventory variant/SKU under a product resolved by ID or exact name. Rejects duplicate variant names or SKUs in the same product.",
    category: CATEGORY,
    inputSchema: createInventoryVariantParamsJsonSchema,
    handler: createEncodedToolHandler(
      "create_inventory_variant",
      parseCreateInventoryVariantParams,
      createInventoryVariant,
      InventoryCreatedResultSchema
    )
  },
  {
    name: "update_inventory_variant",
    description:
      "Rename and/or change the SKU of an inventory variant. variant accepts ID, exact name, or exact SKU; pass product when needed. Rejects duplicate names or SKUs in the same product.",
    category: CATEGORY,
    inputSchema: updateInventoryVariantParamsJsonSchema,
    handler: createEncodedToolHandler(
      "update_inventory_variant",
      parseUpdateInventoryVariantParams,
      updateInventoryVariant,
      InventoryUpdatedResultSchema
    )
  },
  {
    name: "delete_inventory_variant",
    description:
      "Delete one inventory variant/SKU by ID, exact variant name, or exact SKU. This action does not delete its product.",
    category: CATEGORY,
    inputSchema: deleteInventoryVariantParamsJsonSchema,
    handler: createEncodedToolHandler(
      "delete_inventory_variant",
      parseDeleteInventoryVariantParams,
      deleteInventoryVariant,
      InventoryDeletedResultSchema
    )
  }
]
