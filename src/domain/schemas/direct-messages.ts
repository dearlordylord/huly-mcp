/**
 * Direct-message conversation schemas. Sibling to channels.ts but kept
 * separate to honour the per-file size limit and group all DM-specific
 * params, JSON schemas, parsers, and result types in one place.
 */
import { JSONSchema, Schema } from "effect"

import { MessageSummarySchema } from "./channels.js"
import {
  ChannelId,
  DEFAULT_LIMIT,
  DirectMessageIdentifier,
  LimitParam,
  ListTotal,
  MessageId,
  NonEmptyString,
  PersonRefInput
} from "./shared.js"

// --- List DM Messages Params ---

export const ListDmMessagesParamsSchema = Schema.Struct({
  dm: DirectMessageIdentifier.annotations({
    description:
      "Direct-message conversation: either the DM `_id` or a participant display name (e.g. `Kerr,Shannon`). A participant name resolves only to a one-to-one DM with the authenticated account."
  }),
  limit: Schema.optional(
    LimitParam.annotations({
      description: `Maximum number of messages to return (default: ${DEFAULT_LIMIT})`
    })
  )
}).annotations({
  title: "ListDmMessagesParams",
  description: "Parameters for listing messages in a direct-message conversation"
})

export type ListDmMessagesParams = Schema.Schema.Type<typeof ListDmMessagesParamsSchema>

// --- Send DM Message Params ---

export const SendDmMessageParamsSchema = Schema.Struct({
  dm: DirectMessageIdentifier.annotations({
    description:
      "Direct-message conversation: either the DM `_id` or a participant display name (e.g. `Kerr,Shannon`). A participant name resolves only to a one-to-one DM with the authenticated account."
  }),
  body: NonEmptyString.annotations({
    description: "Message body (markdown supported)"
  })
}).annotations({
  title: "SendDmMessageParams",
  description: "Parameters for sending a message to a direct-message conversation"
})

export type SendDmMessageParams = Schema.Schema.Type<typeof SendDmMessageParamsSchema>

// --- Update DM Message Params ---

export const UpdateDmMessageParamsSchema = Schema.Struct({
  dm: DirectMessageIdentifier.annotations({
    description:
      "Direct-message conversation: either the DM `_id` or a participant display name. A participant name resolves only to a one-to-one DM with the authenticated account."
  }),
  messageId: MessageId.annotations({
    description: "Message ID to update"
  }),
  body: NonEmptyString.annotations({
    description: "New message body (markdown supported)"
  })
}).annotations({
  title: "UpdateDmMessageParams",
  description: "Parameters for updating a direct-message message"
})

export type UpdateDmMessageParams = Schema.Schema.Type<typeof UpdateDmMessageParamsSchema>

// --- Delete DM Message Params ---

export const DeleteDmMessageParamsSchema = Schema.Struct({
  dm: DirectMessageIdentifier.annotations({
    description:
      "Direct-message conversation: either the DM `_id` or a participant display name. A participant name resolves only to a one-to-one DM with the authenticated account."
  }),
  messageId: MessageId.annotations({
    description: "Message ID to delete"
  })
}).annotations({
  title: "DeleteDmMessageParams",
  description: "Parameters for deleting a direct-message message"
})

export type DeleteDmMessageParams = Schema.Schema.Type<typeof DeleteDmMessageParamsSchema>

// --- Create DM Params ---

export const CreateDirectMessageParamsSchema = Schema.Struct({
  person: PersonRefInput.annotations({
    description:
      "Participant to open a one-to-one DM with: email address or exact display name (e.g. `Smith,Bill`). Resolved via the Employee mixin to a Huly account."
  })
}).annotations({
  title: "CreateDirectMessageParams",
  description:
    "Parameters for opening a one-to-one direct-message conversation with another workspace member. If a one-to-one DM with that participant already exists, it is returned unchanged."
})

export type CreateDirectMessageParams = Schema.Schema.Type<typeof CreateDirectMessageParamsSchema>

// --- JSON Schemas for MCP ---

export const listDmMessagesParamsJsonSchema = JSONSchema.make(ListDmMessagesParamsSchema)
export const sendDmMessageParamsJsonSchema = JSONSchema.make(SendDmMessageParamsSchema)
export const updateDmMessageParamsJsonSchema = JSONSchema.make(UpdateDmMessageParamsSchema)
export const deleteDmMessageParamsJsonSchema = JSONSchema.make(DeleteDmMessageParamsSchema)
export const createDirectMessageParamsJsonSchema = JSONSchema.make(CreateDirectMessageParamsSchema)

// --- Parsers ---

export const parseListDmMessagesParams = Schema.decodeUnknown(ListDmMessagesParamsSchema)
export const parseSendDmMessageParams = Schema.decodeUnknown(SendDmMessageParamsSchema)
export const parseUpdateDmMessageParams = Schema.decodeUnknown(UpdateDmMessageParamsSchema)
export const parseDeleteDmMessageParams = Schema.decodeUnknown(DeleteDmMessageParamsSchema)
export const parseCreateDirectMessageParams = Schema.decodeUnknown(CreateDirectMessageParamsSchema)
export const ListDmMessagesResultSchema = Schema.Struct({
  messages: Schema.Array(MessageSummarySchema),
  total: ListTotal
})
export type ListDmMessagesResult = Schema.Schema.Type<typeof ListDmMessagesResultSchema>
export const SendDmMessageResultSchema = Schema.Struct({
  id: MessageId,
  dmId: ChannelId
})
export type SendDmMessageResult = Schema.Schema.Type<typeof SendDmMessageResultSchema>
export const UpdateDmMessageResultSchema = Schema.Struct({
  id: MessageId,
  updated: Schema.Boolean
})
export type UpdateDmMessageResult = Schema.Schema.Type<typeof UpdateDmMessageResultSchema>
export const DeleteDmMessageResultSchema = Schema.Struct({
  id: MessageId,
  deleted: Schema.Boolean
})
export type DeleteDmMessageResult = Schema.Schema.Type<typeof DeleteDmMessageResultSchema>
export const CreateDirectMessageResultSchema = Schema.Struct({
  id: ChannelId,
  created: Schema.Boolean
})
export type CreateDirectMessageResult = Schema.Schema.Type<typeof CreateDirectMessageResultSchema>
