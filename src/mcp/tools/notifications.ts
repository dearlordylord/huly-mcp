import { Effect } from "effect"

import {
  archiveNotificationParamsJsonSchema,
  deleteNotificationParamsJsonSchema,
  getNotificationContextParamsJsonSchema,
  getNotificationParamsJsonSchema,
  listNotificationContextsParamsJsonSchema,
  listNotificationsParamsJsonSchema,
  listNotificationSettingsParamsJsonSchema,
  markNotificationReadParamsJsonSchema,
  parseArchiveNotificationParams,
  parseDeleteNotificationParams,
  parseGetNotificationContextParams,
  parseGetNotificationParams,
  parseListNotificationContextsParams,
  parseListNotificationsParams,
  parseListNotificationSettingsParams,
  parseMarkNotificationReadParams,
  parsePinNotificationContextParams,
  parseUpdateNotificationProviderSettingParams,
  pinNotificationContextParamsJsonSchema,
  updateNotificationProviderSettingParamsJsonSchema
} from "../../domain/schemas.js"
import {
  archiveAllNotifications,
  archiveNotification,
  deleteNotification,
  getNotification,
  getNotificationContext,
  getUnreadNotificationCount,
  listNotificationContexts,
  listNotifications,
  listNotificationSettings,
  markAllNotificationsRead,
  markNotificationRead,
  pinNotificationContext,
  updateNotificationProviderSetting
} from "../../huly/operations/notifications.js"
import { createToolHandler, type RegisteredTool } from "./registry.js"

export const notificationTools: ReadonlyArray<RegisteredTool> = [
  {
    name: "list_notifications",
    description: "List inbox notifications. Returns notifications sorted by modification date (newest first). Supports filtering by read/archived status.",
    inputSchema: listNotificationsParamsJsonSchema,
    handler: createToolHandler(
      "list_notifications",
      parseListNotificationsParams,
      (params) => listNotifications(params)
    )
  },
  {
    name: "get_notification",
    description: "Retrieve full details for a notification. Use this to view notification content and metadata.",
    inputSchema: getNotificationParamsJsonSchema,
    handler: createToolHandler(
      "get_notification",
      parseGetNotificationParams,
      (params) => getNotification(params)
    )
  },
  {
    name: "mark_notification_read",
    description: "Mark a notification as read.",
    inputSchema: markNotificationReadParamsJsonSchema,
    handler: createToolHandler(
      "mark_notification_read",
      parseMarkNotificationReadParams,
      (params) => markNotificationRead(params)
    )
  },
  {
    name: "mark_all_notifications_read",
    description: "Mark all unread notifications as read. Returns the count of notifications marked.",
    inputSchema: {},
    handler: createToolHandler(
      "mark_all_notifications_read",
      () => Effect.succeed({}),
      () => markAllNotificationsRead()
    )
  },
  {
    name: "archive_notification",
    description: "Archive a notification. Archived notifications are hidden from the main inbox view.",
    inputSchema: archiveNotificationParamsJsonSchema,
    handler: createToolHandler(
      "archive_notification",
      parseArchiveNotificationParams,
      (params) => archiveNotification(params)
    )
  },
  {
    name: "archive_all_notifications",
    description: "Archive all notifications. Returns the count of notifications archived.",
    inputSchema: {},
    handler: createToolHandler(
      "archive_all_notifications",
      () => Effect.succeed({}),
      () => archiveAllNotifications()
    )
  },
  {
    name: "delete_notification",
    description: "Permanently delete a notification. This action cannot be undone.",
    inputSchema: deleteNotificationParamsJsonSchema,
    handler: createToolHandler(
      "delete_notification",
      parseDeleteNotificationParams,
      (params) => deleteNotification(params)
    )
  },
  {
    name: "get_notification_context",
    description: "Get notification context for an entity. Returns tracking information for a specific object.",
    inputSchema: getNotificationContextParamsJsonSchema,
    handler: createToolHandler(
      "get_notification_context",
      parseGetNotificationContextParams,
      (params) => getNotificationContext(params)
    )
  },
  {
    name: "list_notification_contexts",
    description: "List notification contexts. Returns contexts sorted by last update timestamp (newest first). Supports filtering by pinned status.",
    inputSchema: listNotificationContextsParamsJsonSchema,
    handler: createToolHandler(
      "list_notification_contexts",
      parseListNotificationContextsParams,
      (params) => listNotificationContexts(params)
    )
  },
  {
    name: "pin_notification_context",
    description: "Pin or unpin a notification context. Pinned contexts are highlighted in the inbox.",
    inputSchema: pinNotificationContextParamsJsonSchema,
    handler: createToolHandler(
      "pin_notification_context",
      parsePinNotificationContextParams,
      (params) => pinNotificationContext(params)
    )
  },
  {
    name: "list_notification_settings",
    description: "List notification provider settings. Returns current notification preferences.",
    inputSchema: listNotificationSettingsParamsJsonSchema,
    handler: createToolHandler(
      "list_notification_settings",
      parseListNotificationSettingsParams,
      (params) => listNotificationSettings(params)
    )
  },
  {
    name: "update_notification_provider_setting",
    description: "Update notification provider setting. Enable or disable notifications for a specific provider.",
    inputSchema: updateNotificationProviderSettingParamsJsonSchema,
    handler: createToolHandler(
      "update_notification_provider_setting",
      parseUpdateNotificationProviderSettingParams,
      (params) => updateNotificationProviderSetting(params)
    )
  },
  {
    name: "get_unread_notification_count",
    description: "Get the count of unread notifications.",
    inputSchema: {},
    handler: createToolHandler(
      "get_unread_notification_count",
      () => Effect.succeed({}),
      () => getUnreadNotificationCount()
    )
  }
]
