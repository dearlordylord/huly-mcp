import { JSONSchema, Schema } from "effect"

import { BlobId, MimeType, NonEmptyString } from "./shared.js"

const UploadFileParamsBase = Schema.Struct({
  filename: NonEmptyString.annotations({
    description: "Name of the file (e.g., 'screenshot.png')"
  }),
  contentType: MimeType.annotations({
    description: "MIME type of the file (e.g., 'image/png', 'application/pdf')"
  }),
  filePath: Schema.optional(Schema.String.annotations({
    description: "Local file path to upload (preferred - avoids context flooding)"
  })),
  fileUrl: Schema.optional(Schema.String.annotations({
    description: "URL to fetch file from (for remote files)"
  })),
  data: Schema.optional(Schema.String.annotations({
    description: "Base64-encoded file data (fallback for small files <10KB)"
  }))
})

export const UploadFileParamsSchema = UploadFileParamsBase.pipe(
  Schema.filter((params) => {
    const hasSource = params.filePath || params.fileUrl || params.data
    return hasSource ? true : "Must provide filePath, fileUrl, or data"
  })
).annotations({
  title: "UploadFileParams",
  description:
    "Parameters for uploading a file. Provide ONE of: filePath (local file), fileUrl (remote URL), or data (base64, for small files only)"
})

export type UploadFileParams = Schema.Schema.Type<typeof UploadFileParamsSchema>
export const UploadFileResultSchema = Schema.Struct({
  blobId: BlobId,
  contentType: Schema.String,
  size: Schema.Number,
  url: Schema.String
})
export type UploadFileResult = Schema.Schema.Type<typeof UploadFileResultSchema>

export const uploadFileParamsJsonSchema = JSONSchema.make(UploadFileParamsSchema)

export const parseUploadFileParams = Schema.decodeUnknown(UploadFileParamsSchema)
