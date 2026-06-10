import type { Class, Doc } from "@hcengineering/core"
import { SortingOrder } from "@hcengineering/core"
import type {
  DocNotifyContext as HulyDocNotifyContext,
  InboxNotification as HulyInboxNotification,
  NotificationProvider,
  NotificationProviderSetting as HulyNotificationProviderSetting
} from "@hcengineering/notification"
import { Effect } from "effect"

import type {
  DocNotifyContextSummary,
  GetNotificationContextParams,
  GetNotificationParams,
  ListNotificationContextsParams,
  ListNotificationSettingsParams,
  ListNotificationsParams,
  Notification,
  NotificationProviderSetting,
  NotificationSummary,
  UnreadCountResult,
  UpdateNotificationProviderSettingParams,
  UpdateNotificationProviderSettingResult
} from "../../domain/schemas/notifications.js"
import {
  DocId,
  NotificationContextId,
  NotificationId,
  NotificationProviderId,
  ObjectClassName
} from "../../domain/schemas/shared.js"
import { HulyClient, type HulyClientError } from "../client.js"
import { notification } from "../huly-plugins.js"
import { listTotal } from "./counts.js"
import {
  findNotification,
  findUnreadActiveNotifications,
  type GetNotificationContextError,
  type GetNotificationError,
  type ListNotificationContextsError,
  type ListNotificationsError,
  type ListNotificationSettingsError,
  toDocNotifyContextSummary,
  type UpdateNotificationProviderSettingError
} from "./notifications-shared.js"
import { clampLimit, hulyQuery, type StrictDocumentQuery } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"

export {
  archiveAllNotifications,
  archiveNotification,
  deleteNotification,
  hideNotificationContext,
  markAllNotificationsRead,
  markNotificationRead,
  markNotificationUnread,
  pinNotificationContext,
  unarchiveNotification
} from "./notifications-state.js"

/**
 * List inbox notifications.
 * Results sorted by modification date descending (newest first).
 */
export const listNotifications = (
  params: ListNotificationsParams
): Effect.Effect<Array<NotificationSummary>, ListNotificationsError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const query: StrictDocumentQuery<HulyInboxNotification> = {
      ...(params.includeArchived ? {} : { archived: false }),
      ...(params.unreadOnly ? { isViewed: false } : {})
    }
    const notifications = yield* client.findAll<HulyInboxNotification>(
      notification.class.InboxNotification,
      hulyQuery<HulyInboxNotification>(query),
      {
        limit: clampLimit(params.limit),
        sort: { modifiedOn: SortingOrder.Descending }
      }
    )

    return notifications.map((n) => ({
      id: NotificationId.make(n._id),
      isViewed: n.isViewed,
      archived: n.archived,
      objectId: DocId.make(n.objectId),
      objectClass: ObjectClassName.make(n.objectClass),
      title: n.title,
      body: n.body,
      createdOn: n.createdOn,
      modifiedOn: n.modifiedOn
    }))
  })

/**
 * Get a single notification with full details.
 */
export const getNotification = (
  params: GetNotificationParams
): Effect.Effect<Notification, GetNotificationError, HulyClient> =>
  Effect.gen(function*() {
    const { notification: notif } = yield* findNotification(params.notificationId)

    return {
      id: NotificationId.make(notif._id),
      isViewed: notif.isViewed,
      archived: notif.archived,
      objectId: DocId.make(notif.objectId),
      objectClass: ObjectClassName.make(notif.objectClass),
      docNotifyContextId: NotificationContextId.make(notif.docNotifyContext),
      title: notif.title,
      body: notif.body,
      data: notif.data ? notif.data : undefined,
      createdOn: notif.createdOn,
      modifiedOn: notif.modifiedOn
    }
  })

/**
 * Get notification context for an entity.
 */
export const getNotificationContext = (
  params: GetNotificationContextParams
): Effect.Effect<DocNotifyContextSummary | null, GetNotificationContextError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const ctx = yield* client.findOne<HulyDocNotifyContext>(
      notification.class.DocNotifyContext,
      hulyQuery<HulyDocNotifyContext>({
        objectId: toRef<Doc>(params.objectId),
        objectClass: toRef<Class<Doc>>(params.objectClass)
      })
    )

    return ctx === undefined ? null : toDocNotifyContextSummary(ctx)
  })

/**
 * List notification contexts.
 * Results sorted by last update timestamp descending (newest first).
 */
export const listNotificationContexts = (
  params: ListNotificationContextsParams
): Effect.Effect<Array<DocNotifyContextSummary>, ListNotificationContextsError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const query: StrictDocumentQuery<HulyDocNotifyContext> = {
      ...(params.includeHidden ? {} : { hidden: false }),
      ...(params.pinnedOnly ? { isPinned: true } : {})
    }
    const contexts = yield* client.findAll<HulyDocNotifyContext>(
      notification.class.DocNotifyContext,
      hulyQuery<HulyDocNotifyContext>(query),
      {
        limit: clampLimit(params.limit),
        sort: { lastUpdateTimestamp: SortingOrder.Descending }
      }
    )

    return contexts.map(toDocNotifyContextSummary)
  })

/**
 * List notification provider settings.
 */
export const listNotificationSettings = (
  params: ListNotificationSettingsParams
): Effect.Effect<Array<NotificationProviderSetting>, ListNotificationSettingsError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const settings = yield* client.findAll<HulyNotificationProviderSetting>(
      notification.class.NotificationProviderSetting,
      hulyQuery<HulyNotificationProviderSetting>({}),
      { limit: clampLimit(params.limit) }
    )

    return settings.map((s) => ({
      id: s._id,
      providerId: NotificationProviderId.make(s.attachedTo),
      enabled: s.enabled
    }))
  })

/**
 * Update notification provider setting.
 */
export const updateNotificationProviderSetting = (
  params: UpdateNotificationProviderSettingParams
): Effect.Effect<UpdateNotificationProviderSettingResult, UpdateNotificationProviderSettingError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const existingSetting = yield* client.findOne<HulyNotificationProviderSetting>(
      notification.class.NotificationProviderSetting,
      hulyQuery<HulyNotificationProviderSetting>({ attachedTo: toRef<NotificationProvider>(params.providerId) })
    )

    if (existingSetting !== undefined) {
      if (existingSetting.enabled === params.enabled) {
        return { providerId: NotificationProviderId.make(params.providerId), enabled: params.enabled, updated: false }
      }

      yield* client.updateDoc(
        notification.class.NotificationProviderSetting,
        existingSetting.space,
        existingSetting._id,
        { enabled: params.enabled }
      )

      return { providerId: NotificationProviderId.make(params.providerId), enabled: params.enabled, updated: true }
    }

    return { providerId: params.providerId, enabled: params.enabled, updated: false }
  })

/**
 * Get unread notification count.
 */
export const getUnreadNotificationCount = (): Effect.Effect<UnreadCountResult, HulyClientError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const unreadNotifications = yield* findUnreadActiveNotifications(client, 1)
    return { count: listTotal(unreadNotifications.total) }
  })
