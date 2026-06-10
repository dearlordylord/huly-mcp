import type { DocumentUpdate } from "@hcengineering/core"
import type {
  DocNotifyContext as HulyDocNotifyContext,
  InboxNotification as HulyInboxNotification
} from "@hcengineering/notification"
import { Effect } from "effect"

import type {
  ArchiveNotificationParams,
  DeleteNotificationParams,
  HideNotificationContextParams,
  MarkNotificationReadParams,
  MarkNotificationUnreadParams,
  PinNotificationContextParams,
  UnarchiveNotificationParams
} from "../../domain/schemas.js"
import type {
  ArchiveAllNotificationsResult,
  ArchiveNotificationResult,
  DeleteNotificationResult,
  HideNotificationContextResult,
  MarkAllNotificationsReadResult,
  MarkNotificationReadResult,
  MarkNotificationUnreadResult,
  PinNotificationContextResult,
  UnarchiveNotificationResult
} from "../../domain/schemas/notifications.js"
import { Count, NotificationContextId, NotificationId } from "../../domain/schemas/shared.js"
import { HulyClient } from "../client.js"
import { notification } from "../huly-plugins.js"
import {
  type ArchiveAllNotificationsError,
  type ArchiveNotificationError,
  type DeleteNotificationError,
  findNotification,
  findNotificationContext,
  findUnreadActiveNotifications,
  type HideNotificationContextError,
  type MarkAllNotificationsReadError,
  type MarkNotificationReadError,
  type MarkNotificationUnreadError,
  type PinNotificationContextError,
  type UnarchiveNotificationError
} from "./notifications-shared.js"

const BULK_NOTIFICATION_LIMIT = 200

/**
 * Mark a notification as read.
 */
export const markNotificationRead = (
  params: MarkNotificationReadParams
): Effect.Effect<MarkNotificationReadResult, MarkNotificationReadError, HulyClient> =>
  Effect.gen(function*() {
    const { client, notification: notif } = yield* findNotification(params.notificationId)

    if (notif.isViewed) {
      return { id: NotificationId.make(notif._id), marked: true }
    }

    const updateOps: DocumentUpdate<HulyInboxNotification> = {
      isViewed: true
    }

    yield* client.updateDoc(
      notification.class.InboxNotification,
      notif.space,
      notif._id,
      updateOps
    )

    return { id: NotificationId.make(notif._id), marked: true }
  })

/**
 * Mark a notification as unread.
 */
export const markNotificationUnread = (
  params: MarkNotificationUnreadParams
): Effect.Effect<MarkNotificationUnreadResult, MarkNotificationUnreadError, HulyClient> =>
  Effect.gen(function*() {
    const { client, notification: notif } = yield* findNotification(params.notificationId)

    if (!notif.isViewed) {
      return { id: NotificationId.make(notif._id), marked: true }
    }

    const updateOps: DocumentUpdate<HulyInboxNotification> = {
      isViewed: false
    }

    yield* client.updateDoc(
      notification.class.InboxNotification,
      notif.space,
      notif._id,
      updateOps
    )

    return { id: NotificationId.make(notif._id), marked: true }
  })

/**
 * Mark all notifications as read.
 */
export const markAllNotificationsRead = (): Effect.Effect<
  MarkAllNotificationsReadResult,
  MarkAllNotificationsReadError,
  HulyClient
> =>
  Effect.gen(function*() {
    const client = yield* HulyClient

    const unreadNotifications = yield* findUnreadActiveNotifications(client, BULK_NOTIFICATION_LIMIT)

    // Concurrent updates (10x speedup). Limited to 200/call.
    yield* Effect.forEach(
      unreadNotifications,
      (notif) =>
        client.updateDoc(
          notification.class.InboxNotification,
          notif.space,
          notif._id,
          { isViewed: true }
        ),
      { concurrency: 10 }
    )

    return { count: Count.make(unreadNotifications.length) }
  })

/**
 * Archive a notification.
 */
export const archiveNotification = (
  params: ArchiveNotificationParams
): Effect.Effect<ArchiveNotificationResult, ArchiveNotificationError, HulyClient> =>
  Effect.gen(function*() {
    const { client, notification: notif } = yield* findNotification(params.notificationId)

    if (notif.archived) {
      return { id: NotificationId.make(notif._id), archived: true }
    }

    const updateOps: DocumentUpdate<HulyInboxNotification> = {
      archived: true
    }

    yield* client.updateDoc(
      notification.class.InboxNotification,
      notif.space,
      notif._id,
      updateOps
    )

    return { id: NotificationId.make(notif._id), archived: true }
  })

/**
 * Unarchive a notification.
 */
export const unarchiveNotification = (
  params: UnarchiveNotificationParams
): Effect.Effect<UnarchiveNotificationResult, UnarchiveNotificationError, HulyClient> =>
  Effect.gen(function*() {
    const { client, notification: notif } = yield* findNotification(params.notificationId)

    if (!notif.archived) {
      return { id: NotificationId.make(notif._id), archived: false }
    }

    const updateOps: DocumentUpdate<HulyInboxNotification> = {
      archived: false
    }

    yield* client.updateDoc(
      notification.class.InboxNotification,
      notif.space,
      notif._id,
      updateOps
    )

    return { id: NotificationId.make(notif._id), archived: false }
  })

/**
 * Archive all notifications.
 */
export const archiveAllNotifications = (): Effect.Effect<
  ArchiveAllNotificationsResult,
  ArchiveAllNotificationsError,
  HulyClient
> =>
  Effect.gen(function*() {
    const client = yield* HulyClient

    const activeNotifications = yield* client.findAll<HulyInboxNotification>(
      notification.class.InboxNotification,
      { archived: false },
      { limit: BULK_NOTIFICATION_LIMIT }
    )

    // Concurrent updates (10x speedup). Limited to 200/call.
    yield* Effect.forEach(
      activeNotifications,
      (notif) =>
        client.updateDoc(
          notification.class.InboxNotification,
          notif.space,
          notif._id,
          { archived: true }
        ),
      { concurrency: 10 }
    )

    return { count: Count.make(activeNotifications.length) }
  })

/**
 * Delete a notification.
 */
export const deleteNotification = (
  params: DeleteNotificationParams
): Effect.Effect<DeleteNotificationResult, DeleteNotificationError, HulyClient> =>
  Effect.gen(function*() {
    const { client, notification: notif } = yield* findNotification(params.notificationId)

    yield* client.removeDoc(
      notification.class.InboxNotification,
      notif.space,
      notif._id
    )

    return { id: NotificationId.make(notif._id), deleted: true }
  })

/**
 * Pin or unpin a notification context.
 */
export const pinNotificationContext = (
  params: PinNotificationContextParams
): Effect.Effect<PinNotificationContextResult, PinNotificationContextError, HulyClient> =>
  Effect.gen(function*() {
    const { client, context } = yield* findNotificationContext(params.contextId)

    if (context.isPinned === params.pinned) {
      return { id: NotificationContextId.make(context._id), isPinned: context.isPinned }
    }

    const updateOps: DocumentUpdate<HulyDocNotifyContext> = {
      isPinned: params.pinned
    }

    yield* client.updateDoc(
      notification.class.DocNotifyContext,
      context.space,
      context._id,
      updateOps
    )

    return { id: NotificationContextId.make(context._id), isPinned: params.pinned }
  })

/**
 * Hide or unhide a notification context.
 */
export const hideNotificationContext = (
  params: HideNotificationContextParams
): Effect.Effect<HideNotificationContextResult, HideNotificationContextError, HulyClient> =>
  Effect.gen(function*() {
    const { client, context } = yield* findNotificationContext(params.contextId)

    if (context.hidden === params.hidden) {
      return { id: NotificationContextId.make(context._id), hidden: context.hidden }
    }

    const updateOps: DocumentUpdate<HulyDocNotifyContext> = {
      hidden: params.hidden
    }

    yield* client.updateDoc(
      notification.class.DocNotifyContext,
      context.space,
      context._id,
      updateOps
    )

    return { id: NotificationContextId.make(context._id), hidden: params.hidden }
  })
