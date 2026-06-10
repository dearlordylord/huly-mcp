import { describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { expect } from "vitest"

import {
  DeleteDriveItemResultSchema,
  DriveFileVersionSummarySchema,
  DriveItemSummarySchema,
  DriveItemTitle,
  MoveDriveItemResultSchema,
  parseDeleteDriveItemParams,
  parseGetDriveItemParams,
  parseMoveDriveItemParams,
  parseRenameDriveItemParams,
  parseUploadDriveFileParams,
  parseUploadDriveFileVersionParams,
  RenameDriveItemResultSchema,
  uploadDriveFileParamsJsonSchema,
  UploadDriveFileVersionResultSchema
} from "../../src/domain/schemas.js"
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

  it("exposes source alternatives in upload JSON schema", () => {
    expect(JSON.stringify(uploadDriveFileParamsJsonSchema)).toContain("filePath")
    expect(JSON.stringify(uploadDriveFileParamsJsonSchema)).toContain("fileUrl")
    expect(JSON.stringify(uploadDriveFileParamsJsonSchema)).toContain("data")
  })
})
