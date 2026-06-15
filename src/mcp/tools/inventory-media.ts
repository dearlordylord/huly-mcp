import {
  AddInventoryProductAttachmentResultSchema,
  AddInventoryProductCommentResultSchema,
  AddInventoryProductPhotoResultSchema,
  DeleteInventoryProductAttachmentResultSchema,
  DeleteInventoryProductCommentResultSchema,
  DeleteInventoryProductPhotoResultSchema,
  GetInventoryProductAttachmentResultSchema,
  GetInventoryProductPhotoResultSchema,
  ListInventoryProductActivityResultSchema,
  ListInventoryProductAttachmentsResultSchema,
  ListInventoryProductCommentsResultSchema,
  ListInventoryProductPhotosResultSchema,
  UpdateInventoryProductAttachmentResultSchema,
  UpdateInventoryProductCommentResultSchema,
  UpdateInventoryProductPhotoResultSchema
} from "../../domain/schemas/inventory-media-results.js"
import {
  addInventoryProductAttachmentParamsJsonSchema,
  addInventoryProductCommentParamsJsonSchema,
  addInventoryProductPhotoParamsJsonSchema,
  deleteInventoryProductAttachmentParamsJsonSchema,
  deleteInventoryProductCommentParamsJsonSchema,
  deleteInventoryProductPhotoParamsJsonSchema,
  getInventoryProductAttachmentParamsJsonSchema,
  getInventoryProductPhotoParamsJsonSchema,
  listInventoryProductActivityParamsJsonSchema,
  listInventoryProductAttachmentsParamsJsonSchema,
  listInventoryProductCommentsParamsJsonSchema,
  listInventoryProductPhotosParamsJsonSchema,
  parseAddInventoryProductAttachmentParams,
  parseAddInventoryProductCommentParams,
  parseAddInventoryProductPhotoParams,
  parseDeleteInventoryProductAttachmentParams,
  parseDeleteInventoryProductCommentParams,
  parseDeleteInventoryProductPhotoParams,
  parseGetInventoryProductAttachmentParams,
  parseGetInventoryProductPhotoParams,
  parseListInventoryProductActivityParams,
  parseListInventoryProductAttachmentsParams,
  parseListInventoryProductCommentsParams,
  parseListInventoryProductPhotosParams,
  parseUpdateInventoryProductAttachmentParams,
  parseUpdateInventoryProductCommentParams,
  parseUpdateInventoryProductPhotoParams,
  updateInventoryProductAttachmentParamsJsonSchema,
  updateInventoryProductCommentParamsJsonSchema,
  updateInventoryProductPhotoParamsJsonSchema
} from "../../domain/schemas/inventory-media.js"
import {
  addInventoryProductAttachment,
  addInventoryProductComment,
  addInventoryProductPhoto,
  deleteInventoryProductAttachment,
  deleteInventoryProductComment,
  deleteInventoryProductPhoto,
  getInventoryProductAttachment,
  getInventoryProductPhoto,
  listInventoryProductActivity,
  listInventoryProductAttachments,
  listInventoryProductComments,
  listInventoryProductPhotos,
  updateInventoryProductAttachment,
  updateInventoryProductComment,
  updateInventoryProductPhoto
} from "../../huly/operations/inventory.js"
import { createEncodedCombinedToolHandler, createEncodedToolHandler, type RegisteredTool } from "./registry.js"

const CATEGORY = "inventory" as const

export const inventoryMediaTools: ReadonlyArray<RegisteredTool> = [
  {
    name: "list_inventory_product_attachments",
    description:
      "List files attached directly to an inventory product resolved by product ID or exact name. Pass category to disambiguate duplicate product names.",
    category: CATEGORY,
    inputSchema: listInventoryProductAttachmentsParamsJsonSchema,
    handler: createEncodedToolHandler(
      "list_inventory_product_attachments",
      parseListInventoryProductAttachmentsParams,
      listInventoryProductAttachments,
      ListInventoryProductAttachmentsResultSchema
    )
  },
  {
    name: "get_inventory_product_attachment",
    description:
      "Get one file attached directly to an inventory product. The attachmentId must belong to the resolved product.",
    category: CATEGORY,
    inputSchema: getInventoryProductAttachmentParamsJsonSchema,
    handler: createEncodedCombinedToolHandler(
      "get_inventory_product_attachment",
      parseGetInventoryProductAttachmentParams,
      getInventoryProductAttachment,
      GetInventoryProductAttachmentResultSchema
    )
  },
  {
    name: "add_inventory_product_attachment",
    description:
      "Add a file to an inventory product resolved by product ID or exact name. Provide exactly one of filePath, fileUrl, or data.",
    category: CATEGORY,
    inputSchema: addInventoryProductAttachmentParamsJsonSchema,
    handler: createEncodedCombinedToolHandler(
      "add_inventory_product_attachment",
      parseAddInventoryProductAttachmentParams,
      addInventoryProductAttachment,
      AddInventoryProductAttachmentResultSchema
    )
  },
  {
    name: "update_inventory_product_attachment",
    description:
      "Update description and/or pinned state for a file attached directly to an inventory product. The attachmentId must belong to the resolved product.",
    category: CATEGORY,
    inputSchema: updateInventoryProductAttachmentParamsJsonSchema,
    handler: createEncodedToolHandler(
      "update_inventory_product_attachment",
      parseUpdateInventoryProductAttachmentParams,
      updateInventoryProductAttachment,
      UpdateInventoryProductAttachmentResultSchema
    )
  },
  {
    name: "delete_inventory_product_attachment",
    description:
      "Permanently delete a file attached directly to an inventory product. The attachmentId must belong to the resolved product.",
    category: CATEGORY,
    inputSchema: deleteInventoryProductAttachmentParamsJsonSchema,
    handler: createEncodedToolHandler(
      "delete_inventory_product_attachment",
      parseDeleteInventoryProductAttachmentParams,
      deleteInventoryProductAttachment,
      DeleteInventoryProductAttachmentResultSchema
    )
  },
  {
    name: "list_inventory_product_photos",
    description:
      "List photos attached directly to an inventory product resolved by product ID or exact name. Pass category to disambiguate duplicate product names.",
    category: CATEGORY,
    inputSchema: listInventoryProductPhotosParamsJsonSchema,
    handler: createEncodedToolHandler(
      "list_inventory_product_photos",
      parseListInventoryProductPhotosParams,
      listInventoryProductPhotos,
      ListInventoryProductPhotosResultSchema
    )
  },
  {
    name: "get_inventory_product_photo",
    description:
      "Get one photo attached directly to an inventory product. The photoId must belong to the resolved product.",
    category: CATEGORY,
    inputSchema: getInventoryProductPhotoParamsJsonSchema,
    handler: createEncodedCombinedToolHandler(
      "get_inventory_product_photo",
      parseGetInventoryProductPhotoParams,
      getInventoryProductPhoto,
      GetInventoryProductPhotoResultSchema
    )
  },
  {
    name: "add_inventory_product_photo",
    description:
      "Add a photo to an inventory product using Huly's product photos collection. Provide exactly one of filePath, fileUrl, or data.",
    category: CATEGORY,
    inputSchema: addInventoryProductPhotoParamsJsonSchema,
    handler: createEncodedCombinedToolHandler(
      "add_inventory_product_photo",
      parseAddInventoryProductPhotoParams,
      addInventoryProductPhoto,
      AddInventoryProductPhotoResultSchema
    )
  },
  {
    name: "update_inventory_product_photo",
    description:
      "Update description and/or pinned state for a photo attached directly to an inventory product. The photoId must belong to the resolved product.",
    category: CATEGORY,
    inputSchema: updateInventoryProductPhotoParamsJsonSchema,
    handler: createEncodedToolHandler(
      "update_inventory_product_photo",
      parseUpdateInventoryProductPhotoParams,
      updateInventoryProductPhoto,
      UpdateInventoryProductPhotoResultSchema
    )
  },
  {
    name: "delete_inventory_product_photo",
    description:
      "Permanently delete a photo attached directly to an inventory product. The photoId must belong to the resolved product.",
    category: CATEGORY,
    inputSchema: deleteInventoryProductPhotoParamsJsonSchema,
    handler: createEncodedToolHandler(
      "delete_inventory_product_photo",
      parseDeleteInventoryProductPhotoParams,
      deleteInventoryProductPhoto,
      DeleteInventoryProductPhotoResultSchema
    )
  },
  {
    name: "list_inventory_product_comments",
    description:
      "List comments attached directly to an inventory product resolved by product ID or exact name. Returns comments oldest first.",
    category: CATEGORY,
    inputSchema: listInventoryProductCommentsParamsJsonSchema,
    handler: createEncodedToolHandler(
      "list_inventory_product_comments",
      parseListInventoryProductCommentsParams,
      listInventoryProductComments,
      ListInventoryProductCommentsResultSchema
    )
  },
  {
    name: "add_inventory_product_comment",
    description:
      "Add a Markdown comment directly to an inventory product resolved by product ID or exact name. Pass category to disambiguate duplicate names.",
    category: CATEGORY,
    inputSchema: addInventoryProductCommentParamsJsonSchema,
    handler: createEncodedToolHandler(
      "add_inventory_product_comment",
      parseAddInventoryProductCommentParams,
      addInventoryProductComment,
      AddInventoryProductCommentResultSchema
    )
  },
  {
    name: "update_inventory_product_comment",
    description:
      "Update a comment attached directly to an inventory product. The commentId must belong to the resolved product.",
    category: CATEGORY,
    inputSchema: updateInventoryProductCommentParamsJsonSchema,
    handler: createEncodedToolHandler(
      "update_inventory_product_comment",
      parseUpdateInventoryProductCommentParams,
      updateInventoryProductComment,
      UpdateInventoryProductCommentResultSchema
    )
  },
  {
    name: "delete_inventory_product_comment",
    description:
      "Permanently delete a comment attached directly to an inventory product. The commentId must belong to the resolved product.",
    category: CATEGORY,
    inputSchema: deleteInventoryProductCommentParamsJsonSchema,
    handler: createEncodedToolHandler(
      "delete_inventory_product_comment",
      parseDeleteInventoryProductCommentParams,
      deleteInventoryProductComment,
      DeleteInventoryProductCommentResultSchema
    )
  },
  {
    name: "list_inventory_product_activity",
    description:
      "List activity messages for an inventory product resolved by product ID or exact name. This is read-only audit/activity history, newest first.",
    category: CATEGORY,
    inputSchema: listInventoryProductActivityParamsJsonSchema,
    handler: createEncodedToolHandler(
      "list_inventory_product_activity",
      parseListInventoryProductActivityParams,
      listInventoryProductActivity,
      ListInventoryProductActivityResultSchema
    )
  }
]
