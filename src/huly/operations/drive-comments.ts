import type { ActivityMessage as HulyActivityMessage } from "@hcengineering/activity"
import type { ChatMessage } from "@hcengineering/chunter"
import {
  type AttachedData,
  type Class,
  type Doc,
  type DocumentUpdate,
  generateId,
  type Ref,
  SortingOrder
} from "@hcengineering/core"
import { Clock, Effect, Schema } from "effect"

import { CommentSchema } from "../../domain/schemas/comments.js"
import type {
  AddDriveFileCommentParams,
  AddDriveFileCommentResult,
  DeleteDriveFileCommentParams,
  DeleteDriveFileCommentResult,
  ListDriveFileActivityParams,
  ListDriveFileActivityResult,
  ListDriveFileCommentsParams,
  ListDriveFileCommentsResult,
  UpdateDriveFileCommentParams,
  UpdateDriveFileCommentResult
} from "../../domain/schemas/drive-comments.js"
import { CommentId, Count } from "../../domain/schemas/shared.js"
import { HulyClient } from "../client.js"
import { drive, type DriveSpace, type File } from "../drive-sdk.js"
import { DriveFileCommentNotFoundError } from "../errors-drive.js"
import { HulyConnectionError } from "../errors.js"
import { activity, chunter } from "../huly-plugins.js"
import type { HulyStorageClient } from "../storage.js"
import { toActivityMessage } from "./activity-shared.js"
import { pathForItem, toDriveItemSummary } from "./drive-mappers.js"
import { resolveDrive, resolveFile } from "./drive-resolvers.js"
import type { DriveOperationError } from "./drive-shared.js"
import { markdownToMarkupString, optionalMarkupToMarkdown } from "./markup.js"
import { clampLimit, hulyQuery } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"

interface DriveFileLocatorParams {
  readonly drive: ListDriveFileCommentsParams["drive"]
  readonly filePath?: ListDriveFileCommentsParams["filePath"] | undefined
  readonly fileId?: ListDriveFileCommentsParams["fileId"] | undefined
}

type DriveFileLocator = NonNullable<DriveFileLocatorParams["filePath"] | DriveFileLocatorParams["fileId"]>

interface DriveFileTarget {
  readonly client: HulyClient["Type"]
  readonly driveSpace: DriveSpace
  readonly file: File
  readonly locator: DriveFileLocator
}

const resolveDriveFileTarget = (
  params: DriveFileLocatorParams
): Effect.Effect<DriveFileTarget, DriveOperationError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const driveSpace = yield* resolveDrive(client, params.drive)
    const locator = params.fileId ?? params.filePath
    if (locator === undefined) {
      return yield* Effect.dieMessage("Invalid Drive file locator: provide filePath or fileId.")
    }
    const file = yield* resolveFile(client, driveSpace, params.drive, locator)
    return { client, driveSpace, file, locator }
  })

const findDriveFileComment = (
  target: DriveFileTarget,
  commentId: CommentId
): Effect.Effect<ChatMessage, DriveOperationError, never> =>
  Effect.gen(function*() {
    const comment = yield* target.client.findOne<ChatMessage>(
      chunter.class.ChatMessage,
      hulyQuery<ChatMessage>({
        _id: toRef<ChatMessage>(commentId),
        attachedTo: toRef<Doc>(target.file._id),
        attachedToClass: toRef<Class<Doc>>(drive.class.File)
      })
    )
    if (comment === undefined) {
      return yield* Effect.fail(
        new DriveFileCommentNotFoundError({
          drive: target.driveSpace.name,
          file: target.locator,
          commentId
        })
      )
    }
    return comment
  })

const toComment = (
  client: HulyClient["Type"],
  message: ChatMessage
) => ({
  id: message._id,
  body: optionalMarkupToMarkdown(message.message, client.markupUrlConfig, ""),
  authorId: message.modifiedBy,
  createdOn: message.createdOn,
  modifiedOn: message.modifiedOn,
  editedOn: message.editedOn
})

const decodeComments = (comments: ReadonlyArray<ReturnType<typeof toComment>>) =>
  Schema.decodeUnknown(Schema.Array(CommentSchema))(comments).pipe(
    Effect.mapError((parseError) =>
      new HulyConnectionError({
        message: `Drive file comments response failed schema validation: ${parseError.message}`,
        cause: parseError
      })
    )
  )

export const listDriveFileComments = (
  params: ListDriveFileCommentsParams
): Effect.Effect<ListDriveFileCommentsResult, DriveOperationError, HulyClient | HulyStorageClient> =>
  Effect.gen(function*() {
    const target = yield* resolveDriveFileTarget(params)
    const messages = yield* target.client.findAll<ChatMessage>(
      chunter.class.ChatMessage,
      hulyQuery<ChatMessage>({
        attachedTo: toRef<Doc>(target.file._id),
        attachedToClass: toRef<Class<Doc>>(drive.class.File)
      }),
      {
        limit: clampLimit(params.limit),
        sort: { createdOn: SortingOrder.Ascending }
      }
    )
    const comments = yield* decodeComments(messages.map((message) => toComment(target.client, message)))

    return {
      file: yield* toDriveItemSummary(target.file, target.driveSpace, pathForItem(target.file), target.client),
      comments: [...comments],
      total: Count.make(comments.length)
    }
  })

export const addDriveFileComment = (
  params: AddDriveFileCommentParams
): Effect.Effect<AddDriveFileCommentResult, DriveOperationError, HulyClient | HulyStorageClient> =>
  Effect.gen(function*() {
    const target = yield* resolveDriveFileTarget(params)
    const commentId: Ref<ChatMessage> = generateId()
    const commentData: AttachedData<ChatMessage> = {
      message: markdownToMarkupString(params.body, target.client.markupUrlConfig)
    }

    yield* target.client.addCollection(
      chunter.class.ChatMessage,
      target.driveSpace._id,
      target.file._id,
      drive.class.File,
      "comments",
      commentData,
      commentId
    )

    return {
      file: yield* toDriveItemSummary(target.file, target.driveSpace, pathForItem(target.file), target.client),
      commentId: CommentId.make(commentId)
    }
  })

export const updateDriveFileComment = (
  params: UpdateDriveFileCommentParams
): Effect.Effect<UpdateDriveFileCommentResult, DriveOperationError, HulyClient | HulyStorageClient> =>
  Effect.gen(function*() {
    const target = yield* resolveDriveFileTarget(params)
    const comment = yield* findDriveFileComment(target, params.commentId)
    const newMarkup = markdownToMarkupString(params.body, target.client.markupUrlConfig)

    if (newMarkup === comment.message) {
      return {
        file: yield* toDriveItemSummary(target.file, target.driveSpace, pathForItem(target.file), target.client),
        commentId: params.commentId,
        updated: false
      }
    }

    const now = yield* Clock.currentTimeMillis
    const updateOps: DocumentUpdate<ChatMessage> = {
      message: newMarkup,
      editedOn: now
    }
    yield* target.client.updateDoc(chunter.class.ChatMessage, target.driveSpace._id, comment._id, updateOps)

    return {
      file: yield* toDriveItemSummary(target.file, target.driveSpace, pathForItem(target.file), target.client),
      commentId: params.commentId,
      updated: true
    }
  })

export const deleteDriveFileComment = (
  params: DeleteDriveFileCommentParams
): Effect.Effect<DeleteDriveFileCommentResult, DriveOperationError, HulyClient | HulyStorageClient> =>
  Effect.gen(function*() {
    const target = yield* resolveDriveFileTarget(params)
    const comment = yield* findDriveFileComment(target, params.commentId)
    yield* target.client.removeDoc(chunter.class.ChatMessage, target.driveSpace._id, comment._id)

    return {
      file: yield* toDriveItemSummary(target.file, target.driveSpace, pathForItem(target.file), target.client),
      commentId: params.commentId,
      deleted: true
    }
  })

export const listDriveFileActivity = (
  params: ListDriveFileActivityParams
): Effect.Effect<ListDriveFileActivityResult, DriveOperationError, HulyClient | HulyStorageClient> =>
  Effect.gen(function*() {
    const target = yield* resolveDriveFileTarget(params)
    const messages = yield* target.client.findAll<HulyActivityMessage>(
      activity.class.ActivityMessage,
      hulyQuery<HulyActivityMessage>({
        attachedTo: toRef<Doc>(target.file._id),
        attachedToClass: toRef<Class<Doc>>(drive.class.File)
      }),
      {
        limit: clampLimit(params.limit),
        sort: { modifiedOn: SortingOrder.Descending }
      }
    )
    const mapped = messages.map((message) => toActivityMessage(message, target.client.markupUrlConfig))

    return {
      file: yield* toDriveItemSummary(target.file, target.driveSpace, pathForItem(target.file), target.client),
      activity: mapped,
      total: Count.make(mapped.length)
    }
  })
