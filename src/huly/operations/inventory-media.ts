import type { ActivityMessage as HulyActivityMessage } from "@hcengineering/activity"
import type { Attachment as HulyAttachment } from "@hcengineering/attachment"
import type { Class, Ref } from "@hcengineering/core"
import { SortingOrder } from "@hcengineering/core"
import type { Product as HulyInventoryProduct } from "@hcengineering/inventory"
import { Effect } from "effect"

import type {
  AddInventoryProductAttachmentResult,
  AddInventoryProductCommentResult,
  AddInventoryProductPhotoResult,
  DeleteInventoryProductAttachmentResult,
  DeleteInventoryProductCommentResult,
  DeleteInventoryProductPhotoResult,
  GetInventoryProductAttachmentResult,
  GetInventoryProductPhotoResult,
  InventoryProductReference,
  ListInventoryProductActivityResult,
  ListInventoryProductAttachmentsResult,
  ListInventoryProductCommentsResult,
  ListInventoryProductPhotosResult,
  UpdateInventoryProductAttachmentResult,
  UpdateInventoryProductCommentResult,
  UpdateInventoryProductPhotoResult
} from "../../domain/schemas/inventory-media-results.js"
import type {
  AddInventoryProductAttachmentParams,
  AddInventoryProductCommentParams,
  AddInventoryProductPhotoParams,
  DeleteInventoryProductAttachmentParams,
  DeleteInventoryProductCommentParams,
  DeleteInventoryProductPhotoParams,
  GetInventoryProductAttachmentParams,
  GetInventoryProductPhotoParams,
  ListInventoryProductActivityParams,
  ListInventoryProductAttachmentsParams,
  ListInventoryProductCommentsParams,
  ListInventoryProductPhotosParams,
  UpdateInventoryProductAttachmentParams,
  UpdateInventoryProductCommentParams,
  UpdateInventoryProductPhotoParams
} from "../../domain/schemas/inventory-media.js"
import { AttachmentId, Count, InventoryCategoryId, InventoryProductId } from "../../domain/schemas/shared.js"
import type { InventoryCategoryIdentifier, InventoryProductIdentifier } from "../../domain/schemas/shared.js"
import { HulyClient, type HulyClientError } from "../client.js"
import type {
  AttachmentNotFoundError,
  FileFetchError,
  FileNotFoundError,
  FileTooLargeError,
  InvalidContentTypeError,
  InvalidFileDataError,
  NoUpdateFieldsError
} from "../errors.js"
import { InventoryMutationUnsupportedError, InventoryProductCommentNotFoundError } from "../errors.js"
import { activity, attachment, inventory } from "../huly-plugins.js"
import { HulyStorageClient, type StorageClientError } from "../storage.js"
import { toActivityMessage } from "./activity-shared.js"
import {
  addAttachedComment,
  type AttachedCommentTarget,
  deleteAttachedComment,
  listAttachedCommentsPage,
  updateAttachedComment
} from "./attached-comments.js"
import {
  type AttachmentCollectionScope,
  findAttachmentForScope,
  getAttachmentForScope,
  listAttachmentPageForScope,
  updateAttachmentForScope
} from "./attachments-shared.js"
import { uploadAndAttach } from "./attachments-upload.js"
import { type InventoryError, requireRemoveCollection, resolveProduct, workspace } from "./inventory-shared.js"
import { clampLimit, findResultTotal, hulyQuery } from "./query-helpers.js"
import { requireUpdateFields } from "./update-guards.js"

type InventoryProductMediaReadError =
  | InventoryError
  | AttachmentNotFoundError

type InventoryProductMediaAddError =
  | InventoryError
  | StorageClientError
  | InvalidFileDataError
  | FileNotFoundError
  | FileFetchError
  | FileTooLargeError
  | InvalidContentTypeError

type InventoryProductMediaUpdateError =
  | InventoryProductMediaReadError
  | NoUpdateFieldsError

type InventoryProductMediaDeleteError =
  | InventoryProductMediaReadError
  | InventoryMutationUnsupportedError

type InventoryProductCommentError =
  | InventoryError
  | HulyClientError
  | InventoryProductCommentNotFoundError

interface ResolvedProductTarget {
  readonly client: HulyClient["Type"]
  readonly product: HulyInventoryProduct
  readonly reference: InventoryProductReference
}

const productReference = (product: HulyInventoryProduct): InventoryProductReference => ({
  id: InventoryProductId.make(product._id),
  name: product.name,
  category: InventoryCategoryId.make(product.attachedTo)
})

const resolveProductTarget = (params: {
  readonly product: InventoryProductIdentifier
  readonly category?: InventoryCategoryIdentifier | undefined
}): Effect.Effect<ResolvedProductTarget, InventoryError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const product = yield* resolveProduct(client, params.product, params.category)
    return { client, product, reference: productReference(product) }
  })

const productMediaScope = (
  product: HulyInventoryProduct,
  classRef: Ref<Class<HulyAttachment>>,
  collection: string
): AttachmentCollectionScope => ({
  classRef,
  attachedTo: product._id,
  attachedToClass: inventory.class.Product,
  collection
})

const productCommentTarget = (target: ResolvedProductTarget): AttachedCommentTarget => ({
  client: target.client,
  space: workspace,
  attachedTo: target.product._id,
  attachedToClass: inventory.class.Product,
  collection: "comments"
})

const productCommentNotFound = (product: HulyInventoryProduct, commentId: string) =>
  new InventoryProductCommentNotFoundError({ product: product.name, commentId })

const removeProductMedia = (
  target: ResolvedProductTarget,
  scope: AttachmentCollectionScope,
  mediaId: AttachmentId
): Effect.Effect<void, InventoryProductMediaDeleteError> =>
  Effect.gen(function*() {
    const media = yield* findAttachmentForScope(target.client, mediaId, scope)
    const removeCollection = requireRemoveCollection(target.client)
    if (removeCollection instanceof InventoryMutationUnsupportedError) return yield* removeCollection
    yield* removeCollection(
      scope.classRef,
      media.space,
      media._id,
      target.product._id,
      inventory.class.Product,
      scope.collection
    )
  })

export const listInventoryProductAttachments = (
  params: ListInventoryProductAttachmentsParams
): Effect.Effect<ListInventoryProductAttachmentsResult, InventoryError, HulyClient> =>
  Effect.gen(function*() {
    const target = yield* resolveProductTarget(params)
    const page = yield* listAttachmentPageForScope(
      target.client,
      productMediaScope(target.product, attachment.class.Attachment, "attachments"),
      params.limit
    )
    return { product: target.reference, attachments: page.attachments, total: page.total }
  })

export const getInventoryProductAttachment = (
  params: GetInventoryProductAttachmentParams
): Effect.Effect<GetInventoryProductAttachmentResult, InventoryProductMediaReadError, HulyClient | HulyStorageClient> =>
  Effect.gen(function*() {
    const storageClient = yield* HulyStorageClient
    const target = yield* resolveProductTarget(params)
    const attachmentResult = yield* getAttachmentForScope(
      target.client,
      storageClient,
      params.attachmentId,
      productMediaScope(target.product, attachment.class.Attachment, "attachments")
    )
    return { product: target.reference, attachment: attachmentResult }
  })

export const addInventoryProductAttachment = (
  params: AddInventoryProductAttachmentParams
): Effect.Effect<AddInventoryProductAttachmentResult, InventoryProductMediaAddError, HulyClient | HulyStorageClient> =>
  Effect.gen(function*() {
    const target = yield* resolveProductTarget(params)
    const result = yield* uploadAndAttach(params, {
      spaceRef: workspace,
      objectRef: target.product._id,
      objectClassRef: inventory.class.Product,
      attachmentClassRef: attachment.class.Attachment,
      collection: "attachments"
    })
    return {
      product: target.reference,
      attachmentId: result.attachmentId,
      blobId: result.blobId,
      url: result.url
    }
  })

export const updateInventoryProductAttachment = (
  params: UpdateInventoryProductAttachmentParams
): Effect.Effect<UpdateInventoryProductAttachmentResult, InventoryProductMediaUpdateError, HulyClient> =>
  Effect.gen(function*() {
    yield* requireUpdateFields("update_inventory_product_attachment", params, ["description", "pinned"])
    const target = yield* resolveProductTarget(params)
    yield* updateAttachmentForScope(
      target.client,
      params.attachmentId,
      params,
      productMediaScope(target.product, attachment.class.Attachment, "attachments")
    )
    return { product: target.reference, attachmentId: AttachmentId.make(params.attachmentId), updated: true }
  })

export const deleteInventoryProductAttachment = (
  params: DeleteInventoryProductAttachmentParams
): Effect.Effect<DeleteInventoryProductAttachmentResult, InventoryProductMediaDeleteError, HulyClient> =>
  Effect.gen(function*() {
    const target = yield* resolveProductTarget(params)
    yield* removeProductMedia(
      target,
      productMediaScope(target.product, attachment.class.Attachment, "attachments"),
      params.attachmentId
    )
    return { product: target.reference, attachmentId: AttachmentId.make(params.attachmentId), deleted: true }
  })

export const listInventoryProductPhotos = (
  params: ListInventoryProductPhotosParams
): Effect.Effect<ListInventoryProductPhotosResult, InventoryError, HulyClient> =>
  Effect.gen(function*() {
    const target = yield* resolveProductTarget(params)
    const page = yield* listAttachmentPageForScope(
      target.client,
      productMediaScope(target.product, attachment.class.Photo, "photos"),
      params.limit
    )
    return { product: target.reference, photos: page.attachments, total: page.total }
  })

export const getInventoryProductPhoto = (
  params: GetInventoryProductPhotoParams
): Effect.Effect<GetInventoryProductPhotoResult, InventoryProductMediaReadError, HulyClient | HulyStorageClient> =>
  Effect.gen(function*() {
    const storageClient = yield* HulyStorageClient
    const target = yield* resolveProductTarget(params)
    const photo = yield* getAttachmentForScope(
      target.client,
      storageClient,
      params.photoId,
      productMediaScope(target.product, attachment.class.Photo, "photos")
    )
    return { product: target.reference, photo }
  })

export const addInventoryProductPhoto = (
  params: AddInventoryProductPhotoParams
): Effect.Effect<AddInventoryProductPhotoResult, InventoryProductMediaAddError, HulyClient | HulyStorageClient> =>
  Effect.gen(function*() {
    const target = yield* resolveProductTarget(params)
    const result = yield* uploadAndAttach(params, {
      spaceRef: workspace,
      objectRef: target.product._id,
      objectClassRef: inventory.class.Product,
      attachmentClassRef: attachment.class.Photo,
      collection: "photos"
    })
    return {
      product: target.reference,
      photoId: result.attachmentId,
      blobId: result.blobId,
      url: result.url
    }
  })

export const updateInventoryProductPhoto = (
  params: UpdateInventoryProductPhotoParams
): Effect.Effect<UpdateInventoryProductPhotoResult, InventoryProductMediaUpdateError, HulyClient> =>
  Effect.gen(function*() {
    yield* requireUpdateFields("update_inventory_product_photo", params, ["description", "pinned"])
    const target = yield* resolveProductTarget(params)
    yield* updateAttachmentForScope(
      target.client,
      params.photoId,
      params,
      productMediaScope(target.product, attachment.class.Photo, "photos")
    )
    return { product: target.reference, photoId: AttachmentId.make(params.photoId), updated: true }
  })

export const deleteInventoryProductPhoto = (
  params: DeleteInventoryProductPhotoParams
): Effect.Effect<DeleteInventoryProductPhotoResult, InventoryProductMediaDeleteError, HulyClient> =>
  Effect.gen(function*() {
    const target = yield* resolveProductTarget(params)
    yield* removeProductMedia(
      target,
      productMediaScope(target.product, attachment.class.Photo, "photos"),
      params.photoId
    )
    return { product: target.reference, photoId: AttachmentId.make(params.photoId), deleted: true }
  })

export const listInventoryProductComments = (
  params: ListInventoryProductCommentsParams
): Effect.Effect<ListInventoryProductCommentsResult, InventoryProductCommentError, HulyClient> =>
  Effect.gen(function*() {
    const target = yield* resolveProductTarget(params)
    const page = yield* listAttachedCommentsPage(productCommentTarget(target), params.limit, "Inventory product")
    return { product: target.reference, comments: page.comments, total: page.total }
  })

export const addInventoryProductComment = (
  params: AddInventoryProductCommentParams
): Effect.Effect<AddInventoryProductCommentResult, InventoryProductCommentError, HulyClient> =>
  Effect.gen(function*() {
    const target = yield* resolveProductTarget(params)
    const commentId = yield* addAttachedComment(productCommentTarget(target), params.body)
    return { product: target.reference, commentId }
  })

export const updateInventoryProductComment = (
  params: UpdateInventoryProductCommentParams
): Effect.Effect<UpdateInventoryProductCommentResult, InventoryProductCommentError, HulyClient> =>
  Effect.gen(function*() {
    const target = yield* resolveProductTarget(params)
    const updated = yield* updateAttachedComment(
      productCommentTarget(target),
      params.commentId,
      params.body,
      () => productCommentNotFound(target.product, params.commentId)
    )
    return { product: target.reference, commentId: params.commentId, updated }
  })

export const deleteInventoryProductComment = (
  params: DeleteInventoryProductCommentParams
): Effect.Effect<DeleteInventoryProductCommentResult, InventoryProductCommentError, HulyClient> =>
  Effect.gen(function*() {
    const target = yield* resolveProductTarget(params)
    yield* deleteAttachedComment(
      productCommentTarget(target),
      params.commentId,
      () => productCommentNotFound(target.product, params.commentId)
    )
    return { product: target.reference, commentId: params.commentId, deleted: true }
  })

export const listInventoryProductActivity = (
  params: ListInventoryProductActivityParams
): Effect.Effect<ListInventoryProductActivityResult, InventoryError, HulyClient> =>
  Effect.gen(function*() {
    const target = yield* resolveProductTarget(params)
    const messages = yield* target.client.findAll<HulyActivityMessage>(
      activity.class.ActivityMessage,
      hulyQuery<HulyActivityMessage>({
        attachedTo: target.product._id,
        attachedToClass: inventory.class.Product
      }),
      {
        limit: clampLimit(params.limit),
        sort: { modifiedOn: SortingOrder.Descending },
        total: true
      }
    )
    const activityMessages = messages.map((message) => toActivityMessage(message, target.client.markupUrlConfig))
    return { product: target.reference, activity: activityMessages, total: Count.make(findResultTotal(messages)) }
  })
