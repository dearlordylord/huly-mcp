import {
  addReactionParamsJsonSchema,
  AddReactionResultSchema,
  listActivityParamsJsonSchema,
  ListActivityResultSchema,
  listMentionsParamsJsonSchema,
  ListMentionsResultSchema,
  listReactionsParamsJsonSchema,
  ListReactionsResultSchema,
  listSavedMessagesParamsJsonSchema,
  ListSavedMessagesResultSchema,
  parseAddReactionParams,
  parseListActivityParams,
  parseListMentionsParams,
  parseListReactionsParams,
  parseListSavedMessagesParams,
  parseRemoveReactionParams,
  parseSaveMessageParams,
  parseUnsaveMessageParams,
  removeReactionParamsJsonSchema,
  RemoveReactionResultSchema,
  saveMessageParamsJsonSchema,
  SaveMessageResultSchema,
  unsaveMessageParamsJsonSchema,
  UnsaveMessageResultSchema
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
import { createEncodedToolHandler, type RegisteredTool } from "./registry.js"

const CATEGORY = "activity" as const

export const activityTools: ReadonlyArray<RegisteredTool> = [
  {
    name: "list_activity",
    description: "List activity messages for a Huly object. Returns activity sorted by date (newest first).",
    category: CATEGORY,
    inputSchema: listActivityParamsJsonSchema,
    handler: createEncodedToolHandler(
      "list_activity",
      parseListActivityParams,
      listActivity,
      ListActivityResultSchema
    )
  },
  {
    name: "add_reaction",
    description: "Add an emoji reaction to an activity message.",
    category: CATEGORY,
    inputSchema: addReactionParamsJsonSchema,
    handler: createEncodedToolHandler(
      "add_reaction",
      parseAddReactionParams,
      addReaction,
      AddReactionResultSchema
    )
  },
  {
    name: "remove_reaction",
    description: "Remove an emoji reaction from an activity message.",
    category: CATEGORY,
    inputSchema: removeReactionParamsJsonSchema,
    handler: createEncodedToolHandler(
      "remove_reaction",
      parseRemoveReactionParams,
      removeReaction,
      RemoveReactionResultSchema
    )
  },
  {
    name: "list_reactions",
    description: "List reactions on an activity message.",
    category: CATEGORY,
    inputSchema: listReactionsParamsJsonSchema,
    handler: createEncodedToolHandler(
      "list_reactions",
      parseListReactionsParams,
      listReactions,
      ListReactionsResultSchema
    )
  },
  {
    name: "save_message",
    description: "Save/bookmark an activity message for later reference.",
    category: CATEGORY,
    inputSchema: saveMessageParamsJsonSchema,
    handler: createEncodedToolHandler(
      "save_message",
      parseSaveMessageParams,
      saveMessage,
      SaveMessageResultSchema
    )
  },
  {
    name: "unsave_message",
    description: "Remove an activity message from saved/bookmarks.",
    category: CATEGORY,
    inputSchema: unsaveMessageParamsJsonSchema,
    handler: createEncodedToolHandler(
      "unsave_message",
      parseUnsaveMessageParams,
      unsaveMessage,
      UnsaveMessageResultSchema
    )
  },
  {
    name: "list_saved_messages",
    description: "List saved/bookmarked activity messages.",
    category: CATEGORY,
    inputSchema: listSavedMessagesParamsJsonSchema,
    handler: createEncodedToolHandler(
      "list_saved_messages",
      parseListSavedMessagesParams,
      listSavedMessages,
      ListSavedMessagesResultSchema
    )
  },
  {
    name: "list_mentions",
    description: "List @mentions of the current user in activity messages.",
    category: CATEGORY,
    inputSchema: listMentionsParamsJsonSchema,
    handler: createEncodedToolHandler(
      "list_mentions",
      parseListMentionsParams,
      listMentions,
      ListMentionsResultSchema
    )
  }
]
