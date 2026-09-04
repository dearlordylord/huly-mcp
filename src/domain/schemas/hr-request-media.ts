import { Schema } from "effect"

import { AttachmentWireSchema, AttachmentSummaryWireSchema, UPDATE_ATTACHMENT_FIELDS } from "./attachments.js"
import { AttachmentDescription, AttachmentFileName, Base64FileData, LocalFilePath } from "./domain-values.js"
import { toDraft07JsonSchema, withExactlyOneRequired, withJsonSchemaPropertyDescriptions } from "./json-schema.js"
import { CommentSchema } from "./comments.js"
import {
  AttachmentId,
  BlobId,
  CommentId,
  Count,
  DEFAULT_LIMIT,
  LimitParam,
  MimeType,
  NonEmptyString,
  UrlString,
  hasAtLeastOneDefined,
  withAtLeastOneRequired
} from "./shared.js"
import { HrRequestId } from "./hr-requests.js"

const RequestTarget = { request: HrRequestId.annotate({ description: "Exact HR request ID." }) } as const
const ListParamsSchema = Schema.Struct({ ...RequestTarget, limit: Schema.optional(LimitParam) })
const CommentIdField = {
  commentId: CommentId.annotate({ description: "Comment ID belonging directly to the HR request." })
} as const
export const ListHrRequestCommentsParamsSchema = ListParamsSchema
export const AddHrRequestCommentParamsSchema = Schema.Struct({ ...RequestTarget, body: NonEmptyString })
export const UpdateHrRequestCommentParamsSchema = Schema.Struct({
  ...RequestTarget,
  ...CommentIdField,
  body: NonEmptyString
})
export const DeleteHrRequestCommentParamsSchema = Schema.Struct({ ...RequestTarget, ...CommentIdField })
export type ListHrRequestCommentsParams = Schema.Schema.Type<typeof ListHrRequestCommentsParamsSchema>
export type AddHrRequestCommentParams = Schema.Schema.Type<typeof AddHrRequestCommentParamsSchema>
export type UpdateHrRequestCommentParams = Schema.Schema.Type<typeof UpdateHrRequestCommentParamsSchema>
export type DeleteHrRequestCommentParams = Schema.Schema.Type<typeof DeleteHrRequestCommentParamsSchema>

const commentResultBase = { request: HrRequestId } as const
export const ListHrRequestCommentsResultSchema = Schema.Struct({
  ...commentResultBase,
  comments: Schema.Array(CommentSchema),
  total: Count,
  truncated: Schema.Boolean,
  continuationUnsupportedReason: Schema.optionalKey(Schema.String)
})
export const AddHrRequestCommentResultSchema = Schema.Struct({ ...commentResultBase, commentId: CommentId })
export const UpdateHrRequestCommentResultSchema = Schema.Struct({
  ...commentResultBase,
  commentId: CommentId,
  updated: Schema.Boolean
})
export const DeleteHrRequestCommentResultSchema = Schema.Struct({
  ...commentResultBase,
  commentId: CommentId,
  deleted: Schema.Boolean
})

const AttachmentIdField = {
  attachmentId: AttachmentId.annotate({ description: "Attachment ID belonging directly to the HR request." })
} as const
export const ListHrRequestAttachmentsParamsSchema = ListParamsSchema
export const GetHrRequestAttachmentParamsSchema = Schema.Struct({ ...RequestTarget, ...AttachmentIdField })
const fileFields = {
  filename: AttachmentFileName,
  contentType: MimeType,
  filePath: Schema.optional(LocalFilePath),
  fileUrl: Schema.optional(UrlString),
  data: Schema.optional(Base64FileData),
  description: Schema.optional(AttachmentDescription),
  pinned: Schema.optional(Schema.Boolean)
} as const
const sources = ["filePath", "fileUrl", "data"] as const
const requireSource = (p: { readonly filePath?: unknown; readonly fileUrl?: unknown; readonly data?: unknown }) =>
  sources.filter((key) => p[key] !== undefined).length === 1 || "Provide exactly one of filePath, fileUrl, data"
export const AddHrRequestAttachmentParamsSchema = Schema.Struct({ ...RequestTarget, ...fileFields }).pipe(
  Schema.check(Schema.makeFilter(requireSource))
)
export const UpdateHrRequestAttachmentParamsSchema = Schema.Struct({
  ...RequestTarget,
  ...AttachmentIdField,
  description: Schema.optional(Schema.NullOr(AttachmentDescription)),
  pinned: Schema.optional(Schema.Boolean)
}).pipe(
  Schema.check(
    Schema.makeFilter((p) => hasAtLeastOneDefined(p, UPDATE_ATTACHMENT_FIELDS) || "Provide description and/or pinned")
  )
)
export const DeleteHrRequestAttachmentParamsSchema = GetHrRequestAttachmentParamsSchema
export type ListHrRequestAttachmentsParams = Schema.Schema.Type<typeof ListHrRequestAttachmentsParamsSchema>
export type GetHrRequestAttachmentParams = Schema.Schema.Type<typeof GetHrRequestAttachmentParamsSchema>
export type AddHrRequestAttachmentParams = Schema.Schema.Type<typeof AddHrRequestAttachmentParamsSchema>
export type UpdateHrRequestAttachmentParams = Schema.Schema.Type<typeof UpdateHrRequestAttachmentParamsSchema>
export type DeleteHrRequestAttachmentParams = GetHrRequestAttachmentParams
export const ListHrRequestAttachmentsResultSchema = Schema.Struct({
  request: HrRequestId,
  attachments: Schema.Array(AttachmentSummaryWireSchema),
  total: Count,
  truncated: Schema.Boolean,
  continuationUnsupportedReason: Schema.optionalKey(Schema.String)
})
export const GetHrRequestAttachmentResultSchema = Schema.Struct({
  request: HrRequestId,
  attachment: AttachmentWireSchema
})
export const AddHrRequestAttachmentResultSchema = Schema.Struct({
  request: HrRequestId,
  attachmentId: AttachmentId,
  blobId: BlobId,
  url: UrlString
})
export const UpdateHrRequestAttachmentResultSchema = Schema.Struct({
  request: HrRequestId,
  attachmentId: AttachmentId,
  updated: Schema.Boolean
})
export const DeleteHrRequestAttachmentResultSchema = Schema.Struct({
  request: HrRequestId,
  attachmentId: AttachmentId,
  deleted: Schema.Boolean
})

const descriptions = {
  request: "Exact HR request ID.",
  limit: `Maximum rows to return (default ${DEFAULT_LIMIT}); total and truncated disclose omitted rows.`,
  body: "Markdown comment body.",
  filename: "Attachment filename.",
  contentType: "MIME type.",
  filePath: "Server-local path.",
  fileUrl: "URL fetched by the MCP server.",
  data: "Base64 file content.",
  description: "Attachment description; null clears on update.",
  pinned: "Pin state."
}
const json = (schema: Schema.Constraint) =>
  withJsonSchemaPropertyDescriptions(toDraft07JsonSchema(schema), descriptions)
export const listHrRequestCommentsParamsJsonSchema = json(ListHrRequestCommentsParamsSchema)
export const addHrRequestCommentParamsJsonSchema = json(AddHrRequestCommentParamsSchema)
export const updateHrRequestCommentParamsJsonSchema = json(UpdateHrRequestCommentParamsSchema)
export const deleteHrRequestCommentParamsJsonSchema = json(DeleteHrRequestCommentParamsSchema)
export const listHrRequestAttachmentsParamsJsonSchema = json(ListHrRequestAttachmentsParamsSchema)
export const getHrRequestAttachmentParamsJsonSchema = json(GetHrRequestAttachmentParamsSchema)
export const addHrRequestAttachmentParamsJsonSchema = withExactlyOneRequired(
  json(AddHrRequestAttachmentParamsSchema),
  sources
)
export const updateHrRequestAttachmentParamsJsonSchema = withAtLeastOneRequired(
  json(UpdateHrRequestAttachmentParamsSchema),
  UPDATE_ATTACHMENT_FIELDS
)
export const deleteHrRequestAttachmentParamsJsonSchema = json(DeleteHrRequestAttachmentParamsSchema)
export const parseListHrRequestCommentsParams = Schema.decodeUnknownEffect(ListHrRequestCommentsParamsSchema)
export const parseAddHrRequestCommentParams = Schema.decodeUnknownEffect(AddHrRequestCommentParamsSchema)
export const parseUpdateHrRequestCommentParams = Schema.decodeUnknownEffect(UpdateHrRequestCommentParamsSchema)
export const parseDeleteHrRequestCommentParams = Schema.decodeUnknownEffect(DeleteHrRequestCommentParamsSchema)
export const parseListHrRequestAttachmentsParams = Schema.decodeUnknownEffect(ListHrRequestAttachmentsParamsSchema)
export const parseGetHrRequestAttachmentParams = Schema.decodeUnknownEffect(GetHrRequestAttachmentParamsSchema)
export const parseAddHrRequestAttachmentParams = Schema.decodeUnknownEffect(AddHrRequestAttachmentParamsSchema)
export const parseUpdateHrRequestAttachmentParams = Schema.decodeUnknownEffect(UpdateHrRequestAttachmentParamsSchema)
export const parseDeleteHrRequestAttachmentParams = Schema.decodeUnknownEffect(DeleteHrRequestAttachmentParamsSchema)
