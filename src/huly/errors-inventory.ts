import { Schema } from "effect"

export class InventoryCategoryNotFoundError extends Schema.TaggedError<InventoryCategoryNotFoundError>()(
  "InventoryCategoryNotFoundError",
  { identifier: Schema.String }
) {
  override get message(): string {
    return `Inventory category '${this.identifier}' not found`
  }
}

export class InventoryProductNotFoundError extends Schema.TaggedError<InventoryProductNotFoundError>()(
  "InventoryProductNotFoundError",
  { identifier: Schema.String }
) {
  override get message(): string {
    return `Inventory product '${this.identifier}' not found`
  }
}

export class InventoryProductCommentNotFoundError extends Schema.TaggedError<InventoryProductCommentNotFoundError>()(
  "InventoryProductCommentNotFoundError",
  { product: Schema.String, commentId: Schema.String }
) {
  override get message(): string {
    return `Comment '${this.commentId}' not found on inventory product '${this.product}'`
  }
}

export class InventoryVariantNotFoundError extends Schema.TaggedError<InventoryVariantNotFoundError>()(
  "InventoryVariantNotFoundError",
  { identifier: Schema.String }
) {
  override get message(): string {
    return `Inventory variant/SKU '${this.identifier}' not found`
  }
}

export class InventoryCategoryIdentifierAmbiguousError
  extends Schema.TaggedError<InventoryCategoryIdentifierAmbiguousError>()(
    "InventoryCategoryIdentifierAmbiguousError",
    { identifier: Schema.String, matches: Schema.Number }
  )
{
  override get message(): string {
    return `Inventory category '${this.identifier}' matched ${this.matches} categories; pass parentCategory or use the category ID`
  }
}

export class InventoryProductIdentifierAmbiguousError
  extends Schema.TaggedError<InventoryProductIdentifierAmbiguousError>()(
    "InventoryProductIdentifierAmbiguousError",
    { identifier: Schema.String, matches: Schema.Number }
  )
{
  override get message(): string {
    return `Inventory product '${this.identifier}' matched ${this.matches} products; pass category or use the product ID`
  }
}

export class InventoryVariantIdentifierAmbiguousError
  extends Schema.TaggedError<InventoryVariantIdentifierAmbiguousError>()(
    "InventoryVariantIdentifierAmbiguousError",
    { identifier: Schema.String, matches: Schema.Number }
  )
{
  override get message(): string {
    return `Inventory variant/SKU '${this.identifier}' matched ${this.matches} variants; pass product or use the variant ID`
  }
}

export class InventoryConflictError extends Schema.TaggedError<InventoryConflictError>()(
  "InventoryConflictError",
  { message: Schema.String }
) {}

export class InventoryNotEmptyError extends Schema.TaggedError<InventoryNotEmptyError>()(
  "InventoryNotEmptyError",
  { message: Schema.String }
) {}

export class InventoryMutationUnsupportedError extends Schema.TaggedError<InventoryMutationUnsupportedError>()(
  "InventoryMutationUnsupportedError",
  { message: Schema.String }
) {}
