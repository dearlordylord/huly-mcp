import { assertAt } from "../../../src/utils/assertions.js"
/* eslint-disable no-restricted-syntax -- Huly SDK phantom refs are erased at runtime; these tests centralize fixture casts. */
import { describe, it } from "@effect/vitest"
import type { ActivityMessage as HulyActivityMessage } from "@hcengineering/activity"
import type { ChatMessage } from "@hcengineering/chunter"
import type {
  AttachedData,
  AttachedDoc,
  Class,
  Data,
  Doc,
  DocumentQuery,
  DocumentUpdate,
  Ref,
  Space
} from "@hcengineering/core"
import { Effect, Layer } from "effect"
import { expect } from "vitest"

import {
  parseAddDriveFileCommentParams,
  parseDeleteDriveFileCommentParams,
  parseListDriveFileActivityParams,
  parseListDriveFileCommentsParams,
  parseUpdateDriveFileCommentParams
} from "../../../src/domain/schemas.js"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import { drive, type DriveSpace, type File, type FileVersion, type Folder } from "../../../src/huly/drive-sdk.js"
import { DriveFileCommentNotFoundError, DriveFileNotFoundError } from "../../../src/huly/errors-drive.js"
import { activity, chunter, core } from "../../../src/huly/huly-plugins.js"
import {
  addDriveFileComment,
  deleteDriveFileComment,
  listDriveFileActivity,
  listDriveFileComments,
  updateDriveFileComment
} from "../../../src/huly/operations/drive.js"
import { markdownToMarkupString, testMarkupUrlConfig } from "../../../src/huly/operations/markup.js"
import { toRef } from "../../../src/huly/operations/sdk-boundary.js"
import { HulyStorageClient, type HulyStorageOperations } from "../../../src/huly/storage.js"
import { testWorkbenchUrlConfig } from "../../../src/huly/url-builders.js"
import { corePersonId, findResult } from "../../helpers/huly-sdk.js"

interface DriveCommentState {
  readonly drives: Array<DriveSpace>
  readonly folders: Array<Folder>
  readonly files: Array<File>
  readonly messages: Array<ChatMessage>
  readonly activityMessages: Array<HulyActivityMessage>
  nextId: number
  readonly updates: Array<{ readonly id: string; readonly operations: DocumentUpdate<ChatMessage> }>
  readonly removals: Array<{ readonly classRef: string; readonly id: string }>
}

const personId = corePersonId("drive-comment-person")

const driveSpace = (): DriveSpace => ({
  _id: toRef<DriveSpace>("drive-1"),
  _class: drive.class.Drive,
  space: toRef<Space>(core.space.Space),
  name: "Docs",
  description: "Drive docs",
  private: false,
  archived: false,
  autoJoin: false,
  members: [],
  owners: [],
  modifiedBy: personId,
  modifiedOn: 0,
  createdBy: personId,
  createdOn: 0
} as unknown as DriveSpace)

const driveFile = (): File => ({
  _id: toRef<File>("file-api"),
  _class: drive.class.File,
  space: toRef<DriveSpace>("drive-1"),
  title: "API.md",
  parent: drive.ids.Root,
  path: [],
  file: toRef<FileVersion>("version-1"),
  versions: 1,
  version: 1,
  modifiedBy: personId,
  modifiedOn: 0,
  createdBy: personId,
  createdOn: 0
})

const driveFolder = (): Folder => ({
  _id: toRef<Folder>("folder-specs"),
  _class: drive.class.Folder,
  space: toRef<DriveSpace>("drive-1"),
  title: "Specs",
  parent: drive.ids.Root,
  path: [],
  modifiedBy: personId,
  modifiedOn: 0,
  createdBy: personId,
  createdOn: 0
})

const chatMessage = (id: string, body: string): ChatMessage => ({
  _id: toRef<ChatMessage>(id),
  _class: chunter.class.ChatMessage,
  space: toRef<DriveSpace>("drive-1"),
  attachedTo: toRef<Doc>("file-api"),
  attachedToClass: toRef<Class<Doc>>(drive.class.File),
  collection: "comments",
  message: markdownToMarkupString(body, testMarkupUrlConfig),
  modifiedBy: personId,
  modifiedOn: 1,
  createdBy: personId,
  createdOn: 1,
  editedOn: undefined,
  isPinned: false,
  replies: 0,
  reactions: 0
} as unknown as ChatMessage)

const activityMessage = (): HulyActivityMessage => ({
  _id: toRef<HulyActivityMessage>("activity-1"),
  _class: activity.class.ActivityMessage,
  space: toRef<DriveSpace>("drive-1"),
  attachedTo: toRef<Doc>("file-api"),
  attachedToClass: toRef<Class<Doc>>(drive.class.File),
  collection: "activity",
  modifiedBy: personId,
  modifiedOn: 2,
  isPinned: false,
  replies: 0,
  reactions: 0
})

const matchesQuery = (doc: Doc, query: DocumentQuery<Doc>) =>
  Object.entries(query).every(([key, value]) => Reflect.get(doc, key) === value)

const docsForClass = (state: DriveCommentState, classRef: Ref<Class<Doc>>): ReadonlyArray<Doc> =>
  classRef === drive.class.Drive
    ? state.drives
    : classRef === drive.class.Folder
    ? state.folders
    : classRef === drive.class.File
    ? state.files
    : classRef === chunter.class.ChatMessage
    ? state.messages
    : classRef === activity.class.ActivityMessage
    ? state.activityMessages
    : []

const makeLayer = (state: DriveCommentState): Layer.Layer<HulyClient | HulyStorageClient> => {
  const findAll: HulyClientOperations["findAll"] = <T extends Doc>(
    classRef: Ref<Class<T>>,
    query: DocumentQuery<T>
  ) => {
    const docs = docsForClass(state, classRef as unknown as Ref<Class<Doc>>)
    return Effect.succeed(
      findResult(docs.filter((doc) => matchesQuery(doc, query as unknown as DocumentQuery<Doc>)) as Array<T>)
    )
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
    const next = id ?? toRef<P>(`created-${state.nextId++}`)
    if (classRef === chunter.class.ChatMessage) {
      state.messages.push({
        _id: next as unknown as Ref<ChatMessage>,
        _class: chunter.class.ChatMessage,
        space,
        attachedTo: attachedTo as unknown as Ref<Doc>,
        attachedToClass: attachedToClass as unknown as Ref<Class<Doc>>,
        collection,
        modifiedBy: personId,
        modifiedOn: 0,
        createdBy: personId,
        createdOn: 0,
        editedOn: undefined,
        isPinned: false,
        replies: 0,
        reactions: 0,
        ...(attributes as unknown as AttachedData<ChatMessage>)
      } as unknown as ChatMessage)
    }
    return Effect.succeed(next)
  }

  const updateDoc: HulyClientOperations["updateDoc"] = <T extends Doc>(
    classRef: Ref<Class<T>>,
    _space: Ref<Space>,
    objectId: Ref<T>,
    operations: DocumentUpdate<T>
  ) => {
    if (classRef === chunter.class.ChatMessage) {
      state.updates.push({
        id: String(objectId),
        operations: operations as unknown as DocumentUpdate<ChatMessage>
      })
      const index = state.messages.findIndex((message) => String(message._id) === String(objectId))
      const message = assertAt(state.messages, index)
      state.messages[index] = {
        ...message,
        ...(operations as unknown as Partial<ChatMessage>)
      }
    }
    return Effect.succeed([])
  }

  const removeDoc: HulyClientOperations["removeDoc"] = <T extends Doc>(
    classRef: Ref<Class<T>>,
    _space: Ref<Space>,
    objectId: Ref<T>
  ) => {
    state.removals.push({ classRef: String(classRef), id: String(objectId) })
    if (classRef === chunter.class.ChatMessage) {
      const index = state.messages.findIndex((message) => String(message._id) === String(objectId))
      if (index >= 0) state.messages.splice(index, 1)
    }
    return Effect.succeed([])
  }

  const storage: HulyStorageOperations = {
    uploadFile: () => Effect.die(new Error("not implemented")),
    getFileUrl: (blobId) => `https://files.test/${blobId}`
  }

  return Layer.merge(
    HulyClient.testLayer({
      findAll,
      findOne,
      addCollection,
      updateDoc,
      removeDoc,
      createDoc: <T extends Doc>(_classRef: Ref<Class<T>>, _space: Ref<Space>, _attributes: Data<T>) =>
        Effect.succeed(toRef<T>(`created-${state.nextId++}`)),
      removeCollection: () => Effect.die(new Error("not implemented")),
      workbenchUrlConfig: testWorkbenchUrlConfig,
      markupUrlConfig: testMarkupUrlConfig
    }),
    HulyStorageClient.testLayer(storage)
  )
}

const baseState = (): DriveCommentState => ({
  drives: [driveSpace()],
  folders: [driveFolder()],
  files: [driveFile()],
  messages: [chatMessage("comment-1", "Initial")],
  activityMessages: [activityMessage()],
  nextId: 1,
  updates: [],
  removals: []
})

describe("drive file comment operations", () => {
  it.effect("adds, lists, updates, and deletes Drive file comments", () =>
    Effect.gen(function*() {
      const state = baseState()
      const layer = makeLayer(state)
      const listParams = yield* parseListDriveFileCommentsParams({ drive: "Docs", filePath: "/API.md" })
      const addParams = yield* parseAddDriveFileCommentParams({
        drive: "Docs",
        fileId: "file-api",
        body: "Added"
      })
      const updateNoopParams = yield* parseUpdateDriveFileCommentParams({
        drive: "Docs",
        filePath: "/API.md",
        commentId: "comment-1",
        body: "Initial"
      })
      const updateParams = yield* parseUpdateDriveFileCommentParams({
        drive: "Docs",
        filePath: "/API.md",
        commentId: "comment-1",
        body: "Updated"
      })
      const deleteParams = yield* parseDeleteDriveFileCommentParams({
        drive: "Docs",
        fileId: "file-api",
        commentId: "comment-1"
      })

      const listed = yield* listDriveFileComments(listParams).pipe(Effect.provide(layer))
      const added = yield* addDriveFileComment(addParams).pipe(Effect.provide(layer))
      const noop = yield* updateDriveFileComment(updateNoopParams).pipe(Effect.provide(layer))
      const updated = yield* updateDriveFileComment(updateParams).pipe(Effect.provide(layer))
      const deleted = yield* deleteDriveFileComment(deleteParams).pipe(Effect.provide(layer))

      expect(listed).toMatchObject({ file: { id: "file-api" }, total: 1 })
      expect(assertAt(listed.comments, 0)).toMatchObject({ id: "comment-1", body: "Initial" })
      expect(added.file.id).toBe("file-api")
      expect(added.commentId).toBeDefined()
      expect(noop.updated).toBe(false)
      expect(updated.updated).toBe(true)
      expect(state.updates).toHaveLength(1)
      expect(deleted.deleted).toBe(true)
      expect(state.removals).toEqual([{ classRef: chunter.class.ChatMessage, id: "comment-1" }])
    }))

  it.effect("lists Drive file activity for a resolved file", () =>
    Effect.gen(function*() {
      const state = baseState()
      const params = yield* parseListDriveFileActivityParams({ drive: "Docs", fileId: "file-api" })
      const result = yield* listDriveFileActivity(params).pipe(Effect.provide(makeLayer(state)))

      expect(result.file.id).toBe("file-api")
      expect(result.total).toBe(1)
      expect(assertAt(result.activity, 0)).toMatchObject({
        id: "activity-1",
        objectId: "file-api",
        objectClass: drive.class.File
      })
    }))

  it.effect("rejects folder targets and missing Drive file comments", () =>
    Effect.gen(function*() {
      const state = baseState()
      const layer = makeLayer(state)
      const folderParams = yield* parseListDriveFileCommentsParams({ drive: "Docs", filePath: "/Specs" })
      const missingCommentParams = yield* parseUpdateDriveFileCommentParams({
        drive: "Docs",
        filePath: "/API.md",
        commentId: "missing-comment",
        body: "Updated"
      })

      const folderError = yield* Effect.either(listDriveFileComments(folderParams).pipe(Effect.provide(layer)))
      const missingComment = yield* Effect.either(
        updateDriveFileComment(missingCommentParams).pipe(Effect.provide(layer))
      )

      expect(folderError._tag).toBe("Left")
      if (folderError._tag === "Left") {
        expect(folderError.left).toBeInstanceOf(DriveFileNotFoundError)
      }
      expect(missingComment._tag).toBe("Left")
      if (missingComment._tag === "Left") {
        expect(missingComment.left).toBeInstanceOf(DriveFileCommentNotFoundError)
      }
    }))
})
