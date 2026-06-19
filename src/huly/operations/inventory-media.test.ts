import { assertAt } from "../../utils/assertions.js"
/* eslint-disable no-restricted-syntax -- Fixture-only casts bridge SDK phantom refs and structurally compatible Huly doc literals into generic fake-client storage. */
import { describe, it } from "@effect/vitest"
import type { ActivityMessage as HulyActivityMessage } from "@hcengineering/activity"
import type { Attachment as HulyAttachment } from "@hcengineering/attachment"
import type { ChatMessage } from "@hcengineering/chunter"
import type {
  AttachedData,
  AttachedDoc,
  Class,
  Doc,
  DocumentQuery,
  DocumentUpdate,
  FindOptions,
  PersonId,
  Ref,
  Space
} from "@hcengineering/core"
import type { Category as HulyInventoryCategory, Product as HulyInventoryProduct } from "@hcengineering/inventory"
import { Effect, Layer } from "effect"
import { expect } from "vitest"

import {
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
  parseUpdateInventoryProductPhotoParams
} from "../../domain/schemas/inventory-media.js"
import { parseDeleteInventoryProductParams } from "../../domain/schemas/inventory.js"
import { HulyClient, type HulyClientOperations } from "../client.js"
import { HulyConnectionError, InventoryMutationUnsupportedError, InventoryNotEmptyError } from "../errors.js"
import { activity, attachment, chunter, inventory } from "../huly-plugins.js"
import { HulyStorageClient, type HulyStorageOperations } from "../storage.js"
import {
  addInventoryProductAttachment,
  addInventoryProductComment,
  addInventoryProductPhoto,
  deleteInventoryProduct,
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
} from "./inventory.js"
import { markdownToMarkupString, testMarkupUrlConfig } from "./markup.js"
import { findResultTotal } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"

const workspace = "core:space:Workspace" as Ref<Space>
const person = "person-1" as PersonId

interface AddCall {
  readonly classRef: string
  readonly attachedTo: string
  readonly attachedToClass: string
  readonly collection: string
}

interface RemoveCollectionCall {
  readonly classRef: string
  readonly objectId: string
  readonly attachedTo: string
  readonly collection: string
}

interface RemoveDocCall {
  readonly classRef: string
  readonly objectId: string
}

interface FindAllCall {
  readonly classRef: string
  readonly total: boolean | undefined
}

interface State {
  readonly categories: Array<HulyInventoryCategory>
  readonly products: Array<HulyInventoryProduct>
  readonly attachments: Array<HulyAttachment>
  readonly photos: Array<HulyAttachment>
  readonly comments: Array<ChatMessage>
  readonly activityMessages: Array<HulyActivityMessage>
  readonly addCalls: Array<AddCall>
  readonly removeCollectionCalls: Array<RemoveCollectionCall>
  readonly removeDocCalls: Array<RemoveDocCall>
  readonly findAllCalls: Array<FindAllCall>
  nextBlob: number
}

const baseDoc = {
  space: workspace,
  modifiedBy: person,
  modifiedOn: 1,
  createdBy: person,
  createdOn: 1
}

const category = (id: string, name: string): HulyInventoryCategory => ({
  ...baseDoc,
  _id: toRef<HulyInventoryCategory>(id),
  _class: inventory.class.Category,
  attachedTo: inventory.global.Category,
  attachedToClass: inventory.class.Category,
  collection: "categories",
  name
})

const product = (id: string, name: string, categoryId: Ref<HulyInventoryCategory>): HulyInventoryProduct => ({
  ...baseDoc,
  _id: toRef<HulyInventoryProduct>(id),
  _class: inventory.class.Product,
  attachedTo: categoryId,
  attachedToClass: inventory.class.Category,
  collection: "products",
  name,
  variants: 0,
  photos: 0,
  attachments: 0
})

const media = (
  id: string,
  classRef: Ref<Class<HulyAttachment>>,
  attachedTo: Ref<HulyInventoryProduct>,
  collection: string
): HulyAttachment => ({
  ...baseDoc,
  _id: toRef<HulyAttachment>(id),
  _class: classRef,
  attachedTo,
  attachedToClass: inventory.class.Product,
  collection,
  name: `${id}.txt`,
  file: toRef("blob-1"),
  type: "text/plain",
  size: 5,
  lastModified: 1,
  pinned: false
})

const comment = (id: string, attachedTo: Ref<HulyInventoryProduct>, body: string): ChatMessage => ({
  ...baseDoc,
  _id: toRef<ChatMessage>(id),
  _class: chunter.class.ChatMessage,
  attachedTo,
  attachedToClass: inventory.class.Product,
  collection: "comments",
  message: markdownToMarkupString(body, testMarkupUrlConfig),
  editedOn: undefined,
  isPinned: false,
  replies: 0,
  reactions: 0
  // The SDK ChatMessage type includes plugin fields not read by these operations; this fixture includes the fields under test.
} as unknown as ChatMessage)

const activityMessage = (id: string, attachedTo: Ref<HulyInventoryProduct>): HulyActivityMessage => ({
  ...baseDoc,
  _id: toRef<HulyActivityMessage>(id),
  _class: activity.class.ActivityMessage,
  attachedTo,
  attachedToClass: inventory.class.Product,
  collection: "activity",
  isPinned: false,
  replies: 0,
  reactions: 0
})

const matchesQuery = (doc: Doc, query: DocumentQuery<Doc>) =>
  Object.entries(query).every(([key, value]) => Reflect.get(doc, key) === value)

const docsForClass = (state: State, classRef: Ref<Class<Doc>>): ReadonlyArray<Doc> =>
  classRef === inventory.class.Category
    ? state.categories
    : classRef === inventory.class.Product
    ? state.products
    : classRef === attachment.class.Attachment
    ? state.attachments
    : classRef === attachment.class.Photo
    ? state.photos
    : classRef === chunter.class.ChatMessage
    ? state.comments
    : classRef === activity.class.ActivityMessage
    ? state.activityMessages
    : []

const applyOptions = <T extends Doc>(docs: ReadonlyArray<T>, options: FindOptions<T> | undefined): ReadonlyArray<T> =>
  options?.limit === undefined ? docs : docs.slice(0, options.limit)

const upsertDoc = <T extends Doc>(docs: Array<T>, objectId: Ref<T>, operations: DocumentUpdate<T>): void => {
  const index = docs.findIndex((doc) => doc._id === objectId)
  if (index >= 0) Object.assign(assertAt(docs, index), operations)
}

const removeDoc = <T extends Doc>(docs: Array<T>, objectId: Ref<T>): void => {
  const index = docs.findIndex((doc) => doc._id === objectId)
  if (index >= 0) docs.splice(index, 1)
}

const baseState = (): State => {
  const electronics = category("cat-electronics", "Electronics")
  const clothing = category("cat-clothing", "Clothing")
  const camera = product("prod-camera", "Camera", electronics._id)
  const otherCamera = product("prod-other-camera", "Camera", clothing._id)
  return {
    categories: [electronics, clothing],
    products: [camera, otherCamera],
    attachments: [
      media("att-camera", attachment.class.Attachment, camera._id, "attachments"),
      media("att-other", attachment.class.Attachment, otherCamera._id, "attachments")
    ],
    photos: [
      media("photo-camera", attachment.class.Photo, camera._id, "photos"),
      media("photo-other", attachment.class.Photo, otherCamera._id, "photos")
    ],
    comments: [comment("comment-camera", camera._id, "Initial")],
    activityMessages: [
      activityMessage("activity-camera", camera._id),
      activityMessage("activity-other", otherCamera._id)
    ],
    addCalls: [],
    removeCollectionCalls: [],
    removeDocCalls: [],
    findAllCalls: [],
    nextBlob: 1
  }
}

const makeLayer = (state: State, includeRemoveCollection = true): Layer.Layer<HulyClient | HulyStorageClient> => {
  const findAll: HulyClientOperations["findAll"] = <T extends Doc>(
    classRef: Ref<Class<T>>,
    query: DocumentQuery<T>,
    options?: FindOptions<T>
  ) => {
    state.findAllCalls.push({ classRef: String(classRef), total: options?.total })
    const docs = docsForClass(state, classRef as Ref<Class<Doc>>)
    const filtered = docs.filter((doc) => matchesQuery(doc, query as DocumentQuery<Doc>))
    return Effect.succeed(Object.assign([...applyOptions(filtered as Array<T>, options)], { total: filtered.length }))
  }

  const findOne: HulyClientOperations["findOne"] = <T extends Doc>(
    classRef: Ref<Class<T>>,
    query: DocumentQuery<T>
  ) => Effect.map(findAll(classRef, query), (docs) => docs.at(0))

  const addCollection: HulyClientOperations["addCollection"] = <T extends Doc, P extends AttachedDoc>(
    classRef: Ref<Class<P>>,
    space: Ref<Space>,
    attachedTo: Ref<T>,
    attachedToClass: Ref<Class<T>>,
    collection: string,
    attributes: AttachedData<P>,
    id?: Ref<P>
  ) => {
    state.addCalls.push({
      classRef: String(classRef),
      attachedTo: String(attachedTo),
      attachedToClass: String(attachedToClass),
      collection
    })
    const createdId = id ?? toRef<P>(`created-${state.addCalls.length}`)
    if (classRef === attachment.class.Attachment || classRef === attachment.class.Photo) {
      const target = classRef === attachment.class.Attachment ? state.attachments : state.photos
      target.push({
        ...baseDoc,
        _id: createdId as unknown as Ref<HulyAttachment>,
        _class: classRef as unknown as Ref<Class<HulyAttachment>>,
        space,
        attachedTo: attachedTo as unknown as Ref<Doc>,
        attachedToClass: attachedToClass as unknown as Ref<Class<Doc>>,
        collection,
        ...(attributes as unknown as AttachedData<HulyAttachment>)
      } as HulyAttachment)
    }
    if (classRef === chunter.class.ChatMessage) {
      state.comments.push({
        ...baseDoc,
        _id: createdId as unknown as Ref<ChatMessage>,
        _class: chunter.class.ChatMessage,
        space,
        attachedTo: attachedTo as unknown as Ref<Doc>,
        attachedToClass: attachedToClass as unknown as Ref<Class<Doc>>,
        collection,
        editedOn: undefined,
        isPinned: false,
        replies: 0,
        reactions: 0,
        ...(attributes as unknown as AttachedData<ChatMessage>)
      } as ChatMessage)
    }
    return Effect.succeed(createdId)
  }

  const updateDoc: HulyClientOperations["updateDoc"] = <T extends Doc>(
    classRef: Ref<Class<T>>,
    _space: Ref<Space>,
    objectId: Ref<T>,
    operations: DocumentUpdate<T>
  ) => {
    if (classRef === attachment.class.Attachment) {
      upsertDoc(
        state.attachments,
        objectId as unknown as Ref<HulyAttachment>,
        operations as unknown as DocumentUpdate<HulyAttachment>
      )
    }
    if (classRef === attachment.class.Photo) {
      upsertDoc(
        state.photos,
        objectId as unknown as Ref<HulyAttachment>,
        operations as unknown as DocumentUpdate<HulyAttachment>
      )
    }
    if (classRef === chunter.class.ChatMessage) {
      upsertDoc(
        state.comments,
        objectId as unknown as Ref<ChatMessage>,
        operations as unknown as DocumentUpdate<ChatMessage>
      )
    }
    return Effect.succeed([])
  }

  const removeDocImpl: HulyClientOperations["removeDoc"] = <T extends Doc>(
    classRef: Ref<Class<T>>,
    _space: Ref<Space>,
    objectId: Ref<T>
  ) => {
    state.removeDocCalls.push({ classRef: String(classRef), objectId: String(objectId) })
    if (classRef === chunter.class.ChatMessage) removeDoc(state.comments, objectId as unknown as Ref<ChatMessage>)
    return Effect.succeed([])
  }

  const removeCollection: NonNullable<HulyClientOperations["removeCollection"]> = <
    T extends Doc,
    P extends AttachedDoc
  >(
    classRef: Ref<Class<P>>,
    _space: Ref<Space>,
    objectId: Ref<P>,
    attachedTo: Ref<T>,
    _attachedToClass: Ref<Class<T>>,
    collection: string
  ) => {
    state.removeCollectionCalls.push({
      classRef: String(classRef),
      objectId: String(objectId),
      attachedTo: String(attachedTo),
      collection
    })
    if (classRef === attachment.class.Attachment) {
      removeDoc(state.attachments, objectId as unknown as Ref<HulyAttachment>)
    }
    if (classRef === attachment.class.Photo) removeDoc(state.photos, objectId as unknown as Ref<HulyAttachment>)
    if (classRef === inventory.class.Product) {
      removeDoc(state.products, objectId as unknown as Ref<HulyInventoryProduct>)
    }
    return Effect.succeed(attachedTo)
  }

  const client = HulyClient.testLayer({
    findAll,
    findOne,
    addCollection,
    updateDoc,
    removeDoc: removeDocImpl,
    ...(includeRemoveCollection ? { removeCollection } : {})
  })
  const storage: HulyStorageOperations = {
    uploadFile: (filename, data, contentType) =>
      Effect.succeed({
        blobId: toRef(`blob-${state.nextBlob++}`),
        contentType,
        size: data.length,
        url: `https://files.test/${filename}`
      }),
    getFileUrl: (blobId) => `https://files.test/${blobId}`
  }
  return Layer.merge(client, HulyStorageClient.testLayer(storage))
}

describe("inventory product media schemas", () => {
  it.effect("rejects empty locators, invalid file sources, and no-op media updates", () =>
    Effect.gen(function*() {
      expect((yield* Effect.exit(parseListInventoryProductAttachmentsParams({ product: "  " })))._tag).toBe("Failure")
      expect(
        (yield* Effect.exit(parseAddInventoryProductAttachmentParams({
          product: "Camera",
          filename: "file.txt",
          contentType: "text/plain"
        })))._tag
      ).toBe("Failure")
      expect(
        (yield* Effect.exit(parseAddInventoryProductPhotoParams({
          product: "Camera",
          filename: "photo.png",
          contentType: "image/png",
          data: "aGVsbG8=",
          fileUrl: "https://example.test/photo.png"
        })))._tag
      ).toBe("Failure")
      expect(
        (yield* Effect.exit(parseUpdateInventoryProductAttachmentParams({
          product: "Camera",
          attachmentId: "att-camera"
        })))._tag
      ).toBe("Failure")
      expect(
        (yield* Effect.exit(parseUpdateInventoryProductPhotoParams({
          product: "Camera",
          photoId: "photo-camera"
        })))._tag
      ).toBe("Failure")
    }))
})

describe("inventory product media operations", () => {
  it.effect("adds attachments and photos with the exact Huly class and collection", () =>
    Effect.gen(function*() {
      const state = baseState()
      const layer = makeLayer(state)
      const attachmentParams = yield* parseAddInventoryProductAttachmentParams({
        product: "Camera",
        category: "Electronics",
        filename: "manual.txt",
        contentType: "text/plain",
        data: "aGVsbG8="
      })
      const photoParams = yield* parseAddInventoryProductPhotoParams({
        product: "Camera",
        category: "Electronics",
        filename: "front.png",
        contentType: "image/png",
        data: "aGVsbG8="
      })

      const addedAttachment = yield* addInventoryProductAttachment(attachmentParams).pipe(Effect.provide(layer))
      const addedPhoto = yield* addInventoryProductPhoto(photoParams).pipe(Effect.provide(layer))

      expect(addedAttachment.product).toMatchObject({ id: "prod-camera", name: "Camera", category: "cat-electronics" })
      expect(addedPhoto.product.id).toBe("prod-camera")
      expect(state.addCalls.at(-2)).toMatchObject({
        classRef: attachment.class.Attachment,
        attachedTo: "prod-camera",
        attachedToClass: inventory.class.Product,
        collection: "attachments"
      })
      expect(state.addCalls.at(-1)).toMatchObject({
        classRef: attachment.class.Photo,
        attachedTo: "prod-camera",
        attachedToClass: inventory.class.Product,
        collection: "photos"
      })
    }))

  it.effect("scopes attachment list/get/update/delete to the resolved product and uses removeCollection", () =>
    Effect.gen(function*() {
      const state = baseState()
      const layer = makeLayer(state)
      const listParams = yield* parseListInventoryProductAttachmentsParams({
        product: "Camera",
        category: "Electronics"
      })
      const getParams = yield* parseGetInventoryProductAttachmentParams({
        product: "Camera",
        category: "Electronics",
        attachmentId: "att-camera"
      })
      const otherGetParams = yield* parseGetInventoryProductAttachmentParams({
        product: "Camera",
        category: "Electronics",
        attachmentId: "att-other"
      })
      const updateParams = yield* parseUpdateInventoryProductAttachmentParams({
        product: "Camera",
        category: "Electronics",
        attachmentId: "att-camera",
        pinned: true
      })
      const deleteParams = yield* parseDeleteInventoryProductAttachmentParams({
        product: "Camera",
        category: "Electronics",
        attachmentId: "att-camera"
      })

      const listed = yield* listInventoryProductAttachments(listParams).pipe(Effect.provide(layer))
      const found = yield* getInventoryProductAttachment(getParams).pipe(Effect.provide(layer))
      const wrongProduct = yield* Effect.flip(getInventoryProductAttachment(otherGetParams).pipe(Effect.provide(layer)))
      const updated = yield* updateInventoryProductAttachment(updateParams).pipe(Effect.provide(layer))
      expect(state.attachments.find((item) => item._id === "att-camera")).toMatchObject({ pinned: true })
      const deleted = yield* deleteInventoryProductAttachment(deleteParams).pipe(Effect.provide(layer))

      expect(listed.attachments.map((item) => item.id)).toEqual(["att-camera"])
      expect(found.attachment.id).toBe("att-camera")
      expect(wrongProduct._tag).toBe("AttachmentNotFoundError")
      expect(updated.updated).toBe(true)
      expect(deleted.deleted).toBe(true)
      expect(state.removeCollectionCalls).toEqual([{
        classRef: attachment.class.Attachment,
        objectId: "att-camera",
        attachedTo: "prod-camera",
        collection: "attachments"
      }])
      expect(state.removeDocCalls).toEqual([])
    }))

  it.effect("scopes photo list/get/update/delete to the resolved product and uses removeCollection", () =>
    Effect.gen(function*() {
      const state = baseState()
      const layer = makeLayer(state)
      const listParams = yield* parseListInventoryProductPhotosParams({
        product: "Camera",
        category: "Electronics"
      })
      const getParams = yield* parseGetInventoryProductPhotoParams({
        product: "Camera",
        category: "Electronics",
        photoId: "photo-camera"
      })
      const otherGetParams = yield* parseGetInventoryProductPhotoParams({
        product: "Camera",
        category: "Electronics",
        photoId: "photo-other"
      })
      const updateParams = yield* parseUpdateInventoryProductPhotoParams({
        product: "Camera",
        category: "Electronics",
        photoId: "photo-camera",
        description: "Front view"
      })
      const deleteParams = yield* parseDeleteInventoryProductPhotoParams({
        product: "Camera",
        category: "Electronics",
        photoId: "photo-camera"
      })

      const listed = yield* listInventoryProductPhotos(listParams).pipe(Effect.provide(layer))
      const found = yield* getInventoryProductPhoto(getParams).pipe(Effect.provide(layer))
      const wrongProduct = yield* Effect.flip(getInventoryProductPhoto(otherGetParams).pipe(Effect.provide(layer)))
      const updated = yield* updateInventoryProductPhoto(updateParams).pipe(Effect.provide(layer))
      expect(state.photos.find((item) => item._id === "photo-camera")).toMatchObject({ description: "Front view" })
      const deleted = yield* deleteInventoryProductPhoto(deleteParams).pipe(Effect.provide(layer))

      expect(listed.photos.map((item) => item.id)).toEqual(["photo-camera"])
      expect(found.photo.id).toBe("photo-camera")
      expect(wrongProduct._tag).toBe("AttachmentNotFoundError")
      expect(updated.updated).toBe(true)
      expect(deleted.deleted).toBe(true)
      expect(state.removeCollectionCalls).toEqual([{
        classRef: attachment.class.Photo,
        objectId: "photo-camera",
        attachedTo: "prod-camera",
        collection: "photos"
      }])
      expect(state.removeDocCalls).toEqual([])
    }))

  it.effect("reports unsupported product media delete when removeCollection is unavailable", () =>
    Effect.gen(function*() {
      const state = baseState()
      const params = yield* parseDeleteInventoryProductAttachmentParams({
        product: "Camera",
        category: "Electronics",
        attachmentId: "att-camera"
      })

      const error = yield* Effect.flip(
        deleteInventoryProductAttachment(params).pipe(Effect.provide(makeLayer(
          state,
          false
        )))
      )

      expect(error).toBeInstanceOf(InventoryMutationUnsupportedError)
      expect(state.removeDocCalls).toEqual([])
    }))

  it.effect("manages product comments and blocks product deletion while direct comments remain", () =>
    Effect.gen(function*() {
      const state = {
        ...baseState(),
        attachments: [],
        photos: []
      }
      const layer = makeLayer(state)
      const listCommentParams = yield* parseListInventoryProductCommentsParams({
        product: "Camera",
        category: "Electronics"
      })
      const addCommentParams = yield* parseAddInventoryProductCommentParams({
        product: "Camera",
        category: "Electronics",
        body: "Added"
      })
      const updateCommentParams = yield* parseUpdateInventoryProductCommentParams({
        product: "Camera",
        category: "Electronics",
        commentId: "comment-camera",
        body: "Updated"
      })
      const listed = yield* listInventoryProductComments(listCommentParams).pipe(
        Effect.provide(layer)
      )
      const added = yield* addInventoryProductComment(addCommentParams).pipe(Effect.provide(layer))
      const updated = yield* updateInventoryProductComment(updateCommentParams).pipe(Effect.provide(layer))
      const deleteProductParams = yield* parseDeleteInventoryProductParams({
        product: "Camera",
        category: "Electronics"
      })
      const blocked = yield* Effect.flip(deleteInventoryProduct(deleteProductParams).pipe(Effect.provide(layer)))

      const deleteInitialCommentParams = yield* parseDeleteInventoryProductCommentParams({
        product: "Camera",
        category: "Electronics",
        commentId: "comment-camera"
      })
      const deleteAddedCommentParams = yield* parseDeleteInventoryProductCommentParams({
        product: "Camera",
        category: "Electronics",
        commentId: added.commentId
      })
      yield* deleteInventoryProductComment(deleteInitialCommentParams).pipe(Effect.provide(layer))
      yield* deleteInventoryProductComment(deleteAddedCommentParams).pipe(Effect.provide(layer))
      const deleted = yield* deleteInventoryProduct(deleteProductParams).pipe(Effect.provide(layer))

      expect(assertAt(listed.comments, 0)).toMatchObject({ id: "comment-camera", body: "Initial" })
      expect(added.product.id).toBe("prod-camera")
      expect(updated.updated).toBe(true)
      expect(blocked).toBeInstanceOf(InventoryNotEmptyError)
      expect(deleted.deleted).toBe(true)
    }))

  it.effect("blocks product deletion when direct media records exist even if product counters are stale", () =>
    Effect.gen(function*() {
      const state = {
        ...baseState(),
        comments: []
      }
      const deleteProductParams = yield* parseDeleteInventoryProductParams({
        product: "Camera",
        category: "Electronics"
      })

      const blocked = yield* Effect.flip(
        deleteInventoryProduct(deleteProductParams).pipe(Effect.provide(makeLayer(state)))
      )

      expect(blocked).toBeInstanceOf(InventoryNotEmptyError)
      expect(blocked.message).toContain("1 photos, 1 attachments")
      expect(state.findAllCalls).toEqual(
        expect.arrayContaining([
          { classRef: String(attachment.class.Attachment), total: true },
          { classRef: String(attachment.class.Photo), total: true },
          { classRef: String(chunter.class.ChatMessage), total: true }
        ])
      )
    }))

  it.effect("reports total matching product attachments, comments, and activity beyond the page limit", () =>
    Effect.gen(function*() {
      const state = baseState()
      state.attachments.push(
        media("att-camera-extra", attachment.class.Attachment, toRef("prod-camera"), "attachments")
      )
      state.comments.push(comment("comment-camera-extra", toRef("prod-camera"), "Second"))
      state.activityMessages.push(activityMessage("activity-camera-extra", toRef("prod-camera")))
      const layer = makeLayer(state)
      const listAttachmentParams = yield* parseListInventoryProductAttachmentsParams({
        product: "Camera",
        category: "Electronics",
        limit: 1
      })
      const listCommentParams = yield* parseListInventoryProductCommentsParams({
        product: "Camera",
        category: "Electronics",
        limit: 1
      })
      const activityParams = yield* parseListInventoryProductActivityParams({
        product: "Camera",
        category: "Electronics",
        limit: 1
      })

      const attachments = yield* listInventoryProductAttachments(listAttachmentParams).pipe(Effect.provide(layer))
      const comments = yield* listInventoryProductComments(listCommentParams).pipe(Effect.provide(layer))
      const activityResult = yield* listInventoryProductActivity(activityParams).pipe(Effect.provide(layer))

      expect(attachments.attachments).toHaveLength(1)
      expect(attachments.total).toBe(2)
      expect(comments.comments).toHaveLength(1)
      expect(comments.total).toBe(2)
      expect(activityResult.activity).toHaveLength(1)
      expect(activityResult.total).toBe(2)
      expect(state.findAllCalls).toEqual(
        expect.arrayContaining([
          { classRef: String(attachment.class.Attachment), total: true },
          { classRef: String(chunter.class.ChatMessage), total: true },
          { classRef: String(activity.class.ActivityMessage), total: true }
        ])
      )
    }))

  it("falls back to page length when Huly reports an unknown total", () => {
    expect(findResultTotal({ length: 1, total: -1 })).toBe(1)
  })

  it.effect("returns a connection error when product comment decoding fails", () =>
    Effect.gen(function*() {
      const state = {
        ...baseState(),
        comments: [{
          ...comment("comment-invalid", toRef<HulyInventoryProduct>("prod-camera"), "Body"),
          // Deliberately bypass the SDK PersonId brand to exercise response schema validation.
          modifiedBy: "" as PersonId
        }]
      }
      const params = yield* parseListInventoryProductCommentsParams({
        product: "Camera",
        category: "Electronics"
      })

      const error = yield* Effect.flip(listInventoryProductComments(params).pipe(Effect.provide(makeLayer(state))))

      expect(error).toBeInstanceOf(HulyConnectionError)
      expect(error.message).toContain("Inventory product comments response failed schema validation")
    }))

  it.effect("lists raw product activity for the resolved inventory product", () =>
    Effect.gen(function*() {
      const state = baseState()
      const params = yield* parseListInventoryProductActivityParams({
        product: "Camera",
        category: "Electronics"
      })
      const result = yield* listInventoryProductActivity(params).pipe(Effect.provide(makeLayer(state)))

      expect(result.product.id).toBe("prod-camera")
      expect(result.activity.map((message) => message.id)).toEqual(["activity-camera"])
      expect(assertAt(result.activity, 0)).toMatchObject({
        objectId: "prod-camera",
        objectClass: inventory.class.Product
      })
    }))
})
