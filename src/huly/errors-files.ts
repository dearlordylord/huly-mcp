/**
 * File/storage domain errors.
 *
 * @module
 */
import { Schema } from "effect"

export const BYTES_PER_MB = 1024 * 1024
export const MAX_FILE_SIZE_MB = 100
export const MAX_FILE_SIZE = MAX_FILE_SIZE_MB * BYTES_PER_MB

// File/storage errors can originate before MCP parameter decoding or while
// handling external filesystem/HTTP inputs, so payloads stay raw primitives
// rather than domain brands that imply successful validation.
const RawErrorMessage = Schema.String
const RawFilePath = Schema.String
const RawFileUrl = Schema.String
const RawFileFetchReason = Schema.String
const RawAttachmentIdentifier = Schema.String
const RawDrawingIdentifier = Schema.String
const RawFilename = Schema.String
const RawMimeType = Schema.String
const RawByteCount = Schema.Number

/**
 * File upload error - storage operation failed.
 */
export class FileUploadError extends Schema.TaggedError<FileUploadError>()(
  "FileUploadError",
  {
    message: RawErrorMessage,
    cause: Schema.optional(Schema.Defect)
  }
) {}

/**
 * Invalid file data error - e.g., malformed base64.
 */
export class InvalidFileDataError extends Schema.TaggedError<InvalidFileDataError>()(
  "InvalidFileDataError",
  {
    message: RawErrorMessage
  }
) {}

/**
 * File not found at specified path.
 */
export class FileNotFoundError extends Schema.TaggedError<FileNotFoundError>()(
  "FileNotFoundError",
  {
    filePath: RawFilePath
  }
) {
  override get message(): string {
    return `File not found: ${this.filePath}`
  }
}

/**
 * Failed to fetch file from URL.
 */
export class FileFetchError extends Schema.TaggedError<FileFetchError>()(
  "FileFetchError",
  {
    fileUrl: RawFileUrl,
    reason: RawFileFetchReason
  }
) {
  override get message(): string {
    return `Failed to fetch file from ${this.fileUrl}: ${this.reason}`
  }
}

/**
 * Attachment not found.
 */
export class AttachmentNotFoundError extends Schema.TaggedError<AttachmentNotFoundError>()(
  "AttachmentNotFoundError",
  {
    attachmentId: RawAttachmentIdentifier
  }
) {
  override get message(): string {
    return `Attachment '${this.attachmentId}' not found`
  }
}

export class SavedAttachmentNotFoundError extends Schema.TaggedError<SavedAttachmentNotFoundError>()(
  "SavedAttachmentNotFoundError",
  {
    attachmentId: RawAttachmentIdentifier
  }
) {
  override get message(): string {
    return `Saved attachment for '${this.attachmentId}' not found`
  }
}

export class DrawingNotFoundError extends Schema.TaggedError<DrawingNotFoundError>()(
  "DrawingNotFoundError",
  {
    drawingId: RawDrawingIdentifier
  }
) {
  override get message(): string {
    return `Drawing '${this.drawingId}' not found`
  }
}

/**
 * File size exceeds maximum allowed.
 */
export class FileTooLargeError extends Schema.TaggedError<FileTooLargeError>()(
  "FileTooLargeError",
  {
    filename: RawFilename,
    size: RawByteCount,
    maxSize: RawByteCount
  }
) {
  override get message(): string {
    const DECIMAL_PLACES = 2
    const sizeMB = (this.size / BYTES_PER_MB).toFixed(DECIMAL_PLACES)
    const maxMB = (this.maxSize / BYTES_PER_MB).toFixed(0)
    return `File '${this.filename}' is too large (${sizeMB}MB). Maximum allowed: ${maxMB}MB`
  }
}

/**
 * Invalid content type for file upload.
 */
export class InvalidContentTypeError extends Schema.TaggedError<InvalidContentTypeError>()(
  "InvalidContentTypeError",
  {
    filename: RawFilename,
    contentType: RawMimeType
  }
) {
  override get message(): string {
    return `Invalid content type '${this.contentType}' for file '${this.filename}'`
  }
}
