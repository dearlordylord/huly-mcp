import { Schema } from "effect"

import { UPDATE_ATTACHMENT_FIELDS } from "./attachments.js"
import { AttachmentDescription, AttachmentFileName, Base64FileData, LocalFilePath } from "./domain-values.js"
import {
  INVENTORY_MEDIA_FILE_SOURCE_FIELDS,
  inventoryMediaExactlyOneFileSourceMessage,
  inventoryMediaJsonSchema,
  withExactlyOneInventoryMediaFileSource
} from "./inventory-media-json-schema.js"
import {
  assertUpdateFields,
  atLeastOneUpdateFieldMessage,
  AttachmentId,
  CommentId,
  DEFAULT_LIMIT,
  hasAtLeastOneDefined,
  InventoryCategoryIdentifier,
  InventoryProductIdentifier,
  LimitParam,
  MimeType,
  NonEmptyString,
  UrlString
} from "./shared.js"

const ProductLocatorFields = {
  product: InventoryProductIdentifier.annotations({
    description: "Inventory product ID or exact product name. Pass category when duplicate product names may exist."
  }),
  category: Schema.optional(InventoryCategoryIdentifier.annotations({
    description: "Optional category ID or exact category name used to disambiguate product names."
  }))
} as const

const MediaFileFields = {
  filename: AttachmentFileName.annotations({
    description: "Name of the file to attach to the inventory product."
  }),
  contentType: MimeType.annotations({
    description: "MIME type of the file, such as image/png or application/pdf."
  }),
  filePath: Schema.optional(LocalFilePath.annotations({
    description: "Local file path to upload. Mutually exclusive with fileUrl and data."
  })),
  fileUrl: Schema.optional(UrlString.annotations({
    description: "Remote URL to fetch and upload. Mutually exclusive with filePath and data."
  })),
  data: Schema.optional(Base64FileData.annotations({
    description: "Base64-encoded file data for small files. Mutually exclusive with filePath and fileUrl."
  })),
  description: Schema.optional(AttachmentDescription.annotations({
    description: "Optional media description."
  })),
  pinned: Schema.optional(Schema.Boolean.annotations({
    description: "Whether the media item should be pinned."
  }))
} as const

const requireExactlyOneFileSource = (params: {
  readonly filePath?: unknown
  readonly fileUrl?: unknown
  readonly data?: unknown
}) =>
  INVENTORY_MEDIA_FILE_SOURCE_FIELDS.filter((field) => params[field] !== undefined).length === 1
  || inventoryMediaExactlyOneFileSourceMessage

const ListInventoryProductAttachmentsParamsSchema = Schema.Struct({
  ...ProductLocatorFields,
  limit: Schema.optional(LimitParam.annotations({
    description: `Maximum number of product attachments to return (default: ${DEFAULT_LIMIT}).`
  }))
}).annotations({
  title: "ListInventoryProductAttachmentsParams",
  description: "Parameters for listing files attached directly to an inventory product."
})
export type ListInventoryProductAttachmentsParams = Schema.Schema.Type<
  typeof ListInventoryProductAttachmentsParamsSchema
>

const GetInventoryProductAttachmentParamsSchema = Schema.Struct({
  ...ProductLocatorFields,
  attachmentId: AttachmentId.annotations({
    description: "Product attachment ID to retrieve."
  })
}).annotations({
  title: "GetInventoryProductAttachmentParams",
  description: "Parameters for retrieving one file attached directly to an inventory product."
})
export type GetInventoryProductAttachmentParams = Schema.Schema.Type<typeof GetInventoryProductAttachmentParamsSchema>

const AddInventoryProductAttachmentParamsSchema = Schema.Struct({
  ...ProductLocatorFields,
  ...MediaFileFields
}).pipe(
  Schema.filter(requireExactlyOneFileSource)
).annotations({
  title: "AddInventoryProductAttachmentParams",
  description: `Parameters for adding a file to an inventory product. ${inventoryMediaExactlyOneFileSourceMessage}`
})
export type AddInventoryProductAttachmentParams = Schema.Schema.Type<typeof AddInventoryProductAttachmentParamsSchema>

const UPDATE_INVENTORY_PRODUCT_MEDIA_FIELDS = UPDATE_ATTACHMENT_FIELDS

const UpdateInventoryProductAttachmentParamsSchema = Schema.Struct({
  ...ProductLocatorFields,
  attachmentId: AttachmentId.annotations({
    description: "Product attachment ID to update."
  }),
  description: Schema.optional(
    Schema.NullOr(AttachmentDescription).annotations({
      description: "New description; use null to clear it."
    })
  ),
  pinned: Schema.optional(Schema.Boolean.annotations({
    description: "Pin or unpin the product attachment."
  }))
}).pipe(
  Schema.filter((params) =>
    hasAtLeastOneDefined(params, UPDATE_INVENTORY_PRODUCT_MEDIA_FIELDS)
      ? undefined
      : atLeastOneUpdateFieldMessage(UPDATE_INVENTORY_PRODUCT_MEDIA_FIELDS)
  )
).annotations({
  title: "UpdateInventoryProductAttachmentParams",
  description: `Parameters for updating product attachment metadata. ${
    atLeastOneUpdateFieldMessage(UPDATE_INVENTORY_PRODUCT_MEDIA_FIELDS)
  }`
})
export type UpdateInventoryProductAttachmentParams = Schema.Schema.Type<
  typeof UpdateInventoryProductAttachmentParamsSchema
>
assertUpdateFields<UpdateInventoryProductAttachmentParams>()(
  ["product", "category", "attachmentId"],
  UPDATE_INVENTORY_PRODUCT_MEDIA_FIELDS
)

const DeleteInventoryProductAttachmentParamsSchema = GetInventoryProductAttachmentParamsSchema.annotations({
  title: "DeleteInventoryProductAttachmentParams",
  description: "Parameters for permanently deleting a file attached directly to an inventory product."
})
export type DeleteInventoryProductAttachmentParams = Schema.Schema.Type<
  typeof DeleteInventoryProductAttachmentParamsSchema
>

const ListInventoryProductPhotosParamsSchema = Schema.Struct({
  ...ProductLocatorFields,
  limit: Schema.optional(LimitParam.annotations({
    description: `Maximum number of product photos to return (default: ${DEFAULT_LIMIT}).`
  }))
}).annotations({
  title: "ListInventoryProductPhotosParams",
  description: "Parameters for listing photos attached directly to an inventory product."
})
export type ListInventoryProductPhotosParams = Schema.Schema.Type<typeof ListInventoryProductPhotosParamsSchema>

const GetInventoryProductPhotoParamsSchema = Schema.Struct({
  ...ProductLocatorFields,
  photoId: AttachmentId.annotations({
    description: "Product photo ID to retrieve."
  })
}).annotations({
  title: "GetInventoryProductPhotoParams",
  description: "Parameters for retrieving one photo attached directly to an inventory product."
})
export type GetInventoryProductPhotoParams = Schema.Schema.Type<typeof GetInventoryProductPhotoParamsSchema>

const AddInventoryProductPhotoParamsSchema = Schema.Struct({
  ...ProductLocatorFields,
  ...MediaFileFields
}).pipe(
  Schema.filter(requireExactlyOneFileSource)
).annotations({
  title: "AddInventoryProductPhotoParams",
  description: `Parameters for adding a photo to an inventory product. ${inventoryMediaExactlyOneFileSourceMessage}`
})
export type AddInventoryProductPhotoParams = Schema.Schema.Type<typeof AddInventoryProductPhotoParamsSchema>

const UpdateInventoryProductPhotoParamsSchema = Schema.Struct({
  ...ProductLocatorFields,
  photoId: AttachmentId.annotations({
    description: "Product photo ID to update."
  }),
  description: Schema.optional(
    Schema.NullOr(AttachmentDescription).annotations({
      description: "New description; use null to clear it."
    })
  ),
  pinned: Schema.optional(Schema.Boolean.annotations({
    description: "Pin or unpin the product photo."
  }))
}).pipe(
  Schema.filter((params) =>
    hasAtLeastOneDefined(params, UPDATE_INVENTORY_PRODUCT_MEDIA_FIELDS)
      ? undefined
      : atLeastOneUpdateFieldMessage(UPDATE_INVENTORY_PRODUCT_MEDIA_FIELDS)
  )
).annotations({
  title: "UpdateInventoryProductPhotoParams",
  description: `Parameters for updating product photo metadata. ${
    atLeastOneUpdateFieldMessage(UPDATE_INVENTORY_PRODUCT_MEDIA_FIELDS)
  }`
})
export type UpdateInventoryProductPhotoParams = Schema.Schema.Type<typeof UpdateInventoryProductPhotoParamsSchema>
assertUpdateFields<UpdateInventoryProductPhotoParams>()(
  ["product", "category", "photoId"],
  UPDATE_INVENTORY_PRODUCT_MEDIA_FIELDS
)

const DeleteInventoryProductPhotoParamsSchema = GetInventoryProductPhotoParamsSchema.annotations({
  title: "DeleteInventoryProductPhotoParams",
  description: "Parameters for permanently deleting a photo attached directly to an inventory product."
})
export type DeleteInventoryProductPhotoParams = Schema.Schema.Type<typeof DeleteInventoryProductPhotoParamsSchema>

const ListInventoryProductCommentsParamsSchema = Schema.Struct({
  ...ProductLocatorFields,
  limit: Schema.optional(LimitParam.annotations({
    description: `Maximum number of product comments to return (default: ${DEFAULT_LIMIT}).`
  }))
}).annotations({
  title: "ListInventoryProductCommentsParams",
  description: "Parameters for listing comments attached directly to an inventory product."
})
export type ListInventoryProductCommentsParams = Schema.Schema.Type<typeof ListInventoryProductCommentsParamsSchema>

const AddInventoryProductCommentParamsSchema = Schema.Struct({
  ...ProductLocatorFields,
  body: NonEmptyString.annotations({
    description: "Comment body. Markdown is supported."
  })
}).annotations({
  title: "AddInventoryProductCommentParams",
  description: "Parameters for adding a comment to an inventory product."
})
export type AddInventoryProductCommentParams = Schema.Schema.Type<typeof AddInventoryProductCommentParamsSchema>

const UpdateInventoryProductCommentParamsSchema = Schema.Struct({
  ...ProductLocatorFields,
  commentId: CommentId.annotations({
    description: "Product comment ID to update."
  }),
  body: NonEmptyString.annotations({
    description: "New comment body. Markdown is supported."
  })
}).annotations({
  title: "UpdateInventoryProductCommentParams",
  description: "Parameters for updating an inventory product comment."
})
export type UpdateInventoryProductCommentParams = Schema.Schema.Type<typeof UpdateInventoryProductCommentParamsSchema>

const DeleteInventoryProductCommentParamsSchema = Schema.Struct({
  ...ProductLocatorFields,
  commentId: CommentId.annotations({
    description: "Product comment ID to delete."
  })
}).annotations({
  title: "DeleteInventoryProductCommentParams",
  description: "Parameters for deleting an inventory product comment."
})
export type DeleteInventoryProductCommentParams = Schema.Schema.Type<typeof DeleteInventoryProductCommentParamsSchema>

const ListInventoryProductActivityParamsSchema = Schema.Struct({
  ...ProductLocatorFields,
  limit: Schema.optional(LimitParam.annotations({
    description: `Maximum number of product activity messages to return (default: ${DEFAULT_LIMIT}).`
  }))
}).annotations({
  title: "ListInventoryProductActivityParams",
  description: "Parameters for listing activity messages on an inventory product."
})
export type ListInventoryProductActivityParams = Schema.Schema.Type<typeof ListInventoryProductActivityParamsSchema>

export const listInventoryProductAttachmentsParamsJsonSchema = inventoryMediaJsonSchema(
  ListInventoryProductAttachmentsParamsSchema
)
export const getInventoryProductAttachmentParamsJsonSchema = inventoryMediaJsonSchema(
  GetInventoryProductAttachmentParamsSchema
)
export const addInventoryProductAttachmentParamsJsonSchema = withExactlyOneInventoryMediaFileSource(
  inventoryMediaJsonSchema(AddInventoryProductAttachmentParamsSchema)
)
export const updateInventoryProductAttachmentParamsJsonSchema = inventoryMediaJsonSchema(
  UpdateInventoryProductAttachmentParamsSchema
)
export const deleteInventoryProductAttachmentParamsJsonSchema = inventoryMediaJsonSchema(
  DeleteInventoryProductAttachmentParamsSchema
)
export const listInventoryProductPhotosParamsJsonSchema = inventoryMediaJsonSchema(
  ListInventoryProductPhotosParamsSchema
)
export const getInventoryProductPhotoParamsJsonSchema = inventoryMediaJsonSchema(GetInventoryProductPhotoParamsSchema)
export const addInventoryProductPhotoParamsJsonSchema = withExactlyOneInventoryMediaFileSource(
  inventoryMediaJsonSchema(AddInventoryProductPhotoParamsSchema)
)
export const updateInventoryProductPhotoParamsJsonSchema = inventoryMediaJsonSchema(
  UpdateInventoryProductPhotoParamsSchema
)
export const deleteInventoryProductPhotoParamsJsonSchema = inventoryMediaJsonSchema(
  DeleteInventoryProductPhotoParamsSchema
)
export const listInventoryProductCommentsParamsJsonSchema = inventoryMediaJsonSchema(
  ListInventoryProductCommentsParamsSchema
)
export const addInventoryProductCommentParamsJsonSchema = inventoryMediaJsonSchema(
  AddInventoryProductCommentParamsSchema
)
export const updateInventoryProductCommentParamsJsonSchema = inventoryMediaJsonSchema(
  UpdateInventoryProductCommentParamsSchema
)
export const deleteInventoryProductCommentParamsJsonSchema = inventoryMediaJsonSchema(
  DeleteInventoryProductCommentParamsSchema
)
export const listInventoryProductActivityParamsJsonSchema = inventoryMediaJsonSchema(
  ListInventoryProductActivityParamsSchema
)

export const parseListInventoryProductAttachmentsParams = Schema.decodeUnknown(
  ListInventoryProductAttachmentsParamsSchema
)
export const parseGetInventoryProductAttachmentParams = Schema.decodeUnknown(GetInventoryProductAttachmentParamsSchema)
export const parseAddInventoryProductAttachmentParams = Schema.decodeUnknown(AddInventoryProductAttachmentParamsSchema)
export const parseUpdateInventoryProductAttachmentParams = Schema.decodeUnknown(
  UpdateInventoryProductAttachmentParamsSchema
)
export const parseDeleteInventoryProductAttachmentParams = Schema.decodeUnknown(
  DeleteInventoryProductAttachmentParamsSchema
)
export const parseListInventoryProductPhotosParams = Schema.decodeUnknown(ListInventoryProductPhotosParamsSchema)
export const parseGetInventoryProductPhotoParams = Schema.decodeUnknown(GetInventoryProductPhotoParamsSchema)
export const parseAddInventoryProductPhotoParams = Schema.decodeUnknown(AddInventoryProductPhotoParamsSchema)
export const parseUpdateInventoryProductPhotoParams = Schema.decodeUnknown(UpdateInventoryProductPhotoParamsSchema)
export const parseDeleteInventoryProductPhotoParams = Schema.decodeUnknown(DeleteInventoryProductPhotoParamsSchema)
export const parseListInventoryProductCommentsParams = Schema.decodeUnknown(ListInventoryProductCommentsParamsSchema)
export const parseAddInventoryProductCommentParams = Schema.decodeUnknown(AddInventoryProductCommentParamsSchema)
export const parseUpdateInventoryProductCommentParams = Schema.decodeUnknown(UpdateInventoryProductCommentParamsSchema)
export const parseDeleteInventoryProductCommentParams = Schema.decodeUnknown(DeleteInventoryProductCommentParamsSchema)
export const parseListInventoryProductActivityParams = Schema.decodeUnknown(ListInventoryProductActivityParamsSchema)
