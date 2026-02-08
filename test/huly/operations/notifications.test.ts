import { describe, it } from "@effect/vitest"
import type { PersonSpace } from "@hcengineering/contact"
import type { Class, Doc, Ref, Space } from "@hcengineering/core"
import { toFindResult } from "@hcengineering/core"
import type {
  DocNotifyContext as HulyDocNotifyContext,
  InboxNotification as HulyInboxNotification,
  NotificationProvider,
  NotificationProviderSetting as HulyNotificationProviderSetting
} from "@hcengineering/notification"
import { Effect } from "effect"
import { expect } from "vitest"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import type { NotificationContextNotFoundError, NotificationNotFoundError } from "../../../src/huly/errors.js"
import { notification } from "../../../src/huly/huly-plugins.js"
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
} from "../../../src/huly/operations/notifications.js"

const makeNotification = (overrides?: Partial<HulyInboxNotification>): HulyInboxNotification => {
  const result: HulyInboxNotification = {
    _id: "notif-1" as Ref<HulyInboxNotification>,
    _class: notification.class.InboxNotification,
    space: "person-space-1" as Ref<PersonSpace>,
    // eslint-disable-next-line no-restricted-syntax -- test mock requires double cast through unknown
    user: "user-1" as unknown as HulyInboxNotification["user"],
    isViewed: false,
    archived: false,
    objectId: "obj-1" as Ref<Doc>,
    objectClass: "tracker.class.Issue" as Ref<Class<Doc>>,
    docNotifyContext: "ctx-1" as Ref<HulyDocNotifyContext>,
    title: "New issue assigned" as HulyInboxNotification["title"],
    body: "Issue PROJ-1 was assigned to you" as HulyInboxNotification["body"],
    data: undefined,
    createdOn: 1706500000000,
    modifiedOn: 1706500000000,
    modifiedBy: "user-1" as Ref<Doc>,
    createdBy: "user-1" as Ref<Doc>,
    ...overrides
  }
  return result
}

const makeNotificationContext = (overrides?: Partial<HulyDocNotifyContext>): HulyDocNotifyContext => {
  const result: HulyDocNotifyContext = {
    _id: "ctx-1" as Ref<HulyDocNotifyContext>,
    _class: notification.class.DocNotifyContext,
    space: "person-space-1" as Ref<PersonSpace>,
    // eslint-disable-next-line no-restricted-syntax -- test mock requires double cast through unknown
    user: "user-1" as unknown as HulyDocNotifyContext["user"],
    objectId: "obj-1" as Ref<Doc>,
    objectClass: "tracker.class.Issue" as Ref<Class<Doc>>,
    objectSpace: "space-1" as Ref<Space>,
    isPinned: false,
    hidden: false,
    lastViewedTimestamp: 1706400000000,
    lastUpdateTimestamp: 1706500000000,
    modifiedBy: "user-1" as Ref<Doc>,
    modifiedOn: 1706500000000,
    createdBy: "user-1" as Ref<Doc>,
    createdOn: 1706400000000,
    ...overrides
  }
  return result
}

const makeNotificationSetting = (
  overrides?: Partial<HulyNotificationProviderSetting>
): HulyNotificationProviderSetting => {
  const result: HulyNotificationProviderSetting = {
    _id: "setting-1" as Ref<HulyNotificationProviderSetting>,
    _class: notification.class.NotificationProviderSetting,
    space: "person-space-1" as Ref<PersonSpace>,
    attachedTo: "provider-1" as Ref<NotificationProvider>,
    enabled: true,
    modifiedBy: "user-1" as Ref<Doc>,
    modifiedOn: 1706500000000,
    createdBy: "user-1" as Ref<Doc>,
    createdOn: 1706400000000,
    ...overrides
  }
  return result
}

interface MockConfig {
  notifications?: Array<HulyInboxNotification>
  contexts?: Array<HulyDocNotifyContext>
  settings?: Array<HulyNotificationProviderSetting>
  captureUpdateDoc?: { operations?: Record<string, unknown>; calls?: Array<Record<string, unknown>> }
  captureRemoveDoc?: { called?: boolean }
}

const createTestLayerWithMocks = (config: MockConfig) => {
  const notifications = config.notifications ?? []
  const contexts = config.contexts ?? []
  const settings = config.settings ?? []

  const findAllImpl: HulyClientOperations["findAll"] = ((_class: unknown, query: unknown, options: unknown) => {
    if (_class === notification.class.InboxNotification) {
      const q = query as Record<string, unknown>
      let result = [...notifications]
      if (q.archived !== undefined) {
        result = result.filter(n => n.archived === q.archived)
      }
      if (q.isViewed !== undefined) {
        result = result.filter(n => n.isViewed === q.isViewed)
      }
      const opts = options as { sort?: Record<string, number>; limit?: number } | undefined
      if (opts?.sort?.modifiedOn !== undefined) {
        const direction = opts.sort.modifiedOn
        result = result.sort((a, b) => direction * (a.modifiedOn - b.modifiedOn))
      }
      const findResult = toFindResult(result as Array<Doc>, result.length)
      return Effect.succeed(findResult)
    }
    if (_class === notification.class.DocNotifyContext) {
      const q = query as Record<string, unknown>
      let result = [...contexts]
      if (q.hidden !== undefined) {
        result = result.filter(c => c.hidden === q.hidden)
      }
      if (q.isPinned !== undefined) {
        result = result.filter(c => c.isPinned === q.isPinned)
      }
      const opts = options as { sort?: Record<string, number> } | undefined
      if (opts?.sort?.lastUpdateTimestamp !== undefined) {
        const direction = opts.sort.lastUpdateTimestamp
        result = result.sort((a, b) => direction * ((a.lastUpdateTimestamp ?? 0) - (b.lastUpdateTimestamp ?? 0)))
      }
      return Effect.succeed(toFindResult(result as Array<Doc>))
    }
    if (_class === notification.class.NotificationProviderSetting) {
      return Effect.succeed(toFindResult(settings as Array<Doc>))
    }
    return Effect.succeed(toFindResult([]))
  }) as HulyClientOperations["findAll"]

  const findOneImpl: HulyClientOperations["findOne"] = ((_class: unknown, query: unknown) => {
    if (_class === notification.class.InboxNotification) {
      const q = query as { _id?: Ref<HulyInboxNotification> }
      const found = notifications.find(n => n._id === q._id)
      return Effect.succeed(found as Doc | undefined)
    }
    if (_class === notification.class.DocNotifyContext) {
      const q = query as { _id?: Ref<HulyDocNotifyContext>; objectId?: Ref<Doc>; objectClass?: Ref<Class<Doc>> }
      const found = contexts.find(c =>
        (!q._id || c._id === q._id)
        && (!q.objectId || c.objectId === q.objectId)
        && (!q.objectClass || c.objectClass === q.objectClass)
      )
      return Effect.succeed(found as Doc | undefined)
    }
    if (_class === notification.class.NotificationProviderSetting) {
      const q = query as { attachedTo?: Ref<NotificationProvider> }
      const found = settings.find(s => s.attachedTo === q.attachedTo)
      return Effect.succeed(found as Doc | undefined)
    }
    return Effect.succeed(undefined)
  }) as HulyClientOperations["findOne"]

  const updateDocImpl: HulyClientOperations["updateDoc"] = (
    (_class: unknown, _space: unknown, _objectId: unknown, operations: unknown) => {
      if (config.captureUpdateDoc) {
        config.captureUpdateDoc.operations = operations as Record<string, unknown>
        if (config.captureUpdateDoc.calls) {
          config.captureUpdateDoc.calls.push(operations as Record<string, unknown>)
        }
      }
      return Effect.succeed({})
    }
  ) as HulyClientOperations["updateDoc"]

  const removeDocImpl: HulyClientOperations["removeDoc"] = (
    (_class: unknown, _space: unknown, _objectId: unknown) => {
      if (config.captureRemoveDoc) {
        config.captureRemoveDoc.called = true
      }
      return Effect.succeed({})
    }
  ) as HulyClientOperations["removeDoc"]

  return HulyClient.testLayer({
    findAll: findAllImpl,
    findOne: findOneImpl,
    updateDoc: updateDocImpl,
    removeDoc: removeDocImpl
  })
}

describe("listNotifications", () => {
  // test-revizorro: approved
  it.effect("returns notifications mapped to summaries", () =>
    Effect.gen(function*() {
      const notif = makeNotification({
        _id: "notif-1" as Ref<HulyInboxNotification>,
        isViewed: false,
        archived: false,
        objectId: "obj-1" as Ref<Doc>,
        objectClass: "tracker.class.Issue" as Ref<Class<Doc>>,
        title: "Test title" as HulyInboxNotification["title"],
        body: "Test body" as HulyInboxNotification["body"],
        createdOn: 1706500000000,
        modifiedOn: 1706500001000
      })

      const testLayer = createTestLayerWithMocks({ notifications: [notif] })

      const result = yield* listNotifications({}).pipe(Effect.provide(testLayer))

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe("notif-1")
      expect(result[0].isViewed).toBe(false)
      expect(result[0].archived).toBe(false)
      expect(result[0].objectId).toBe("obj-1")
      expect(result[0].objectClass).toBe("tracker.class.Issue")
      expect(result[0].createdOn).toBe(1706500000000)
      expect(result[0].modifiedOn).toBe(1706500001000)
    }))

  // test-revizorro: scheduled
  it.effect("excludes archived notifications by default", () =>
    Effect.gen(function*() {
      const active = makeNotification({
        _id: "notif-1" as Ref<HulyInboxNotification>,
        archived: false
      })
      const archived = makeNotification({
        _id: "notif-2" as Ref<HulyInboxNotification>,
        archived: true
      })

      const testLayer = createTestLayerWithMocks({ notifications: [active, archived] })

      const result = yield* listNotifications({}).pipe(Effect.provide(testLayer))

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe("notif-1")
    }))

  // test-revizorro: approved
  it.effect("includes archived when requested", () =>
    Effect.gen(function*() {
      const active = makeNotification({
        _id: "notif-1" as Ref<HulyInboxNotification>,
        archived: false
      })
      const archived = makeNotification({
        _id: "notif-2" as Ref<HulyInboxNotification>,
        archived: true
      })

      const testLayer = createTestLayerWithMocks({ notifications: [active, archived] })

      const result = yield* listNotifications({ includeArchived: true }).pipe(Effect.provide(testLayer))

      expect(result).toHaveLength(2)
    }))

  // test-revizorro: approved
  it.effect("filters unread only when requested", () =>
    Effect.gen(function*() {
      const unread = makeNotification({
        _id: "notif-1" as Ref<HulyInboxNotification>,
        isViewed: false,
        archived: false
      })
      const read = makeNotification({
        _id: "notif-2" as Ref<HulyInboxNotification>,
        isViewed: true,
        archived: false
      })

      const testLayer = createTestLayerWithMocks({ notifications: [unread, read] })

      const result = yield* listNotifications({ unreadOnly: true }).pipe(Effect.provide(testLayer))

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe("notif-1")
    }))

  // test-revizorro: approved
  it.effect("returns empty array when no notifications", () =>
    Effect.gen(function*() {
      const testLayer = createTestLayerWithMocks({ notifications: [] })

      const result = yield* listNotifications({}).pipe(Effect.provide(testLayer))

      expect(result).toHaveLength(0)
    }))
})

describe("getNotification", () => {
  // test-revizorro: approved
  it.effect("returns full notification details", () =>
    Effect.gen(function*() {
      const notif = makeNotification({
        _id: "notif-1" as Ref<HulyInboxNotification>,
        isViewed: true,
        archived: false,
        objectId: "obj-1" as Ref<Doc>,
        objectClass: "tracker.class.Issue" as Ref<Class<Doc>>,
        docNotifyContext: "ctx-1" as Ref<HulyDocNotifyContext>,
        title: "Full title" as HulyInboxNotification["title"],
        body: "Full body" as HulyInboxNotification["body"],
        data: "some data" as HulyInboxNotification["data"],
        createdOn: 1706500000000,
        modifiedOn: 1706500001000
      })

      const testLayer = createTestLayerWithMocks({ notifications: [notif] })

      const result = yield* getNotification({ notificationId: "notif-1" }).pipe(Effect.provide(testLayer))

      expect(result.id).toBe("notif-1")
      expect(result.isViewed).toBe(true)
      expect(result.archived).toBe(false)
      expect(result.objectId).toBe("obj-1")
      expect(result.objectClass).toBe("tracker.class.Issue")
      expect(result.docNotifyContextId).toBe("ctx-1")
      expect(result.title).toBe("Full title")
      expect(result.body).toBe("Full body")
      expect(result.data).toBe("some data")
    }))

  // test-revizorro: approved
  it.effect("returns NotificationNotFoundError when not found", () =>
    Effect.gen(function*() {
      const testLayer = createTestLayerWithMocks({ notifications: [] })

      const error = yield* Effect.flip(
        getNotification({ notificationId: "nonexistent" }).pipe(Effect.provide(testLayer))
      )

      expect(error._tag).toBe("NotificationNotFoundError")
      expect((error as NotificationNotFoundError).notificationId).toBe("nonexistent")
    }))
})

describe("markNotificationRead", () => {
  // test-revizorro: approved
  it.effect("marks unread notification as read", () =>
    Effect.gen(function*() {
      const notif = makeNotification({
        _id: "notif-1" as Ref<HulyInboxNotification>,
        isViewed: false
      })
      const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}

      const testLayer = createTestLayerWithMocks({ notifications: [notif], captureUpdateDoc })

      const result = yield* markNotificationRead({ notificationId: "notif-1" }).pipe(Effect.provide(testLayer))

      expect(result.id).toBe("notif-1")
      expect(result.marked).toBe(true)
      expect(captureUpdateDoc.operations?.isViewed).toBe(true)
    }))

  // test-revizorro: approved
  it.effect("skips update when already viewed", () =>
    Effect.gen(function*() {
      const notif = makeNotification({
        _id: "notif-1" as Ref<HulyInboxNotification>,
        isViewed: true
      })
      const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}

      const testLayer = createTestLayerWithMocks({ notifications: [notif], captureUpdateDoc })

      const result = yield* markNotificationRead({ notificationId: "notif-1" }).pipe(Effect.provide(testLayer))

      expect(result.id).toBe("notif-1")
      expect(result.marked).toBe(true)
      expect(captureUpdateDoc.operations).toBeUndefined()
    }))

  // test-revizorro: suspect | Missing notificationId assertion on error, unlike similar test at line 337
  it.effect("returns NotificationNotFoundError when not found", () =>
    Effect.gen(function*() {
      const testLayer = createTestLayerWithMocks({ notifications: [] })

      const error = yield* Effect.flip(
        markNotificationRead({ notificationId: "nonexistent" }).pipe(Effect.provide(testLayer))
      )

      expect(error._tag).toBe("NotificationNotFoundError")
    }))
})

describe("markAllNotificationsRead", () => {
  // test-revizorro: approved
  it.effect("marks all unread non-archived notifications as read", () =>
    Effect.gen(function*() {
      const notifs = [
        makeNotification({
          _id: "notif-1" as Ref<HulyInboxNotification>,
          isViewed: false,
          archived: false
        }),
        makeNotification({
          _id: "notif-2" as Ref<HulyInboxNotification>,
          isViewed: false,
          archived: false
        })
      ]
      const captureUpdateDoc: MockConfig["captureUpdateDoc"] = { calls: [] }

      const testLayer = createTestLayerWithMocks({ notifications: notifs, captureUpdateDoc })

      const result = yield* markAllNotificationsRead().pipe(Effect.provide(testLayer))

      expect(result.count).toBe(2)
      expect(captureUpdateDoc.calls).toHaveLength(2)
    }))

  // test-revizorro: approved
  it.effect("returns count 0 when no unread notifications", () =>
    Effect.gen(function*() {
      const notifs = [
        makeNotification({
          _id: "notif-1" as Ref<HulyInboxNotification>,
          isViewed: true,
          archived: false
        })
      ]

      const testLayer = createTestLayerWithMocks({ notifications: notifs })

      const result = yield* markAllNotificationsRead().pipe(Effect.provide(testLayer))

      expect(result.count).toBe(0)
    }))
})

describe("archiveNotification", () => {
  // test-revizorro: approved
  it.effect("archives a non-archived notification", () =>
    Effect.gen(function*() {
      const notif = makeNotification({
        _id: "notif-1" as Ref<HulyInboxNotification>,
        archived: false
      })
      const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}

      const testLayer = createTestLayerWithMocks({ notifications: [notif], captureUpdateDoc })

      const result = yield* archiveNotification({ notificationId: "notif-1" }).pipe(Effect.provide(testLayer))

      expect(result.id).toBe("notif-1")
      expect(result.archived).toBe(true)
      expect(captureUpdateDoc.operations?.archived).toBe(true)
    }))

  // test-revizorro: approved
  it.effect("skips update when already archived", () =>
    Effect.gen(function*() {
      const notif = makeNotification({
        _id: "notif-1" as Ref<HulyInboxNotification>,
        archived: true
      })
      const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}

      const testLayer = createTestLayerWithMocks({ notifications: [notif], captureUpdateDoc })

      const result = yield* archiveNotification({ notificationId: "notif-1" }).pipe(Effect.provide(testLayer))

      expect(result.id).toBe("notif-1")
      expect(result.archived).toBe(true)
      expect(captureUpdateDoc.operations).toBeUndefined()
    }))

  // test-revizorro: suspect | Missing notificationId assertion on error; should assert like getNotification test at line 337
  it.effect("returns NotificationNotFoundError when not found", () =>
    Effect.gen(function*() {
      const testLayer = createTestLayerWithMocks({ notifications: [] })

      const error = yield* Effect.flip(
        archiveNotification({ notificationId: "nonexistent" }).pipe(Effect.provide(testLayer))
      )

      expect(error._tag).toBe("NotificationNotFoundError")
    }))
})

describe("archiveAllNotifications", () => {
  // test-revizorro: approved
  it.effect("archives all non-archived notifications", () =>
    Effect.gen(function*() {
      const notifs = [
        makeNotification({
          _id: "notif-1" as Ref<HulyInboxNotification>,
          archived: false
        }),
        makeNotification({
          _id: "notif-2" as Ref<HulyInboxNotification>,
          archived: false
        })
      ]
      const captureUpdateDoc: MockConfig["captureUpdateDoc"] = { calls: [] }

      const testLayer = createTestLayerWithMocks({ notifications: notifs, captureUpdateDoc })

      const result = yield* archiveAllNotifications().pipe(Effect.provide(testLayer))

      expect(result.count).toBe(2)
      expect(captureUpdateDoc.calls).toHaveLength(2)
    }))

  // test-revizorro: approved
  it.effect("returns count 0 when all already archived", () =>
    Effect.gen(function*() {
      const notifs = [
        makeNotification({
          _id: "notif-1" as Ref<HulyInboxNotification>,
          archived: true
        })
      ]

      const testLayer = createTestLayerWithMocks({ notifications: notifs })

      const result = yield* archiveAllNotifications().pipe(Effect.provide(testLayer))

      expect(result.count).toBe(0)
    }))
})

describe("deleteNotification", () => {
  // test-revizorro: approved
  it.effect("deletes notification", () =>
    Effect.gen(function*() {
      const notif = makeNotification({ _id: "notif-1" as Ref<HulyInboxNotification> })
      const captureRemoveDoc: MockConfig["captureRemoveDoc"] = {}

      const testLayer = createTestLayerWithMocks({ notifications: [notif], captureRemoveDoc })

      const result = yield* deleteNotification({ notificationId: "notif-1" }).pipe(Effect.provide(testLayer))

      expect(result.id).toBe("notif-1")
      expect(result.deleted).toBe(true)
      expect(captureRemoveDoc.called).toBe(true)
    }))

  // test-revizorro: approved
  it.effect("returns NotificationNotFoundError when not found", () =>
    Effect.gen(function*() {
      const testLayer = createTestLayerWithMocks({ notifications: [] })

      const error = yield* Effect.flip(
        deleteNotification({ notificationId: "nonexistent" }).pipe(Effect.provide(testLayer))
      )

      expect(error._tag).toBe("NotificationNotFoundError")
    }))
})

describe("getNotificationContext", () => {
  // test-revizorro: approved
  it.effect("returns context by objectId and objectClass", () =>
    Effect.gen(function*() {
      const ctx = makeNotificationContext({
        _id: "ctx-1" as Ref<HulyDocNotifyContext>,
        objectId: "obj-1" as Ref<Doc>,
        objectClass: "tracker.class.Issue" as Ref<Class<Doc>>,
        isPinned: true,
        hidden: false,
        lastViewedTimestamp: 1706400000000,
        lastUpdateTimestamp: 1706500000000
      })

      const testLayer = createTestLayerWithMocks({ contexts: [ctx] })

      const result = yield* getNotificationContext({
        objectId: "obj-1",
        objectClass: "tracker.class.Issue"
      }).pipe(Effect.provide(testLayer))

      expect(result).not.toBeNull()
      expect(result!.id).toBe("ctx-1")
      expect(result!.objectId).toBe("obj-1")
      expect(result!.objectClass).toBe("tracker.class.Issue")
      expect(result!.isPinned).toBe(true)
      expect(result!.hidden).toBe(false)
      expect(result!.lastViewedTimestamp).toBe(1706400000000)
      expect(result!.lastUpdateTimestamp).toBe(1706500000000)
    }))

  // test-revizorro: approved
  it.effect("returns null when context not found", () =>
    Effect.gen(function*() {
      const testLayer = createTestLayerWithMocks({ contexts: [] })

      const result = yield* getNotificationContext({
        objectId: "nonexistent",
        objectClass: "tracker.class.Issue"
      }).pipe(Effect.provide(testLayer))

      expect(result).toBeNull()
    }))
})

describe("listNotificationContexts", () => {
  // test-revizorro: approved
  it.effect("returns non-hidden contexts", () =>
    Effect.gen(function*() {
      const visible = makeNotificationContext({
        _id: "ctx-1" as Ref<HulyDocNotifyContext>,
        hidden: false,
        lastUpdateTimestamp: 1706500000000
      })
      const hidden = makeNotificationContext({
        _id: "ctx-2" as Ref<HulyDocNotifyContext>,
        hidden: true,
        lastUpdateTimestamp: 1706500001000
      })

      const testLayer = createTestLayerWithMocks({ contexts: [visible, hidden] })

      const result = yield* listNotificationContexts({}).pipe(Effect.provide(testLayer))

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe("ctx-1")
    }))

  // test-revizorro: approved
  it.effect("filters pinned only when requested", () =>
    Effect.gen(function*() {
      const pinned = makeNotificationContext({
        _id: "ctx-1" as Ref<HulyDocNotifyContext>,
        isPinned: true,
        hidden: false
      })
      const unpinned = makeNotificationContext({
        _id: "ctx-2" as Ref<HulyDocNotifyContext>,
        isPinned: false,
        hidden: false
      })

      const testLayer = createTestLayerWithMocks({ contexts: [pinned, unpinned] })

      const result = yield* listNotificationContexts({ pinnedOnly: true }).pipe(Effect.provide(testLayer))

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe("ctx-1")
    }))

  // test-revizorro: approved
  it.effect("returns empty array when no contexts", () =>
    Effect.gen(function*() {
      const testLayer = createTestLayerWithMocks({ contexts: [] })

      const result = yield* listNotificationContexts({}).pipe(Effect.provide(testLayer))

      expect(result).toHaveLength(0)
    }))
})

describe("pinNotificationContext", () => {
  // test-revizorro: approved
  it.effect("pins an unpinned context", () =>
    Effect.gen(function*() {
      const ctx = makeNotificationContext({
        _id: "ctx-1" as Ref<HulyDocNotifyContext>,
        isPinned: false
      })
      const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}

      const testLayer = createTestLayerWithMocks({ contexts: [ctx], captureUpdateDoc })

      const result = yield* pinNotificationContext({
        contextId: "ctx-1",
        pinned: true
      }).pipe(Effect.provide(testLayer))

      expect(result.id).toBe("ctx-1")
      expect(result.isPinned).toBe(true)
      expect(captureUpdateDoc.operations?.isPinned).toBe(true)
    }))

  // test-revizorro: approved
  it.effect("unpins a pinned context", () =>
    Effect.gen(function*() {
      const ctx = makeNotificationContext({
        _id: "ctx-1" as Ref<HulyDocNotifyContext>,
        isPinned: true
      })
      const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}

      const testLayer = createTestLayerWithMocks({ contexts: [ctx], captureUpdateDoc })

      const result = yield* pinNotificationContext({
        contextId: "ctx-1",
        pinned: false
      }).pipe(Effect.provide(testLayer))

      expect(result.id).toBe("ctx-1")
      expect(result.isPinned).toBe(false)
      expect(captureUpdateDoc.operations?.isPinned).toBe(false)
    }))

  // test-revizorro: approved
  it.effect("skips update when pin state already matches", () =>
    Effect.gen(function*() {
      const ctx = makeNotificationContext({
        _id: "ctx-1" as Ref<HulyDocNotifyContext>,
        isPinned: true
      })
      const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}

      const testLayer = createTestLayerWithMocks({ contexts: [ctx], captureUpdateDoc })

      const result = yield* pinNotificationContext({
        contextId: "ctx-1",
        pinned: true
      }).pipe(Effect.provide(testLayer))

      expect(result.id).toBe("ctx-1")
      expect(result.isPinned).toBe(true)
      expect(captureUpdateDoc.operations).toBeUndefined()
    }))

  // test-revizorro: approved
  it.effect("returns NotificationContextNotFoundError when not found", () =>
    Effect.gen(function*() {
      const testLayer = createTestLayerWithMocks({ contexts: [] })

      const error = yield* Effect.flip(
        pinNotificationContext({
          contextId: "nonexistent",
          pinned: true
        }).pipe(Effect.provide(testLayer))
      )

      expect(error._tag).toBe("NotificationContextNotFoundError")
      expect((error as NotificationContextNotFoundError).contextId).toBe("nonexistent")
    }))
})

describe("listNotificationSettings", () => {
  // test-revizorro: approved
  it.effect("returns settings mapped to provider settings", () =>
    Effect.gen(function*() {
      const setting = makeNotificationSetting({
        _id: "setting-1" as Ref<HulyNotificationProviderSetting>,
        attachedTo: "provider-inbox" as Ref<NotificationProvider>,
        enabled: true
      })

      const testLayer = createTestLayerWithMocks({ settings: [setting] })

      const result = yield* listNotificationSettings({}).pipe(Effect.provide(testLayer))

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe("setting-1")
      expect(result[0].providerId).toBe("provider-inbox")
      expect(result[0].enabled).toBe(true)
    }))

  // test-revizorro: approved
  it.effect("returns empty array when no settings", () =>
    Effect.gen(function*() {
      const testLayer = createTestLayerWithMocks({ settings: [] })

      const result = yield* listNotificationSettings({}).pipe(Effect.provide(testLayer))

      expect(result).toHaveLength(0)
    }))
})

describe("updateNotificationProviderSetting", () => {
  // test-revizorro: approved
  it.effect("updates existing setting when value changes", () =>
    Effect.gen(function*() {
      const setting = makeNotificationSetting({
        _id: "setting-1" as Ref<HulyNotificationProviderSetting>,
        attachedTo: "provider-inbox" as Ref<NotificationProvider>,
        enabled: true
      })
      const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}

      const testLayer = createTestLayerWithMocks({ settings: [setting], captureUpdateDoc })

      const result = yield* updateNotificationProviderSetting({
        providerId: "provider-inbox",
        enabled: false
      }).pipe(Effect.provide(testLayer))

      expect(result.providerId).toBe("provider-inbox")
      expect(result.enabled).toBe(false)
      expect(result.updated).toBe(true)
      expect(captureUpdateDoc.operations?.enabled).toBe(false)
    }))

  // test-revizorro: approved
  it.effect("returns updated=false when existing setting value matches", () =>
    Effect.gen(function*() {
      const setting = makeNotificationSetting({
        _id: "setting-1" as Ref<HulyNotificationProviderSetting>,
        attachedTo: "provider-inbox" as Ref<NotificationProvider>,
        enabled: true
      })
      const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}

      const testLayer = createTestLayerWithMocks({ settings: [setting], captureUpdateDoc })

      const result = yield* updateNotificationProviderSetting({
        providerId: "provider-inbox",
        enabled: true
      }).pipe(Effect.provide(testLayer))

      expect(result.providerId).toBe("provider-inbox")
      expect(result.enabled).toBe(true)
      expect(result.updated).toBe(false)
      expect(captureUpdateDoc.operations).toBeUndefined()
    }))

  // test-revizorro: approved
  it.effect("returns updated=false when setting does not exist", () =>
    Effect.gen(function*() {
      const testLayer = createTestLayerWithMocks({ settings: [] })

      const result = yield* updateNotificationProviderSetting({
        providerId: "nonexistent-provider",
        enabled: true
      }).pipe(Effect.provide(testLayer))

      expect(result.providerId).toBe("nonexistent-provider")
      expect(result.enabled).toBe(true)
      expect(result.updated).toBe(false)
    }))
})

describe("getUnreadNotificationCount", () => {
  // test-revizorro: approved
  it.effect("returns unread count from total", () =>
    Effect.gen(function*() {
      const notifs = [
        makeNotification({
          _id: "notif-1" as Ref<HulyInboxNotification>,
          isViewed: false,
          archived: false
        }),
        makeNotification({
          _id: "notif-2" as Ref<HulyInboxNotification>,
          isViewed: false,
          archived: false
        })
      ]

      const testLayer = createTestLayerWithMocks({ notifications: notifs })

      const result = yield* getUnreadNotificationCount().pipe(Effect.provide(testLayer))

      expect(result.count).toBe(2)
    }))

  // test-revizorro: approved
  it.effect("returns 0 when no unread notifications", () =>
    Effect.gen(function*() {
      const notifs = [
        makeNotification({
          _id: "notif-1" as Ref<HulyInboxNotification>,
          isViewed: true,
          archived: false
        })
      ]

      const testLayer = createTestLayerWithMocks({ notifications: notifs })

      const result = yield* getUnreadNotificationCount().pipe(Effect.provide(testLayer))

      expect(result.count).toBe(0)
    }))
})
