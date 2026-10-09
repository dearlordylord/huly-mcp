import type { AttachedData, Data, Ref } from "@hcengineering/core"
import { Effect } from "effect"

import type { DriveFileVersionSummary, DriveItemSummary, DriveSummary } from "../../domain/schemas/drive.js"
import { DriveFileVersionId, DriveId, DriveItemId, DrivePath } from "../../domain/schemas/drive.js"
import { BlobId, Count, MimeType, Timestamp, UrlString } from "../../domain/schemas/shared.js"
import type { HulyClientError, HulyClientOperations } from "../client.js"
import { Diagnostics } from "../diagnostics.js"
import { drive, type DriveSpace, type File, type FileVersion } from "../drive-sdk.js"
import { HulyStorageClient } from "../storage.js"
import { buildDriveItemUrlFromConfig, buildDriveUrlFromConfig } from "../url-builders.js"
import { type DriveItem, driveTextOrUntitled, isFile, itemKind } from "./drive-shared.js"
import { hulyQuery } from "./query-helpers.js"

const FALLBACK_MIME_TYPE = MimeType.make("application/octet-stream")

const resolveVersionMimeType = Effect.fnUntraced(function* (
  versionId: DriveFileVersionId,
  type: FileVersion["type"]
): Effect.fn.Return<MimeType, never, Diagnostics> {
  if (type !== "") return MimeType.make(type)
  const diagnostics = yield* Diagnostics
  yield* diagnostics.trail(
    `Drive file version ${versionId} has no MIME type; contentType defaults to ${FALLBACK_MIME_TYPE}.`
  )
  return FALLBACK_MIME_TYPE
})

export const toDriveSummary = (client: HulyClientOperations, item: DriveSpace): DriveSummary => {
  const summary = {
    id: DriveId.make(item._id),
    name: driveTextOrUntitled(item.name),
    archived: item.archived,
    private: item.private,
    autoJoin: item.autoJoin,
    membersCount: Count.make(item.members.length),
    ownersCount: Count.make((item.owners ?? []).length),
    url: buildDriveUrlFromConfig(client.workbenchUrlConfig, DriveId.make(item._id))
  }

  return { ...summary, description: item.description }
}

export const toDriveItemSummary = (
  item: DriveItem,
  driveSpace: DriveSpace,
  path: string,
  client: HulyClientOperations
): Effect.Effect<DriveItemSummary, HulyClientError, HulyStorageClient | Diagnostics> =>
  Effect.gen(function* () {
    const storage = yield* HulyStorageClient
    const currentVersion = isFile(item)
      ? yield* client.findOne<FileVersion>(drive.class.FileVersion, hulyQuery<FileVersion>({ _id: item.file }))
      : undefined

    return {
      id: DriveItemId.make(item._id),
      driveId: DriveId.make(driveSpace._id),
      kind: itemKind(item),
      title: driveTextOrUntitled(item.title),
      path: DrivePath.make(path),
      url: buildDriveItemUrlFromConfig(client.workbenchUrlConfig, itemKind(item), DriveItemId.make(item._id)),
      ...(item.parent === drive.ids.Root ? {} : { parentId: DriveItemId.make(item.parent) }),
      ...(isFile(item)
        ? { currentVersionId: DriveFileVersionId.make(item.file), version: Count.make(item.version) }
        : {}),
      ...(currentVersion === undefined
        ? {}
        : {
            size: Count.make(currentVersion.size),
            contentType: yield* resolveVersionMimeType(
              DriveFileVersionId.make(currentVersion._id),
              currentVersion.type
            ),
            downloadUrl: UrlString.make(storage.getFileUrl(currentVersion.file))
          })
    }
  })

export const toFileVersionSummary = Effect.fnUntraced(function* (
  storage: HulyStorageClient["Service"],
  versionId: Ref<FileVersion>,
  fileId: Ref<File>,
  version: FileVersion | Data<FileVersion> | AttachedData<FileVersion>,
  current: boolean
): Effect.fn.Return<DriveFileVersionSummary, never, Diagnostics> {
  return {
    id: DriveFileVersionId.make(versionId),
    fileId: DriveItemId.make(fileId),
    version: Count.make(version.version),
    title: driveTextOrUntitled(version.title),
    blobId: BlobId.make(version.file),
    size: Count.make(version.size),
    contentType: yield* resolveVersionMimeType(DriveFileVersionId.make(versionId), version.type),
    lastModified: Timestamp.make(version.lastModified),
    current,
    downloadUrl: UrlString.make(storage.getFileUrl(version.file))
  }
})

export const pathForItem = (item: DriveItem): string => {
  const segments = [...item.path].reverse()
  return `/${[...segments, item._id].join("/")}`
}
