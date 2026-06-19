import type { Class, Doc, PersonId, Ref } from "@hcengineering/core"
import { Clock, Effect } from "effect"

import type { DriveItemId } from "../../domain/schemas/drive.js"
import { isSingle } from "../../utils/assertions.js"
import type { HulyClientError, HulyClientOperations } from "../client.js"
import {
  computeChildPath,
  type Drive,
  drive,
  type DriveSpace,
  type File,
  type FileVersion,
  type Folder
} from "../drive-sdk.js"
import {
  DriveFileNotFoundError,
  DriveFileVersionNotFoundError,
  DriveIdentifierAmbiguousError,
  DriveNotFoundError,
  DriveParentNotFolderError,
  DrivePathAmbiguousError,
  DrivePathNotFoundError
} from "../errors-drive.js"
import { childPath, type NormalizedDrivePath, normalizeDrivePath } from "./drive-path.js"
import {
  type CreatedFolder,
  DRIVE_ROOT_PATH,
  type DriveItem,
  type DriveOperationError,
  isFile,
  isFolder,
  itemKind,
  type ResolvedPath
} from "./drive-shared.js"
import { clampLimit, hulyQuery } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"

export const resolveDrive = (
  client: HulyClientOperations,
  identifier: string
): Effect.Effect<DriveSpace, DriveOperationError> =>
  Effect.gen(function*() {
    const byId = yield* client.findOne<DriveSpace>(
      drive.class.Drive,
      hulyQuery<DriveSpace>({ _id: toRef<DriveSpace>(identifier) })
    )
    if (byId !== undefined) return byId

    const byName = yield* client.findAll<DriveSpace>(drive.class.Drive, hulyQuery<DriveSpace>({ name: identifier }))
    if (isSingle(byName)) return byName[0]
    if (byName.length > 1) {
      return yield* Effect.fail(
        new DriveIdentifierAmbiguousError({
          drive: identifier,
          matches: byName.map((item) => ({ id: item._id, name: item.name }))
        })
      )
    }
    return yield* Effect.fail(new DriveNotFoundError({ drive: identifier }))
  })

export const resolvePath = (
  client: HulyClientOperations,
  driveSpace: DriveSpace,
  path: NormalizedDrivePath
): Effect.Effect<ResolvedPath, DriveOperationError> =>
  Effect.gen(function*() {
    if (path.segments.length === 0) return { item: undefined, path: DRIVE_ROOT_PATH }

    let parent: Ref<Folder> = drive.ids.Root
    let current: DriveItem | undefined
    let currentPath = DRIVE_ROOT_PATH
    const lastSegment = path.segments[path.segments.length - 1]

    for (const segment of path.segments) {
      const candidates = yield* findChildrenByTitle(client, driveSpace, parent, segment)
      if (candidates.length === 0) {
        return yield* Effect.fail(
          new DrivePathNotFoundError({ drive: driveSpace.name, path: childPath(currentPath, segment) })
        )
      }
      if (candidates.length > 1) {
        return yield* Effect.fail(
          new DrivePathAmbiguousError({
            drive: driveSpace.name,
            path: childPath(currentPath, segment),
            candidates: candidates.map((candidate) => ({
              id: candidate._id,
              path: childPath(currentPath, candidate.title),
              kind: itemKind(candidate)
            }))
          })
        )
      }
      if (!isSingle(candidates)) {
        return yield* Effect.fail(
          new DrivePathNotFoundError({ drive: driveSpace.name, path: childPath(currentPath, segment) })
        )
      }
      const currentItem = candidates[0]
      current = currentItem
      currentPath = childPath(currentPath, currentItem.title)
      if (segment !== lastSegment) {
        if (!isFolder(currentItem)) {
          return yield* Effect.fail(
            new DriveParentNotFolderError({
              drive: driveSpace.name,
              path: path.path,
              parentPath: currentPath
            })
          )
        }
        parent = currentItem._id
      }
    }

    return { item: current, path: currentPath }
  })

export const resolveItemById = (
  client: HulyClientOperations,
  driveSpace: DriveSpace,
  itemId: DriveItemId
): Effect.Effect<DriveItem, DriveOperationError> =>
  Effect.gen(function*() {
    const folder = yield* client.findOne<Folder>(
      drive.class.Folder,
      hulyQuery<Folder>({
        _id: toRef<Folder>(itemId),
        space: driveSpace._id
      })
    )
    if (folder !== undefined) return folder
    const file = yield* client.findOne<File>(
      drive.class.File,
      hulyQuery<File>({
        _id: toRef<File>(itemId),
        space: driveSpace._id
      })
    )
    if (file !== undefined) return file
    return yield* Effect.fail(new DrivePathNotFoundError({ drive: driveSpace.name, path: itemId }))
  })

export const resolveFile = (
  client: HulyClientOperations,
  driveSpace: DriveSpace,
  driveIdentifier: string,
  fileLocator: string
): Effect.Effect<File, DriveOperationError> =>
  Effect.gen(function*() {
    const byId = yield* client.findOne<File>(
      drive.class.File,
      hulyQuery<File>({
        _id: toRef<File>(fileLocator),
        space: driveSpace._id
      })
    )
    if (byId !== undefined) return byId

    const resolved = yield* resolvePath(client, driveSpace, normalizeDrivePath(fileLocator))
    if (resolved.item !== undefined && isFile(resolved.item)) return resolved.item
    return yield* Effect.fail(new DriveFileNotFoundError({ drive: driveIdentifier, file: fileLocator }))
  })

export const resolveVersion = (
  client: HulyClientOperations,
  driveSpace: DriveSpace,
  driveIdentifier: string,
  file: File,
  versionLocator: string
): Effect.Effect<FileVersion, DriveOperationError> =>
  Effect.gen(function*() {
    const numericVersion = Number(versionLocator)
    const query = Number.isInteger(numericVersion) && numericVersion > 0
      ? hulyQuery<FileVersion>({ attachedTo: file._id, version: numericVersion })
      : hulyQuery<FileVersion>({ _id: toRef<FileVersion>(versionLocator), attachedTo: file._id })
    const version = yield* client.findOne<FileVersion>(drive.class.FileVersion, query)
    if (version !== undefined && version.space === driveSpace._id) return version
    return yield* Effect.fail(
      new DriveFileVersionNotFoundError({
        drive: driveIdentifier,
        file: file._id,
        version: versionLocator
      })
    )
  })

export const requireFolderParent = (
  driveIdentifier: string,
  path: NormalizedDrivePath,
  resolved: ResolvedPath
): Effect.Effect<Folder | undefined, DriveParentNotFolderError> => {
  if (resolved.item === undefined) return Effect.succeed(undefined)
  if (isFolder(resolved.item)) return Effect.succeed(resolved.item)
  return Effect.fail(
    new DriveParentNotFolderError({
      drive: driveIdentifier,
      path: path.path,
      parentPath: resolved.path
    })
  )
}

export const resolveExistingParentFolder = (
  client: HulyClientOperations,
  driveSpace: DriveSpace,
  driveIdentifier: string,
  fullPath: NormalizedDrivePath,
  parentPath: NormalizedDrivePath
): Effect.Effect<
  { readonly folder: Folder | undefined; readonly createdFolders: ReadonlyArray<CreatedFolder> },
  DriveOperationError
> =>
  Effect.gen(function*() {
    const resolved = yield* resolvePath(client, driveSpace, parentPath)
    const folder = yield* requireFolderParent(driveIdentifier, fullPath, resolved)
    return { folder, createdFolders: [] }
  })

export const ensureFolderPath = (
  client: HulyClientOperations,
  driveSpace: DriveSpace,
  driveIdentifier: string,
  path: NormalizedDrivePath
): Effect.Effect<
  {
    readonly folder: Folder | undefined
    readonly created: boolean
    readonly createdFolders: ReadonlyArray<CreatedFolder>
  },
  DriveOperationError
> =>
  Effect.gen(function*() {
    let parent: Folder | undefined
    let parentRef: Ref<Folder> = drive.ids.Root
    let currentPath = DRIVE_ROOT_PATH
    let createdFolders: ReadonlyArray<CreatedFolder> = []

    for (const segment of path.segments) {
      const matches = yield* findChildrenByTitle(client, driveSpace, parentRef, segment)
      if (matches.length > 1) {
        return yield* Effect.fail(
          new DrivePathAmbiguousError({
            drive: driveIdentifier,
            path: childPath(currentPath, segment),
            candidates: matches.map((match) => ({
              id: match._id,
              path: childPath(currentPath, match.title),
              kind: itemKind(match)
            }))
          })
        )
      }
      if (isSingle(matches)) {
        const existing = matches[0]
        if (!isFolder(existing)) {
          return yield* Effect.fail(
            new DriveParentNotFolderError({
              drive: driveIdentifier,
              path: path.path,
              parentPath: childPath(currentPath, existing.title)
            })
          )
        }
        parent = existing
        parentRef = existing._id
        currentPath = childPath(currentPath, existing.title)
        continue
      }

      const folderId = yield* client.createDoc<Folder>(
        drive.class.Folder,
        driveSpace._id,
        {
          title: segment,
          parent: parentRef,
          path: computeChildPath(parent)
        }
      )
      const folder: Folder = {
        ...baseCreatedDoc(drive.class.Folder, toRef<Drive>(driveSpace._id), client.getPrimarySocialId()),
        _id: folderId,
        title: segment,
        parent: parentRef,
        path: computeChildPath(parent)
      }
      currentPath = childPath(currentPath, segment)
      createdFolders = [...createdFolders, { folder, path: currentPath }]
      parent = folder
      parentRef = folder._id
    }

    return {
      folder: parent,
      created: createdFolders.length > 0,
      createdFolders
    }
  })

export const listChildren = (
  client: HulyClientOperations,
  driveSpace: DriveSpace,
  parent: Ref<Folder>,
  kind: "any" | "folder" | "file",
  limit?: number
): Effect.Effect<ReadonlyArray<DriveItem>, HulyClientError> =>
  Effect.gen(function*() {
    const folders = kind === "file"
      ? []
      : yield* client.findAll<Folder>(drive.class.Folder, hulyQuery<Folder>({ space: driveSpace._id, parent }))
    const files = kind === "folder"
      ? []
      : yield* client.findAll<File>(drive.class.File, hulyQuery<File>({ space: driveSpace._id, parent }))
    return [...folders, ...files]
      .sort((a, b) => a.title.localeCompare(b.title) || itemKind(a).localeCompare(itemKind(b)))
      .slice(0, clampLimit(limit))
  })

export const findChildrenByTitle = (
  client: HulyClientOperations,
  driveSpace: DriveSpace,
  parent: Ref<Folder>,
  title: string
): Effect.Effect<ReadonlyArray<DriveItem>, HulyClientError> =>
  Effect.gen(function*() {
    const folders = yield* client.findAll<Folder>(
      drive.class.Folder,
      hulyQuery<Folder>({
        space: driveSpace._id,
        parent,
        title
      })
    )
    const files = yield* client.findAll<File>(
      drive.class.File,
      hulyQuery<File>({
        space: driveSpace._id,
        parent,
        title
      })
    )
    return [...folders, ...files]
  })

const baseCreatedDoc = <T extends Doc>(
  classRef: Ref<Class<T>>,
  space: Ref<Drive>,
  personId: PersonId,
  now = 0
): {
  readonly _class: Ref<Class<T>>
  readonly space: Ref<Drive>
  readonly modifiedBy: PersonId
  readonly modifiedOn: number
  readonly createdBy: PersonId
  readonly createdOn: number
} => ({
  _class: classRef,
  space,
  modifiedBy: personId,
  modifiedOn: now,
  createdBy: personId,
  createdOn: now
})

export const makeCreatedFile = (
  classRef: Ref<Class<File>>,
  driveSpace: DriveSpace,
  client: HulyClientOperations,
  fileId: Ref<File>,
  title: string,
  parent: Folder | undefined,
  versionId: Ref<FileVersion>
): Effect.Effect<File, never> =>
  Effect.gen(function*() {
    const now = yield* Clock.currentTimeMillis
    return {
      ...baseCreatedDoc(classRef, toRef<Drive>(driveSpace._id), client.getPrimarySocialId(), now),
      _id: fileId,
      title,
      parent: parent?._id ?? drive.ids.Root,
      path: parent === undefined ? [] : computeChildPath(parent),
      file: versionId,
      version: 1,
      versions: 0,
      modifiedBy: client.getPrimarySocialId(),
      createdBy: client.getPrimarySocialId()
    }
  })
