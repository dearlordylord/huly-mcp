import type { FindResult } from "@hcengineering/core"
import type {
  DocNotifyContext as HulyDocNotifyContext,
  InboxNotification as HulyInboxNotification
} from "@hcengineering/notification"
import { Effect } from "effect"

import type { DocNotifyContextSummary } from "../../domain/schemas.js"
import { DocId, NotificationContextId, ObjectClassName } from "../../domain/schemas/shared.js"
import { HulyClient, type HulyClientError, type HulyClientOperations } from "../client.js"
import { NotificationContextNotFoundError, NotificationNotFoundError } from "../errors.js"
import { notification } from "../huly-plugins.js"
import { findOneOrFail, hulyQuery } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"

export type ListNotificationsError = HulyClientError

export type GetNotificationError =
  | HulyClientError
  | NotificationNotFoundError

export type MarkNotificationReadError =
  | HulyClientError
  | NotificationNotFoundError

export type MarkNotificationUnreadError =
  | HulyClientError
  | NotificationNotFoundError

export type ArchiveNotificationError =
  | HulyClientError
  | NotificationNotFoundError

export type UnarchiveNotificationError =
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

export type HideNotificationContextError =
  | HulyClientError
  | NotificationContextNotFoundError

export type ListNotificationSettingsError = HulyClientError

export type UpdateNotificationProviderSettingError = HulyClientError

export type MarkAllNotificationsReadError = HulyClientError

export type ArchiveAllNotificationsError = HulyClientError

export const toDocNotifyContextSummary = (ctx: HulyDocNotifyContext): DocNotifyContextSummary => ({
  id: NotificationContextId.make(ctx._id),
  objectId: DocId.make(ctx.objectId),
  objectClass: ObjectClassName.make(ctx.objectClass),
  isPinned: ctx.isPinned,
  hidden: ctx.hidden,
  lastViewedTimestamp: ctx.lastViewedTimestamp,
  lastUpdateTimestamp: ctx.lastUpdateTimestamp
})

export const findNotification = (
  notificationId: string
): Effect.Effect<
  { client: HulyClient["Type"]; notification: HulyInboxNotification },
  NotificationNotFoundError | HulyClientError,
  HulyClient
> =>
  Effect.gen(function*() {
    const client = yield* HulyClient

    const notif = yield* findOneOrFail(
      client,
      notification.class.InboxNotification,
      { _id: toRef<HulyInboxNotification>(notificationId) },
      () => new NotificationNotFoundError({ notificationId })
    )

    return { client, notification: notif }
  })

export const findNotificationContext = (
  contextId: string
): Effect.Effect<
  { client: HulyClient["Type"]; context: HulyDocNotifyContext },
  NotificationContextNotFoundError | HulyClientError,
  HulyClient
> =>
  Effect.gen(function*() {
    const client = yield* HulyClient

    const ctx = yield* findOneOrFail(
      client,
      notification.class.DocNotifyContext,
      { _id: toRef<HulyDocNotifyContext>(contextId) },
      () => new NotificationContextNotFoundError({ contextId })
    )

    return { client, context: ctx }
  })

export const findUnreadActiveNotifications = (
  client: HulyClientOperations,
  limit: number
): Effect.Effect<FindResult<HulyInboxNotification>, HulyClientError> =>
  client.findAll<HulyInboxNotification>(
    notification.class.InboxNotification,
    hulyQuery<HulyInboxNotification>({ isViewed: false, archived: false }),
    { limit }
  )
