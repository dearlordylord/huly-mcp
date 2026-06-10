import { JSONSchema, Schema } from "effect"

import { ActivityMessageWireSchema } from "./activity.js"
import { ActivityFilterPosition, ActivityMarkup, DisplayText } from "./domain-values.js"
import {
  ActivityFilterId,
  ActivityMessageId,
  ActivityReferenceId,
  DEFAULT_LIMIT,
  DocId,
  LimitParam,
  ObjectClassName,
  Timestamp
} from "./shared.js"

export interface ActivityFilter {
  readonly id: ActivityFilterId
  readonly label?: DisplayText | undefined
  readonly position: ActivityFilterPosition
}

export interface ActivityReference {
  readonly id: ActivityReferenceId
  readonly messageId: ActivityMessageId
  readonly srcDocId: DocId
  readonly srcDocClass: ObjectClassName
  readonly attachedDocId?: DocId | undefined
  readonly attachedDocClass?: ObjectClassName | undefined
  readonly message: ActivityMarkup
  readonly modifiedOn?: Timestamp | undefined
}

export const GetActivityMessageParamsSchema = Schema.Struct({
  messageId: ActivityMessageId.annotations({
    description: "ID of the activity message to retrieve."
  })
}).annotations({
  title: "GetActivityMessageParams",
  description: "Parameters for retrieving a single activity message by ID."
})

export type GetActivityMessageParams = Schema.Schema.Type<typeof GetActivityMessageParamsSchema>

export const PinActivityMessageParamsSchema = Schema.Struct({
  messageId: ActivityMessageId.annotations({
    description: "ID of the activity message to pin or unpin."
  }),
  pinned: Schema.Boolean.annotations({
    description: "Whether the activity message should be pinned."
  })
}).annotations({
  title: "PinActivityMessageParams",
  description:
    "Parameters for pinning or unpinning an activity message. Idempotent when already in the requested state."
})

export type PinActivityMessageParams = Schema.Schema.Type<typeof PinActivityMessageParamsSchema>

export const ListActivityFiltersParamsSchema = Schema.Struct({
  limit: Schema.optional(
    LimitParam.annotations({
      description: `Maximum number of activity filters to return (default: ${DEFAULT_LIMIT})`
    })
  )
}).annotations({
  title: "ListActivityFiltersParams",
  description: "Parameters for listing configured activity filters."
})

export type ListActivityFiltersParams = Schema.Schema.Type<typeof ListActivityFiltersParamsSchema>

export const ListActivityReferencesParamsSchema = Schema.Struct({
  objectId: DocId.annotations({
    description: "Internal Huly object ID to list activity references for."
  }),
  objectClass: ObjectClassName.annotations({
    description: "Internal Huly object class to list activity references for."
  }),
  direction: Schema.optional(
    Schema.Literal("from", "to", "both").annotations({
      description:
        "Reference direction. 'from' lists references created by this object, 'to' lists references pointing at this object, 'both' lists either direction (default: both)."
    })
  ),
  limit: Schema.optional(
    LimitParam.annotations({
      description: `Maximum number of activity references to return (default: ${DEFAULT_LIMIT})`
    })
  )
}).annotations({
  title: "ListActivityReferencesParams",
  description: "Parameters for listing activity references connected to a raw Huly object."
})

export type ListActivityReferencesParams = Schema.Schema.Type<typeof ListActivityReferencesParamsSchema>

export const ListActivityRepliesParamsSchema = Schema.Struct({
  messageId: ActivityMessageId.annotations({
    description: "ID of the activity message whose replies should be listed."
  }),
  limit: Schema.optional(
    LimitParam.annotations({
      description: `Maximum number of replies to return (default: ${DEFAULT_LIMIT})`
    })
  )
}).annotations({
  title: "ListActivityRepliesParams",
  description: "Parameters for listing thread replies on any activity message."
})

export type ListActivityRepliesParams = Schema.Schema.Type<typeof ListActivityRepliesParamsSchema>

// Reply bodies are free-form Markdown authored by users, not identities or closed
// domain values, so the schema uses the primitive non-empty string validator.
export const AddActivityReplyParamsSchema = Schema.Struct({
  messageId: ActivityMessageId.annotations({
    description: "ID of the activity message to reply to."
  }),
  body: Schema.NonEmptyString.annotations({
    description: "Reply body in Markdown."
  })
}).annotations({
  title: "AddActivityReplyParams",
  description: "Parameters for adding a reply to any activity message."
})

export type AddActivityReplyParams = Schema.Schema.Type<typeof AddActivityReplyParamsSchema>

export const UpdateActivityReplyParamsSchema = Schema.Struct({
  replyId: ActivityMessageId.annotations({
    description: "ID of the reply activity message to update."
  }),
  body: Schema.NonEmptyString.annotations({
    description: "New reply body in Markdown."
  })
}).annotations({
  title: "UpdateActivityReplyParams",
  description: "Parameters for updating an activity reply."
})

export type UpdateActivityReplyParams = Schema.Schema.Type<typeof UpdateActivityReplyParamsSchema>

export const DeleteActivityReplyParamsSchema = Schema.Struct({
  replyId: ActivityMessageId.annotations({
    description: "ID of the reply activity message to delete."
  })
}).annotations({
  title: "DeleteActivityReplyParams",
  description: "Parameters for deleting an activity reply."
})

export type DeleteActivityReplyParams = Schema.Schema.Type<typeof DeleteActivityReplyParamsSchema>

export const getActivityMessageParamsJsonSchema = JSONSchema.make(GetActivityMessageParamsSchema)
export const pinActivityMessageParamsJsonSchema = JSONSchema.make(PinActivityMessageParamsSchema)
export const listActivityFiltersParamsJsonSchema = JSONSchema.make(ListActivityFiltersParamsSchema)
export const listActivityReferencesParamsJsonSchema = JSONSchema.make(ListActivityReferencesParamsSchema)
export const listActivityRepliesParamsJsonSchema = JSONSchema.make(ListActivityRepliesParamsSchema)
export const addActivityReplyParamsJsonSchema = JSONSchema.make(AddActivityReplyParamsSchema)
export const updateActivityReplyParamsJsonSchema = JSONSchema.make(UpdateActivityReplyParamsSchema)
export const deleteActivityReplyParamsJsonSchema = JSONSchema.make(DeleteActivityReplyParamsSchema)

export const parseGetActivityMessageParams = Schema.decodeUnknown(GetActivityMessageParamsSchema)
export const parsePinActivityMessageParams = Schema.decodeUnknown(PinActivityMessageParamsSchema)
export const parseListActivityFiltersParams = Schema.decodeUnknown(ListActivityFiltersParamsSchema)
export const parseListActivityReferencesParams = Schema.decodeUnknown(ListActivityReferencesParamsSchema)
export const parseListActivityRepliesParams = Schema.decodeUnknown(ListActivityRepliesParamsSchema)
export const parseAddActivityReplyParams = Schema.decodeUnknown(AddActivityReplyParamsSchema)
export const parseUpdateActivityReplyParams = Schema.decodeUnknown(UpdateActivityReplyParamsSchema)
export const parseDeleteActivityReplyParams = Schema.decodeUnknown(DeleteActivityReplyParamsSchema)

export interface PinActivityMessageResult {
  readonly messageId: ActivityMessageId
  readonly pinned: boolean
}

export interface AddActivityReplyResult {
  readonly replyId: ActivityMessageId
  readonly messageId: ActivityMessageId
}

export interface UpdateActivityReplyResult {
  readonly replyId: ActivityMessageId
  readonly updated: boolean
}

export interface DeleteActivityReplyResult {
  readonly replyId: ActivityMessageId
  readonly deleted: boolean
}

export const ActivityFilterWireSchema = Schema.Struct({
  id: ActivityFilterId,
  label: Schema.optional(DisplayText),
  position: ActivityFilterPosition
})

export const ActivityReferenceWireSchema = Schema.Struct({
  id: ActivityReferenceId,
  messageId: ActivityMessageId,
  srcDocId: DocId,
  srcDocClass: ObjectClassName,
  attachedDocId: Schema.optional(DocId),
  attachedDocClass: Schema.optional(ObjectClassName),
  message: ActivityMarkup,
  modifiedOn: Schema.optional(Timestamp)
})

export const PinActivityMessageResultSchema = Schema.Struct({
  messageId: ActivityMessageId,
  pinned: Schema.Boolean
})

export const AddActivityReplyResultSchema = Schema.Struct({
  replyId: ActivityMessageId,
  messageId: ActivityMessageId
})

export const UpdateActivityReplyResultSchema = Schema.Struct({
  replyId: ActivityMessageId,
  updated: Schema.Boolean
})

export const DeleteActivityReplyResultSchema = Schema.Struct({
  replyId: ActivityMessageId,
  deleted: Schema.Boolean
})

export const GetActivityMessageResultSchema = ActivityMessageWireSchema
export const ListActivityFiltersResultSchema = Schema.Array(ActivityFilterWireSchema)
export const ListActivityReferencesResultSchema = Schema.Array(ActivityReferenceWireSchema)
export const ListActivityRepliesResultSchema = Schema.Array(ActivityMessageWireSchema)
