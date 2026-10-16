import {
  parseUploadFileParams,
  uploadFileParamsJsonSchema,
  UploadFileResultSchema
} from "../../domain/schemas/storage.js"
import { UPLOAD_SOURCE_SEMANTICS } from "../../domain/schemas/upload-source.js"
import { uploadFile } from "../../huly/operations/storage.js"
import { defineStorageTool, type RegisteredTool } from "./registry.js"

const CATEGORY = "storage" as const

export const storageTools = [
  defineStorageTool(
    {
      name: "upload_file",
      description: `Upload a file to Huly storage. Provide one source: ${UPLOAD_SOURCE_SEMANTICS} Returns the blob ID and URL.`,
      category: CATEGORY,
      inputSchema: uploadFileParamsJsonSchema,
      resultSchema: UploadFileResultSchema
    },
    parseUploadFileParams,
    uploadFile
  )
] as const satisfies ReadonlyArray<RegisteredTool>
