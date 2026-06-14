import { JSONSchema, Schema } from "effect"

import {
  assertUpdateFields,
  atLeastOneUpdateFieldMessage,
  Count,
  DEFAULT_LIMIT,
  hasAtLeastOneDefined,
  InventoryCategoryId,
  InventoryCategoryIdentifier,
  InventoryProductId,
  InventoryProductIdentifier,
  InventoryVariantId,
  InventoryVariantIdentifier,
  LimitParam,
  ListTotal,
  NonEmptyString,
  Timestamp,
  withAtLeastOneRequired
} from "./shared.js"

const InventoryObjectIdSchema = Schema.Union(
  InventoryCategoryId,
  InventoryProductId,
  InventoryVariantId
)

const InventoryCategorySummarySchema = Schema.Struct({
  id: InventoryCategoryId,
  name: NonEmptyString,
  parentCategory: Schema.optional(InventoryCategoryId),
  childCategories: Count,
  products: Count
})
export type InventoryCategorySummary = Schema.Schema.Type<typeof InventoryCategorySummarySchema>

export const InventoryCategoryDetailSchema = Schema.Struct({
  ...InventoryCategorySummarySchema.fields,
  createdOn: Schema.optional(Timestamp),
  modifiedOn: Schema.optional(Timestamp)
})
export type InventoryCategoryDetail = Schema.Schema.Type<typeof InventoryCategoryDetailSchema>

const InventoryProductSummarySchema = Schema.Struct({
  id: InventoryProductId,
  name: NonEmptyString,
  category: InventoryCategoryId,
  variants: Count,
  photos: Count,
  attachments: Count
})
export type InventoryProductSummary = Schema.Schema.Type<typeof InventoryProductSummarySchema>

export const InventoryProductDetailSchema = Schema.Struct({
  ...InventoryProductSummarySchema.fields,
  createdOn: Schema.optional(Timestamp),
  modifiedOn: Schema.optional(Timestamp)
})
export type InventoryProductDetail = Schema.Schema.Type<typeof InventoryProductDetailSchema>

const InventoryVariantSummarySchema = Schema.Struct({
  id: InventoryVariantId,
  name: NonEmptyString,
  sku: NonEmptyString,
  product: InventoryProductId
})
export type InventoryVariantSummary = Schema.Schema.Type<typeof InventoryVariantSummarySchema>

export const InventoryVariantDetailSchema = Schema.Struct({
  ...InventoryVariantSummarySchema.fields,
  createdOn: Schema.optional(Timestamp),
  modifiedOn: Schema.optional(Timestamp)
})
export type InventoryVariantDetail = Schema.Schema.Type<typeof InventoryVariantDetailSchema>

export const ListInventoryCategoriesResultSchema = Schema.Struct({
  categories: Schema.Array(InventoryCategorySummarySchema),
  total: ListTotal
})
export type ListInventoryCategoriesResult = Schema.Schema.Type<typeof ListInventoryCategoriesResultSchema>

export const ListInventoryProductsResultSchema = Schema.Struct({
  products: Schema.Array(InventoryProductSummarySchema),
  total: ListTotal
})
export type ListInventoryProductsResult = Schema.Schema.Type<typeof ListInventoryProductsResultSchema>

export const ListInventoryVariantsResultSchema = Schema.Struct({
  variants: Schema.Array(InventoryVariantSummarySchema),
  total: ListTotal
})
export type ListInventoryVariantsResult = Schema.Schema.Type<typeof ListInventoryVariantsResultSchema>

export const InventoryCreatedResultSchema = Schema.Struct({
  id: InventoryObjectIdSchema,
  created: Schema.Literal(true)
})
export type InventoryCreatedResult = Schema.Schema.Type<typeof InventoryCreatedResultSchema>

export const InventoryUpdatedResultSchema = Schema.Struct({
  id: InventoryObjectIdSchema,
  updated: Schema.Literal(true)
})
export type InventoryUpdatedResult = Schema.Schema.Type<typeof InventoryUpdatedResultSchema>

export const InventoryDeletedResultSchema = Schema.Struct({
  id: InventoryObjectIdSchema,
  deleted: Schema.Literal(true)
})
export type InventoryDeletedResult = Schema.Schema.Type<typeof InventoryDeletedResultSchema>

const ListInventoryCategoriesParamsSchema = Schema.Struct({
  query: Schema.optional(NonEmptyString.annotations({
    description: "Case-insensitive substring filter for category names."
  })),
  parentCategory: Schema.optional(InventoryCategoryIdentifier.annotations({
    description:
      "Optional parent category scope. Use a category ID, exact category name, 'root', or 'inventory:global:Category'. Omit to search all categories."
  })),
  limit: Schema.optional(LimitParam.annotations({
    description: `Maximum number of categories to return (default: ${DEFAULT_LIMIT}).`
  }))
}).annotations({
  title: "ListInventoryCategoriesParams",
  description: "Parameters for listing inventory categories."
})

export type ListInventoryCategoriesParams = Schema.Schema.Type<typeof ListInventoryCategoriesParamsSchema>

const GetInventoryCategoryParamsSchema = Schema.Struct({
  category: InventoryCategoryIdentifier.annotations({
    description:
      "Category ID or exact category name. Name lookup must be unambiguous; pass parentCategory when duplicate names may exist."
  }),
  parentCategory: Schema.optional(InventoryCategoryIdentifier.annotations({
    description: "Optional exact parent scope for category name lookup."
  }))
}).annotations({
  title: "GetInventoryCategoryParams",
  description: "Parameters for getting one inventory category."
})

export type GetInventoryCategoryParams = Schema.Schema.Type<typeof GetInventoryCategoryParamsSchema>

const CreateInventoryCategoryParamsSchema = Schema.Struct({
  name: NonEmptyString.annotations({ description: "New category name." }),
  parentCategory: Schema.optional(InventoryCategoryIdentifier.annotations({
    description: "Parent category ID or exact name. Defaults to the Inventory root category."
  }))
}).annotations({
  title: "CreateInventoryCategoryParams",
  description: "Parameters for creating an inventory category."
})

export type CreateInventoryCategoryParams = Schema.Schema.Type<typeof CreateInventoryCategoryParamsSchema>

export const UPDATE_INVENTORY_CATEGORY_FIELDS = ["name", "newParentCategory"] as const

const UpdateInventoryCategoryParamsSchema = Schema.Struct({
  category: InventoryCategoryIdentifier.annotations({
    description:
      "Category ID or exact name to update. Name lookup must be unambiguous; pass parentCategory when needed."
  }),
  parentCategory: Schema.optional(InventoryCategoryIdentifier.annotations({
    description: "Optional current parent scope for category name lookup."
  })),
  name: Schema.optional(NonEmptyString.annotations({ description: "New category name." })),
  newParentCategory: Schema.optional(InventoryCategoryIdentifier.annotations({
    description: "New parent category ID or exact name; use 'root' to move to the Inventory root."
  }))
}).pipe(
  Schema.filter((params) =>
    hasAtLeastOneDefined(params, UPDATE_INVENTORY_CATEGORY_FIELDS)
      ? undefined
      : atLeastOneUpdateFieldMessage(UPDATE_INVENTORY_CATEGORY_FIELDS)
  )
).annotations({
  title: "UpdateInventoryCategoryParams",
  description: `Parameters for updating an inventory category. ${
    atLeastOneUpdateFieldMessage(UPDATE_INVENTORY_CATEGORY_FIELDS)
  }`
})

export type UpdateInventoryCategoryParams = Schema.Schema.Type<typeof UpdateInventoryCategoryParamsSchema>
assertUpdateFields<UpdateInventoryCategoryParams>()(
  ["category", "parentCategory"],
  UPDATE_INVENTORY_CATEGORY_FIELDS
)

const DeleteInventoryCategoryParamsSchema = GetInventoryCategoryParamsSchema.annotations({
  title: "DeleteInventoryCategoryParams",
  description: "Parameters for deleting an empty inventory category."
})

export type DeleteInventoryCategoryParams = Schema.Schema.Type<typeof DeleteInventoryCategoryParamsSchema>

const ListInventoryProductsParamsSchema = Schema.Struct({
  query: Schema.optional(NonEmptyString.annotations({
    description: "Case-insensitive substring filter for product names."
  })),
  category: Schema.optional(InventoryCategoryIdentifier.annotations({
    description: "Optional category scope by ID or exact category name."
  })),
  limit: Schema.optional(LimitParam.annotations({
    description: `Maximum number of products to return (default: ${DEFAULT_LIMIT}).`
  }))
}).annotations({
  title: "ListInventoryProductsParams",
  description: "Parameters for listing inventory products."
})

export type ListInventoryProductsParams = Schema.Schema.Type<typeof ListInventoryProductsParamsSchema>

const GetInventoryProductParamsSchema = Schema.Struct({
  product: InventoryProductIdentifier.annotations({
    description: "Product ID or exact product name. Name lookup must be unambiguous; pass category when needed."
  }),
  category: Schema.optional(InventoryCategoryIdentifier.annotations({
    description: "Optional exact category scope for product name lookup."
  }))
}).annotations({
  title: "GetInventoryProductParams",
  description: "Parameters for getting one inventory product."
})

export type GetInventoryProductParams = Schema.Schema.Type<typeof GetInventoryProductParamsSchema>

const CreateInventoryProductParamsSchema = Schema.Struct({
  name: NonEmptyString.annotations({ description: "New product name." }),
  category: InventoryCategoryIdentifier.annotations({
    description: "Category ID or exact category name where the product will be created."
  })
}).annotations({
  title: "CreateInventoryProductParams",
  description: "Parameters for creating an inventory product."
})

export type CreateInventoryProductParams = Schema.Schema.Type<typeof CreateInventoryProductParamsSchema>

export const UPDATE_INVENTORY_PRODUCT_FIELDS = ["name", "newCategory"] as const

const UpdateInventoryProductParamsSchema = Schema.Struct({
  product: InventoryProductIdentifier.annotations({
    description:
      "Product ID or exact product name to update. Name lookup must be unambiguous; pass category when needed."
  }),
  category: Schema.optional(InventoryCategoryIdentifier.annotations({
    description: "Optional current category scope for product name lookup."
  })),
  name: Schema.optional(NonEmptyString.annotations({ description: "New product name." })),
  newCategory: Schema.optional(InventoryCategoryIdentifier.annotations({
    description: "New category ID or exact category name."
  }))
}).pipe(
  Schema.filter((params) =>
    hasAtLeastOneDefined(params, UPDATE_INVENTORY_PRODUCT_FIELDS)
      ? undefined
      : atLeastOneUpdateFieldMessage(UPDATE_INVENTORY_PRODUCT_FIELDS)
  )
).annotations({
  title: "UpdateInventoryProductParams",
  description: `Parameters for updating an inventory product. ${
    atLeastOneUpdateFieldMessage(UPDATE_INVENTORY_PRODUCT_FIELDS)
  }`
})

export type UpdateInventoryProductParams = Schema.Schema.Type<typeof UpdateInventoryProductParamsSchema>
assertUpdateFields<UpdateInventoryProductParams>()(["product", "category"], UPDATE_INVENTORY_PRODUCT_FIELDS)

const DeleteInventoryProductParamsSchema = GetInventoryProductParamsSchema.annotations({
  title: "DeleteInventoryProductParams",
  description: "Parameters for deleting an inventory product with no variants, photos, or attachments."
})

export type DeleteInventoryProductParams = Schema.Schema.Type<typeof DeleteInventoryProductParamsSchema>

const ListInventoryVariantsParamsSchema = Schema.Struct({
  query: Schema.optional(NonEmptyString.annotations({
    description: "Case-insensitive substring filter for variant names or SKUs."
  })),
  product: Schema.optional(InventoryProductIdentifier.annotations({
    description: "Optional product scope by ID or exact product name."
  })),
  category: Schema.optional(InventoryCategoryIdentifier.annotations({
    description: "Optional category scope used to resolve product names."
  })),
  limit: Schema.optional(LimitParam.annotations({
    description: `Maximum number of variants to return (default: ${DEFAULT_LIMIT}).`
  }))
}).annotations({
  title: "ListInventoryVariantsParams",
  description: "Parameters for listing inventory variants/SKUs."
})

export type ListInventoryVariantsParams = Schema.Schema.Type<typeof ListInventoryVariantsParamsSchema>

const GetInventoryVariantParamsSchema = Schema.Struct({
  variant: InventoryVariantIdentifier.annotations({
    description:
      "Variant ID, exact variant name, or exact SKU. Name/SKU lookup must be unambiguous; pass product when needed."
  }),
  product: Schema.optional(InventoryProductIdentifier.annotations({
    description: "Optional exact product scope for variant name/SKU lookup."
  })),
  category: Schema.optional(InventoryCategoryIdentifier.annotations({
    description: "Optional category scope used to resolve product names."
  }))
}).annotations({
  title: "GetInventoryVariantParams",
  description: "Parameters for getting one inventory variant/SKU."
})

export type GetInventoryVariantParams = Schema.Schema.Type<typeof GetInventoryVariantParamsSchema>

const CreateInventoryVariantParamsSchema = Schema.Struct({
  product: InventoryProductIdentifier.annotations({
    description: "Product ID or exact product name where the variant will be created."
  }),
  category: Schema.optional(InventoryCategoryIdentifier.annotations({
    description: "Optional category scope used to resolve product names."
  })),
  name: NonEmptyString.annotations({ description: "New variant name." }),
  sku: NonEmptyString.annotations({ description: "New exact SKU." })
}).annotations({
  title: "CreateInventoryVariantParams",
  description: "Parameters for creating an inventory variant/SKU."
})

export type CreateInventoryVariantParams = Schema.Schema.Type<typeof CreateInventoryVariantParamsSchema>

export const UPDATE_INVENTORY_VARIANT_FIELDS = ["name", "sku"] as const

const UpdateInventoryVariantParamsSchema = Schema.Struct({
  variant: InventoryVariantIdentifier.annotations({
    description: "Variant ID, exact variant name, or exact SKU to update. Pass product when needed."
  }),
  product: Schema.optional(InventoryProductIdentifier.annotations({
    description: "Optional exact product scope for variant name/SKU lookup."
  })),
  category: Schema.optional(InventoryCategoryIdentifier.annotations({
    description: "Optional category scope used to resolve product names."
  })),
  name: Schema.optional(NonEmptyString.annotations({ description: "New variant name." })),
  sku: Schema.optional(NonEmptyString.annotations({ description: "New SKU." }))
}).pipe(
  Schema.filter((params) =>
    hasAtLeastOneDefined(params, UPDATE_INVENTORY_VARIANT_FIELDS)
      ? undefined
      : atLeastOneUpdateFieldMessage(UPDATE_INVENTORY_VARIANT_FIELDS)
  )
).annotations({
  title: "UpdateInventoryVariantParams",
  description: `Parameters for updating an inventory variant/SKU. ${
    atLeastOneUpdateFieldMessage(UPDATE_INVENTORY_VARIANT_FIELDS)
  }`
})

export type UpdateInventoryVariantParams = Schema.Schema.Type<typeof UpdateInventoryVariantParamsSchema>
assertUpdateFields<UpdateInventoryVariantParams>()(
  ["variant", "product", "category"],
  UPDATE_INVENTORY_VARIANT_FIELDS
)

const DeleteInventoryVariantParamsSchema = GetInventoryVariantParamsSchema.annotations({
  title: "DeleteInventoryVariantParams",
  description: "Parameters for deleting one inventory variant/SKU."
})

export type DeleteInventoryVariantParams = Schema.Schema.Type<typeof DeleteInventoryVariantParamsSchema>

export const listInventoryCategoriesParamsJsonSchema = JSONSchema.make(ListInventoryCategoriesParamsSchema)
export const getInventoryCategoryParamsJsonSchema = JSONSchema.make(GetInventoryCategoryParamsSchema)
export const createInventoryCategoryParamsJsonSchema = JSONSchema.make(CreateInventoryCategoryParamsSchema)
export const updateInventoryCategoryParamsJsonSchema = withAtLeastOneRequired(
  JSONSchema.make(UpdateInventoryCategoryParamsSchema),
  UPDATE_INVENTORY_CATEGORY_FIELDS
)
export const deleteInventoryCategoryParamsJsonSchema = JSONSchema.make(DeleteInventoryCategoryParamsSchema)
export const listInventoryProductsParamsJsonSchema = JSONSchema.make(ListInventoryProductsParamsSchema)
export const getInventoryProductParamsJsonSchema = JSONSchema.make(GetInventoryProductParamsSchema)
export const createInventoryProductParamsJsonSchema = JSONSchema.make(CreateInventoryProductParamsSchema)
export const updateInventoryProductParamsJsonSchema = withAtLeastOneRequired(
  JSONSchema.make(UpdateInventoryProductParamsSchema),
  UPDATE_INVENTORY_PRODUCT_FIELDS
)
export const deleteInventoryProductParamsJsonSchema = JSONSchema.make(DeleteInventoryProductParamsSchema)
export const listInventoryVariantsParamsJsonSchema = JSONSchema.make(ListInventoryVariantsParamsSchema)
export const getInventoryVariantParamsJsonSchema = JSONSchema.make(GetInventoryVariantParamsSchema)
export const createInventoryVariantParamsJsonSchema = JSONSchema.make(CreateInventoryVariantParamsSchema)
export const updateInventoryVariantParamsJsonSchema = withAtLeastOneRequired(
  JSONSchema.make(UpdateInventoryVariantParamsSchema),
  UPDATE_INVENTORY_VARIANT_FIELDS
)
export const deleteInventoryVariantParamsJsonSchema = JSONSchema.make(DeleteInventoryVariantParamsSchema)

export const parseListInventoryCategoriesParams = Schema.decodeUnknown(ListInventoryCategoriesParamsSchema)
export const parseGetInventoryCategoryParams = Schema.decodeUnknown(GetInventoryCategoryParamsSchema)
export const parseCreateInventoryCategoryParams = Schema.decodeUnknown(CreateInventoryCategoryParamsSchema)
export const parseUpdateInventoryCategoryParams = Schema.decodeUnknown(UpdateInventoryCategoryParamsSchema)
export const parseDeleteInventoryCategoryParams = Schema.decodeUnknown(DeleteInventoryCategoryParamsSchema)
export const parseListInventoryProductsParams = Schema.decodeUnknown(ListInventoryProductsParamsSchema)
export const parseGetInventoryProductParams = Schema.decodeUnknown(GetInventoryProductParamsSchema)
export const parseCreateInventoryProductParams = Schema.decodeUnknown(CreateInventoryProductParamsSchema)
export const parseUpdateInventoryProductParams = Schema.decodeUnknown(UpdateInventoryProductParamsSchema)
export const parseDeleteInventoryProductParams = Schema.decodeUnknown(DeleteInventoryProductParamsSchema)
export const parseListInventoryVariantsParams = Schema.decodeUnknown(ListInventoryVariantsParamsSchema)
export const parseGetInventoryVariantParams = Schema.decodeUnknown(GetInventoryVariantParamsSchema)
export const parseCreateInventoryVariantParams = Schema.decodeUnknown(CreateInventoryVariantParamsSchema)
export const parseUpdateInventoryVariantParams = Schema.decodeUnknown(UpdateInventoryVariantParamsSchema)
export const parseDeleteInventoryVariantParams = Schema.decodeUnknown(DeleteInventoryVariantParamsSchema)
