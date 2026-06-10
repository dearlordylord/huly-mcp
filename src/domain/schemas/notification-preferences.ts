import { JSONSchema, Schema } from "effect"

import type { DisplayText, NotificationFieldName, NotificationProviderOrder } from "./domain-values.js"
import type { Count, NotificationTypeId, NotificationTypeSettingId } from "./shared.js"
import {
  DEFAULT_LIMIT,
  DocId,
  LimitParam,
  NotificationContextId,
  NotificationProviderId,
  NotificationTypeId as NotificationTypeIdSchema,
  ObjectClassName
} from "./shared.js"

export interface NotificationProvider {
  readonly id: NotificationProviderId
  readonly label?: DisplayText | undefined
  readonly description?: DisplayText | undefined
  readonly defaultEnabled: boolean
  readonly canDisable: boolean
  readonly order: NotificationProviderOrder
  readonly depends?: NotificationProviderId | undefined
}

export interface NotificationType {
  readonly id: NotificationTypeId
  readonly label?: DisplayText | undefined
  readonly generated: boolean
  readonly hidden: boolean
  readonly defaultEnabled: boolean
  readonly group?: DocId | undefined
  readonly objectClass: ObjectClassName
  readonly onlyOwn?: boolean | undefined
  readonly attachedToClass?: ObjectClassName | undefined
  readonly field?: NotificationFieldName | undefined
  readonly spaceSubscribe?: boolean | undefined
  readonly allowedForAuthor?: boolean | undefined
}

export interface NotificationTypeSetting {
  readonly id: NotificationTypeSettingId
  readonly providerId: NotificationProviderId
  readonly typeId: NotificationTypeId
  readonly enabled: boolean
}

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

export interface UpdateNotificationTypeSettingResult {
  readonly providerId: NotificationProviderId
  readonly typeId: NotificationTypeId
  readonly enabled: boolean
  readonly updated: boolean
  readonly created: boolean
}

export interface ArchiveNotificationContextResult {
  readonly contextId: NotificationContextId
  readonly archived: boolean
  readonly count: Count
}

export interface ObjectNotificationSubscriptionResult {
  readonly objectId: DocId
  readonly objectClass: ObjectClassName
  readonly subscribed: boolean
  readonly changed: boolean
}
