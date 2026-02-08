import { Schema } from "effect"

import {
  ActivityMessageId,
  EmojiCode,
  LimitParam,
  makeJsonSchema,
  NonEmptyString,
  ObjectClassName,
  Timestamp
} from "./shared.js"

export const ActivityMessageSchema = Schema.Struct({
  id: ActivityMessageId,
  objectId: NonEmptyString.annotations({ description: "ID of the object this message is attached to" }),
  objectClass: ObjectClassName.annotations({ description: "Class of the object this message is attached to" }),
  modifiedBy: Schema.optional(NonEmptyString),
  modifiedOn: Schema.optional(Timestamp),
  isPinned: Schema.optional(Schema.Boolean),
  replies: Schema.optional(Schema.Number),
  reactions: Schema.optional(Schema.Number),
  editedOn: Schema.optional(Schema.NullOr(Timestamp)),
  action: Schema.optional(Schema.String.annotations({ description: "Action type: create, update, remove" })),
  message: Schema.optional(Schema.String.annotations({ description: "Message content if activity reference" }))
}).annotations({
  title: "ActivityMessage",
  description: "Activity feed message"
})

export type ActivityMessage = Schema.Schema.Type<typeof ActivityMessageSchema>

export const ReactionSchema = Schema.Struct({
  id: NonEmptyString,
  messageId: ActivityMessageId.annotations({ description: "ID of the message this reaction is on" }),
  emoji: EmojiCode.annotations({ description: "Emoji code (e.g., ':thumbsup:' or unicode)" }),
  createdBy: Schema.optional(NonEmptyString)
}).annotations({
  title: "Reaction",
  description: "Reaction on an activity message"
})

export type Reaction = Schema.Schema.Type<typeof ReactionSchema>

export const SavedMessageSchema = Schema.Struct({
  id: NonEmptyString,
  messageId: ActivityMessageId.annotations({ description: "ID of the saved activity message" })
}).annotations({
  title: "SavedMessage",
  description: "Bookmarked activity message"
})

export type SavedMessage = Schema.Schema.Type<typeof SavedMessageSchema>

export const MentionSchema = Schema.Struct({
  id: NonEmptyString,
  messageId: ActivityMessageId.annotations({ description: "ID of the message containing the mention" }),
  userId: NonEmptyString.annotations({ description: "ID of the mentioned user" }),
  content: Schema.optional(Schema.String.annotations({ description: "Content snippet with the mention" }))
}).annotations({
  title: "Mention",
  description: "User mention in an activity message"
})

export type Mention = Schema.Schema.Type<typeof MentionSchema>

export const ListActivityParamsSchema = Schema.Struct({
  objectId: NonEmptyString.annotations({
    description: "ID of the object to get activity for"
  }),
  objectClass: ObjectClassName.annotations({
    description: "Class of the object (e.g., 'tracker:class:Issue')"
  }),
  limit: Schema.optional(
    LimitParam.annotations({
      description: "Maximum number of activity messages to return (default: 50)"
    })
  )
}).annotations({
  title: "ListActivityParams",
  description: "Parameters for listing activity on an object"
})

export type ListActivityParams = Schema.Schema.Type<typeof ListActivityParamsSchema>

export const AddReactionParamsSchema = Schema.Struct({
  messageId: ActivityMessageId.annotations({
    description: "ID of the activity message to react to"
  }),
  emoji: EmojiCode.annotations({
    description: "Emoji to add (e.g., ':thumbsup:', ':heart:', or unicode emoji)"
  })
}).annotations({
  title: "AddReactionParams",
  description: "Parameters for adding a reaction to a message"
})

export type AddReactionParams = Schema.Schema.Type<typeof AddReactionParamsSchema>

export const RemoveReactionParamsSchema = Schema.Struct({
  messageId: ActivityMessageId.annotations({
    description: "ID of the activity message"
  }),
  emoji: EmojiCode.annotations({
    description: "Emoji to remove"
  })
}).annotations({
  title: "RemoveReactionParams",
  description: "Parameters for removing a reaction from a message"
})

export type RemoveReactionParams = Schema.Schema.Type<typeof RemoveReactionParamsSchema>

export const ListReactionsParamsSchema = Schema.Struct({
  messageId: ActivityMessageId.annotations({
    description: "ID of the activity message to list reactions for"
  }),
  limit: Schema.optional(
    LimitParam.annotations({
      description: "Maximum number of reactions to return (default: 50)"
    })
  )
}).annotations({
  title: "ListReactionsParams",
  description: "Parameters for listing reactions on a message"
})

export type ListReactionsParams = Schema.Schema.Type<typeof ListReactionsParamsSchema>

export const SaveMessageParamsSchema = Schema.Struct({
  messageId: ActivityMessageId.annotations({
    description: "ID of the activity message to save/bookmark"
  })
}).annotations({
  title: "SaveMessageParams",
  description: "Parameters for saving/bookmarking a message"
})

export type SaveMessageParams = Schema.Schema.Type<typeof SaveMessageParamsSchema>

export const UnsaveMessageParamsSchema = Schema.Struct({
  messageId: ActivityMessageId.annotations({
    description: "ID of the saved activity message to remove from bookmarks"
  })
}).annotations({
  title: "UnsaveMessageParams",
  description: "Parameters for removing a message from bookmarks"
})

export type UnsaveMessageParams = Schema.Schema.Type<typeof UnsaveMessageParamsSchema>

export const ListSavedMessagesParamsSchema = Schema.Struct({
  limit: Schema.optional(
    LimitParam.annotations({
      description: "Maximum number of saved messages to return (default: 50)"
    })
  )
}).annotations({
  title: "ListSavedMessagesParams",
  description: "Parameters for listing saved/bookmarked messages"
})

export type ListSavedMessagesParams = Schema.Schema.Type<typeof ListSavedMessagesParamsSchema>

export const ListMentionsParamsSchema = Schema.Struct({
  limit: Schema.optional(
    LimitParam.annotations({
      description: "Maximum number of mentions to return (default: 50)"
    })
  )
}).annotations({
  title: "ListMentionsParams",
  description: "Parameters for listing mentions of the current user"
})

export type ListMentionsParams = Schema.Schema.Type<typeof ListMentionsParamsSchema>

export const listActivityParamsJsonSchema = makeJsonSchema(ListActivityParamsSchema)
export const addReactionParamsJsonSchema = makeJsonSchema(AddReactionParamsSchema)
export const removeReactionParamsJsonSchema = makeJsonSchema(RemoveReactionParamsSchema)
export const listReactionsParamsJsonSchema = makeJsonSchema(ListReactionsParamsSchema)
export const saveMessageParamsJsonSchema = makeJsonSchema(SaveMessageParamsSchema)
export const unsaveMessageParamsJsonSchema = makeJsonSchema(UnsaveMessageParamsSchema)
export const listSavedMessagesParamsJsonSchema = makeJsonSchema(ListSavedMessagesParamsSchema)
export const listMentionsParamsJsonSchema = makeJsonSchema(ListMentionsParamsSchema)

export const parseListActivityParams = Schema.decodeUnknown(ListActivityParamsSchema)
export const parseAddReactionParams = Schema.decodeUnknown(AddReactionParamsSchema)
export const parseRemoveReactionParams = Schema.decodeUnknown(RemoveReactionParamsSchema)
export const parseListReactionsParams = Schema.decodeUnknown(ListReactionsParamsSchema)
export const parseSaveMessageParams = Schema.decodeUnknown(SaveMessageParamsSchema)
export const parseUnsaveMessageParams = Schema.decodeUnknown(UnsaveMessageParamsSchema)
export const parseListSavedMessagesParams = Schema.decodeUnknown(ListSavedMessagesParamsSchema)
export const parseListMentionsParams = Schema.decodeUnknown(ListMentionsParamsSchema)
