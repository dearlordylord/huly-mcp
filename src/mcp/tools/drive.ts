import {
  createDriveFolderParamsJsonSchema,
  CreateDriveFolderResultSchema,
  deleteDriveItemParamsJsonSchema,
  DeleteDriveItemResultSchema,
  DriveItemSummarySchema,
  DriveSummarySchema,
  getDriveItemParamsJsonSchema,
  getDriveParamsJsonSchema,
  listDriveFileVersionsParamsJsonSchema,
  ListDriveFileVersionsResultSchema,
  listDriveItemsParamsJsonSchema,
  ListDriveItemsResultSchema,
  listDrivesParamsJsonSchema,
  ListDrivesResultSchema,
  moveDriveItemParamsJsonSchema,
  MoveDriveItemResultSchema,
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
  parseUploadDriveFileVersionParams,
  renameDriveItemParamsJsonSchema,
  RenameDriveItemResultSchema,
  restoreDriveFileVersionParamsJsonSchema,
  RestoreDriveFileVersionResultSchema,
  uploadDriveFileParamsJsonSchema,
  UploadDriveFileResultSchema,
  uploadDriveFileVersionParamsJsonSchema,
  UploadDriveFileVersionResultSchema
} from "../../domain/schemas.js"
import { DEFAULT_INCLUDE_ARCHIVED } from "../../domain/schemas/shared.js"
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
} from "../../huly/operations/drive.js"
import { createEncodedCombinedToolHandler, type RegisteredTool } from "./registry.js"

const CATEGORY = "drive" as const

export const driveTools: ReadonlyArray<RegisteredTool> = [
  {
    name: "list_drives",
    description:
      `List Huly Drive spaces. When includeArchived is omitted, includeArchived=${DEFAULT_INCLUDE_ARCHIVED}. Use this before path operations when you do not know the exact drive id or exact drive name.`,
    category: CATEGORY,
    inputSchema: listDrivesParamsJsonSchema,
    handler: createEncodedCombinedToolHandler("list_drives", parseListDrivesParams, listDrives, ListDrivesResultSchema)
  },
  {
    name: "get_drive",
    description:
      "Get one Huly Drive by exact drive id or exact drive name. If an exact name is ambiguous, the error includes candidate ids so the next call can use the id.",
    category: CATEGORY,
    inputSchema: getDriveParamsJsonSchema,
    handler: createEncodedCombinedToolHandler("get_drive", parseGetDriveParams, getDrive, DriveSummarySchema)
  },
  {
    name: "list_drive_items",
    description:
      "List children under a folder path in a Drive. Paths are POSIX-like and normalized to absolute; '/' lists the root. Duplicate same-parent titles fail with candidate ids instead of guessing.",
    category: CATEGORY,
    inputSchema: listDriveItemsParamsJsonSchema,
    handler: createEncodedCombinedToolHandler(
      "list_drive_items",
      parseListDriveItemsParams,
      listDriveItems,
      ListDriveItemsResultSchema
    )
  },
  {
    name: "get_drive_item",
    description:
      "Get one Drive folder or file by either exact itemId or path. Provide only one locator. File results include current version, size, MIME type, and download URL when available.",
    category: CATEGORY,
    inputSchema: getDriveItemParamsJsonSchema,
    handler: createEncodedCombinedToolHandler(
      "get_drive_item",
      parseGetDriveItemParams,
      getDriveItem,
      DriveItemSummarySchema
    )
  },
  {
    name: "create_drive_folder",
    description:
      "Idempotently create a Drive folder path, creating missing parents like mkdir -p. Returns created=false when the full folder path already exists.",
    category: CATEGORY,
    inputSchema: createDriveFolderParamsJsonSchema,
    annotations: { idempotentHint: true, destructiveHint: false },
    handler: createEncodedCombinedToolHandler(
      "create_drive_folder",
      parseCreateDriveFolderParams,
      createDriveFolder,
      CreateDriveFolderResultSchema
    )
  },
  {
    name: "upload_drive_file",
    description:
      "Upload a file into Drive at a full path including filename. Provide exactly one source: filePath, fileUrl, or base64 data. By default createParents=true creates missing parent folders and reports them.",
    category: CATEGORY,
    inputSchema: uploadDriveFileParamsJsonSchema,
    annotations: { idempotentHint: false, destructiveHint: false },
    handler: createEncodedCombinedToolHandler(
      "upload_drive_file",
      parseUploadDriveFileParams,
      uploadDriveFile,
      UploadDriveFileResultSchema
    )
  },
  {
    name: "upload_drive_file_version",
    description:
      "Upload a new version for an existing Drive file resolved by file id or file path. Provide exactly one source: filePath, fileUrl, or base64 data. This increments the file version counter and makes the uploaded version current.",
    category: CATEGORY,
    inputSchema: uploadDriveFileVersionParamsJsonSchema,
    annotations: { idempotentHint: false, destructiveHint: false },
    handler: createEncodedCombinedToolHandler(
      "upload_drive_file_version",
      parseUploadDriveFileVersionParams,
      uploadDriveFileVersion,
      UploadDriveFileVersionResultSchema
    )
  },
  {
    name: "move_drive_item",
    description:
      "Move a Drive item, meaning a file or folder, to another existing folder path in the same Drive without renaming it. Idempotent when the item is already in that folder. Rejects sibling title collisions and rejects moving a folder into itself or a descendant.",
    category: CATEGORY,
    inputSchema: moveDriveItemParamsJsonSchema,
    annotations: { idempotentHint: true, destructiveHint: false },
    handler: createEncodedCombinedToolHandler(
      "move_drive_item",
      parseMoveDriveItemParams,
      moveDriveItem,
      MoveDriveItemResultSchema
    )
  },
  {
    name: "rename_drive_item",
    description:
      "Rename a Drive item, meaning a file or folder, in its current folder. Idempotent when the title is unchanged. Rejects sibling title collisions; use move_drive_item to change folders.",
    category: CATEGORY,
    inputSchema: renameDriveItemParamsJsonSchema,
    annotations: { idempotentHint: true, destructiveHint: false },
    handler: createEncodedCombinedToolHandler(
      "rename_drive_item",
      parseRenameDriveItemParams,
      renameDriveItem,
      RenameDriveItemResultSchema
    )
  },
  {
    name: "delete_drive_item",
    description:
      "Permanently delete a Drive item, meaning a file or folder. Files are deleted with their version records. Folders must be empty; non-empty folders fail with child count and child summaries. This is permanent deletion, not archive or trash.",
    category: CATEGORY,
    inputSchema: deleteDriveItemParamsJsonSchema,
    annotations: { idempotentHint: false, destructiveHint: true },
    handler: createEncodedCombinedToolHandler(
      "delete_drive_item",
      parseDeleteDriveItemParams,
      deleteDriveItem,
      DeleteDriveItemResultSchema
    )
  },
  {
    name: "list_drive_file_versions",
    description:
      "List versions for a Drive file resolved by file id or file path. Marks the current version and includes blob id, size, MIME type, lastModified, and download URL.",
    category: CATEGORY,
    inputSchema: listDriveFileVersionsParamsJsonSchema,
    handler: createEncodedCombinedToolHandler(
      "list_drive_file_versions",
      parseListDriveFileVersionsParams,
      listDriveFileVersions,
      ListDriveFileVersionsResultSchema
    )
  },
  {
    name: "restore_drive_file_version",
    description:
      "Restore an existing Drive file version by version id or numeric version. Idempotent when the requested version is already current and does not increment the file version counter.",
    category: CATEGORY,
    inputSchema: restoreDriveFileVersionParamsJsonSchema,
    annotations: { idempotentHint: true, destructiveHint: false },
    handler: createEncodedCombinedToolHandler(
      "restore_drive_file_version",
      parseRestoreDriveFileVersionParams,
      restoreDriveFileVersion,
      RestoreDriveFileVersionResultSchema
    )
  }
]
