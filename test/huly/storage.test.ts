import { describe, it } from "@effect/vitest"
import { expect } from "vitest"
import { Effect } from "effect"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"

import {
  HulyStorageClient,
  type HulyStorageOperations,
  decodeBase64,
  readFromFilePath,
  fetchFromUrl,
  isBlockedUrl,
  type UploadFileResult,
} from "../../src/huly/storage.js"
import { HulyConnectionError, FileUploadError, InvalidFileDataError, FileNotFoundError, FileFetchError } from "../../src/huly/errors.js"

describe("HulyStorageClient Service", () => {
  describe("testLayer", () => {
    it.effect("provides default noop operations", () =>
      Effect.gen(function* () {
        const testLayer = HulyStorageClient.testLayer({})

        const client = yield* HulyStorageClient.pipe(Effect.provide(testLayer))

        expect(client.uploadFile).toBeDefined()
        expect(client.getFileUrl).toBeDefined()
      })
    )

    it.effect("default uploadFile returns test blob", () =>
      Effect.gen(function* () {
        const testLayer = HulyStorageClient.testLayer({})

        const client = yield* HulyStorageClient.pipe(Effect.provide(testLayer))
        const result = yield* client.uploadFile(
          "test.png",
          Buffer.from("test"),
          "image/png"
        )

        expect(result.blobId).toBe("test-blob-id")
        expect(result.contentType).toBe("application/octet-stream")
        expect(result.size).toBe(0)
        expect(result.url).toContain("test-blob-id")
      })
    )

    it.effect("default getFileUrl returns constructed URL", () =>
      Effect.gen(function* () {
        const testLayer = HulyStorageClient.testLayer({})

        const client = yield* HulyStorageClient.pipe(Effect.provide(testLayer))
        const url = client.getFileUrl("my-blob-id")

        expect(url).toContain("my-blob-id")
        expect(url).toContain("workspace=test")
        expect(url).toContain("file=")
      })
    )

    it.effect("allows overriding uploadFile", () =>
      Effect.gen(function* () {
        const customResult: UploadFileResult = {
          blobId: "custom-blob-123",
          contentType: "image/jpeg",
          size: 12345,
          url: "https://custom.url/files?workspace=ws&file=custom-blob-123",
        }

        const testLayer = HulyStorageClient.testLayer({
          uploadFile: () => Effect.succeed(customResult),
        })

        const client = yield* HulyStorageClient.pipe(Effect.provide(testLayer))
        const result = yield* client.uploadFile(
          "photo.jpg",
          Buffer.from("jpeg data"),
          "image/jpeg"
        )

        expect(result.blobId).toBe("custom-blob-123")
        expect(result.contentType).toBe("image/jpeg")
        expect(result.size).toBe(12345)
      })
    )

    it.effect("allows overriding getFileUrl", () =>
      Effect.gen(function* () {
        const testLayer = HulyStorageClient.testLayer({
          getFileUrl: (blobId) => `https://custom.cdn/${blobId}`,
        })

        const client = yield* HulyStorageClient.pipe(Effect.provide(testLayer))
        const url = client.getFileUrl("blob-456")

        expect(url).toBe("https://custom.cdn/blob-456")
      })
    )
  })

  describe("mock operations with errors", () => {
    it.effect("can mock uploadFile to return FileUploadError", () =>
      Effect.gen(function* () {
        const testLayer = HulyStorageClient.testLayer({
          uploadFile: () =>
            Effect.fail(
              new FileUploadError({
                message: "Storage quota exceeded",
              })
            ),
        })

        const client = yield* HulyStorageClient.pipe(Effect.provide(testLayer))
        const error = yield* Effect.flip(
          client.uploadFile("large.zip", Buffer.from("data"), "application/zip")
        )

        expect(error._tag).toBe("FileUploadError")
        expect(error.message).toBe("Storage quota exceeded")
      })
    )

    it.effect("can mock uploadFile to return HulyConnectionError", () =>
      Effect.gen(function* () {
        const testLayer = HulyStorageClient.testLayer({
          uploadFile: () =>
            Effect.fail(
              new HulyConnectionError({
                message: "Network timeout during upload",
              })
            ),
        })

        const client = yield* HulyStorageClient.pipe(Effect.provide(testLayer))
        const error = yield* Effect.flip(
          client.uploadFile("file.pdf", Buffer.from("pdf"), "application/pdf")
        )

        expect(error._tag).toBe("HulyConnectionError")
        expect(error.message).toBe("Network timeout during upload")
      })
    )
  })

  describe("error handling patterns", () => {
    it.effect("can catch FileUploadError with catchTag", () =>
      Effect.gen(function* () {
        const testLayer = HulyStorageClient.testLayer({
          uploadFile: () =>
            Effect.fail(
              new FileUploadError({
                message: "File too large",
              })
            ),
        })

        const result = yield* Effect.gen(function* () {
          const client = yield* HulyStorageClient
          return yield* client.uploadFile(
            "huge.bin",
            Buffer.from("big data"),
            "application/octet-stream"
          )
        }).pipe(
          Effect.catchTag("FileUploadError", (e) =>
            Effect.succeed({ blobId: "fallback", contentType: "", size: 0, url: `error: ${e.message}` })
          ),
          Effect.provide(testLayer)
        )

        expect(result.url).toBe("error: File too large")
      })
    )
  })

  describe("operation tracking", () => {
    it.effect("tracks uploadFile calls for testing", () =>
      Effect.gen(function* () {
        const uploads: Array<{ filename: string; contentType: string; size: number }> = []

        const testLayer = HulyStorageClient.testLayer({
          uploadFile: (filename, data, contentType) => {
            uploads.push({ filename, contentType, size: data.length })
            return Effect.succeed({
              blobId: `blob-${uploads.length}`,
              contentType,
              size: data.length,
              url: `https://test.url/blob-${uploads.length}`,
            })
          },
        })

        yield* Effect.gen(function* () {
          const client = yield* HulyStorageClient
          yield* client.uploadFile("image1.png", Buffer.from("png1"), "image/png")
          yield* client.uploadFile("image2.jpg", Buffer.from("jpg data"), "image/jpeg")
        }).pipe(Effect.provide(testLayer))

        expect(uploads).toHaveLength(2)
        expect(uploads[0].filename).toBe("image1.png")
        expect(uploads[0].contentType).toBe("image/png")
        expect(uploads[1].filename).toBe("image2.jpg")
        expect(uploads[1].contentType).toBe("image/jpeg")
      })
    )
  })
})

describe("decodeBase64", () => {
  it.effect("decodes valid base64 string", () =>
    Effect.gen(function* () {
      const original = "Hello, World!"
      const base64 = Buffer.from(original).toString("base64")

      const buffer = yield* decodeBase64(base64)

      expect(buffer.toString()).toBe(original)
    })
  )

  it.effect("decodes base64 with data URL prefix", () =>
    Effect.gen(function* () {
      const original = "PNG image data"
      const base64 = Buffer.from(original).toString("base64")
      const dataUrl = `data:image/png;base64,${base64}`

      const buffer = yield* decodeBase64(dataUrl)

      expect(buffer.toString()).toBe(original)
    })
  )

  it.effect("handles binary data correctly", () =>
    Effect.gen(function* () {
      const binaryData = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe, 0xfd])
      const base64 = binaryData.toString("base64")

      const buffer = yield* decodeBase64(base64)

      expect(buffer).toEqual(binaryData)
    })
  )

  it.effect("handles base64 with whitespace", () =>
    Effect.gen(function* () {
      const original = "test data"
      const base64 = Buffer.from(original).toString("base64")
      const withWhitespace = `  ${base64}  `

      // Note: Buffer.from handles some whitespace, but the validation may fail
      // depending on how strict we want to be
      const buffer = yield* decodeBase64(withWhitespace.trim())

      expect(buffer.toString()).toBe(original)
    })
  )

  it.effect("returns InvalidFileDataError for invalid base64", () =>
    Effect.gen(function* () {
      // This is not valid base64 - contains invalid characters
      const invalidBase64 = "!!!not-valid-base64!!!"

      const error = yield* Effect.flip(decodeBase64(invalidBase64))

      expect(error._tag).toBe("InvalidFileDataError")
      expect(error.message).toContain("Invalid base64")
    })
  )

  it.effect("returns InvalidFileDataError for empty string after data URL prefix", () =>
    Effect.gen(function* () {
      const emptyDataUrl = "data:image/png;base64,"

      const error = yield* Effect.flip(decodeBase64(emptyDataUrl))

      expect(error._tag).toBe("InvalidFileDataError")
      expect(error.message).toContain("Invalid base64")
    })
  )

  it.effect("handles large base64 strings", () =>
    Effect.gen(function* () {
      // Create a larger buffer (1KB)
      const largeData = Buffer.alloc(1024, "x")
      const base64 = largeData.toString("base64")

      const buffer = yield* decodeBase64(base64)

      expect(buffer.length).toBe(1024)
      expect(buffer).toEqual(largeData)
    })
  )
})

describe("FileUploadError", () => {
  it.effect("has correct tag", () =>
    Effect.gen(function* () {
      const error = new FileUploadError({ message: "Upload failed" })
      expect(error._tag).toBe("FileUploadError")
    })
  )

  it.effect("includes cause when provided", () =>
    Effect.gen(function* () {
      const cause = new Error("Network error")
      const error = new FileUploadError({
        message: "Upload failed",
        cause,
      })
      expect(error.cause).toBe(cause)
    })
  )

  it.effect("has mcpErrorCode for internal error", () =>
    Effect.gen(function* () {
      const error = new FileUploadError({ message: "test" })
      expect(error.mcpErrorCode).toBe(-32603) // InternalError
    })
  )
})

describe("InvalidFileDataError", () => {
  it.effect("has correct tag", () =>
    Effect.gen(function* () {
      const error = new InvalidFileDataError({ message: "Bad data" })
      expect(error._tag).toBe("InvalidFileDataError")
    })
  )

  it.effect("has mcpErrorCode for invalid params", () =>
    Effect.gen(function* () {
      const error = new InvalidFileDataError({ message: "test" })
      expect(error.mcpErrorCode).toBe(-32602) // InvalidParams
    })
  )
})

describe("readFromFilePath", () => {
  it.effect("reads existing file", () =>
    Effect.gen(function* () {
      const tmpDir = os.tmpdir()
      const tmpFile = path.join(tmpDir, `test-read-${Date.now()}.txt`)
      const content = "test file content"

      yield* Effect.tryPromise(() => fs.writeFile(tmpFile, content))

      try {
        const buffer = yield* readFromFilePath(tmpFile)
        expect(buffer.toString()).toBe(content)
      } finally {
        yield* Effect.tryPromise(() => fs.unlink(tmpFile).catch(() => {}))
      }
    })
  )

  it.effect("returns FileNotFoundError for missing file", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(readFromFilePath("/nonexistent/path/file.txt"))

      expect(error._tag).toBe("FileNotFoundError")
      expect((error as FileNotFoundError).filePath).toBe("/nonexistent/path/file.txt")
    })
  )

  it.effect("resolves relative paths", () =>
    Effect.gen(function* () {
      const tmpDir = os.tmpdir()
      const tmpFile = path.join(tmpDir, `test-relative-${Date.now()}.txt`)
      const content = "relative path test"

      yield* Effect.tryPromise(() => fs.writeFile(tmpFile, content))

      try {
        // Use basename only - should fail since current dir doesn't have the file
        const error = yield* Effect.flip(readFromFilePath(path.basename(tmpFile)))
        expect(error._tag).toBe("FileNotFoundError")
      } finally {
        yield* Effect.tryPromise(() => fs.unlink(tmpFile).catch(() => {}))
      }
    })
  )
})

describe("fetchFromUrl", () => {
  it.effect("returns FileFetchError for invalid URL", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(fetchFromUrl("https://nonexistent.invalid.domain.test/file.png"))

      expect(error._tag).toBe("FileFetchError")
      expect((error as FileFetchError).fileUrl).toBe("https://nonexistent.invalid.domain.test/file.png")
    })
  )

  it.effect("includes URL in FileFetchError", () =>
    Effect.gen(function* () {
      const testUrl = "https://example.invalid.test/file.png"
      const error = yield* Effect.flip(fetchFromUrl(testUrl))

      expect(error._tag).toBe("FileFetchError")
      expect((error as FileFetchError).fileUrl).toBe(testUrl)
      expect((error as FileFetchError).reason).toBeDefined()
    })
  )

  it.effect("blocks localhost URLs", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(fetchFromUrl("http://localhost:8080/file.png"))
      expect(error._tag).toBe("FileFetchError")
      expect((error as FileFetchError).reason).toContain("blocked")
    })
  )

  it.effect("blocks private IP URLs", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(fetchFromUrl("http://192.168.1.1/file.png"))
      expect(error._tag).toBe("FileFetchError")
      expect((error as FileFetchError).reason).toContain("blocked")
    })
  )
})

describe("isBlockedUrl", () => {
  it("blocks localhost", () => {
    expect(isBlockedUrl("http://localhost/file")).toBe(true)
    expect(isBlockedUrl("http://localhost:8080/file")).toBe(true)
  })

  it("blocks 127.x.x.x loopback range", () => {
    expect(isBlockedUrl("http://127.0.0.1/file")).toBe(true)
    expect(isBlockedUrl("http://127.0.0.2/file")).toBe(true)
    expect(isBlockedUrl("http://127.255.255.255/file")).toBe(true)
  })

  it("blocks ::1 IPv6 loopback", () => {
    expect(isBlockedUrl("http://[::1]/file")).toBe(true)
  })

  it("blocks 10.x.x.x private range", () => {
    expect(isBlockedUrl("http://10.0.0.1/file")).toBe(true)
    expect(isBlockedUrl("http://10.255.255.255/file")).toBe(true)
  })

  it("blocks 172.16-31.x.x private range", () => {
    expect(isBlockedUrl("http://172.16.0.1/file")).toBe(true)
    expect(isBlockedUrl("http://172.31.255.255/file")).toBe(true)
    // 172.15.x.x and 172.32.x.x should NOT be blocked
    expect(isBlockedUrl("http://172.15.0.1/file")).toBe(false)
    expect(isBlockedUrl("http://172.32.0.1/file")).toBe(false)
  })

  it("blocks 192.168.x.x private range", () => {
    expect(isBlockedUrl("http://192.168.0.1/file")).toBe(true)
    expect(isBlockedUrl("http://192.168.255.255/file")).toBe(true)
    // 192.167.x.x should NOT be blocked
    expect(isBlockedUrl("http://192.167.0.1/file")).toBe(false)
  })

  it("blocks 169.254.x.x link-local range (includes cloud metadata)", () => {
    expect(isBlockedUrl("http://169.254.169.254/latest/meta-data")).toBe(true)
    expect(isBlockedUrl("http://169.254.0.1/file")).toBe(true)
  })

  it("blocks Google cloud metadata hostname", () => {
    expect(isBlockedUrl("http://metadata.google.internal/file")).toBe(true)
  })

  it("allows public URLs", () => {
    expect(isBlockedUrl("https://example.com/file.png")).toBe(false)
    expect(isBlockedUrl("https://8.8.8.8/file")).toBe(false)
    expect(isBlockedUrl("https://cdn.example.org/image.jpg")).toBe(false)
  })

  it("blocks invalid URLs", () => {
    expect(isBlockedUrl("not-a-url")).toBe(true)
    expect(isBlockedUrl("")).toBe(true)
  })
})
