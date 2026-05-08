/**
 * Direct-message conversation schemas. Sibling to channels.ts but kept
 * separate to honour the per-file size limit and group all DM-specific
 * params, JSON schemas, parsers, and result types in one place.
 */
import { JSONSchema, Schema } from "effect"

import type { MessageSummary } from "./channels.js"
import type { ChannelId } from "./shared.js"
import { DirectMessageIdentifier, LimitParam, MessageId, NonEmptyString } from "./shared.js"

// --- List DM Messages Params ---

export const ListDmMessagesParamsSchema = Schema.Struct({
  dm: DirectMessageIdentifier.annotations({
    description:
      "Direct-message conversation: either the DM `_id` or a participant display name (e.g. `Kerr,Shannon`). A participant name resolves only to a one-to-one DM with the authenticated account."
  }),
  limit: Schema.optional(
    LimitParam.annotations({
      description: "Maximum number of messages to return (default: 50)"
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

// --- JSON Schemas for MCP ---

export const listDmMessagesParamsJsonSchema = JSONSchema.make(ListDmMessagesParamsSchema)
export const sendDmMessageParamsJsonSchema = JSONSchema.make(SendDmMessageParamsSchema)
export const updateDmMessageParamsJsonSchema = JSONSchema.make(UpdateDmMessageParamsSchema)
export const deleteDmMessageParamsJsonSchema = JSONSchema.make(DeleteDmMessageParamsSchema)

// --- Parsers ---

export const parseListDmMessagesParams = Schema.decodeUnknown(ListDmMessagesParamsSchema)
export const parseSendDmMessageParams = Schema.decodeUnknown(SendDmMessageParamsSchema)
export const parseUpdateDmMessageParams = Schema.decodeUnknown(UpdateDmMessageParamsSchema)
export const parseDeleteDmMessageParams = Schema.decodeUnknown(DeleteDmMessageParamsSchema)

// --- Result Types ---

export interface ListDmMessagesResult {
  readonly messages: ReadonlyArray<MessageSummary>
  readonly total: number
}

export interface SendDmMessageResult {
  readonly id: MessageId
  readonly dmId: ChannelId
}

export interface UpdateDmMessageResult {
  readonly id: MessageId
  readonly updated: boolean
}

export interface DeleteDmMessageResult {
  readonly id: MessageId
  readonly deleted: boolean
}
