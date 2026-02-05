import type { Class, Doc, DocumentUpdate, Ref } from "@hcengineering/core"
import { SortingOrder } from "@hcengineering/core"
import type {
  DocNotifyContext as HulyDocNotifyContext,
  InboxNotification as HulyInboxNotification,
  NotificationProvider,
  NotificationProviderSetting as HulyNotificationProviderSetting
} from "@hcengineering/notification"
import { Effect } from "effect"

import type {
  ArchiveNotificationParams,
  DeleteNotificationParams,
  DocNotifyContextSummary,
  GetNotificationContextParams,
  GetNotificationParams,
  ListNotificationContextsParams,
  ListNotificationSettingsParams,
  ListNotificationsParams,
  MarkNotificationReadParams,
  Notification,
  NotificationProviderSetting,
  NotificationSummary,
  PinNotificationContextParams,
  UpdateNotificationProviderSettingParams
} from "../../domain/schemas.js"
import { HulyClient, type HulyClientError } from "../client.js"
import { NotificationContextNotFoundError, NotificationNotFoundError } from "../errors.js"

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/consistent-type-imports -- CJS interop */
const notification = require("@hcengineering/notification")
  .default as typeof import("@hcengineering/notification").default
/* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/consistent-type-imports */

// --- Error Types ---

export type ListNotificationsError = HulyClientError

export type GetNotificationError =
  | HulyClientError
  | NotificationNotFoundError

export type MarkNotificationReadError =
  | HulyClientError
  | NotificationNotFoundError

export type ArchiveNotificationError =
  | HulyClientError
  | NotificationNotFoundError

export type DeleteNotificationError =
  | HulyClientError
  | NotificationNotFoundError

export type GetNotificationContextError =
  | HulyClientError
  | NotificationContextNotFoundError

export type ListNotificationContextsError = HulyClientError

export type PinNotificationContextError =
  | HulyClientError
  | NotificationContextNotFoundError

export type ListNotificationSettingsError = HulyClientError

export type UpdateNotificationProviderSettingError = HulyClientError

export type MarkAllNotificationsReadError = HulyClientError

export type ArchiveAllNotificationsError = HulyClientError

// --- Helpers ---

const findNotification = (
  notificationId: string
): Effect.Effect<
  { client: HulyClient["Type"]; notification: HulyInboxNotification },
  NotificationNotFoundError | HulyClientError,
  HulyClient
> =>
  Effect.gen(function*() {
    const client = yield* HulyClient

    const notif = yield* client.findOne<HulyInboxNotification>(
      notification.class.InboxNotification,
      { _id: notificationId as Ref<HulyInboxNotification> }
    )

    if (notif === undefined) {
      return yield* new NotificationNotFoundError({ notificationId })
    }

    return { client, notification: notif }
  })

const findNotificationContext = (
  contextId: string
): Effect.Effect<
  { client: HulyClient["Type"]; context: HulyDocNotifyContext },
  NotificationContextNotFoundError | HulyClientError,
  HulyClient
> =>
  Effect.gen(function*() {
    const client = yield* HulyClient

    const ctx = yield* client.findOne<HulyDocNotifyContext>(
      notification.class.DocNotifyContext,
      { _id: contextId as Ref<HulyDocNotifyContext> }
    )

    if (ctx === undefined) {
      return yield* new NotificationContextNotFoundError({ contextId })
    }

    return { client, context: ctx }
  })

// --- Operations ---

/**
 * List inbox notifications.
 * Results sorted by modification date descending (newest first).
 */
export const listNotifications = (
  params: ListNotificationsParams
): Effect.Effect<Array<NotificationSummary>, ListNotificationsError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient

    const query: Record<string, unknown> = {}

    if (!params.includeArchived) {
      query.archived = false
    }

    if (params.unreadOnly) {
      query.isViewed = false
    }

    const limit = Math.min(params.limit ?? 50, 200)

    const notifications = yield* client.findAll<HulyInboxNotification>(
      notification.class.InboxNotification,
      query,
      {
        limit,
        sort: {
          modifiedOn: SortingOrder.Descending
        }
      }
    )

    const summaries: Array<NotificationSummary> = notifications.map((n) => ({
      id: String(n._id),
      isViewed: n.isViewed,
      archived: n.archived,
      objectId: n.objectId ? String(n.objectId) : undefined,
      objectClass: n.objectClass ? String(n.objectClass) : undefined,
      title: n.title ? String(n.title) : undefined,
      body: n.body ? String(n.body) : undefined,
      createdOn: n.createdOn,
      modifiedOn: n.modifiedOn
    }))

    return summaries
  })

/**
 * Get a single notification with full details.
 */
export const getNotification = (
  params: GetNotificationParams
): Effect.Effect<Notification, GetNotificationError, HulyClient> =>
  Effect.gen(function*() {
    const { notification: notif } = yield* findNotification(params.notificationId)

    const result: Notification = {
      id: String(notif._id),
      isViewed: notif.isViewed,
      archived: notif.archived,
      objectId: notif.objectId ? String(notif.objectId) : undefined,
      objectClass: notif.objectClass ? String(notif.objectClass) : undefined,
      docNotifyContextId: notif.docNotifyContext ? String(notif.docNotifyContext) : undefined,
      title: notif.title ? String(notif.title) : undefined,
      body: notif.body ? String(notif.body) : undefined,
      data: notif.data ? String(notif.data) : undefined,
      createdOn: notif.createdOn,
      modifiedOn: notif.modifiedOn
    }

    return result
  })

/**
 * Mark a notification as read.
 */
export interface MarkNotificationReadResult {
  id: string
  marked: boolean
}

export const markNotificationRead = (
  params: MarkNotificationReadParams
): Effect.Effect<MarkNotificationReadResult, MarkNotificationReadError, HulyClient> =>
  Effect.gen(function*() {
    const { client, notification: notif } = yield* findNotification(params.notificationId)

    if (notif.isViewed) {
      return { id: String(notif._id), marked: false }
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

    return { id: String(notif._id), marked: true }
  })

/**
 * Mark all notifications as read.
 */
export interface MarkAllNotificationsReadResult {
  count: number
}

export const markAllNotificationsRead = (): Effect.Effect<
  MarkAllNotificationsReadResult,
  MarkAllNotificationsReadError,
  HulyClient
> =>
  Effect.gen(function*() {
    const client = yield* HulyClient

    const unreadNotifications = yield* client.findAll<HulyInboxNotification>(
      notification.class.InboxNotification,
      { isViewed: false, archived: false },
      { limit: 200 }
    )

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

    return { count: unreadNotifications.length }
  })

/**
 * Archive a notification.
 */
export interface ArchiveNotificationResult {
  id: string
  archived: boolean
}

export const archiveNotification = (
  params: ArchiveNotificationParams
): Effect.Effect<ArchiveNotificationResult, ArchiveNotificationError, HulyClient> =>
  Effect.gen(function*() {
    const { client, notification: notif } = yield* findNotification(params.notificationId)

    if (notif.archived) {
      return { id: String(notif._id), archived: false }
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

    return { id: String(notif._id), archived: true }
  })

/**
 * Archive all notifications.
 */
export interface ArchiveAllNotificationsResult {
  count: number
}

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
      { limit: 200 }
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

    return { count: activeNotifications.length }
  })

/**
 * Delete a notification.
 */
export interface DeleteNotificationResult {
  id: string
  deleted: boolean
}

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

    return { id: String(notif._id), deleted: true }
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
      {
        objectId: params.objectId as Ref<Doc>,
        objectClass: params.objectClass as Ref<Class<Doc>>
      }
    )

    if (ctx === undefined) {
      return null
    }

    const result: DocNotifyContextSummary = {
      id: String(ctx._id),
      objectId: String(ctx.objectId),
      objectClass: String(ctx.objectClass),
      isPinned: ctx.isPinned,
      hidden: ctx.hidden,
      lastViewedTimestamp: ctx.lastViewedTimestamp,
      lastUpdateTimestamp: ctx.lastUpdateTimestamp
    }

    return result
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

    const query: Record<string, unknown> = {
      hidden: false
    }

    if (params.pinnedOnly) {
      query.isPinned = true
    }

    const limit = Math.min(params.limit ?? 50, 200)

    const contexts = yield* client.findAll<HulyDocNotifyContext>(
      notification.class.DocNotifyContext,
      query,
      {
        limit,
        sort: {
          lastUpdateTimestamp: SortingOrder.Descending
        }
      }
    )

    const summaries: Array<DocNotifyContextSummary> = contexts.map((ctx) => ({
      id: String(ctx._id),
      objectId: String(ctx.objectId),
      objectClass: String(ctx.objectClass),
      isPinned: ctx.isPinned,
      hidden: ctx.hidden,
      lastViewedTimestamp: ctx.lastViewedTimestamp,
      lastUpdateTimestamp: ctx.lastUpdateTimestamp
    }))

    return summaries
  })

/**
 * Pin or unpin a notification context.
 */
export interface PinNotificationContextResult {
  id: string
  isPinned: boolean
}

export const pinNotificationContext = (
  params: PinNotificationContextParams
): Effect.Effect<PinNotificationContextResult, PinNotificationContextError, HulyClient> =>
  Effect.gen(function*() {
    const { client, context } = yield* findNotificationContext(params.contextId)

    if (context.isPinned === params.pinned) {
      return { id: String(context._id), isPinned: context.isPinned }
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

    return { id: String(context._id), isPinned: params.pinned }
  })

/**
 * List notification provider settings.
 */
export const listNotificationSettings = (
  params: ListNotificationSettingsParams
): Effect.Effect<Array<NotificationProviderSetting>, ListNotificationSettingsError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient

    const limit = Math.min(params.limit ?? 50, 200)

    const settings = yield* client.findAll<HulyNotificationProviderSetting>(
      notification.class.NotificationProviderSetting,
      {},
      { limit }
    )

    const summaries: Array<NotificationProviderSetting> = settings.map((s) => ({
      id: String(s._id),
      providerId: String(s.attachedTo),
      enabled: s.enabled
    }))

    return summaries
  })

/**
 * Update notification provider setting.
 */
export interface UpdateNotificationProviderSettingResult {
  providerId: string
  enabled: boolean
  updated: boolean
}

export const updateNotificationProviderSetting = (
  params: UpdateNotificationProviderSettingParams
): Effect.Effect<UpdateNotificationProviderSettingResult, UpdateNotificationProviderSettingError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient

    const existingSetting = yield* client.findOne<HulyNotificationProviderSetting>(
      notification.class.NotificationProviderSetting,
      { attachedTo: params.providerId as Ref<NotificationProvider> }
    )

    if (existingSetting !== undefined) {
      if (existingSetting.enabled === params.enabled) {
        return { providerId: params.providerId, enabled: params.enabled, updated: false }
      }

      yield* client.updateDoc(
        notification.class.NotificationProviderSetting,
        existingSetting.space,
        existingSetting._id,
        { enabled: params.enabled }
      )

      return { providerId: params.providerId, enabled: params.enabled, updated: true }
    }

    // Setting doesn't exist, we can't create it without a proper space
    // Return not updated since we can't modify what doesn't exist
    return { providerId: params.providerId, enabled: params.enabled, updated: false }
  })

/**
 * Get unread notification count.
 */
export interface UnreadCountResult {
  count: number
}

export const getUnreadNotificationCount = (): Effect.Effect<UnreadCountResult, HulyClientError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient

    const unreadNotifications = yield* client.findAll<HulyInboxNotification>(
      notification.class.InboxNotification,
      { isViewed: false, archived: false },
      { limit: 1 }
    )

    const count = unreadNotifications.total ?? unreadNotifications.length

    return { count }
  })
