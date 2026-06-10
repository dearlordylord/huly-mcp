import type { Ref } from "@hcengineering/core"
import { generateId } from "@hcengineering/core"
import { Clock, Effect } from "effect"

import type {
  DeleteDriveItemParams,
  DeleteDriveItemResult,
  MoveDriveItemParams,
  MoveDriveItemResult,
  RenameDriveItemParams,
  RenameDriveItemResult,
  UploadDriveFileVersionParams,
  UploadDriveFileVersionResult
} from "../../domain/schemas/drive.js"
import { DEFAULT_DRIVE_PATH, DriveItemId, DrivePath } from "../../domain/schemas/drive.js"
import { Count } from "../../domain/schemas/shared.js"
import { HulyClient, type HulyClientOperations } from "../client.js"
import { computeChildPath, drive, type DriveSpace, type File, type FileVersion, type Folder } from "../drive-sdk.js"
import {
  DriveFolderNotEmptyError,
  DriveInvalidItemOperationError,
  DriveInvalidMoveError,
  DrivePathConflictError
} from "../errors-drive.js"
import { getBufferFromParams, HulyStorageClient, validateContentType, validateFileSize } from "../storage.js"
import { toDriveItemSummary, toFileVersionSummary } from "./drive-mappers.js"
import { childPath, normalizeDrivePath, rewriteMovedFolderDescendantPath } from "./drive-path.js"
import {
  findChildrenByTitle,
  requireFolderParent,
  resolveDrive,
  resolveFile,
  resolveItemById,
  resolvePath
} from "./drive-resolvers.js"
import {
  type DriveItem,
  type DriveOperationError,
  isFile,
  isFolder,
  itemKind,
  VERSIONS_COLLECTION
} from "./drive-shared.js"
import { makeFileVersionData, uploadSource } from "./drive-upload-shared.js"
import { hulyQuery } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"

const FOLDER_NOT_EMPTY_CHILD_SUMMARY_LIMIT = 10

export const uploadDriveFileVersion = (
  params: UploadDriveFileVersionParams
): Effect.Effect<UploadDriveFileVersionResult, DriveOperationError, HulyClient | HulyStorageClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const storage = yield* HulyStorageClient
    const driveSpace = yield* resolveDrive(client, params.drive)
    const file = yield* resolveFile(client, driveSpace, params.drive, params.file)
    const source = uploadSource(params)
    const buffer = yield* getBufferFromParams(source)
    yield* validateContentType(params.contentType, file.title)
    yield* validateFileSize(buffer, file.title)
    const uploaded = yield* storage.uploadFile(file.title, buffer, params.contentType)
    const now = yield* Clock.currentTimeMillis
    const nextVersion = file.version + 1
    const versionId = toRef<FileVersion>(generateId())
    const version = makeFileVersionData(
      file.title,
      uploaded.blobId,
      uploaded.size,
      uploaded.contentType,
      now,
      nextVersion
    )

    yield* client.updateDoc<File>(drive.class.File, driveSpace._id, file._id, { version: nextVersion })
    yield* client.addCollection<File, FileVersion>(
      drive.class.FileVersion,
      driveSpace._id,
      file._id,
      drive.class.File,
      VERSIONS_COLLECTION,
      version,
      versionId
    )
    yield* client.updateDoc<File>(drive.class.File, driveSpace._id, file._id, { file: versionId })

    const updatedFile: File = { ...file, file: versionId, version: nextVersion }
    return {
      file: yield* toDriveItemSummary(updatedFile, driveSpace, yield* displayPathForItem(client, updatedFile), client),
      currentVersion: toFileVersionSummary(storage, versionId, file._id, version, true)
    }
  })

export const moveDriveItem = (
  params: MoveDriveItemParams
): Effect.Effect<MoveDriveItemResult, DriveOperationError, HulyClient | HulyStorageClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const driveSpace = yield* resolveDrive(client, params.drive)
    const resolved = yield* resolveMutableItem(client, driveSpace, params.drive, params.path, params.itemId, "move")
    const item = resolved.item
    const targetPath = normalizeDrivePath(params.targetFolderPath)
    const targetResolved = yield* resolvePath(client, driveSpace, targetPath)
    const targetFolder = yield* requireFolderParent(params.drive, targetPath, targetResolved)
    const targetParent = targetFolder?._id ?? drive.ids.Root
    const fromPath = resolved.path
    const toPath = childPath(targetPath.path, item.title)

    if (isFolder(item) && targetFolder !== undefined) {
      if (targetFolder._id === item._id || targetFolder.path.includes(item._id)) {
        return yield* Effect.fail(
          new DriveInvalidMoveError({
            drive: params.drive,
            path: fromPath,
            targetFolderPath: targetPath.path,
            reason: "a folder cannot be moved into itself or one of its descendants"
          })
        )
      }
    }

    if (item.parent === targetParent) {
      return {
        item: yield* toDriveItemSummary(item, driveSpace, fromPath, client),
        moved: false,
        fromPath: DrivePath.make(fromPath),
        toPath: DrivePath.make(fromPath)
      }
    }

    const collisions = yield* findChildrenByTitle(client, driveSpace, targetParent, item.title)
    const blockingCollision = collisions.find((candidate) => candidate._id !== item._id)
    if (blockingCollision !== undefined) {
      return yield* Effect.fail(
        new DrivePathConflictError({
          drive: params.drive,
          path: toPath,
          existingKind: itemKind(blockingCollision)
        })
      )
    }

    const nextPath = computeChildPath(targetFolder)
    yield* updateDriveItem(client, driveSpace, item, { parent: targetParent, path: nextPath })
    if (isFolder(item)) {
      yield* rewriteDescendantPaths(client, driveSpace, item, nextPath)
    }
    const movedItem: DriveItem = { ...item, parent: targetParent, path: nextPath }
    return {
      item: yield* toDriveItemSummary(movedItem, driveSpace, toPath, client),
      moved: true,
      fromPath: DrivePath.make(fromPath),
      toPath: DrivePath.make(toPath)
    }
  })

export const renameDriveItem = (
  params: RenameDriveItemParams
): Effect.Effect<RenameDriveItemResult, DriveOperationError, HulyClient | HulyStorageClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const driveSpace = yield* resolveDrive(client, params.drive)
    const resolved = yield* resolveMutableItem(client, driveSpace, params.drive, params.path, params.itemId, "rename")
    const item = resolved.item
    const fromPath = resolved.path
    const parentPath = parentPathString(fromPath)
    const toPath = childPath(parentPath, params.title)

    if (item.title === params.title) {
      return {
        item: yield* toDriveItemSummary(item, driveSpace, fromPath, client),
        renamed: false,
        fromPath: DrivePath.make(fromPath),
        toPath: DrivePath.make(fromPath)
      }
    }

    const collisions = yield* findChildrenByTitle(client, driveSpace, item.parent, params.title)
    const blockingCollision = collisions.find((candidate) => candidate._id !== item._id)
    if (blockingCollision !== undefined) {
      return yield* Effect.fail(
        new DrivePathConflictError({
          drive: params.drive,
          path: toPath,
          existingKind: itemKind(blockingCollision)
        })
      )
    }

    yield* updateDriveItem(client, driveSpace, item, { title: params.title })
    const renamedItem: DriveItem = { ...item, title: params.title }
    return {
      item: yield* toDriveItemSummary(renamedItem, driveSpace, toPath, client),
      renamed: true,
      fromPath: DrivePath.make(fromPath),
      toPath: DrivePath.make(toPath)
    }
  })

export const deleteDriveItem = (
  params: DeleteDriveItemParams
): Effect.Effect<DeleteDriveItemResult, DriveOperationError, HulyClient | HulyStorageClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const driveSpace = yield* resolveDrive(client, params.drive)
    const resolved = yield* resolveMutableItem(client, driveSpace, params.drive, params.path, params.itemId, "delete")
    const item = resolved.item
    const summary = yield* toDriveItemSummary(item, driveSpace, resolved.path, client)

    if (isFolder(item)) {
      const children = yield* listAllChildren(client, driveSpace, item._id)
      if (children.length > 0) {
        return yield* Effect.fail(
          new DriveFolderNotEmptyError({
            drive: params.drive,
            path: resolved.path,
            childCount: Count.make(children.length),
            children: children.slice(0, FOLDER_NOT_EMPTY_CHILD_SUMMARY_LIMIT).map((child) => ({
              id: child._id,
              title: child.title,
              kind: itemKind(child)
            }))
          })
        )
      }
      yield* client.removeDoc<Folder>(drive.class.Folder, driveSpace._id, item._id)
      return { deletedItem: summary, deletedVersions: Count.make(0), deleted: true }
    }

    const versions = yield* client.findAll<FileVersion>(
      drive.class.FileVersion,
      hulyQuery<FileVersion>({ attachedTo: item._id })
    )
    yield* Effect.forEach(versions, (version) => removeFileVersion(client, driveSpace, item, version), {
      discard: true
    })
    yield* client.removeDoc<File>(drive.class.File, driveSpace._id, item._id)
    return { deletedItem: summary, deletedVersions: Count.make(versions.length), deleted: true }
  })

const resolveMutableItem = (
  client: HulyClientOperations,
  driveSpace: DriveSpace,
  driveIdentifier: string,
  path: string | undefined,
  itemId: string | undefined,
  operation: "move" | "rename" | "delete"
): Effect.Effect<{ readonly item: DriveItem; readonly path: string }, DriveOperationError> =>
  Effect.gen(function*() {
    const resolved = itemId !== undefined
      ? { item: yield* resolveItemById(client, driveSpace, DriveItemId.make(itemId)), path: undefined }
      : yield* resolvePath(client, driveSpace, normalizeDrivePath(path ?? DEFAULT_DRIVE_PATH))
    if (resolved.item === undefined) {
      return yield* Effect.fail(
        new DriveInvalidItemOperationError({
          drive: driveIdentifier,
          path: path ?? DEFAULT_DRIVE_PATH,
          operation,
          reason: "the Drive root is not a file or folder item"
        })
      )
    }
    return {
      item: resolved.item,
      path: resolved.path ?? (yield* displayPathForItem(client, resolved.item))
    }
  })

const displayPathForItem = (
  client: HulyClientOperations,
  item: DriveItem
): Effect.Effect<string, DriveOperationError> =>
  Effect.gen(function*() {
    const reversedParents = [...item.path].reverse()
    const titles = yield* Effect.forEach(reversedParents, (parentId) =>
      Effect.gen(function*() {
        const parent = yield* client.findOne<Folder>(drive.class.Folder, hulyQuery<Folder>({ _id: parentId }))
        return parent?.title ?? parentId
      }))
    return `/${[...titles, item.title].join("/")}`
  })

const parentPathString = (path: string): string => {
  const index = path.lastIndexOf("/")
  return index <= 0 ? "/" : path.slice(0, index)
}

const updateDriveItem = (
  client: HulyClientOperations,
  driveSpace: DriveSpace,
  item: DriveItem,
  operations: { readonly title?: string; readonly parent?: Ref<Folder>; readonly path?: ReadonlyArray<Ref<Folder>> }
) =>
  isFile(item)
    ? client.updateDoc<File>(drive.class.File, driveSpace._id, item._id, operations)
    : client.updateDoc<Folder>(drive.class.Folder, driveSpace._id, item._id, operations)

const rewriteDescendantPaths = (
  client: HulyClientOperations,
  driveSpace: DriveSpace,
  folder: Folder,
  newFolderPath: ReadonlyArray<Ref<Folder>>
): Effect.Effect<void, DriveOperationError> =>
  Effect.gen(function*() {
    const folders = yield* client.findAll<Folder>(drive.class.Folder, hulyQuery<Folder>({ space: driveSpace._id }))
    const files = yield* client.findAll<File>(drive.class.File, hulyQuery<File>({ space: driveSpace._id }))
    const descendants = [...folders, ...files].filter((candidate) => candidate.path.includes(folder._id))
    yield* Effect.forEach(descendants, (descendant) => {
      const nextPath = rewriteMovedFolderDescendantPath(descendant.path, folder._id, newFolderPath)
      return updateDriveItem(client, driveSpace, descendant, { path: nextPath })
    }, { discard: true })
  })

const listAllChildren = (
  client: HulyClientOperations,
  driveSpace: DriveSpace,
  parent: Ref<Folder>
): Effect.Effect<ReadonlyArray<DriveItem>, DriveOperationError> =>
  Effect.gen(function*() {
    const folders = yield* client.findAll<Folder>(
      drive.class.Folder,
      hulyQuery<Folder>({ space: driveSpace._id, parent })
    )
    const files = yield* client.findAll<File>(drive.class.File, hulyQuery<File>({ space: driveSpace._id, parent }))
    return [...folders, ...files]
  })

const removeFileVersion = (
  client: HulyClientOperations,
  driveSpace: DriveSpace,
  file: File,
  version: FileVersion
): Effect.Effect<void, DriveOperationError> => {
  if (client.removeCollection !== undefined) {
    return Effect.asVoid(
      client.removeCollection<File, FileVersion>(
        drive.class.FileVersion,
        driveSpace._id,
        version._id,
        file._id,
        drive.class.File,
        VERSIONS_COLLECTION
      )
    )
  }
  return Effect.asVoid(client.removeDoc<FileVersion>(drive.class.FileVersion, driveSpace._id, version._id))
}
