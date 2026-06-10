/* eslint-disable no-restricted-syntax, @typescript-eslint/consistent-type-assertions, @typescript-eslint/no-unnecessary-type-assertion -- SDK phantom types in fixture builders have no runtime constructors */
import { describe, it } from "@effect/vitest"
import type {
  ActivityMessage as HulyActivityMessage,
  ActivityMessagesFilter as HulyActivityMessagesFilter,
  ActivityReference as HulyActivityReference
} from "@hcengineering/activity"
import type {
  Attachment as HulyAttachment,
  Drawing as HulyDrawing,
  SavedAttachments as HulySavedAttachment
} from "@hcengineering/attachment"
import type { ThreadMessage as HulyThreadMessage } from "@hcengineering/chunter"
import type {
  AccountUuid as HulyAccountUuid,
  Collaborator as HulyCollaborator,
  Doc,
  FindResult,
  PersonId,
  Ref,
  Space
} from "@hcengineering/core"
import { toFindResult } from "@hcengineering/core"
import type { Document as HulyDocument, Teamspace as HulyTeamspace } from "@hcengineering/document"
import type {
  DocNotifyContext as HulyDocNotifyContext,
  InboxNotification as HulyInboxNotification,
  NotificationProvider,
  NotificationProviderSetting as HulyNotificationProviderSetting,
  NotificationType as HulyNotificationType,
  NotificationTypeSetting as HulyNotificationTypeSetting
} from "@hcengineering/notification"
import type { TaskType } from "@hcengineering/task"
import type { Issue as HulyIssue, Project as HulyProject } from "@hcengineering/tracker"
import { IssuePriority, TimeReportDayType } from "@hcengineering/tracker"
import { Effect, Layer } from "effect"
import { expect } from "vitest"

import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import {
  activity,
  attachment,
  chunter,
  core,
  documentPlugin,
  notification,
  tracker
} from "../../../src/huly/huly-plugins.js"
import {
  addActivityReply,
  deleteActivityReply,
  getActivityMessage,
  listActivityFilters,
  listActivityReferences,
  listActivityReplies,
  pinActivityMessage,
  updateActivityReply
} from "../../../src/huly/operations/activity-messages.js"
import {
  createDrawing,
  deleteDrawing,
  getDrawing,
  listDrawings,
  listSavedAttachments,
  saveAttachment,
  unsaveAttachment,
  updateDrawing
} from "../../../src/huly/operations/attachment-extras.js"
import { addAttachment } from "../../../src/huly/operations/attachments-upload.js"
import {
  addObjectCollaborator,
  listObjectCollaborators,
  removeObjectCollaborator
} from "../../../src/huly/operations/collaborators.js"
import {
  archiveNotificationContext,
  listNotificationProviders,
  listNotificationTypes,
  subscribeToObjectNotifications,
  unarchiveNotificationContext,
  unsubscribeFromObjectNotifications,
  updateNotificationTypeSetting
} from "../../../src/huly/operations/notification-preferences.js"
import { HulyStorageClient, type HulyStorageOperations } from "../../../src/huly/storage.js"
import {
  accountUuid,
  activityMessageId,
  attachmentBrandId,
  attachmentFileName,
  base64FileData,
  docId,
  documentIdentifier,
  drawingBrandId,
  drawingContent,
  issueIdentifier,
  mimeType,
  notificationContextId,
  notificationProviderId,
  notificationTypeId,
  objectClassName,
  projectIdentifier,
  spaceBrandId,
  teamspaceIdentifier
} from "../../helpers/brands.js"

const PERSON_ID = "person-1" as PersonId
const ACCOUNT_UUID = "00000000-0000-4000-8000-000000000001" as HulyAccountUuid
const SPACE_ID = "space-1" as Ref<Space>

interface Capture {
  readonly addCollections: Array<{ readonly _class: unknown; readonly attributes: unknown; readonly id: unknown }>
  readonly createDocs: Array<{ readonly _class: unknown; readonly attributes: unknown; readonly id: unknown }>
  readonly updateDocs: Array<{ readonly _class: unknown; readonly objectId: unknown; readonly operations: unknown }>
  readonly removeDocs: Array<{ readonly _class: unknown; readonly objectId: unknown }>
  readonly removeCollections: Array<{ readonly _class: unknown; readonly objectId: unknown }>
  readonly uploads: Array<{ readonly filename: string; readonly contentType: string; readonly size: number }>
}

const makeCapture = (): Capture => ({
  addCollections: [],
  createDocs: [],
  updateDocs: [],
  removeDocs: [],
  removeCollections: [],
  uploads: []
})

const makeActivityMessage = (overrides?: Partial<HulyActivityMessage>): HulyActivityMessage => ({
  _id: "msg-1" as Ref<HulyActivityMessage>,
  _class: activity.class.ActivityMessage,
  space: SPACE_ID,
  attachedTo: "issue-1" as Ref<Doc>,
  attachedToClass: tracker.class.Issue,
  collection: "activity",
  modifiedBy: PERSON_ID,
  modifiedOn: 1706500000000,
  isPinned: false,
  replies: 0,
  reactions: 0,
  ...overrides
} as HulyActivityMessage)

const makeThreadMessage = (overrides?: Partial<HulyThreadMessage>): HulyThreadMessage => ({
  _id: "reply-1" as Ref<HulyThreadMessage>,
  _class: chunter.class.ThreadMessage,
  space: SPACE_ID,
  attachedTo: "msg-1" as Ref<HulyActivityMessage>,
  attachedToClass: activity.class.ActivityMessage,
  collection: "replies",
  message: "reply body",
  attachments: 0,
  objectId: "issue-1" as Ref<Doc>,
  objectClass: tracker.class.Issue,
  modifiedBy: PERSON_ID,
  modifiedOn: 1706500001000,
  createdBy: PERSON_ID,
  createdOn: 1706500001000,
  ...overrides
} as HulyThreadMessage)

const makeFilter = (overrides?: Partial<HulyActivityMessagesFilter>): HulyActivityMessagesFilter => ({
  _id: "filter-1" as Ref<HulyActivityMessagesFilter>,
  _class: activity.class.ActivityMessagesFilter,
  space: SPACE_ID,
  label: "Updates" as HulyActivityMessagesFilter["label"],
  position: 1,
  modifiedBy: PERSON_ID,
  modifiedOn: 0,
  createdBy: PERSON_ID,
  createdOn: 0,
  ...overrides
} as HulyActivityMessagesFilter)

const makeReference = (overrides?: Partial<HulyActivityReference>): HulyActivityReference => ({
  _id: "ref-1" as Ref<HulyActivityReference>,
  _class: activity.class.ActivityReference,
  space: SPACE_ID,
  attachedTo: "issue-1" as Ref<Doc>,
  attachedToClass: tracker.class.Issue,
  collection: "activity",
  srcDocId: "issue-1" as Ref<Doc>,
  srcDocClass: tracker.class.Issue,
  attachedDocId: "doc-1" as Ref<Doc>,
  attachedDocClass: documentPlugin.class.Document,
  message: "linked",
  modifiedBy: PERSON_ID,
  modifiedOn: 1706500002000,
  createdBy: PERSON_ID,
  createdOn: 1706500002000,
  ...overrides
} as HulyActivityReference)

const makeAttachment = (overrides?: Partial<HulyAttachment>): HulyAttachment => ({
  _id: "att-1" as Ref<HulyAttachment>,
  _class: attachment.class.Attachment,
  space: SPACE_ID,
  name: "file.txt",
  file: "blob-1" as HulyAttachment["file"],
  type: "text/plain",
  size: 12,
  lastModified: 0,
  pinned: false,
  collection: "attachments",
  attachedTo: "issue-1" as Ref<Doc>,
  attachedToClass: tracker.class.Issue,
  modifiedBy: PERSON_ID,
  modifiedOn: 0,
  createdBy: PERSON_ID,
  createdOn: 0,
  ...overrides
} as HulyAttachment)

const makeSavedAttachment = (overrides?: Partial<HulySavedAttachment>): HulySavedAttachment => ({
  _id: "saved-att-1" as Ref<HulySavedAttachment>,
  _class: attachment.class.SavedAttachments,
  space: SPACE_ID,
  attachedTo: "att-1" as Ref<HulyAttachment>,
  modifiedBy: PERSON_ID,
  modifiedOn: 0,
  createdBy: PERSON_ID,
  createdOn: 0,
  ...overrides
} as HulySavedAttachment)

const makeDrawing = (overrides?: Partial<HulyDrawing>): HulyDrawing => ({
  _id: "drawing-1" as Ref<HulyDrawing>,
  _class: attachment.class.Drawing,
  space: SPACE_ID,
  parent: "issue-1" as Ref<Doc>,
  parentClass: tracker.class.Issue,
  content: "shape-data",
  modifiedBy: PERSON_ID,
  modifiedOn: 1706500003000,
  createdBy: PERSON_ID,
  createdOn: 1706500003000,
  ...overrides
} as HulyDrawing)

const makeProject = (overrides?: Partial<HulyProject>): HulyProject => ({
  _id: "project-1" as Ref<HulyProject>,
  _class: tracker.class.Project,
  space: SPACE_ID,
  identifier: "TEST",
  name: "Test Project",
  sequence: 1,
  defaultIssueStatus: "status-1" as Ref<Doc>,
  defaultTimeReportDay: TimeReportDayType.CurrentWorkDay,
  modifiedBy: PERSON_ID,
  modifiedOn: 0,
  createdBy: PERSON_ID,
  createdOn: 0,
  ...overrides
} as HulyProject)

const makeIssue = (overrides?: Partial<HulyIssue>): HulyIssue => ({
  _id: "issue-1" as Ref<HulyIssue>,
  _class: tracker.class.Issue,
  space: "project-1" as Ref<HulyProject>,
  identifier: "TEST-1",
  title: "Test Issue",
  description: null,
  status: "status-1" as Ref<Doc>,
  priority: IssuePriority.Medium,
  assignee: null,
  kind: "task-type-1" as Ref<TaskType>,
  number: 1,
  dueDate: null,
  rank: "0|aaa",
  attachedTo: "no-parent" as Ref<HulyIssue>,
  attachedToClass: tracker.class.Issue,
  collection: "subIssues",
  component: null,
  subIssues: 0,
  parents: [],
  estimation: 0,
  remainingTime: 0,
  reportedTime: 0,
  reports: 0,
  childInfo: [],
  modifiedBy: PERSON_ID,
  modifiedOn: 0,
  createdBy: PERSON_ID,
  createdOn: 0,
  ...overrides
} as HulyIssue)

const makeTeamspace = (overrides?: Partial<HulyTeamspace>): HulyTeamspace => ({
  _id: "teamspace-1" as Ref<HulyTeamspace>,
  _class: documentPlugin.class.Teamspace,
  space: SPACE_ID,
  name: "Engineering",
  description: "",
  private: false,
  archived: false,
  icon: documentPlugin.icon.Teamspace,
  type: documentPlugin.spaceType.DefaultTeamspaceType,
  members: [],
  modifiedBy: PERSON_ID,
  modifiedOn: 0,
  createdBy: PERSON_ID,
  createdOn: 0,
  ...overrides
} as HulyTeamspace)

const makeDocument = (overrides?: Partial<HulyDocument>): HulyDocument => ({
  _id: "doc-1" as Ref<HulyDocument>,
  _class: documentPlugin.class.Document,
  space: "teamspace-1" as Ref<HulyTeamspace>,
  title: "Spec",
  content: null,
  parent: documentPlugin.ids.NoParent,
  rank: "0|aaa",
  modifiedBy: PERSON_ID,
  modifiedOn: 0,
  createdBy: PERSON_ID,
  createdOn: 0,
  ...overrides
} as HulyDocument)

const makeCollaborator = (overrides?: Partial<HulyCollaborator>): HulyCollaborator => ({
  _id: "collab-1" as Ref<HulyCollaborator>,
  _class: core.class.Collaborator,
  space: SPACE_ID,
  attachedTo: "issue-1" as Ref<Doc>,
  attachedToClass: tracker.class.Issue,
  collection: "collaborators",
  collaborator: ACCOUNT_UUID,
  modifiedBy: PERSON_ID,
  modifiedOn: 0,
  createdBy: PERSON_ID,
  createdOn: 0,
  ...overrides
} as HulyCollaborator)

const makeNotificationContext = (overrides?: Partial<HulyDocNotifyContext>): HulyDocNotifyContext => ({
  _id: "ctx-1" as Ref<HulyDocNotifyContext>,
  _class: notification.class.DocNotifyContext,
  space: SPACE_ID,
  user: ACCOUNT_UUID as HulyDocNotifyContext["user"],
  objectId: "issue-1" as Ref<Doc>,
  objectClass: tracker.class.Issue,
  objectSpace: SPACE_ID,
  isPinned: false,
  hidden: false,
  lastViewedTimestamp: 0,
  lastUpdateTimestamp: 1,
  modifiedBy: PERSON_ID,
  modifiedOn: 1,
  createdBy: PERSON_ID,
  createdOn: 0,
  ...overrides
} as HulyDocNotifyContext)

const makeInboxNotification = (overrides?: Partial<HulyInboxNotification>): HulyInboxNotification => ({
  _id: "notif-1" as Ref<HulyInboxNotification>,
  _class: notification.class.InboxNotification,
  space: SPACE_ID,
  user: ACCOUNT_UUID as HulyInboxNotification["user"],
  isViewed: false,
  archived: false,
  objectId: "issue-1" as Ref<Doc>,
  objectClass: tracker.class.Issue,
  docNotifyContext: "ctx-1" as Ref<HulyDocNotifyContext>,
  title: "Title" as HulyInboxNotification["title"],
  body: "Body" as HulyInboxNotification["body"],
  data: undefined,
  createdOn: 1,
  modifiedOn: 1,
  modifiedBy: PERSON_ID,
  createdBy: PERSON_ID,
  ...overrides
} as HulyInboxNotification)

const makeProvider = (overrides?: Partial<NotificationProvider>): NotificationProvider => ({
  _id: "provider-1" as Ref<NotificationProvider>,
  _class: notification.class.NotificationProvider,
  space: SPACE_ID,
  label: "Inbox" as NotificationProvider["label"],
  description: "Workspace inbox" as NotificationProvider["description"],
  defaultEnabled: true,
  canDisable: true,
  order: 1,
  modifiedBy: PERSON_ID,
  modifiedOn: 0,
  createdBy: PERSON_ID,
  createdOn: 0,
  ...overrides
} as NotificationProvider)

const makeType = (overrides?: Partial<HulyNotificationType>): HulyNotificationType => ({
  _id: "type-1" as Ref<HulyNotificationType>,
  _class: notification.class.NotificationType,
  space: SPACE_ID,
  label: "Assigned" as HulyNotificationType["label"],
  generated: false,
  hidden: false,
  defaultEnabled: true,
  group: "group-1" as Ref<Doc>,
  objectClass: tracker.class.Issue,
  modifiedBy: PERSON_ID,
  modifiedOn: 0,
  createdBy: PERSON_ID,
  createdOn: 0,
  ...overrides
} as HulyNotificationType)

const makeProviderSetting = (
  overrides?: Partial<HulyNotificationProviderSetting>
): HulyNotificationProviderSetting => ({
  _id: "provider-setting-1" as Ref<HulyNotificationProviderSetting>,
  _class: notification.class.NotificationProviderSetting,
  space: SPACE_ID,
  attachedTo: "provider-1" as Ref<NotificationProvider>,
  enabled: true,
  modifiedBy: PERSON_ID,
  modifiedOn: 0,
  createdBy: PERSON_ID,
  createdOn: 0,
  ...overrides
} as HulyNotificationProviderSetting)

const makeTypeSetting = (overrides?: Partial<HulyNotificationTypeSetting>): HulyNotificationTypeSetting => ({
  _id: "type-setting-1" as Ref<HulyNotificationTypeSetting>,
  _class: notification.class.NotificationTypeSetting,
  space: SPACE_ID,
  attachedTo: "provider-1" as Ref<NotificationProvider>,
  type: "type-1" as Ref<HulyNotificationType>,
  enabled: true,
  modifiedBy: PERSON_ID,
  modifiedOn: 0,
  createdBy: PERSON_ID,
  createdOn: 0,
  ...overrides
} as HulyNotificationTypeSetting)

interface FixtureConfig {
  readonly activityMessages?: ReadonlyArray<HulyActivityMessage>
  readonly threadMessages?: ReadonlyArray<HulyThreadMessage>
  readonly filters?: ReadonlyArray<HulyActivityMessagesFilter>
  readonly references?: ReadonlyArray<HulyActivityReference>
  readonly attachments?: ReadonlyArray<HulyAttachment>
  readonly savedAttachments?: ReadonlyArray<HulySavedAttachment>
  readonly drawings?: ReadonlyArray<HulyDrawing>
  readonly projects?: ReadonlyArray<HulyProject>
  readonly issues?: ReadonlyArray<HulyIssue>
  readonly teamspaces?: ReadonlyArray<HulyTeamspace>
  readonly documents?: ReadonlyArray<HulyDocument>
  readonly collaborators?: ReadonlyArray<HulyCollaborator>
  readonly contexts?: ReadonlyArray<HulyDocNotifyContext>
  readonly inboxNotifications?: ReadonlyArray<HulyInboxNotification>
  readonly providers?: ReadonlyArray<NotificationProvider>
  readonly providerSettings?: ReadonlyArray<HulyNotificationProviderSetting>
  readonly notificationTypes?: ReadonlyArray<HulyNotificationType>
  readonly typeSettings?: ReadonlyArray<HulyNotificationTypeSetting>
  readonly capture?: Capture
  readonly omitRemoveCollection?: boolean
}

const docs = (values: ReadonlyArray<Doc>): FindResult<Doc> => toFindResult([...values])

const matches = (doc: Doc, query: Record<string, unknown>): boolean =>
  Object.entries(query).every(([key, value]) => value === undefined || Reflect.get(doc, key) === value)

const byClass = (config: FixtureConfig, _class: unknown): ReadonlyArray<Doc> => {
  if (_class === activity.class.ActivityMessage) return config.activityMessages ?? []
  if (_class === chunter.class.ThreadMessage) return config.threadMessages ?? []
  if (_class === activity.class.ActivityMessagesFilter) return config.filters ?? []
  if (_class === activity.class.ActivityReference) return config.references ?? []
  if (_class === attachment.class.Attachment) return config.attachments ?? []
  if (_class === attachment.class.SavedAttachments) return config.savedAttachments ?? []
  if (_class === attachment.class.Drawing) return config.drawings ?? []
  if (_class === tracker.class.Project) return config.projects ?? []
  if (_class === tracker.class.Issue) return config.issues ?? []
  if (_class === documentPlugin.class.Teamspace) return config.teamspaces ?? []
  if (_class === documentPlugin.class.Document) return config.documents ?? []
  if (_class === core.class.Collaborator) return config.collaborators ?? []
  if (_class === notification.class.DocNotifyContext) return config.contexts ?? []
  if (_class === notification.class.InboxNotification) return config.inboxNotifications ?? []
  if (_class === notification.class.NotificationProvider) return config.providers ?? []
  if (_class === notification.class.NotificationProviderSetting) return config.providerSettings ?? []
  if (_class === notification.class.NotificationType) return config.notificationTypes ?? []
  if (_class === notification.class.NotificationTypeSetting) return config.typeSettings ?? []
  return []
}

const testLayer = (config: FixtureConfig = {}) => {
  const capture = config.capture ?? makeCapture()

  const findAll: HulyClientOperations["findAll"] = ((_class: unknown, query: unknown) => {
    const q = query as Record<string, unknown>
    const orBranches = q.$or
    if (Array.isArray(orBranches)) {
      const result = byClass(config, _class).filter((doc) =>
        orBranches.some((branch: unknown) => matches(doc, branch as Record<string, unknown>))
      )
      return Effect.succeed(docs(result))
    }
    return Effect.succeed(docs(byClass(config, _class).filter((doc) => matches(doc, q))))
  }) as HulyClientOperations["findAll"]

  const findOne: HulyClientOperations["findOne"] = ((_class: unknown, query: unknown) => {
    const q = query as Record<string, unknown>
    return Effect.succeed(byClass(config, _class).find((doc) => matches(doc, q)))
  }) as HulyClientOperations["findOne"]

  const addCollection: HulyClientOperations["addCollection"] = ((
    _class: unknown,
    _space: unknown,
    _attachedTo: unknown,
    _attachedToClass: unknown,
    _collection: unknown,
    attributes: unknown,
    id: unknown
  ) => {
    capture.addCollections.push({ _class, attributes, id })
    return Effect.succeed(id as Ref<Doc>)
  }) as HulyClientOperations["addCollection"]

  const createDoc: HulyClientOperations["createDoc"] =
    ((_class: unknown, _space: unknown, attributes: unknown, id: unknown) => {
      capture.createDocs.push({ _class, attributes, id })
      return Effect.succeed(id as Ref<Doc>)
    }) as HulyClientOperations["createDoc"]

  const updateDoc: HulyClientOperations["updateDoc"] =
    ((_class: unknown, _space: unknown, objectId: unknown, operations: unknown) => {
      capture.updateDocs.push({ _class, objectId, operations })
      return Effect.succeed({} as never)
    }) as HulyClientOperations["updateDoc"]

  const removeDoc: HulyClientOperations["removeDoc"] = ((_class: unknown, _space: unknown, objectId: unknown) => {
    capture.removeDocs.push({ _class, objectId })
    return Effect.succeed({} as never)
  }) as HulyClientOperations["removeDoc"]

  const removeCollection: NonNullable<HulyClientOperations["removeCollection"]> =
    ((_class: unknown, _space: unknown, objectId: unknown) => {
      capture.removeCollections.push({ _class, objectId })
      return Effect.succeed("parent-1" as Ref<Doc>)
    }) as NonNullable<HulyClientOperations["removeCollection"]>

  const uploadFile: HulyStorageOperations["uploadFile"] = ((filename: string, buffer: Buffer, contentType: string) => {
    capture.uploads.push({ filename, contentType, size: buffer.length })
    return Effect.succeed({
      blobId: "blob-uploaded" as HulyAttachment["file"],
      contentType,
      size: buffer.length,
      url: "https://files.example/blob-uploaded"
    })
  }) as HulyStorageOperations["uploadFile"]

  const baseClientOps: Partial<HulyClientOperations> = {
    getAccountUuid: () => ACCOUNT_UUID,
    findAll,
    findOne,
    addCollection,
    createDoc,
    updateDoc,
    removeDoc
  }
  const clientOps: Partial<HulyClientOperations> = config.omitRemoveCollection
    ? baseClientOps
    : { ...baseClientOps, removeCollection }

  return Layer.merge(
    HulyClient.testLayer(clientOps),
    HulyStorageClient.testLayer({ uploadFile })
  )
}

describe("activity message operations", () => {
  it.effect("gets, pins, lists filters/references/replies, and mutates replies", () =>
    Effect.gen(function*() {
      const capture = makeCapture()
      const layer = testLayer({
        capture,
        activityMessages: [makeActivityMessage()],
        threadMessages: [makeThreadMessage()],
        filters: [makeFilter()],
        references: [makeReference()]
      })

      const message = yield* getActivityMessage({ messageId: activityMessageId("msg-1") }).pipe(Effect.provide(layer))
      expect(message.messageClass).toBe("activity:class:ActivityMessage")

      const pinResult = yield* pinActivityMessage({
        messageId: activityMessageId("msg-1"),
        pinned: true
      }).pipe(Effect.provide(layer))
      expect(pinResult.pinned).toBe(true)
      expect(capture.updateDocs[0].operations).toEqual({ isPinned: true })

      const filters = yield* listActivityFilters({}).pipe(Effect.provide(layer))
      expect(filters[0]).toEqual({ id: "filter-1", label: "Updates", position: 1 })

      const references = yield* listActivityReferences({
        objectId: docId("issue-1"),
        objectClass: objectClassName("tracker:class:Issue"),
        direction: "both"
      }).pipe(Effect.provide(layer))
      expect(references[0].message).toBe("linked")

      const replies = yield* listActivityReplies({ messageId: activityMessageId("msg-1") }).pipe(Effect.provide(layer))
      expect(replies[0].id).toBe("reply-1")

      const added = yield* addActivityReply({
        messageId: activityMessageId("msg-1"),
        body: "hello"
      }).pipe(Effect.provide(layer))
      expect(added.messageId).toBe("msg-1")
      expect(capture.addCollections[0]._class).toBe(chunter.class.ThreadMessage)

      const updated = yield* updateActivityReply({
        replyId: activityMessageId("reply-1"),
        body: "edited"
      }).pipe(Effect.provide(layer))
      expect(updated.updated).toBe(true)
      expect(capture.updateDocs[1]._class).toBe(chunter.class.ThreadMessage)

      const deleted = yield* deleteActivityReply({ replyId: activityMessageId("reply-1") }).pipe(Effect.provide(layer))
      expect(deleted.deleted).toBe(true)
      expect(capture.removeDocs[0]._class).toBe(chunter.class.ThreadMessage)
    }))

  it.effect("returns idempotently when pin state already matches and reports missing replies", () =>
    Effect.gen(function*() {
      const layer = testLayer({ activityMessages: [makeActivityMessage({ isPinned: true })] })

      const pinned = yield* pinActivityMessage({
        messageId: activityMessageId("msg-1"),
        pinned: true
      }).pipe(Effect.provide(layer))
      expect(pinned.pinned).toBe(true)

      const updateError = yield* Effect.flip(
        updateActivityReply({
          replyId: activityMessageId("missing-reply"),
          body: "missing"
        }).pipe(Effect.provide(layer))
      )
      expect(updateError._tag).toBe("ActivityMessageNotFoundError")

      const deleteError = yield* Effect.flip(
        deleteActivityReply({ replyId: activityMessageId("missing-reply") }).pipe(Effect.provide(layer))
      )
      expect(deleteError._tag).toBe("ActivityMessageNotFoundError")
    }))

  it.effect("covers activity reference direction and optional field branches", () =>
    Effect.gen(function*() {
      const layer = testLayer({
        activityMessages: [makeActivityMessage({ isPinned: undefined as never })],
        filters: [makeFilter({ label: { key: "activity.filter" } as never })],
        references: [
          makeReference({ attachedDocId: undefined as never, attachedDocClass: undefined as never })
        ]
      })

      const alreadyUnpinned = yield* pinActivityMessage({
        messageId: activityMessageId("msg-1"),
        pinned: false
      }).pipe(Effect.provide(layer))
      expect(alreadyUnpinned.pinned).toBe(false)

      const filters = yield* listActivityFilters({}).pipe(Effect.provide(layer))
      expect(filters[0].label).toBeUndefined()

      const fromRefs = yield* listActivityReferences({
        objectId: docId("issue-1"),
        objectClass: objectClassName("tracker:class:Issue"),
        direction: "from"
      }).pipe(Effect.provide(layer))
      expect(fromRefs[0].attachedDocId).toBeUndefined()

      const toRefs = yield* listActivityReferences({
        objectId: docId("doc-1"),
        objectClass: objectClassName("document:class:Document"),
        direction: "to"
      }).pipe(Effect.provide(testLayer({ references: [makeReference()] })))
      expect(toRefs[0].attachedDocId).toBe("doc-1")

      const missingMessage = yield* Effect.flip(
        getActivityMessage({ messageId: activityMessageId("missing-message") }).pipe(Effect.provide(layer))
      )
      expect(missingMessage._tag).toBe("ActivityMessageNotFoundError")
    }))

  it.effect("maps update and reference message optional fields", () =>
    Effect.gen(function*() {
      const updateMessage = makeActivityMessage({
        _id: "update-msg" as Ref<HulyActivityMessage>,
        _class: activity.class.DocUpdateMessage,
        action: "create",
        message: "created issue",
        editedOn: null
      } as unknown as Partial<HulyActivityMessage>)
      const referenceMessage = makeActivityMessage({
        _id: "reference-msg" as Ref<HulyActivityMessage>,
        _class: activity.class.ActivityReference,
        message: "linked doc",
        srcDocId: "issue-1",
        srcDocClass: tracker.class.Issue,
        attachedDocId: "doc-1",
        attachedDocClass: documentPlugin.class.Document
      } as unknown as Partial<HulyActivityMessage>)
      const layer = testLayer({ activityMessages: [updateMessage, referenceMessage] })

      const update = yield* getActivityMessage({ messageId: activityMessageId("update-msg") }).pipe(
        Effect.provide(layer)
      )
      expect(update.action).toBe("create")
      expect(update.message).toBe("created issue")
      expect(update.editedOn).toBe(null)

      const reference = yield* getActivityMessage({ messageId: activityMessageId("reference-msg") }).pipe(
        Effect.provide(layer)
      )
      expect(reference.srcDocId).toBe("issue-1")
      expect(reference.attachedDocId).toBe("doc-1")
    }))
})

describe("attachment media, saved attachment, and drawing operations", () => {
  it.effect("selects attachment subclasses when uploading", () =>
    Effect.gen(function*() {
      const capture = makeCapture()
      const layer = testLayer({ capture })
      const baseParams = {
        objectId: docId("issue-1"),
        objectClass: objectClassName("tracker:class:Issue"),
        space: spaceBrandId("space-1"),
        filename: attachmentFileName("file.txt"),
        contentType: mimeType("text/plain"),
        data: base64FileData(Buffer.from("hello").toString("base64"))
      }

      yield* addAttachment(baseParams).pipe(Effect.provide(layer))
      yield* addAttachment({ ...baseParams, kind: "embedding" }).pipe(Effect.provide(layer))
      yield* addAttachment({ ...baseParams, kind: "photo" }).pipe(Effect.provide(layer))

      expect(capture.addCollections.map(call => call._class)).toEqual([
        attachment.class.Attachment,
        attachment.class.Embedding,
        attachment.class.Photo
      ])
      expect(capture.uploads).toHaveLength(3)
    }))

  it.effect("saves, unsaves, lists saved attachments, and manages drawings", () =>
    Effect.gen(function*() {
      const capture = makeCapture()
      const layer = testLayer({
        capture,
        attachments: [makeAttachment()],
        savedAttachments: [makeSavedAttachment()],
        drawings: [makeDrawing()]
      })

      const existingSave = yield* saveAttachment({ attachmentId: attachmentBrandId("att-1") }).pipe(
        Effect.provide(layer)
      )
      expect(existingSave.saved).toBe(false)

      const saved = yield* listSavedAttachments({}).pipe(Effect.provide(layer))
      expect(saved[0]).toEqual({ id: "saved-att-1", attachmentId: "att-1" })

      const unsaved = yield* unsaveAttachment({ attachmentId: attachmentBrandId("att-1") }).pipe(Effect.provide(layer))
      expect(unsaved.removed).toBe(true)
      expect(capture.removeDocs[0]._class).toBe(attachment.class.SavedAttachments)

      const drawings = yield* listDrawings({
        parentId: docId("issue-1"),
        parentClass: objectClassName("tracker:class:Issue")
      }).pipe(Effect.provide(layer))
      expect(drawings[0].content).toBe("shape-data")

      const drawing = yield* getDrawing({ drawingId: drawingBrandId("drawing-1") }).pipe(Effect.provide(layer))
      expect(drawing.parentId).toBe("issue-1")

      const optionalDrawing = yield* getDrawing({ drawingId: drawingBrandId("drawing-optional") }).pipe(
        Effect.provide(testLayer({
          drawings: [
            makeDrawing({
              _id: "drawing-optional" as Ref<HulyDrawing>,

              content: undefined as unknown as string,

              modifiedOn: undefined as unknown as number,

              createdOn: undefined as unknown as number
            })
          ]
        }))
      )
      expect(optionalDrawing.content).toBeUndefined()
      expect(optionalDrawing.modifiedOn).toBeUndefined()
      expect(optionalDrawing.createdOn).toBeUndefined()

      const created = yield* createDrawing({
        parentId: docId("issue-1"),
        parentClass: objectClassName("tracker:class:Issue"),
        space: spaceBrandId("space-1"),
        content: drawingContent("new")
      }).pipe(Effect.provide(layer))
      expect(created.drawingId).toBeTruthy()
      expect(capture.createDocs[0]._class).toBe(attachment.class.Drawing)

      const updated = yield* updateDrawing({
        drawingId: drawingBrandId("drawing-1"),
        content: null
      }).pipe(Effect.provide(layer))
      expect(updated.updated).toBe(true)
      expect(capture.updateDocs[0].operations).toEqual({ content: "" })

      const deleted = yield* deleteDrawing({ drawingId: drawingBrandId("drawing-1") }).pipe(Effect.provide(layer))
      expect(deleted.deleted).toBe(true)
      expect(capture.removeDocs[1]._class).toBe(attachment.class.Drawing)
    }))

  it.effect("creates saved attachments/drawings and reports missing saved attachments or drawings", () =>
    Effect.gen(function*() {
      const capture = makeCapture()
      const layer = testLayer({ capture, attachments: [makeAttachment()] })

      const saved = yield* saveAttachment({ attachmentId: attachmentBrandId("att-1") }).pipe(Effect.provide(layer))
      expect(saved.saved).toBe(true)
      expect(capture.createDocs[0]._class).toBe(attachment.class.SavedAttachments)

      const unsaveError = yield* Effect.flip(
        unsaveAttachment({ attachmentId: attachmentBrandId("missing-att") }).pipe(Effect.provide(layer))
      )
      expect(unsaveError._tag).toBe("SavedAttachmentNotFoundError")
      expect(unsaveError.message).toContain("missing-att")

      const getError = yield* Effect.flip(
        getDrawing({ drawingId: drawingBrandId("missing-drawing") }).pipe(Effect.provide(layer))
      )
      expect(getError._tag).toBe("DrawingNotFoundError")
      expect(getError.message).toContain("missing-drawing")

      const created = yield* createDrawing({
        parentId: docId("issue-1"),
        parentClass: objectClassName("tracker:class:Issue"),
        space: spaceBrandId("space-1")
      }).pipe(Effect.provide(layer))
      expect(created.drawingId).toBeTruthy()
      expect(capture.createDocs[1].attributes).toEqual({
        parent: "issue-1",
        parentClass: "tracker:class:Issue"
      })

      const updateError = yield* Effect.flip(
        updateDrawing({ drawingId: drawingBrandId("missing-drawing"), content: drawingContent("missing") }).pipe(
          Effect.provide(layer)
        )
      )
      expect(updateError._tag).toBe("DrawingNotFoundError")

      const deleteError = yield* Effect.flip(
        deleteDrawing({ drawingId: drawingBrandId("missing-drawing") }).pipe(Effect.provide(layer))
      )
      expect(deleteError._tag).toBe("DrawingNotFoundError")
    }))

  it.effect("reports missing attachments and updates drawings with non-null content", () =>
    Effect.gen(function*() {
      const capture = makeCapture()
      const layer = testLayer({ capture, drawings: [makeDrawing()] })

      const saveError = yield* Effect.flip(
        saveAttachment({ attachmentId: attachmentBrandId("missing-att") }).pipe(Effect.provide(layer))
      )
      expect(saveError._tag).toBe("AttachmentNotFoundError")

      const updated = yield* updateDrawing({
        drawingId: drawingBrandId("drawing-1"),
        content: drawingContent("updated-shape")
      }).pipe(Effect.provide(layer))
      expect(updated.updated).toBe(true)
      expect(capture.updateDocs[0].operations).toEqual({ content: drawingContent("updated-shape") })
    }))
})

describe("object collaborator operations", () => {
  it.effect("lists issue/document collaborators and adds/removes raw target collaborators", () =>
    Effect.gen(function*() {
      const capture = makeCapture()
      const layer = testLayer({
        capture,
        projects: [makeProject()],
        issues: [makeIssue()],
        teamspaces: [makeTeamspace()],
        documents: [makeDocument()],
        collaborators: [
          makeCollaborator(),
          makeCollaborator({
            _id: "collab-doc-1" as Ref<HulyCollaborator>,
            attachedTo: "doc-1" as Ref<Doc>,
            attachedToClass: documentPlugin.class.Document
          })
        ]
      })

      const issueCollaborators = yield* listObjectCollaborators({
        project: projectIdentifier("TEST"),
        issueIdentifier: issueIdentifier("TEST-1")
      }).pipe(Effect.provide(layer))
      expect(issueCollaborators[0].accountUuid).toBe(ACCOUNT_UUID)

      const documentCollaborators = yield* listObjectCollaborators({
        teamspace: teamspaceIdentifier("Engineering"),
        document: documentIdentifier("Spec")
      }).pipe(Effect.provide(layer))
      expect(documentCollaborators[0].objectId).toBe("doc-1")

      const added = yield* addObjectCollaborator({
        objectId: docId("issue-1"),
        objectClass: objectClassName("tracker:class:Issue"),
        member: accountUuid("00000000-0000-4000-8000-000000000009")
      }).pipe(Effect.provide(testLayer({ capture })))
      expect(added.added).toBe(true)
      expect(capture.addCollections[0]._class).toBe(core.class.Collaborator)

      const removed = yield* removeObjectCollaborator({
        objectId: docId("issue-1"),
        objectClass: objectClassName("tracker:class:Issue"),
        member: accountUuid(ACCOUNT_UUID)
      }).pipe(Effect.provide(layer))
      expect(removed.removed).toBe(true)
      expect(capture.removeCollections[0]._class).toBe(core.class.Collaborator)
    }))

  it.effect("returns idempotent collaborator results and reports missing removeCollection support", () =>
    Effect.gen(function*() {
      const existingLayer = testLayer({ collaborators: [makeCollaborator()] })

      const alreadyAdded = yield* addObjectCollaborator({
        objectId: docId("issue-1"),
        objectClass: objectClassName("tracker:class:Issue"),
        member: accountUuid(ACCOUNT_UUID)
      }).pipe(Effect.provide(existingLayer))
      expect(alreadyAdded.added).toBe(false)

      const missingRemove = yield* removeObjectCollaborator({
        objectId: docId("issue-1"),
        objectClass: objectClassName("tracker:class:Issue"),
        member: accountUuid("00000000-0000-4000-8000-000000000009")
      }).pipe(Effect.provide(testLayer()))
      expect(missingRemove.removed).toBe(false)

      const removeError = yield* Effect.flip(
        removeObjectCollaborator({
          objectId: docId("issue-1"),
          objectClass: objectClassName("tracker:class:Issue"),
          member: accountUuid(ACCOUNT_UUID)
        }).pipe(Effect.provide(testLayer({ collaborators: [makeCollaborator()], omitRemoveCollection: true })))
      )
      expect(removeError._tag).toBe("HulyError")
    }))

  it.effect("dies on invalid collaborator target shapes that bypass schema parsing", () =>
    Effect.gen(function*() {
      const exit = yield* Effect.exit(listObjectCollaborators({} as never).pipe(Effect.provide(testLayer())))
      expect(exit._tag).toBe("Failure")
    }))
})

describe("notification preference operations", () => {
  it.effect("lists providers/types, updates type settings, archives contexts, and manages subscriptions", () =>
    Effect.gen(function*() {
      const capture = makeCapture()
      const layer = testLayer({
        capture,
        providers: [makeProvider()],
        notificationTypes: [makeType()],
        providerSettings: [makeProviderSetting()],
        typeSettings: [makeTypeSetting()],
        contexts: [makeNotificationContext()],
        inboxNotifications: [
          makeInboxNotification(),
          makeInboxNotification({ _id: "notif-2" as Ref<HulyInboxNotification> })
        ],
        collaborators: [makeCollaborator()]
      })

      const providers = yield* listNotificationProviders({}).pipe(Effect.provide(layer))
      expect(providers[0].label).toBe("Inbox")

      const types = yield* listNotificationTypes({
        objectClass: objectClassName("tracker:class:Issue")
      }).pipe(Effect.provide(layer))
      expect(types[0].group).toBe("group-1")

      const typeSetting = yield* updateNotificationTypeSetting({
        providerId: notificationProviderId("provider-1"),
        typeId: notificationTypeId("type-1"),
        enabled: false
      }).pipe(Effect.provide(layer))
      expect(typeSetting.updated).toBe(true)
      expect(typeSetting.created).toBe(false)

      const archived = yield* archiveNotificationContext({
        contextId: notificationContextId("ctx-1")
      }).pipe(Effect.provide(layer))
      expect(archived.count).toBe(2)

      const unarchived = yield* unarchiveNotificationContext({
        contextId: notificationContextId("ctx-1")
      }).pipe(Effect.provide(testLayer({
        capture,
        contexts: [makeNotificationContext()],
        inboxNotifications: [makeInboxNotification({ archived: true })]
      })))
      expect(unarchived.archived).toBe(false)

      const subscribed = yield* subscribeToObjectNotifications({
        objectId: docId("issue-1"),
        objectClass: objectClassName("tracker:class:Issue"),
        space: spaceBrandId("space-1")
      }).pipe(Effect.provide(testLayer({ capture })))
      expect(subscribed.changed).toBe(true)

      const unsubscribed = yield* unsubscribeFromObjectNotifications({
        objectId: docId("issue-1"),
        objectClass: objectClassName("tracker:class:Issue"),
        space: spaceBrandId("space-1")
      }).pipe(Effect.provide(layer))
      expect(unsubscribed.changed).toBe(true)
      expect(capture.removeCollections.at(-1)?._class).toBe(core.class.Collaborator)
    }))

  it.effect("creates type settings, returns idempotent subscriptions, and reports non-configurable providers", () =>
    Effect.gen(function*() {
      const capture = makeCapture()
      const createLayer = testLayer({
        capture,
        notificationTypes: [makeType()],
        providerSettings: [makeProviderSetting()]
      })

      const created = yield* updateNotificationTypeSetting({
        providerId: notificationProviderId("provider-1"),
        typeId: notificationTypeId("type-1"),
        enabled: false
      }).pipe(Effect.provide(createLayer))
      expect(created.created).toBe(true)
      expect(capture.createDocs[0]._class).toBe(notification.class.NotificationTypeSetting)

      const missingProvider = yield* Effect.flip(
        updateNotificationTypeSetting({
          providerId: notificationProviderId("provider-1"),
          typeId: notificationTypeId("type-1"),
          enabled: true
        }).pipe(Effect.provide(testLayer({ notificationTypes: [makeType()] })))
      )
      expect(missingProvider._tag).toBe("NotificationProviderNotConfigurableError")
      expect(missingProvider.message).toContain("provider-1")

      const missingType = yield* Effect.flip(
        updateNotificationTypeSetting({
          providerId: notificationProviderId("provider-1"),
          typeId: notificationTypeId("missing-type"),
          enabled: true
        }).pipe(Effect.provide(testLayer()))
      )
      expect(missingType._tag).toBe("NotificationTypeNotFoundError")
      expect(missingType.message).toContain("missing-type")

      const subscriptionLayer = testLayer({ collaborators: [makeCollaborator()] })
      const alreadySubscribed = yield* subscribeToObjectNotifications({
        objectId: docId("issue-1"),
        objectClass: objectClassName("tracker:class:Issue"),
        space: spaceBrandId("space-1")
      }).pipe(Effect.provide(subscriptionLayer))
      expect(alreadySubscribed.changed).toBe(false)

      const alreadyUnsubscribed = yield* unsubscribeFromObjectNotifications({
        objectId: docId("issue-1"),
        objectClass: objectClassName("tracker:class:Issue"),
        space: spaceBrandId("space-1")
      }).pipe(Effect.provide(testLayer()))
      expect(alreadyUnsubscribed.changed).toBe(false)

      const unsubscribeError = yield* Effect.flip(
        unsubscribeFromObjectNotifications({
          objectId: docId("issue-1"),
          objectClass: objectClassName("tracker:class:Issue"),
          space: spaceBrandId("space-1")
        }).pipe(Effect.provide(testLayer({ collaborators: [makeCollaborator()], omitRemoveCollection: true })))
      )
      expect(unsubscribeError._tag).toBe("HulyError")
    }))

  it.effect("covers notification type no-op and target resolution branches", () =>
    Effect.gen(function*() {
      const noOp = yield* updateNotificationTypeSetting({
        providerId: notificationProviderId("provider-1"),
        typeId: notificationTypeId("type-1"),
        enabled: true
      }).pipe(Effect.provide(testLayer({
        notificationTypes: [makeType()],
        typeSettings: [makeTypeSetting()]
      })))
      expect(noOp.updated).toBe(false)

      const allTypes = yield* listNotificationTypes({ includeHidden: true }).pipe(Effect.provide(testLayer({
        notificationTypes: [makeType({ hidden: true })]
      })))
      expect(allTypes[0].hidden).toBe(true)

      const resolvedTarget = yield* subscribeToObjectNotifications({
        objectId: docId("issue-1"),
        objectClass: objectClassName("tracker:class:Issue")
      }).pipe(Effect.provide(testLayer({ issues: [makeIssue()] })))
      expect(resolvedTarget.changed).toBe(true)

      const missingTarget = yield* Effect.flip(
        subscribeToObjectNotifications({
          objectId: docId("missing-issue"),
          objectClass: objectClassName("tracker:class:Issue")
        }).pipe(Effect.provide(testLayer()))
      )
      expect(missingTarget._tag).toBe("HulyError")
    }))

  it.effect("maps optional notification provider and type fields", () =>
    Effect.gen(function*() {
      const layer = testLayer({
        providers: [
          makeProvider({
            _id: "provider-2" as Ref<NotificationProvider>,
            label: { key: "provider.label" } as never,
            description: "" as never,
            depends: "provider-1" as Ref<NotificationProvider>
          })
        ],
        notificationTypes: [
          makeType({
            label: { key: "type.label" } as never,
            attachedToClass: documentPlugin.class.Document,
            onlyOwn: true,
            field: "assignee",
            spaceSubscribe: true,
            allowedForAuthor: true
          })
        ]
      })

      const providers = yield* listNotificationProviders({ limit: 1 }).pipe(Effect.provide(layer))
      expect(providers[0].label).toBeUndefined()
      expect(providers[0].description).toBeUndefined()
      expect(providers[0].depends).toBe("provider-1")

      const types = yield* listNotificationTypes({ limit: 1 }).pipe(Effect.provide(layer))
      expect(types[0].label).toBeUndefined()
      expect(types[0].attachedToClass).toBe("document:class:Document")
      expect(types[0].onlyOwn).toBe(true)
    }))
})
