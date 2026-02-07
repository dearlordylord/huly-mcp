import { Schema } from "effect"

import { LimitParam, makeJsonSchema, NonEmptyString, Timestamp } from "./shared.js"

// --- Channel Summary (for list operations) ---

export const ChannelSummarySchema = Schema.Struct({
  id: NonEmptyString,
  name: Schema.String,
  topic: Schema.optional(Schema.String),
  private: Schema.Boolean,
  archived: Schema.Boolean,
  members: Schema.optional(Schema.Number),
  messages: Schema.optional(Schema.Number),
  modifiedOn: Schema.optional(Timestamp)
}).annotations({
  title: "ChannelSummary",
  description: "Channel summary for list operations"
})

export type ChannelSummary = Schema.Schema.Type<typeof ChannelSummarySchema>

// --- Full Channel ---

export const ChannelSchema = Schema.Struct({
  id: NonEmptyString,
  name: Schema.String,
  topic: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
  private: Schema.Boolean,
  archived: Schema.Boolean,
  members: Schema.optional(Schema.Array(Schema.String)),
  messages: Schema.optional(Schema.Number),
  modifiedOn: Schema.optional(Timestamp),
  createdOn: Schema.optional(Timestamp)
}).annotations({
  title: "Channel",
  description: "Full channel with all fields"
})

export type Channel = Schema.Schema.Type<typeof ChannelSchema>

// --- Message Summary ---

export const MessageSummarySchema = Schema.Struct({
  id: NonEmptyString,
  body: Schema.String,
  sender: Schema.optional(Schema.String),
  senderId: Schema.optional(Schema.String),
  createdOn: Schema.optional(Timestamp),
  modifiedOn: Schema.optional(Timestamp),
  editedOn: Schema.optional(Timestamp),
  replies: Schema.optional(Schema.Number)
}).annotations({
  title: "MessageSummary",
  description: "Message summary for list operations"
})

export type MessageSummary = Schema.Schema.Type<typeof MessageSummarySchema>

// --- Direct Message Conversation Summary ---

export const DirectMessageSummarySchema = Schema.Struct({
  id: NonEmptyString,
  participants: Schema.Array(Schema.String),
  participantIds: Schema.optional(Schema.Array(Schema.String)),
  messages: Schema.optional(Schema.Number),
  modifiedOn: Schema.optional(Timestamp)
}).annotations({
  title: "DirectMessageSummary",
  description: "Direct message conversation summary"
})

export type DirectMessageSummary = Schema.Schema.Type<typeof DirectMessageSummarySchema>

// --- List Channels Params ---

export const ListChannelsParamsSchema = Schema.Struct({
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
  channel: NonEmptyString.annotations({
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
  channel: NonEmptyString.annotations({
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
  channel: NonEmptyString.annotations({
    description: "Channel name or ID"
  })
}).annotations({
  title: "DeleteChannelParams",
  description: "Parameters for deleting a channel"
})

export type DeleteChannelParams = Schema.Schema.Type<typeof DeleteChannelParamsSchema>

// --- List Channel Messages Params ---

export const ListChannelMessagesParamsSchema = Schema.Struct({
  channel: NonEmptyString.annotations({
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
  channel: NonEmptyString.annotations({
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

// --- JSON Schemas for MCP ---

export const listChannelsParamsJsonSchema = makeJsonSchema(ListChannelsParamsSchema)
export const getChannelParamsJsonSchema = makeJsonSchema(GetChannelParamsSchema)
export const createChannelParamsJsonSchema = makeJsonSchema(CreateChannelParamsSchema)
export const updateChannelParamsJsonSchema = makeJsonSchema(UpdateChannelParamsSchema)
export const deleteChannelParamsJsonSchema = makeJsonSchema(DeleteChannelParamsSchema)
export const listChannelMessagesParamsJsonSchema = makeJsonSchema(ListChannelMessagesParamsSchema)
export const sendChannelMessageParamsJsonSchema = makeJsonSchema(SendChannelMessageParamsSchema)
export const listDirectMessagesParamsJsonSchema = makeJsonSchema(ListDirectMessagesParamsSchema)

// --- Parsers ---

export const parseListChannelsParams = Schema.decodeUnknown(ListChannelsParamsSchema)
export const parseGetChannelParams = Schema.decodeUnknown(GetChannelParamsSchema)
export const parseCreateChannelParams = Schema.decodeUnknown(CreateChannelParamsSchema)
export const parseUpdateChannelParams = Schema.decodeUnknown(UpdateChannelParamsSchema)
export const parseDeleteChannelParams = Schema.decodeUnknown(DeleteChannelParamsSchema)
export const parseListChannelMessagesParams = Schema.decodeUnknown(ListChannelMessagesParamsSchema)
export const parseSendChannelMessageParams = Schema.decodeUnknown(SendChannelMessageParamsSchema)
export const parseListDirectMessagesParams = Schema.decodeUnknown(ListDirectMessagesParamsSchema)
