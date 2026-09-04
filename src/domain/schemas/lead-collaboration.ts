import { Schema } from "effect"

import { HULY_NATIVE_REFERENCE_MARKDOWN_INPUT } from "./document-native-references.js"
import { AttachmentDescription, AttachmentFileName, Base64FileData, LocalFilePath } from "./domain-values.js"
import { toDraft07JsonSchema, withJsonSchemaPropertyDescriptions } from "./json-schema.js"
import { FunnelReference, LeadIdentifier } from "./leads.js"
import { ModuleLabelDefinitionSchema } from "./module-labels.js"
import {
  AttachmentId,
  BlobId,
  ColorCode,
  CommentId,
  Count,
  DEFAULT_COLOR_INDEX,
  DEFAULT_LIMIT,
  LimitParam,
  MAX_COLOR_INDEX,
  MimeType,
  NonEmptyString,
  PositiveInteger,
  TagElementId,
  TagIdentifier,
  TagReferenceId,
  UrlString
} from "./shared.js"
import { AttachmentSummaryWireSchema, AttachmentWireSchema } from "./attachments.js"
import { CommentSchema } from "./comments.js"
import { TagWeight } from "./tags.js"

const LeadTargetFields = {
  funnel: FunnelReference.annotateKey({ description: "Funnel stable ID or exact unambiguous name." }),
  identifier: LeadIdentifier.annotateKey({ description: "Lead identifier, such as LEAD-1." })
}

export const ListLeadCommentsParamsSchema = Schema.Struct({
  ...LeadTargetFields,
  limit: Schema.optionalKey(
    LimitParam.annotateKey({ description: `Maximum comments to return (default: ${DEFAULT_LIMIT}).` })
  )
})
export const AddLeadCommentParamsSchema = Schema.Struct({
  ...LeadTargetFields,
  body: NonEmptyString.annotateKey({ description: `Comment body in Markdown. ${HULY_NATIVE_REFERENCE_MARKDOWN_INPUT}` })
})
export const UpdateLeadCommentParamsSchema = Schema.Struct({
  ...LeadTargetFields,
  commentId: CommentId,
  body: NonEmptyString.annotateKey({
    description: `Replacement Markdown body. ${HULY_NATIVE_REFERENCE_MARKDOWN_INPUT}`
  })
})
export const DeleteLeadCommentParamsSchema = Schema.Struct({ ...LeadTargetFields, commentId: CommentId })

const UploadFields = {
  filename: AttachmentFileName,
  contentType: MimeType,
  filePath: Schema.optionalKey(LocalFilePath),
  fileUrl: Schema.optionalKey(UrlString),
  data: Schema.optionalKey(Base64FileData),
  description: Schema.optionalKey(AttachmentDescription),
  pinned: Schema.optionalKey(Schema.Boolean)
}
const UploadShape = Schema.Struct(UploadFields)
const requireUploadSource = Schema.makeFilter((value: Schema.Schema.Type<typeof UploadShape>) => {
  const sources = [value.filePath, value.fileUrl, value.data].filter((source) => source !== undefined)
  return sources.length === 1 ? undefined : "Provide exactly one file source: filePath, fileUrl, or data."
})

export const ListLeadAttachmentsParamsSchema = Schema.Struct({
  ...LeadTargetFields,
  limit: Schema.optionalKey(
    LimitParam.annotateKey({ description: `Maximum attachments to return (default: ${DEFAULT_LIMIT}).` })
  )
})
export const AddLeadAttachmentParamsSchema = Schema.Struct({ ...LeadTargetFields, ...UploadFields }).check(
  requireUploadSource
)
export const GetLeadAttachmentParamsSchema = Schema.Struct({ ...LeadTargetFields, attachmentId: AttachmentId })
export const UpdateLeadAttachmentParamsSchema = Schema.Struct({
  ...LeadTargetFields,
  attachmentId: AttachmentId,
  description: Schema.optionalKey(Schema.NullOr(AttachmentDescription)),
  pinned: Schema.optionalKey(Schema.Boolean)
}).check(
  Schema.makeFilter((value) =>
    value.description !== undefined || value.pinned !== undefined ? undefined : "Provide description or pinned."
  )
)
export const DeleteLeadAttachmentParamsSchema = Schema.Struct({ ...LeadTargetFields, attachmentId: AttachmentId })

export const ListLeadLabelDefinitionsParamsSchema = Schema.Struct({
  titleSearch: Schema.optionalKey(Schema.String.annotateKey({ description: "Optional label title substring search." })),
  limit: Schema.optionalKey(
    LimitParam.annotateKey({ description: `Maximum label definitions to return (default: ${DEFAULT_LIMIT}).` })
  )
})
export const ListLeadLabelsParamsSchema = Schema.Struct(LeadTargetFields)
export const AddLeadLabelParamsSchema = Schema.Struct({
  ...LeadTargetFields,
  label: TagIdentifier.annotateKey({ description: "Label definition ID or exact title; a missing title creates it." }),
  color: Schema.optionalKey(
    ColorCode.annotateKey({
      description: `New-label color from 0 through ${MAX_COLOR_INDEX} (default: ${DEFAULT_COLOR_INDEX}).`
    })
  ),
  weight: Schema.optionalKey(TagWeight)
})
export const UpdateLeadLabelParamsSchema = Schema.Struct({
  ...LeadTargetFields,
  label: TagIdentifier,
  weight: TagWeight.annotateKey({ description: "Replacement TagReference weight." })
})
export const RemoveLeadLabelParamsSchema = Schema.Struct({ ...LeadTargetFields, label: TagIdentifier })

export type ListLeadCommentsParams = Schema.Schema.Type<typeof ListLeadCommentsParamsSchema>
export type AddLeadCommentParams = Schema.Schema.Type<typeof AddLeadCommentParamsSchema>
export type UpdateLeadCommentParams = Schema.Schema.Type<typeof UpdateLeadCommentParamsSchema>
export type DeleteLeadCommentParams = Schema.Schema.Type<typeof DeleteLeadCommentParamsSchema>
export type ListLeadAttachmentsParams = Schema.Schema.Type<typeof ListLeadAttachmentsParamsSchema>
export type AddLeadAttachmentParams = Schema.Schema.Type<typeof AddLeadAttachmentParamsSchema>
export type GetLeadAttachmentParams = Schema.Schema.Type<typeof GetLeadAttachmentParamsSchema>
export type UpdateLeadAttachmentParams = Schema.Schema.Type<typeof UpdateLeadAttachmentParamsSchema>
export type DeleteLeadAttachmentParams = Schema.Schema.Type<typeof DeleteLeadAttachmentParamsSchema>
export type ListLeadLabelDefinitionsParams = Schema.Schema.Type<typeof ListLeadLabelDefinitionsParamsSchema>
export type ListLeadLabelsParams = Schema.Schema.Type<typeof ListLeadLabelsParamsSchema>
export type AddLeadLabelParams = Schema.Schema.Type<typeof AddLeadLabelParamsSchema>
export type UpdateLeadLabelParams = Schema.Schema.Type<typeof UpdateLeadLabelParamsSchema>
export type RemoveLeadLabelParams = Schema.Schema.Type<typeof RemoveLeadLabelParamsSchema>

const leadParamDescriptions = {
  funnel: "Funnel stable ID or exact unambiguous name.",
  identifier: "Lead identifier, such as LEAD-1."
}
const json = (schema: Schema.Constraint) =>
  withJsonSchemaPropertyDescriptions(toDraft07JsonSchema(schema), leadParamDescriptions)

export const listLeadCommentsParamsJsonSchema = json(ListLeadCommentsParamsSchema)
export const addLeadCommentParamsJsonSchema = json(AddLeadCommentParamsSchema)
export const updateLeadCommentParamsJsonSchema = json(UpdateLeadCommentParamsSchema)
export const deleteLeadCommentParamsJsonSchema = json(DeleteLeadCommentParamsSchema)
export const listLeadAttachmentsParamsJsonSchema = json(ListLeadAttachmentsParamsSchema)
export const addLeadAttachmentParamsJsonSchema = json(AddLeadAttachmentParamsSchema)
export const getLeadAttachmentParamsJsonSchema = json(GetLeadAttachmentParamsSchema)
export const updateLeadAttachmentParamsJsonSchema = json(UpdateLeadAttachmentParamsSchema)
export const deleteLeadAttachmentParamsJsonSchema = json(DeleteLeadAttachmentParamsSchema)
export const listLeadLabelDefinitionsParamsJsonSchema = json(ListLeadLabelDefinitionsParamsSchema)
export const listLeadLabelsParamsJsonSchema = json(ListLeadLabelsParamsSchema)
export const addLeadLabelParamsJsonSchema = json(AddLeadLabelParamsSchema)
export const updateLeadLabelParamsJsonSchema = json(UpdateLeadLabelParamsSchema)
export const removeLeadLabelParamsJsonSchema = json(RemoveLeadLabelParamsSchema)

export const parseListLeadCommentsParams = Schema.decodeUnknownEffect(ListLeadCommentsParamsSchema, {
  onExcessProperty: "error"
})
export const parseAddLeadCommentParams = Schema.decodeUnknownEffect(AddLeadCommentParamsSchema, {
  onExcessProperty: "error"
})
export const parseUpdateLeadCommentParams = Schema.decodeUnknownEffect(UpdateLeadCommentParamsSchema, {
  onExcessProperty: "error"
})
export const parseDeleteLeadCommentParams = Schema.decodeUnknownEffect(DeleteLeadCommentParamsSchema, {
  onExcessProperty: "error"
})
export const parseListLeadAttachmentsParams = Schema.decodeUnknownEffect(ListLeadAttachmentsParamsSchema, {
  onExcessProperty: "error"
})
export const parseAddLeadAttachmentParams = Schema.decodeUnknownEffect(AddLeadAttachmentParamsSchema, {
  onExcessProperty: "error"
})
export const parseGetLeadAttachmentParams = Schema.decodeUnknownEffect(GetLeadAttachmentParamsSchema, {
  onExcessProperty: "error"
})
export const parseUpdateLeadAttachmentParams = Schema.decodeUnknownEffect(UpdateLeadAttachmentParamsSchema, {
  onExcessProperty: "error"
})
export const parseDeleteLeadAttachmentParams = Schema.decodeUnknownEffect(DeleteLeadAttachmentParamsSchema, {
  onExcessProperty: "error"
})
export const parseListLeadLabelDefinitionsParams = Schema.decodeUnknownEffect(ListLeadLabelDefinitionsParamsSchema, {
  onExcessProperty: "error"
})
export const parseListLeadLabelsParams = Schema.decodeUnknownEffect(ListLeadLabelsParamsSchema, {
  onExcessProperty: "error"
})
export const parseAddLeadLabelParams = Schema.decodeUnknownEffect(AddLeadLabelParamsSchema, {
  onExcessProperty: "error"
})
export const parseUpdateLeadLabelParams = Schema.decodeUnknownEffect(UpdateLeadLabelParamsSchema, {
  onExcessProperty: "error"
})
export const parseRemoveLeadLabelParams = Schema.decodeUnknownEffect(RemoveLeadLabelParamsSchema, {
  onExcessProperty: "error"
})

const LeadIdentity = { identifier: LeadIdentifier }
export const ListLeadCommentsResultSchema = Schema.Struct({
  ...LeadIdentity,
  comments: Schema.Array(CommentSchema),
  total: Count
})
export const LeadCommentMutationResultSchema = Schema.Struct({
  ...LeadIdentity,
  commentId: CommentId,
  changed: Schema.Boolean
})
export const ListLeadAttachmentsResultSchema = Schema.Struct({
  ...LeadIdentity,
  attachments: Schema.Array(AttachmentSummaryWireSchema),
  total: Count
})
export const AddLeadAttachmentResultSchema = Schema.Struct({
  ...LeadIdentity,
  attachmentId: AttachmentId,
  blobId: BlobId,
  url: UrlString
})
export const GetLeadAttachmentResultSchema = Schema.Struct({ ...LeadIdentity, attachment: AttachmentWireSchema })
export const LeadAttachmentMutationResultSchema = Schema.Struct({
  ...LeadIdentity,
  attachmentId: AttachmentId,
  changed: Schema.Literal(true)
})
export const ListLeadLabelDefinitionsResultSchema = Schema.Struct({ labels: Schema.Array(ModuleLabelDefinitionSchema) })
export const AttachedLeadLabelSchema = Schema.Struct({
  id: TagReferenceId,
  label: TagElementId,
  title: NonEmptyString,
  color: ColorCode,
  weight: Schema.optionalKey(TagWeight)
}).annotate({
  title: "AttachedLeadLabel",
  description: "Native TagReference label attached to one lead, including its optional published weight."
})
export const ListLeadLabelsResultSchema = Schema.Struct({
  ...LeadIdentity,
  labels: Schema.Array(AttachedLeadLabelSchema)
})
const LeadLabelMutationIdentity = { ...LeadIdentity, id: TagReferenceId, label: TagElementId, title: NonEmptyString }
export const AddLeadLabelResultSchema = Schema.Union([
  Schema.Struct({ ...LeadLabelMutationIdentity, attached: Schema.Literal(true), labelCreated: Schema.Literal(true) }),
  Schema.Struct({ ...LeadLabelMutationIdentity, attached: Schema.Literal(true), labelCreated: Schema.Literal(false) }),
  Schema.Struct({ ...LeadLabelMutationIdentity, attached: Schema.Literal(false), labelCreated: Schema.Literal(false) })
])
export const UpdateLeadLabelResultSchema = Schema.Union([
  Schema.Struct({ ...LeadIdentity, updated: Schema.Literal(true), updatedCount: PositiveInteger }),
  Schema.Struct({ ...LeadIdentity, updated: Schema.Literal(false), updatedCount: Schema.Literal(0) })
])
const RemovedLeadLabelFields = { ...LeadIdentity, label: TagElementId, title: NonEmptyString }
export const RemoveLeadLabelResultSchema = Schema.Union([
  Schema.Struct({ ...RemovedLeadLabelFields, detached: Schema.Literal(true), detachedCount: PositiveInteger }),
  Schema.Struct({ ...RemovedLeadLabelFields, detached: Schema.Literal(false), detachedCount: Schema.Literal(0) })
])
