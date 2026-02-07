import { Schema } from "effect"

import {
  LimitParam,
  makeJsonSchema,
  NonEmptyString,
  NotificationContextId,
  NotificationId,
  NotificationProviderId,
  NotificationTypeId,
  ObjectClassName,
  Timestamp
} from "./shared.js"

// --- Notification Summary (for list operations) ---

export const NotificationSummarySchema = Schema.Struct({
  id: NotificationId,
  isViewed: Schema.Boolean,
  archived: Schema.Boolean,
  objectId: Schema.optional(NonEmptyString),
  objectClass: Schema.optional(ObjectClassName),
  title: Schema.optional(Schema.String),
  body: Schema.optional(Schema.String),
  createdOn: Schema.optional(Timestamp),
  modifiedOn: Schema.optional(Timestamp)
}).annotations({
  title: "NotificationSummary",
  description: "Notification summary for list operations"
})

export type NotificationSummary = Schema.Schema.Type<typeof NotificationSummarySchema>

// --- Full Notification ---

export const NotificationSchema = Schema.Struct({
  id: NotificationId,
  isViewed: Schema.Boolean,
  archived: Schema.Boolean,
  objectId: Schema.optional(NonEmptyString),
  objectClass: Schema.optional(ObjectClassName),
  docNotifyContextId: Schema.optional(NotificationContextId),
  title: Schema.optional(Schema.String),
  body: Schema.optional(Schema.String),
  data: Schema.optional(Schema.String),
  createdOn: Schema.optional(Timestamp),
  modifiedOn: Schema.optional(Timestamp)
}).annotations({
  title: "Notification",
  description: "Full notification with all fields"
})

export type Notification = Schema.Schema.Type<typeof NotificationSchema>

// --- Doc Notify Context Summary ---

export const DocNotifyContextSummarySchema = Schema.Struct({
  id: NotificationContextId,
  objectId: NonEmptyString,
  objectClass: ObjectClassName,
  isPinned: Schema.Boolean,
  hidden: Schema.Boolean,
  lastViewedTimestamp: Schema.optional(Timestamp),
  lastUpdateTimestamp: Schema.optional(Timestamp)
}).annotations({
  title: "DocNotifyContextSummary",
  description: "Document notification context summary"
})

export type DocNotifyContextSummary = Schema.Schema.Type<typeof DocNotifyContextSummarySchema>

// --- Notification Provider Setting ---

export const NotificationProviderSettingSchema = Schema.Struct({
  id: NonEmptyString,
  providerId: NotificationProviderId,
  enabled: Schema.Boolean
}).annotations({
  title: "NotificationProviderSetting",
  description: "Notification provider setting"
})

export type NotificationProviderSetting = Schema.Schema.Type<typeof NotificationProviderSettingSchema>

// --- Notification Type Setting ---

export const NotificationTypeSettingSchema = Schema.Struct({
  id: NonEmptyString,
  providerId: NotificationProviderId,
  typeId: NotificationTypeId,
  enabled: Schema.Boolean
}).annotations({
  title: "NotificationTypeSetting",
  description: "Notification type setting"
})

export type NotificationTypeSetting = Schema.Schema.Type<typeof NotificationTypeSettingSchema>

// --- List Notifications Params ---

export const ListNotificationsParamsSchema = Schema.Struct({
  limit: Schema.optional(
    LimitParam.annotations({
      description: "Maximum number of notifications to return (default: 50)"
    })
  ),
  includeArchived: Schema.optional(
    Schema.Boolean.annotations({
      description: "Include archived notifications in results (default: false)"
    })
  ),
  unreadOnly: Schema.optional(
    Schema.Boolean.annotations({
      description: "Return only unread notifications (default: false)"
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
  objectId: NonEmptyString.annotations({
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
      description: "Maximum number of contexts to return (default: 50)"
    })
  ),
  pinnedOnly: Schema.optional(
    Schema.Boolean.annotations({
      description: "Return only pinned contexts (default: false)"
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

// --- List Notification Settings Params ---

export const ListNotificationSettingsParamsSchema = Schema.Struct({
  limit: Schema.optional(
    LimitParam.annotations({
      description: "Maximum number of settings to return (default: 50)"
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

export const listNotificationsParamsJsonSchema = makeJsonSchema(ListNotificationsParamsSchema)
export const getNotificationParamsJsonSchema = makeJsonSchema(GetNotificationParamsSchema)
export const markNotificationReadParamsJsonSchema = makeJsonSchema(MarkNotificationReadParamsSchema)
export const archiveNotificationParamsJsonSchema = makeJsonSchema(ArchiveNotificationParamsSchema)
export const deleteNotificationParamsJsonSchema = makeJsonSchema(DeleteNotificationParamsSchema)
export const getNotificationContextParamsJsonSchema = makeJsonSchema(GetNotificationContextParamsSchema)
export const listNotificationContextsParamsJsonSchema = makeJsonSchema(ListNotificationContextsParamsSchema)
export const pinNotificationContextParamsJsonSchema = makeJsonSchema(PinNotificationContextParamsSchema)
export const listNotificationSettingsParamsJsonSchema = makeJsonSchema(ListNotificationSettingsParamsSchema)
export const updateNotificationProviderSettingParamsJsonSchema = makeJsonSchema(
  UpdateNotificationProviderSettingParamsSchema
)

// --- Parsers ---

export const parseListNotificationsParams = Schema.decodeUnknown(ListNotificationsParamsSchema)
export const parseGetNotificationParams = Schema.decodeUnknown(GetNotificationParamsSchema)
export const parseMarkNotificationReadParams = Schema.decodeUnknown(MarkNotificationReadParamsSchema)
export const parseArchiveNotificationParams = Schema.decodeUnknown(ArchiveNotificationParamsSchema)
export const parseDeleteNotificationParams = Schema.decodeUnknown(DeleteNotificationParamsSchema)
export const parseGetNotificationContextParams = Schema.decodeUnknown(GetNotificationContextParamsSchema)
export const parseListNotificationContextsParams = Schema.decodeUnknown(ListNotificationContextsParamsSchema)
export const parsePinNotificationContextParams = Schema.decodeUnknown(PinNotificationContextParamsSchema)
export const parseListNotificationSettingsParams = Schema.decodeUnknown(ListNotificationSettingsParamsSchema)
export const parseUpdateNotificationProviderSettingParams = Schema.decodeUnknown(
  UpdateNotificationProviderSettingParamsSchema
)
