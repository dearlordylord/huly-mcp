import {
  addDriveFileCommentParamsJsonSchema,
  AddDriveFileCommentResultSchema,
  createDriveFolderParamsJsonSchema,
  CreateDriveFolderResultSchema,
  createDriveParamsJsonSchema,
  CreateDriveResultSchema,
  deleteDriveFileCommentParamsJsonSchema,
  DeleteDriveFileCommentResultSchema,
  deleteDriveItemParamsJsonSchema,
  DeleteDriveItemResultSchema,
  deleteDriveParamsJsonSchema,
  DeleteDriveResultSchema,
  DriveItemSummarySchema,
  driveMemberMutationParamsJsonSchema,
  DriveMemberMutationResultSchema,
  DriveSummarySchema,
  getDriveItemParamsJsonSchema,
  getDriveParamsJsonSchema,
  listDriveFileActivityParamsJsonSchema,
  ListDriveFileActivityResultSchema,
  listDriveFileCommentsParamsJsonSchema,
  ListDriveFileCommentsResultSchema,
  listDriveFileVersionsParamsJsonSchema,
  ListDriveFileVersionsResultSchema,
  listDriveItemsParamsJsonSchema,
  ListDriveItemsResultSchema,
  listDrivesParamsJsonSchema,
  ListDrivesResultSchema,
  moveDriveItemParamsJsonSchema,
  MoveDriveItemResultSchema,
  parseAddDriveFileCommentParams,
  parseCreateDriveFolderParams,
  parseCreateDriveParams,
  parseDeleteDriveFileCommentParams,
  parseDeleteDriveItemParams,
  parseDeleteDriveParams,
  parseDriveMemberMutationParams,
  parseGetDriveItemParams,
  parseGetDriveParams,
  parseListDriveFileActivityParams,
  parseListDriveFileCommentsParams,
  parseListDriveFileVersionsParams,
  parseListDriveItemsParams,
  parseListDrivesParams,
  parseMoveDriveItemParams,
  parseRenameDriveItemParams,
  parseRestoreDriveFileVersionParams,
  parseSetDriveOwnersParams,
  parseUpdateDriveFileCommentParams,
  parseUpdateDriveParams,
  parseUploadDriveFileParams,
  parseUploadDriveFileVersionParams,
  renameDriveItemParamsJsonSchema,
  RenameDriveItemResultSchema,
  restoreDriveFileVersionParamsJsonSchema,
  RestoreDriveFileVersionResultSchema,
  setDriveOwnersParamsJsonSchema,
  SetDriveOwnersResultSchema,
  updateDriveFileCommentParamsJsonSchema,
  UpdateDriveFileCommentResultSchema,
  updateDriveParamsJsonSchema,
  UpdateDriveResultSchema,
  uploadDriveFileParamsJsonSchema,
  UploadDriveFileResultSchema,
  uploadDriveFileVersionParamsJsonSchema,
  UploadDriveFileVersionResultSchema
} from "../../domain/schemas.js"
import { DEFAULT_INCLUDE_ARCHIVED } from "../../domain/schemas/shared.js"
import {
  addDriveFileComment,
  addDriveMembers,
  createDrive,
  createDriveFolder,
  deleteDrive,
  deleteDriveFileComment,
  deleteDriveItem,
  getDrive,
  getDriveItem,
  listDriveFileActivity,
  listDriveFileComments,
  listDriveFileVersions,
  listDriveItems,
  listDrives,
  moveDriveItem,
  removeDriveMembers,
  renameDriveItem,
  restoreDriveFileVersion,
  setDriveOwners,
  updateDrive,
  updateDriveFileComment,
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
    name: "create_drive",
    description:
      "Idempotently create a Huly Drive space. If an active Drive with the same exact name already exists, returns it with created=false. Initial members and owners accept account UUIDs, exact emails, or exact person names; omitted lists default to the caller.",
    category: CATEGORY,
    inputSchema: createDriveParamsJsonSchema,
    annotations: { idempotentHint: true, destructiveHint: false },
    handler: createEncodedCombinedToolHandler(
      "create_drive",
      parseCreateDriveParams,
      createDrive,
      CreateDriveResultSchema
    )
  },
  {
    name: "update_drive",
    description:
      "Update safe metadata on an existing Drive: name, description, private, archived, or autoJoin. Provide at least one update field. This changes the Drive space, not files or folders inside it.",
    category: CATEGORY,
    inputSchema: updateDriveParamsJsonSchema,
    annotations: { idempotentHint: true, destructiveHint: false },
    handler: createEncodedCombinedToolHandler(
      "update_drive",
      parseUpdateDriveParams,
      updateDrive,
      UpdateDriveResultSchema
    )
  },
  {
    name: "delete_drive",
    description:
      "Permanently delete an empty Huly Drive space. The Drive must contain no files or folders; non-empty Drives fail with child count and item summaries. This is permanent deletion, not archive or trash.",
    category: CATEGORY,
    inputSchema: deleteDriveParamsJsonSchema,
    annotations: { idempotentHint: false, destructiveHint: true },
    handler: createEncodedCombinedToolHandler(
      "delete_drive",
      parseDeleteDriveParams,
      deleteDrive,
      DeleteDriveResultSchema
    )
  },
  {
    name: "add_drive_members",
    description:
      "Idempotently add members to an existing Drive. Members accept account UUIDs, exact emails, or exact person names and resolve to Huly account UUIDs before replacing the Drive member list.",
    category: CATEGORY,
    inputSchema: driveMemberMutationParamsJsonSchema,
    annotations: { idempotentHint: true, destructiveHint: false },
    handler: createEncodedCombinedToolHandler(
      "add_drive_members",
      parseDriveMemberMutationParams,
      addDriveMembers,
      DriveMemberMutationResultSchema
    )
  },
  {
    name: "remove_drive_members",
    description:
      "Idempotently remove members from an existing Drive. Members accept account UUIDs, exact emails, or exact person names and resolve to Huly account UUIDs before replacing the Drive member list.",
    category: CATEGORY,
    inputSchema: driveMemberMutationParamsJsonSchema,
    annotations: { idempotentHint: true, destructiveHint: false },
    handler: createEncodedCombinedToolHandler(
      "remove_drive_members",
      parseDriveMemberMutationParams,
      removeDriveMembers,
      DriveMemberMutationResultSchema
    )
  },
  {
    name: "set_drive_owners",
    description:
      "Replace owners on an existing Drive. Owners accept account UUIDs, exact emails, or exact person names. By default, each owner is also ensured as a Drive member. Pass owners=[] to clear owners.",
    category: CATEGORY,
    inputSchema: setDriveOwnersParamsJsonSchema,
    annotations: { idempotentHint: true, destructiveHint: false },
    handler: createEncodedCombinedToolHandler(
      "set_drive_owners",
      parseSetDriveOwnersParams,
      setDriveOwners,
      SetDriveOwnersResultSchema
    )
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
    name: "list_drive_file_comments",
    description:
      "List comments on a Drive file resolved by filePath or fileId. Provide only one locator. Returns comments sorted by creation date, oldest first.",
    category: CATEGORY,
    inputSchema: listDriveFileCommentsParamsJsonSchema,
    handler: createEncodedCombinedToolHandler(
      "list_drive_file_comments",
      parseListDriveFileCommentsParams,
      listDriveFileComments,
      ListDriveFileCommentsResultSchema
    )
  },
  {
    name: "add_drive_file_comment",
    description:
      "Add a Markdown comment to a Drive file resolved by filePath or fileId. Provide only one locator. The comment is attached directly to the file.",
    category: CATEGORY,
    inputSchema: addDriveFileCommentParamsJsonSchema,
    annotations: { idempotentHint: false, destructiveHint: false },
    handler: createEncodedCombinedToolHandler(
      "add_drive_file_comment",
      parseAddDriveFileCommentParams,
      addDriveFileComment,
      AddDriveFileCommentResultSchema
    )
  },
  {
    name: "update_drive_file_comment",
    description:
      "Update a comment on a Drive file resolved by filePath or fileId. Provide only one locator. Idempotent when the comment body is unchanged.",
    category: CATEGORY,
    inputSchema: updateDriveFileCommentParamsJsonSchema,
    annotations: { idempotentHint: true, destructiveHint: false },
    handler: createEncodedCombinedToolHandler(
      "update_drive_file_comment",
      parseUpdateDriveFileCommentParams,
      updateDriveFileComment,
      UpdateDriveFileCommentResultSchema
    )
  },
  {
    name: "delete_drive_file_comment",
    description:
      "Permanently delete a comment from a Drive file resolved by filePath or fileId. Provide only one locator. This deletes the comment, not the file.",
    category: CATEGORY,
    inputSchema: deleteDriveFileCommentParamsJsonSchema,
    annotations: { idempotentHint: false, destructiveHint: true },
    handler: createEncodedCombinedToolHandler(
      "delete_drive_file_comment",
      parseDeleteDriveFileCommentParams,
      deleteDriveFileComment,
      DeleteDriveFileCommentResultSchema
    )
  },
  {
    name: "list_drive_file_activity",
    description:
      "List activity messages for a Drive file resolved by filePath or fileId. Provide only one locator. Returns activity sorted by date, newest first.",
    category: CATEGORY,
    inputSchema: listDriveFileActivityParamsJsonSchema,
    handler: createEncodedCombinedToolHandler(
      "list_drive_file_activity",
      parseListDriveFileActivityParams,
      listDriveFileActivity,
      ListDriveFileActivityResultSchema
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
