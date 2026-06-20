import { JSONSchema, Schema } from "effect"

import {
  Count,
  DEFAULT_INCLUDE_ARCHIVED,
  DEFAULT_LIMIT,
  DocId,
  LimitParam,
  ListTotal,
  NotificationContextId,
  NotificationId,
  NotificationProviderId,
  ObjectClassName
} from "./shared.js"

const DEFAULT_UNREAD_ONLY = false
const DEFAULT_PINNED_CONTEXTS_ONLY = false
const DEFAULT_INCLUDE_HIDDEN_CONTEXTS = false
export const NotificationSummarySchema = Schema.Struct({
  id: NotificationId,
  isViewed: Schema.Boolean,
  archived: Schema.Boolean,
  objectId: Schema.optional(DocId),
  objectClass: Schema.optional(ObjectClassName),
  title: Schema.optional(Schema.String),
  body: Schema.optional(Schema.String),
  createdOn: Schema.optional(Schema.Number),
  modifiedOn: Schema.optional(Schema.Number)
})
export type NotificationSummary = Schema.Schema.Type<typeof NotificationSummarySchema>
export const NotificationSchema = Schema.Struct({
  id: NotificationId,
  isViewed: Schema.Boolean,
  archived: Schema.Boolean,
  objectId: Schema.optional(DocId),
  objectClass: Schema.optional(ObjectClassName),
  docNotifyContextId: Schema.optional(NotificationContextId),
  title: Schema.optional(Schema.String),
  body: Schema.optional(Schema.String),
  data: Schema.optional(Schema.String),
  createdOn: Schema.optional(Schema.Number),
  modifiedOn: Schema.optional(Schema.Number)
})
export type Notification = Schema.Schema.Type<typeof NotificationSchema>
export const DocNotifyContextSummarySchema = Schema.Struct({
  id: NotificationContextId,
  objectId: DocId,
  objectClass: ObjectClassName,
  isPinned: Schema.Boolean,
  hidden: Schema.Boolean,
  lastViewedTimestamp: Schema.optional(Schema.Number),
  lastUpdateTimestamp: Schema.optional(Schema.Number)
})
export type DocNotifyContextSummary = Schema.Schema.Type<typeof DocNotifyContextSummarySchema>
export const NotificationProviderSettingSchema = Schema.Struct({
  id: Schema.String,
  providerId: NotificationProviderId,
  enabled: Schema.Boolean
})
export type NotificationProviderSetting = Schema.Schema.Type<typeof NotificationProviderSettingSchema>

// --- List Notifications Params ---

export const ListNotificationsParamsSchema = Schema.Struct({
  limit: Schema.optional(
    LimitParam.annotations({
      description: `Maximum number of notifications to return (default: ${DEFAULT_LIMIT})`
    })
  ),
  includeArchived: Schema.optional(
    Schema.Boolean.annotations({
      description: `Include archived notifications in results (default: ${DEFAULT_INCLUDE_ARCHIVED})`
    })
  ),
  unreadOnly: Schema.optional(
    Schema.Boolean.annotations({
      description: `Return only unread notifications (default: ${DEFAULT_UNREAD_ONLY})`
    })
  )
}).annotations({
  title: "ListNotificationsParams",
  description: "Parameters for listing notifications"
})

export type ListNotificationsParams = Schema.Schema.Type<typeof ListNotificationsParamsSchema>

// --- Get Notification Params ---

export const GetNotificationParamsSchema = Schema.Struct({
  notificationId: NotificationId.annotations({
    description: "Notification ID"
  })
}).annotations({
  title: "GetNotificationParams",
  description: "Parameters for getting a single notification"
})

export type GetNotificationParams = Schema.Schema.Type<typeof GetNotificationParamsSchema>

// --- Mark Notification Read Params ---

export const MarkNotificationReadParamsSchema = Schema.Struct({
  notificationId: NotificationId.annotations({
    description: "Notification ID to mark as read"
  })
}).annotations({
  title: "MarkNotificationReadParams",
  description: "Parameters for marking a notification as read"
})

export type MarkNotificationReadParams = Schema.Schema.Type<typeof MarkNotificationReadParamsSchema>

// --- Mark Notification Unread Params ---

export const MarkNotificationUnreadParamsSchema = Schema.Struct({
  notificationId: NotificationId.annotations({
    description: "Notification ID to mark as unread"
  })
}).annotations({
  title: "MarkNotificationUnreadParams",
  description: "Parameters for marking a notification as unread"
})

export type MarkNotificationUnreadParams = Schema.Schema.Type<typeof MarkNotificationUnreadParamsSchema>

// --- Archive Notification Params ---

export const ArchiveNotificationParamsSchema = Schema.Struct({
  notificationId: NotificationId.annotations({
    description: "Notification ID to archive"
  })
}).annotations({
  title: "ArchiveNotificationParams",
  description: "Parameters for archiving a notification"
})

export type ArchiveNotificationParams = Schema.Schema.Type<typeof ArchiveNotificationParamsSchema>

// --- Unarchive Notification Params ---

export const UnarchiveNotificationParamsSchema = Schema.Struct({
  notificationId: NotificationId.annotations({
    description: "Notification ID to unarchive"
  })
}).annotations({
  title: "UnarchiveNotificationParams",
  description: "Parameters for unarchiving a notification"
})

export type UnarchiveNotificationParams = Schema.Schema.Type<typeof UnarchiveNotificationParamsSchema>

// --- Delete Notification Params ---

export const DeleteNotificationParamsSchema = Schema.Struct({
  notificationId: NotificationId.annotations({
    description: "Notification ID to delete"
  })
}).annotations({
  title: "DeleteNotificationParams",
  description: "Parameters for deleting a notification"
})

export type DeleteNotificationParams = Schema.Schema.Type<typeof DeleteNotificationParamsSchema>

// --- Get Notification Context Params ---

export const GetNotificationContextParamsSchema = Schema.Struct({
  objectId: DocId.annotations({
    description: "Object ID to get notification context for"
  }),
  objectClass: ObjectClassName.annotations({
    description: "Object class name (e.g., 'tracker.class.Issue')"
  })
}).annotations({
  title: "GetNotificationContextParams",
  description: "Parameters for getting notification context for an entity"
})

export type GetNotificationContextParams = Schema.Schema.Type<typeof GetNotificationContextParamsSchema>

// --- List Notification Contexts Params ---

export const ListNotificationContextsParamsSchema = Schema.Struct({
  limit: Schema.optional(
    LimitParam.annotations({
      description: `Maximum number of contexts to return (default: ${DEFAULT_LIMIT})`
    })
  ),
  pinnedOnly: Schema.optional(
    Schema.Boolean.annotations({
      description: `Return only pinned contexts (default: ${DEFAULT_PINNED_CONTEXTS_ONLY})`
    })
  ),
  includeHidden: Schema.optional(
    Schema.Boolean.annotations({
      description: `Include hidden notification contexts in results (default: ${DEFAULT_INCLUDE_HIDDEN_CONTEXTS})`
    })
  )
}).annotations({
  title: "ListNotificationContextsParams",
  description: "Parameters for listing notification contexts"
})

export type ListNotificationContextsParams = Schema.Schema.Type<typeof ListNotificationContextsParamsSchema>

// --- Pin/Unpin Context Params ---

export const PinNotificationContextParamsSchema = Schema.Struct({
  contextId: NotificationContextId.annotations({
    description: "Notification context ID to pin/unpin"
  }),
  pinned: Schema.Boolean.annotations({
    description: "Whether to pin (true) or unpin (false) the context"
  })
}).annotations({
  title: "PinNotificationContextParams",
  description: "Parameters for pinning/unpinning a notification context"
})

export type PinNotificationContextParams = Schema.Schema.Type<typeof PinNotificationContextParamsSchema>

// --- Hide/Unhide Context Params ---

export const HideNotificationContextParamsSchema = Schema.Struct({
  contextId: NotificationContextId.annotations({
    description: "Notification context ID to hide/unhide"
  }),
  hidden: Schema.Boolean.annotations({
    description: "Whether to hide (true) or unhide (false) the context"
  })
}).annotations({
  title: "HideNotificationContextParams",
  description: "Parameters for hiding/unhiding a notification context"
})

export type HideNotificationContextParams = Schema.Schema.Type<typeof HideNotificationContextParamsSchema>

// --- List Notification Settings Params ---

export const ListNotificationSettingsParamsSchema = Schema.Struct({
  limit: Schema.optional(
    LimitParam.annotations({
      description: `Maximum number of settings to return (default: ${DEFAULT_LIMIT})`
    })
  )
}).annotations({
  title: "ListNotificationSettingsParams",
  description: "Parameters for listing notification settings"
})

export type ListNotificationSettingsParams = Schema.Schema.Type<typeof ListNotificationSettingsParamsSchema>

// --- Update Notification Provider Setting Params ---

export const UpdateNotificationProviderSettingParamsSchema = Schema.Struct({
  providerId: NotificationProviderId.annotations({
    description: "Notification provider ID"
  }),
  enabled: Schema.Boolean.annotations({
    description: "Whether to enable or disable the provider"
  })
}).annotations({
  title: "UpdateNotificationProviderSettingParams",
  description: "Parameters for updating notification provider setting"
})

export type UpdateNotificationProviderSettingParams = Schema.Schema.Type<
  typeof UpdateNotificationProviderSettingParamsSchema
>

// --- JSON Schemas for MCP ---

export const listNotificationsParamsJsonSchema = JSONSchema.make(ListNotificationsParamsSchema)
export const getNotificationParamsJsonSchema = JSONSchema.make(GetNotificationParamsSchema)
export const markNotificationReadParamsJsonSchema = JSONSchema.make(MarkNotificationReadParamsSchema)
export const markNotificationUnreadParamsJsonSchema = JSONSchema.make(MarkNotificationUnreadParamsSchema)
export const archiveNotificationParamsJsonSchema = JSONSchema.make(ArchiveNotificationParamsSchema)
export const unarchiveNotificationParamsJsonSchema = JSONSchema.make(UnarchiveNotificationParamsSchema)
export const deleteNotificationParamsJsonSchema = JSONSchema.make(DeleteNotificationParamsSchema)
export const getNotificationContextParamsJsonSchema = JSONSchema.make(GetNotificationContextParamsSchema)
export const listNotificationContextsParamsJsonSchema = JSONSchema.make(ListNotificationContextsParamsSchema)
export const pinNotificationContextParamsJsonSchema = JSONSchema.make(PinNotificationContextParamsSchema)
export const hideNotificationContextParamsJsonSchema = JSONSchema.make(HideNotificationContextParamsSchema)
export const listNotificationSettingsParamsJsonSchema = JSONSchema.make(ListNotificationSettingsParamsSchema)
export const updateNotificationProviderSettingParamsJsonSchema = JSONSchema.make(
  UpdateNotificationProviderSettingParamsSchema
)

// --- Parsers ---

export const parseListNotificationsParams = Schema.decodeUnknown(ListNotificationsParamsSchema)
export const parseGetNotificationParams = Schema.decodeUnknown(GetNotificationParamsSchema)
export const parseMarkNotificationReadParams = Schema.decodeUnknown(MarkNotificationReadParamsSchema)
export const parseMarkNotificationUnreadParams = Schema.decodeUnknown(MarkNotificationUnreadParamsSchema)
export const parseArchiveNotificationParams = Schema.decodeUnknown(ArchiveNotificationParamsSchema)
export const parseUnarchiveNotificationParams = Schema.decodeUnknown(UnarchiveNotificationParamsSchema)
export const parseDeleteNotificationParams = Schema.decodeUnknown(DeleteNotificationParamsSchema)
export const parseGetNotificationContextParams = Schema.decodeUnknown(GetNotificationContextParamsSchema)
export const parseListNotificationContextsParams = Schema.decodeUnknown(ListNotificationContextsParamsSchema)
export const parsePinNotificationContextParams = Schema.decodeUnknown(PinNotificationContextParamsSchema)
export const parseHideNotificationContextParams = Schema.decodeUnknown(HideNotificationContextParamsSchema)
export const parseListNotificationSettingsParams = Schema.decodeUnknown(ListNotificationSettingsParamsSchema)
export const parseUpdateNotificationProviderSettingParams = Schema.decodeUnknown(
  UpdateNotificationProviderSettingParamsSchema
)
export const MarkNotificationReadResultSchema = Schema.Struct({
  id: NotificationId,
  marked: Schema.Boolean
})
export type MarkNotificationReadResult = Schema.Schema.Type<typeof MarkNotificationReadResultSchema>
export const MarkNotificationUnreadResultSchema = Schema.Struct({
  id: NotificationId,
  marked: Schema.Boolean
})
export type MarkNotificationUnreadResult = Schema.Schema.Type<typeof MarkNotificationUnreadResultSchema>
export const MarkAllNotificationsReadResultSchema = Schema.Struct({
  count: Count
})
export type MarkAllNotificationsReadResult = Schema.Schema.Type<typeof MarkAllNotificationsReadResultSchema>
export const ArchiveNotificationResultSchema = Schema.Struct({
  id: NotificationId,
  archived: Schema.Boolean
})
export type ArchiveNotificationResult = Schema.Schema.Type<typeof ArchiveNotificationResultSchema>
export const UnarchiveNotificationResultSchema = Schema.Struct({
  id: NotificationId,
  archived: Schema.Boolean
})
export type UnarchiveNotificationResult = Schema.Schema.Type<typeof UnarchiveNotificationResultSchema>
export const ArchiveAllNotificationsResultSchema = Schema.Struct({
  count: Count
})
export type ArchiveAllNotificationsResult = Schema.Schema.Type<typeof ArchiveAllNotificationsResultSchema>
export const DeleteNotificationResultSchema = Schema.Struct({
  id: NotificationId,
  deleted: Schema.Boolean
})
export type DeleteNotificationResult = Schema.Schema.Type<typeof DeleteNotificationResultSchema>
export const PinNotificationContextResultSchema = Schema.Struct({
  id: NotificationContextId,
  isPinned: Schema.Boolean
})
export type PinNotificationContextResult = Schema.Schema.Type<typeof PinNotificationContextResultSchema>
export const HideNotificationContextResultSchema = Schema.Struct({
  id: NotificationContextId,
  hidden: Schema.Boolean
})
export type HideNotificationContextResult = Schema.Schema.Type<typeof HideNotificationContextResultSchema>
export const UpdateNotificationProviderSettingResultSchema = Schema.Struct({
  providerId: NotificationProviderId,
  enabled: Schema.Boolean,
  updated: Schema.Boolean
})
export type UpdateNotificationProviderSettingResult = Schema.Schema.Type<
  typeof UpdateNotificationProviderSettingResultSchema
>
export const UnreadCountResultSchema = Schema.Struct({
  count: ListTotal
})
export type UnreadCountResult = Schema.Schema.Type<typeof UnreadCountResultSchema>

export const ListNotificationsResultSchema = Schema.Array(NotificationSummarySchema)
export const GetNotificationResultSchema = NotificationSchema
export const GetNotificationContextResultSchema = Schema.NullOr(DocNotifyContextSummarySchema)
export const ListNotificationContextsResultSchema = Schema.Array(DocNotifyContextSummarySchema)
export const ListNotificationSettingsResultSchema = Schema.Array(NotificationProviderSettingSchema)
export const GetUnreadNotificationCountResultSchema = UnreadCountResultSchema
