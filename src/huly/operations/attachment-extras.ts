import type {
  Attachment as HulyAttachment,
  Drawing as HulyDrawing,
  SavedAttachments as HulySavedAttachment
} from "@hcengineering/attachment"
import { type Class, type Doc, generateId, type Ref, SortingOrder, type Space } from "@hcengineering/core"
import { Effect } from "effect"

import type {
  CreateDrawingParams,
  CreateDrawingResult,
  DeleteDrawingParams,
  DeleteDrawingResult,
  Drawing,
  GetDrawingParams,
  ListDrawingsParams,
  ListSavedAttachmentsParams,
  SaveAttachmentParams,
  SaveAttachmentResult,
  SavedAttachment,
  UnsaveAttachmentParams,
  UnsaveAttachmentResult,
  UpdateDrawingParams,
  UpdateDrawingResult
} from "../../domain/schemas/attachment-extras.js"
import { DrawingContent } from "../../domain/schemas/domain-values.js"
import {
  AttachmentId,
  DocId,
  DrawingId,
  ObjectClassName,
  SavedAttachmentId,
  Timestamp
} from "../../domain/schemas/shared.js"
import { HulyClient, type HulyClientError } from "../client.js"
import { AttachmentNotFoundError, DrawingNotFoundError, SavedAttachmentNotFoundError } from "../errors.js"
import { attachment } from "../huly-plugins.js"
import { clampLimit, findOneOrFail, hulyQuery } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"

type SaveAttachmentError = HulyClientError | AttachmentNotFoundError
type UnsaveAttachmentError = HulyClientError | SavedAttachmentNotFoundError
type ListSavedAttachmentsError = HulyClientError
type ListDrawingsError = HulyClientError
type GetDrawingError = HulyClientError | DrawingNotFoundError
type CreateDrawingError = HulyClientError
type UpdateDrawingError = HulyClientError | DrawingNotFoundError
type DeleteDrawingError = HulyClientError | DrawingNotFoundError

const optionalDrawingContent = (content: string | undefined): DrawingContent | undefined =>
  content === undefined ? undefined : DrawingContent.make(content)

const optionalTimestamp = (value: number | undefined): Timestamp | undefined =>
  value === undefined ? undefined : Timestamp.make(value)

const toDrawing = (drawing: HulyDrawing): Drawing => ({
  id: DrawingId.make(drawing._id),
  parentId: DocId.make(drawing.parent),
  parentClass: ObjectClassName.make(drawing.parentClass),
  content: optionalDrawingContent(drawing.content),
  modifiedOn: optionalTimestamp(drawing.modifiedOn),
  createdOn: optionalTimestamp(drawing.createdOn)
})

export const saveAttachment = (
  params: SaveAttachmentParams
): Effect.Effect<SaveAttachmentResult, SaveAttachmentError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const att = yield* findOneOrFail(
      client,
      attachment.class.Attachment,
      hulyQuery<HulyAttachment>({ _id: toRef<HulyAttachment>(params.attachmentId) }),
      () => new AttachmentNotFoundError({ attachmentId: params.attachmentId })
    )

    const existing = yield* client.findOne<HulySavedAttachment>(
      attachment.class.SavedAttachments,
      hulyQuery<HulySavedAttachment>({ attachedTo: att._id })
    )

    if (existing !== undefined) {
      return {
        savedId: SavedAttachmentId.make(existing._id),
        attachmentId: AttachmentId.make(att._id),
        saved: false
      }
    }

    const savedId: Ref<HulySavedAttachment> = generateId()
    yield* client.createDoc(
      attachment.class.SavedAttachments,
      att.space,
      { attachedTo: att._id },
      savedId
    )

    return {
      savedId: SavedAttachmentId.make(savedId),
      attachmentId: AttachmentId.make(att._id),
      saved: true
    }
  })

export const unsaveAttachment = (
  params: UnsaveAttachmentParams
): Effect.Effect<UnsaveAttachmentResult, UnsaveAttachmentError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const saved = yield* findOneOrFail(
      client,
      attachment.class.SavedAttachments,
      hulyQuery<HulySavedAttachment>({ attachedTo: toRef<HulyAttachment>(params.attachmentId) }),
      () => new SavedAttachmentNotFoundError({ attachmentId: params.attachmentId })
    )

    yield* client.removeDoc(attachment.class.SavedAttachments, saved.space, saved._id)
    return { attachmentId: AttachmentId.make(params.attachmentId), removed: true }
  })

export const listSavedAttachments = (
  params: ListSavedAttachmentsParams
): Effect.Effect<Array<SavedAttachment>, ListSavedAttachmentsError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const limit = clampLimit(params.limit)
    const saved = yield* client.findAll<HulySavedAttachment>(
      attachment.class.SavedAttachments,
      hulyQuery<HulySavedAttachment>({}),
      { limit }
    )

    return saved.map((s) => ({
      id: SavedAttachmentId.make(s._id),
      attachmentId: AttachmentId.make(s.attachedTo)
    }))
  })

export const listDrawings = (
  params: ListDrawingsParams
): Effect.Effect<Array<Drawing>, ListDrawingsError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const limit = clampLimit(params.limit)
    const drawings = yield* client.findAll<HulyDrawing>(
      attachment.class.Drawing,
      hulyQuery<HulyDrawing>({
        parent: toRef<Doc>(params.parentId),
        parentClass: toRef<Class<Doc>>(params.parentClass)
      }),
      { limit, sort: { modifiedOn: SortingOrder.Descending } }
    )

    return drawings.map(toDrawing)
  })

export const getDrawing = (
  params: GetDrawingParams
): Effect.Effect<Drawing, GetDrawingError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const drawing = yield* findOneOrFail(
      client,
      attachment.class.Drawing,
      hulyQuery<HulyDrawing>({ _id: toRef<HulyDrawing>(params.drawingId) }),
      () => new DrawingNotFoundError({ drawingId: params.drawingId })
    )

    return toDrawing(drawing)
  })

export const createDrawing = (
  params: CreateDrawingParams
): Effect.Effect<CreateDrawingResult, CreateDrawingError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const drawingId: Ref<HulyDrawing> = generateId()
    yield* client.createDoc(
      attachment.class.Drawing,
      toRef<Space>(params.space),
      {
        parent: toRef<Doc>(params.parentId),
        parentClass: toRef<Class<Doc>>(params.parentClass),
        ...(params.content === undefined ? {} : { content: params.content })
      },
      drawingId
    )

    return { drawingId: DrawingId.make(drawingId) }
  })

export const updateDrawing = (
  params: UpdateDrawingParams
): Effect.Effect<UpdateDrawingResult, UpdateDrawingError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const drawing = yield* findOneOrFail(
      client,
      attachment.class.Drawing,
      hulyQuery<HulyDrawing>({ _id: toRef<HulyDrawing>(params.drawingId) }),
      () => new DrawingNotFoundError({ drawingId: params.drawingId })
    )

    yield* client.updateDoc(
      attachment.class.Drawing,
      drawing.space,
      drawing._id,
      { content: params.content === null ? "" : params.content }
    )
    return { drawingId: DrawingId.make(drawing._id), updated: true }
  })

export const deleteDrawing = (
  params: DeleteDrawingParams
): Effect.Effect<DeleteDrawingResult, DeleteDrawingError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const drawing = yield* findOneOrFail(
      client,
      attachment.class.Drawing,
      hulyQuery<HulyDrawing>({ _id: toRef<HulyDrawing>(params.drawingId) }),
      () => new DrawingNotFoundError({ drawingId: params.drawingId })
    )

    yield* client.removeDoc(attachment.class.Drawing, drawing.space, drawing._id)
    return { drawingId: DrawingId.make(drawing._id), deleted: true }
  })
