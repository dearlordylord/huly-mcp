import { describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { expect } from "vitest"

import {
  AddDriveFileCommentResultSchema,
  CommentSchema,
  CreateDriveResultSchema,
  DeleteDriveFileCommentResultSchema,
  DeleteDriveItemResultSchema,
  DeleteDriveResultSchema,
  DriveFileVersionSummarySchema,
  DriveItemSummarySchema,
  DriveItemTitle,
  DriveMemberMutationResultSchema,
  DriveSummarySchema,
  ListDriveFileActivityResultSchema,
  ListDriveFileCommentsResultSchema,
  MoveDriveItemResultSchema,
  parseAddDriveFileCommentParams,
  parseDeleteDriveFileCommentParams,
  parseDeleteDriveItemParams,
  parseDriveMemberMutationParams,
  parseGetDriveItemParams,
  parseListDriveFileActivityParams,
  parseListDriveFileCommentsParams,
  parseMoveDriveItemParams,
  parseRenameDriveItemParams,
  parseSetDriveOwnersParams,
  parseUpdateDriveFileCommentParams,
  parseUpdateDriveParams,
  parseUploadDriveFileParams,
  parseUploadDriveFileVersionParams,
  RenameDriveItemResultSchema,
  SetDriveOwnersResultSchema,
  UpdateDriveFileCommentResultSchema,
  UpdateDriveResultSchema,
  uploadDriveFileParamsJsonSchema,
  UploadDriveFileVersionResultSchema
} from "../../src/domain/schemas.js"
import { AccountUuid } from "../../src/domain/schemas/shared.js"
import { normalizeDrivePath } from "../../src/huly/operations/drive-path.js"

describe("drive schemas", () => {
  it.effect("normalizes POSIX-like paths without filesystem access", () =>
    Effect.gen(function*() {
      expect(normalizeDrivePath("Specs/./API.md")).toEqual({ path: "/Specs/API.md", segments: ["Specs", "API.md"] })
      expect(normalizeDrivePath("/Specs/../Readme.md")).toEqual({ path: "/Readme.md", segments: ["Readme.md"] })
      expect(normalizeDrivePath("/")).toEqual({ path: "/", segments: [] })
    }))

  it.effect("requires exactly one upload source", () =>
    Effect.gen(function*() {
      const accepted = yield* parseUploadDriveFileParams({
        drive: "Docs",
        path: "/Specs/API.md",
        contentType: "text/markdown",
        filePath: "/tmp/API.md"
      })
      const missing = yield* Effect.either(parseUploadDriveFileParams({
        drive: "Docs",
        path: "/Specs/API.md",
        contentType: "text/markdown"
      }))
      const conflicting = yield* Effect.either(parseUploadDriveFileParams({
        drive: "Docs",
        path: "/Specs/API.md",
        contentType: "text/markdown",
        filePath: "/tmp/API.md",
        data: "SGVsbG8="
      }))

      expect(accepted.createParents).toBeUndefined()
      expect(missing._tag).toBe("Left")
      expect(conflicting._tag).toBe("Left")
    }))

  it.effect("rejects path separators in Drive item titles", () =>
    Effect.gen(function*() {
      const accepted = yield* Schema.decodeUnknown(DriveItemTitle)("API.md")
      const rejected = yield* Effect.either(Schema.decodeUnknown(DriveItemTitle)("Specs/API.md"))

      expect(accepted).toBe("API.md")
      expect(rejected._tag).toBe("Left")
    }))

  it.effect("rejects ambiguous get item locators", () =>
    Effect.gen(function*() {
      const missing = yield* Effect.either(parseGetDriveItemParams({ drive: "Docs" }))
      const ambiguous = yield* Effect.either(parseGetDriveItemParams({
        drive: "Docs",
        path: "/Specs",
        itemId: "folder-1"
      }))

      expect(missing._tag).toBe("Left")
      expect(ambiguous._tag).toBe("Left")
    }))

  it.effect("requires valid item locators and upload sources for core file operations", () =>
    Effect.gen(function*() {
      const moveAccepted = yield* parseMoveDriveItemParams({
        drive: "Docs",
        path: "/Specs/API.md",
        targetFolderPath: "/Archive"
      })
      const moveMissingTarget = yield* Effect.either(parseMoveDriveItemParams({
        drive: "Docs",
        path: "/Specs/API.md"
      }))
      const moveMissingLocator = yield* Effect.either(parseMoveDriveItemParams({
        drive: "Docs",
        targetFolderPath: "/Archive"
      }))
      const moveAmbiguousLocator = yield* Effect.either(parseMoveDriveItemParams({
        drive: "Docs",
        path: "/Specs/API.md",
        itemId: "file-api",
        targetFolderPath: "/Archive"
      }))
      const versionMissingSource = yield* Effect.either(parseUploadDriveFileVersionParams({
        drive: "Docs",
        file: "/Specs/API.md",
        contentType: "text/markdown"
      }))
      const versionConflictingSource = yield* Effect.either(parseUploadDriveFileVersionParams({
        drive: "Docs",
        file: "/Specs/API.md",
        contentType: "text/markdown",
        filePath: "/tmp/API.md",
        data: "SGVsbG8="
      }))

      expect(moveAccepted.targetFolderPath).toBe("/Archive")
      expect(moveMissingTarget._tag).toBe("Left")
      expect(moveMissingLocator._tag).toBe("Left")
      expect(moveAmbiguousLocator._tag).toBe("Left")
      expect(versionMissingSource._tag).toBe("Left")
      expect(versionConflictingSource._tag).toBe("Left")
    }))

  it.effect("requires exactly one Drive file locator for comments and activity", () =>
    Effect.gen(function*() {
      const listAccepted = yield* parseListDriveFileCommentsParams({
        drive: "Docs",
        filePath: "/Specs/API.md"
      })
      const addAccepted = yield* parseAddDriveFileCommentParams({
        drive: "Docs",
        fileId: "file-api",
        body: "Looks good"
      })
      const updateAccepted = yield* parseUpdateDriveFileCommentParams({
        drive: "Docs",
        filePath: "/Specs/API.md",
        commentId: "comment-1",
        body: "Updated"
      })
      const deleteAccepted = yield* parseDeleteDriveFileCommentParams({
        drive: "Docs",
        fileId: "file-api",
        commentId: "comment-1"
      })
      const activityAccepted = yield* parseListDriveFileActivityParams({
        drive: "Docs",
        filePath: "/Specs/API.md"
      })
      const missing = yield* Effect.either(parseListDriveFileCommentsParams({ drive: "Docs" }))
      const ambiguous = yield* Effect.either(parseListDriveFileActivityParams({
        drive: "Docs",
        filePath: "/Specs/API.md",
        fileId: "file-api"
      }))

      expect(listAccepted.filePath).toBe("/Specs/API.md")
      expect(addAccepted.fileId).toBe("file-api")
      expect(updateAccepted.commentId).toBe("comment-1")
      expect(deleteAccepted.commentId).toBe("comment-1")
      expect(activityAccepted.filePath).toBe("/Specs/API.md")
      expect(missing._tag).toBe("Left")
      expect(ambiguous._tag).toBe("Left")
    }))

  it.effect("validates Drive administration params", () =>
    Effect.gen(function*() {
      const updateMissingField = yield* Effect.either(parseUpdateDriveParams({ drive: "Docs" }))
      const updateAccepted = yield* parseUpdateDriveParams({ drive: "Docs", autoJoin: true })
      const memberMissing = yield* Effect.either(parseDriveMemberMutationParams({ drive: "Docs", members: [] }))
      const memberAccepted = yield* parseDriveMemberMutationParams({
        drive: "Docs",
        members: ["00000000-0000-4000-8000-000000000001"]
      })
      const ownersAccepted = yield* parseSetDriveOwnersParams({
        drive: "Docs",
        owners: ["00000000-0000-4000-8000-000000000002"],
        ensureMembers: false
      })

      expect(updateMissingField._tag).toBe("Left")
      expect(updateAccepted.autoJoin).toBe(true)
      expect(memberMissing._tag).toBe("Left")
      expect(memberAccepted.members).toEqual(["00000000-0000-4000-8000-000000000001"])
      expect(ownersAccepted.ensureMembers).toBe(false)
    }))

  it.effect("rejects root paths for item mutations", () =>
    Effect.gen(function*() {
      const moveRoot = yield* Effect.either(parseMoveDriveItemParams({
        drive: "Docs",
        path: "/",
        targetFolderPath: "/Archive"
      }))
      const renameRoot = yield* Effect.either(parseRenameDriveItemParams({
        drive: "Docs",
        path: "/",
        title: "Root"
      }))
      const deleteRoot = yield* Effect.either(parseDeleteDriveItemParams({
        drive: "Docs",
        path: "/"
      }))
      const deleteRootId = yield* Effect.either(parseDeleteDriveItemParams({
        drive: "Docs",
        itemId: "drive:ids:Root"
      }))
      const renameMissingLocator = yield* Effect.either(parseRenameDriveItemParams({
        drive: "Docs",
        title: "Root"
      }))
      const renameAmbiguousLocator = yield* Effect.either(parseRenameDriveItemParams({
        drive: "Docs",
        path: "/Specs",
        itemId: "folder-specs",
        title: "Specs"
      }))
      const deleteMissingLocator = yield* Effect.either(parseDeleteDriveItemParams({ drive: "Docs" }))
      const deleteAmbiguousLocator = yield* Effect.either(parseDeleteDriveItemParams({
        drive: "Docs",
        path: "/Specs",
        itemId: "folder-specs"
      }))

      expect(moveRoot._tag).toBe("Left")
      expect(renameRoot._tag).toBe("Left")
      expect(deleteRoot._tag).toBe("Left")
      expect(deleteRootId._tag).toBe("Left")
      expect(renameMissingLocator._tag).toBe("Left")
      expect(renameAmbiguousLocator._tag).toBe("Left")
      expect(deleteMissingLocator._tag).toBe("Left")
      expect(deleteAmbiguousLocator._tag).toBe("Left")
    }))

  it.effect("encodes branded outputs for core file operations", () =>
    Effect.gen(function*() {
      const file = {
        id: "file-api",
        driveId: "drive-1",
        kind: "file",
        title: "API.md",
        path: "/Specs/API.md",
        url: "https://huly.test/workbench/ws/drive/file/file-api",
        currentVersionId: "version-2",
        version: 2,
        size: 5,
        contentType: "text/markdown",
        downloadUrl: "https://files.test/blob-2"
      }
      const version = {
        id: "version-2",
        fileId: "file-api",
        version: 2,
        title: "API.md",
        blobId: "blob-2",
        size: 5,
        contentType: "text/markdown",
        lastModified: 123,
        current: true,
        downloadUrl: "https://files.test/blob-2"
      }

      const decodedFile = yield* Schema.decodeUnknown(DriveItemSummarySchema)(file)
      const decodedVersion = yield* Schema.decodeUnknown(DriveFileVersionSummarySchema)(version)
      const uploaded = yield* Schema.encode(UploadDriveFileVersionResultSchema)({
        file: decodedFile,
        currentVersion: decodedVersion
      })
      const moved = yield* Schema.encode(MoveDriveItemResultSchema)({
        item: decodedFile,
        moved: true,
        fromPath: decodedFile.path,
        toPath: decodedFile.path
      })
      const renamed = yield* Schema.encode(RenameDriveItemResultSchema)({
        item: decodedFile,
        renamed: true,
        fromPath: decodedFile.path,
        toPath: decodedFile.path
      })
      const deleted = yield* Schema.encode(DeleteDriveItemResultSchema)({
        deletedItem: decodedFile,
        deletedVersions: decodedFile.version ?? decodedVersion.version,
        deleted: true
      })

      expect(uploaded.currentVersion.blobId).toBe("blob-2")
      expect(moved.toPath).toBe("/Specs/API.md")
      expect(renamed.renamed).toBe(true)
      expect(deleted.deletedVersions).toBe(2)
    }))

  it.effect("encodes branded outputs for Drive file comments and activity", () =>
    Effect.gen(function*() {
      const file = yield* Schema.decodeUnknown(DriveItemSummarySchema)({
        id: "file-api",
        driveId: "drive-1",
        kind: "file",
        title: "API.md",
        path: "/Specs/API.md",
        url: "https://huly.test/workbench/ws/drive/file/file-api",
        currentVersionId: "version-2",
        version: 2,
        size: 5,
        contentType: "text/markdown",
        downloadUrl: "https://files.test/blob-2"
      })
      const comment = yield* Schema.decodeUnknown(CommentSchema)({
        id: "comment-1",
        body: "Looks good",
        authorId: "person-1",
        createdOn: 1,
        modifiedOn: 1
      })
      const decodedListComments = yield* Schema.decodeUnknown(ListDriveFileCommentsResultSchema)({
        file,
        comments: [comment],
        total: 1
      })
      const decodedAdded = yield* Schema.decodeUnknown(AddDriveFileCommentResultSchema)({
        file,
        commentId: "comment-1"
      })
      const decodedUpdated = yield* Schema.decodeUnknown(UpdateDriveFileCommentResultSchema)({
        file,
        commentId: "comment-1",
        updated: true
      })
      const decodedDeleted = yield* Schema.decodeUnknown(DeleteDriveFileCommentResultSchema)({
        file,
        commentId: "comment-1",
        deleted: true
      })
      const decodedActivity = yield* Schema.decodeUnknown(ListDriveFileActivityResultSchema)({
        file,
        activity: [{
          id: "activity-1",
          objectId: "file-api",
          objectClass: "drive:class:File",
          modifiedBy: "person-1",
          modifiedOn: 2
        }],
        total: 1
      })
      const listComments = yield* Schema.encode(ListDriveFileCommentsResultSchema)(decodedListComments)
      const added = yield* Schema.encode(AddDriveFileCommentResultSchema)(decodedAdded)
      const updated = yield* Schema.encode(UpdateDriveFileCommentResultSchema)(decodedUpdated)
      const deleted = yield* Schema.encode(DeleteDriveFileCommentResultSchema)(decodedDeleted)
      const activity = yield* Schema.encode(ListDriveFileActivityResultSchema)(decodedActivity)

      expect(listComments.comments[0].id).toBe("comment-1")
      expect(added.commentId).toBe("comment-1")
      expect(updated.updated).toBe(true)
      expect(deleted.deleted).toBe(true)
      expect(activity.activity[0].objectId).toBe("file-api")
    }))

  it.effect("encodes branded outputs for Drive administration operations", () =>
    Effect.gen(function*() {
      const drive = yield* Schema.decodeUnknown(DriveSummarySchema)({
        id: "drive-1",
        name: "Docs",
        description: "Drive docs",
        archived: false,
        private: true,
        autoJoin: true,
        membersCount: 2,
        ownersCount: 1,
        url: "https://huly.test/workbench/ws/drive/drive-1"
      })
      const created = yield* Schema.encode(CreateDriveResultSchema)({ drive, created: true })
      const updated = yield* Schema.encode(UpdateDriveResultSchema)({ drive, updated: true })
      const deleted = yield* Schema.encode(DeleteDriveResultSchema)({ drive, deleted: true })
      const members = yield* Schema.encode(DriveMemberMutationResultSchema)({
        drive,
        members: [AccountUuid.make("00000000-0000-4000-8000-000000000001")],
        changed: true
      })
      const owners = yield* Schema.encode(SetDriveOwnersResultSchema)({
        drive,
        owners: [AccountUuid.make("00000000-0000-4000-8000-000000000002")],
        members: [
          AccountUuid.make("00000000-0000-4000-8000-000000000001"),
          AccountUuid.make("00000000-0000-4000-8000-000000000002")
        ],
        changed: true
      })

      expect(created.drive.id).toBe("drive-1")
      expect(updated.drive.autoJoin).toBe(true)
      expect(deleted.deleted).toBe(true)
      expect(members.members).toEqual(["00000000-0000-4000-8000-000000000001"])
      expect(owners.owners).toEqual(["00000000-0000-4000-8000-000000000002"])
    }))

  it("exposes source alternatives in upload JSON schema", () => {
    expect(JSON.stringify(uploadDriveFileParamsJsonSchema)).toContain("filePath")
    expect(JSON.stringify(uploadDriveFileParamsJsonSchema)).toContain("fileUrl")
    expect(JSON.stringify(uploadDriveFileParamsJsonSchema)).toContain("data")
  })
})
