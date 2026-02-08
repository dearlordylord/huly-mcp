import { describe, it } from "@effect/vitest"
import type {
  ActivityMessage as HulyActivityMessage,
  Reaction as HulyReaction,
  SavedMessage as HulySavedMessage,
  UserMentionInfo
} from "@hcengineering/activity"
import type { Person } from "@hcengineering/contact"
import { type Class, type Doc, type PersonId, type Ref, type Space, toFindResult } from "@hcengineering/core"
import { Effect } from "effect"
import { expect } from "vitest"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import type {
  ActivityMessageNotFoundError,
  ReactionNotFoundError,
  SavedMessageNotFoundError
} from "../../../src/huly/errors.js"
import { activity, core } from "../../../src/huly/huly-plugins.js"
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
import { activityMessageId, emojiCode, objectClassName } from "../../helpers/brands.js"

const makeActivityMessage = (overrides?: Partial<HulyActivityMessage>): HulyActivityMessage => {
  const result: HulyActivityMessage = {
    _id: "msg-1" as Ref<HulyActivityMessage>,
    _class: activity.class.ActivityMessage,
    space: "space-1" as Ref<Space>,
    attachedTo: "obj-1" as Ref<Doc>,
    attachedToClass: "tracker:class:Issue" as Ref<Class<Doc>>,
    collection: "activity",
    modifiedBy: "user-1" as PersonId,
    modifiedOn: Date.now(),
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
    modifiedOn: Date.now(),
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
    modifiedOn: Date.now(),
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
    modifiedOn: Date.now(),
    ...overrides
  }
  return result
}

interface MockConfig {
  activityMessages?: Array<HulyActivityMessage>
  reactions?: Array<HulyReaction>
  savedMessages?: Array<HulySavedMessage>
  mentions?: Array<UserMentionInfo>
  captureAddCollection?: { attributes?: Record<string, unknown>; id?: string }
  captureCreateDoc?: { attributes?: Record<string, unknown>; id?: string }
  captureRemoveDoc?: { called?: boolean }
}

const createTestLayerWithMocks = (config: MockConfig) => {
  const activityMessages = config.activityMessages ?? []
  const reactions = config.reactions ?? []
  const savedMessages = config.savedMessages ?? []
  const mentions = config.mentions ?? []

  const findAllImpl: HulyClientOperations["findAll"] = ((_class: unknown, query: unknown, _options: unknown) => {
    if (_class === activity.class.ActivityMessage) {
      const q = query as { attachedTo?: Ref<Doc>; attachedToClass?: Ref<Class<Doc>> }
      const filtered = activityMessages.filter(m =>
        (!q.attachedTo || m.attachedTo === q.attachedTo)
        && (!q.attachedToClass || m.attachedToClass === q.attachedToClass)
      )
      return Effect.succeed(toFindResult(filtered as Array<Doc>))
    }
    if (_class === activity.class.Reaction) {
      const q = query as { attachedTo?: Ref<HulyActivityMessage> }
      const filtered = reactions.filter(r => !q.attachedTo || r.attachedTo === q.attachedTo)
      return Effect.succeed(toFindResult(filtered as Array<Doc>))
    }
    if (_class === activity.class.SavedMessage) {
      return Effect.succeed(toFindResult(savedMessages as Array<Doc>))
    }
    if (_class === activity.class.UserMentionInfo) {
      return Effect.succeed(toFindResult(mentions as Array<Doc>))
    }
    return Effect.succeed(toFindResult([]))
  }) as HulyClientOperations["findAll"]

  const findOneImpl: HulyClientOperations["findOne"] = ((_class: unknown, query: unknown) => {
    if (_class === activity.class.ActivityMessage) {
      const q = query as { _id?: Ref<HulyActivityMessage> }
      const found = activityMessages.find(m => q._id && m._id === q._id)
      return Effect.succeed(found as Doc | undefined)
    }
    if (_class === activity.class.Reaction) {
      const q = query as { attachedTo?: Ref<HulyActivityMessage>; emoji?: string }
      const found = reactions.find(r =>
        (!q.attachedTo || r.attachedTo === q.attachedTo)
        && (!q.emoji || r.emoji === q.emoji)
      )
      return Effect.succeed(found as Doc | undefined)
    }
    if (_class === activity.class.SavedMessage) {
      const q = query as { attachedTo?: Ref<HulyActivityMessage> }
      const found = savedMessages.find(s => !q.attachedTo || s.attachedTo === q.attachedTo)
      return Effect.succeed(found as Doc | undefined)
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
  // test-revizorro: approved
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
        objectId: "obj-1",
        objectClass: objectClassName("tracker:class:Issue")
      }).pipe(Effect.provide(testLayer))

      expect(result).toHaveLength(2)
      expect(result[0].id).toBe("msg-1")
      expect(result[1].id).toBe("msg-2")
    }))

  // test-revizorro: approved
  it.effect("returns empty array when no activity exists", () =>
    Effect.gen(function*() {
      const testLayer = createTestLayerWithMocks({ activityMessages: [] })

      const result = yield* listActivity({
        objectId: "obj-1",
        objectClass: objectClassName("tracker:class:Issue")
      }).pipe(Effect.provide(testLayer))

      expect(result).toHaveLength(0)
    }))

  // test-revizorro: approved
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
        objectId: "obj-1",
        objectClass: objectClassName("tracker:class:Issue")
      }).pipe(Effect.provide(testLayer))

      expect(result[0]).toEqual({
        id: "msg-1",
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

  // test-revizorro: approved
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
        objectId: "obj-1",
        objectClass: objectClassName("tracker:class:Issue")
      }).pipe(Effect.provide(testLayer))

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe("msg-1")
    }))
})

describe("addReaction", () => {
  // test-revizorro: approved
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

  // test-revizorro: approved
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
  // test-revizorro: approved
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

  // test-revizorro: approved
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

  // test-revizorro: suspect | Missing assertion: doesn't verify the other reaction wasn't removed
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

      const testLayer = createTestLayerWithMocks({ reactions })

      const result = yield* removeReaction({
        messageId: activityMessageId("msg-1"),
        emoji: emojiCode(":heart:")
      }).pipe(Effect.provide(testLayer))

      expect(result.messageId).toBe("msg-1")
      expect(result.removed).toBe(true)
    }))
})

describe("listReactions", () => {
  // test-revizorro: approved
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
      expect(result[0]).toEqual({
        id: "reaction-1",
        messageId: "msg-1",
        emoji: ":thumbsup:",
        createdBy: "person-a"
      })
      expect(result[1]).toEqual({
        id: "reaction-2",
        messageId: "msg-1",
        emoji: ":heart:",
        createdBy: "person-b"
      })
    }))

  // test-revizorro: approved
  it.effect("returns empty array when no reactions exist", () =>
    Effect.gen(function*() {
      const testLayer = createTestLayerWithMocks({ reactions: [] })

      const result = yield* listReactions({
        messageId: activityMessageId("msg-1")
      }).pipe(Effect.provide(testLayer))

      expect(result).toHaveLength(0)
    }))

  // test-revizorro: approved
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
      expect(result[0].id).toBe("reaction-1")
    }))
})

describe("saveMessage", () => {
  // test-revizorro: approved
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

  // test-revizorro: approved
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
  // test-revizorro: approved
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

  // test-revizorro: approved
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
  // test-revizorro: approved
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
      expect(result[0]).toEqual({ id: "saved-1", messageId: "msg-1" })
      expect(result[1]).toEqual({ id: "saved-2", messageId: "msg-2" })
    }))

  // test-revizorro: approved
  it.effect("returns empty array when no saved messages exist", () =>
    Effect.gen(function*() {
      const testLayer = createTestLayerWithMocks({ savedMessages: [] })

      const result = yield* listSavedMessages({}).pipe(Effect.provide(testLayer))

      expect(result).toHaveLength(0)
    }))
})

describe("listMentions", () => {
  // test-revizorro: approved
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
      expect(result[0]).toEqual({
        id: "mention-1",
        messageId: "msg-1",
        userId: "person-1",
        content: "Hey @alice check this"
      })
      expect(result[1]).toEqual({
        id: "mention-2",
        messageId: "msg-2",
        userId: "person-2",
        content: "Cc @bob"
      })
    }))

  // test-revizorro: approved
  it.effect("returns empty array when no mentions exist", () =>
    Effect.gen(function*() {
      const testLayer = createTestLayerWithMocks({ mentions: [] })

      const result = yield* listMentions({}).pipe(Effect.provide(testLayer))

      expect(result).toHaveLength(0)
    }))
})
