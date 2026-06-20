import { JSONSchema, Schema } from "effect"

import { DisplayText, NotificationFieldName, NotificationProviderOrder } from "./domain-values.js"
import {
  Count,
  DEFAULT_LIMIT,
  DocId,
  LimitParam,
  NotificationContextId,
  NotificationProviderId,
  NotificationTypeId,
  NotificationTypeId as NotificationTypeIdSchema,
  NotificationTypeSettingId,
  ObjectClassName
} from "./shared.js"
export const NotificationProviderSchema = Schema.Struct({
  id: NotificationProviderId,
  label: Schema.optional(DisplayText),
  description: Schema.optional(DisplayText),
  defaultEnabled: Schema.Boolean,
  canDisable: Schema.Boolean,
  order: NotificationProviderOrder,
  depends: Schema.optional(NotificationProviderId)
})
export type NotificationProvider = Schema.Schema.Type<typeof NotificationProviderSchema>
export const NotificationTypeSchema = Schema.Struct({
  id: NotificationTypeId,
  label: Schema.optional(DisplayText),
  generated: Schema.Boolean,
  hidden: Schema.Boolean,
  defaultEnabled: Schema.Boolean,
  group: Schema.optional(DocId),
  objectClass: ObjectClassName,
  onlyOwn: Schema.optional(Schema.Boolean),
  attachedToClass: Schema.optional(ObjectClassName),
  field: Schema.optional(NotificationFieldName),
  spaceSubscribe: Schema.optional(Schema.Boolean),
  allowedForAuthor: Schema.optional(Schema.Boolean)
})
export type NotificationType = Schema.Schema.Type<typeof NotificationTypeSchema>
export const NotificationTypeSettingSchema = Schema.Struct({
  id: NotificationTypeSettingId,
  providerId: NotificationProviderId,
  typeId: NotificationTypeId,
  enabled: Schema.Boolean
})
export type NotificationTypeSetting = Schema.Schema.Type<typeof NotificationTypeSettingSchema>

export const ListNotificationProvidersParamsSchema = Schema.Struct({
  limit: Schema.optional(
    LimitParam.annotations({
      description: `Maximum number of providers to return (default: ${DEFAULT_LIMIT})`
    })
  ),
  includeUnavailable: Schema.optional(Schema.Boolean.annotations({
    description: "Include providers that the workspace may not currently expose as configurable settings."
  }))
}).annotations({
  title: "ListNotificationProvidersParams",
  description: "Parameters for listing notification providers such as inbox, push, and sound."
})

export type ListNotificationProvidersParams = Schema.Schema.Type<typeof ListNotificationProvidersParamsSchema>

export const ListNotificationTypesParamsSchema = Schema.Struct({
  limit: Schema.optional(
    LimitParam.annotations({
      description: `Maximum number of notification types to return (default: ${DEFAULT_LIMIT})`
    })
  ),
  includeHidden: Schema.optional(Schema.Boolean.annotations({
    description: "Include hidden/internal notification types."
  })),
  objectClass: Schema.optional(ObjectClassName.annotations({
    description: "Filter to notification types for this Huly object class."
  }))
}).annotations({
  title: "ListNotificationTypesParams",
  description: "Parameters for listing notification types."
})

export type ListNotificationTypesParams = Schema.Schema.Type<typeof ListNotificationTypesParamsSchema>

export const UpdateNotificationTypeSettingParamsSchema = Schema.Struct({
  providerId: NotificationProviderId.annotations({
    description: "Notification provider ID, such as notification:providers:InboxNotificationProvider."
  }),
  typeId: NotificationTypeIdSchema.annotations({
    description: "Notification type ID to configure."
  }),
  enabled: Schema.Boolean.annotations({
    description: "Whether to enable or disable this notification type for the provider."
  })
}).annotations({
  title: "UpdateNotificationTypeSettingParams",
  description:
    "Parameters for updating a provider-specific notification type setting. Creates a setting only when the provider is configurable in this workspace."
})

export type UpdateNotificationTypeSettingParams = Schema.Schema.Type<typeof UpdateNotificationTypeSettingParamsSchema>

export const ArchiveNotificationContextParamsSchema = Schema.Struct({
  contextId: NotificationContextId.annotations({
    description: "Notification context ID whose inbox notifications should be archived."
  })
}).annotations({
  title: "ArchiveNotificationContextParams",
  description: "Parameters for archiving all inbox notifications in a context."
})

export type ArchiveNotificationContextParams = Schema.Schema.Type<typeof ArchiveNotificationContextParamsSchema>

export const UnarchiveNotificationContextParamsSchema = ArchiveNotificationContextParamsSchema.annotations({
  title: "UnarchiveNotificationContextParams",
  description: "Parameters for unarchiving all inbox notifications in a context."
})

export type UnarchiveNotificationContextParams = Schema.Schema.Type<typeof UnarchiveNotificationContextParamsSchema>

const ObjectNotificationSubscriptionParamsSchema = Schema.Struct({
  objectId: DocId.annotations({
    description: "Internal Huly object ID to subscribe/unsubscribe the authenticated account to."
  }),
  objectClass: ObjectClassName.annotations({
    description: "Internal Huly object class for objectId."
  }),
  space: Schema.optional(DocId.annotations({
    description: "Optional object space ID. If omitted, the operation reads the object to determine the space."
  }))
}).annotations({
  title: "ObjectNotificationSubscriptionParams",
  description: "Parameters for subscribing or unsubscribing the authenticated account to object notifications."
})

export const SubscribeToObjectNotificationsParamsSchema = ObjectNotificationSubscriptionParamsSchema
export type SubscribeToObjectNotificationsParams = Schema.Schema.Type<typeof SubscribeToObjectNotificationsParamsSchema>

export const UnsubscribeFromObjectNotificationsParamsSchema = ObjectNotificationSubscriptionParamsSchema
export type UnsubscribeFromObjectNotificationsParams = Schema.Schema.Type<
  typeof UnsubscribeFromObjectNotificationsParamsSchema
>

export const listNotificationProvidersParamsJsonSchema = JSONSchema.make(ListNotificationProvidersParamsSchema)
export const listNotificationTypesParamsJsonSchema = JSONSchema.make(ListNotificationTypesParamsSchema)
export const updateNotificationTypeSettingParamsJsonSchema = JSONSchema.make(UpdateNotificationTypeSettingParamsSchema)
export const archiveNotificationContextParamsJsonSchema = JSONSchema.make(ArchiveNotificationContextParamsSchema)
export const unarchiveNotificationContextParamsJsonSchema = JSONSchema.make(UnarchiveNotificationContextParamsSchema)
export const subscribeToObjectNotificationsParamsJsonSchema = JSONSchema.make(
  SubscribeToObjectNotificationsParamsSchema
)
export const unsubscribeFromObjectNotificationsParamsJsonSchema = JSONSchema.make(
  UnsubscribeFromObjectNotificationsParamsSchema
)

export const parseListNotificationProvidersParams = Schema.decodeUnknown(ListNotificationProvidersParamsSchema)
export const parseListNotificationTypesParams = Schema.decodeUnknown(ListNotificationTypesParamsSchema)
export const parseUpdateNotificationTypeSettingParams = Schema.decodeUnknown(UpdateNotificationTypeSettingParamsSchema)
export const parseArchiveNotificationContextParams = Schema.decodeUnknown(ArchiveNotificationContextParamsSchema)
export const parseUnarchiveNotificationContextParams = Schema.decodeUnknown(UnarchiveNotificationContextParamsSchema)
export const parseSubscribeToObjectNotificationsParams = Schema.decodeUnknown(
  SubscribeToObjectNotificationsParamsSchema
)
export const parseUnsubscribeFromObjectNotificationsParams = Schema.decodeUnknown(
  UnsubscribeFromObjectNotificationsParamsSchema
)
export const UpdateNotificationTypeSettingResultSchema = Schema.Struct({
  providerId: NotificationProviderId,
  typeId: NotificationTypeId,
  enabled: Schema.Boolean,
  updated: Schema.Boolean,
  created: Schema.Boolean
})
export type UpdateNotificationTypeSettingResult = Schema.Schema.Type<typeof UpdateNotificationTypeSettingResultSchema>
export const ArchiveNotificationContextResultSchema = Schema.Struct({
  contextId: NotificationContextId,
  archived: Schema.Boolean,
  count: Count
})
export type ArchiveNotificationContextResult = Schema.Schema.Type<typeof ArchiveNotificationContextResultSchema>
export const ObjectNotificationSubscriptionResultSchema = Schema.Struct({
  objectId: DocId,
  objectClass: ObjectClassName,
  subscribed: Schema.Boolean,
  changed: Schema.Boolean
})
export type ObjectNotificationSubscriptionResult = Schema.Schema.Type<typeof ObjectNotificationSubscriptionResultSchema>

export const ListNotificationProvidersResultSchema = Schema.Array(NotificationProviderSchema)
export const ListNotificationTypesResultSchema = Schema.Array(NotificationTypeSchema)
export const UnarchiveNotificationContextResultSchema = ArchiveNotificationContextResultSchema
export const SubscribeToObjectNotificationsResultSchema = ObjectNotificationSubscriptionResultSchema
export const UnsubscribeFromObjectNotificationsResultSchema = ObjectNotificationSubscriptionResultSchema
