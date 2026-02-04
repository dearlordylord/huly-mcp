import {
  addReactionParamsJsonSchema,
  listActivityParamsJsonSchema,
  listMentionsParamsJsonSchema,
  listReactionsParamsJsonSchema,
  listSavedMessagesParamsJsonSchema,
  parseAddReactionParams,
  parseListActivityParams,
  parseListMentionsParams,
  parseListReactionsParams,
  parseListSavedMessagesParams,
  parseRemoveReactionParams,
  parseSaveMessageParams,
  parseUnsaveMessageParams,
  removeReactionParamsJsonSchema,
  saveMessageParamsJsonSchema,
  unsaveMessageParamsJsonSchema
} from "../../domain/schemas/activity.js"
import {
  addReaction,
  listActivity,
  listMentions,
  listReactions,
  listSavedMessages,
  removeReaction,
  saveMessage,
  unsaveMessage
} from "../../huly/operations/activity.js"
import { createToolHandler, type RegisteredTool } from "./registry.js"

const CATEGORY = "Activity" as const

export const activityTools: ReadonlyArray<RegisteredTool> = [
  {
    name: "list_activity",
    description: "List activity messages for a Huly object. Returns activity sorted by date (newest first).",
    category: CATEGORY,
    inputSchema: listActivityParamsJsonSchema,
    handler: createToolHandler(
      "list_activity",
      parseListActivityParams,
      (params) => listActivity(params)
    )
  },
  {
    name: "add_reaction",
    description: "Add an emoji reaction to an activity message.",
    category: CATEGORY,
    inputSchema: addReactionParamsJsonSchema,
    handler: createToolHandler(
      "add_reaction",
      parseAddReactionParams,
      (params) => addReaction(params)
    )
  },
  {
    name: "remove_reaction",
    description: "Remove an emoji reaction from an activity message.",
    category: CATEGORY,
    inputSchema: removeReactionParamsJsonSchema,
    handler: createToolHandler(
      "remove_reaction",
      parseRemoveReactionParams,
      (params) => removeReaction(params)
    )
  },
  {
    name: "list_reactions",
    description: "List reactions on an activity message.",
    category: CATEGORY,
    inputSchema: listReactionsParamsJsonSchema,
    handler: createToolHandler(
      "list_reactions",
      parseListReactionsParams,
      (params) => listReactions(params)
    )
  },
  {
    name: "save_message",
    description: "Save/bookmark an activity message for later reference.",
    category: CATEGORY,
    inputSchema: saveMessageParamsJsonSchema,
    handler: createToolHandler(
      "save_message",
      parseSaveMessageParams,
      (params) => saveMessage(params)
    )
  },
  {
    name: "unsave_message",
    description: "Remove an activity message from saved/bookmarks.",
    category: CATEGORY,
    inputSchema: unsaveMessageParamsJsonSchema,
    handler: createToolHandler(
      "unsave_message",
      parseUnsaveMessageParams,
      (params) => unsaveMessage(params)
    )
  },
  {
    name: "list_saved_messages",
    description: "List saved/bookmarked activity messages.",
    category: CATEGORY,
    inputSchema: listSavedMessagesParamsJsonSchema,
    handler: createToolHandler(
      "list_saved_messages",
      parseListSavedMessagesParams,
      (params) => listSavedMessages(params)
    )
  },
  {
    name: "list_mentions",
    description: "List @mentions of the current user in activity messages.",
    category: CATEGORY,
    inputSchema: listMentionsParamsJsonSchema,
    handler: createToolHandler(
      "list_mentions",
      parseListMentionsParams,
      (params) => listMentions(params)
    )
  }
]
