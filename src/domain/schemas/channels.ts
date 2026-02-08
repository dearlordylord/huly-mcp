import { JSONSchema, Schema } from "effect"

import {
  AccountUuid,
  ChannelId,
  ChannelIdentifier,
  ChannelName,
  LimitParam,
  MessageId,
  NonEmptyString,
  PersonName,
  ThreadReplyId,
  Timestamp
} from "./shared.js"

// --- Channel Summary (for list operations) ---

export const ChannelSummarySchema = Schema.Struct({
  id: ChannelId,
  name: ChannelName,
  topic: Schema.optional(Schema.String),
  private: Schema.Boolean,
  archived: Schema.Boolean,
  members: Schema.optional(Schema.NonNegativeInt),
  messages: Schema.optional(Schema.NonNegativeInt),
  modifiedOn: Schema.optional(Timestamp)
}).annotations({
  title: "ChannelSummary",
  description: "Channel summary for list operations"
})

export type ChannelSummary = Schema.Schema.Type<typeof ChannelSummarySchema>

// --- Full Channel ---

export const ChannelSchema = Schema.Struct({
  id: ChannelId,
  name: ChannelName,
  topic: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
  private: Schema.Boolean,
  archived: Schema.Boolean,
  members: Schema.optional(Schema.Array(PersonName)),
  messages: Schema.optional(Schema.NonNegativeInt),
  modifiedOn: Schema.optional(Timestamp),
  createdOn: Schema.optional(Timestamp)
}).annotations({
  title: "Channel",
  description: "Full channel with all fields"
})

export type Channel = Schema.Schema.Type<typeof ChannelSchema>

// --- Message Summary ---

export const MessageSummarySchema = Schema.Struct({
  id: MessageId,
  body: Schema.String,
  sender: Schema.optional(PersonName),
  senderId: Schema.optional(Schema.String),
  createdOn: Schema.optional(Timestamp),
  modifiedOn: Schema.optional(Timestamp),
  editedOn: Schema.optional(Timestamp),
  replies: Schema.optional(Schema.NonNegativeInt)
}).annotations({
  title: "MessageSummary",
  description: "Message summary for list operations"
})

export type MessageSummary = Schema.Schema.Type<typeof MessageSummarySchema>

// --- Direct Message Conversation Summary ---

export const DirectMessageSummarySchema = Schema.Struct({
  id: ChannelId,
  participants: Schema.Array(PersonName),
  participantIds: Schema.optional(Schema.Array(AccountUuid)),
  messages: Schema.optional(Schema.NonNegativeInt),
  modifiedOn: Schema.optional(Timestamp)
}).annotations({
  title: "DirectMessageSummary",
  description: "Direct message conversation summary"
})

export type DirectMessageSummary = Schema.Schema.Type<typeof DirectMessageSummarySchema>

// --- List Channels Params ---

export const ListChannelsParamsSchema = Schema.Struct({
  nameSearch: Schema.optional(Schema.String.annotations({
    description: "Search channels by name substring (case-insensitive)"
  })),
  topicSearch: Schema.optional(Schema.String.annotations({
    description: "Search channels by topic substring (case-insensitive)"
  })),
  limit: Schema.optional(
    LimitParam.annotations({
      description: "Maximum number of channels to return (default: 50)"
    })
  ),
  includeArchived: Schema.optional(
    Schema.Boolean.annotations({
      description: "Include archived channels in results (default: false)"
    })
  )
}).annotations({
  title: "ListChannelsParams",
  description: "Parameters for listing channels"
})

export type ListChannelsParams = Schema.Schema.Type<typeof ListChannelsParamsSchema>

// --- Get Channel Params ---

export const GetChannelParamsSchema = Schema.Struct({
  channel: ChannelIdentifier.annotations({
    description: "Channel name or ID"
  })
}).annotations({
  title: "GetChannelParams",
  description: "Parameters for getting a single channel"
})

export type GetChannelParams = Schema.Schema.Type<typeof GetChannelParamsSchema>

// --- Create Channel Params ---

export const CreateChannelParamsSchema = Schema.Struct({
  name: NonEmptyString.annotations({
    description: "Channel name"
  }),
  topic: Schema.optional(Schema.String.annotations({
    description: "Channel topic/description"
  })),
  private: Schema.optional(Schema.Boolean.annotations({
    description: "Whether channel is private (default: false)"
  }))
}).annotations({
  title: "CreateChannelParams",
  description: "Parameters for creating a channel"
})

export type CreateChannelParams = Schema.Schema.Type<typeof CreateChannelParamsSchema>

// --- Update Channel Params ---

export const UpdateChannelParamsSchema = Schema.Struct({
  channel: ChannelIdentifier.annotations({
    description: "Channel name or ID"
  }),
  name: Schema.optional(NonEmptyString.annotations({
    description: "New channel name"
  })),
  topic: Schema.optional(Schema.String.annotations({
    description: "New channel topic"
  }))
}).annotations({
  title: "UpdateChannelParams",
  description: "Parameters for updating a channel"
})

export type UpdateChannelParams = Schema.Schema.Type<typeof UpdateChannelParamsSchema>

// --- Delete Channel Params ---

export const DeleteChannelParamsSchema = Schema.Struct({
  channel: ChannelIdentifier.annotations({
    description: "Channel name or ID"
  })
}).annotations({
  title: "DeleteChannelParams",
  description: "Parameters for deleting a channel"
})

export type DeleteChannelParams = Schema.Schema.Type<typeof DeleteChannelParamsSchema>

// --- List Channel Messages Params ---

export const ListChannelMessagesParamsSchema = Schema.Struct({
  channel: ChannelIdentifier.annotations({
    description: "Channel name or ID"
  }),
  limit: Schema.optional(
    LimitParam.annotations({
      description: "Maximum number of messages to return (default: 50)"
    })
  )
}).annotations({
  title: "ListChannelMessagesParams",
  description: "Parameters for listing messages in a channel"
})

export type ListChannelMessagesParams = Schema.Schema.Type<typeof ListChannelMessagesParamsSchema>

// --- Send Channel Message Params ---

export const SendChannelMessageParamsSchema = Schema.Struct({
  channel: ChannelIdentifier.annotations({
    description: "Channel name or ID"
  }),
  body: NonEmptyString.annotations({
    description: "Message body (markdown supported)"
  })
}).annotations({
  title: "SendChannelMessageParams",
  description: "Parameters for sending a message to a channel"
})

export type SendChannelMessageParams = Schema.Schema.Type<typeof SendChannelMessageParamsSchema>

// --- List Direct Messages Params ---

export const ListDirectMessagesParamsSchema = Schema.Struct({
  limit: Schema.optional(
    LimitParam.annotations({
      description: "Maximum number of DM conversations to return (default: 50)"
    })
  )
}).annotations({
  title: "ListDirectMessagesParams",
  description: "Parameters for listing direct message conversations"
})

export type ListDirectMessagesParams = Schema.Schema.Type<typeof ListDirectMessagesParamsSchema>

// --- Thread Message Schema ---

export const ThreadMessageSchema = Schema.Struct({
  id: ThreadReplyId,
  body: Schema.String,
  sender: Schema.optional(PersonName),
  senderId: Schema.optional(Schema.String),
  createdOn: Schema.optional(Timestamp),
  modifiedOn: Schema.optional(Timestamp),
  editedOn: Schema.optional(Timestamp)
}).annotations({
  title: "ThreadMessage",
  description: "Thread reply message"
})

export type ThreadMessage = Schema.Schema.Type<typeof ThreadMessageSchema>

// --- List Thread Replies Params ---

export const ListThreadRepliesParamsSchema = Schema.Struct({
  channel: ChannelIdentifier.annotations({
    description: "Channel name or ID"
  }),
  messageId: MessageId.annotations({
    description: "Parent message ID"
  }),
  limit: Schema.optional(
    LimitParam.annotations({
      description: "Maximum number of replies to return (default: 50)"
    })
  )
}).annotations({
  title: "ListThreadRepliesParams",
  description: "Parameters for listing thread replies"
})

export type ListThreadRepliesParams = Schema.Schema.Type<typeof ListThreadRepliesParamsSchema>

// --- Add Thread Reply Params ---

export const AddThreadReplyParamsSchema = Schema.Struct({
  channel: ChannelIdentifier.annotations({
    description: "Channel name or ID"
  }),
  messageId: MessageId.annotations({
    description: "Parent message ID to reply to"
  }),
  body: NonEmptyString.annotations({
    description: "Reply body (markdown supported)"
  })
}).annotations({
  title: "AddThreadReplyParams",
  description: "Parameters for adding a thread reply"
})

export type AddThreadReplyParams = Schema.Schema.Type<typeof AddThreadReplyParamsSchema>

// --- Update Thread Reply Params ---

export const UpdateThreadReplyParamsSchema = Schema.Struct({
  channel: ChannelIdentifier.annotations({
    description: "Channel name or ID"
  }),
  messageId: MessageId.annotations({
    description: "Parent message ID"
  }),
  replyId: ThreadReplyId.annotations({
    description: "Thread reply ID to update"
  }),
  body: NonEmptyString.annotations({
    description: "New reply body (markdown supported)"
  })
}).annotations({
  title: "UpdateThreadReplyParams",
  description: "Parameters for updating a thread reply"
})

export type UpdateThreadReplyParams = Schema.Schema.Type<typeof UpdateThreadReplyParamsSchema>

// --- Delete Thread Reply Params ---

export const DeleteThreadReplyParamsSchema = Schema.Struct({
  channel: ChannelIdentifier.annotations({
    description: "Channel name or ID"
  }),
  messageId: MessageId.annotations({
    description: "Parent message ID"
  }),
  replyId: ThreadReplyId.annotations({
    description: "Thread reply ID to delete"
  })
}).annotations({
  title: "DeleteThreadReplyParams",
  description: "Parameters for deleting a thread reply"
})

export type DeleteThreadReplyParams = Schema.Schema.Type<typeof DeleteThreadReplyParamsSchema>

// --- JSON Schemas for MCP ---

export const listChannelsParamsJsonSchema = JSONSchema.make(ListChannelsParamsSchema)
export const getChannelParamsJsonSchema = JSONSchema.make(GetChannelParamsSchema)
export const createChannelParamsJsonSchema = JSONSchema.make(CreateChannelParamsSchema)
export const updateChannelParamsJsonSchema = JSONSchema.make(UpdateChannelParamsSchema)
export const deleteChannelParamsJsonSchema = JSONSchema.make(DeleteChannelParamsSchema)
export const listChannelMessagesParamsJsonSchema = JSONSchema.make(ListChannelMessagesParamsSchema)
export const sendChannelMessageParamsJsonSchema = JSONSchema.make(SendChannelMessageParamsSchema)
export const listDirectMessagesParamsJsonSchema = JSONSchema.make(ListDirectMessagesParamsSchema)
export const listThreadRepliesParamsJsonSchema = JSONSchema.make(ListThreadRepliesParamsSchema)
export const addThreadReplyParamsJsonSchema = JSONSchema.make(AddThreadReplyParamsSchema)
export const updateThreadReplyParamsJsonSchema = JSONSchema.make(UpdateThreadReplyParamsSchema)
export const deleteThreadReplyParamsJsonSchema = JSONSchema.make(DeleteThreadReplyParamsSchema)

// --- Parsers ---

export const parseListChannelsParams = Schema.decodeUnknown(ListChannelsParamsSchema)
export const parseGetChannelParams = Schema.decodeUnknown(GetChannelParamsSchema)
export const parseCreateChannelParams = Schema.decodeUnknown(CreateChannelParamsSchema)
export const parseUpdateChannelParams = Schema.decodeUnknown(UpdateChannelParamsSchema)
export const parseDeleteChannelParams = Schema.decodeUnknown(DeleteChannelParamsSchema)
export const parseListChannelMessagesParams = Schema.decodeUnknown(ListChannelMessagesParamsSchema)
export const parseSendChannelMessageParams = Schema.decodeUnknown(SendChannelMessageParamsSchema)
export const parseListDirectMessagesParams = Schema.decodeUnknown(ListDirectMessagesParamsSchema)
export const parseListThreadRepliesParams = Schema.decodeUnknown(ListThreadRepliesParamsSchema)
export const parseAddThreadReplyParams = Schema.decodeUnknown(AddThreadReplyParamsSchema)
export const parseUpdateThreadReplyParams = Schema.decodeUnknown(UpdateThreadReplyParamsSchema)
export const parseDeleteThreadReplyParams = Schema.decodeUnknown(DeleteThreadReplyParamsSchema)

// --- Result Schemas ---

export const CreateChannelResultSchema = Schema.Struct({
  id: ChannelId,
  name: ChannelName
}).annotations({ title: "CreateChannelResult", description: "Result of create channel operation" })
export type CreateChannelResult = Schema.Schema.Type<typeof CreateChannelResultSchema>

export const UpdateChannelResultSchema = Schema.Struct({
  id: ChannelId,
  updated: Schema.Boolean
}).annotations({ title: "UpdateChannelResult", description: "Result of update channel operation" })
export type UpdateChannelResult = Schema.Schema.Type<typeof UpdateChannelResultSchema>

export const DeleteChannelResultSchema = Schema.Struct({
  id: ChannelId,
  deleted: Schema.Boolean
}).annotations({ title: "DeleteChannelResult", description: "Result of delete channel operation" })
export type DeleteChannelResult = Schema.Schema.Type<typeof DeleteChannelResultSchema>

export const ListChannelMessagesResultSchema = Schema.Struct({
  messages: Schema.Array(MessageSummarySchema),
  total: Schema.Number
}).annotations({ title: "ListChannelMessagesResult", description: "Result of list channel messages operation" })
export type ListChannelMessagesResult = Schema.Schema.Type<typeof ListChannelMessagesResultSchema>

export const SendChannelMessageResultSchema = Schema.Struct({
  id: MessageId,
  channelId: ChannelId
}).annotations({ title: "SendChannelMessageResult", description: "Result of send channel message operation" })
export type SendChannelMessageResult = Schema.Schema.Type<typeof SendChannelMessageResultSchema>

export const ListDirectMessagesResultSchema = Schema.Struct({
  conversations: Schema.Array(DirectMessageSummarySchema),
  total: Schema.Number
}).annotations({ title: "ListDirectMessagesResult", description: "Result of list direct messages operation" })
export type ListDirectMessagesResult = Schema.Schema.Type<typeof ListDirectMessagesResultSchema>

export const ListThreadRepliesResultSchema = Schema.Struct({
  replies: Schema.Array(ThreadMessageSchema),
  total: Schema.Number
}).annotations({ title: "ListThreadRepliesResult", description: "Result of list thread replies operation" })
export type ListThreadRepliesResult = Schema.Schema.Type<typeof ListThreadRepliesResultSchema>

export const AddThreadReplyResultSchema = Schema.Struct({
  id: ThreadReplyId,
  messageId: MessageId,
  channelId: ChannelId
}).annotations({ title: "AddThreadReplyResult", description: "Result of add thread reply operation" })
export type AddThreadReplyResult = Schema.Schema.Type<typeof AddThreadReplyResultSchema>

export const UpdateThreadReplyResultSchema = Schema.Struct({
  id: ThreadReplyId,
  updated: Schema.Boolean
}).annotations({ title: "UpdateThreadReplyResult", description: "Result of update thread reply operation" })
export type UpdateThreadReplyResult = Schema.Schema.Type<typeof UpdateThreadReplyResultSchema>

export const DeleteThreadReplyResultSchema = Schema.Struct({
  id: ThreadReplyId,
  deleted: Schema.Boolean
}).annotations({ title: "DeleteThreadReplyResult", description: "Result of delete thread reply operation" })
export type DeleteThreadReplyResult = Schema.Schema.Type<typeof DeleteThreadReplyResultSchema>
