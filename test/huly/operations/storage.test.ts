import { describe, it } from "@effect/vitest"
import type { Blob, Ref } from "@hcengineering/core"
import { Effect } from "effect"
import { expect } from "vitest"
import { FileUploadError } from "../../../src/huly/errors.js"
import { getFileUrl, uploadFile } from "../../../src/huly/operations/storage.js"
import { HulyStorageClient, type HulyStorageOperations, type UploadFileResult } from "../../../src/huly/storage.js"
import { mimeType } from "../../helpers/brands.js"

// --- Test Helpers ---

interface MockConfig {
  uploadResult?: UploadFileResult
  uploadError?: Error
  captureUpload?: { filename?: string; contentType?: string; dataSize?: number }
}

const createTestLayerWithMocks = (config: MockConfig) => {
  const uploadFileImpl: HulyStorageOperations["uploadFile"] = (filename, data, contentType) => {
    if (config.captureUpload) {
      config.captureUpload.filename = filename
      config.captureUpload.contentType = contentType
      config.captureUpload.dataSize = data.length
    }

    if (config.uploadError) {
      return Effect.fail(
        new FileUploadError({
          message: config.uploadError.message,
          cause: config.uploadError
        })
      )
    }

    return Effect.succeed(
      config.uploadResult ?? {
        blobId: `blob-${Date.now()}` as Ref<Blob>,
        contentType,
        size: data.length,
        url: `https://test.huly.io/files?workspace=test&file=blob-${Date.now()}`
      }
    )
  }

  const getFileUrlImpl: HulyStorageOperations["getFileUrl"] = (blobId) =>
    `https://test.huly.io/files?workspace=test&file=${blobId}`

  return HulyStorageClient.testLayer({
    uploadFile: uploadFileImpl,
    getFileUrl: getFileUrlImpl
  })
}

// --- Tests ---

describe("uploadFile operation", () => {
  describe("basic functionality", () => {
    // test-revizorro: approved
    it.effect("uploads file with base64 data", () =>
      Effect.gen(function*() {
        const captureUpload: MockConfig["captureUpload"] = {}
        const mockResult: UploadFileResult = {
          blobId: "blob-123" as Ref<Blob>,
          contentType: "image/png",
          size: 11,
          url: "https://test.huly.io/files?workspace=test&file=blob-123"
        }

        const testLayer = createTestLayerWithMocks({
          uploadResult: mockResult,
          captureUpload
        })

        const result = yield* uploadFile({
          filename: "screenshot.png",
          data: Buffer.from("Hello World").toString("base64"),
          contentType: mimeType("image/png")
        }).pipe(Effect.provide(testLayer))

        expect(result.blobId).toBe("blob-123")
        expect(result.contentType).toBe("image/png")
        expect(result.url).toContain("blob-123")
        expect(captureUpload.filename).toBe("screenshot.png")
        expect(captureUpload.contentType).toBe("image/png")
        expect(captureUpload.dataSize).toBe(11) // "Hello World".length
      }))

    // test-revizorro: approved
    it.effect("handles data URL prefix", () =>
      Effect.gen(function*() {
        const captureUpload: MockConfig["captureUpload"] = {}

        const testLayer = createTestLayerWithMocks({
          captureUpload
        })

        const imageData = "fake image data"
        const base64 = Buffer.from(imageData).toString("base64")
        const dataUrl = `data:image/jpeg;base64,${base64}`

        yield* uploadFile({
          filename: "photo.jpg",
          data: dataUrl,
          contentType: mimeType("image/jpeg")
        }).pipe(Effect.provide(testLayer))

        expect(captureUpload.dataSize).toBe(imageData.length)
      }))

    // test-revizorro: approved
    it.effect("preserves binary data through base64 encoding", () =>
      Effect.gen(function*() {
        let capturedBuffer: Buffer | undefined

        const testLayer = HulyStorageClient.testLayer({
          uploadFile: (_filename, data, contentType) => {
            capturedBuffer = data
            return Effect.succeed({
              blobId: "blob-bin" as Ref<Blob>,
              contentType,
              size: data.length,
              url: "https://test.huly.io/files?workspace=test&file=blob-bin"
            })
          }
        })

        const binaryData = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]) // PNG magic bytes
        const base64 = binaryData.toString("base64")

        yield* uploadFile({
          filename: "image.png",
          data: base64,
          contentType: mimeType("image/png")
        }).pipe(Effect.provide(testLayer))

        expect(capturedBuffer).toBeDefined()
        expect(capturedBuffer).toEqual(binaryData)
      }))

    // test-revizorro: suspect | circular test: asserts mock returns its own mocked URL value instead of testing actual behavior
    it.effect("returns correct URL format", () =>
      Effect.gen(function*() {
        const testLayer = createTestLayerWithMocks({
          uploadResult: {
            blobId: "my-blob-id" as Ref<Blob>,
            contentType: "application/pdf",
            size: 100,
            url: "https://app.huly.io/files?workspace=my-ws&file=my-blob-id"
          }
        })

        const result = yield* uploadFile({
          filename: "document.pdf",
          data: Buffer.from("pdf content").toString("base64"),
          contentType: mimeType("application/pdf")
        }).pipe(Effect.provide(testLayer))

        expect(result.url).toBe("https://app.huly.io/files?workspace=my-ws&file=my-blob-id")
      }))
  })

  describe("error handling", () => {
    // test-revizorro: approved
    it.effect("returns InvalidFileDataError for invalid base64", () =>
      Effect.gen(function*() {
        const testLayer = createTestLayerWithMocks({})

        const error = yield* Effect.flip(
          uploadFile({
            filename: "bad.txt",
            data: "!!!not-valid-base64-at-all!!!",
            contentType: mimeType("text/plain")
          }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("InvalidFileDataError")
      }))

    // test-revizorro: approved
    it.effect("returns FileUploadError when storage fails", () =>
      Effect.gen(function*() {
        const testLayer = createTestLayerWithMocks({
          uploadError: new Error("Storage service unavailable")
        })

        const error = yield* Effect.flip(
          uploadFile({
            filename: "file.txt",
            data: Buffer.from("content").toString("base64"),
            contentType: mimeType("text/plain")
          }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("FileUploadError")
        expect(error.message).toContain("Storage service unavailable")
      }))

    // test-revizorro: approved
    it.effect("returns InvalidFileDataError for empty base64 data", () =>
      Effect.gen(function*() {
        const testLayer = createTestLayerWithMocks({})

        // Empty base64 decodes to empty buffer, which we consider invalid
        const error = yield* Effect.flip(
          uploadFile({
            filename: "empty.txt",
            data: "", // Invalid - empty base64
            contentType: mimeType("text/plain")
          }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("InvalidFileDataError")
      }))
  })

  describe("content type handling", () => {
    // test-revizorro: approved
    it.effect("passes content type to storage client", () =>
      Effect.gen(function*() {
        const captureUpload: MockConfig["captureUpload"] = {}

        const testLayer = createTestLayerWithMocks({
          captureUpload
        })

        yield* uploadFile({
          filename: "data.json",
          data: Buffer.from("{\"key\": \"value\"}").toString("base64"),
          contentType: mimeType("application/json")
        }).pipe(Effect.provide(testLayer))

        expect(captureUpload.contentType).toBe("application/json")
      }))

    // test-revizorro: approved
    it.effect("handles common image types", () =>
      Effect.gen(function*() {
        const captures: Array<string> = []

        const testLayer = HulyStorageClient.testLayer({
          uploadFile: (_filename, data, contentType) => {
            captures.push(contentType)
            return Effect.succeed({
              blobId: "blob" as Ref<Blob>,
              contentType,
              size: data.length,
              url: "https://test.url"
            })
          }
        })

        const types = ["image/png", "image/jpeg", "image/gif", "image/webp"]
        const base64 = Buffer.from("test").toString("base64")

        for (const type of types) {
          yield* uploadFile({
            filename: `file.${type.split("/")[1]}`,
            data: base64,
            contentType: mimeType(type)
          }).pipe(Effect.provide(testLayer))
        }

        expect(captures).toEqual(types)
      }))
  })

  describe("filename handling", () => {
    // test-revizorro: approved
    it.effect("passes filename to storage client", () =>
      Effect.gen(function*() {
        const captureUpload: MockConfig["captureUpload"] = {}

        const testLayer = createTestLayerWithMocks({
          captureUpload
        })

        yield* uploadFile({
          filename: "my-document.pdf",
          data: Buffer.from("pdf").toString("base64"),
          contentType: mimeType("application/pdf")
        }).pipe(Effect.provide(testLayer))

        expect(captureUpload.filename).toBe("my-document.pdf")
      }))

    // test-revizorro: approved
    it.effect("handles filenames with special characters", () =>
      Effect.gen(function*() {
        const captureUpload: MockConfig["captureUpload"] = {}

        const testLayer = createTestLayerWithMocks({
          captureUpload
        })

        yield* uploadFile({
          filename: "report (2024) final.xlsx",
          data: Buffer.from("excel").toString("base64"),
          contentType: mimeType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        }).pipe(Effect.provide(testLayer))

        expect(captureUpload.filename).toBe("report (2024) final.xlsx")
      }))
  })
})

describe("getFileUrl operation", () => {
  // test-revizorro: suspect | circular test: asserts mock returns its own interpolated value instead of testing actual behavior
  it.effect("returns URL for blob ID", () =>
    Effect.gen(function*() {
      const testLayer = createTestLayerWithMocks({})

      const url = yield* getFileUrl("blob-abc-123").pipe(Effect.provide(testLayer))

      expect(url).toContain("blob-abc-123")
      expect(url).toContain("file=")
    }))

  // test-revizorro: suspect | circular: mock returns hardcoded value, assertion matches that exact mock value—tests nothing real
  it.effect("uses storage client getFileUrl", () =>
    Effect.gen(function*() {
      const testLayer = HulyStorageClient.testLayer({
        getFileUrl: (blobId) => `https://custom.cdn/v1/${blobId}`
      })

      const url = yield* getFileUrl("custom-blob").pipe(Effect.provide(testLayer))

      expect(url).toBe("https://custom.cdn/v1/custom-blob")
    }))
})
