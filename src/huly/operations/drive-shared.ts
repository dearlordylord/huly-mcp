import { NonEmptyString } from "../../domain/schemas/shared.js"
import type { HulyClientError } from "../client.js"
import type { DriveSpace, File, Folder } from "../drive-sdk.js"
import type {
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
} from "../errors-drive.js"
import type { HulyDomainError } from "../errors.js"
import type { StorageClientError } from "../storage.js"
import { hulyNonEmptyTextOrFallback } from "./non-empty-text.js"

export type DriveOperationError =
  | HulyDomainError
  | HulyClientError
  | StorageClientError
  | DriveNotFoundError
  | DriveIdentifierAmbiguousError
  | DrivePathNotFoundError
  | DrivePathAmbiguousError
  | DriveParentNotFolderError
  | DriveFileNotFoundError
  | DriveFileVersionNotFoundError
  | DrivePathConflictError
  | DriveInvalidMoveError
  | DriveInvalidItemOperationError
  | DriveFolderNotEmptyError

export type DriveItem = Folder | File

export interface ResolvedPath {
  readonly item: DriveItem | undefined
  readonly path: string
}

export interface CreatedFolder {
  readonly folder: Folder
  readonly path: string
}

export const DRIVE_ROOT_PATH = "/"
export const VERSIONS_COLLECTION = "versions"

export const itemKind = (item: DriveItem): "folder" | "file" => isFile(item) ? "file" : "folder"

export const isFolder = (item: DriveItem): item is Folder => !("version" in item)

export const isFile = (item: DriveItem): item is File => "version" in item

const UNTITLED_DRIVE_TEXT = NonEmptyString.make("(untitled)")

export const driveTextOrUntitled = (value: string): NonEmptyString =>
  hulyNonEmptyTextOrFallback(NonEmptyString, value, UNTITLED_DRIVE_TEXT)

export const filterDrivesByQuery = (
  drives: ReadonlyArray<DriveSpace>,
  query?: string
): ReadonlyArray<DriveSpace> => {
  if (query === undefined) return drives
  const lower = query.toLowerCase()
  return drives.filter((item) => item.name.toLowerCase().includes(lower))
}
