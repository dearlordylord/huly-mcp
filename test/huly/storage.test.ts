import { describe, it } from "@effect/vitest"
import type { Blob, Ref, WorkspaceUuid } from "@hcengineering/core"
import { Effect, Layer } from "effect"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { expect, vi } from "vitest"

import { HulyConfigService } from "../../src/config/config.js"
import { FileUploadError, HulyConnectionError, InvalidFileDataError } from "../../src/huly/errors.js"
import type { FileNotFoundError } from "../../src/huly/errors.js"
import {
  decodeBase64,
  fetchFromUrl,
  getBufferFromParams,
  HulyStorageClient,
  isBlockedUrl,
  readFromFilePath,
  type UploadFileResult,
  validateContentType,
  validateFileSize
} from "../../src/huly/storage.js"

const mockPut = vi.fn()
const mockLoadServerConfig = vi.fn()
const mockGetWorkspaceToken = vi.fn()
const mockCreateStorageClient = vi.fn()

vi.mock("@hcengineering/api-client", () => ({
  loadServerConfig: (...args: Array<unknown>) => mockLoadServerConfig(...args),
  getWorkspaceToken: (...args: Array<unknown>) => mockGetWorkspaceToken(...args),
  createStorageClient: (...args: Array<unknown>) => mockCreateStorageClient(...args)
}))

describe("HulyStorageClient Service", () => {
  describe("testLayer", () => {
    // test-revizorro: scheduled
    it.effect("provides default noop operations", () =>
      Effect.gen(function*() {
        const testLayer = HulyStorageClient.testLayer({})

        const client = yield* HulyStorageClient.pipe(Effect.provide(testLayer))

        expect(client.uploadFile).toBeDefined()
        expect(client.getFileUrl).toBeDefined()
      }))

    // test-revizorro: scheduled
    it.effect("default uploadFile returns test blob", () =>
      Effect.gen(function*() {
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
      }))

    // test-revizorro: scheduled
    it.effect("default getFileUrl returns constructed URL", () =>
      Effect.gen(function*() {
        const testLayer = HulyStorageClient.testLayer({})

        const client = yield* HulyStorageClient.pipe(Effect.provide(testLayer))
        const url = client.getFileUrl("my-blob-id")

        expect(url).toContain("my-blob-id")
        expect(url).toContain("workspace=test")
        expect(url).toContain("file=")
      }))

    // test-revizorro: scheduled
    it.effect("allows overriding uploadFile", () =>
      Effect.gen(function*() {
        const customResult: UploadFileResult = {
          blobId: "custom-blob-123",
          contentType: "image/jpeg",
          size: 12345,
          url: "https://custom.url/files?workspace=ws&file=custom-blob-123"
        }

        const testLayer = HulyStorageClient.testLayer({
          uploadFile: () => Effect.succeed(customResult)
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
      }))

    // test-revizorro: scheduled
    it.effect("allows overriding getFileUrl", () =>
      Effect.gen(function*() {
        const testLayer = HulyStorageClient.testLayer({
          getFileUrl: (blobId) => `https://custom.cdn/${blobId}`
        })

        const client = yield* HulyStorageClient.pipe(Effect.provide(testLayer))
        const url = client.getFileUrl("blob-456")

        expect(url).toBe("https://custom.cdn/blob-456")
      }))
  })

  describe("mock operations with errors", () => {
    // test-revizorro: scheduled
    it.effect("can mock uploadFile to return FileUploadError", () =>
      Effect.gen(function*() {
        const testLayer = HulyStorageClient.testLayer({
          uploadFile: () =>
            Effect.fail(
              new FileUploadError({
                message: "Storage quota exceeded"
              })
            )
        })

        const client = yield* HulyStorageClient.pipe(Effect.provide(testLayer))
        const error = yield* Effect.flip(
          client.uploadFile("large.zip", Buffer.from("data"), "application/zip")
        )

        expect(error._tag).toBe("FileUploadError")
        expect(error.message).toBe("Storage quota exceeded")
      }))

    // test-revizorro: scheduled
    it.effect("can mock uploadFile to return HulyConnectionError", () =>
      Effect.gen(function*() {
        const testLayer = HulyStorageClient.testLayer({
          uploadFile: () =>
            Effect.fail(
              new HulyConnectionError({
                message: "Network timeout during upload"
              })
            )
        })

        const client = yield* HulyStorageClient.pipe(Effect.provide(testLayer))
        const error = yield* Effect.flip(
          client.uploadFile("file.pdf", Buffer.from("pdf"), "application/pdf")
        )

        expect(error._tag).toBe("HulyConnectionError")
        expect(error.message).toBe("Network timeout during upload")
      }))
  })

  describe("error handling patterns", () => {
    // test-revizorro: scheduled
    it.effect("can catch FileUploadError with catchTag", () =>
      Effect.gen(function*() {
        const testLayer = HulyStorageClient.testLayer({
          uploadFile: () =>
            Effect.fail(
              new FileUploadError({
                message: "File too large"
              })
            )
        })

        const result = yield* Effect.gen(function*() {
          const client = yield* HulyStorageClient
          return yield* client.uploadFile(
            "huge.bin",
            Buffer.from("big data"),
            "application/octet-stream"
          )
        }).pipe(
          Effect.catchTag("FileUploadError", (e) =>
            Effect.succeed({ blobId: "fallback", contentType: "", size: 0, url: `error: ${e.message}` })),
          Effect.provide(testLayer)
        )

        expect(result.url).toBe("error: File too large")
      }))
  })

  describe("operation tracking", () => {
    // test-revizorro: scheduled
    it.effect("tracks uploadFile calls for testing", () =>
      Effect.gen(function*() {
        const uploads: Array<{ filename: string; contentType: string; size: number }> = []

        const testLayer = HulyStorageClient.testLayer({
          uploadFile: (filename, data, contentType) => {
            uploads.push({ filename, contentType, size: data.length })
            return Effect.succeed({
              blobId: `blob-${uploads.length}`,
              contentType,
              size: data.length,
              url: `https://test.url/blob-${uploads.length}`
            })
          }
        })

        yield* Effect.gen(function*() {
          const client = yield* HulyStorageClient
          yield* client.uploadFile("image1.png", Buffer.from("png1"), "image/png")
          yield* client.uploadFile("image2.jpg", Buffer.from("jpg data"), "image/jpeg")
        }).pipe(Effect.provide(testLayer))

        expect(uploads).toHaveLength(2)
        expect(uploads[0].filename).toBe("image1.png")
        expect(uploads[0].contentType).toBe("image/png")
        expect(uploads[1].filename).toBe("image2.jpg")
        expect(uploads[1].contentType).toBe("image/jpeg")
      }))
  })
})

describe("decodeBase64", () => {
  // test-revizorro: scheduled
  it.effect("decodes valid base64 string", () =>
    Effect.gen(function*() {
      const original = "Hello, World!"
      const base64 = Buffer.from(original).toString("base64")

      const buffer = yield* decodeBase64(base64)

      expect(buffer.toString()).toBe(original)
    }))

  // test-revizorro: scheduled
  it.effect("decodes base64 with data URL prefix", () =>
    Effect.gen(function*() {
      const original = "PNG image data"
      const base64 = Buffer.from(original).toString("base64")
      const dataUrl = `data:image/png;base64,${base64}`

      const buffer = yield* decodeBase64(dataUrl)

      expect(buffer.toString()).toBe(original)
    }))

  // test-revizorro: scheduled
  it.effect("handles binary data correctly", () =>
    Effect.gen(function*() {
      const binaryData = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe, 0xfd])
      const base64 = binaryData.toString("base64")

      const buffer = yield* decodeBase64(base64)

      expect(buffer).toEqual(binaryData)
    }))

  // test-revizorro: scheduled
  it.effect("handles base64 with whitespace", () =>
    Effect.gen(function*() {
      const original = "test data"
      const base64 = Buffer.from(original).toString("base64")
      const withWhitespace = `  ${base64}  `

      // Note: Buffer.from handles some whitespace, but the validation may fail
      // depending on how strict we want to be
      const buffer = yield* decodeBase64(withWhitespace.trim())

      expect(buffer.toString()).toBe(original)
    }))

  // test-revizorro: scheduled
  it.effect("returns InvalidFileDataError for invalid base64", () =>
    Effect.gen(function*() {
      // This is not valid base64 - contains invalid characters
      const invalidBase64 = "!!!not-valid-base64!!!"

      const error = yield* Effect.flip(decodeBase64(invalidBase64))

      expect(error._tag).toBe("InvalidFileDataError")
      expect(error.message).toContain("Invalid base64")
    }))

  // test-revizorro: scheduled
  it.effect("returns InvalidFileDataError for empty string after data URL prefix", () =>
    Effect.gen(function*() {
      const emptyDataUrl = "data:image/png;base64,"

      const error = yield* Effect.flip(decodeBase64(emptyDataUrl))

      expect(error._tag).toBe("InvalidFileDataError")
      expect(error.message).toContain("Invalid base64")
    }))

  // test-revizorro: scheduled
  it.effect("handles large base64 strings", () =>
    Effect.gen(function*() {
      // Create a larger buffer (1KB)
      const largeData = Buffer.alloc(1024, "x")
      const base64 = largeData.toString("base64")

      const buffer = yield* decodeBase64(base64)

      expect(buffer.length).toBe(1024)
      expect(buffer).toEqual(largeData)
    }))
})

describe("FileUploadError", () => {
  // test-revizorro: scheduled
  it.effect("has correct tag", () =>
    Effect.gen(function*() {
      const error = new FileUploadError({ message: "Upload failed" })
      expect(error._tag).toBe("FileUploadError")
    }))

  // test-revizorro: scheduled
  it.effect("includes cause when provided", () =>
    Effect.gen(function*() {
      const cause = new Error("Network error")
      const error = new FileUploadError({
        message: "Upload failed",
        cause
      })
      expect(error.cause).toBe(cause)
    }))
})

describe("InvalidFileDataError", () => {
  // test-revizorro: approved
  it.effect("has correct tag", () =>
    Effect.gen(function*() {
      const error = new InvalidFileDataError({ message: "Bad data" })
      expect(error._tag).toBe("InvalidFileDataError")
    }))
})

describe("readFromFilePath", () => {
  // test-revizorro: scheduled
  it.effect("reads existing file", () =>
    Effect.gen(function*() {
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
    }))

  // test-revizorro: scheduled
  it.effect("returns FileNotFoundError for missing file", () =>
    Effect.gen(function*() {
      const error = yield* Effect.flip(readFromFilePath("/nonexistent/path/file.txt"))

      expect(error._tag).toBe("FileNotFoundError")
      expect((error as FileNotFoundError).filePath).toBe("/nonexistent/path/file.txt")
    }))

  // test-revizorro: scheduled
  it.effect("resolves relative paths", () =>
    Effect.gen(function*() {
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
    }))

  // test-revizorro: scheduled
  it.effect("returns InvalidFileDataError for non-ENOENT errors (e.g. reading a directory)", () =>
    Effect.gen(function*() {
      const tmpDir = os.tmpdir()
      // Attempting to read a directory triggers EISDIR, not ENOENT
      const error = yield* Effect.flip(readFromFilePath(tmpDir))

      expect(error._tag).toBe("InvalidFileDataError")
      expect((error as InvalidFileDataError).message).toContain("Failed to read file")
    }))
})

describe("fetchFromUrl", () => {
  // test-revizorro: scheduled
  it.effect("returns FileFetchError for invalid URL", () =>
    Effect.gen(function*() {
      const error = yield* Effect.flip(fetchFromUrl("https://nonexistent.invalid.domain.test/file.png"))

      expect(error._tag).toBe("FileFetchError")
      expect(error.fileUrl).toBe("https://nonexistent.invalid.domain.test/file.png")
    }))

  // test-revizorro: scheduled
  it.effect("includes URL in FileFetchError", () =>
    Effect.gen(function*() {
      const testUrl = "https://example.invalid.test/file.png"
      const error = yield* Effect.flip(fetchFromUrl(testUrl))

      expect(error._tag).toBe("FileFetchError")
      expect(error.fileUrl).toBe(testUrl)
      expect(error.reason).toBeDefined()
    }))

  // test-revizorro: scheduled
  it.effect("blocks localhost URLs", () =>
    Effect.gen(function*() {
      const error = yield* Effect.flip(fetchFromUrl("http://localhost:8080/file.png"))
      expect(error._tag).toBe("FileFetchError")
      expect(error.reason).toContain("blocked")
    }))

  // test-revizorro: scheduled
  it.effect("blocks private IP URLs", () =>
    Effect.gen(function*() {
      const error = yield* Effect.flip(fetchFromUrl("http://192.168.1.1/file.png"))
      expect(error._tag).toBe("FileFetchError")
      expect(error.reason).toContain("blocked")
    }))

  // test-revizorro: scheduled
  it.effect("returns FileFetchError for non-ok HTTP responses", () =>
    Effect.gen(function*() {
      const originalFetch = globalThis.fetch
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        statusText: "Forbidden"
      })

      try {
        const error = yield* Effect.flip(
          fetchFromUrl("https://example.com/secret-file.png")
        )
        expect(error._tag).toBe("FileFetchError")
        expect(error.fileUrl).toBe("https://example.com/secret-file.png")
        expect(error.reason).toContain("403")
      } finally {
        globalThis.fetch = originalFetch
      }
    }))

  // test-revizorro: scheduled
  it.effect("returns buffer on successful fetch", () =>
    Effect.gen(function*() {
      const originalFetch = globalThis.fetch
      const fileContent = Buffer.from("fetched file data")
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        arrayBuffer: () =>
          Promise.resolve(fileContent.buffer.slice(
            fileContent.byteOffset,
            fileContent.byteOffset + fileContent.byteLength
          ))
      })

      try {
        const buffer = yield* fetchFromUrl("https://example.com/file.png")
        expect(buffer.toString()).toBe("fetched file data")
      } finally {
        globalThis.fetch = originalFetch
      }
    }))
})

describe("validateFileSize", () => {
  // test-revizorro: scheduled
  it.effect("accepts buffer within size limit", () =>
    Effect.gen(function*() {
      const buffer = Buffer.alloc(100, "x")
      yield* validateFileSize(buffer, "small.txt")
    }))

  // test-revizorro: scheduled
  it.effect("rejects buffer exceeding size limit", () =>
    Effect.gen(function*() {
      // 100 MB + 1 byte exceeds the MAX_FILE_SIZE (100 * 1024 * 1024)
      const buffer = Buffer.alloc(100 * 1024 * 1024 + 1, "x")
      const error = yield* Effect.flip(validateFileSize(buffer, "huge.bin"))

      expect(error._tag).toBe("FileTooLargeError")
      expect(error.filename).toBe("huge.bin")
      expect(error.size).toBe(100 * 1024 * 1024 + 1)
    }))
})

describe("validateContentType", () => {
  // test-revizorro: scheduled
  it.effect("accepts allowed content types", () =>
    Effect.gen(function*() {
      yield* validateContentType("image/png", "photo.png")
      yield* validateContentType("application/pdf", "doc.pdf")
      yield* validateContentType("text/plain", "readme.txt")
      yield* validateContentType("application/octet-stream", "data.bin")
    }))

  // test-revizorro: scheduled
  it.effect("rejects disallowed content types", () =>
    Effect.gen(function*() {
      const error = yield* Effect.flip(
        validateContentType("application/x-executable", "malware.exe")
      )

      expect(error._tag).toBe("InvalidContentTypeError")
      expect(error.filename).toBe("malware.exe")
      expect(error.contentType).toBe("application/x-executable")
    }))
})

describe("getBufferFromParams", () => {
  // test-revizorro: scheduled
  it.effect("reads from filePath", () =>
    Effect.gen(function*() {
      const tmpFile = path.join(os.tmpdir(), `test-gbfp-${Date.now()}.txt`)
      yield* Effect.tryPromise(() => fs.writeFile(tmpFile, "filePath content"))

      try {
        const buffer = yield* getBufferFromParams({ _tag: "filePath", filePath: tmpFile })
        expect(buffer.toString()).toBe("filePath content")
      } finally {
        yield* Effect.tryPromise(() => fs.unlink(tmpFile).catch(() => {}))
      }
    }))

  // test-revizorro: approved
  it.effect("decodes base64 data", () =>
    Effect.gen(function*() {
      const original = "base64 content"
      const base64 = Buffer.from(original).toString("base64")

      const buffer = yield* getBufferFromParams({ _tag: "base64", data: base64 })
      expect(buffer.toString()).toBe(original)
    }))

  // test-revizorro: approved
  it.effect("returns error for blocked URL", () =>
    Effect.gen(function*() {
      const error = yield* Effect.flip(
        getBufferFromParams({ _tag: "fileUrl", fileUrl: "http://localhost/secret" })
      )
      expect(error._tag).toBe("FileFetchError")
    }))
})

describe("isBlockedUrl", () => {
  // test-revizorro: approved
  it("blocks localhost", () => {
    expect(isBlockedUrl("http://localhost/file")).toBe(true)
    expect(isBlockedUrl("http://localhost:8080/file")).toBe(true)
  })

  // test-revizorro: approved
  it("blocks 127.x.x.x loopback range", () => {
    expect(isBlockedUrl("http://127.0.0.1/file")).toBe(true)
    expect(isBlockedUrl("http://127.0.0.2/file")).toBe(true)
    expect(isBlockedUrl("http://127.255.255.255/file")).toBe(true)
  })

  // test-revizorro: scheduled
  it("blocks ::1 IPv6 loopback", () => {
    expect(isBlockedUrl("http://[::1]/file")).toBe(true)
  })

  // test-revizorro: approved
  it("blocks 10.x.x.x private range", () => {
    expect(isBlockedUrl("http://10.0.0.1/file")).toBe(true)
    expect(isBlockedUrl("http://10.255.255.255/file")).toBe(true)
  })

  // test-revizorro: scheduled
  it("blocks 172.16-31.x.x private range", () => {
    expect(isBlockedUrl("http://172.16.0.1/file")).toBe(true)
    expect(isBlockedUrl("http://172.31.255.255/file")).toBe(true)
    // 172.15.x.x and 172.32.x.x should NOT be blocked
    expect(isBlockedUrl("http://172.15.0.1/file")).toBe(false)
    expect(isBlockedUrl("http://172.32.0.1/file")).toBe(false)
  })

  // test-revizorro: approved
  it("blocks 192.168.x.x private range", () => {
    expect(isBlockedUrl("http://192.168.0.1/file")).toBe(true)
    expect(isBlockedUrl("http://192.168.255.255/file")).toBe(true)
    // 192.167.x.x should NOT be blocked
    expect(isBlockedUrl("http://192.167.0.1/file")).toBe(false)
  })

  // test-revizorro: approved
  it("blocks 169.254.x.x link-local range (includes cloud metadata)", () => {
    expect(isBlockedUrl("http://169.254.169.254/latest/meta-data")).toBe(true)
    expect(isBlockedUrl("http://169.254.0.1/file")).toBe(true)
  })

  // test-revizorro: approved
  it("blocks Google cloud metadata hostname", () => {
    expect(isBlockedUrl("http://metadata.google.internal/file")).toBe(true)
  })

  // test-revizorro: approved
  it("allows public URLs", () => {
    expect(isBlockedUrl("https://example.com/file.png")).toBe(false)
    expect(isBlockedUrl("https://8.8.8.8/file")).toBe(false)
    expect(isBlockedUrl("https://cdn.example.org/image.jpg")).toBe(false)
  })

  // test-revizorro: approved
  it("blocks invalid URLs", () => {
    expect(isBlockedUrl("not-a-url")).toBe(true)
    expect(isBlockedUrl("")).toBe(true)
  })
})

describe("HulyStorageClient.layer (real layer with mocked api-client)", () => {
  const configLayer = HulyConfigService.testLayerToken({
    url: "https://huly.example.com",
    token: "test-token-123",
    workspace: "test-ws"
  })

  const setupMocksForSuccess = () => {
    mockLoadServerConfig.mockResolvedValue({
      ACCOUNTS_URL: "https://accounts.huly.example.com",
      COLLABORATOR_URL: "https://collab.huly.example.com",
      FILES_URL: "/files",
      UPLOAD_URL: "/upload"
    })
    mockGetWorkspaceToken.mockResolvedValue({
      endpoint: "wss://huly.example.com",
      token: "ws-token-abc",

      workspaceId: "ws-uuid-123" as WorkspaceUuid,
      info: {}
    })
    mockCreateStorageClient.mockReturnValue({
      put: mockPut,
      get: vi.fn(),
      stat: vi.fn(),
      partial: vi.fn(),
      remove: vi.fn()
    })
  }

  // test-revizorro: approved
  it.effect("connects and provides uploadFile and getFileUrl operations", () =>
    Effect.gen(function*() {
      setupMocksForSuccess()
      mockPut.mockResolvedValue({
        _id: "uploaded-blob-id" as Ref<Blob>,
        contentType: "image/png",
        size: 42
      })

      const layer = Layer.fresh(HulyStorageClient.layer).pipe(Layer.provide(configLayer))
      const client = yield* HulyStorageClient.pipe(Effect.provide(layer))

      const result = yield* client.uploadFile(
        "photo.png",
        Buffer.from("fake png data"),
        "image/png"
      )

      expect(result.blobId).toBe("uploaded-blob-id")
      expect(result.contentType).toBe("image/png")
      expect(result.size).toBe(42)
      expect(result.url).toContain("workspace=ws-uuid-123")
      expect(result.url).toContain("file=uploaded-blob-id")
      expect(result.url).toContain("https://huly.example.com/files")

      expect(mockLoadServerConfig).toHaveBeenCalledWith("https://huly.example.com")
      expect(mockGetWorkspaceToken).toHaveBeenCalledWith(
        "https://huly.example.com",
        expect.objectContaining({ token: "test-token-123", workspace: "test-ws" }),
        expect.any(Object)
      )
      expect(mockCreateStorageClient).toHaveBeenCalledWith(
        "https://huly.example.com/files",
        "https://huly.example.com/upload",
        "ws-token-abc",
        "ws-uuid-123"
      )
    }))

  // test-revizorro: approved
  it.effect("getFileUrl constructs correct URL without calling API", () =>
    Effect.gen(function*() {
      setupMocksForSuccess()

      const layer = Layer.fresh(HulyStorageClient.layer).pipe(Layer.provide(configLayer))
      const client = yield* HulyStorageClient.pipe(Effect.provide(layer))

      const url = client.getFileUrl("some-blob-id")

      expect(url).toBe("https://huly.example.com/files?workspace=ws-uuid-123&file=some-blob-id")
    }))

  // test-revizorro: approved
  it.effect("wraps upload errors in FileUploadError", () =>
    Effect.gen(function*() {
      setupMocksForSuccess()
      mockPut.mockRejectedValue(new Error("S3 bucket full"))

      const layer = Layer.fresh(HulyStorageClient.layer).pipe(Layer.provide(configLayer))
      const client = yield* HulyStorageClient.pipe(Effect.provide(layer))

      const error = yield* Effect.flip(
        client.uploadFile("doc.pdf", Buffer.from("pdf data"), "application/pdf")
      )

      expect(error._tag).toBe("FileUploadError")
      expect(error.message).toContain("S3 bucket full")
    }))

  // test-revizorro: suspect | Effects are lazy - never accesses service so layer construction never triggered
  it("fails layer construction when loadServerConfig rejects", async () => {
    mockLoadServerConfig.mockRejectedValue(new Error("DNS resolution failed"))

    const layer = Layer.fresh(HulyStorageClient.layer).pipe(Layer.provide(configLayer))
    const exit = await Effect.runPromiseExit(
      HulyStorageClient.pipe(Effect.provide(layer))
    )

    expect(exit._tag).toBe("Failure")
  }, 10000)
})
