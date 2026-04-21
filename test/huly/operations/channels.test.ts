import { describe, it } from "@effect/vitest"
import type { ActivityMessage } from "@hcengineering/activity"
import type {
  Channel as HulyChannel,
  ChatMessage,
  DirectMessage,
  ThreadMessage as HulyThreadMessage
} from "@hcengineering/chunter"
import type { Employee as HulyEmployee, Person, SocialIdentity } from "@hcengineering/contact"
import {
  type AccountUuid,
  type Doc,
  type PersonId,
  type Ref,
  SocialIdType,
  type Space,
  toFindResult
} from "@hcengineering/core"
import { Effect } from "effect"
import { expect } from "vitest"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import type { ChannelNotFoundError, MessageNotFoundError, ThreadReplyNotFoundError } from "../../../src/huly/errors.js"
import {
  createChannel,
  deleteChannel,
  deleteChannelMessage,
  getChannel,
  listChannelMessages,
  listChannels,
  listDirectMessages,
  sendChannelMessage,
  updateChannel,
  updateChannelMessage
} from "../../../src/huly/operations/channels.js"
import {
  addThreadReply,
  deleteThreadReply,
  listThreadReplies,
  updateThreadReply
} from "../../../src/huly/operations/threads.js"
import { channelIdentifier, messageBrandId, threadReplyId } from "../../helpers/brands.js"

import { chunter, contact } from "../../../src/huly/huly-plugins.js"

const makeChannel = (overrides?: Partial<HulyChannel>): HulyChannel => {
  const result: HulyChannel = {
    _id: "channel-1" as Ref<HulyChannel>,
    _class: chunter.class.Channel,
    space: "space-1" as Ref<Space>,
    name: "general",
    topic: "",
    description: "",
    private: false,
    archived: false,
    members: [],
    messages: 0,
    modifiedBy: "user-1" as PersonId,
    modifiedOn: 0,
    createdBy: "user-1" as PersonId,
    createdOn: 0,
    ...overrides
  }
  return result
}

const makeChatMessage = (overrides?: Partial<ChatMessage>): ChatMessage => {
  const result: ChatMessage = {
    _id: "msg-1" as Ref<ChatMessage>,
    _class: chunter.class.ChatMessage,
    space: "channel-1" as Ref<Space>,
    attachedTo: "channel-1" as Ref<Doc>,
    attachedToClass: chunter.class.Channel,
    collection: "messages",
    message: "<p>Hello world</p>",
    attachments: 0,
    modifiedBy: "user-1" as PersonId,
    modifiedOn: 0,
    createdBy: "user-1" as PersonId,
    createdOn: 0,
    ...overrides
  }
  return result
}

const makeThreadMessage = (overrides?: Partial<HulyThreadMessage>): HulyThreadMessage => {
  const result: HulyThreadMessage = {
    _id: "thread-msg-1" as Ref<HulyThreadMessage>,
    _class: chunter.class.ThreadMessage,
    space: "channel-1" as Ref<Space>,
    attachedTo: "msg-1" as Ref<ActivityMessage>,
    attachedToClass: chunter.class.ChatMessage,
    collection: "replies",
    message: "<p>Reply content</p>",
    attachments: 0,
    objectId: "channel-1" as Ref<Doc>,
    objectClass: chunter.class.Channel,
    modifiedBy: "user-1" as PersonId,
    modifiedOn: 0,
    createdBy: "user-1" as PersonId,
    createdOn: 0,
    ...overrides
  }
  return result
}

const makeDirectMessage = (overrides?: Partial<DirectMessage>): DirectMessage => {
  const result: DirectMessage = {
    _id: "dm-1" as Ref<DirectMessage>,
    _class: chunter.class.DirectMessage,
    space: "space-1" as Ref<Space>,
    name: "",
    description: "",
    private: true,
    archived: false,
    members: [],
    messages: 0,
    modifiedBy: "user-1" as PersonId,
    modifiedOn: 0,
    createdBy: "user-1" as PersonId,
    createdOn: 0,
    ...overrides
  }
  return result
}

// exactOptionalPropertyTypes: Partial spread can introduce undefined into required fields — factory helper needed
const asPerson = (v: unknown) => v as Person
const asEmployee = (v: unknown) => v as HulyEmployee

const makePerson = (overrides?: Partial<Person>): Person =>
  asPerson({
    _id: "person-1" as Ref<Person>,
    _class: contact.class.Person,
    space: "space-1" as Ref<Space>,
    name: "John Doe",
    modifiedBy: "user-1" as PersonId,
    modifiedOn: 0,
    createdBy: "user-1" as PersonId,
    createdOn: 0,
    ...overrides
  })

const makeEmployee = (overrides?: Partial<HulyEmployee>): HulyEmployee =>
  asEmployee({
    _id: "employee-1" as Ref<HulyEmployee>,
    _class: contact.mixin.Employee,
    space: "space-1" as Ref<Space>,
    name: "John Doe",
    active: true,
    modifiedBy: "user-1" as PersonId,
    modifiedOn: 0,
    createdBy: "user-1" as PersonId,
    createdOn: 0,
    ...overrides
  })

const makeSocialIdentity = (overrides?: Partial<SocialIdentity>): SocialIdentity => {
  const result: SocialIdentity = {
    // SocialIdentity._id is Ref<SocialIdentity> & PersonId — double cast required for this intersection phantom type
    _id: "social-1" as Ref<SocialIdentity> & PersonId,
    _class: contact.class.SocialIdentity,
    space: "space-1" as Ref<Space>,
    attachedTo: "person-1" as Ref<Person>,
    attachedToClass: contact.class.Person,
    collection: "socialIds",
    type: SocialIdType.HULY,
    value: "user@example.com",
    key: "huly:user@example.com",
    modifiedBy: "user-1" as PersonId,
    modifiedOn: 0,
    ...overrides
  }
  return result
}

interface MockConfig {
  channels?: Array<HulyChannel>
  messages?: Array<ChatMessage>
  threadMessages?: Array<HulyThreadMessage>
  directMessages?: Array<DirectMessage>
  persons?: Array<Person>
  employees?: Array<HulyEmployee>
  socialIdentities?: Array<SocialIdentity>
  captureChannelQuery?: { query?: Record<string, unknown>; options?: Record<string, unknown> }
  captureCreateDoc?: { attributes?: Record<string, unknown>; id?: string }
  captureUpdateDoc?: { operations?: Record<string, unknown> }
  captureAddCollection?: { attributes?: Record<string, unknown>; id?: string }
  captureRemoveDoc?: { called?: boolean }
}

const createTestLayerWithMocks = (config: MockConfig) => {
  const channels = config.channels ?? []
  const messages = config.messages ?? []
  const threadMessages = config.threadMessages ?? []
  const directMessages = config.directMessages ?? []
  const persons = config.persons ?? []
  const employees = config.employees ?? []
  const socialIdentities = config.socialIdentities ?? []

  const findAllImpl: HulyClientOperations["findAll"] = ((_class: unknown, query: unknown, options: unknown) => {
    if (_class === chunter.class.Channel) {
      if (config.captureChannelQuery) {
        config.captureChannelQuery.query = query as Record<string, unknown>
        config.captureChannelQuery.options = options as Record<string, unknown>
      }
      const opts = options as { sort?: Record<string, number> } | undefined
      let result = [...channels]
      if (opts?.sort?.name !== undefined) {
        const direction = opts.sort.name
        result = result.sort((a, b) => direction * a.name.localeCompare(b.name))
      }
      return Effect.succeed(toFindResult(result))
    }
    if (_class === chunter.class.ChatMessage) {
      const q = query as Record<string, unknown>
      const filtered = messages.filter(m => m.space === q.space)
      const opts = options as { sort?: Record<string, number> } | undefined
      let result = [...filtered]
      if (opts?.sort?.createdOn !== undefined) {
        const direction = opts.sort.createdOn
        result = result.sort((a, b) => direction * ((a.createdOn ?? 0) - (b.createdOn ?? 0)))
      }
      return Effect.succeed(toFindResult(result))
    }
    if (_class === chunter.class.ThreadMessage) {
      const q = query as { attachedTo?: Ref<ActivityMessage>; space?: Ref<Space> }
      const filtered = threadMessages.filter(m =>
        (!q.attachedTo || m.attachedTo === q.attachedTo)
        && (!q.space || m.space === q.space)
      )
      const opts = options as { sort?: Record<string, number> } | undefined
      let result = [...filtered]
      if (opts?.sort?.createdOn !== undefined) {
        const direction = opts.sort.createdOn
        result = result.sort((a, b) => direction * ((a.createdOn ?? 0) - (b.createdOn ?? 0)))
      }
      return Effect.succeed(toFindResult(result))
    }
    if (_class === chunter.class.DirectMessage) {
      const opts = options as { sort?: Record<string, number> } | undefined
      let result = [...directMessages]
      if (opts?.sort?.modifiedOn !== undefined) {
        const direction = opts.sort.modifiedOn
        result = result.sort((a, b) => direction * (a.modifiedOn - b.modifiedOn))
      }
      return Effect.succeed(toFindResult(result))
    }
    if (_class === contact.class.Person) {
      const q = query as { _id?: { $in?: Array<Ref<Person>> } }
      if (q._id?.$in) {
        const filtered = persons.filter(p => q._id!.$in!.includes(p._id))
        return Effect.succeed(toFindResult(filtered))
      }
      return Effect.succeed(toFindResult(persons))
    }
    if (_class === contact.mixin.Employee) {
      const q = query as { personUuid?: { $in?: Array<AccountUuid> } }
      if (q.personUuid?.$in) {
        const filtered = employees.filter(e => e.personUuid !== undefined && q.personUuid!.$in!.includes(e.personUuid))
        return Effect.succeed(toFindResult(filtered))
      }
      return Effect.succeed(toFindResult(employees))
    }
    if (_class === contact.class.SocialIdentity) {
      const q = query as { _id?: { $in?: Array<PersonId> } }
      if (q._id?.$in) {
        const filtered = socialIdentities.filter(si => q._id!.$in!.includes(si._id))
        return Effect.succeed(toFindResult(filtered))
      }
      return Effect.succeed(toFindResult(socialIdentities))
    }
    return Effect.succeed(toFindResult([]))
  }) as HulyClientOperations["findAll"]

  const findOneImpl: HulyClientOperations["findOne"] = ((_class: unknown, query: unknown) => {
    if (_class === chunter.class.Channel) {
      const q = query as Record<string, unknown>
      const found = channels.find(c =>
        (q.name && c.name === q.name)
        || (q._id && c._id === q._id)
      )
      return Effect.succeed(found)
    }
    if (_class === chunter.class.ChatMessage) {
      const q = query as { _id?: Ref<ChatMessage>; space?: Ref<Space> }
      const found = messages.find(m =>
        (!q._id || m._id === q._id)
        && (!q.space || m.space === q.space)
      )
      return Effect.succeed(found)
    }
    if (_class === chunter.class.ThreadMessage) {
      const q = query as { _id?: Ref<HulyThreadMessage>; attachedTo?: Ref<ActivityMessage>; space?: Ref<Space> }
      const found = threadMessages.find(m =>
        (!q._id || m._id === q._id)
        && (!q.attachedTo || m.attachedTo === q.attachedTo)
        && (!q.space || m.space === q.space)
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
    return Effect.succeed((id ?? "new-channel-id") as Ref<Doc>)
  }) as HulyClientOperations["createDoc"]

  const updateDocImpl: HulyClientOperations["updateDoc"] = (
    (_class: unknown, _space: unknown, _objectId: unknown, operations: unknown) => {
      if (config.captureUpdateDoc) {
        config.captureUpdateDoc.operations = operations as Record<string, unknown>
      }
      return Effect.succeed({})
    }
  ) as HulyClientOperations["updateDoc"]

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
    return Effect.succeed((id ?? "new-msg-id") as Ref<Doc>)
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
    updateDoc: updateDocImpl,
    addCollection: addCollectionImpl,
    removeDoc: removeDocImpl
  })
}

describe("listChannels", () => {
  // test-revizorro: approved
  it.effect("returns channels sorted by name", () =>
    Effect.gen(function*() {
      const channels = [
        makeChannel({ _id: "ch-2" as Ref<HulyChannel>, name: "zebra" }),
        makeChannel({ _id: "ch-1" as Ref<HulyChannel>, name: "alpha" })
      ]

      const testLayer = createTestLayerWithMocks({ channels })

      const result = yield* listChannels({}).pipe(Effect.provide(testLayer))

      expect(result).toHaveLength(2)
      expect(result[0].name).toBe("alpha")
      expect(result[1].name).toBe("zebra")
    }))

  // test-revizorro: approved
  it.effect("excludes archived channels by default", () =>
    Effect.gen(function*() {
      const captureQuery: MockConfig["captureChannelQuery"] = {}

      const testLayer = createTestLayerWithMocks({
        channels: [],
        captureChannelQuery: captureQuery
      })

      yield* listChannels({}).pipe(Effect.provide(testLayer))

      expect(captureQuery.query?.archived).toBe(false)
    }))

  // test-revizorro: approved
  it.effect("includes archived channels when requested", () =>
    Effect.gen(function*() {
      const captureQuery: MockConfig["captureChannelQuery"] = {}

      const testLayer = createTestLayerWithMocks({
        channels: [],
        captureChannelQuery: captureQuery
      })

      yield* listChannels({ includeArchived: true }).pipe(Effect.provide(testLayer))

      expect(captureQuery.query?.archived).toBeUndefined()
    }))

  // test-revizorro: approved
  it.effect("uses default limit of 50", () =>
    Effect.gen(function*() {
      const captureQuery: MockConfig["captureChannelQuery"] = {}

      const testLayer = createTestLayerWithMocks({
        channels: [],
        captureChannelQuery: captureQuery
      })

      yield* listChannels({}).pipe(Effect.provide(testLayer))

      expect(captureQuery.options?.limit).toBe(50)
    }))

  // test-revizorro: approved
  it.effect("enforces max limit of 200", () =>
    Effect.gen(function*() {
      const captureQuery: MockConfig["captureChannelQuery"] = {}

      const testLayer = createTestLayerWithMocks({
        channels: [],
        captureChannelQuery: captureQuery
      })

      yield* listChannels({ limit: 500 }).pipe(Effect.provide(testLayer))

      expect(captureQuery.options?.limit).toBe(200)
    }))

  // test-revizorro: approved
  it.effect("maps channel fields correctly", () =>
    Effect.gen(function*() {
      const channel = makeChannel({
        _id: "ch-1" as Ref<HulyChannel>,
        name: "general",
        topic: "General chat",
        private: true,
        archived: false,
        members: ["person-1" as AccountUuid, "person-2" as AccountUuid],
        messages: 42,
        modifiedOn: 1706500000000
      })

      const testLayer = createTestLayerWithMocks({ channels: [channel] })

      const result = yield* listChannels({}).pipe(Effect.provide(testLayer))

      expect(result[0]).toEqual({
        id: "ch-1",
        name: "general",
        topic: "General chat",
        private: true,
        archived: false,
        members: 2,
        messages: 42,
        modifiedOn: 1706500000000
      })
    }))
})

describe("getChannel", () => {
  // test-revizorro: approved
  it.effect("returns channel by name", () =>
    Effect.gen(function*() {
      const channel = makeChannel({
        _id: "ch-1" as Ref<HulyChannel>,
        name: "development",
        topic: "Dev talk",
        description: "Development channel",
        private: false,
        archived: false,
        members: [],
        messages: 10,
        modifiedOn: 1706500000000,
        createdOn: 1706400000000
      })

      const testLayer = createTestLayerWithMocks({ channels: [channel] })

      const result = yield* getChannel({ channel: channelIdentifier("development") }).pipe(Effect.provide(testLayer))

      expect(result.id).toBe("ch-1")
      expect(result.name).toBe("development")
      expect(result.topic).toBe("Dev talk")
      expect(result.description).toBe("Development channel")
      expect(result.private).toBe(false)
      expect(result.archived).toBe(false)
      expect(result.messages).toBe(10)
      expect(result.modifiedOn).toBe(1706500000000)
      expect(result.createdOn).toBe(1706400000000)
    }))

  // test-revizorro: approved
  it.effect("returns channel by ID", () =>
    Effect.gen(function*() {
      const channel = makeChannel({
        _id: "ch-special-id" as Ref<HulyChannel>,
        name: "random"
      })

      const testLayer = createTestLayerWithMocks({ channels: [channel] })

      const result = yield* getChannel({ channel: channelIdentifier("ch-special-id") }).pipe(Effect.provide(testLayer))

      expect(result.id).toBe("ch-special-id")
      expect(result.name).toBe("random")
    }))

  // test-revizorro: approved
  it.effect("returns ChannelNotFoundError when channel doesn't exist", () =>
    Effect.gen(function*() {
      const testLayer = createTestLayerWithMocks({ channels: [] })

      const error = yield* Effect.flip(
        getChannel({ channel: channelIdentifier("nonexistent") }).pipe(Effect.provide(testLayer))
      )

      expect(error._tag).toBe("ChannelNotFoundError")
      expect((error as ChannelNotFoundError).identifier).toBe("nonexistent")
    }))

  // test-revizorro: approved
  it.effect("resolves member names", () =>
    Effect.gen(function*() {
      const channel = makeChannel({
        _id: "ch-1" as Ref<HulyChannel>,
        name: "team",
        members: ["account-1" as AccountUuid, "account-2" as AccountUuid]
      })
      const employees = [
        makeEmployee({ _id: "emp-1" as Ref<HulyEmployee>, name: "Alice", personUuid: "account-1" as AccountUuid }),
        makeEmployee({ _id: "emp-2" as Ref<HulyEmployee>, name: "Bob", personUuid: "account-2" as AccountUuid })
      ]

      const testLayer = createTestLayerWithMocks({ channels: [channel], employees })

      const result = yield* getChannel({ channel: channelIdentifier("team") }).pipe(Effect.provide(testLayer))

      expect(result.members).toEqual(["Alice", "Bob"])
    }))
})

describe("createChannel", () => {
  // test-revizorro: approved
  it.effect("creates channel with minimal params", () =>
    Effect.gen(function*() {
      const captureCreateDoc: MockConfig["captureCreateDoc"] = {}

      const testLayer = createTestLayerWithMocks({ captureCreateDoc })

      const result = yield* createChannel({ name: "new-channel" }).pipe(Effect.provide(testLayer))

      expect(result.name).toBe("new-channel")
      expect(captureCreateDoc.attributes?.name).toBe("new-channel")
      expect(captureCreateDoc.attributes?.private).toBe(false)
      expect(captureCreateDoc.attributes?.archived).toBe(false)
      expect(captureCreateDoc.attributes?.members).toEqual(["test-account-uuid"])
      expect(captureCreateDoc.attributes?.owners).toEqual(["test-account-uuid"])
    }))

  // test-revizorro: approved
  it.effect("creates channel with topic and private flag", () =>
    Effect.gen(function*() {
      const captureCreateDoc: MockConfig["captureCreateDoc"] = {}

      const testLayer = createTestLayerWithMocks({ captureCreateDoc })

      const result = yield* createChannel({
        name: "private-channel",
        topic: "Secret discussions",
        private: true
      }).pipe(Effect.provide(testLayer))

      expect(result.name).toBe("private-channel")
      expect(captureCreateDoc.attributes?.topic).toBe("Secret discussions")
      expect(captureCreateDoc.attributes?.private).toBe(true)
    }))
})

describe("updateChannel", () => {
  // test-revizorro: approved
  it.effect("updates channel name", () =>
    Effect.gen(function*() {
      const channel = makeChannel({ _id: "ch-1" as Ref<HulyChannel>, name: "old-name" })
      const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}

      const testLayer = createTestLayerWithMocks({ channels: [channel], captureUpdateDoc })

      const result = yield* updateChannel({
        channel: channelIdentifier("old-name"),
        name: "new-name"
      }).pipe(Effect.provide(testLayer))

      expect(result.id).toBe("ch-1")
      expect(result.updated).toBe(true)
      expect(captureUpdateDoc.operations?.name).toBe("new-name")
    }))

  // test-revizorro: approved
  it.effect("updates channel topic", () =>
    Effect.gen(function*() {
      const channel = makeChannel({ _id: "ch-1" as Ref<HulyChannel>, name: "general" })
      const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}

      const testLayer = createTestLayerWithMocks({ channels: [channel], captureUpdateDoc })

      const result = yield* updateChannel({
        channel: channelIdentifier("general"),
        topic: "New topic"
      }).pipe(Effect.provide(testLayer))

      expect(result.id).toBe("ch-1")
      expect(result.updated).toBe(true)
      expect(captureUpdateDoc.operations?.topic).toBe("New topic")
    }))

  // test-revizorro: approved
  it.effect("returns updated=false when no fields provided", () =>
    Effect.gen(function*() {
      const channel = makeChannel({ _id: "ch-1" as Ref<HulyChannel>, name: "general" })

      const testLayer = createTestLayerWithMocks({ channels: [channel] })

      const result = yield* updateChannel({ channel: channelIdentifier("general") }).pipe(Effect.provide(testLayer))

      expect(result.updated).toBe(false)
    }))

  // test-revizorro: approved
  it.effect("returns ChannelNotFoundError when channel doesn't exist", () =>
    Effect.gen(function*() {
      const testLayer = createTestLayerWithMocks({ channels: [] })

      const error = yield* Effect.flip(
        updateChannel({ channel: channelIdentifier("nonexistent"), name: "new" }).pipe(Effect.provide(testLayer))
      )

      expect(error._tag).toBe("ChannelNotFoundError")
      expect((error as ChannelNotFoundError).identifier).toBe("nonexistent")
    }))
})

describe("deleteChannel", () => {
  // test-revizorro: approved
  it.effect("deletes channel", () =>
    Effect.gen(function*() {
      const channel = makeChannel({ _id: "ch-1" as Ref<HulyChannel>, name: "to-delete" })
      const captureRemoveDoc: MockConfig["captureRemoveDoc"] = {}

      const testLayer = createTestLayerWithMocks({ channels: [channel], captureRemoveDoc })

      const result = yield* deleteChannel({ channel: channelIdentifier("to-delete") }).pipe(Effect.provide(testLayer))

      expect(result.id).toBe("ch-1")
      expect(result.deleted).toBe(true)
      expect(captureRemoveDoc.called).toBe(true)
    }))

  // test-revizorro: approved
  it.effect("returns ChannelNotFoundError when channel doesn't exist", () =>
    Effect.gen(function*() {
      const testLayer = createTestLayerWithMocks({ channels: [] })

      const error = yield* Effect.flip(
        deleteChannel({ channel: channelIdentifier("nonexistent") }).pipe(Effect.provide(testLayer))
      )

      expect(error._tag).toBe("ChannelNotFoundError")
    }))
})

describe("listChannelMessages", () => {
  // test-revizorro: approved
  it.effect("returns messages sorted by creation date descending", () =>
    Effect.gen(function*() {
      const channel = makeChannel({ _id: "ch-1" as Ref<HulyChannel>, name: "general" })
      const messages = [
        makeChatMessage({
          _id: "msg-1" as Ref<ChatMessage>,
          space: "ch-1" as Ref<Space>,
          createdOn: 1000
        }),
        makeChatMessage({
          _id: "msg-2" as Ref<ChatMessage>,
          space: "ch-1" as Ref<Space>,
          createdOn: 2000
        })
      ]

      const testLayer = createTestLayerWithMocks({ channels: [channel], messages })

      const result = yield* listChannelMessages({ channel: channelIdentifier("general") }).pipe(
        Effect.provide(testLayer)
      )

      expect(result.messages).toHaveLength(2)
      expect(result.messages[0].id).toBe("msg-2")
      expect(result.messages[1].id).toBe("msg-1")
    }))

  // test-revizorro: approved
  it.effect("resolves sender names via buildSocialIdToPersonNameMap", () =>
    Effect.gen(function*() {
      const channel = makeChannel({ _id: "ch-1" as Ref<HulyChannel>, name: "general" })
      const messages = [
        makeChatMessage({
          _id: "msg-1" as Ref<ChatMessage>,
          space: "ch-1" as Ref<Space>,
          modifiedBy: "social-alice" as PersonId,
          createdOn: 1000
        }),
        makeChatMessage({
          _id: "msg-2" as Ref<ChatMessage>,
          space: "ch-1" as Ref<Space>,
          modifiedBy: "social-bob" as PersonId,
          createdOn: 2000
        }),
        makeChatMessage({
          _id: "msg-3" as Ref<ChatMessage>,
          space: "ch-1" as Ref<Space>,
          modifiedBy: "social-unknown" as PersonId,
          createdOn: 3000
        })
      ]
      const persons = [
        makePerson({ _id: "person-alice" as Ref<Person>, name: "Alice Smith" }),
        makePerson({ _id: "person-bob" as Ref<Person>, name: "Bob Jones" })
      ]
      const socialIdentities = [
        makeSocialIdentity({
          _id: "social-alice" as Ref<SocialIdentity> & PersonId,
          attachedTo: "person-alice" as Ref<Person>
        }),
        makeSocialIdentity({
          _id: "social-bob" as Ref<SocialIdentity> & PersonId,
          attachedTo: "person-bob" as Ref<Person>
        })
      ]

      const testLayer = createTestLayerWithMocks({
        channels: [channel],
        messages,
        persons,
        socialIdentities
      })

      const result = yield* listChannelMessages({ channel: channelIdentifier("general") }).pipe(
        Effect.provide(testLayer)
      )

      expect(result.messages).toHaveLength(3)
      // Messages sorted by createdOn descending: 3000, 2000, 1000
      expect(result.messages[0].sender).toBeUndefined()
      expect(result.messages[0].senderId).toBe("social-unknown")
      expect(result.messages[1].sender).toBe("Bob Jones")
      expect(result.messages[1].senderId).toBe("social-bob")
      expect(result.messages[2].sender).toBe("Alice Smith")
      expect(result.messages[2].senderId).toBe("social-alice")
    }))

  // test-revizorro: approved
  it.effect("returns ChannelNotFoundError when channel doesn't exist", () =>
    Effect.gen(function*() {
      const testLayer = createTestLayerWithMocks({ channels: [] })

      const error = yield* Effect.flip(
        listChannelMessages({ channel: channelIdentifier("nonexistent") }).pipe(Effect.provide(testLayer))
      )

      expect(error._tag).toBe("ChannelNotFoundError")
    }))
})

describe("sendChannelMessage", () => {
  // test-revizorro: approved
  it.effect("sends message to channel", () =>
    Effect.gen(function*() {
      const channel = makeChannel({ _id: "ch-1" as Ref<HulyChannel>, name: "general" })
      const captureAddCollection: MockConfig["captureAddCollection"] = {}

      const testLayer = createTestLayerWithMocks({ channels: [channel], captureAddCollection })

      const result = yield* sendChannelMessage({
        channel: channelIdentifier("general"),
        body: "Hello world!"
      }).pipe(Effect.provide(testLayer))

      expect(result.channelId).toBe("ch-1")
      expect(captureAddCollection.attributes).toBeDefined()
    }))

  // test-revizorro: approved
  it.effect("returns ChannelNotFoundError when channel doesn't exist", () =>
    Effect.gen(function*() {
      const testLayer = createTestLayerWithMocks({ channels: [] })

      const error = yield* Effect.flip(
        sendChannelMessage({ channel: channelIdentifier("nonexistent"), body: "Hello" }).pipe(Effect.provide(testLayer))
      )

      expect(error._tag).toBe("ChannelNotFoundError")
    }))
})

describe("updateChannelMessage", () => {
  it.effect("updates channel message", () =>
    Effect.gen(function*() {
      const channel = makeChannel({ _id: "ch-1" as Ref<HulyChannel>, name: "general" })
      const message = makeChatMessage({
        _id: "msg-1" as Ref<ChatMessage>,
        space: "ch-1" as Ref<Space>
      })
      const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}

      const testLayer = createTestLayerWithMocks({
        channels: [channel],
        messages: [message],
        captureUpdateDoc
      })

      const result = yield* updateChannelMessage({
        channel: channelIdentifier("general"),
        messageId: messageBrandId("msg-1"),
        body: "Updated content"
      }).pipe(Effect.provide(testLayer))

      expect(result.id).toBe("msg-1")
      expect(result.updated).toBe(true)
      expect(captureUpdateDoc.operations).toBeDefined()
    }))

  it.effect("returns MessageNotFoundError when message doesn't exist", () =>
    Effect.gen(function*() {
      const channel = makeChannel({ _id: "ch-1" as Ref<HulyChannel>, name: "general" })

      const testLayer = createTestLayerWithMocks({
        channels: [channel],
        messages: []
      })

      const error = yield* Effect.flip(
        updateChannelMessage({
          channel: channelIdentifier("general"),
          messageId: messageBrandId("nonexistent"),
          body: "Updated"
        }).pipe(Effect.provide(testLayer))
      )

      expect(error._tag).toBe("MessageNotFoundError")
      expect((error as MessageNotFoundError).messageId).toBe("nonexistent")
    }))

  it.effect("returns ChannelNotFoundError when channel doesn't exist", () =>
    Effect.gen(function*() {
      const testLayer = createTestLayerWithMocks({ channels: [] })

      const error = yield* Effect.flip(
        updateChannelMessage({
          channel: channelIdentifier("nonexistent"),
          messageId: messageBrandId("msg-1"),
          body: "Updated"
        }).pipe(Effect.provide(testLayer))
      )

      expect(error._tag).toBe("ChannelNotFoundError")
    }))
})

describe("deleteChannelMessage", () => {
  it.effect("deletes channel message", () =>
    Effect.gen(function*() {
      const channel = makeChannel({ _id: "ch-1" as Ref<HulyChannel>, name: "general" })
      const message = makeChatMessage({
        _id: "msg-1" as Ref<ChatMessage>,
        space: "ch-1" as Ref<Space>
      })
      const captureRemoveDoc: MockConfig["captureRemoveDoc"] = {}

      const testLayer = createTestLayerWithMocks({
        channels: [channel],
        messages: [message],
        captureRemoveDoc
      })

      const result = yield* deleteChannelMessage({
        channel: channelIdentifier("general"),
        messageId: messageBrandId("msg-1")
      }).pipe(Effect.provide(testLayer))

      expect(result.id).toBe("msg-1")
      expect(result.deleted).toBe(true)
      expect(captureRemoveDoc.called).toBe(true)
    }))

  it.effect("returns MessageNotFoundError when message doesn't exist", () =>
    Effect.gen(function*() {
      const channel = makeChannel({ _id: "ch-1" as Ref<HulyChannel>, name: "general" })

      const testLayer = createTestLayerWithMocks({
        channels: [channel],
        messages: []
      })

      const error = yield* Effect.flip(
        deleteChannelMessage({
          channel: channelIdentifier("general"),
          messageId: messageBrandId("nonexistent")
        }).pipe(Effect.provide(testLayer))
      )

      expect(error._tag).toBe("MessageNotFoundError")
    }))
})

describe("listDirectMessages", () => {
  // test-revizorro: approved
  it.effect("returns DM conversations sorted by modification date descending", () =>
    Effect.gen(function*() {
      const dms = [
        makeDirectMessage({
          _id: "dm-1" as Ref<DirectMessage>,
          modifiedOn: 1000
        }),
        makeDirectMessage({
          _id: "dm-2" as Ref<DirectMessage>,
          modifiedOn: 2000
        })
      ]

      const testLayer = createTestLayerWithMocks({ directMessages: dms })

      const result = yield* listDirectMessages({}).pipe(Effect.provide(testLayer))

      expect(result.conversations).toHaveLength(2)
      expect(result.conversations[0].id).toBe("dm-2")
      expect(result.conversations[1].id).toBe("dm-1")
    }))

  // test-revizorro: approved
  it.effect("resolves participant names", () =>
    Effect.gen(function*() {
      const dm = makeDirectMessage({
        _id: "dm-1" as Ref<DirectMessage>,
        members: ["account-1" as AccountUuid, "account-2" as AccountUuid]
      })
      const employees = [
        makeEmployee({ _id: "emp-1" as Ref<HulyEmployee>, name: "Alice", personUuid: "account-1" as AccountUuid }),
        makeEmployee({ _id: "emp-2" as Ref<HulyEmployee>, name: "Bob", personUuid: "account-2" as AccountUuid })
      ]

      const testLayer = createTestLayerWithMocks({ directMessages: [dm], employees })

      const result = yield* listDirectMessages({}).pipe(Effect.provide(testLayer))

      expect(result.conversations[0].participants).toEqual(["Alice", "Bob"])
      expect(result.conversations[0].participantIds).toEqual(["account-1", "account-2"])
    }))
})

describe("listThreadReplies", () => {
  // test-revizorro: approved
  it.effect("returns thread replies sorted by creation date ascending", () =>
    Effect.gen(function*() {
      const channel = makeChannel({ _id: "ch-1" as Ref<HulyChannel>, name: "general" })
      const parentMsg = makeChatMessage({
        _id: "msg-1" as Ref<ChatMessage>,
        space: "ch-1" as Ref<Space>
      })
      const threadMsgs = [
        makeThreadMessage({
          _id: "reply-2" as Ref<HulyThreadMessage>,
          space: "ch-1" as Ref<Space>,
          attachedTo: "msg-1" as Ref<ActivityMessage>,
          message: "<p>Second reply</p>",
          modifiedBy: "user-2" as PersonId,
          createdOn: 2000,
          modifiedOn: 2500
        }),
        makeThreadMessage({
          _id: "reply-1" as Ref<HulyThreadMessage>,
          space: "ch-1" as Ref<Space>,
          attachedTo: "msg-1" as Ref<ActivityMessage>,
          message: "<p>First reply</p>",
          modifiedBy: "user-1" as PersonId,
          createdOn: 1000,
          modifiedOn: 1500
        })
      ]

      const testLayer = createTestLayerWithMocks({
        channels: [channel],
        messages: [parentMsg],
        threadMessages: threadMsgs
      })

      const result = yield* listThreadReplies({
        channel: channelIdentifier("general"),
        messageId: messageBrandId("msg-1")
      }).pipe(Effect.provide(testLayer))

      expect(result.replies).toHaveLength(2)
      expect(result.replies[0].id).toBe("reply-1")
      expect(result.replies[0].body).toContain("First reply")
      expect(result.replies[0].senderId).toBe("user-1")
      expect(result.replies[0].sender).toBeUndefined()
      expect(result.replies[0].createdOn).toBe(1000)
      expect(result.replies[0].modifiedOn).toBe(1500)
      expect(result.replies[1].id).toBe("reply-2")
      expect(result.replies[1].body).toContain("Second reply")
      expect(result.replies[1].senderId).toBe("user-2")
      expect(result.replies[1].createdOn).toBe(2000)
      expect(result.replies[1].modifiedOn).toBe(2500)
    }))

  // test-revizorro: approved
  it.effect("returns MessageNotFoundError when message doesn't exist", () =>
    Effect.gen(function*() {
      const channel = makeChannel({ _id: "ch-1" as Ref<HulyChannel>, name: "general" })

      const testLayer = createTestLayerWithMocks({
        channels: [channel],
        messages: []
      })

      const error = yield* Effect.flip(
        listThreadReplies({
          channel: channelIdentifier("general"),
          messageId: messageBrandId("nonexistent")
        }).pipe(Effect.provide(testLayer))
      )

      expect(error._tag).toBe("MessageNotFoundError")
      expect((error as MessageNotFoundError).messageId).toBe("nonexistent")
    }))

  // test-revizorro: approved
  it.effect("returns ChannelNotFoundError when channel doesn't exist", () =>
    Effect.gen(function*() {
      const testLayer = createTestLayerWithMocks({ channels: [] })

      const error = yield* Effect.flip(
        listThreadReplies({
          channel: channelIdentifier("nonexistent"),
          messageId: messageBrandId("msg-1")
        }).pipe(Effect.provide(testLayer))
      )

      expect(error._tag).toBe("ChannelNotFoundError")
    }))
})

describe("addThreadReply", () => {
  // test-revizorro: approved
  it.effect("adds reply to message thread", () =>
    Effect.gen(function*() {
      const channel = makeChannel({ _id: "ch-1" as Ref<HulyChannel>, name: "general" })
      const parentMsg = makeChatMessage({
        _id: "msg-1" as Ref<ChatMessage>,
        space: "ch-1" as Ref<Space>
      })
      const captureAddCollection: MockConfig["captureAddCollection"] = {}

      const testLayer = createTestLayerWithMocks({
        channels: [channel],
        messages: [parentMsg],
        captureAddCollection
      })

      const result = yield* addThreadReply({
        channel: channelIdentifier("general"),
        messageId: messageBrandId("msg-1"),
        body: "This is a reply"
      }).pipe(Effect.provide(testLayer))

      expect(result.messageId).toBe("msg-1")
      expect(result.channelId).toBe("ch-1")
      expect(captureAddCollection.attributes).toBeDefined()
    }))

  // test-revizorro: approved
  it.effect("returns MessageNotFoundError when message doesn't exist", () =>
    Effect.gen(function*() {
      const channel = makeChannel({ _id: "ch-1" as Ref<HulyChannel>, name: "general" })

      const testLayer = createTestLayerWithMocks({
        channels: [channel],
        messages: []
      })

      const error = yield* Effect.flip(
        addThreadReply({
          channel: channelIdentifier("general"),
          messageId: messageBrandId("nonexistent"),
          body: "Reply"
        }).pipe(Effect.provide(testLayer))
      )

      expect(error._tag).toBe("MessageNotFoundError")
    }))
})

describe("updateThreadReply", () => {
  // test-revizorro: approved
  it.effect("updates thread reply", () =>
    Effect.gen(function*() {
      const channel = makeChannel({ _id: "ch-1" as Ref<HulyChannel>, name: "general" })
      const parentMsg = makeChatMessage({
        _id: "msg-1" as Ref<ChatMessage>,
        space: "ch-1" as Ref<Space>
      })
      const reply = makeThreadMessage({
        _id: "reply-1" as Ref<HulyThreadMessage>,
        space: "ch-1" as Ref<Space>,
        attachedTo: "msg-1" as Ref<ActivityMessage>
      })
      const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}

      const testLayer = createTestLayerWithMocks({
        channels: [channel],
        messages: [parentMsg],
        threadMessages: [reply],
        captureUpdateDoc
      })

      const result = yield* updateThreadReply({
        channel: channelIdentifier("general"),
        messageId: messageBrandId("msg-1"),
        replyId: threadReplyId("reply-1"),
        body: "Updated content"
      }).pipe(Effect.provide(testLayer))

      expect(result.id).toBe("reply-1")
      expect(result.updated).toBe(true)
      expect(captureUpdateDoc.operations).toBeDefined()
    }))

  // test-revizorro: approved
  it.effect("returns ThreadReplyNotFoundError when reply doesn't exist", () =>
    Effect.gen(function*() {
      const channel = makeChannel({ _id: "ch-1" as Ref<HulyChannel>, name: "general" })
      const parentMsg = makeChatMessage({
        _id: "msg-1" as Ref<ChatMessage>,
        space: "ch-1" as Ref<Space>
      })

      const testLayer = createTestLayerWithMocks({
        channels: [channel],
        messages: [parentMsg],
        threadMessages: []
      })

      const error = yield* Effect.flip(
        updateThreadReply({
          channel: channelIdentifier("general"),
          messageId: messageBrandId("msg-1"),
          replyId: threadReplyId("nonexistent"),
          body: "Updated"
        }).pipe(Effect.provide(testLayer))
      )

      expect(error._tag).toBe("ThreadReplyNotFoundError")
      expect((error as ThreadReplyNotFoundError).replyId).toBe("nonexistent")
    }))
})

describe("deleteThreadReply", () => {
  // test-revizorro: approved
  it.effect("deletes thread reply", () =>
    Effect.gen(function*() {
      const channel = makeChannel({ _id: "ch-1" as Ref<HulyChannel>, name: "general" })
      const parentMsg = makeChatMessage({
        _id: "msg-1" as Ref<ChatMessage>,
        space: "ch-1" as Ref<Space>
      })
      const reply = makeThreadMessage({
        _id: "reply-1" as Ref<HulyThreadMessage>,
        space: "ch-1" as Ref<Space>,
        attachedTo: "msg-1" as Ref<ActivityMessage>
      })
      const captureRemoveDoc: MockConfig["captureRemoveDoc"] = {}

      const testLayer = createTestLayerWithMocks({
        channels: [channel],
        messages: [parentMsg],
        threadMessages: [reply],
        captureRemoveDoc
      })

      const result = yield* deleteThreadReply({
        channel: channelIdentifier("general"),
        messageId: messageBrandId("msg-1"),
        replyId: threadReplyId("reply-1")
      }).pipe(Effect.provide(testLayer))

      expect(result.id).toBe("reply-1")
      expect(result.deleted).toBe(true)
      expect(captureRemoveDoc.called).toBe(true)
    }))

  // test-revizorro: approved
  it.effect("returns ThreadReplyNotFoundError when reply doesn't exist", () =>
    Effect.gen(function*() {
      const channel = makeChannel({ _id: "ch-1" as Ref<HulyChannel>, name: "general" })
      const parentMsg = makeChatMessage({
        _id: "msg-1" as Ref<ChatMessage>,
        space: "ch-1" as Ref<Space>
      })

      const testLayer = createTestLayerWithMocks({
        channels: [channel],
        messages: [parentMsg],
        threadMessages: []
      })

      const error = yield* Effect.flip(
        deleteThreadReply({
          channel: channelIdentifier("general"),
          messageId: messageBrandId("msg-1"),
          replyId: threadReplyId("nonexistent")
        }).pipe(Effect.provide(testLayer))
      )

      expect(error._tag).toBe("ThreadReplyNotFoundError")
    }))
})
