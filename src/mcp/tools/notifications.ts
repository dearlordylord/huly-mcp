import { Effect } from "effect"

import {
  archiveNotificationContextParamsJsonSchema,
  archiveNotificationParamsJsonSchema,
  deleteNotificationParamsJsonSchema,
  emptyParamsJsonSchema,
  getNotificationContextParamsJsonSchema,
  getNotificationParamsJsonSchema,
  hideNotificationContextParamsJsonSchema,
  listNotificationContextsParamsJsonSchema,
  listNotificationProvidersParamsJsonSchema,
  listNotificationSettingsParamsJsonSchema,
  listNotificationsParamsJsonSchema,
  listNotificationTypesParamsJsonSchema,
  markNotificationReadParamsJsonSchema,
  markNotificationUnreadParamsJsonSchema,
  parseArchiveNotificationContextParams,
  parseArchiveNotificationParams,
  parseDeleteNotificationParams,
  parseGetNotificationContextParams,
  parseGetNotificationParams,
  parseHideNotificationContextParams,
  parseListNotificationContextsParams,
  parseListNotificationProvidersParams,
  parseListNotificationSettingsParams,
  parseListNotificationsParams,
  parseListNotificationTypesParams,
  parseMarkNotificationReadParams,
  parseMarkNotificationUnreadParams,
  parsePinNotificationContextParams,
  parseSubscribeToObjectNotificationsParams,
  parseUnarchiveNotificationContextParams,
  parseUnarchiveNotificationParams,
  parseUnsubscribeFromObjectNotificationsParams,
  parseUpdateNotificationProviderSettingParams,
  parseUpdateNotificationTypeSettingParams,
  pinNotificationContextParamsJsonSchema,
  subscribeToObjectNotificationsParamsJsonSchema,
  unarchiveNotificationContextParamsJsonSchema,
  unarchiveNotificationParamsJsonSchema,
  unsubscribeFromObjectNotificationsParamsJsonSchema,
  updateNotificationProviderSettingParamsJsonSchema,
  updateNotificationTypeSettingParamsJsonSchema
} from "../../domain/schemas.js"
import {
  archiveNotificationContext,
  listNotificationProviders,
  listNotificationTypes,
  subscribeToObjectNotifications,
  unarchiveNotificationContext,
  unsubscribeFromObjectNotifications,
  updateNotificationTypeSetting
} from "../../huly/operations/notification-preferences.js"
import {
  archiveAllNotifications,
  archiveNotification,
  deleteNotification,
  getNotification,
  getNotificationContext,
  getUnreadNotificationCount,
  hideNotificationContext,
  listNotificationContexts,
  listNotifications,
  listNotificationSettings,
  markAllNotificationsRead,
  markNotificationRead,
  markNotificationUnread,
  pinNotificationContext,
  unarchiveNotification,
  updateNotificationProviderSetting
} from "../../huly/operations/notifications.js"
import { createToolHandler, type RegisteredTool } from "./registry.js"

const CATEGORY = "notifications" as const

export const notificationTools: ReadonlyArray<RegisteredTool> = [
  {
    name: "list_notification_providers",
    description:
      "List notification providers such as inbox, push, and sound. Use provider IDs from this tool when updating provider or type settings.",
    category: CATEGORY,
    inputSchema: listNotificationProvidersParamsJsonSchema,
    handler: createToolHandler(
      "list_notification_providers",
      parseListNotificationProvidersParams,
      listNotificationProviders
    )
  },
  {
    name: "list_notification_types",
    description:
      "List notification types. Use type IDs from this tool when updating provider-specific notification type settings.",
    category: CATEGORY,
    inputSchema: listNotificationTypesParamsJsonSchema,
    handler: createToolHandler(
      "list_notification_types",
      parseListNotificationTypesParams,
      listNotificationTypes
    )
  },
  {
    name: "list_notifications",
    description:
      "List inbox notifications. Returns notifications sorted by modification date (newest first). Supports filtering by read/archived status.",
    category: CATEGORY,
    inputSchema: listNotificationsParamsJsonSchema,
    handler: createToolHandler(
      "list_notifications",
      parseListNotificationsParams,
      listNotifications
    )
  },
  {
    name: "get_notification",
    description: "Retrieve full details for a notification. Use this to view notification content and metadata.",
    category: CATEGORY,
    inputSchema: getNotificationParamsJsonSchema,
    handler: createToolHandler(
      "get_notification",
      parseGetNotificationParams,
      getNotification
    )
  },
  {
    name: "mark_notification_read",
    description: "Mark a notification as read. Idempotent: returns success when the notification is already read.",
    category: CATEGORY,
    inputSchema: markNotificationReadParamsJsonSchema,
    handler: createToolHandler(
      "mark_notification_read",
      parseMarkNotificationReadParams,
      markNotificationRead
    )
  },
  {
    name: "mark_notification_unread",
    description: "Mark a notification as unread. Idempotent: returns success when the notification is already unread.",
    category: CATEGORY,
    inputSchema: markNotificationUnreadParamsJsonSchema,
    handler: createToolHandler(
      "mark_notification_unread",
      parseMarkNotificationUnreadParams,
      markNotificationUnread
    )
  },
  {
    name: "mark_all_notifications_read",
    description: "Mark all unread notifications as read. Returns the count of notifications marked.",
    category: CATEGORY,
    inputSchema: emptyParamsJsonSchema,
    handler: createToolHandler(
      "mark_all_notifications_read",
      () => Effect.succeed({}),
      markAllNotificationsRead
    )
  },
  {
    name: "archive_notification",
    description:
      "Archive a notification. Archived notifications are hidden from the main inbox view. Idempotent when already archived.",
    category: CATEGORY,
    inputSchema: archiveNotificationParamsJsonSchema,
    handler: createToolHandler(
      "archive_notification",
      parseArchiveNotificationParams,
      archiveNotification
    )
  },
  {
    name: "unarchive_notification",
    description:
      "Unarchive a notification so it can appear in active notification lists again. Idempotent when already active.",
    category: CATEGORY,
    inputSchema: unarchiveNotificationParamsJsonSchema,
    handler: createToolHandler(
      "unarchive_notification",
      parseUnarchiveNotificationParams,
      unarchiveNotification
    )
  },
  {
    name: "archive_all_notifications",
    description: "Archive all notifications. Returns the count of notifications archived.",
    category: CATEGORY,
    inputSchema: emptyParamsJsonSchema,
    handler: createToolHandler(
      "archive_all_notifications",
      () => Effect.succeed({}),
      archiveAllNotifications
    )
  },
  {
    name: "delete_notification",
    description: "Permanently delete a notification. This action cannot be undone.",
    category: CATEGORY,
    inputSchema: deleteNotificationParamsJsonSchema,
    handler: createToolHandler(
      "delete_notification",
      parseDeleteNotificationParams,
      deleteNotification
    )
  },
  {
    name: "get_notification_context",
    description: "Get notification context for an entity. Returns tracking information for a specific object.",
    category: CATEGORY,
    inputSchema: getNotificationContextParamsJsonSchema,
    handler: createToolHandler(
      "get_notification_context",
      parseGetNotificationContextParams,
      getNotificationContext
    )
  },
  {
    name: "list_notification_contexts",
    description:
      "List notification contexts. Returns contexts sorted by last update timestamp (newest first). Supports filtering by pinned status and can include hidden contexts.",
    category: CATEGORY,
    inputSchema: listNotificationContextsParamsJsonSchema,
    handler: createToolHandler(
      "list_notification_contexts",
      parseListNotificationContextsParams,
      listNotificationContexts
    )
  },
  {
    name: "pin_notification_context",
    description:
      "Pin or unpin a notification context. Pinned contexts are highlighted in the inbox. Idempotent when the pin state already matches.",
    category: CATEGORY,
    inputSchema: pinNotificationContextParamsJsonSchema,
    handler: createToolHandler(
      "pin_notification_context",
      parsePinNotificationContextParams,
      pinNotificationContext
    )
  },
  {
    name: "hide_notification_context",
    description:
      "Hide or unhide a notification context. Hidden contexts are omitted from list_notification_contexts unless includeHidden is true. Idempotent when the hidden state already matches.",
    category: CATEGORY,
    inputSchema: hideNotificationContextParamsJsonSchema,
    handler: createToolHandler(
      "hide_notification_context",
      parseHideNotificationContextParams,
      hideNotificationContext
    )
  },
  {
    name: "archive_notification_context",
    description:
      "Archive all inbox notifications in a notification context. Idempotent: returns count 0 when no active notifications remain.",
    category: CATEGORY,
    inputSchema: archiveNotificationContextParamsJsonSchema,
    handler: createToolHandler(
      "archive_notification_context",
      parseArchiveNotificationContextParams,
      archiveNotificationContext
    )
  },
  {
    name: "unarchive_notification_context",
    description:
      "Unarchive all archived inbox notifications in a notification context. Idempotent: returns count 0 when no archived notifications remain.",
    category: CATEGORY,
    inputSchema: unarchiveNotificationContextParamsJsonSchema,
    handler: createToolHandler(
      "unarchive_notification_context",
      parseUnarchiveNotificationContextParams,
      unarchiveNotificationContext
    )
  },
  {
    name: "subscribe_to_object_notifications",
    description:
      "Subscribe the authenticated account to notifications for a raw Huly object by adding a core collaborator row. Idempotent when already subscribed.",
    category: CATEGORY,
    inputSchema: subscribeToObjectNotificationsParamsJsonSchema,
    handler: createToolHandler(
      "subscribe_to_object_notifications",
      parseSubscribeToObjectNotificationsParams,
      subscribeToObjectNotifications
    )
  },
  {
    name: "unsubscribe_from_object_notifications",
    description:
      "Unsubscribe the authenticated account from notifications for a raw Huly object by removing its collaborator row. Idempotent when already absent.",
    category: CATEGORY,
    inputSchema: unsubscribeFromObjectNotificationsParamsJsonSchema,
    handler: createToolHandler(
      "unsubscribe_from_object_notifications",
      parseUnsubscribeFromObjectNotificationsParams,
      unsubscribeFromObjectNotifications
    )
  },
  {
    name: "list_notification_settings",
    description: "List notification provider settings. Returns current notification preferences.",
    category: CATEGORY,
    inputSchema: listNotificationSettingsParamsJsonSchema,
    handler: createToolHandler(
      "list_notification_settings",
      parseListNotificationSettingsParams,
      listNotificationSettings
    )
  },
  {
    name: "update_notification_provider_setting",
    description: "Update notification provider setting. Enable or disable notifications for a specific provider.",
    category: CATEGORY,
    inputSchema: updateNotificationProviderSettingParamsJsonSchema,
    handler: createToolHandler(
      "update_notification_provider_setting",
      parseUpdateNotificationProviderSettingParams,
      updateNotificationProviderSetting
    )
  },
  {
    name: "update_notification_type_setting",
    description:
      "Enable or disable one notification type for one provider. Creates the type setting only when the provider has a configurable setting in this workspace.",
    category: CATEGORY,
    inputSchema: updateNotificationTypeSettingParamsJsonSchema,
    handler: createToolHandler(
      "update_notification_type_setting",
      parseUpdateNotificationTypeSettingParams,
      updateNotificationTypeSetting
    )
  },
  {
    name: "get_unread_notification_count",
    description: "Get the count of unread notifications.",
    category: CATEGORY,
    inputSchema: emptyParamsJsonSchema,
    handler: createToolHandler(
      "get_unread_notification_count",
      () => Effect.succeed({}),
      getUnreadNotificationCount
    )
  }
]
