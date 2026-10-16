import {
  listPinnedChatMessagesParamsJsonSchema,
  ListPinnedChatMessagesResultSchema,
  parseListPinnedChatMessagesParams,
  parseRequestChannelAccessParams,
  parseSetChatMessagePinnedParams,
  parseTranslateChatMessageParams,
  requestChannelAccessParamsJsonSchema,
  RequestChannelAccessResultSchema,
  setChatMessagePinnedParamsJsonSchema,
  SetChatMessagePinnedResultSchema,
  translateChatMessageParamsJsonSchema,
  TranslateChatMessageResultSchema
} from "../../domain/schemas/chat-message-workflows.js"
import {
  listPinnedChatMessages,
  requestChannelAccess,
  setChatMessagePinned,
  translateChatMessage
} from "../../huly/operations/chat-message-workflows.js"
import { defineTool, type RegisteredTool } from "./registry.js"

const CATEGORY = "channels" as const

export const channelMessageWorkflowTools = [
  defineTool(
    {
      name: "list_pinned_chat_messages",
      description:
        "List pinned top-level messages and pinned thread replies in exactly one Huly channel or direct-message conversation. Provide `channel` (name or ID) or `dm` (DM ID or one-to-one participant name), not both. Results are newest-first across both message kinds.",
      category: CATEGORY,
      inputSchema: listPinnedChatMessagesParamsJsonSchema,
      resultSchema: ListPinnedChatMessagesResultSchema
    },
    parseListPinnedChatMessagesParams,
    listPinnedChatMessages
  ),
  defineTool(
    {
      name: "set_chat_message_pinned",
      description:
        "Idempotently pin or unpin a top-level message or thread reply located inside exactly one Huly channel or direct-message conversation. Provide `channel` or `dm`, plus the messageId; the message must belong to the resolved conversation.",
      category: CATEGORY,
      inputSchema: setChatMessagePinnedParamsJsonSchema,
      resultSchema: SetChatMessagePinnedResultSchema
    },
    parseSetChatMessagePinnedParams,
    setChatMessagePinned
  ),
  defineTool(
    {
      name: "request_channel_access",
      description:
        "Attempt the Huly private-channel request-access workflow by channel name or ID. The current Chunter SDK/model has no stable request-access record or server action, so this build returns supported=false with a stable reasonCode and performs no mutation.",
      category: CATEGORY,
      inputSchema: requestChannelAccessParamsJsonSchema,
      resultSchema: RequestChannelAccessResultSchema
    },
    parseRequestChannelAccessParams,
    requestChannelAccess
  ),
  defineTool(
    {
      name: "translate_chat_message",
      description:
        "Attempt to translate a located Huly channel/DM message to targetLanguage. Current Huly translation is browser-only, uses an optional AI endpoint, and stores results only in UI state; this build returns supported=false with a stable reasonCode and does not fabricate translated text.",
      category: CATEGORY,
      inputSchema: translateChatMessageParamsJsonSchema,
      resultSchema: TranslateChatMessageResultSchema
    },
    parseTranslateChatMessageParams,
    translateChatMessage
  )
] as const satisfies ReadonlyArray<RegisteredTool>
