import type { AttachedData, Blob, Ref } from "@hcengineering/core"

import type { UploadDriveFileParams, UploadDriveFileVersionParams } from "../../domain/schemas/drive.js"
import type { FileVersion } from "../drive-sdk.js"
import type { FileSourceParams } from "../storage.js"

export const uploadSource = (params: UploadDriveFileParams | UploadDriveFileVersionParams): FileSourceParams => {
  if (params.filePath !== undefined) return { _tag: "filePath", filePath: params.filePath }
  if (params.fileUrl !== undefined) return { _tag: "fileUrl", fileUrl: params.fileUrl }
  return { _tag: "base64", data: params.data ?? "" }
}

export const makeFileVersionData = (
  title: string,
  blobId: Ref<Blob>,
  size: number,
  contentType: string,
  lastModified: number,
  version: number
): AttachedData<FileVersion> => ({
  title,
  file: blobId,
  size,
  type: contentType,
  lastModified,
  metadata: {},
  version
})
