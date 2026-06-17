import { Schema } from "effect"

import { AttachmentSummaryWireSchema, AttachmentWireSchema } from "./attachments.js"
import {
  AttachmentId,
  BlobId,
  ChannelId,
  ChannelName,
  Count,
  DocId,
  MessageId,
  NonEmptyString,
  ObjectClassName,
  SpaceId,
  ThreadReplyId,
  UrlString
} from "./shared.js"

const ResolvedTargetBaseSchema = {
  space: SpaceId,
  objectId: DocId,
  objectClass: ObjectClassName,
  collection: Schema.Literal("attachments")
} as const

export const ChatMessageAttachmentResolvedTargetSchema = Schema.Union(
  Schema.Struct({
    kind: Schema.Literal("channel_message"),
    channelId: ChannelId,
    channelName: ChannelName,
    messageId: MessageId,
    display: NonEmptyString,
    ...ResolvedTargetBaseSchema
  }),
  Schema.Struct({
    kind: Schema.Literal("dm_message"),
    dmId: ChannelId,
    messageId: MessageId,
    display: NonEmptyString,
    ...ResolvedTargetBaseSchema
  }),
  Schema.Struct({
    kind: Schema.Literal("thread_reply"),
    channelId: ChannelId,
    channelName: ChannelName,
    messageId: MessageId,
    replyId: ThreadReplyId,
    display: NonEmptyString,
    ...ResolvedTargetBaseSchema
  })
).annotations({
  title: "ChatMessageAttachmentResolvedTarget",
  description:
    "Resolved Huly chat message attachment target. objectId/objectClass/space identify the exact object whose attachments collection is being read or mutated."
})
export type ChatMessageAttachmentResolvedTarget = Schema.Schema.Type<
  typeof ChatMessageAttachmentResolvedTargetSchema
>

export const ListChatMessageAttachmentsResultSchema = Schema.Struct({
  target: ChatMessageAttachmentResolvedTargetSchema,
  attachments: Schema.Array(AttachmentSummaryWireSchema),
  total: Count
})
export const GetChatMessageAttachmentResultSchema = Schema.Struct({
  target: ChatMessageAttachmentResolvedTargetSchema,
  attachment: AttachmentWireSchema
})
export const AddChatMessageAttachmentResultSchema = Schema.Struct({
  target: ChatMessageAttachmentResolvedTargetSchema,
  attachmentId: AttachmentId,
  blobId: BlobId,
  url: UrlString
})
export const UpdateChatMessageAttachmentResultSchema = Schema.Struct({
  target: ChatMessageAttachmentResolvedTargetSchema,
  attachmentId: AttachmentId,
  updated: Schema.Boolean
})
export const DeleteChatMessageAttachmentResultSchema = Schema.Struct({
  target: ChatMessageAttachmentResolvedTargetSchema,
  attachmentId: AttachmentId,
  deleted: Schema.Boolean
})

export type ListChatMessageAttachmentsResult = Schema.Schema.Type<
  typeof ListChatMessageAttachmentsResultSchema
>
export type GetChatMessageAttachmentResult = Schema.Schema.Type<typeof GetChatMessageAttachmentResultSchema>
export type AddChatMessageAttachmentResult = Schema.Schema.Type<typeof AddChatMessageAttachmentResultSchema>
export type UpdateChatMessageAttachmentResult = Schema.Schema.Type<
  typeof UpdateChatMessageAttachmentResultSchema
>
export type DeleteChatMessageAttachmentResult = Schema.Schema.Type<
  typeof DeleteChatMessageAttachmentResultSchema
>
