import { JSONSchema, Predicate, Schema } from "effect"

import { UPDATE_ATTACHMENT_FIELDS } from "./attachments.js"
import { AttachmentDescription, AttachmentFileName, Base64FileData, LocalFilePath } from "./domain-values.js"
import { withExactlyOneRequired, withJsonSchemaPropertyDescriptions } from "./json-schema.js"
import {
  assertUpdateFields,
  atLeastOneUpdateFieldMessage,
  AttachmentId,
  ChannelIdentifier,
  DEFAULT_LIMIT,
  DirectMessageIdentifier,
  hasAtLeastOneDefined,
  LimitParam,
  MessageId,
  MimeType,
  ThreadReplyId,
  UrlString,
  withAtLeastOneRequired
} from "./shared.js"

export * from "./chat-message-attachment-results.js"

const ChannelMessageTargetSchema = Schema.Struct({
  kind: Schema.Literal("channel_message"),
  channel: ChannelIdentifier.annotations({
    description: "Channel name or ID containing the message."
  }),
  messageId: MessageId.annotations({
    description: "Channel message ID."
  })
})

const DmMessageTargetSchema = Schema.Struct({
  kind: Schema.Literal("dm_message"),
  dm: DirectMessageIdentifier.annotations({
    description: "Direct-message conversation: either the DM `_id` or a one-to-one participant display name."
  }),
  messageId: MessageId.annotations({
    description: "Direct-message message ID."
  })
})

const ThreadReplyTargetSchema = Schema.Struct({
  kind: Schema.Literal("thread_reply"),
  channel: ChannelIdentifier.annotations({
    description: "Channel name or ID containing the parent message."
  }),
  messageId: MessageId.annotations({
    description: "Parent channel message ID."
  }),
  replyId: ThreadReplyId.annotations({
    description: "Thread reply ID."
  })
})

const ChatMessageAttachmentTargetSchema = Schema.Union(
  ChannelMessageTargetSchema,
  DmMessageTargetSchema,
  ThreadReplyTargetSchema
)
export type ChatMessageAttachmentTarget = Schema.Schema.Type<typeof ChatMessageAttachmentTargetSchema>

const ChatMessageAttachmentFileFields = {
  filename: AttachmentFileName.annotations({
    description: "Name of the file to attach to the chat message or thread reply."
  }),
  contentType: MimeType.annotations({
    description: "MIME type of the file, such as image/png or application/pdf."
  }),
  filePath: Schema.optional(LocalFilePath.annotations({
    description: "Local file path to upload. Mutually exclusive with fileUrl and data."
  })),
  fileUrl: Schema.optional(UrlString.annotations({
    description: "Remote URL to fetch and upload. Mutually exclusive with filePath and data."
  })),
  data: Schema.optional(Base64FileData.annotations({
    description: "Base64-encoded file data. Mutually exclusive with filePath and fileUrl."
  })),
  description: Schema.optional(AttachmentDescription.annotations({
    description: "Optional attachment description."
  })),
  pinned: Schema.optional(Schema.Boolean.annotations({
    description: "Whether the attachment should be pinned."
  }))
} as const

const CHAT_MESSAGE_ATTACHMENT_FILE_SOURCE_FIELDS = ["filePath", "fileUrl", "data"] as const
const chatMessageAttachmentExactlyOneFileSourceMessage = `Provide exactly one of ${
  CHAT_MESSAGE_ATTACHMENT_FILE_SOURCE_FIELDS.join(", ")
}.`
const requireExactlyOneAttachmentFileSource = (params: {
  readonly filePath?: unknown
  readonly fileUrl?: unknown
  readonly data?: unknown
}) =>
  CHAT_MESSAGE_ATTACHMENT_FILE_SOURCE_FIELDS.filter((field) => params[field] !== undefined).length === 1
  || chatMessageAttachmentExactlyOneFileSourceMessage

const ListChatMessageAttachmentsParamsSchema = Schema.Struct({
  target: ChatMessageAttachmentTargetSchema,
  limit: Schema.optional(LimitParam.annotations({
    description: `Maximum number of attachments to return (default: ${DEFAULT_LIMIT}).`
  }))
}).annotations({
  title: "ListChatMessageAttachmentsParams",
  description: "Parameters for listing files attached directly to a Huly chat message or thread reply."
})
export type ListChatMessageAttachmentsParams = Schema.Schema.Type<
  typeof ListChatMessageAttachmentsParamsSchema
>

const GetChatMessageAttachmentParamsSchema = Schema.Struct({
  target: ChatMessageAttachmentTargetSchema,
  attachmentId: AttachmentId.annotations({
    description: "Attachment ID. Must belong directly to the resolved chat message target."
  })
}).annotations({
  title: "GetChatMessageAttachmentParams",
  description: "Parameters for retrieving one file attached directly to a Huly chat message or thread reply."
})
export type GetChatMessageAttachmentParams = Schema.Schema.Type<typeof GetChatMessageAttachmentParamsSchema>

const AddChatMessageAttachmentParamsSchema = Schema.Struct({
  target: ChatMessageAttachmentTargetSchema,
  ...ChatMessageAttachmentFileFields
}).pipe(
  Schema.filter(requireExactlyOneAttachmentFileSource)
).annotations({
  title: "AddChatMessageAttachmentParams",
  description:
    `Parameters for adding a file to a Huly chat message or thread reply. ${chatMessageAttachmentExactlyOneFileSourceMessage}`
})
export type AddChatMessageAttachmentParams = Schema.Schema.Type<typeof AddChatMessageAttachmentParamsSchema>

const UPDATE_CHAT_MESSAGE_ATTACHMENT_FIELDS = UPDATE_ATTACHMENT_FIELDS

const UpdateChatMessageAttachmentParamsSchema = Schema.Struct({
  target: ChatMessageAttachmentTargetSchema,
  attachmentId: AttachmentId.annotations({
    description: "Attachment ID. Must belong directly to the resolved chat message target."
  }),
  description: Schema.optional(
    Schema.NullOr(AttachmentDescription).annotations({
      description: "New description; use null to clear it."
    })
  ),
  pinned: Schema.optional(Schema.Boolean.annotations({
    description: "Pin or unpin the attachment."
  }))
}).pipe(
  Schema.filter((params) =>
    hasAtLeastOneDefined(params, UPDATE_CHAT_MESSAGE_ATTACHMENT_FIELDS)
      ? undefined
      : atLeastOneUpdateFieldMessage(UPDATE_CHAT_MESSAGE_ATTACHMENT_FIELDS)
  )
).annotations({
  title: "UpdateChatMessageAttachmentParams",
  description: `Parameters for updating chat message attachment metadata. ${
    atLeastOneUpdateFieldMessage(UPDATE_CHAT_MESSAGE_ATTACHMENT_FIELDS)
  }`
})
export type UpdateChatMessageAttachmentParams = Schema.Schema.Type<
  typeof UpdateChatMessageAttachmentParamsSchema
>
assertUpdateFields<UpdateChatMessageAttachmentParams>()(
  ["target", "attachmentId"],
  UPDATE_CHAT_MESSAGE_ATTACHMENT_FIELDS
)

const DeleteChatMessageAttachmentParamsSchema = GetChatMessageAttachmentParamsSchema.annotations({
  title: "DeleteChatMessageAttachmentParams",
  description: "Parameters for permanently deleting a file attached directly to a Huly chat message or thread reply."
})
export type DeleteChatMessageAttachmentParams = Schema.Schema.Type<
  typeof DeleteChatMessageAttachmentParamsSchema
>

const CHAT_MESSAGE_ATTACHMENT_FIELD_DESCRIPTIONS: Readonly<Partial<Record<string, string>>> = {
  target:
    "Chat attachment target. Use channel_message for a channel message, dm_message for a direct-message message, or thread_reply for a thread reply.",
  limit: `Maximum number of matching attachments to return (default: ${DEFAULT_LIMIT}).`,
  attachmentId: "Attachment ID. Must belong directly to the resolved chat message target.",
  filename: "Name of the file to attach to the chat message or thread reply.",
  contentType: "MIME type of the file, such as image/png or application/pdf.",
  filePath: "Local file path to upload. Mutually exclusive with fileUrl and data.",
  fileUrl: "Remote URL to fetch and upload. Mutually exclusive with filePath and data.",
  data: "Base64-encoded file data. Mutually exclusive with filePath and fileUrl.",
  description: "Optional attachment description. Use null on update to clear it.",
  pinned: "Whether the attachment should be pinned."
}

const CHAT_MESSAGE_ATTACHMENT_TARGET_FIELD_DESCRIPTIONS: Readonly<Partial<Record<string, string>>> = {
  kind: "Target kind: channel_message, dm_message, or thread_reply.",
  channel: "Channel name or ID. Required for channel_message and thread_reply targets.",
  dm: "Direct-message conversation ID or one-to-one participant display name.",
  messageId: "Existing message ID. For thread_reply, this is the parent channel message ID.",
  replyId: "Existing thread reply ID."
}

const withRootSchemaMetadata = (schema: object, title: string, description: string): object => ({
  ...schema,
  title,
  description
})

export const withChatMessageAttachmentTargetVariantDescriptions = (schema: object): object => {
  const properties = Predicate.isRecord(schema) ? schema.properties : undefined
  if (!Predicate.isRecord(properties)) return schema
  const target = properties.target
  if (!Predicate.isRecord(target) || !Array.isArray(target.anyOf)) return schema

  return {
    ...schema,
    properties: {
      ...properties,
      target: {
        ...target,
        anyOf: target.anyOf.map((variant) =>
          Predicate.isRecord(variant)
            ? withJsonSchemaPropertyDescriptions(variant, CHAT_MESSAGE_ATTACHMENT_TARGET_FIELD_DESCRIPTIONS)
            : variant
        )
      }
    }
  }
}

const chatMessageAttachmentJsonSchema = <A, I, R>(schema: Schema.Schema<A, I, R>): object =>
  withChatMessageAttachmentTargetVariantDescriptions(
    withJsonSchemaPropertyDescriptions(JSONSchema.make(schema), CHAT_MESSAGE_ATTACHMENT_FIELD_DESCRIPTIONS)
  )

const withExactlyOneChatMessageAttachmentFileSource = (schema: object): object =>
  withExactlyOneRequired(schema, CHAT_MESSAGE_ATTACHMENT_FILE_SOURCE_FIELDS)

export const listChatMessageAttachmentsParamsJsonSchema = chatMessageAttachmentJsonSchema(
  ListChatMessageAttachmentsParamsSchema
)
export const getChatMessageAttachmentParamsJsonSchema = chatMessageAttachmentJsonSchema(
  GetChatMessageAttachmentParamsSchema
)
export const addChatMessageAttachmentParamsJsonSchema = withExactlyOneChatMessageAttachmentFileSource(
  withRootSchemaMetadata(
    chatMessageAttachmentJsonSchema(AddChatMessageAttachmentParamsSchema),
    "AddChatMessageAttachmentParams",
    `Parameters for adding a file to a Huly chat message or thread reply. ${chatMessageAttachmentExactlyOneFileSourceMessage}`
  )
)
export const updateChatMessageAttachmentParamsJsonSchema = withAtLeastOneRequired(
  chatMessageAttachmentJsonSchema(UpdateChatMessageAttachmentParamsSchema),
  UPDATE_CHAT_MESSAGE_ATTACHMENT_FIELDS
)
export const deleteChatMessageAttachmentParamsJsonSchema = chatMessageAttachmentJsonSchema(
  DeleteChatMessageAttachmentParamsSchema
)

export const parseListChatMessageAttachmentsParams = Schema.decodeUnknown(ListChatMessageAttachmentsParamsSchema)
export const parseGetChatMessageAttachmentParams = Schema.decodeUnknown(GetChatMessageAttachmentParamsSchema)
export const parseAddChatMessageAttachmentParams = Schema.decodeUnknown(AddChatMessageAttachmentParamsSchema)
export const parseUpdateChatMessageAttachmentParams = Schema.decodeUnknown(UpdateChatMessageAttachmentParamsSchema)
export const parseDeleteChatMessageAttachmentParams = Schema.decodeUnknown(DeleteChatMessageAttachmentParamsSchema)
