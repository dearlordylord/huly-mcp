import { Schema } from "effect"

import { ActivityMessageWireSchema } from "./activity.js"
import { AttachmentSummaryWireSchema, AttachmentWireSchema } from "./attachments.js"
import { CommentSchema } from "./comments.js"
import {
  AttachmentId,
  BlobId,
  CommentId,
  Count,
  InventoryCategoryId,
  InventoryProductId,
  NonEmptyString,
  UrlString
} from "./shared.js"

const InventoryProductReferenceSchema = Schema.Struct({
  id: InventoryProductId,
  name: NonEmptyString,
  category: InventoryCategoryId
})
export type InventoryProductReference = Schema.Schema.Type<typeof InventoryProductReferenceSchema>

export const ListInventoryProductAttachmentsResultSchema = Schema.Struct({
  product: InventoryProductReferenceSchema,
  attachments: Schema.Array(AttachmentSummaryWireSchema),
  total: Count
})
export const GetInventoryProductAttachmentResultSchema = Schema.Struct({
  product: InventoryProductReferenceSchema,
  attachment: AttachmentWireSchema
})
export const AddInventoryProductAttachmentResultSchema = Schema.Struct({
  product: InventoryProductReferenceSchema,
  attachmentId: AttachmentId,
  blobId: BlobId,
  url: UrlString
})
export const UpdateInventoryProductAttachmentResultSchema = Schema.Struct({
  product: InventoryProductReferenceSchema,
  attachmentId: AttachmentId,
  updated: Schema.Boolean
})
export const DeleteInventoryProductAttachmentResultSchema = Schema.Struct({
  product: InventoryProductReferenceSchema,
  attachmentId: AttachmentId,
  deleted: Schema.Boolean
})

export const ListInventoryProductPhotosResultSchema = Schema.Struct({
  product: InventoryProductReferenceSchema,
  photos: Schema.Array(AttachmentSummaryWireSchema),
  total: Count
})
export const GetInventoryProductPhotoResultSchema = Schema.Struct({
  product: InventoryProductReferenceSchema,
  photo: AttachmentWireSchema
})
export const AddInventoryProductPhotoResultSchema = Schema.Struct({
  product: InventoryProductReferenceSchema,
  photoId: AttachmentId,
  blobId: BlobId,
  url: UrlString
})
export const UpdateInventoryProductPhotoResultSchema = Schema.Struct({
  product: InventoryProductReferenceSchema,
  photoId: AttachmentId,
  updated: Schema.Boolean
})
export const DeleteInventoryProductPhotoResultSchema = Schema.Struct({
  product: InventoryProductReferenceSchema,
  photoId: AttachmentId,
  deleted: Schema.Boolean
})

export const ListInventoryProductCommentsResultSchema = Schema.Struct({
  product: InventoryProductReferenceSchema,
  comments: Schema.Array(CommentSchema),
  total: Count
})
export const AddInventoryProductCommentResultSchema = Schema.Struct({
  product: InventoryProductReferenceSchema,
  commentId: CommentId
})
export const UpdateInventoryProductCommentResultSchema = Schema.Struct({
  product: InventoryProductReferenceSchema,
  commentId: CommentId,
  updated: Schema.Boolean
})
export const DeleteInventoryProductCommentResultSchema = Schema.Struct({
  product: InventoryProductReferenceSchema,
  commentId: CommentId,
  deleted: Schema.Boolean
})
export const ListInventoryProductActivityResultSchema = Schema.Struct({
  product: InventoryProductReferenceSchema,
  activity: Schema.Array(ActivityMessageWireSchema),
  total: Count
})

export type ListInventoryProductAttachmentsResult = Schema.Schema.Type<
  typeof ListInventoryProductAttachmentsResultSchema
>
export type GetInventoryProductAttachmentResult = Schema.Schema.Type<typeof GetInventoryProductAttachmentResultSchema>
export type AddInventoryProductAttachmentResult = Schema.Schema.Type<typeof AddInventoryProductAttachmentResultSchema>
export type UpdateInventoryProductAttachmentResult = Schema.Schema.Type<
  typeof UpdateInventoryProductAttachmentResultSchema
>
export type DeleteInventoryProductAttachmentResult = Schema.Schema.Type<
  typeof DeleteInventoryProductAttachmentResultSchema
>
export type ListInventoryProductPhotosResult = Schema.Schema.Type<typeof ListInventoryProductPhotosResultSchema>
export type GetInventoryProductPhotoResult = Schema.Schema.Type<typeof GetInventoryProductPhotoResultSchema>
export type AddInventoryProductPhotoResult = Schema.Schema.Type<typeof AddInventoryProductPhotoResultSchema>
export type UpdateInventoryProductPhotoResult = Schema.Schema.Type<typeof UpdateInventoryProductPhotoResultSchema>
export type DeleteInventoryProductPhotoResult = Schema.Schema.Type<typeof DeleteInventoryProductPhotoResultSchema>
export type ListInventoryProductCommentsResult = Schema.Schema.Type<typeof ListInventoryProductCommentsResultSchema>
export type AddInventoryProductCommentResult = Schema.Schema.Type<typeof AddInventoryProductCommentResultSchema>
export type UpdateInventoryProductCommentResult = Schema.Schema.Type<typeof UpdateInventoryProductCommentResultSchema>
export type DeleteInventoryProductCommentResult = Schema.Schema.Type<typeof DeleteInventoryProductCommentResultSchema>
export type ListInventoryProductActivityResult = Schema.Schema.Type<typeof ListInventoryProductActivityResultSchema>
