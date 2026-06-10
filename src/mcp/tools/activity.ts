import {
  addActivityReplyParamsJsonSchema,
  AddActivityReplyResultSchema,
  deleteActivityReplyParamsJsonSchema,
  DeleteActivityReplyResultSchema,
  getActivityMessageParamsJsonSchema,
  GetActivityMessageResultSchema,
  listActivityFiltersParamsJsonSchema,
  ListActivityFiltersResultSchema,
  listActivityReferencesParamsJsonSchema,
  ListActivityReferencesResultSchema,
  listActivityRepliesParamsJsonSchema,
  ListActivityRepliesResultSchema,
  parseAddActivityReplyParams,
  parseDeleteActivityReplyParams,
  parseGetActivityMessageParams,
  parseListActivityFiltersParams,
  parseListActivityReferencesParams,
  parseListActivityRepliesParams,
  parsePinActivityMessageParams,
  parseUpdateActivityReplyParams,
  pinActivityMessageParamsJsonSchema,
  PinActivityMessageResultSchema,
  updateActivityReplyParamsJsonSchema,
  UpdateActivityReplyResultSchema
} from "../../domain/schemas/activity-messages.js"
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
  addActivityReply,
  deleteActivityReply,
  getActivityMessage,
  listActivityFilters,
  listActivityReferences,
  listActivityReplies,
  pinActivityMessage,
  updateActivityReply
} from "../../huly/operations/activity-messages.js"
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
    description:
      "List activity messages for a Huly issue, document, channel, or raw Huly object. Prefer friendly targets: project+issueIdentifier for issues, teamspace+document for documents, or channel for channels. Advanced callers may pass objectId+objectClass directly. Returns activity sorted by date (newest first).",
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
    name: "get_activity_message",
    description: "Get a single activity message by ID, including subclass metadata when available.",
    category: CATEGORY,
    inputSchema: getActivityMessageParamsJsonSchema,
    handler: createEncodedToolHandler(
      "get_activity_message",
      parseGetActivityMessageParams,
      getActivityMessage,
      GetActivityMessageResultSchema
    )
  },
  {
    name: "pin_activity_message",
    description: "Pin or unpin an activity message. Idempotent when the pin state already matches.",
    category: CATEGORY,
    inputSchema: pinActivityMessageParamsJsonSchema,
    handler: createEncodedToolHandler(
      "pin_activity_message",
      parsePinActivityMessageParams,
      pinActivityMessage,
      PinActivityMessageResultSchema
    )
  },
  {
    name: "list_activity_filters",
    description: "List configured activity filters in display order.",
    category: CATEGORY,
    inputSchema: listActivityFiltersParamsJsonSchema,
    handler: createEncodedToolHandler(
      "list_activity_filters",
      parseListActivityFiltersParams,
      listActivityFilters,
      ListActivityFiltersResultSchema
    )
  },
  {
    name: "list_activity_references",
    description:
      "List activity references connected to a raw Huly object. Use direction to list references from the object, to the object, or both.",
    category: CATEGORY,
    inputSchema: listActivityReferencesParamsJsonSchema,
    handler: createEncodedToolHandler(
      "list_activity_references",
      parseListActivityReferencesParams,
      listActivityReferences,
      ListActivityReferencesResultSchema
    )
  },
  {
    name: "list_activity_replies",
    description: "List thread replies on any activity message, not only channel messages.",
    category: CATEGORY,
    inputSchema: listActivityRepliesParamsJsonSchema,
    handler: createEncodedToolHandler(
      "list_activity_replies",
      parseListActivityRepliesParams,
      listActivityReplies,
      ListActivityRepliesResultSchema
    )
  },
  {
    name: "add_activity_reply",
    description: "Add a Markdown reply to any activity message.",
    category: CATEGORY,
    inputSchema: addActivityReplyParamsJsonSchema,
    handler: createEncodedToolHandler(
      "add_activity_reply",
      parseAddActivityReplyParams,
      addActivityReply,
      AddActivityReplyResultSchema
    )
  },
  {
    name: "update_activity_reply",
    description: "Update a generic activity reply body.",
    category: CATEGORY,
    inputSchema: updateActivityReplyParamsJsonSchema,
    handler: createEncodedToolHandler(
      "update_activity_reply",
      parseUpdateActivityReplyParams,
      updateActivityReply,
      UpdateActivityReplyResultSchema
    )
  },
  {
    name: "delete_activity_reply",
    description: "Delete a generic activity reply.",
    category: CATEGORY,
    inputSchema: deleteActivityReplyParamsJsonSchema,
    handler: createEncodedToolHandler(
      "delete_activity_reply",
      parseDeleteActivityReplyParams,
      deleteActivityReply,
      DeleteActivityReplyResultSchema
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
