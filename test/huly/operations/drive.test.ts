/* eslint-disable no-restricted-syntax -- Huly SDK phantom refs are erased at runtime; these tests centralize fixture casts. */
import { describe, it } from "@effect/vitest"
import type {
  AttachedData,
  AttachedDoc,
  Blob,
  Class,
  Data,
  Doc,
  DocumentQuery,
  DocumentUpdate,
  Ref,
  Space
} from "@hcengineering/core"
import { Effect, Layer, TestClock } from "effect"
import { expect } from "vitest"

import {
  parseCreateDriveFolderParams,
  parseDeleteDriveItemParams,
  parseGetDriveItemParams,
  parseGetDriveParams,
  parseListDriveFileVersionsParams,
  parseListDriveItemsParams,
  parseListDrivesParams,
  parseMoveDriveItemParams,
  parseRenameDriveItemParams,
  parseRestoreDriveFileVersionParams,
  parseUploadDriveFileParams,
  parseUploadDriveFileVersionParams
} from "../../../src/domain/schemas.js"
import { BlobId } from "../../../src/domain/schemas/shared.js"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import { drive, type DriveSpace, type File, type FileVersion, type Folder } from "../../../src/huly/drive-sdk.js"
import {
  DriveFileNotFoundError,
  DriveFileVersionNotFoundError,
  DriveFolderNotEmptyError,
  DriveIdentifierAmbiguousError,
  DriveInvalidItemOperationError,
  DriveInvalidMoveError,
  DriveNotFoundError,
  DriveParentNotFolderError,
  DrivePathAmbiguousError,
  DrivePathConflictError,
  DrivePathNotFoundError
} from "../../../src/huly/errors-drive.js"
import {
  createDriveFolder,
  deleteDriveItem,
  getDrive,
  getDriveItem,
  listDriveFileVersions,
  listDriveItems,
  listDrives,
  moveDriveItem,
  renameDriveItem,
  restoreDriveFileVersion,
  uploadDriveFile,
  uploadDriveFileVersion
} from "../../../src/huly/operations/drive.js"
import { toRef } from "../../../src/huly/operations/sdk-boundary.js"
import { HulyStorageClient, type HulyStorageOperations } from "../../../src/huly/storage.js"
import { testWorkbenchUrlConfig } from "../../../src/huly/url-builders.js"
import { corePersonId, findResult } from "../../helpers/huly-sdk.js"

interface DriveState {
  readonly drives: Array<DriveSpace>
  readonly folders: Array<Folder>
  readonly files: Array<File>
  readonly versions: Array<FileVersion>
  nextId: number
  readonly updatedFiles?: Array<{ readonly id: string; readonly operations: DocumentUpdate<File> }>
  readonly updatedFolders?: Array<{ readonly id: string; readonly operations: DocumentUpdate<Folder> }>
  readonly removedDocs?: Array<{ readonly classRef: string; readonly id: string }>
  readonly removedCollections?: Array<{ readonly classRef: string; readonly id: string; readonly attachedTo: string }>
  readonly removeCollectionUnavailable?: boolean
}

const personId = corePersonId("person-1")
const driveSpace = (id = "drive-1", name = "Docs"): DriveSpace => ({
  _id: toRef<DriveSpace>(id),
  _class: drive.class.Drive,
  space: toRef<Space>("core:space:Space"),
  name,
  description: "Drive docs",
  private: false,
  archived: false,
  members: [],
  owners: [],
  modifiedBy: personId,
  modifiedOn: 0,
  createdBy: personId,
  createdOn: 0
} as unknown as DriveSpace)

const folder = (id: string, title: string, parent: Ref<Folder>, path: ReadonlyArray<Ref<Folder>> = []): Folder => ({
  _id: toRef<Folder>(id),
  _class: drive.class.Folder,
  space: toRef<DriveSpace>("drive-1"),
  title,
  parent,
  path,
  modifiedBy: personId,
  modifiedOn: 0,
  createdBy: personId,
  createdOn: 0
})

const file = (
  id: string,
  title: string,
  parent: Ref<Folder>,
  path: ReadonlyArray<Ref<Folder>>,
  versionId = "version-1",
  version = 1
): File => ({
  _id: toRef<File>(id),
  _class: drive.class.File,
  space: toRef<DriveSpace>("drive-1"),
  title,
  parent,
  path,
  file: toRef<FileVersion>(versionId),
  versions: 1,
  version,
  modifiedBy: personId,
  modifiedOn: 0,
  createdBy: personId,
  createdOn: 0
})

const version = (
  id: string,
  attachedTo: Ref<File>,
  n: number,
  blobId = `blob-${n}`
): FileVersion => ({
  _id: toRef<FileVersion>(id),
  _class: drive.class.FileVersion,
  space: toRef<DriveSpace>("drive-1"),
  attachedTo,
  attachedToClass: drive.class.File,
  collection: "versions",
  title: "API.md",
  file: toRef<Blob>(blobId),
  size: 12,
  type: "text/markdown",
  lastModified: 100 + n,
  version: n,
  modifiedBy: personId,
  modifiedOn: 0,
  createdBy: personId,
  createdOn: 0
})

const matchesQuery = (doc: Doc, query: DocumentQuery<Doc>): boolean =>
  Object.entries(query).every(([key, value]) => {
    const actual = Reflect.get(doc, key)
    return actual === value
  })

const makeLayer = (state: DriveState): Layer.Layer<HulyClient | HulyStorageClient> => {
  const findAll: HulyClientOperations["findAll"] = <T extends Doc>(
    classRef: Ref<Class<T>>,
    query: DocumentQuery<T>
  ) => {
    const docs = classRef === drive.class.Drive
      ? state.drives
      : classRef === drive.class.Folder
      ? state.folders
      : classRef === drive.class.File
      ? state.files
      : classRef === drive.class.FileVersion
      ? state.versions
      : []
    return Effect.succeed(
      findResult(docs.filter((doc) => matchesQuery(doc, query as DocumentQuery<Doc>)) as unknown as Array<T>)
    )
  }

  const findOne: HulyClientOperations["findOne"] = <T extends Doc>(
    classRef: Ref<Class<T>>,
    query: DocumentQuery<T>
  ) => Effect.map(findAll(classRef, query), (docs) => docs[0])

  const createDoc: HulyClientOperations["createDoc"] = <T extends Doc>(
    classRef: Ref<Class<T>>,
    space: Ref<Space>,
    attributes: Data<T>,
    id?: Ref<T>
  ) => {
    const next = id ?? toRef<T>(`created-${state.nextId++}`)
    if (classRef === drive.class.FileVersion) {
      state.versions.push({
        _id: next as unknown as Ref<FileVersion>,
        _class: drive.class.FileVersion,
        space: space as Ref<DriveSpace>,
        modifiedBy: personId,
        modifiedOn: 0,
        createdBy: personId,
        createdOn: 0,
        ...(attributes as unknown as Data<FileVersion>)
      })
    }
    return Effect.succeed(next)
  }

  const addCollection: HulyClientOperations["addCollection"] = <T extends Doc, P extends AttachedDoc>(
    classRef: Ref<Class<P>>,
    space: Ref<Space>,
    attachedTo: Ref<T>,
    attachedToClass: Ref<Class<T>>,
    _collection: string,
    attributes: AttachedData<P>,
    id?: Ref<P>
  ) => {
    const next = id ?? toRef<P>(`created-${state.nextId++}`)
    if (classRef === drive.class.FileVersion) {
      state.versions.push({
        _id: next as unknown as Ref<FileVersion>,
        _class: drive.class.FileVersion,
        space: space as Ref<DriveSpace>,
        attachedTo: attachedTo as unknown as Ref<File>,
        attachedToClass: attachedToClass as unknown as Ref<Class<File>>,
        collection: "versions",
        modifiedBy: personId,
        modifiedOn: 0,
        createdBy: personId,
        createdOn: 0,
        ...(attributes as unknown as AttachedData<FileVersion>)
      })
    }
    return Effect.succeed(next)
  }

  const updateDoc: HulyClientOperations["updateDoc"] = <T extends Doc>(
    classRef: Ref<Class<T>>,
    _space: Ref<Space>,
    objectId: Ref<T>,
    operations: DocumentUpdate<T>
  ) => {
    if (classRef === drive.class.File) {
      state.updatedFiles?.push({ id: String(objectId), operations: operations as unknown as DocumentUpdate<File> })
      const targetIndex = state.files.findIndex((candidate) => String(candidate._id) === String(objectId))
      const target = state.files[targetIndex]
      state.files[targetIndex] = { ...target, ...(operations as unknown as Partial<File>) }
    }
    if (classRef === drive.class.Folder) {
      state.updatedFolders?.push({ id: String(objectId), operations: operations as unknown as DocumentUpdate<Folder> })
      const targetIndex = state.folders.findIndex((candidate) => String(candidate._id) === String(objectId))
      const target = state.folders[targetIndex]
      state.folders[targetIndex] = { ...target, ...(operations as unknown as Partial<Folder>) }
    }
    return Effect.succeed([])
  }

  const removeCollection: HulyClientOperations["removeCollection"] = <T extends Doc, P extends AttachedDoc>(
    classRef: Ref<Class<P>>,
    _space: Ref<Space>,
    objectId: Ref<P>,
    attachedTo: Ref<T>
  ) => {
    state.removedCollections?.push({
      classRef: String(classRef),
      id: String(objectId),
      attachedTo: String(attachedTo)
    })
    if (classRef === drive.class.FileVersion) {
      const index = state.versions.findIndex((candidate) => String(candidate._id) === String(objectId))
      if (index >= 0) state.versions.splice(index, 1)
    }
    return Effect.succeed(attachedTo)
  }

  const removeDoc: HulyClientOperations["removeDoc"] = <T extends Doc>(
    classRef: Ref<Class<T>>,
    _space: Ref<Space>,
    objectId: Ref<T>
  ) => {
    state.removedDocs?.push({ classRef: String(classRef), id: String(objectId) })
    if (classRef === drive.class.File) {
      const index = state.files.findIndex((candidate) => String(candidate._id) === String(objectId))
      if (index >= 0) state.files.splice(index, 1)
    }
    if (classRef === drive.class.Folder) {
      const index = state.folders.findIndex((candidate) => String(candidate._id) === String(objectId))
      if (index >= 0) state.folders.splice(index, 1)
    }
    if (classRef === drive.class.FileVersion) {
      const index = state.versions.findIndex((candidate) => String(candidate._id) === String(objectId))
      if (index >= 0) state.versions.splice(index, 1)
    }
    return Effect.succeed([])
  }

  const storage: HulyStorageOperations = {
    uploadFile: (filename, data, contentType) =>
      Effect.succeed({
        blobId: BlobId.make(`blob-${filename}`) as unknown as Ref<Blob>,
        contentType,
        size: data.length,
        url: `https://files.test/${filename}`
      }),
    getFileUrl: (blobId) => `https://files.test/${blobId}`
  }

  const clientOperations = {
    findAll,
    findOne,
    createDoc,
    updateDoc,
    addCollection,
    ...(state.removeCollectionUnavailable ? {} : { removeCollection }),
    removeDoc,
    workbenchUrlConfig: testWorkbenchUrlConfig
  }

  return Layer.merge(
    HulyClient.testLayer(clientOperations),
    HulyStorageClient.testLayer(storage)
  )
}

describe("drive operations", () => {
  it.effect("resolves drives by id, filters by query, and reports ambiguous names", () =>
    Effect.gen(function*() {
      const blankDrive = driveSpace("drive-4", "   ")
      const driveWithoutOwners = { ...driveSpace("drive-5", "No owners"), owners: undefined } as unknown as DriveSpace
      const state: DriveState = {
        drives: [
          driveSpace(),
          driveSpace("drive-2", "Docs"),
          driveSpace("drive-3", "Archive"),
          blankDrive,
          driveWithoutOwners
        ],
        folders: [],
        files: [],
        versions: [],
        nextId: 1,
        updatedFiles: []
      }

      const listParams = yield* parseListDrivesParams({ query: "arc" })
      const listed = yield* listDrives(listParams).pipe(Effect.provide(makeLayer(state)))
      const getParams = yield* parseGetDriveParams({ drive: "drive-1" })
      const byId = yield* getDrive(getParams).pipe(Effect.provide(makeLayer(state)))
      const ambiguousParams = yield* parseGetDriveParams({ drive: "Docs" })
      const ambiguous = yield* Effect.flip(getDrive(ambiguousParams).pipe(Effect.provide(makeLayer(state))))
      const notFoundParams = yield* parseGetDriveParams({ drive: "Missing" })
      const notFound = yield* Effect.flip(getDrive(notFoundParams).pipe(Effect.provide(makeLayer(state))))
      const unfilteredParams = yield* parseListDrivesParams({ includeArchived: true })
      const unfiltered = yield* listDrives(unfilteredParams).pipe(Effect.provide(makeLayer(state)))

      expect(listed.drives).toMatchObject([{ name: "Archive" }])
      expect(byId.id).toBe("drive-1")
      expect(ambiguous).toBeInstanceOf(DriveIdentifierAmbiguousError)
      expect(notFound).toBeInstanceOf(DriveNotFoundError)
      expect(unfiltered.drives).toContainEqual(expect.objectContaining({ name: "(untitled)", ownersCount: 0 }))
    }))

  it.effect("lists children under a normalized folder path", () =>
    Effect.gen(function*() {
      const specs = folder("folder-specs", "Specs", drive.ids.Root)
      const api = file("file-api", "API.md", specs._id, [specs._id])
      const state: DriveState = {
        drives: [driveSpace()],
        folders: [specs],
        files: [api],
        versions: [version("version-1", api._id, 1)],
        nextId: 1
      }

      const params = yield* parseListDriveItemsParams({ drive: "Docs", path: "Specs" })
      const result = yield* listDriveItems(params).pipe(Effect.provide(makeLayer(state)))

      expect(result.path).toBe("/Specs")
      expect(result.items).toMatchObject([{ title: "API.md", path: "/Specs/API.md", kind: "file" }])
    }))

  it.effect("fails ambiguous same-parent path matches with candidates", () =>
    Effect.gen(function*() {
      const duplicateA = folder("folder-a", "Specs", drive.ids.Root)
      const duplicateB = folder("folder-b", "Specs", drive.ids.Root)
      const state: DriveState = {
        drives: [driveSpace()],
        folders: [duplicateA, duplicateB],
        files: [],
        versions: [],
        nextId: 1
      }

      const params = yield* parseListDriveItemsParams({ drive: "Docs", path: "/Specs" })
      const error = yield* Effect.flip(listDriveItems(params).pipe(Effect.provide(makeLayer(state))))

      expect(error).toBeInstanceOf(DrivePathAmbiguousError)
    }))

  it.effect("lists the root with default path/kind and orders same-title folder/file pairs", () =>
    Effect.gen(function*() {
      const sameFolder = folder("folder-same", "Same", drive.ids.Root)
      const sameFile = file("file-same", "Same", drive.ids.Root, [])
      const state: DriveState = {
        drives: [driveSpace()],
        folders: [sameFolder],
        files: [sameFile],
        versions: [version("version-1", sameFile._id, 1)],
        nextId: 1
      }

      const params = yield* parseListDriveItemsParams({ drive: "Docs" })
      const result = yield* listDriveItems(params).pipe(Effect.provide(makeLayer(state)))

      expect(result.path).toBe("/")
      expect(result.items.map((item) => `${item.title}:${item.kind}`)).toEqual(["Same:file", "Same:folder"])
    }))

  it.effect("gets items by id and reports missing or non-folder path parents", () =>
    Effect.gen(function*() {
      const specs = folder("folder-specs", "Specs", drive.ids.Root)
      const api = file("file-api", "API.md", specs._id, [specs._id])
      const state: DriveState = {
        drives: [driveSpace()],
        folders: [specs],
        files: [api],
        versions: [version("version-1", api._id, 1)],
        nextId: 1
      }

      const folderParams = yield* parseGetDriveItemParams({ drive: "Docs", itemId: "folder-specs" })
      const folderById = yield* getDriveItem(folderParams).pipe(Effect.provide(makeLayer(state)))
      const fileParams = yield* parseGetDriveItemParams({ drive: "Docs", itemId: "file-api" })
      const fileById = yield* getDriveItem(fileParams).pipe(Effect.provide(makeLayer(state)))
      const filePathParams = yield* parseGetDriveItemParams({ drive: "Docs", path: "/Specs/API.md" })
      const fileByPath = yield* getDriveItem(filePathParams).pipe(Effect.provide(makeLayer(state)))
      const missingParams = yield* parseGetDriveItemParams({ drive: "Docs", itemId: "missing" })
      const missing = yield* Effect.flip(getDriveItem(missingParams).pipe(Effect.provide(makeLayer(state))))
      const implicitRoot = yield* Effect.flip(
        getDriveItem({ drive: "Docs" } as unknown as Parameters<typeof getDriveItem>[0]).pipe(
          Effect.provide(makeLayer(state))
        )
      )
      const pathMissingParams = yield* parseListDriveItemsParams({ drive: "Docs", path: "/Missing" })
      const pathMissing = yield* Effect.flip(listDriveItems(pathMissingParams).pipe(Effect.provide(makeLayer(state))))
      const fileAsParentParams = yield* parseListDriveItemsParams({ drive: "Docs", path: "/Specs/API.md" })
      const fileAsParent = yield* Effect.flip(listDriveItems(fileAsParentParams).pipe(Effect.provide(makeLayer(state))))
      const nestedBelowFileParams = yield* parseGetDriveItemParams({ drive: "Docs", path: "/Specs/API.md/Child" })
      const nestedBelowFile = yield* Effect.flip(
        getDriveItem(nestedBelowFileParams).pipe(Effect.provide(makeLayer(state)))
      )

      expect(folderById.kind).toBe("folder")
      expect(fileById.kind).toBe("file")
      expect(fileByPath.kind).toBe("file")
      expect(missing).toBeInstanceOf(DrivePathNotFoundError)
      expect(implicitRoot).toBeInstanceOf(DrivePathNotFoundError)
      expect(pathMissing).toBeInstanceOf(DrivePathNotFoundError)
      expect(fileAsParent).toBeInstanceOf(DriveParentNotFolderError)
      expect(nestedBelowFile).toBeInstanceOf(DriveParentNotFolderError)
    }))

  it.effect("reports root get-item and folder creation conflicts", () =>
    Effect.gen(function*() {
      const duplicateA = folder("folder-a", "Specs", drive.ids.Root)
      const duplicateB = folder("folder-b", "Specs", drive.ids.Root)
      const readme = file("file-readme", "README.md", drive.ids.Root, [])
      const state: DriveState = {
        drives: [driveSpace()],
        folders: [duplicateA, duplicateB],
        files: [readme],
        versions: [version("version-1", readme._id, 1)],
        nextId: 1
      }

      const rootParams = yield* parseGetDriveItemParams({ drive: "Docs", path: "/" })
      const root = yield* Effect.flip(getDriveItem(rootParams).pipe(Effect.provide(makeLayer(state))))
      const ambiguousFolderParams = yield* parseCreateDriveFolderParams({ drive: "Docs", path: "/Specs/Child" })
      const ambiguousFolder = yield* Effect.flip(
        createDriveFolder(ambiguousFolderParams).pipe(Effect.provide(makeLayer(state)))
      )
      const fileParentParams = yield* parseCreateDriveFolderParams({ drive: "Docs", path: "/README.md/Child" })
      const fileParent = yield* Effect.flip(createDriveFolder(fileParentParams).pipe(Effect.provide(makeLayer(state))))

      expect(root).toBeInstanceOf(DrivePathNotFoundError)
      expect(ambiguousFolder).toBeInstanceOf(DrivePathAmbiguousError)
      expect(fileParent).toBeInstanceOf(DriveParentNotFolderError)
    }))

  it.effect("creates missing folder parents and is idempotent for existing paths", () =>
    Effect.gen(function*() {
      const state: DriveState = { drives: [driveSpace()], folders: [], files: [], versions: [], nextId: 1 }

      const createParams = yield* parseCreateDriveFolderParams({ drive: "Docs", path: "/Specs/API" })
      const created = yield* createDriveFolder(createParams).pipe(Effect.provide(makeLayer(state)))
      state.folders.push(
        folder("folder-specs", "Specs", drive.ids.Root),
        folder("folder-api", "API", toRef<Folder>("folder-specs"), [toRef<Folder>("folder-specs")])
      )
      const existingParams = yield* parseCreateDriveFolderParams({ drive: "Docs", path: "/Specs" })
      const existing = yield* createDriveFolder(existingParams).pipe(Effect.provide(makeLayer(state)))

      expect(created.created).toBe(true)
      expect(created.folder.path).toBe("/Specs/API")
      expect(existing.created).toBe(false)
    }))

  it.effect("rejects root folder creation", () =>
    Effect.gen(function*() {
      const state: DriveState = { drives: [driveSpace()], folders: [], files: [], versions: [], nextId: 1 }

      const params = yield* parseCreateDriveFolderParams({ drive: "Docs", path: "/" })
      const error = yield* Effect.flip(createDriveFolder(params).pipe(Effect.provide(makeLayer(state))))

      expect(error).toBeInstanceOf(DrivePathConflictError)
    }))

  it.effect("filters item kinds and uploads with or without parent creation", () =>
    Effect.gen(function*() {
      const specs = folder("folder-specs", "Specs", drive.ids.Root)
      const api = file("file-api", "API.md", drive.ids.Root, [])
      const state: DriveState = {
        drives: [driveSpace()],
        folders: [specs],
        files: [api],
        versions: [version("version-1", api._id, 1)],
        nextId: 1
      }

      const foldersParams = yield* parseListDriveItemsParams({ drive: "Docs", path: "/", kind: "folder" })
      const folders = yield* listDriveItems(foldersParams).pipe(Effect.provide(makeLayer(state)))
      const filesParams = yield* parseListDriveItemsParams({ drive: "Docs", path: "/", kind: "file" })
      const files = yield* listDriveItems(filesParams).pipe(Effect.provide(makeLayer(state)))
      const noParentsParams = yield* parseUploadDriveFileParams({
        drive: "Docs",
        path: "/Missing/Nope.txt",
        contentType: "text/plain",
        data: "SGVsbG8=",
        createParents: false
      })
      const noParents = yield* Effect.flip(uploadDriveFile(noParentsParams).pipe(Effect.provide(makeLayer(state))))
      const nestedParams = yield* parseUploadDriveFileParams({
        drive: "Docs",
        path: "/New/Deep/Note.txt",
        contentType: "text/plain",
        data: "SGVsbG8="
      })
      const nested = yield* uploadDriveFile(nestedParams).pipe(Effect.provide(makeLayer(state)))

      expect(folders.items).toMatchObject([{ kind: "folder", title: "Specs" }])
      expect(files.items).toMatchObject([{ kind: "file", title: "API.md" }])
      expect(noParents).toBeInstanceOf(DrivePathNotFoundError)
      expect(nested.createdParents).toMatchObject([{ path: "/New" }, { path: "/New/Deep" }])
    }))

  it.effect("uploads from a local path at the drive root and rejects root upload paths", () =>
    Effect.gen(function*() {
      const state: DriveState = { drives: [driveSpace()], folders: [], files: [], versions: [], nextId: 1 }

      const rootPathParams = yield* parseUploadDriveFileParams({
        drive: "Docs",
        path: "/",
        contentType: "text/plain",
        data: "SGVsbG8="
      })
      const rootPath = yield* Effect.flip(uploadDriveFile(rootPathParams).pipe(Effect.provide(makeLayer(state))))
      const filePathParams = yield* parseUploadDriveFileParams({
        drive: "Docs",
        path: "/README.md",
        contentType: "text/markdown",
        filePath: "README.md"
      })
      const uploaded = yield* uploadDriveFile(filePathParams).pipe(Effect.provide(makeLayer(state)))
      const fileUrlParams = yield* parseUploadDriveFileParams({
        drive: "Docs",
        path: "/FromUrl.txt",
        contentType: "text/plain",
        fileUrl: "ftp://example.com/file.txt"
      })
      const fileUrl = yield* Effect.flip(uploadDriveFile(fileUrlParams).pipe(Effect.provide(makeLayer(state))))
      const noSource = yield* Effect.flip(
        uploadDriveFile(
          {
            drive: "Docs",
            path: "/Empty.txt",
            contentType: "text/plain"
          } as unknown as Parameters<typeof uploadDriveFile>[0]
        ).pipe(Effect.provide(makeLayer(state)))
      )

      expect(rootPath).toBeInstanceOf(DrivePathConflictError)
      expect(uploaded.file.path).toBe("/README.md")
      expect(uploaded.createdParents).toEqual([])
      expect(fileUrl._tag).toBe("FileFetchError")
      expect(noSource._tag).toBe("InvalidFileDataError")
    }))

  it.effect("reports a folder locator when file versions require a file", () =>
    Effect.gen(function*() {
      const specs = folder("folder-specs", "Specs", drive.ids.Root)
      const state: DriveState = {
        drives: [driveSpace()],
        folders: [specs],
        files: [],
        versions: [],
        nextId: 1,
        updatedFiles: []
      }

      const params = yield* parseListDriveFileVersionsParams({ drive: "Docs", file: "/Specs" })
      const error = yield* Effect.flip(listDriveFileVersions(params).pipe(Effect.provide(makeLayer(state))))

      expect(error).toBeInstanceOf(DriveFileNotFoundError)
    }))

  it.effect("uploads a file, creates an initial version, and lists/restores versions", () =>
    Effect.gen(function*() {
      yield* TestClock.adjust("123 millis")
      const specs = folder("folder-specs", "Specs", drive.ids.Root)
      const state: DriveState = {
        drives: [driveSpace()],
        folders: [specs],
        files: [],
        versions: [],
        nextId: 1,
        updatedFiles: []
      }

      const uploadParams = yield* parseUploadDriveFileParams({
        drive: "Docs",
        path: "/Specs/API.md",
        contentType: "text/markdown",
        data: "SGVsbG8="
      })
      const uploaded = yield* uploadDriveFile(uploadParams).pipe(Effect.provide(makeLayer(state)))

      const createdFile = file(uploaded.file.id, "API.md", specs._id, [specs._id], uploaded.currentVersion.id)
      state.files.push(createdFile)
      state.versions.push(version("version-previous", createdFile._id, 2, "blob-previous"))

      const versionsParams = yield* parseListDriveFileVersionsParams({ drive: "Docs", file: "/Specs/API.md" })
      const versions = yield* listDriveFileVersions(versionsParams).pipe(Effect.provide(makeLayer(state)))
      const restoreParams = yield* parseRestoreDriveFileVersionParams({
        drive: "Docs",
        file: "/Specs/API.md",
        version: "version-previous"
      })
      const restored = yield* restoreDriveFileVersion(restoreParams).pipe(Effect.provide(makeLayer(state)))

      expect(uploaded.currentVersion.lastModified).toBe(123)
      expect(state.versions[0]?.file).toBe("blob-API.md")
      expect(versions.total).toBe(2)
      expect(restored.restored).toBe(true)
      expect(state.updatedFiles?.at(-1)?.operations).toMatchObject({ file: "version-previous" })
    }))

  it.effect("restores numeric versions idempotently and reports missing versions", () =>
    Effect.gen(function*() {
      const specs = folder("folder-specs", "Specs", drive.ids.Root)
      const api = file("file-api", "API.md", specs._id, [specs._id], "version-2", 2)
      const state: DriveState = {
        drives: [driveSpace()],
        folders: [specs],
        files: [api],
        versions: [version("version-1", api._id, 1), version("version-2", api._id, 2)],
        nextId: 1
      }

      const restoreParams = yield* parseRestoreDriveFileVersionParams({ drive: "Docs", file: "file-api", version: "2" })
      const restored = yield* restoreDriveFileVersion(restoreParams).pipe(Effect.provide(makeLayer(state)))
      const missingParams = yield* parseRestoreDriveFileVersionParams({ drive: "Docs", file: "file-api", version: "3" })
      const missing = yield* Effect.flip(restoreDriveFileVersion(missingParams).pipe(Effect.provide(makeLayer(state))))

      expect(restored.restored).toBe(false)
      expect(state.updatedFiles).toBeUndefined()
      expect(missing).toBeInstanceOf(DriveFileVersionNotFoundError)
    }))

  it.effect("rejects upload path conflicts", () =>
    Effect.gen(function*() {
      const existing = folder("folder-specs", "Specs", drive.ids.Root)
      const state: DriveState = { drives: [driveSpace()], folders: [existing], files: [], versions: [], nextId: 1 }

      const params = yield* parseUploadDriveFileParams({
        drive: "Docs",
        path: "/Specs",
        contentType: "text/plain",
        data: "SGVsbG8="
      })
      const error = yield* Effect.flip(uploadDriveFile(params).pipe(Effect.provide(makeLayer(state))))

      expect(error).toBeInstanceOf(DrivePathConflictError)
    }))

  it.effect("uploads a new version for an existing Drive file", () =>
    Effect.gen(function*() {
      yield* TestClock.adjust("321 millis")
      const specs = folder("folder-specs", "Specs", drive.ids.Root)
      const api = file("file-api", "API.md", specs._id, [specs._id], "version-1", 1)
      const state: DriveState = {
        drives: [driveSpace()],
        folders: [specs],
        files: [api],
        versions: [version("version-1", api._id, 1)],
        nextId: 1,
        updatedFiles: []
      }

      const params = yield* parseUploadDriveFileVersionParams({
        drive: "Docs",
        file: "/Specs/API.md",
        contentType: "text/markdown",
        data: "SGVsbG8="
      })
      const result = yield* uploadDriveFileVersion(params).pipe(Effect.provide(makeLayer(state)))

      expect(result.currentVersion.version).toBe(2)
      expect(result.currentVersion.lastModified).toBe(321)
      expect(result.file.currentVersionId).toBe(result.currentVersion.id)
      expect(state.files[0]).toMatchObject({ version: 2, file: result.currentVersion.id })
      expect(state.versions.map((item) => item.version)).toEqual([1, 2])
      expect(state.updatedFiles?.map((update) => update.operations)).toMatchObject([
        { version: 2 },
        { file: result.currentVersion.id }
      ])
    }))

  it.effect("moves files and folders within the same Drive and rewrites descendant paths", () =>
    Effect.gen(function*() {
      const specs = folder("folder-specs", "Specs", drive.ids.Root)
      const archive = folder("folder-archive", "Archive", drive.ids.Root)
      const api = file("file-api", "API.md", specs._id, [specs._id])
      const guide = folder("folder-guide", "Guide", specs._id, [specs._id])
      const page = file("file-page", "Page.md", guide._id, [guide._id, specs._id], "version-page")
      const state: DriveState = {
        drives: [driveSpace()],
        folders: [specs, archive, guide],
        files: [api, page],
        versions: [version("version-1", api._id, 1), version("version-page", page._id, 1)],
        nextId: 1,
        updatedFiles: [],
        updatedFolders: []
      }

      const moveFileParams = yield* parseMoveDriveItemParams({
        drive: "Docs",
        path: "/Specs/API.md",
        targetFolderPath: "/Archive"
      })
      const movedFile = yield* moveDriveItem(moveFileParams).pipe(Effect.provide(makeLayer(state)))
      const moveFolderParams = yield* parseMoveDriveItemParams({
        drive: "Docs",
        path: "/Specs",
        targetFolderPath: "/Archive"
      })
      const movedFolder = yield* moveDriveItem(moveFolderParams).pipe(Effect.provide(makeLayer(state)))
      const idempotentParams = yield* parseMoveDriveItemParams({
        drive: "Docs",
        itemId: specs._id,
        targetFolderPath: "/Archive"
      })
      const idempotent = yield* moveDriveItem(idempotentParams).pipe(Effect.provide(makeLayer(state)))

      expect(movedFile).toMatchObject({ moved: true, fromPath: "/Specs/API.md", toPath: "/Archive/API.md" })
      expect(state.files.find((item) => item._id === api._id)).toMatchObject({
        parent: archive._id,
        path: [archive._id]
      })
      expect(movedFolder).toMatchObject({ moved: true, fromPath: "/Specs", toPath: "/Archive/Specs" })
      expect(state.folders.find((item) => item._id === specs._id)).toMatchObject({
        parent: archive._id,
        path: [archive._id]
      })
      expect(state.folders.find((item) => item._id === guide._id)?.path).toEqual([specs._id, archive._id])
      expect(state.files.find((item) => item._id === page._id)?.path).toEqual([guide._id, specs._id, archive._id])
      expect(idempotent.moved).toBe(false)
    }))

  it.effect("moves a nested file to the Drive root", () =>
    Effect.gen(function*() {
      const specs = folder("folder-specs", "Specs", drive.ids.Root)
      const api = file("file-api", "API.md", specs._id, [specs._id])
      const state: DriveState = {
        drives: [driveSpace()],
        folders: [specs],
        files: [api],
        versions: [version("version-1", api._id, 1)],
        nextId: 1,
        updatedFiles: []
      }

      const params = yield* parseMoveDriveItemParams({
        drive: "Docs",
        path: "/Specs/API.md",
        targetFolderPath: "/"
      })
      const moved = yield* moveDriveItem(params).pipe(Effect.provide(makeLayer(state)))

      expect(moved).toMatchObject({ moved: true, fromPath: "/Specs/API.md", toPath: "/API.md" })
      expect(state.files[0]).toMatchObject({ parent: drive.ids.Root, path: [] })
    }))

  it.effect("rejects move collisions and descendant folder moves", () =>
    Effect.gen(function*() {
      const specs = folder("folder-specs", "Specs", drive.ids.Root)
      const child = folder("folder-child", "Child", specs._id, [specs._id])
      const archive = folder("folder-archive", "Archive", drive.ids.Root)
      const api = file("file-api", "API.md", specs._id, [specs._id])
      const existing = file("file-existing", "API.md", archive._id, [archive._id], "version-existing")
      const state: DriveState = {
        drives: [driveSpace()],
        folders: [specs, child, archive],
        files: [api, existing],
        versions: [version("version-1", api._id, 1), version("version-existing", existing._id, 1)],
        nextId: 1
      }

      const collisionParams = yield* parseMoveDriveItemParams({
        drive: "Docs",
        path: "/Specs/API.md",
        targetFolderPath: "/Archive"
      })
      const collision = yield* Effect.flip(moveDriveItem(collisionParams).pipe(Effect.provide(makeLayer(state))))
      const descendantParams = yield* parseMoveDriveItemParams({
        drive: "Docs",
        path: "/Specs",
        targetFolderPath: "/Specs/Child"
      })
      const descendant = yield* Effect.flip(moveDriveItem(descendantParams).pipe(Effect.provide(makeLayer(state))))

      expect(collision).toBeInstanceOf(DrivePathConflictError)
      expect(descendant).toBeInstanceOf(DriveInvalidMoveError)
    }))

  it.effect("renames Drive items idempotently and rejects sibling collisions", () =>
    Effect.gen(function*() {
      const specs = folder("folder-specs", "Specs", drive.ids.Root)
      const api = file("file-api", "API.md", specs._id, [specs._id])
      const existing = file("file-existing", "Guide.md", specs._id, [specs._id], "version-existing")
      const state: DriveState = {
        drives: [driveSpace()],
        folders: [specs],
        files: [api, existing],
        versions: [version("version-1", api._id, 1), version("version-existing", existing._id, 1)],
        nextId: 1,
        updatedFiles: []
      }

      const renameParams = yield* parseRenameDriveItemParams({
        drive: "Docs",
        path: "/Specs/API.md",
        title: "OpenAPI.md"
      })
      const renamed = yield* renameDriveItem(renameParams).pipe(Effect.provide(makeLayer(state)))
      const unchangedParams = yield* parseRenameDriveItemParams({
        drive: "Docs",
        path: "/Specs/OpenAPI.md",
        title: "OpenAPI.md"
      })
      const unchanged = yield* renameDriveItem(unchangedParams).pipe(Effect.provide(makeLayer(state)))
      const collisionParams = yield* parseRenameDriveItemParams({
        drive: "Docs",
        path: "/Specs/OpenAPI.md",
        title: "Guide.md"
      })
      const collision = yield* Effect.flip(renameDriveItem(collisionParams).pipe(Effect.provide(makeLayer(state))))

      expect(renamed).toMatchObject({ renamed: true, fromPath: "/Specs/API.md", toPath: "/Specs/OpenAPI.md" })
      expect(unchanged.renamed).toBe(false)
      expect(collision).toBeInstanceOf(DrivePathConflictError)
      expect(state.files.find((item) => item._id === api._id)?.title).toBe("OpenAPI.md")
    }))

  it.effect("renames by item id using reconstructed paths", () =>
    Effect.gen(function*() {
      const specs = folder("folder-specs", "Specs", drive.ids.Root)
      const api = file("file-api", "API.md", specs._id, [specs._id])
      const orphan = file("file-orphan", "Orphan.md", toRef<Folder>("folder-missing"), [
        toRef<Folder>("folder-missing")
      ])
      const root = file("file-root", "README.md", drive.ids.Root, [], "version-root")
      const state: DriveState = {
        drives: [driveSpace()],
        folders: [specs],
        files: [api, orphan, root],
        versions: [
          version("version-1", api._id, 1),
          version("version-orphan", orphan._id, 1),
          version("version-root", root._id, 1)
        ],
        nextId: 1,
        updatedFiles: []
      }

      const idParams = yield* parseRenameDriveItemParams({
        drive: "Docs",
        itemId: "file-api",
        title: "API.md"
      })
      const unchanged = yield* renameDriveItem(idParams).pipe(Effect.provide(makeLayer(state)))
      const rootParams = yield* parseRenameDriveItemParams({
        drive: "Docs",
        itemId: "file-root",
        title: "Readme.md"
      })
      const renamedRoot = yield* renameDriveItem(rootParams).pipe(Effect.provide(makeLayer(state)))
      const orphanParams = yield* parseRenameDriveItemParams({
        drive: "Docs",
        itemId: "file-orphan",
        title: "Orphan.md"
      })
      const unchangedOrphan = yield* renameDriveItem(orphanParams).pipe(Effect.provide(makeLayer(state)))

      expect(unchanged).toMatchObject({ renamed: false, fromPath: "/Specs/API.md", toPath: "/Specs/API.md" })
      expect(renamedRoot).toMatchObject({ renamed: true, fromPath: "/README.md", toPath: "/Readme.md" })
      expect(unchangedOrphan.fromPath).toBe("/folder-missing/Orphan.md")
    }))

  it.effect("deletes files with versions, deletes empty folders, and rejects non-empty folders", () =>
    Effect.gen(function*() {
      const empty = folder("folder-empty", "Empty", drive.ids.Root)
      const full = folder("folder-full", "Full", drive.ids.Root)
      const api = file("file-api", "API.md", drive.ids.Root, [], "version-2", 2)
      const child = file("file-child", "Child.md", full._id, [full._id], "version-child")
      const state: DriveState = {
        drives: [driveSpace()],
        folders: [empty, full],
        files: [api, child],
        versions: [
          version("version-1", api._id, 1),
          version("version-2", api._id, 2),
          version("version-child", child._id, 1)
        ],
        nextId: 1,
        removedCollections: [],
        removedDocs: []
      }

      const fileParams = yield* parseDeleteDriveItemParams({ drive: "Docs", path: "/API.md" })
      const deletedFile = yield* deleteDriveItem(fileParams).pipe(Effect.provide(makeLayer(state)))
      const folderParams = yield* parseDeleteDriveItemParams({ drive: "Docs", path: "/Empty" })
      const deletedFolder = yield* deleteDriveItem(folderParams).pipe(Effect.provide(makeLayer(state)))
      const fullParams = yield* parseDeleteDriveItemParams({ drive: "Docs", path: "/Full" })
      const fullError = yield* Effect.flip(deleteDriveItem(fullParams).pipe(Effect.provide(makeLayer(state))))

      expect(deletedFile).toMatchObject({ deleted: true, deletedVersions: 2 })
      expect(state.files.some((item) => item._id === api._id)).toBe(false)
      expect(state.versions.some((item) => item.attachedTo === api._id)).toBe(false)
      expect(state.removedCollections?.filter((item) => item.attachedTo === api._id)).toHaveLength(2)
      expect(deletedFolder).toMatchObject({ deleted: true, deletedVersions: 0 })
      expect(state.folders.some((item) => item._id === empty._id)).toBe(false)
      expect(fullError).toBeInstanceOf(DriveFolderNotEmptyError)
    }))

  it.effect("reports root mutation attempts and falls back to removeDoc for file versions", () =>
    Effect.gen(function*() {
      const api = file("file-api", "API.md", drive.ids.Root, [], "version-2", 2)
      const state: DriveState = {
        drives: [driveSpace()],
        folders: [],
        files: [api],
        versions: [version("version-1", api._id, 1), version("version-2", api._id, 2)],
        nextId: 1,
        removedDocs: [],
        removeCollectionUnavailable: true
      }

      const rootError = yield* Effect.flip(
        deleteDriveItem({ drive: "Docs", path: "/" } as unknown as Parameters<typeof deleteDriveItem>[0]).pipe(
          Effect.provide(makeLayer(state))
        )
      )
      const defaultRootError = yield* Effect.flip(
        deleteDriveItem({ drive: "Docs" } as unknown as Parameters<typeof deleteDriveItem>[0]).pipe(
          Effect.provide(makeLayer(state))
        )
      )
      const deleteParams = yield* parseDeleteDriveItemParams({ drive: "Docs", itemId: "file-api" })
      const deleted = yield* deleteDriveItem(deleteParams).pipe(Effect.provide(makeLayer(state)))

      expect(rootError).toBeInstanceOf(DriveInvalidItemOperationError)
      expect(defaultRootError).toBeInstanceOf(DriveInvalidItemOperationError)
      expect(deleted.deletedVersions).toBe(2)
      expect(state.removedDocs?.filter((item) => item.classRef === drive.class.FileVersion)).toHaveLength(2)
      expect(state.removedDocs?.some((item) => item.id === "file-api")).toBe(true)
    }))
})
