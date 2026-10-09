import { generateId, SortingOrder } from "@hcengineering/core"
import { Clock, Effect } from "effect"

import type {
  CreateDriveFolderParams,
  CreateDriveFolderResult,
  DriveItemSummary,
  DriveSummary,
  GetDriveItemParams,
  GetDriveParams,
  ListDriveFileVersionsParams,
  ListDriveFileVersionsResult,
  ListDriveItemsParams,
  ListDriveItemsResult,
  ListDrivesParams,
  ListDrivesResult,
  RestoreDriveFileVersionParams,
  RestoreDriveFileVersionResult,
  UploadDriveFileParams,
  UploadDriveFileResult
} from "../../domain/schemas/drive.js"
import {
  DEFAULT_DRIVE_CREATE_PARENTS,
  DEFAULT_DRIVE_ITEM_KIND,
  DEFAULT_DRIVE_PATH,
  DrivePath
} from "../../domain/schemas/drive.js"
import { Count, DEFAULT_INCLUDE_ARCHIVED } from "../../domain/schemas/shared.js"
import { isNonEmpty } from "../../utils/assertions.js"
import { HulyClient, type HulyClientOperations } from "../client.js"
import type { Diagnostics } from "../diagnostics.js"
import { drive, type DriveSpace, type File, type FileVersion, type Folder } from "../drive-sdk.js"
import { DrivePathConflictError, DrivePathNotFoundError } from "../errors-drive.js"
import { getBufferFromParams, HulyStorageClient, validateContentType, validateFileSize } from "../storage.js"
import { pathForItem, toDriveItemSummary, toDriveSummary, toFileVersionSummary } from "./drive-mappers.js"
import { childPath, type NormalizedDrivePath, normalizeDrivePath, parentPathOf } from "./drive-path.js"
import {
  ensureFolderPath,
  findChildrenByTitle,
  listChildren,
  makeCreatedFile,
  requireFolderParent,
  resolveDrive,
  resolveExistingParentFolder,
  resolveFile,
  resolveItemById,
  resolvePath,
  resolveVersion
} from "./drive-resolvers.js"
import {
  type CreatedFolder,
  type DriveOperationError,
  filterDrivesByQuery,
  itemKind,
  VERSIONS_COLLECTION
} from "./drive-shared.js"
import { makeFileVersionData, uploadSource } from "./drive-upload-shared.js"
import { clampLimit, hulyQuery } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"

const LAST_SEGMENT_INDEX = -1

export {
  addDriveMembers,
  createDrive,
  deleteDrive,
  removeDriveMembers,
  setDriveOwners,
  updateDrive
} from "./drive-admin.js"
export {
  addDriveFileComment,
  deleteDriveFileComment,
  listDriveFileActivity,
  listDriveFileComments,
  updateDriveFileComment
} from "./drive-comments.js"
export { deleteDriveItem, moveDriveItem, renameDriveItem, uploadDriveFileVersion } from "./drive-file-operations.js"

export const listDrives = (
  params: ListDrivesParams
): Effect.Effect<ListDrivesResult, DriveOperationError, HulyClient> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const query = (params.includeArchived ?? DEFAULT_INCLUDE_ARCHIVED) ? {} : { archived: false }
    const drives = yield* client.findAll<DriveSpace>(drive.class.Drive, hulyQuery<DriveSpace>(query), {
      limit: clampLimit(params.limit),
      sort: { name: SortingOrder.Ascending }
    })
    const filtered = filterDrivesByQuery(drives, params.query).slice(0, clampLimit(params.limit))

    return { drives: filtered.map((item) => toDriveSummary(client, item)), total: Count.make(filtered.length) }
  })

export const getDrive = (params: GetDriveParams): Effect.Effect<DriveSummary, DriveOperationError, HulyClient> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const resolved = yield* resolveDrive(client, params.drive)
    return toDriveSummary(client, resolved)
  })

export const listDriveItems = (
  params: ListDriveItemsParams
): Effect.Effect<ListDriveItemsResult, DriveOperationError, HulyClient | HulyStorageClient | Diagnostics> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const driveSpace = yield* resolveDrive(client, params.drive)
    const normalized = normalizeDrivePath(params.path ?? DEFAULT_DRIVE_PATH)
    const resolved = yield* resolvePath(client, driveSpace, normalized)
    const parent = yield* requireFolderParent(params.drive, normalized, resolved)
    const items = yield* listChildren(
      client,
      driveSpace,
      parent?._id ?? drive.ids.Root,
      params.kind ?? DEFAULT_DRIVE_ITEM_KIND,
      params.limit
    )

    return {
      drive: toDriveSummary(client, driveSpace),
      path: DrivePath.make(normalized.path),
      items: yield* Effect.forEach(items, (item) =>
        toDriveItemSummary(item, driveSpace, childPath(normalized.path, item.title), client)
      ),
      total: Count.make(items.length)
    }
  })

export const getDriveItem = (
  params: GetDriveItemParams
): Effect.Effect<DriveItemSummary, DriveOperationError, HulyClient | HulyStorageClient | Diagnostics> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const driveSpace = yield* resolveDrive(client, params.drive)
    const resolved =
      params.itemId !== undefined
        ? { item: yield* resolveItemById(client, driveSpace, params.itemId), path: undefined }
        : yield* resolvePath(client, driveSpace, normalizeDrivePath(params.path ?? DEFAULT_DRIVE_PATH))
    const item = resolved.item

    if (item === undefined) {
      return yield* Effect.fail(
        new DrivePathNotFoundError({ drive: params.drive, path: params.path ?? DEFAULT_DRIVE_PATH })
      )
    }
    return yield* toDriveItemSummary(item, driveSpace, resolved.path ?? pathForItem(item), client)
  })

export const createDriveFolder = (
  params: CreateDriveFolderParams
): Effect.Effect<CreateDriveFolderResult, DriveOperationError, HulyClient | HulyStorageClient | Diagnostics> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const driveSpace = yield* resolveDrive(client, params.drive)
    const normalized = normalizeDrivePath(params.path)
    if (normalized.segments.length === 0) {
      return yield* Effect.fail(
        new DrivePathConflictError({ drive: params.drive, path: normalized.path, existingKind: "folder" })
      )
    }
    const result = yield* ensureFolderPath(client, driveSpace, params.drive, normalized)
    if (result.folder === undefined) {
      return yield* Effect.fail(
        new DrivePathConflictError({ drive: params.drive, path: normalized.path, existingKind: "folder" })
      )
    }
    const summary = yield* toDriveItemSummary(result.folder, driveSpace, normalized.path, client)
    return { folder: summary, created: result.created }
  })

const requireUploadTitle = (
  params: UploadDriveFileParams,
  normalized: ReturnType<typeof normalizeDrivePath>
): Effect.Effect<string, DrivePathConflictError> =>
  Effect.gen(function* () {
    if (!isNonEmpty(normalized.segments)) {
      return yield* new DrivePathConflictError({ drive: params.drive, path: normalized.path, existingKind: "folder" })
    }
    const title = normalized.segments.at(LAST_SEGMENT_INDEX)
    if (title === undefined) {
      return yield* new DrivePathConflictError({ drive: params.drive, path: normalized.path, existingKind: "folder" })
    }
    return title
  })

const resolveUploadParentFolder = (
  client: HulyClientOperations,
  driveSpace: DriveSpace,
  params: UploadDriveFileParams,
  normalized: NormalizedDrivePath,
  parentPath: NormalizedDrivePath
): Effect.Effect<
  { readonly folder: Folder | undefined; readonly createdFolders: ReadonlyArray<CreatedFolder> },
  DriveOperationError
> =>
  Effect.gen(function* () {
    const createParents = params.createParents ?? DEFAULT_DRIVE_CREATE_PARENTS
    return createParents
      ? yield* ensureFolderPath(client, driveSpace, params.drive, parentPath)
      : yield* resolveExistingParentFolder(client, driveSpace, params.drive, normalized, parentPath)
  })

export const uploadDriveFile = (
  params: UploadDriveFileParams
): Effect.Effect<UploadDriveFileResult, DriveOperationError, HulyClient | HulyStorageClient | Diagnostics> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const storage = yield* HulyStorageClient
    const driveSpace = yield* resolveDrive(client, params.drive)
    const normalized = normalizeDrivePath(params.path)
    const title = yield* requireUploadTitle(params, normalized)

    const parentPath = parentPathOf(normalized)
    const parent = yield* resolveUploadParentFolder(client, driveSpace, params, normalized, parentPath)
    const parentFolder = parent.folder

    const existing = yield* findChildrenByTitle(client, driveSpace, parentFolder?._id ?? drive.ids.Root, title)
    if (isNonEmpty(existing)) {
      const existingItem = existing[0]
      return yield* Effect.fail(
        new DrivePathConflictError({ drive: params.drive, path: normalized.path, existingKind: itemKind(existingItem) })
      )
    }

    const source = uploadSource(params)
    const buffer = yield* getBufferFromParams(source)
    yield* validateContentType(params.contentType, title)
    yield* validateFileSize(buffer, title)
    const uploaded = yield* storage.uploadFile(title, buffer, params.contentType)
    const now = yield* Clock.currentTimeMillis
    const versionId = toRef<FileVersion>(generateId())
    const fileId = yield* client.createDoc<File>(drive.class.File, driveSpace._id, {
      title,
      parent: parentFolder?._id ?? drive.ids.Root,
      path: parentFolder === undefined ? [] : [parentFolder._id, ...parentFolder.path],
      file: versionId,
      version: 1,
      versions: 0
    })
    const version = makeFileVersionData(title, uploaded.blobId, uploaded.size, uploaded.contentType, now, 1)
    yield* client.addCollection<File, FileVersion>(
      drive.class.FileVersion,
      driveSpace._id,
      fileId,
      drive.class.File,
      VERSIONS_COLLECTION,
      version,
      versionId
    )

    const file = yield* makeCreatedFile(drive.class.File, driveSpace, client, fileId, title, parent.folder, versionId)
    const versionSummary = yield* toFileVersionSummary(storage, versionId, fileId, version, true)
    return {
      file: yield* toDriveItemSummary(file, driveSpace, normalized.path, client),
      createdParents: yield* Effect.forEach(parent.createdFolders, (created) =>
        toDriveItemSummary(created.folder, driveSpace, created.path, client)
      ),
      currentVersion: versionSummary
    }
  })

export const listDriveFileVersions = (
  params: ListDriveFileVersionsParams
): Effect.Effect<ListDriveFileVersionsResult, DriveOperationError, HulyClient | HulyStorageClient | Diagnostics> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const driveSpace = yield* resolveDrive(client, params.drive)
    const file = yield* resolveFile(client, driveSpace, params.drive, params.file)
    const versions = yield* client.findAll<FileVersion>(
      drive.class.FileVersion,
      hulyQuery<FileVersion>({ attachedTo: file._id }),
      { sort: { version: SortingOrder.Descending } }
    )
    const storage = yield* HulyStorageClient
    return {
      file: yield* toDriveItemSummary(file, driveSpace, pathForItem(file), client),
      versions: yield* Effect.forEach(versions, (version) =>
        toFileVersionSummary(storage, version._id, file._id, version, version._id === file.file)
      ),
      total: Count.make(versions.length)
    }
  })

export const restoreDriveFileVersion = (
  params: RestoreDriveFileVersionParams
): Effect.Effect<RestoreDriveFileVersionResult, DriveOperationError, HulyClient | HulyStorageClient | Diagnostics> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const driveSpace = yield* resolveDrive(client, params.drive)
    const file = yield* resolveFile(client, driveSpace, params.drive, params.file)
    const version = yield* resolveVersion(client, driveSpace, params.drive, file, params.version)
    const restored = file.file !== version._id
    if (restored) {
      yield* client.updateDoc<File>(drive.class.File, driveSpace._id, file._id, { file: version._id })
    }
    const updatedFile: File = restored ? { ...file, file: version._id } : file
    const storage = yield* HulyStorageClient
    return {
      file: yield* toDriveItemSummary(updatedFile, driveSpace, pathForItem(updatedFile), client),
      restoredVersion: yield* toFileVersionSummary(storage, version._id, file._id, version, true),
      restored
    }
  })
