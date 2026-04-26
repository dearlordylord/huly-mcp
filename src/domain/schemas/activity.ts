import { JSONSchema, Schema } from "effect"

import {
  ActivityMessageId,
  EmojiCode,
  LimitParam,
  MentionId,
  NonEmptyString,
  ObjectClassName,
  PersonId,
  ReactionId,
  SavedMessageId,
  Timestamp
} from "./shared.js"

export const ActivityCount = Schema.NonNegativeInt.annotations({
  identifier: "ActivityCount",
  title: "ActivityCount",
  description: "Non-negative integer count for activity replies or reactions"
})
export type ActivityCount = Schema.Schema.Type<typeof ActivityCount>

const ActivityAction = Schema.Literal("create", "update", "remove")
type ActivityAction = Schema.Schema.Type<typeof ActivityAction>

export interface ActivityMessage {
  readonly id: ActivityMessageId
  readonly objectId: NonEmptyString
  readonly objectClass: ObjectClassName
  readonly modifiedBy?: PersonId | undefined
  readonly modifiedOn?: Timestamp | undefined
  readonly isPinned?: boolean | undefined
  readonly replies?: ActivityCount | undefined
  readonly reactions?: ActivityCount | undefined
  readonly editedOn?: Timestamp | null | undefined
  readonly action?: ActivityAction | undefined
  readonly message?: string | undefined
}

export interface Reaction {
  readonly id: ReactionId
  readonly messageId: ActivityMessageId
  readonly emoji: EmojiCode
  readonly createdBy?: PersonId | undefined
}

export interface SavedMessage {
  readonly id: SavedMessageId
  readonly messageId: ActivityMessageId
}

export interface Mention {
  readonly id: MentionId
  readonly messageId: ActivityMessageId
  readonly userId: PersonId
  readonly content?: string | undefined
}

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

export const listActivityParamsJsonSchema = JSONSchema.make(ListActivityParamsSchema)
export const addReactionParamsJsonSchema = JSONSchema.make(AddReactionParamsSchema)
export const removeReactionParamsJsonSchema = JSONSchema.make(RemoveReactionParamsSchema)
export const listReactionsParamsJsonSchema = JSONSchema.make(ListReactionsParamsSchema)
export const saveMessageParamsJsonSchema = JSONSchema.make(SaveMessageParamsSchema)
export const unsaveMessageParamsJsonSchema = JSONSchema.make(UnsaveMessageParamsSchema)
export const listSavedMessagesParamsJsonSchema = JSONSchema.make(ListSavedMessagesParamsSchema)
export const listMentionsParamsJsonSchema = JSONSchema.make(ListMentionsParamsSchema)

export const parseListActivityParams = Schema.decodeUnknown(ListActivityParamsSchema)
export const parseAddReactionParams = Schema.decodeUnknown(AddReactionParamsSchema)
export const parseRemoveReactionParams = Schema.decodeUnknown(RemoveReactionParamsSchema)
export const parseListReactionsParams = Schema.decodeUnknown(ListReactionsParamsSchema)
export const parseSaveMessageParams = Schema.decodeUnknown(SaveMessageParamsSchema)
export const parseUnsaveMessageParams = Schema.decodeUnknown(UnsaveMessageParamsSchema)
export const parseListSavedMessagesParams = Schema.decodeUnknown(ListSavedMessagesParamsSchema)
export const parseListMentionsParams = Schema.decodeUnknown(ListMentionsParamsSchema)

export interface AddReactionResult {
  readonly reactionId: ReactionId
  readonly messageId: ActivityMessageId
}

export interface RemoveReactionResult {
  readonly messageId: ActivityMessageId
  readonly removed: boolean
}

export interface SaveMessageResult {
  readonly savedId: SavedMessageId
  readonly messageId: ActivityMessageId
}

export interface UnsaveMessageResult {
  readonly messageId: ActivityMessageId
  readonly removed: boolean
}

export const ActivityMessageWireSchema = Schema.Struct({
  id: ActivityMessageId,
  objectId: NonEmptyString,
  objectClass: ObjectClassName,
  modifiedBy: Schema.optional(PersonId),
  modifiedOn: Schema.optional(Timestamp),
  isPinned: Schema.optional(Schema.Boolean),
  replies: Schema.optional(ActivityCount),
  reactions: Schema.optional(ActivityCount),
  editedOn: Schema.optional(Schema.NullOr(Timestamp)),
  action: Schema.optional(ActivityAction),
  message: Schema.optional(Schema.String)
})

export const ReactionWireSchema = Schema.Struct({
  id: ReactionId,
  messageId: ActivityMessageId,
  emoji: EmojiCode,
  createdBy: Schema.optional(PersonId)
})

export const SavedMessageWireSchema = Schema.Struct({
  id: SavedMessageId,
  messageId: ActivityMessageId
})

export const MentionWireSchema = Schema.Struct({
  id: MentionId,
  messageId: ActivityMessageId,
  userId: PersonId,
  content: Schema.optional(Schema.String)
})

export const AddReactionResultSchema = Schema.Struct({
  reactionId: ReactionId,
  messageId: ActivityMessageId
})

export const RemoveReactionResultSchema = Schema.Struct({
  messageId: ActivityMessageId,
  removed: Schema.Boolean
})

export const SaveMessageResultSchema = Schema.Struct({
  savedId: SavedMessageId,
  messageId: ActivityMessageId
})

export const UnsaveMessageResultSchema = Schema.Struct({
  messageId: ActivityMessageId,
  removed: Schema.Boolean
})

export const ListActivityResultSchema = Schema.Array(ActivityMessageWireSchema)
export const ListReactionsResultSchema = Schema.Array(ReactionWireSchema)
export const ListSavedMessagesResultSchema = Schema.Array(SavedMessageWireSchema)
export const ListMentionsResultSchema = Schema.Array(MentionWireSchema)
