import { JSONSchema, Schema } from "effect"

import { ActivityMessageWireSchema } from "./activity.js"
import { CommentSchema } from "./comments.js"
import { DriveIdentifier, DriveItemId, DriveItemSummarySchema, DrivePath } from "./drive.js"
import {
  CommentId,
  Count,
  DEFAULT_LIMIT,
  hasAtLeastOneDefined,
  hasMutuallyExclusiveFields,
  LimitParam,
  mutuallyExclusiveFieldsMessage,
  NonEmptyString,
  withAtLeastOneRequired,
  withMutuallyExclusiveFields
} from "./shared.js"

const DriveFileLocatorFields = {
  filePath: Schema.optional(DrivePath.annotations({
    description: "Exact Drive file path, such as '/Specs/API.md'. Mutually exclusive with fileId."
  })),
  fileId: Schema.optional(DriveItemId.annotations({
    description: "Exact Drive file id. Mutually exclusive with filePath."
  }))
} as const

const requireOneDriveFileLocator = (params: {
  readonly filePath?: unknown
  readonly fileId?: unknown
}) => hasAtLeastOneDefined(params, ["filePath", "fileId"]) || "Provide filePath or fileId."

const requireExclusiveDriveFileLocator = (params: {
  readonly filePath?: unknown
  readonly fileId?: unknown
}) =>
  !hasMutuallyExclusiveFields(params, ["filePath", "fileId"]) || mutuallyExclusiveFieldsMessage([
    "filePath",
    "fileId"
  ])

const DriveFileCommentTargetSchema = Schema.Struct({
  drive: DriveIdentifier,
  ...DriveFileLocatorFields
}).pipe(
  Schema.filter(requireOneDriveFileLocator),
  Schema.filter(requireExclusiveDriveFileLocator)
)

export const ListDriveFileCommentsParamsSchema = Schema.Struct({
  drive: DriveIdentifier,
  ...DriveFileLocatorFields,
  limit: Schema.optional(LimitParam.annotations({
    description: `Maximum number of comments to return (default: ${DEFAULT_LIMIT}).`
  }))
}).pipe(
  Schema.filter(requireOneDriveFileLocator),
  Schema.filter(requireExclusiveDriveFileLocator)
)
export type ListDriveFileCommentsParams = Schema.Schema.Type<typeof ListDriveFileCommentsParamsSchema>

export const AddDriveFileCommentParamsSchema = Schema.Struct({
  drive: DriveIdentifier,
  ...DriveFileLocatorFields,
  body: NonEmptyString.annotations({
    description: "Comment body. Markdown is supported."
  })
}).pipe(
  Schema.filter(requireOneDriveFileLocator),
  Schema.filter(requireExclusiveDriveFileLocator)
)
export type AddDriveFileCommentParams = Schema.Schema.Type<typeof AddDriveFileCommentParamsSchema>

export const UpdateDriveFileCommentParamsSchema = Schema.Struct({
  drive: DriveIdentifier,
  ...DriveFileLocatorFields,
  commentId: CommentId.annotations({
    description: "Drive file comment id to update."
  }),
  body: NonEmptyString.annotations({
    description: "New comment body. Markdown is supported."
  })
}).pipe(
  Schema.filter(requireOneDriveFileLocator),
  Schema.filter(requireExclusiveDriveFileLocator)
)
export type UpdateDriveFileCommentParams = Schema.Schema.Type<typeof UpdateDriveFileCommentParamsSchema>

export const DeleteDriveFileCommentParamsSchema = Schema.Struct({
  drive: DriveIdentifier,
  ...DriveFileLocatorFields,
  commentId: CommentId.annotations({
    description: "Drive file comment id to permanently delete."
  })
}).pipe(
  Schema.filter(requireOneDriveFileLocator),
  Schema.filter(requireExclusiveDriveFileLocator)
)
export type DeleteDriveFileCommentParams = Schema.Schema.Type<typeof DeleteDriveFileCommentParamsSchema>

export const ListDriveFileActivityParamsSchema = Schema.Struct({
  drive: DriveIdentifier,
  ...DriveFileLocatorFields,
  limit: Schema.optional(LimitParam.annotations({
    description: `Maximum number of activity messages to return (default: ${DEFAULT_LIMIT}).`
  }))
}).pipe(
  Schema.filter(requireOneDriveFileLocator),
  Schema.filter(requireExclusiveDriveFileLocator)
)
export type ListDriveFileActivityParams = Schema.Schema.Type<typeof ListDriveFileActivityParamsSchema>

export const ListDriveFileCommentsResultSchema = Schema.Struct({
  file: DriveItemSummarySchema,
  comments: Schema.Array(CommentSchema),
  total: Count
})
export type ListDriveFileCommentsResult = Schema.Schema.Type<typeof ListDriveFileCommentsResultSchema>

export const AddDriveFileCommentResultSchema = Schema.Struct({
  file: DriveItemSummarySchema,
  commentId: CommentId
})
export type AddDriveFileCommentResult = Schema.Schema.Type<typeof AddDriveFileCommentResultSchema>

export const UpdateDriveFileCommentResultSchema = Schema.Struct({
  file: DriveItemSummarySchema,
  commentId: CommentId,
  updated: Schema.Boolean
})
export type UpdateDriveFileCommentResult = Schema.Schema.Type<typeof UpdateDriveFileCommentResultSchema>

export const DeleteDriveFileCommentResultSchema = Schema.Struct({
  file: DriveItemSummarySchema,
  commentId: CommentId,
  deleted: Schema.Boolean
})
export type DeleteDriveFileCommentResult = Schema.Schema.Type<typeof DeleteDriveFileCommentResultSchema>

export const ListDriveFileActivityResultSchema = Schema.Struct({
  file: DriveItemSummarySchema,
  activity: Schema.Array(ActivityMessageWireSchema),
  total: Count
})
export type ListDriveFileActivityResult = Schema.Schema.Type<typeof ListDriveFileActivityResultSchema>

export const listDriveFileCommentsParamsJsonSchema = withAtLeastOneRequired(
  withMutuallyExclusiveFields(JSONSchema.make(ListDriveFileCommentsParamsSchema), ["filePath", "fileId"]),
  ["filePath", "fileId"]
)
export const addDriveFileCommentParamsJsonSchema = withAtLeastOneRequired(
  withMutuallyExclusiveFields(JSONSchema.make(AddDriveFileCommentParamsSchema), ["filePath", "fileId"]),
  ["filePath", "fileId"]
)
export const updateDriveFileCommentParamsJsonSchema = withAtLeastOneRequired(
  withMutuallyExclusiveFields(JSONSchema.make(UpdateDriveFileCommentParamsSchema), ["filePath", "fileId"]),
  ["filePath", "fileId"]
)
export const deleteDriveFileCommentParamsJsonSchema = withAtLeastOneRequired(
  withMutuallyExclusiveFields(JSONSchema.make(DeleteDriveFileCommentParamsSchema), ["filePath", "fileId"]),
  ["filePath", "fileId"]
)
export const listDriveFileActivityParamsJsonSchema = withAtLeastOneRequired(
  withMutuallyExclusiveFields(JSONSchema.make(ListDriveFileActivityParamsSchema), ["filePath", "fileId"]),
  ["filePath", "fileId"]
)

export const parseDriveFileCommentTarget = Schema.decodeUnknown(DriveFileCommentTargetSchema)
export const parseListDriveFileCommentsParams = Schema.decodeUnknown(ListDriveFileCommentsParamsSchema)
export const parseAddDriveFileCommentParams = Schema.decodeUnknown(AddDriveFileCommentParamsSchema)
export const parseUpdateDriveFileCommentParams = Schema.decodeUnknown(UpdateDriveFileCommentParamsSchema)
export const parseDeleteDriveFileCommentParams = Schema.decodeUnknown(DeleteDriveFileCommentParamsSchema)
export const parseListDriveFileActivityParams = Schema.decodeUnknown(ListDriveFileActivityParamsSchema)
