import { JSONSchema, Schema } from "effect"

import { clearableText } from "./clearable.js"
import {
  AccountUuid,
  assertUpdateFields,
  atLeastOneUpdateFieldMessage,
  ChannelId,
  ChannelIdentifier,
  ChannelName,
  Count,
  DEFAULT_INCLUDE_ARCHIVED,
  DEFAULT_LIMIT,
  DEFAULT_PRIVATE,
  hasAtLeastOneDefined,
  LimitParam,
  ListTotal,
  MessageId,
  NonEmptyString,
  PersonName,
  ThreadReplyId,
  withAtLeastOneRequired
} from "./shared.js"
export const ChannelSummarySchema = Schema.Struct({
  id: ChannelId,
  name: ChannelName,
  topic: Schema.optional(Schema.String),
  private: Schema.Boolean,
  archived: Schema.Boolean,
  members: Schema.optional(Count),
  messages: Schema.optional(Count),
  modifiedOn: Schema.optional(Schema.Number)
})
export type ChannelSummary = Schema.Schema.Type<typeof ChannelSummarySchema>
export const ChannelSchema = Schema.Struct({
  id: ChannelId,
  name: ChannelName,
  topic: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
  private: Schema.Boolean,
  archived: Schema.Boolean,
  members: Schema.optional(Schema.Array(PersonName)),
  messages: Schema.optional(Count),
  modifiedOn: Schema.optional(Schema.Number),
  createdOn: Schema.optional(Schema.Number)
})
export type Channel = Schema.Schema.Type<typeof ChannelSchema>
export const MessageSummarySchema = Schema.Struct({
  id: MessageId,
  body: Schema.String,
  sender: Schema.optional(PersonName),
  senderId: Schema.optional(Schema.String),
  createdOn: Schema.optional(Schema.Number),
  modifiedOn: Schema.optional(Schema.Number),
  editedOn: Schema.optional(Schema.Number),
  replies: Schema.optional(Count),
  attachments: Schema.optional(Count)
})
export type MessageSummary = Schema.Schema.Type<typeof MessageSummarySchema>
export const DirectMessageSummarySchema = Schema.Struct({
  id: ChannelId,
  participants: Schema.Array(PersonName),
  participantIds: Schema.optional(Schema.Array(AccountUuid)),
  messages: Schema.optional(Count),
  modifiedOn: Schema.optional(Schema.Number)
})
export type DirectMessageSummary = Schema.Schema.Type<typeof DirectMessageSummarySchema>

// --- List Channels Params ---

const ListChannelsParamsBase = Schema.Struct({
  nameSearch: Schema.optional(Schema.String.annotations({
    description: "Search channels by name substring (case-insensitive). Mutually exclusive with nameRegex."
  })),
  nameRegex: Schema.optional(Schema.String.annotations({
    description:
      "Filter channels by name using Huly $regex. On the supported Postgres backend this is SQL SIMILAR TO, not JavaScript RegExp; matching is case-sensitive and the pattern must match the whole name: use '%' for any string (e.g., '%dev%' contains, 'dev%' prefix). Mutually exclusive with nameSearch; use nameSearch for simple substring matching."
  })),
  topicSearch: Schema.optional(Schema.String.annotations({
    description: "Search channels by topic substring (case-insensitive)"
  })),
  limit: Schema.optional(
    LimitParam.annotations({
      description: `Maximum number of channels to return (default: ${DEFAULT_LIMIT})`
    })
  ),
  includeArchived: Schema.optional(
    Schema.Boolean.annotations({
      description: `Include archived channels in results (default: ${DEFAULT_INCLUDE_ARCHIVED})`
    })
  )
})

export const ListChannelsParamsSchema = ListChannelsParamsBase.pipe(
  Schema.filter((params) => {
    if (params.nameSearch !== undefined && params.nameRegex !== undefined) {
      return "Cannot provide both 'nameSearch' and 'nameRegex'. Use one or the other."
    }
    return undefined
  })
).annotations({
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
    description: `Whether channel is private (default: ${DEFAULT_PRIVATE})`
  }))
}).annotations({
  title: "CreateChannelParams",
  description: "Parameters for creating a channel"
})

export type CreateChannelParams = Schema.Schema.Type<typeof CreateChannelParamsSchema>

// --- Update Channel Params ---

export const UPDATE_CHANNEL_FIELDS = ["name", "topic"] as const satisfies ReadonlyArray<"name" | "topic">

export const UpdateChannelParamsSchema = Schema.Struct({
  channel: ChannelIdentifier.annotations({
    description: "Channel name or ID"
  }),
  name: Schema.optional(NonEmptyString.annotations({
    description: "New channel name"
  })),
  topic: Schema.optional(clearableText("New channel topic."))
}).pipe(
  Schema.filter((params) =>
    hasAtLeastOneDefined(params, UPDATE_CHANNEL_FIELDS)
      ? undefined
      : atLeastOneUpdateFieldMessage(UPDATE_CHANNEL_FIELDS)
  )
).annotations({
  title: "UpdateChannelParams",
  description: `Parameters for updating a channel. ${atLeastOneUpdateFieldMessage(UPDATE_CHANNEL_FIELDS)}`
})

export type UpdateChannelParams = Schema.Schema.Type<typeof UpdateChannelParamsSchema>
assertUpdateFields<UpdateChannelParams>()(["channel"], UPDATE_CHANNEL_FIELDS)

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
      description: `Maximum number of messages to return (default: ${DEFAULT_LIMIT})`
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

// --- Update Channel Message Params ---

export const UpdateChannelMessageParamsSchema = Schema.Struct({
  channel: ChannelIdentifier.annotations({
    description: "Channel name or ID"
  }),
  messageId: MessageId.annotations({
    description: "Message ID to update"
  }),
  body: NonEmptyString.annotations({
    description: "New message body (markdown supported)"
  })
}).annotations({
  title: "UpdateChannelMessageParams",
  description: "Parameters for updating a channel message"
})

export type UpdateChannelMessageParams = Schema.Schema.Type<typeof UpdateChannelMessageParamsSchema>

// --- Delete Channel Message Params ---

export const DeleteChannelMessageParamsSchema = Schema.Struct({
  channel: ChannelIdentifier.annotations({
    description: "Channel name or ID"
  }),
  messageId: MessageId.annotations({
    description: "Message ID to delete"
  })
}).annotations({
  title: "DeleteChannelMessageParams",
  description: "Parameters for deleting a channel message"
})

export type DeleteChannelMessageParams = Schema.Schema.Type<typeof DeleteChannelMessageParamsSchema>

// --- List Direct Messages Params ---

export const ListDirectMessagesParamsSchema = Schema.Struct({
  limit: Schema.optional(
    LimitParam.annotations({
      description: `Maximum number of DM conversations to return (default: ${DEFAULT_LIMIT})`
    })
  )
}).annotations({
  title: "ListDirectMessagesParams",
  description: "Parameters for listing direct message conversations"
})

export type ListDirectMessagesParams = Schema.Schema.Type<typeof ListDirectMessagesParamsSchema>
export const ThreadMessageSchema = Schema.Struct({
  id: ThreadReplyId,
  body: Schema.String,
  sender: Schema.optional(PersonName),
  senderId: Schema.optional(Schema.String),
  createdOn: Schema.optional(Schema.Number),
  modifiedOn: Schema.optional(Schema.Number),
  editedOn: Schema.optional(Schema.Number),
  attachments: Schema.optional(Count)
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
      description: `Maximum number of replies to return (default: ${DEFAULT_LIMIT})`
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
export const updateChannelParamsJsonSchema = withAtLeastOneRequired(
  JSONSchema.make(UpdateChannelParamsSchema),
  UPDATE_CHANNEL_FIELDS
)
export const deleteChannelParamsJsonSchema = JSONSchema.make(DeleteChannelParamsSchema)
export const listChannelMessagesParamsJsonSchema = JSONSchema.make(ListChannelMessagesParamsSchema)
export const sendChannelMessageParamsJsonSchema = JSONSchema.make(SendChannelMessageParamsSchema)
export const updateChannelMessageParamsJsonSchema = JSONSchema.make(UpdateChannelMessageParamsSchema)
export const deleteChannelMessageParamsJsonSchema = JSONSchema.make(DeleteChannelMessageParamsSchema)
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
export const parseUpdateChannelMessageParams = Schema.decodeUnknown(UpdateChannelMessageParamsSchema)
export const parseDeleteChannelMessageParams = Schema.decodeUnknown(DeleteChannelMessageParamsSchema)
export const parseListDirectMessagesParams = Schema.decodeUnknown(ListDirectMessagesParamsSchema)
export const parseListThreadRepliesParams = Schema.decodeUnknown(ListThreadRepliesParamsSchema)
export const parseAddThreadReplyParams = Schema.decodeUnknown(AddThreadReplyParamsSchema)
export const parseUpdateThreadReplyParams = Schema.decodeUnknown(UpdateThreadReplyParamsSchema)
export const parseDeleteThreadReplyParams = Schema.decodeUnknown(DeleteThreadReplyParamsSchema)
export const CreateChannelResultSchema = Schema.Struct({
  id: ChannelId,
  name: ChannelName
})
export type CreateChannelResult = Schema.Schema.Type<typeof CreateChannelResultSchema>
export const UpdateChannelResultSchema = Schema.Struct({
  id: ChannelId,
  updated: Schema.Boolean
})
export type UpdateChannelResult = Schema.Schema.Type<typeof UpdateChannelResultSchema>
export const DeleteChannelResultSchema = Schema.Struct({
  id: ChannelId,
  deleted: Schema.Boolean
})
export type DeleteChannelResult = Schema.Schema.Type<typeof DeleteChannelResultSchema>
export const ListChannelMessagesResultSchema = Schema.Struct({
  messages: Schema.Array(MessageSummarySchema),
  total: ListTotal
})
export type ListChannelMessagesResult = Schema.Schema.Type<typeof ListChannelMessagesResultSchema>
export const SendChannelMessageResultSchema = Schema.Struct({
  id: MessageId,
  channelId: ChannelId
})
export type SendChannelMessageResult = Schema.Schema.Type<typeof SendChannelMessageResultSchema>
export const UpdateChannelMessageResultSchema = Schema.Struct({
  id: MessageId,
  updated: Schema.Boolean
})
export type UpdateChannelMessageResult = Schema.Schema.Type<typeof UpdateChannelMessageResultSchema>
export const DeleteChannelMessageResultSchema = Schema.Struct({
  id: MessageId,
  deleted: Schema.Boolean
})
export type DeleteChannelMessageResult = Schema.Schema.Type<typeof DeleteChannelMessageResultSchema>
export const ListDirectMessagesResultSchema = Schema.Struct({
  conversations: Schema.Array(DirectMessageSummarySchema),
  total: ListTotal
})
export type ListDirectMessagesResult = Schema.Schema.Type<typeof ListDirectMessagesResultSchema>
export const ListThreadRepliesResultSchema = Schema.Struct({
  replies: Schema.Array(ThreadMessageSchema),
  total: ListTotal
})
export type ListThreadRepliesResult = Schema.Schema.Type<typeof ListThreadRepliesResultSchema>
export const AddThreadReplyResultSchema = Schema.Struct({
  id: ThreadReplyId,
  messageId: MessageId,
  channelId: ChannelId
})
export type AddThreadReplyResult = Schema.Schema.Type<typeof AddThreadReplyResultSchema>
export const UpdateThreadReplyResultSchema = Schema.Struct({
  id: ThreadReplyId,
  updated: Schema.Boolean
})
export type UpdateThreadReplyResult = Schema.Schema.Type<typeof UpdateThreadReplyResultSchema>
export const DeleteThreadReplyResultSchema = Schema.Struct({
  id: ThreadReplyId,
  deleted: Schema.Boolean
})
export type DeleteThreadReplyResult = Schema.Schema.Type<typeof DeleteThreadReplyResultSchema>

export const ListChannelsResultSchema = Schema.Array(ChannelSummarySchema)
export type ListChannelsResult = Schema.Schema.Type<typeof ListChannelsResultSchema>
