import { describe, it } from "@effect/vitest"
import type {
  ActivityMessage as HulyActivityMessage,
  Reaction as HulyReaction,
  SavedMessage as HulySavedMessage,
  UserMentionInfo
} from "@hcengineering/activity"
import type { Channel as HulyChannel } from "@hcengineering/chunter"
import type { Person } from "@hcengineering/contact"
import { type Class, type Doc, type PersonId, type Ref, type Space, toFindResult } from "@hcengineering/core"
import type { Document as HulyDocument, Teamspace as HulyTeamspace } from "@hcengineering/document"
import type { TaskType } from "@hcengineering/task"
import type { Issue as HulyIssue, Project as HulyProject } from "@hcengineering/tracker"
import { IssuePriority, TimeReportDayType } from "@hcengineering/tracker"
import { Cause, Effect } from "effect"
import { expect } from "vitest"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import type {
  ActivityMessageNotFoundError,
  ReactionNotFoundError,
  SavedMessageNotFoundError
} from "../../../src/huly/errors.js"
import { activity, chunter, core, documentPlugin, tracker } from "../../../src/huly/huly-plugins.js"
import {
  addReaction,
  listActivity,
  listMentions,
  listReactions,
  listSavedMessages,
  removeReaction,
  saveMessage,
  unsaveMessage
} from "../../../src/huly/operations/activity.js"
import { assertAt } from "../../../src/utils/assertions.js"
import {
  activityMessageId,
  channelIdentifier,
  docId,
  documentIdentifier,
  emojiCode,
  issueIdentifier,
  objectClassName,
  projectIdentifier,
  teamspaceIdentifier
} from "../../helpers/brands.js"

const makeActivityMessage = (overrides?: Partial<HulyActivityMessage>): HulyActivityMessage => {
  const result: HulyActivityMessage = {
    _id: "msg-1" as Ref<HulyActivityMessage>,
    _class: activity.class.ActivityMessage,
    space: "space-1" as Ref<Space>,
    attachedTo: "obj-1" as Ref<Doc>,
    attachedToClass: "tracker:class:Issue" as Ref<Class<Doc>>,
    collection: "activity",
    modifiedBy: "user-1" as PersonId,
    modifiedOn: 0,
    isPinned: false,
    replies: 0,
    reactions: 0,
    ...overrides
  }
  return result
}

const makeReaction = (overrides?: Partial<HulyReaction>): HulyReaction => {
  const result: HulyReaction = {
    _id: "reaction-1" as Ref<HulyReaction>,
    _class: activity.class.Reaction,
    space: "space-1" as Ref<Space>,
    attachedTo: "msg-1" as Ref<HulyActivityMessage>,
    attachedToClass: activity.class.ActivityMessage,
    collection: "reactions",
    emoji: ":thumbsup:",
    createBy: "user-1" as PersonId,
    modifiedBy: "user-1" as PersonId,
    modifiedOn: 0,
    ...overrides
  }
  return result
}

const makeSavedMessage = (overrides?: Partial<HulySavedMessage>): HulySavedMessage => {
  const result: HulySavedMessage = {
    _id: "saved-1" as Ref<HulySavedMessage>,
    _class: activity.class.SavedMessage,
    space: core.space.Workspace,
    attachedTo: "msg-1" as Ref<HulyActivityMessage>,
    modifiedBy: "user-1" as PersonId,
    modifiedOn: 0,
    ...overrides
  }
  return result
}

const makeMention = (overrides?: Partial<UserMentionInfo>): UserMentionInfo => {
  const result: UserMentionInfo = {
    _id: "mention-1" as Ref<UserMentionInfo>,
    _class: activity.class.UserMentionInfo,
    space: "space-1" as Ref<Space>,
    attachedTo: "msg-1" as Ref<Doc>,
    attachedToClass: activity.class.ActivityMessage,
    collection: "mentions",
    user: "person-1" as Ref<Person>,
    content: "Hey @user check this",
    modifiedBy: "user-1" as PersonId,
    modifiedOn: 0,
    ...overrides
  }
  return result
}

const makeProject = (overrides?: Partial<HulyProject>): HulyProject => {
  const base = {
    _id: "project-1" as Ref<HulyProject>,
    _class: tracker.class.Project,
    space: "space-1" as Ref<Space>,
    identifier: "TEST",
    name: "Test Project",
    sequence: 1,
    defaultIssueStatus: "status-open" as Ref<never>,
    defaultTimeReportDay: TimeReportDayType.CurrentWorkDay,
    modifiedBy: "user-1" as PersonId,
    modifiedOn: 0,
    createdBy: "user-1" as PersonId,
    createdOn: 0
  }
  return Object.assign(base, overrides) as HulyProject
}

const makeIssue = (overrides?: Partial<HulyIssue>): HulyIssue => ({
  _id: "issue-1" as Ref<HulyIssue>,
  _class: tracker.class.Issue,
  space: "project-1" as Ref<HulyProject>,
  identifier: "TEST-1",
  title: "Test Issue",
  description: null,
  status: "status-open" as Ref<never>,
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
  modifiedBy: "user-1" as PersonId,
  modifiedOn: 0,
  createdBy: "user-1" as PersonId,
  createdOn: 0,
  ...overrides
})

const makeTeamspace = (overrides?: Partial<HulyTeamspace>): HulyTeamspace => ({
  _id: "teamspace-1" as Ref<HulyTeamspace>,
  _class: documentPlugin.class.Teamspace,
  space: "space-1" as Ref<Space>,
  name: "Engineering",
  description: "",
  private: false,
  archived: false,
  icon: documentPlugin.icon.Teamspace,
  type: documentPlugin.spaceType.DefaultTeamspaceType,
  members: [],
  modifiedBy: "user-1" as PersonId,
  modifiedOn: 0,
  createdBy: "user-1" as PersonId,
  createdOn: 0,
  ...overrides
})

const makeDocument = (overrides?: Partial<HulyDocument>): HulyDocument => ({
  _id: "doc-1" as Ref<HulyDocument>,
  _class: documentPlugin.class.Document,
  space: "teamspace-1" as Ref<HulyTeamspace>,
  title: "Spec",
  content: null,
  parent: documentPlugin.ids.NoParent,
  rank: "0|aaa",
  modifiedBy: "user-1" as PersonId,
  modifiedOn: 0,
  createdBy: "user-1" as PersonId,
  createdOn: 0,
  ...overrides
})

const makeChannel = (overrides?: Partial<HulyChannel>): HulyChannel => ({
  _id: "channel-1" as Ref<HulyChannel>,
  _class: chunter.class.Channel,
  space: "space-1" as Ref<Space>,
  name: "dev",
  description: "",
  topic: "",
  private: false,
  archived: false,
  members: [],
  modifiedBy: "user-1" as PersonId,
  modifiedOn: 0,
  createdBy: "user-1" as PersonId,
  createdOn: 0,
  ...overrides
})

interface MockConfig {
  activityMessages?: Array<HulyActivityMessage>
  reactions?: Array<HulyReaction>
  savedMessages?: Array<HulySavedMessage>
  mentions?: Array<UserMentionInfo>
  projects?: Array<HulyProject>
  issues?: Array<HulyIssue>
  teamspaces?: Array<HulyTeamspace>
  documents?: Array<HulyDocument>
  channels?: Array<HulyChannel>
  captureAddCollection?: { attributes?: Record<string, unknown>; id?: string }
  captureCreateDoc?: { attributes?: Record<string, unknown>; id?: string }
  captureRemoveDoc?: { called?: boolean }
}

const createTestLayerWithMocks = (config: MockConfig) => {
  const activityMessages = config.activityMessages ?? []
  const reactions = config.reactions ?? []
  const savedMessages = config.savedMessages ?? []
  const mentions = config.mentions ?? []
  const projects = config.projects ?? []
  const issues = config.issues ?? []
  const teamspaces = config.teamspaces ?? []
  const documents = config.documents ?? []
  const channels = config.channels ?? []

  const findAllImpl: HulyClientOperations["findAll"] = ((_class: unknown, query: unknown, _options: unknown) => {
    if (_class === activity.class.ActivityMessage) {
      const q = query as { attachedTo?: Ref<Doc>; attachedToClass?: Ref<Class<Doc>> }
      const filtered = activityMessages.filter(m =>
        (!q.attachedTo || m.attachedTo === q.attachedTo)
        && (!q.attachedToClass || m.attachedToClass === q.attachedToClass)
      )
      return Effect.succeed(toFindResult(filtered))
    }
    if (_class === activity.class.Reaction) {
      const q = query as { attachedTo?: Ref<HulyActivityMessage> }
      const filtered = reactions.filter(r => !q.attachedTo || r.attachedTo === q.attachedTo)
      return Effect.succeed(toFindResult(filtered))
    }
    if (_class === activity.class.SavedMessage) {
      return Effect.succeed(toFindResult(savedMessages))
    }
    if (_class === activity.class.UserMentionInfo) {
      return Effect.succeed(toFindResult(mentions))
    }
    return Effect.succeed(toFindResult([]))
  }) as HulyClientOperations["findAll"]

  const findOneImpl: HulyClientOperations["findOne"] = ((_class: unknown, query: unknown) => {
    if (_class === activity.class.ActivityMessage) {
      const q = query as { _id?: Ref<HulyActivityMessage> }
      const found = activityMessages.find(m => q._id && m._id === q._id)
      return Effect.succeed(found)
    }
    if (_class === activity.class.Reaction) {
      const q = query as { attachedTo?: Ref<HulyActivityMessage>; emoji?: string }
      const found = reactions.find(r =>
        (!q.attachedTo || r.attachedTo === q.attachedTo)
        && (!q.emoji || r.emoji === q.emoji)
      )
      return Effect.succeed(found)
    }
    if (_class === activity.class.SavedMessage) {
      const q = query as { attachedTo?: Ref<HulyActivityMessage> }
      const found = savedMessages.find(s => !q.attachedTo || s.attachedTo === q.attachedTo)
      return Effect.succeed(found)
    }
    if (_class === tracker.class.Project) {
      const q = query as { identifier?: string }
      const found = projects.find(p => q.identifier && p.identifier === q.identifier)
      return Effect.succeed(found)
    }
    if (_class === tracker.class.Issue) {
      const q = query as { space?: Ref<HulyProject>; identifier?: string; number?: number }
      const found = issues.find(i =>
        (!q.space || i.space === q.space)
        && (
          (q.identifier !== undefined && i.identifier === q.identifier)
          || (q.number !== undefined && i.number === q.number)
        )
      )
      return Effect.succeed(found)
    }
    if (_class === documentPlugin.class.Teamspace) {
      const q = query as { name?: string; _id?: Ref<HulyTeamspace>; archived?: boolean }
      const found = teamspaces.find(ts =>
        (q.archived === undefined || ts.archived === q.archived)
        && ((q.name !== undefined && ts.name === q.name) || (q._id !== undefined && ts._id === q._id))
      )
      return Effect.succeed(found)
    }
    if (_class === documentPlugin.class.Document) {
      const q = query as { space?: Ref<HulyTeamspace>; title?: string; _id?: Ref<HulyDocument> }
      const found = documents.find(doc =>
        (!q.space || doc.space === q.space)
        && ((q.title !== undefined && doc.title === q.title) || (q._id !== undefined && doc._id === q._id))
      )
      return Effect.succeed(found)
    }
    if (_class === chunter.class.Channel) {
      const q = query as { name?: string; _id?: Ref<HulyChannel> }
      const found = channels.find(channel =>
        (q.name !== undefined && channel.name === q.name) || (q._id !== undefined && channel._id === q._id)
      )
      return Effect.succeed(found)
    }
    return Effect.succeed(undefined)
  }) as HulyClientOperations["findOne"]

  const createDocImpl: HulyClientOperations["createDoc"] = ((
    _class: unknown,
    _space: unknown,
    attributes: unknown,
    id?: unknown
  ) => {
    if (config.captureCreateDoc) {
      config.captureCreateDoc.attributes = attributes as Record<string, unknown>
      config.captureCreateDoc.id = id as string
    }
    return Effect.succeed((id ?? "new-id") as Ref<Doc>)
  }) as HulyClientOperations["createDoc"]

  const addCollectionImpl: HulyClientOperations["addCollection"] = ((
    _class: unknown,
    _space: unknown,
    _attachedTo: unknown,
    _attachedToClass: unknown,
    _collection: unknown,
    attributes: unknown,
    id?: unknown
  ) => {
    if (config.captureAddCollection) {
      config.captureAddCollection.attributes = attributes as Record<string, unknown>
      config.captureAddCollection.id = id as string
    }
    return Effect.succeed((id ?? "new-id") as Ref<Doc>)
  }) as HulyClientOperations["addCollection"]

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
    createDoc: createDocImpl,
    addCollection: addCollectionImpl,
    removeDoc: removeDocImpl
  })
}

describe("listActivity", () => {
  it.effect("returns activity messages for an object", () =>
    Effect.gen(function*() {
      const messages = [
        makeActivityMessage({
          _id: "msg-1" as Ref<HulyActivityMessage>,
          attachedTo: "obj-1" as Ref<Doc>,
          attachedToClass: "tracker:class:Issue" as Ref<Class<Doc>>,
          modifiedOn: 1000
        }),
        makeActivityMessage({
          _id: "msg-2" as Ref<HulyActivityMessage>,
          attachedTo: "obj-1" as Ref<Doc>,
          attachedToClass: "tracker:class:Issue" as Ref<Class<Doc>>,
          modifiedOn: 2000
        })
      ]

      const testLayer = createTestLayerWithMocks({ activityMessages: messages })

      const result = yield* listActivity({
        objectId: docId("obj-1"),
        objectClass: objectClassName("tracker:class:Issue")
      }).pipe(Effect.provide(testLayer))

      expect(result).toHaveLength(2)
      expect(assertAt(result, 0).id).toBe("msg-1")
      expect(assertAt(result, 1).id).toBe("msg-2")
    }))

  it.effect("returns empty array when no activity exists", () =>
    Effect.gen(function*() {
      const testLayer = createTestLayerWithMocks({ activityMessages: [] })

      const result = yield* listActivity({
        objectId: docId("obj-1"),
        objectClass: objectClassName("tracker:class:Issue")
      }).pipe(Effect.provide(testLayer))

      expect(result).toHaveLength(0)
    }))

  it.effect("maps activity message fields correctly", () =>
    Effect.gen(function*() {
      const msg = makeActivityMessage({
        _id: "msg-1" as Ref<HulyActivityMessage>,
        attachedTo: "obj-1" as Ref<Doc>,
        attachedToClass: "tracker:class:Issue" as Ref<Class<Doc>>,
        modifiedBy: "person-x" as PersonId,
        modifiedOn: 1706500000000,
        isPinned: true,
        replies: 5,
        reactions: 3,
        editedOn: 1706500001000
      })

      const testLayer = createTestLayerWithMocks({ activityMessages: [msg] })

      const result = yield* listActivity({
        objectId: docId("obj-1"),
        objectClass: objectClassName("tracker:class:Issue")
      }).pipe(Effect.provide(testLayer))

      expect(assertAt(result, 0)).toEqual({
        id: "msg-1",
        messageClass: "activity:class:ActivityMessage",
        objectId: "obj-1",
        objectClass: "tracker:class:Issue",
        modifiedBy: "person-x",
        modifiedOn: 1706500000000,
        isPinned: true,
        replies: 5,
        reactions: 3,
        editedOn: 1706500001000
      })
    }))

  it.effect("omits reply and reaction counts when absent on the message", () =>
    Effect.gen(function*() {
      // A bare message (no replies/reactions/editedOn) exercises the undefined
      // arm of optionalActivityCount.
      const msg: HulyActivityMessage = {
        _id: "msg-bare" as Ref<HulyActivityMessage>,
        _class: activity.class.ActivityMessage,
        space: "space-1" as Ref<Space>,
        attachedTo: "obj-1" as Ref<Doc>,
        attachedToClass: "tracker:class:Issue" as Ref<Class<Doc>>,
        collection: "activity",
        modifiedBy: "user-1" as PersonId,
        modifiedOn: 0,
        isPinned: false
      }
      const testLayer = createTestLayerWithMocks({ activityMessages: [msg] })

      const result = yield* listActivity({
        objectId: docId("obj-1"),
        objectClass: objectClassName("tracker:class:Issue")
      }).pipe(Effect.provide(testLayer))

      expect(assertAt(result, 0).replies).toBeUndefined()
      expect(assertAt(result, 0).reactions).toBeUndefined()
      expect(assertAt(result, 0).editedOn).toBeUndefined()
    }))

  it.effect("dies when no activity target mode is provided", () =>
    Effect.gen(function*() {
      const testLayer = createTestLayerWithMocks({})

      // Schema validation normally guarantees one target mode; calling the
      // operation directly with none exercises the defensive dieMessage.
      const exit = yield* listActivity({}).pipe(Effect.provide(testLayer), Effect.exit)

      expect(exit._tag).toBe("Failure")
      if (exit._tag === "Failure") {
        expect(Cause.isDie(exit.cause)).toBe(true)
      }
    }))

  it.effect("filters by objectClass", () =>
    Effect.gen(function*() {
      const messages = [
        makeActivityMessage({
          _id: "msg-1" as Ref<HulyActivityMessage>,
          attachedTo: "obj-1" as Ref<Doc>,
          attachedToClass: "tracker:class:Issue" as Ref<Class<Doc>>
        }),
        makeActivityMessage({
          _id: "msg-2" as Ref<HulyActivityMessage>,
          attachedTo: "obj-1" as Ref<Doc>,
          attachedToClass: "document:class:Document" as Ref<Class<Doc>>
        })
      ]

      const testLayer = createTestLayerWithMocks({ activityMessages: messages })

      const result = yield* listActivity({
        objectId: docId("obj-1"),
        objectClass: objectClassName("tracker:class:Issue")
      }).pipe(Effect.provide(testLayer))

      expect(result).toHaveLength(1)
      expect(assertAt(result, 0).id).toBe("msg-1")
    }))

  it.effect("resolves issue identifiers before listing activity", () =>
    Effect.gen(function*() {
      const project = makeProject()
      const issue = makeIssue()
      const msg = makeActivityMessage({
        _id: "msg-issue" as Ref<HulyActivityMessage>,
        attachedTo: "issue-1" as Ref<Doc>,
        attachedToClass: tracker.class.Issue
      })
      const testLayer = createTestLayerWithMocks({
        projects: [project],
        issues: [issue],
        activityMessages: [msg]
      })

      const result = yield* listActivity({
        project: projectIdentifier("TEST"),
        issueIdentifier: issueIdentifier("TEST-1")
      }).pipe(Effect.provide(testLayer))

      expect(result).toHaveLength(1)
      expect(assertAt(result, 0).id).toBe("msg-issue")
      expect(assertAt(result, 0).objectClass).toBe(String(tracker.class.Issue))
    }))

  it.effect("resolves document identifiers before listing activity", () =>
    Effect.gen(function*() {
      const teamspace = makeTeamspace()
      const doc = makeDocument()
      const msg = makeActivityMessage({
        _id: "msg-doc" as Ref<HulyActivityMessage>,
        attachedTo: "doc-1" as Ref<Doc>,
        attachedToClass: documentPlugin.class.Document
      })
      const testLayer = createTestLayerWithMocks({
        teamspaces: [teamspace],
        documents: [doc],
        activityMessages: [msg]
      })

      const result = yield* listActivity({
        teamspace: teamspaceIdentifier("Engineering"),
        document: documentIdentifier("Spec")
      }).pipe(Effect.provide(testLayer))

      expect(result).toHaveLength(1)
      expect(assertAt(result, 0).id).toBe("msg-doc")
      expect(assertAt(result, 0).objectClass).toBe(String(documentPlugin.class.Document))
    }))

  it.effect("resolves channel identifiers before listing activity", () =>
    Effect.gen(function*() {
      const channel = makeChannel()
      const msg = makeActivityMessage({
        _id: "msg-channel" as Ref<HulyActivityMessage>,
        attachedTo: "channel-1" as Ref<Doc>,
        attachedToClass: chunter.class.Channel
      })
      const testLayer = createTestLayerWithMocks({
        channels: [channel],
        activityMessages: [msg]
      })

      const result = yield* listActivity({
        channel: channelIdentifier("dev")
      }).pipe(Effect.provide(testLayer))

      expect(result).toHaveLength(1)
      expect(assertAt(result, 0).id).toBe("msg-channel")
      expect(assertAt(result, 0).objectClass).toBe(String(chunter.class.Channel))
    }))
})

describe("addReaction", () => {
  it.effect("adds reaction to an activity message", () =>
    Effect.gen(function*() {
      const msg = makeActivityMessage({
        _id: "msg-1" as Ref<HulyActivityMessage>,
        space: "space-1" as Ref<Space>
      })
      const captureAddCollection: MockConfig["captureAddCollection"] = {}

      const testLayer = createTestLayerWithMocks({
        activityMessages: [msg],
        captureAddCollection
      })

      const result = yield* addReaction({
        messageId: activityMessageId("msg-1"),
        emoji: emojiCode(":thumbsup:")
      }).pipe(Effect.provide(testLayer))

      expect(result.messageId).toBe("msg-1")
      expect(result.reactionId).toBeDefined()
      expect(captureAddCollection.attributes?.emoji).toBe(":thumbsup:")
    }))

  it.effect("returns ActivityMessageNotFoundError when message does not exist", () =>
    Effect.gen(function*() {
      const testLayer = createTestLayerWithMocks({ activityMessages: [] })

      const error = yield* Effect.flip(
        addReaction({
          messageId: activityMessageId("nonexistent"),
          emoji: emojiCode(":heart:")
        }).pipe(Effect.provide(testLayer))
      )

      expect(error._tag).toBe("ActivityMessageNotFoundError")
      expect((error as ActivityMessageNotFoundError).messageId).toBe("nonexistent")
    }))
})

describe("removeReaction", () => {
  it.effect("removes reaction from a message", () =>
    Effect.gen(function*() {
      const reaction = makeReaction({
        attachedTo: "msg-1" as Ref<HulyActivityMessage>,
        emoji: ":thumbsup:",
        space: "space-1" as Ref<Space>
      })
      const captureRemoveDoc: MockConfig["captureRemoveDoc"] = {}

      const testLayer = createTestLayerWithMocks({
        reactions: [reaction],
        captureRemoveDoc
      })

      const result = yield* removeReaction({
        messageId: activityMessageId("msg-1"),
        emoji: emojiCode(":thumbsup:")
      }).pipe(Effect.provide(testLayer))

      expect(result.messageId).toBe("msg-1")
      expect(result.removed).toBe(true)
      expect(captureRemoveDoc.called).toBe(true)
    }))

  it.effect("returns ReactionNotFoundError when reaction does not exist", () =>
    Effect.gen(function*() {
      const testLayer = createTestLayerWithMocks({ reactions: [] })

      const error = yield* Effect.flip(
        removeReaction({
          messageId: activityMessageId("msg-1"),
          emoji: emojiCode(":nonexistent:")
        }).pipe(Effect.provide(testLayer))
      )

      expect(error._tag).toBe("ReactionNotFoundError")
      expect((error as ReactionNotFoundError).messageId).toBe("msg-1")
      expect((error as ReactionNotFoundError).emoji).toBe(":nonexistent:")
    }))

  it.effect("matches on both messageId and emoji", () =>
    Effect.gen(function*() {
      const reactions = [
        makeReaction({
          _id: "reaction-1" as Ref<HulyReaction>,
          attachedTo: "msg-1" as Ref<HulyActivityMessage>,
          emoji: ":thumbsup:"
        }),
        makeReaction({
          _id: "reaction-2" as Ref<HulyReaction>,
          attachedTo: "msg-1" as Ref<HulyActivityMessage>,
          emoji: ":heart:"
        })
      ]

      const captureRemoveDoc: MockConfig["captureRemoveDoc"] = {}
      const testLayer = createTestLayerWithMocks({ reactions, captureRemoveDoc })

      const result = yield* removeReaction({
        messageId: activityMessageId("msg-1"),
        emoji: emojiCode(":heart:")
      }).pipe(Effect.provide(testLayer))

      expect(result.messageId).toBe("msg-1")
      expect(result.removed).toBe(true)
      expect(captureRemoveDoc.called).toBe(true)

      const remainingReactions = yield* listReactions({
        messageId: activityMessageId("msg-1")
      }).pipe(Effect.provide(testLayer))

      expect(remainingReactions).toHaveLength(2)
      expect(remainingReactions.some(r => r.emoji === ":thumbsup:")).toBe(true)
    }))
})

describe("listReactions", () => {
  it.effect("returns reactions for a message", () =>
    Effect.gen(function*() {
      const reactions = [
        makeReaction({
          _id: "reaction-1" as Ref<HulyReaction>,
          attachedTo: "msg-1" as Ref<HulyActivityMessage>,
          emoji: ":thumbsup:",
          createBy: "person-a" as PersonId
        }),
        makeReaction({
          _id: "reaction-2" as Ref<HulyReaction>,
          attachedTo: "msg-1" as Ref<HulyActivityMessage>,
          emoji: ":heart:",
          createBy: "person-b" as PersonId
        })
      ]

      const testLayer = createTestLayerWithMocks({ reactions })

      const result = yield* listReactions({
        messageId: activityMessageId("msg-1")
      }).pipe(Effect.provide(testLayer))

      expect(result).toHaveLength(2)
      expect(assertAt(result, 0)).toEqual({
        id: "reaction-1",
        messageId: "msg-1",
        emoji: ":thumbsup:",
        createdBy: "person-a"
      })
      expect(assertAt(result, 1)).toEqual({
        id: "reaction-2",
        messageId: "msg-1",
        emoji: ":heart:",
        createdBy: "person-b"
      })
    }))

  it.effect("returns empty array when no reactions exist", () =>
    Effect.gen(function*() {
      const testLayer = createTestLayerWithMocks({ reactions: [] })

      const result = yield* listReactions({
        messageId: activityMessageId("msg-1")
      }).pipe(Effect.provide(testLayer))

      expect(result).toHaveLength(0)
    }))

  it.effect("omits createdBy when Huly returns an empty reaction creator", () =>
    Effect.gen(function*() {
      const reactions = [
        makeReaction({
          createBy: "" as PersonId
        })
      ]

      const testLayer = createTestLayerWithMocks({ reactions })

      const result = yield* listReactions({
        messageId: activityMessageId("msg-1")
      }).pipe(Effect.provide(testLayer))

      expect(result).toEqual([{
        id: "reaction-1",
        messageId: "msg-1",
        emoji: ":thumbsup:",
        createdBy: undefined
      }])
    }))

  it.effect("filters reactions by messageId", () =>
    Effect.gen(function*() {
      const reactions = [
        makeReaction({
          _id: "reaction-1" as Ref<HulyReaction>,
          attachedTo: "msg-1" as Ref<HulyActivityMessage>,
          emoji: ":thumbsup:"
        }),
        makeReaction({
          _id: "reaction-2" as Ref<HulyReaction>,
          attachedTo: "msg-2" as Ref<HulyActivityMessage>,
          emoji: ":heart:"
        })
      ]

      const testLayer = createTestLayerWithMocks({ reactions })

      const result = yield* listReactions({
        messageId: activityMessageId("msg-1")
      }).pipe(Effect.provide(testLayer))

      expect(result).toHaveLength(1)
      expect(assertAt(result, 0).id).toBe("reaction-1")
    }))
})

describe("saveMessage", () => {
  it.effect("saves an activity message", () =>
    Effect.gen(function*() {
      const msg = makeActivityMessage({
        _id: "msg-1" as Ref<HulyActivityMessage>
      })
      const captureCreateDoc: MockConfig["captureCreateDoc"] = {}

      const testLayer = createTestLayerWithMocks({
        activityMessages: [msg],
        captureCreateDoc
      })

      const result = yield* saveMessage({
        messageId: activityMessageId("msg-1")
      }).pipe(Effect.provide(testLayer))

      expect(result.messageId).toBe("msg-1")
      expect(result.savedId).toBeDefined()
      expect(captureCreateDoc.attributes?.attachedTo).toBe("msg-1")
    }))

  it.effect("returns ActivityMessageNotFoundError when message does not exist", () =>
    Effect.gen(function*() {
      const testLayer = createTestLayerWithMocks({ activityMessages: [] })

      const error = yield* Effect.flip(
        saveMessage({
          messageId: activityMessageId("nonexistent")
        }).pipe(Effect.provide(testLayer))
      )

      expect(error._tag).toBe("ActivityMessageNotFoundError")
      expect((error as ActivityMessageNotFoundError).messageId).toBe("nonexistent")
    }))
})

describe("unsaveMessage", () => {
  it.effect("removes a saved message", () =>
    Effect.gen(function*() {
      const saved = makeSavedMessage({
        attachedTo: "msg-1" as Ref<HulyActivityMessage>,
        space: "workspace-1" as Ref<Space>
      })
      const captureRemoveDoc: MockConfig["captureRemoveDoc"] = {}

      const testLayer = createTestLayerWithMocks({
        savedMessages: [saved],
        captureRemoveDoc
      })

      const result = yield* unsaveMessage({
        messageId: activityMessageId("msg-1")
      }).pipe(Effect.provide(testLayer))

      expect(result.messageId).toBe("msg-1")
      expect(result.removed).toBe(true)
      expect(captureRemoveDoc.called).toBe(true)
    }))

  it.effect("returns SavedMessageNotFoundError when saved message does not exist", () =>
    Effect.gen(function*() {
      const testLayer = createTestLayerWithMocks({ savedMessages: [] })

      const error = yield* Effect.flip(
        unsaveMessage({
          messageId: activityMessageId("nonexistent")
        }).pipe(Effect.provide(testLayer))
      )

      expect(error._tag).toBe("SavedMessageNotFoundError")
      expect((error as SavedMessageNotFoundError).messageId).toBe("nonexistent")
    }))
})

describe("listSavedMessages", () => {
  it.effect("returns saved messages", () =>
    Effect.gen(function*() {
      const saved = [
        makeSavedMessage({
          _id: "saved-1" as Ref<HulySavedMessage>,
          attachedTo: "msg-1" as Ref<HulyActivityMessage>
        }),
        makeSavedMessage({
          _id: "saved-2" as Ref<HulySavedMessage>,
          attachedTo: "msg-2" as Ref<HulyActivityMessage>
        })
      ]

      const testLayer = createTestLayerWithMocks({ savedMessages: saved })

      const result = yield* listSavedMessages({}).pipe(Effect.provide(testLayer))

      expect(result).toHaveLength(2)
      expect(assertAt(result, 0)).toEqual({ id: "saved-1", messageId: "msg-1" })
      expect(assertAt(result, 1)).toEqual({ id: "saved-2", messageId: "msg-2" })
    }))

  it.effect("returns empty array when no saved messages exist", () =>
    Effect.gen(function*() {
      const testLayer = createTestLayerWithMocks({ savedMessages: [] })

      const result = yield* listSavedMessages({}).pipe(Effect.provide(testLayer))

      expect(result).toHaveLength(0)
    }))
})

describe("listMentions", () => {
  it.effect("returns mentions for current user", () =>
    Effect.gen(function*() {
      const mentions = [
        makeMention({
          _id: "mention-1" as Ref<UserMentionInfo>,
          attachedTo: "msg-1" as Ref<Doc>,
          user: "person-1" as Ref<Person>,
          content: "Hey @alice check this"
        }),
        makeMention({
          _id: "mention-2" as Ref<UserMentionInfo>,
          attachedTo: "msg-2" as Ref<Doc>,
          user: "person-2" as Ref<Person>,
          content: "Cc @bob"
        })
      ]

      const testLayer = createTestLayerWithMocks({ mentions })

      const result = yield* listMentions({}).pipe(Effect.provide(testLayer))

      expect(result).toHaveLength(2)
      expect(assertAt(result, 0)).toEqual({
        id: "mention-1",
        messageId: "msg-1",
        userId: "person-1",
        content: "Hey @alice check this"
      })
      expect(assertAt(result, 1)).toEqual({
        id: "mention-2",
        messageId: "msg-2",
        userId: "person-2",
        content: "Cc @bob"
      })
    }))

  it.effect("returns empty array when no mentions exist", () =>
    Effect.gen(function*() {
      const testLayer = createTestLayerWithMocks({ mentions: [] })

      const result = yield* listMentions({}).pipe(Effect.provide(testLayer))

      expect(result).toHaveLength(0)
    }))
})
