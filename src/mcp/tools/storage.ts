import { parseUploadFileParams, uploadFileParamsJsonSchema } from "../../domain/schemas.js"
import { uploadFile } from "../../huly/operations/storage.js"
import { createStorageToolHandler, type RegisteredTool } from "./registry.js"

const CATEGORY = "storage" as const

export const storageTools: ReadonlyArray<RegisteredTool> = [
  {
    name: "upload_file",
    description:
      "Upload a file to Huly storage. Provide ONE of: filePath (local file - preferred), fileUrl (fetch from URL), or data (base64 - for small files only). Returns blob ID and URL for referencing the file.",
    category: CATEGORY,
    inputSchema: uploadFileParamsJsonSchema,
    handler: createStorageToolHandler(
      "upload_file",
      parseUploadFileParams,
      uploadFile
    )
  }
]
