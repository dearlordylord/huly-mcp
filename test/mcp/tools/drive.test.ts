import { assertAt } from "../../../src/utils/assertions.js"
/* eslint-disable no-restricted-syntax -- Huly SDK phantom refs are erased at runtime; this test file builds in-memory SDK fixtures. */
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
  Space,
  SpaceType
} from "@hcengineering/core"
import { toFindResult } from "@hcengineering/core"
import { Effect } from "effect"
import { expect } from "vitest"

import type { HulyClientOperations } from "../../../src/huly/client.js"
import { drive, type DriveSpace, type File, type FileVersion, type Folder } from "../../../src/huly/drive-sdk.js"
import { activity, chunter, core } from "../../../src/huly/huly-plugins.js"
import { markdownToMarkupString, testMarkupUrlConfig } from "../../../src/huly/operations/markup.js"
import { toAccountUuid, toRef } from "../../../src/huly/operations/sdk-boundary.js"
import type { HulyStorageOperations } from "../../../src/huly/storage.js"
import { testWorkbenchUrlConfig } from "../../../src/huly/url-builders.js"
import { McpErrorCode } from "../../../src/mcp/error-mapping.js"
import { driveTools } from "../../../src/mcp/tools/drive.js"
import { TOOL_DEFINITIONS } from "../../../src/mcp/tools/index.js"
import { corePersonId } from "../../helpers/huly-sdk.js"

interface DriveToolState {
  readonly drives: Array<DriveSpace>
  readonly folders: Array<Folder>
  readonly files: Array<File>
  readonly messages?: Array<ChatMessage>
  readonly activityMessages?: Array<HulyActivityMessage>
  nextId: number
}

const personId = corePersonId("drive-tool-person")
const accountA = toAccountUuid("00000000-0000-4000-8000-000000000001")
const accountB = toAccountUuid("00000000-0000-4000-8000-000000000002")

const driveSpace = (id = "drive-1", name = "Docs"): DriveSpace => ({
  _id: toRef<DriveSpace>(id),
  _class: drive.class.Drive,
  space: toRef<Space>(core.space.Space),
  name,
  description: "Drive docs",
  private: false,
  archived: false,
  autoJoin: false,
  type: toRef<SpaceType>(drive.spaceType.DefaultDrive),
  members: [accountA],
  owners: [accountA],
  modifiedBy: personId,
  modifiedOn: 0,
  createdBy: personId,
  createdOn: 0
})

const folder = (id: string, title: string): Folder => ({
  _id: toRef<Folder>(id),
  _class: drive.class.Folder,
  space: toRef<DriveSpace>("drive-1"),
  title,
  parent: drive.ids.Root,
  path: [],
  modifiedBy: personId,
  modifiedOn: 0,
  createdBy: personId,
  createdOn: 0
})

const file = (id: string, title: string): File => ({
  _id: toRef<File>(id),
  _class: drive.class.File,
  space: toRef<DriveSpace>("drive-1"),
  title,
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

const matchesQuery = (doc: Doc, query: DocumentQuery<Doc>): boolean =>
  Object.entries(query).every(([key, value]) => Reflect.get(doc, key) === value)

const documentsForClass = (state: DriveToolState, classRef: Ref<Class<Doc>>): ReadonlyArray<Doc> =>
  classRef === drive.class.Drive
    ? state.drives
    : classRef === drive.class.Folder
    ? state.folders
    : classRef === drive.class.File
    ? state.files
    : classRef === chunter.class.ChatMessage
    ? state.messages ?? []
    : classRef === activity.class.ActivityMessage
    ? state.activityMessages ?? []
    : []

const makeHulyClient = (state: DriveToolState): HulyClientOperations => ({
  getAccountUuid: () => accountA,
  getPrimarySocialId: () => personId,
  markupUrlConfig: testMarkupUrlConfig,
  workbenchUrlConfig: testWorkbenchUrlConfig,
  findAll: <T extends Doc>(classRef: Ref<Class<T>>, query: DocumentQuery<T>) => {
    const docs = documentsForClass(state, classRef as Ref<Class<Doc>>)
    return Effect.succeed(
      // The class ref selects the fixture array; Huly SDK brands are erased at runtime.

      toFindResult(docs.filter((doc) => matchesQuery(doc, query as DocumentQuery<Doc>)) as unknown as Array<T>)
    )
  },
  findAllInModel: <T extends Doc>(classRef: Ref<Class<T>>, query: DocumentQuery<T>) =>
    makeHulyClient(state).findAll(classRef, query),
  findOne: <T extends Doc>(classRef: Ref<Class<T>>, query: DocumentQuery<T>) =>
    Effect.map(makeHulyClient(state).findAll(classRef, query), (docs) => docs.at(0)),
  createDoc: <T extends Doc>(
    classRef: Ref<Class<T>>,
    space: Ref<Space>,
    attributes: Data<T>,
    id?: Ref<T>
  ) => {
    const next = id ?? toRef<T>(`created-${state.nextId++}`)
    if (classRef === drive.class.Drive) {
      state.drives.push({
        _id: next as unknown as Ref<DriveSpace>,
        _class: drive.class.Drive,
        space,
        modifiedBy: personId,
        modifiedOn: 0,
        createdBy: personId,
        createdOn: 0,

        ...(attributes as unknown as Data<DriveSpace>)
      })
    }
    return Effect.succeed(next)
  },
  updateDoc: <T extends Doc>(
    classRef: Ref<Class<T>>,
    _space: Ref<Space>,
    objectId: Ref<T>,
    operations: DocumentUpdate<T>
  ) => {
    if (classRef === chunter.class.ChatMessage) {
      const index = state.messages?.findIndex((candidate) => String(candidate._id) === String(objectId)) ?? -1
      if (state.messages !== undefined && index >= 0) {
        const target = assertAt(state.messages, index)
        state.messages[index] = {
          ...target,

          ...(operations as unknown as Partial<ChatMessage>)
        }
      }
      return Effect.succeed([])
    }
    const targetIndex = state.drives.findIndex((candidate) => String(candidate._id) === String(objectId))
    const target = assertAt(state.drives, targetIndex)
    state.drives[targetIndex] = {
      ...target,

      ...(operations as unknown as Partial<DriveSpace>)
    }
    return Effect.succeed([])
  },
  removeDoc: <T extends Doc>(classRef: Ref<Class<T>>, _space: Ref<Space>, objectId: Ref<T>) => {
    if (classRef === chunter.class.ChatMessage) {
      const index = state.messages?.findIndex((candidate) => String(candidate._id) === String(objectId)) ?? -1
      if (state.messages !== undefined && index >= 0) state.messages.splice(index, 1)
      return Effect.succeed([])
    }
    const index = state.drives.findIndex((candidate) => String(candidate._id) === String(objectId))
    if (index >= 0) state.drives.splice(index, 1)
    return Effect.succeed([])
  },
  addCollection: <T extends Doc, P extends AttachedDoc>(
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
      state.messages?.push({
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
        isPinned: false,
        replies: 0,
        reactions: 0,
        ...(attributes as unknown as AttachedData<ChatMessage>)
      } as unknown as ChatMessage)
    }
    return Effect.succeed(next)
  },
  removeCollection: () => Effect.die(new Error("not implemented")),
  uploadMarkup: () => Effect.die(new Error("not implemented")),
  fetchMarkup: () => Effect.succeed(""),
  updateMarkup: () => Effect.die(new Error("not implemented")),
  updateMixin: () => Effect.die(new Error("not implemented")),
  createMixin: () => Effect.die(new Error("not implemented")),
  searchFulltext: () => Effect.die(new Error("not implemented"))
})

const storageClient: HulyStorageOperations = {
  uploadFile: () => Effect.die(new Error("not implemented")),
  getFileUrl: (blobId) => `https://test.huly.io/files?file=${blobId}`
}

const findTool = (name: string) => {
  const tool = driveTools.find((candidate) => candidate.name === name)
  if (tool === undefined) throw new Error(`Tool ${name} not found`)
  return tool
}

describe("driveTools", () => {
  it.effect("exports Drive tools in the drive category and registers them globally", () =>
    Effect.gen(function*() {
      expect(driveTools.map((tool) => tool.name)).toEqual([
        "list_drives",
        "get_drive",
        "create_drive",
        "update_drive",
        "delete_drive",
        "add_drive_members",
        "remove_drive_members",
        "set_drive_owners",
        "list_drive_items",
        "get_drive_item",
        "list_drive_file_comments",
        "add_drive_file_comment",
        "update_drive_file_comment",
        "delete_drive_file_comment",
        "list_drive_file_activity",
        "create_drive_folder",
        "upload_drive_file",
        "upload_drive_file_version",
        "move_drive_item",
        "rename_drive_item",
        "delete_drive_item",
        "list_drive_file_versions",
        "restore_drive_file_version"
      ])

      for (const tool of driveTools) {
        expect(tool.category).toBe("drive")
        expect(TOOL_DEFINITIONS[tool.name]).toBe(tool)
      }

      expect(driveTools.find((tool) => tool.name === "move_drive_item")?.description).toContain(
        "file or folder"
      )
      expect(driveTools.find((tool) => tool.name === "create_drive")?.description).toContain(
        "created=false"
      )
      expect(driveTools.find((tool) => tool.name === "set_drive_owners")?.description).toContain(
        "ensured as a Drive member"
      )
      expect(driveTools.find((tool) => tool.name === "delete_drive")?.description).toContain(
        "empty Huly Drive space"
      )
      expect(driveTools.find((tool) => tool.name === "delete_drive_item")?.description).toContain(
        "permanent deletion"
      )
      expect(driveTools.find((tool) => tool.name === "list_drive_file_comments")?.description).toContain(
        "filePath or fileId"
      )
    }))

  it.effect("Drive administration handlers encode successful structured output", () =>
    Effect.gen(function*() {
      const state: DriveToolState = {
        drives: [driveSpace()],
        folders: [],
        files: [],
        nextId: 1
      }
      const hulyClient = makeHulyClient(state)

      const created = yield* Effect.promise(() =>
        findTool("create_drive").handler(
          { name: "Team Drive", members: [accountA], owners: [accountB] },
          hulyClient,
          storageClient
        )
      )
      const updated = yield* Effect.promise(() =>
        findTool("update_drive").handler({ drive: "Docs", autoJoin: true }, hulyClient, storageClient)
      )
      const added = yield* Effect.promise(() =>
        findTool("add_drive_members").handler({ drive: "Docs", members: [accountB] }, hulyClient, storageClient)
      )
      const removed = yield* Effect.promise(() =>
        findTool("remove_drive_members").handler({ drive: "Docs", members: [accountA] }, hulyClient, storageClient)
      )
      const owners = yield* Effect.promise(() =>
        findTool("set_drive_owners").handler({ drive: "Docs", owners: [accountB] }, hulyClient, storageClient)
      )
      const deleted = yield* Effect.promise(() =>
        findTool("delete_drive").handler({ drive: "Team Drive" }, hulyClient, storageClient)
      )

      expect(created.isError).toBeUndefined()
      expect(created.structuredContent?.result).toMatchObject({ created: true, drive: { name: "Team Drive" } })
      expect(JSON.parse(assertAt(created.content, 0).text)).toMatchObject({ created: true })
      expect(updated.structuredContent?.result).toMatchObject({ updated: true, drive: { autoJoin: true } })
      expect(added.structuredContent?.result).toMatchObject({ changed: true, members: [accountA, accountB] })
      expect(removed.structuredContent?.result).toMatchObject({ changed: true, members: [accountB] })
      expect(owners.structuredContent?.result).toMatchObject({
        changed: true,
        owners: [accountB],
        members: [accountB]
      })
      expect(deleted.structuredContent?.result).toMatchObject({ deleted: true, drive: { name: "Team Drive" } })
    }))

  it.effect("Drive file comment and activity handlers encode successful structured output", () =>
    Effect.gen(function*() {
      const state: DriveToolState = {
        drives: [driveSpace()],
        folders: [],
        files: [file("file-api", "API.md")],
        messages: [chatMessage("comment-1", "Initial")],
        activityMessages: [activityMessage()],
        nextId: 1
      }
      const hulyClient = makeHulyClient(state)

      const listed = yield* Effect.promise(() =>
        findTool("list_drive_file_comments").handler({ drive: "Docs", filePath: "/API.md" }, hulyClient, storageClient)
      )
      const added = yield* Effect.promise(() =>
        findTool("add_drive_file_comment").handler(
          { drive: "Docs", fileId: "file-api", body: "Added" },
          hulyClient,
          storageClient
        )
      )
      const updated = yield* Effect.promise(() =>
        findTool("update_drive_file_comment").handler(
          { drive: "Docs", fileId: "file-api", commentId: "comment-1", body: "Updated" },
          hulyClient,
          storageClient
        )
      )
      const activityResult = yield* Effect.promise(() =>
        findTool("list_drive_file_activity").handler({ drive: "Docs", fileId: "file-api" }, hulyClient, storageClient)
      )
      const deleted = yield* Effect.promise(() =>
        findTool("delete_drive_file_comment").handler(
          { drive: "Docs", fileId: "file-api", commentId: "comment-1" },
          hulyClient,
          storageClient
        )
      )

      expect(listed.isError).toBeUndefined()
      expect(listed.structuredContent?.result).toMatchObject({
        file: { id: "file-api" },
        comments: [{ id: "comment-1", body: "Initial" }],
        total: 1
      })
      expect(added.structuredContent?.result).toMatchObject({ file: { id: "file-api" } })
      expect(updated.structuredContent?.result).toMatchObject({ commentId: "comment-1", updated: true })
      expect(activityResult.structuredContent?.result).toMatchObject({
        file: { id: "file-api" },
        activity: [{ id: "activity-1", objectId: "file-api" }],
        total: 1
      })
      expect(deleted.structuredContent?.result).toMatchObject({ commentId: "comment-1", deleted: true })
    }))

  it.effect("Drive administration handlers map parse and domain errors", () =>
    Effect.gen(function*() {
      const nonEmptyState: DriveToolState = {
        drives: [driveSpace()],
        folders: [folder("folder-specs", "Specs")],
        files: [],
        nextId: 1
      }
      const hulyClient = makeHulyClient(nonEmptyState)

      const parseError = yield* Effect.promise(() =>
        findTool("update_drive").handler({ drive: "Docs" }, hulyClient, storageClient)
      )
      const domainError = yield* Effect.promise(() =>
        findTool("delete_drive").handler({ drive: "Docs" }, hulyClient, storageClient)
      )

      expect(parseError.isError).toBe(true)
      expect(parseError._meta?.errorCode).toBe(McpErrorCode.InvalidParams)
      expect(assertAt(parseError.content, 0).text).toContain("Invalid parameters for update_drive")
      expect(domainError.isError).toBe(true)
      expect(domainError._meta?.errorCode).toBe(McpErrorCode.InvalidParams)
      expect(assertAt(domainError.content, 0).text).toContain("Drive 'Docs' is not empty")
    }))

  it.effect("Drive file comment handlers map parse and domain errors", () =>
    Effect.gen(function*() {
      const state: DriveToolState = {
        drives: [driveSpace()],
        folders: [],
        files: [file("file-api", "API.md")],
        messages: [],
        nextId: 1
      }
      const hulyClient = makeHulyClient(state)

      const parseError = yield* Effect.promise(() =>
        findTool("list_drive_file_comments").handler(
          { drive: "Docs", filePath: "/API.md", fileId: "file-api" },
          hulyClient,
          storageClient
        )
      )
      const domainError = yield* Effect.promise(() =>
        findTool("update_drive_file_comment").handler(
          { drive: "Docs", fileId: "file-api", commentId: "missing-comment", body: "Updated" },
          hulyClient,
          storageClient
        )
      )

      expect(parseError.isError).toBe(true)
      expect(parseError._meta?.errorCode).toBe(McpErrorCode.InvalidParams)
      expect(assertAt(parseError.content, 0).text).toContain("Invalid parameters for list_drive_file_comments")
      expect(domainError.isError).toBe(true)
      expect(domainError._meta?.errorCode).toBe(McpErrorCode.InvalidParams)
      expect(assertAt(domainError.content, 0).text).toContain("Drive file comment 'missing-comment'")
    }))
})
