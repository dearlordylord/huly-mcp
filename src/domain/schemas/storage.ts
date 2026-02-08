import { Schema } from "effect"

import { BlobId, makeJsonSchema, MimeType, NonEmptyString } from "./shared.js"

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
  blobId: BlobId.annotations({
    description: "The blob ID for referencing the uploaded file"
  }),
  contentType: Schema.String.annotations({
    description: "Content type of the uploaded file"
  }),
  size: Schema.Number.pipe(Schema.int(), Schema.nonNegative()).annotations({
    description: "Size of the uploaded file in bytes"
  }),
  url: Schema.String.annotations({
    description: "URL to access the uploaded file"
  })
}).annotations({
  title: "UploadFileResult",
  description: "Result of a file upload operation"
})

export type UploadFileResult = Schema.Schema.Type<typeof UploadFileResultSchema>

export const uploadFileParamsJsonSchema = makeJsonSchema(UploadFileParamsSchema)

export const parseUploadFileParams = Schema.decodeUnknown(UploadFileParamsSchema)
