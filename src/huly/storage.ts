/**
 * Storage client for file uploads to Huly.
 *
 * Provides Effect-based wrapper around @hcengineering/api-client StorageClient.
 *
 * @module
 */
import * as fs from "node:fs/promises"
import * as path from "node:path"

import { type AuthOptions, type StorageClient } from "@hcengineering/api-client"
import type { Blob, Ref, WorkspaceUuid } from "@hcengineering/core"
import { Context, Effect, Layer } from "effect"

import { HulyConfigService } from "../config/config.js"
import { concatLink } from "../utils/url.js"
import { authToOptions, connectWithRetry } from "./client.js"
import type { FileFetchError, HulyAuthError, HulyConnectionError } from "./errors.js"
import {
  FileNotFoundError,
  FileTooLargeError,
  FileUploadError,
  InvalidContentTypeError,
  InvalidFileDataError,
  MAX_FILE_SIZE
} from "./errors.js"
import { toRef } from "./operations/sdk-boundary.js"
import { HulySdk, type HulySdkDependencies } from "./sdk-deps.js"
import { fetchFromUrl } from "./url-fetch.js"

const ALLOWED_CONTENT_TYPES = new Set([
  // Images
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "image/bmp",
  "image/tiff",
  // Documents
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
  "text/markdown",
  "text/html",
  // Archives
  "application/zip",
  "application/x-tar",
  "application/gzip",
  "application/x-7z-compressed",
  "application/x-rar-compressed",
  // Media
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  // Code/data
  "application/json",
  "application/xml",
  "text/xml",
  "application/javascript",
  // Generic
  "application/octet-stream"
])

export const validateFileSize = (
  buffer: Buffer,
  filename: string
): Effect.Effect<void, FileTooLargeError> =>
  buffer.length > MAX_FILE_SIZE
    ? Effect.fail(new FileTooLargeError({ filename, size: buffer.length, maxSize: MAX_FILE_SIZE }))
    : Effect.void

export const validateContentType = (
  contentType: string,
  filename: string
): Effect.Effect<void, InvalidContentTypeError> =>
  ALLOWED_CONTENT_TYPES.has(contentType)
    ? Effect.void
    : Effect.fail(new InvalidContentTypeError({ filename, contentType }))

export type FileSourceParams =
  | { readonly _tag: "filePath"; readonly filePath: string }
  | { readonly _tag: "fileUrl"; readonly fileUrl: string }
  | { readonly _tag: "base64"; readonly data: string }

export const getBufferFromParams = (
  params: FileSourceParams
): Effect.Effect<Buffer, InvalidFileDataError | FileNotFoundError | FileFetchError> => {
  switch (params._tag) {
    case "filePath":
      return readFromFilePath(params.filePath)
    case "fileUrl":
      return fetchFromUrl(params.fileUrl)
    case "base64":
      return decodeBase64(params.data)
  }
}

export type StorageClientError =
  | HulyConnectionError
  | HulyAuthError
  | FileUploadError
  | InvalidFileDataError
  | FileNotFoundError
  | FileFetchError

/**
 * Internal storage-adapter payload. This is not a serialized/tool boundary DTO:
 * downstream Huly operations need the SDK's Ref<Blob> type before mapping to
 * their own schema-owned MCP payloads.
 */
export interface UploadFileResult {
  /** The blob reference for attaching to documents */
  readonly blobId: Ref<Blob>
  /** Content type of the uploaded file */
  readonly contentType: string
  /** Size in bytes */
  readonly size: number
  /** URL to access the file */
  readonly url: string
}

/**
 * Operations exposed by the storage service.
 */
export interface HulyStorageOperations {
  /**
   * Upload a file to Huly storage.
   *
   * @param filename - Name of the file (used for blob ID generation)
   * @param data - File contents as Buffer
   * @param contentType - MIME type (e.g., "image/png")
   * @returns Upload result with blob ID and URL
   */
  readonly uploadFile: (
    filename: string,
    data: Buffer,
    contentType: string
  ) => Effect.Effect<UploadFileResult, StorageClientError>

  /**
   * Construct the URL for accessing a blob.
   *
   * @param blobId - The blob ID
   * @returns Full URL to access the file
   */
  readonly getFileUrl: (blobId: string) => string
}

export class HulyStorageClient extends Context.Tag("@hulymcp/HulyStorageClient")<
  HulyStorageClient,
  HulyStorageOperations
>() {
  static readonly layerWithDependencies: Layer.Layer<
    HulyStorageClient,
    StorageClientError,
    HulyConfigService | HulySdk
  > = Layer.scoped(
    HulyStorageClient,
    Effect.gen(function*() {
      const config = yield* HulyConfigService
      const sdk = yield* HulySdk

      const authOptions = authToOptions(config.auth, config.workspace)

      const { baseUrl, storageClient, workspaceId } = yield* connectStorageWithRetry({
        url: config.url,
        ...authOptions
      }, sdk)

      const operations: HulyStorageOperations = {
        uploadFile: (filename, data, contentType) =>
          Effect.tryPromise({
            try: async () => {
              const blob = await storageClient.put(filename, data, contentType, data.length)
              return {
                blobId: blob._id,
                contentType: blob.contentType,
                size: blob.size,
                url: buildFileUrl(baseUrl, workspaceId, blob._id)
              }
            },
            catch: (e) =>
              new FileUploadError({
                message: `File upload failed: ${String(e)}`,
                cause: e
              })
          }),

        getFileUrl: (blobId) => buildFileUrl(baseUrl, workspaceId, blobId)
      }

      return operations
    })
  )

  static readonly layer: Layer.Layer<
    HulyStorageClient,
    StorageClientError,
    HulyConfigService
  > = HulyStorageClient.layerWithDependencies.pipe(Layer.provide(HulySdk.defaultLayer))

  /**
   * Create a test layer for unit testing.
   */
  static testLayer(
    mockOperations: Partial<HulyStorageOperations>
  ): Layer.Layer<HulyStorageClient> {
    const noopUploadFile = (): Effect.Effect<
      UploadFileResult,
      StorageClientError
    > =>
      Effect.succeed({
        blobId: toRef<Blob>("test-blob-id"),
        contentType: "application/octet-stream",
        size: 0,
        url: "https://test.huly.io/files?workspace=test&file=test-blob-id"
      })

    const noopGetFileUrl = (blobId: string): string => `https://test.huly.io/files?workspace=test&file=${blobId}`

    const defaultOps: HulyStorageOperations = {
      uploadFile: noopUploadFile,
      getFileUrl: noopGetFileUrl
    }

    return Layer.succeed(HulyStorageClient, { ...defaultOps, ...mockOperations })
  }
}

// --- Internal Helpers ---

const isErrnoException = (e: unknown): e is NodeJS.ErrnoException => e instanceof Error && "code" in e

type StorageConnectionConfig = {
  url: string
} & AuthOptions

interface StorageConnection {
  storageClient: StorageClient
  workspaceId: WorkspaceUuid
  baseUrl: string
}

const buildFileUrl = (baseUrl: string, workspaceId: WorkspaceUuid, blobId: string): string => {
  const params = new URLSearchParams({ workspace: workspaceId, file: blobId })
  return `${concatLink(baseUrl, "/files")}?${params.toString()}`
}

const connectStorageClient = async (
  config: StorageConnectionConfig,
  sdk: HulySdkDependencies
): Promise<StorageConnection> => {
  // Use the same authentication flow as HulyClient to get workspace token
  const { url, ...authOptions } = config
  const serverConfig = await sdk.loadServerConfig(url)
  const { token, workspaceId } = await sdk.getWorkspaceToken(
    url,
    authOptions,
    serverConfig
  )

  // Construct URLs for file operations
  const filesUrl = concatLink(url, `/files`)
  const uploadUrl = concatLink(url, serverConfig.UPLOAD_URL)

  // Create storage client with proper authentication
  const storageClient: StorageClient = sdk.createStorageClient(
    filesUrl,
    uploadUrl,
    token,
    workspaceId
  )

  return {
    baseUrl: url,
    storageClient,
    workspaceId
  }
}

const connectStorageWithRetry = (
  config: StorageConnectionConfig,
  sdk: HulySdkDependencies
): Effect.Effect<StorageConnection, StorageClientError> =>
  connectWithRetry(() => connectStorageClient(config, sdk), "Storage connection failed")

/**
 * Decode base64 data to Buffer with validation.
 */
export const decodeBase64 = (
  base64Data: string
): Effect.Effect<Buffer, InvalidFileDataError> =>
  Effect.try({
    try: () => {
      const dataUrlMatch = base64Data.match(
        /^data:(?:[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+)?(?:;[A-Za-z0-9!#$&^_.+-]+=[^,;\s]+)*;base64,(.+)$/s
      )
      if (base64Data.includes(",") && dataUrlMatch === null) {
        throw new Error("Malformed data URL")
      }

      const base64Clean = dataUrlMatch?.[1] ?? base64Data
      const normalizedInput = base64Clean.replace(/[\r\n\s]/g, "")

      if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}(?:==)?|[A-Za-z0-9+/]{3}=?)?$/.test(normalizedInput)) {
        throw new Error("Invalid base64 encoding")
      }

      const buffer = Buffer.from(base64Clean, "base64")

      // Validate the buffer is not empty and is valid base64
      if (buffer.length === 0) {
        throw new Error("Empty buffer after decoding")
      }

      return buffer
    },
    catch: (e) =>
      new InvalidFileDataError({
        message: `Invalid base64 data: ${String(e)}`
      })
  })

/**
 * Read file from local filesystem.
 */
export const readFromFilePath = (
  filePath: string
): Effect.Effect<Buffer, FileNotFoundError | InvalidFileDataError> =>
  Effect.tryPromise({
    try: () => fs.readFile(path.resolve(filePath)),
    catch: (e) => {
      if (isErrnoException(e) && e.code === "ENOENT") {
        return new FileNotFoundError({ filePath })
      }
      return new InvalidFileDataError({
        message: `Failed to read file ${filePath}: ${String(e)}`
      })
    }
  })

export { fetchFromUrl, isBlockedUrl } from "./url-fetch.js"
