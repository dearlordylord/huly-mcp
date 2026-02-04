/**
 * Storage client for file uploads to Huly.
 *
 * Provides Effect-based wrapper around @hcengineering/api-client StorageClient.
 *
 * @module
 */
import * as fs from "node:fs/promises"
import * as path from "node:path"

import {
  type AuthOptions,
  createStorageClient,
  getWorkspaceToken,
  loadServerConfig,
  type StorageClient
} from "@hcengineering/api-client"
import type { WorkspaceUuid } from "@hcengineering/core"
import { Context, Effect, Layer, Schedule } from "effect"

import { HulyConfigService } from "../config/config.js"
import { authToOptions } from "./auth-utils.js"
import {
  FileFetchError,
  FileNotFoundError,
  FileUploadError,
  FileTooLargeError,
  HulyAuthError,
  HulyConnectionError,
  InvalidContentTypeError,
  InvalidFileDataError
} from "./errors.js"

export const MAX_FILE_SIZE = 100 * 1024 * 1024 // 100MB

export const ALLOWED_CONTENT_TYPES = new Set([
  // Images
  "image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml", "image/bmp", "image/tiff",
  // Documents
  "application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain", "text/csv", "text/markdown", "text/html",
  // Archives
  "application/zip", "application/x-tar", "application/gzip", "application/x-7z-compressed", "application/x-rar-compressed",
  // Media
  "audio/mpeg", "audio/wav", "audio/ogg", "video/mp4", "video/webm", "video/quicktime",
  // Code/data
  "application/json", "application/xml", "text/xml", "application/javascript",
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

export interface FileSourceParams {
  filePath?: string
  fileUrl?: string
  data?: string
}

export const getBufferFromParams = (
  params: FileSourceParams
): Effect.Effect<Buffer, InvalidFileDataError | FileNotFoundError | FileFetchError> =>
  params.filePath
    ? readFromFilePath(params.filePath)
    : params.fileUrl
    ? fetchFromUrl(params.fileUrl)
    : decodeBase64(params.data!)

export type StorageClientError =
  | HulyConnectionError
  | HulyAuthError
  | FileUploadError
  | InvalidFileDataError
  | FileNotFoundError
  | FileFetchError

/**
 * Result of a file upload operation.
 */
export interface UploadFileResult {
  /** The blob ID for referencing the file */
  readonly blobId: string
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
  static readonly layer: Layer.Layer<
    HulyStorageClient,
    StorageClientError,
    HulyConfigService
  > = Layer.scoped(
    HulyStorageClient,
    Effect.gen(function*() {
      const config = yield* HulyConfigService

      const authOptions = authToOptions(config.auth, config.workspace)

      const { baseUrl, storageClient, workspaceId } = yield* connectStorageWithRetry({
        url: config.url,
        ...authOptions
      })

      const operations: HulyStorageOperations = {
        uploadFile: (filename, data, contentType) =>
          Effect.tryPromise({
            try: async () => {
              const blob = await storageClient.put(filename, data, contentType, data.length)
              return {
                blobId: blob._id as string,
                contentType: blob.contentType,
                size: blob.size,
                url: buildFileUrl(baseUrl, workspaceId, blob._id as string)
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
        blobId: "test-blob-id",
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

type StorageConnectionConfig = {
  url: string
} & AuthOptions

interface StorageConnection {
  storageClient: StorageClient
  workspaceId: WorkspaceUuid
  baseUrl: string
}

const buildFileUrl = (baseUrl: string, workspaceId: WorkspaceUuid, blobId: string): string => {
  const trimmedUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl
  return `${trimmedUrl}/files?workspace=${workspaceId}&file=${blobId}`
}

const isAuthError = (error: unknown): boolean => {
  const msg = String(error).toLowerCase()
  return (
    msg.includes("unauthorized")
    || msg.includes("authentication")
    || msg.includes("auth")
    || msg.includes("credentials")
    || msg.includes("401")
    || msg.includes("invalid password")
    || msg.includes("invalid email")
    || msg.includes("login failed")
  )
}

/**
 * Construct the files URL for the server.
 */
const concatLink = (host: string, path: string): string => {
  const trimmedHost = host.endsWith("/") ? host.slice(0, -1) : host
  const trimmedPath = path.startsWith("/") ? path : `/${path}`
  return `${trimmedHost}${trimmedPath}`
}

const connectStorageClient = async (
  config: StorageConnectionConfig
): Promise<StorageConnection> => {
  // Use the same authentication flow as HulyClient to get workspace token
  const { url, ...authOptions } = config
  const serverConfig = await loadServerConfig(url)
  const { token, workspaceId } = await getWorkspaceToken(
    url,
    authOptions,
    serverConfig
  )

  // Construct URLs for file operations
  const filesUrl = concatLink(url, `/files`)
  const uploadUrl = concatLink(url, serverConfig.UPLOAD_URL ?? "/upload")

  // Create storage client with proper authentication
  const storageClient: StorageClient = createStorageClient(
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
  config: StorageConnectionConfig
): Effect.Effect<StorageConnection, StorageClientError> => {
  const attemptConnect: Effect.Effect<StorageConnection, StorageClientError> = Effect.tryPromise({
    try: () => connectStorageClient(config),
    catch: (e) => {
      if (isAuthError(e)) {
        return new HulyAuthError({
          message: `Storage authentication failed: ${String(e)}`
        })
      }
      return new HulyConnectionError({
        message: `Storage connection failed: ${String(e)}`,
        cause: e
      })
    }
  })

  const retrySchedule = Schedule.exponential("100 millis").pipe(
    Schedule.compose(Schedule.recurs(2))
  )

  return attemptConnect.pipe(
    Effect.retry({
      schedule: retrySchedule,
      while: (e) => !(e instanceof HulyAuthError)
    })
  )
}

/**
 * Decode base64 data to Buffer with validation.
 */
export const decodeBase64 = (
  base64Data: string
): Effect.Effect<Buffer, InvalidFileDataError> =>
  Effect.try({
    try: () => {
      // Remove data URL prefix if present (e.g., "data:image/png;base64,")
      const base64Clean = base64Data.includes(",")
        ? base64Data.split(",")[1]
        : base64Data

      const buffer = Buffer.from(base64Clean, "base64")

      // Validate the buffer is not empty and is valid base64
      if (buffer.length === 0) {
        throw new Error("Empty buffer after decoding")
      }

      // Check if the base64 decoding was successful
      // If the input was not valid base64, Buffer.from returns an empty buffer or garbage
      const reEncoded = buffer.toString("base64")
      const normalizedInput = base64Clean.replace(/[\r\n\s]/g, "")
      const normalizedOutput = reEncoded.replace(/[\r\n\s]/g, "")

      // Allow for padding differences
      const inputNoPad = normalizedInput.replace(/=/g, "")
      const outputNoPad = normalizedOutput.replace(/=/g, "")

      if (inputNoPad !== outputNoPad) {
        throw new Error("Invalid base64 encoding")
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
      const err = e as NodeJS.ErrnoException
      if (err.code === "ENOENT") {
        return new FileNotFoundError({ filePath })
      }
      return new InvalidFileDataError({
        message: `Failed to read file ${filePath}: ${String(e)}`
      })
    }
  })

/** Fetch timeout in milliseconds */
const FETCH_TIMEOUT_MS = 30_000

/**
 * Check if URL points to a potentially dangerous internal address.
 * Blocks: localhost, private IPs, link-local, cloud metadata endpoints.
 */
export const isBlockedUrl = (urlString: string): boolean => {
  try {
    const url = new URL(urlString)
    const hostname = url.hostname.toLowerCase()

    // Block cloud metadata endpoints
    if (hostname === "metadata.google.internal") {
      return true
    }

    // Block localhost variants (IPv6 has brackets in URL hostname)
    if (hostname === "localhost" || hostname === "::1" || hostname === "[::1]") {
      return true
    }

    // Check IPv4 addresses
    const ipMatch = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/)
    if (ipMatch) {
      const [a, b] = [Number(ipMatch[1]), Number(ipMatch[2])]

      // 127.x.x.x (loopback)
      if (a === 127) return true

      // 10.x.x.x (private)
      if (a === 10) return true

      // 172.16-31.x.x (private)
      if (a === 172 && b >= 16 && b <= 31) return true

      // 192.168.x.x (private)
      if (a === 192 && b === 168) return true

      // 169.254.x.x (link-local, includes metadata endpoint)
      if (a === 169 && b === 254) return true
    }

    return false
  } catch {
    return true // Invalid URL
  }
}

/**
 * Fetch file from URL.
 * Includes timeout, SSRF protection, and redirect blocking.
 */
export const fetchFromUrl = (
  fileUrl: string
): Effect.Effect<Buffer, FileFetchError> =>
  Effect.tryPromise({
    try: async () => {
      if (isBlockedUrl(fileUrl)) {
        throw new Error("URL blocked: internal/private addresses not allowed")
      }

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

      try {
        const response = await fetch(fileUrl, {
          signal: controller.signal,
          redirect: "error" // Prevent redirect-based SSRF
        })
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }
        const arrayBuffer = await response.arrayBuffer()
        return Buffer.from(arrayBuffer)
      } finally {
        clearTimeout(timeout)
      }
    },
    catch: (e) =>
      new FileFetchError({
        fileUrl,
        reason: String(e)
      })
  })
