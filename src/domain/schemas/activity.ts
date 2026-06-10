import { JSONSchema, Schema } from "effect"

import { ActivityMarkdown, ActivityMarkup, MentionContent } from "./domain-values.js"
import {
  ActivityMessageId,
  ChannelIdentifier,
  Count,
  DEFAULT_LIMIT,
  DocId,
  DocumentIdentifier,
  EmojiCode,
  hasAllDefined,
  IssueIdentifier,
  LimitParam,
  MAX_LIMIT,
  MentionId,
  ObjectClassName,
  PersonId,
  ProjectIdentifier,
  ReactionId,
  SavedMessageId,
  TeamspaceIdentifier,
  Timestamp
} from "./shared.js"

export const ActivityCount = Count.pipe(Schema.brand("ActivityCount")).annotations({
  identifier: "ActivityCount",
  title: "ActivityCount",
  description: "Non-negative integer count for activity replies or reactions"
})
export type ActivityCount = Schema.Schema.Type<typeof ActivityCount>

const ActivityAction = Schema.Literal("create", "update", "remove")
type ActivityAction = Schema.Schema.Type<typeof ActivityAction>

export interface ActivityMessage {
  readonly id: ActivityMessageId
  readonly messageClass?: ObjectClassName | undefined
  readonly objectId: DocId
  readonly objectClass: ObjectClassName
  readonly modifiedBy?: PersonId | undefined
  readonly modifiedOn?: Timestamp | undefined
  readonly isPinned?: boolean | undefined
  readonly replies?: ActivityCount | undefined
  readonly reactions?: ActivityCount | undefined
  readonly editedOn?: Timestamp | null | undefined
  readonly action?: ActivityAction | undefined
  readonly message?: ActivityMarkup | undefined
  readonly body?: ActivityMarkdown | undefined
  readonly srcDocId?: DocId | undefined
  readonly srcDocClass?: ObjectClassName | undefined
  readonly attachedDocId?: DocId | undefined
  readonly attachedDocClass?: ObjectClassName | undefined
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
  readonly content?: MentionContent | undefined
}

export const ListActivityParamsSchema = Schema.Struct({
  objectId: Schema.optional(DocId.annotations({
    description:
      "Advanced: internal Huly object ID to get activity for. Use with objectClass. Prefer project+issueIdentifier, teamspace+document, or channel when available."
  })),
  objectClass: Schema.optional(ObjectClassName.annotations({
    description: "Advanced: internal Huly object class for objectId, such as 'tracker:class:Issue'. Use with objectId."
  })),
  project: Schema.optional(ProjectIdentifier.annotations({
    description: "Project identifier for issue activity, e.g. 'HULY'. Use with issueIdentifier."
  })),
  issueIdentifier: Schema.optional(IssueIdentifier.annotations({
    description: "Issue identifier for issue activity, e.g. 'HULY-123' or '123'. Use with project."
  })),
  teamspace: Schema.optional(TeamspaceIdentifier.annotations({
    description: "Teamspace name or ID for document activity. Use with document."
  })),
  document: Schema.optional(DocumentIdentifier.annotations({
    description: "Document title or ID for document activity. Use with teamspace."
  })),
  channel: Schema.optional(ChannelIdentifier.annotations({
    description: "Channel name or ID for channel activity."
  })),
  limit: Schema.optional(
    LimitParam.annotations({
      description: `Maximum number of activity messages to return (default: ${DEFAULT_LIMIT})`
    })
  )
}).pipe(
  Schema.filter((params) => {
    const rawObjectMode = hasAllDefined(params.objectId, params.objectClass)
    const issueMode = hasAllDefined(params.project, params.issueIdentifier)
    const documentMode = hasAllDefined(params.teamspace, params.document)
    const channelMode = params.channel !== undefined
    const modeCount = [rawObjectMode, issueMode, documentMode, channelMode].filter(Boolean).length

    if ((params.objectId !== undefined) !== (params.objectClass !== undefined)) {
      return "Provide both objectId and objectClass for raw object activity, or use a friendly target mode."
    }
    if ((params.project !== undefined) !== (params.issueIdentifier !== undefined)) {
      return "Provide both project and issueIdentifier for issue activity."
    }
    if ((params.teamspace !== undefined) !== (params.document !== undefined)) {
      return "Provide both teamspace and document for document activity."
    }
    if (modeCount !== 1) {
      return "Choose exactly one activity target mode: objectId+objectClass, project+issueIdentifier, teamspace+document, or channel."
    }
    return undefined
  })
).annotations({
  title: "ListActivityParams",
  description:
    "Parameters for listing activity on a Huly object. Prefer friendly identifiers; raw objectId+objectClass is for advanced callers."
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
      description: `Maximum number of reactions to return (default: ${DEFAULT_LIMIT})`
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
      description: `Maximum number of saved messages to return (default: ${DEFAULT_LIMIT})`
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
      description: `Maximum number of mentions to return (default: ${DEFAULT_LIMIT})`
    })
  )
}).annotations({
  title: "ListMentionsParams",
  description: "Parameters for listing mentions of the current user"
})

export type ListMentionsParams = Schema.Schema.Type<typeof ListMentionsParamsSchema>

const activityLimitJsonSchema = {
  type: "integer",
  minimum: 1,
  maximum: MAX_LIMIT,
  description: `Maximum number of activity messages to return (default: ${DEFAULT_LIMIT})`
}

const targetStringJsonSchema = (description: string): object => ({
  type: "string",
  minLength: 1,
  description
})

export const listActivityParamsJsonSchema = {
  type: "object",
  description:
    "Choose exactly one target mode for activity lookup: project+issueIdentifier, teamspace+document, channel, or objectId+objectClass.",
  oneOf: [
    {
      title: "Issue activity target",
      type: "object",
      additionalProperties: false,
      required: ["project", "issueIdentifier"],
      properties: {
        project: targetStringJsonSchema("Project identifier for issue activity, e.g. 'HULY'."),
        issueIdentifier: targetStringJsonSchema("Issue identifier for issue activity, e.g. 'HULY-123' or '123'."),
        limit: activityLimitJsonSchema
      }
    },
    {
      title: "Document activity target",
      type: "object",
      additionalProperties: false,
      required: ["teamspace", "document"],
      properties: {
        teamspace: targetStringJsonSchema("Teamspace name or ID for document activity."),
        document: targetStringJsonSchema("Document title or ID for document activity."),
        limit: activityLimitJsonSchema
      }
    },
    {
      title: "Channel activity target",
      type: "object",
      additionalProperties: false,
      required: ["channel"],
      properties: {
        channel: targetStringJsonSchema("Channel name or ID for channel activity."),
        limit: activityLimitJsonSchema
      }
    },
    {
      title: "Raw Huly object activity target",
      type: "object",
      additionalProperties: false,
      required: ["objectId", "objectClass"],
      properties: {
        objectId: targetStringJsonSchema("Internal Huly object ID to get activity for."),
        objectClass: targetStringJsonSchema("Internal Huly object class for objectId, such as 'tracker:class:Issue'."),
        limit: activityLimitJsonSchema
      }
    }
  ]
}
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
  messageClass: Schema.optional(ObjectClassName),
  objectId: DocId,
  objectClass: ObjectClassName,
  modifiedBy: Schema.optional(PersonId),
  modifiedOn: Schema.optional(Timestamp),
  isPinned: Schema.optional(Schema.Boolean),
  replies: Schema.optional(ActivityCount),
  reactions: Schema.optional(ActivityCount),
  editedOn: Schema.optional(Schema.NullOr(Timestamp)),
  action: Schema.optional(ActivityAction),
  message: Schema.optional(ActivityMarkup),
  body: Schema.optional(ActivityMarkdown),
  srcDocId: Schema.optional(DocId),
  srcDocClass: Schema.optional(ObjectClassName),
  attachedDocId: Schema.optional(DocId),
  attachedDocClass: Schema.optional(ObjectClassName)
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
  content: Schema.optional(MentionContent)
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
