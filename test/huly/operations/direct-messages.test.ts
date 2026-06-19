import { describe, it } from "@effect/vitest"
import type { ChatMessage, DirectMessage as HulyDirectMessage } from "@hcengineering/chunter"
import type {
  Channel as ContactChannel,
  Employee as HulyEmployee,
  Person,
  SocialIdentity
} from "@hcengineering/contact"
import {
  type AccountUuid as HulyAccountUuid,
  type Class,
  type Data,
  type Doc,
  type PersonId,
  type Ref,
  SocialIdType,
  type Space,
  toFindResult
} from "@hcengineering/core"
import { Effect, Exit } from "effect"
import { expect } from "vitest"
import { assertAt } from "../../../src/utils/assertions.js"

import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import type {
  DirectMessageIdentifierAmbiguousError,
  DirectMessageNotFoundError,
  MessageNotFoundError
} from "../../../src/huly/errors.js"
import {
  createDirectMessage,
  deleteDirectMessage,
  findDirectMessage,
  listDirectMessageMessages,
  sendDirectMessage,
  updateDirectMessage
} from "../../../src/huly/operations/direct-messages.js"
import { directMessageIdentifier, email, messageBrandId, personName } from "../../helpers/brands.js"

import { chunter, contact } from "../../../src/huly/huly-plugins.js"

// --- Factory helpers (mirror the channels.test.ts pattern, no module mocks) ---

const asEmployee = (v: unknown) => v as HulyEmployee
const asPerson = (v: unknown) => v as Person
const asContactChannel = (v: unknown) => v as ContactChannel

const currentAccountUuid = "00000000-0000-4000-8000-000000000000" as HulyAccountUuid

const makeDirectMessage = (overrides?: Partial<HulyDirectMessage>): HulyDirectMessage => {
  const result: HulyDirectMessage = {
    _id: "dm-1" as Ref<HulyDirectMessage>,
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

const makeMessage = (overrides?: Partial<ChatMessage>): ChatMessage => {
  const result: ChatMessage = {
    _id: "msg-1" as Ref<ChatMessage>,
    _class: chunter.class.ChatMessage,
    space: "dm-1" as Ref<Space>,
    attachedTo: "dm-1" as Ref<HulyDirectMessage>,
    attachedToClass: chunter.class.DirectMessage,
    collection: "messages",
    message: "hello",
    attachments: 0,
    modifiedBy: "user-1" as PersonId,
    modifiedOn: 0,
    createdBy: "user-1" as PersonId,
    createdOn: 0,
    ...overrides
  }
  return result
}

const makeEmployee = (overrides?: Partial<HulyEmployee>): HulyEmployee =>
  asEmployee({
    _id: "employee-1" as Ref<HulyEmployee>,
    _class: contact.mixin.Employee,
    space: "space-1" as Ref<Space>,
    name: "Kerr,Shannon",
    active: true,
    modifiedBy: "user-1" as PersonId,
    modifiedOn: 0,
    createdBy: "user-1" as PersonId,
    createdOn: 0,
    ...overrides
  })

const makePerson = (overrides?: Partial<Person>): Person =>
  asPerson({
    _id: "person-1" as Ref<Person>,
    _class: contact.class.Person,
    space: "space-1" as Ref<Space>,
    name: "Kerr,Shannon",
    city: "",
    modifiedBy: "user-1" as PersonId,
    modifiedOn: 0,
    createdBy: "user-1" as PersonId,
    createdOn: 0,
    ...overrides
  })

const makeSocialIdentity = (overrides?: Partial<SocialIdentity>): SocialIdentity => {
  const result: SocialIdentity = {
    // SocialIdentity._id is Ref<SocialIdentity> & PersonId in the SDK.
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

const makeContactChannel = (overrides?: Partial<ContactChannel>): ContactChannel =>
  asContactChannel({
    _id: "channel-1" as Ref<ContactChannel>,
    _class: contact.class.Channel,
    space: "space-1" as Ref<Space>,
    attachedTo: "person-1" as Ref<Person>,
    attachedToClass: contact.class.Person,
    collection: "channels",
    provider: contact.channelProvider.Email,
    value: "user@example.com",
    modifiedBy: "user-1" as PersonId,
    modifiedOn: 0,
    createdBy: "user-1" as PersonId,
    createdOn: 0,
    ...overrides
  })

interface MockConfig {
  directMessages?: Array<HulyDirectMessage>
  messages?: Array<ChatMessage>
  employees?: Array<HulyEmployee>
  persons?: Array<Person>
  socialIdentities?: Array<SocialIdentity>
  contactChannels?: Array<ContactChannel>
  captureAddCollection?: { attributes?: Record<string, unknown>; id?: string }
  captureUpdateDoc?: { operations?: Record<string, unknown> }
  captureRemoveDoc?: { called?: boolean }
  captureCreateDoc?: {
    class?: Ref<Class<Doc>>
    space?: Ref<Space>
    attributes?: Data<Doc>
    id?: string
  }
}

const createTestLayer = (config: MockConfig) => {
  const directMessages = config.directMessages ?? []
  const messages = config.messages ?? []
  const employees = config.employees ?? []
  const persons = config.persons ?? []
  const socialIdentities = config.socialIdentities ?? []
  const contactChannels = config.contactChannels ?? []

  const findAllImpl: HulyClientOperations["findAll"] = ((_class: unknown, query: unknown) => {
    if (_class === chunter.class.DirectMessage) {
      const q = query as { members?: HulyAccountUuid | { $in?: Array<HulyAccountUuid> } }
      let result = [...directMessages]
      if (q.members !== undefined) {
        if (typeof q.members === "string") {
          result = result.filter((dm) => dm.members.includes(q.members as HulyAccountUuid))
        } else if (q.members.$in !== undefined) {
          const wanted = q.members.$in
          result = result.filter((dm) => dm.members.some((m) => wanted.includes(m)))
        }
      }
      return Effect.succeed(toFindResult(result))
    }
    if (_class === chunter.class.ChatMessage) {
      const q = query as { space?: Ref<Space> }
      const filtered = q.space ? messages.filter((m) => m.space === q.space) : messages
      return Effect.succeed(toFindResult(filtered))
    }
    if (_class === contact.mixin.Employee) {
      const q = query as { name?: string; personUuid?: { $in?: Array<HulyAccountUuid> } }
      let result = [...employees]
      if (q.name !== undefined) {
        result = result.filter((e) => e.name === q.name)
      }
      if (q.personUuid?.$in !== undefined) {
        const wanted = q.personUuid.$in
        result = result.filter((e) => e.personUuid !== undefined && wanted.includes(e.personUuid))
      }
      return Effect.succeed(toFindResult(result))
    }
    if (_class === contact.class.Person) {
      const q = query as { _id?: { $in?: Array<Ref<Person>> }; name?: string }
      if (q._id?.$in !== undefined) {
        const wanted = q._id.$in
        return Effect.succeed(toFindResult(persons.filter((p) => wanted.includes(p._id))))
      }
      if (q.name !== undefined) {
        return Effect.succeed(toFindResult(persons.filter((p) => p.name === q.name)))
      }
      return Effect.succeed(toFindResult(persons))
    }
    if (_class === contact.class.Channel) {
      const q = query as {
        value?: string | { $like?: string }
        provider?: unknown
      }
      const result = contactChannels.filter((ch) => {
        if (q.provider !== undefined && ch.provider !== q.provider) return false
        if (typeof q.value === "string") return ch.value === q.value
        if (q.value?.$like !== undefined) {
          const needle = q.value.$like.replace(/^%|%$/g, "")
          return ch.value.includes(needle)
        }
        return true
      })
      return Effect.succeed(toFindResult(result))
    }
    if (_class === contact.class.SocialIdentity) {
      // Test double boundary: findAll receives opaque SDK query objects; this branch only handles
      // SocialIdentity query shapes issued by direct-message operations. Brands are erased at runtime.
      const q = query as { _id?: { $in?: Array<PersonId> }; type?: SocialIdType; value?: string }
      if (q._id?.$in !== undefined) {
        const wanted = q._id.$in
        return Effect.succeed(toFindResult(socialIdentities.filter((si) => wanted.includes(si._id))))
      }
      return Effect.succeed(toFindResult(socialIdentities.filter((s) =>
        (q.type === undefined || s.type === q.type)
        && (q.value === undefined || s.value === q.value)
      )))
    }
    return Effect.succeed(toFindResult([]))
  }) as HulyClientOperations["findAll"]

  const findOneImpl: HulyClientOperations["findOne"] = ((_class: unknown, query: unknown) => {
    if (_class === chunter.class.DirectMessage) {
      const q = query as { _id?: Ref<HulyDirectMessage>; members?: { $in?: Array<HulyAccountUuid> } }
      const found = directMessages.find((dm) => {
        if (q._id !== undefined) return dm._id === q._id
        if (q.members?.$in !== undefined) {
          const wanted = q.members.$in
          return dm.members.some((m) => wanted.includes(m))
        }
        return false
      })
      return Effect.succeed(found)
    }
    if (_class === chunter.class.ChatMessage) {
      const q = query as { _id?: Ref<ChatMessage>; space?: Ref<Space> }
      const found = messages.find((m) => (!q._id || m._id === q._id) && (!q.space || m.space === q.space))
      return Effect.succeed(found)
    }
    if (_class === contact.mixin.Employee) {
      const q = query as { _id?: Ref<HulyEmployee> }
      if (q._id === undefined) return Effect.succeed(undefined)
      return Effect.succeed(employees.find((e) => e._id === q._id))
    }
    if (_class === contact.class.Person) {
      const q = query as { _id?: Ref<Person>; name?: string | { $like?: string } }
      if (q._id !== undefined) {
        return Effect.succeed(persons.find((p) => p._id === q._id))
      }
      if (typeof q.name === "string") {
        return Effect.succeed(persons.find((p) => p.name === q.name))
      }
      if (q.name?.$like !== undefined) {
        const needle = q.name.$like.replace(/^%|%$/g, "")
        return Effect.succeed(persons.find((p) => p.name.includes(needle)))
      }
      return Effect.succeed(undefined)
    }
    if (_class === contact.class.Channel) {
      const q = query as {
        value?: string | { $like?: string }
        provider?: unknown
      }
      const channel = contactChannels.find((ch) => {
        if (q.provider !== undefined && ch.provider !== q.provider) return false
        if (typeof q.value === "string") return ch.value === q.value
        if (q.value?.$like !== undefined) {
          const needle = q.value.$like.replace(/^%|%$/g, "")
          return ch.value.includes(needle)
        }
        return false
      })
      return Effect.succeed(channel)
    }
    if (_class === contact.class.SocialIdentity) {
      const q = query as { type?: SocialIdType; value?: string }
      const si = socialIdentities.find((s) =>
        (q.type === undefined || s.type === q.type)
        && (q.value === undefined || s.value === q.value)
      )
      return Effect.succeed(si)
    }
    return Effect.succeed(undefined)
  }) as HulyClientOperations["findOne"]

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

  const updateDocImpl: HulyClientOperations["updateDoc"] = ((
    _class: unknown,
    _space: unknown,
    _objectId: unknown,
    operations: unknown
  ) => {
    if (config.captureUpdateDoc) {
      config.captureUpdateDoc.operations = operations as Record<string, unknown>
    }
    return Effect.succeed({})
  }) as HulyClientOperations["updateDoc"]

  const removeDocImpl: HulyClientOperations["removeDoc"] = ((
    _class: unknown,
    _space: unknown,
    _objectId: unknown
  ) => {
    if (config.captureRemoveDoc) {
      config.captureRemoveDoc.called = true
    }
    return Effect.succeed({})
  }) as HulyClientOperations["removeDoc"]

  const createDocImpl: HulyClientOperations["createDoc"] = ((
    _class: unknown,
    space: unknown,
    attributes: unknown,
    id?: unknown
  ) => {
    if (config.captureCreateDoc) {
      config.captureCreateDoc.class = _class as Ref<Class<Doc>>
      config.captureCreateDoc.space = space as Ref<Space>
      config.captureCreateDoc.attributes = attributes as Data<Doc>
      if (id !== undefined) {
        config.captureCreateDoc.id = id as string
      }
    }
    return Effect.succeed((id ?? "new-id") as Ref<Doc>)
  }) as HulyClientOperations["createDoc"]

  return HulyClient.testLayer({
    findAll: findAllImpl,
    findOne: findOneImpl,
    addCollection: addCollectionImpl,
    updateDoc: updateDocImpl,
    removeDoc: removeDocImpl,
    createDoc: createDocImpl
  })
}

// --- Tests ---

describe("findDirectMessage", () => {
  it.effect("resolves by DM _id", () =>
    Effect.gen(function*() {
      const dm = makeDirectMessage({
        _id: "dm-42" as Ref<HulyDirectMessage>,
        members: [currentAccountUuid]
      })
      const layer = createTestLayer({ directMessages: [dm] })

      const result = yield* findDirectMessage(directMessageIdentifier("dm-42")).pipe(Effect.provide(layer))

      expect(result.dm._id).toBe("dm-42")
    }))

  it.effect("does not resolve a DM _id when the authenticated account is not a member", () =>
    Effect.gen(function*() {
      const dm = makeDirectMessage({
        _id: "dm-42" as Ref<HulyDirectMessage>,
        members: ["00000000-0000-4000-8000-000000000099" as HulyAccountUuid]
      })
      const layer = createTestLayer({ directMessages: [dm] })

      const exit = yield* Effect.exit(findDirectMessage(directMessageIdentifier("dm-42")).pipe(Effect.provide(layer)))

      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) {
        expect(exit.cause.toString()).toContain("DirectMessageNotFoundError")
      }
    }))

  it.effect("resolves by participant display name via Employee.personUuid", () =>
    Effect.gen(function*() {
      const accountUuid = "00000000-0000-4000-8000-000000000010" as HulyAccountUuid
      const dm = makeDirectMessage({
        _id: "dm-named" as Ref<HulyDirectMessage>,
        members: [currentAccountUuid, accountUuid]
      })
      const employee = makeEmployee({
        name: "Kerr,Shannon",
        personUuid: accountUuid
      })
      const layer = createTestLayer({ directMessages: [dm], employees: [employee] })

      const result = yield* findDirectMessage(directMessageIdentifier("Kerr,Shannon")).pipe(Effect.provide(layer))

      expect(result.dm._id).toBe("dm-named")
    }))

  it.effect("fails with DirectMessageNotFoundError when name resolves to no Employee", () =>
    Effect.gen(function*() {
      const layer = createTestLayer({ directMessages: [], employees: [] })

      const exit = yield* Effect.exit(
        findDirectMessage(directMessageIdentifier("Nobody,Here")).pipe(Effect.provide(layer))
      )

      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) {
        const error = exit.cause.toString()
        expect(error).toContain("DirectMessageNotFoundError")
        expect(error).toContain("Nobody,Here")
      }
    }))

  it.effect("fails when Employee exists but no DM has that member", () =>
    Effect.gen(function*() {
      const employee = makeEmployee({
        name: "Solo,Stranger",
        personUuid: "00000000-0000-4000-8000-000000000011" as HulyAccountUuid
      })
      const layer = createTestLayer({ directMessages: [], employees: [employee] })

      const exit = yield* Effect.exit(
        findDirectMessage(directMessageIdentifier("Solo,Stranger")).pipe(Effect.provide(layer))
      )

      expect(Exit.isFailure(exit)).toBe(true)
    }))

  it.effect("ignores Employees with no personUuid during name resolution", () =>
    Effect.gen(function*() {
      const employeeNoUuid = asEmployee({
        _id: "employee-no-uuid" as Ref<HulyEmployee>,
        _class: contact.mixin.Employee,
        space: "space-1" as Ref<Space>,
        name: "Ghost,User",
        active: true,
        modifiedBy: "user-1" as PersonId,
        modifiedOn: 0,
        createdBy: "user-1" as PersonId,
        createdOn: 0
      })
      const layer = createTestLayer({ directMessages: [], employees: [employeeNoUuid] })

      const exit = yield* Effect.exit(
        findDirectMessage(directMessageIdentifier("Ghost,User")).pipe(Effect.provide(layer))
      )

      expect(Exit.isFailure(exit)).toBe(true)
    }))

  it.effect("does not resolve the authenticated user's own display name to an arbitrary DM", () =>
    Effect.gen(function*() {
      const otherAccountUuid = "00000000-0000-4000-8000-000000000099" as HulyAccountUuid
      const dm = makeDirectMessage({
        _id: "dm-other" as Ref<HulyDirectMessage>,
        members: [currentAccountUuid, otherAccountUuid]
      })
      const employee = makeEmployee({
        name: "Self,User",
        personUuid: currentAccountUuid
      })
      const layer = createTestLayer({ directMessages: [dm], employees: [employee] })

      const exit = yield* Effect.exit(
        findDirectMessage(directMessageIdentifier("Self,User")).pipe(Effect.provide(layer))
      )

      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) {
        expect(exit.cause.toString()).toContain("DirectMessageNotFoundError")
      }
    }))

  it.effect("does not resolve a participant name to a DM that excludes the authenticated account", () =>
    Effect.gen(function*() {
      const accountUuid = "00000000-0000-4000-8000-000000000010" as HulyAccountUuid
      const unrelatedAccountUuid = "00000000-0000-4000-8000-000000000012" as HulyAccountUuid
      const dm = makeDirectMessage({
        _id: "dm-unrelated" as Ref<HulyDirectMessage>,
        members: [unrelatedAccountUuid, accountUuid]
      })
      const employee = makeEmployee({
        name: "Kerr,Shannon",
        personUuid: accountUuid
      })
      const layer = createTestLayer({ directMessages: [dm], employees: [employee] })

      const exit = yield* Effect.exit(
        findDirectMessage(directMessageIdentifier("Kerr,Shannon")).pipe(Effect.provide(layer))
      )

      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) {
        expect(exit.cause.toString()).toContain("DirectMessageNotFoundError")
      }
    }))

  it.effect("does not resolve a participant name to a group DM", () =>
    Effect.gen(function*() {
      const accountUuid = "00000000-0000-4000-8000-000000000010" as HulyAccountUuid
      const extraAccountUuid = "00000000-0000-4000-8000-000000000013" as HulyAccountUuid
      const dm = makeDirectMessage({
        _id: "dm-group" as Ref<HulyDirectMessage>,
        members: [currentAccountUuid, accountUuid, extraAccountUuid]
      })
      const employee = makeEmployee({
        name: "Kerr,Shannon",
        personUuid: accountUuid
      })
      const layer = createTestLayer({ directMessages: [dm], employees: [employee] })

      const exit = yield* Effect.exit(
        findDirectMessage(directMessageIdentifier("Kerr,Shannon")).pipe(Effect.provide(layer))
      )

      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) {
        expect(exit.cause.toString()).toContain("DirectMessageNotFoundError")
      }
    }))

  it.effect("fails with ambiguity when duplicate display names each have a one-to-one DM", () =>
    Effect.gen(function*() {
      const firstAccountUuid = "00000000-0000-4000-8000-000000000014" as HulyAccountUuid
      const secondAccountUuid = "00000000-0000-4000-8000-000000000015" as HulyAccountUuid
      const firstDm = makeDirectMessage({
        _id: "dm-first" as Ref<HulyDirectMessage>,
        members: [currentAccountUuid, firstAccountUuid]
      })
      const secondDm = makeDirectMessage({
        _id: "dm-second" as Ref<HulyDirectMessage>,
        members: [currentAccountUuid, secondAccountUuid]
      })
      const firstEmployee = makeEmployee({
        _id: "employee-first" as Ref<HulyEmployee>,
        name: "Kerr,Shannon",
        personUuid: firstAccountUuid
      })
      const secondEmployee = makeEmployee({
        _id: "employee-second" as Ref<HulyEmployee>,
        name: "Kerr,Shannon",
        personUuid: secondAccountUuid
      })
      const layer = createTestLayer({
        directMessages: [firstDm, secondDm],
        employees: [firstEmployee, secondEmployee]
      })

      const exit: Exit.Exit<
        unknown,
        DirectMessageIdentifierAmbiguousError | DirectMessageNotFoundError | unknown
      > = yield* Effect.exit(findDirectMessage(directMessageIdentifier("Kerr,Shannon")).pipe(Effect.provide(layer)))

      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) {
        expect(exit.cause.toString()).toContain("DirectMessageIdentifierAmbiguousError")
      }
    }))
})

describe("listDirectMessageMessages", () => {
  it.effect("returns messages with sender names resolved from social identities", () =>
    Effect.gen(function*() {
      const accountUuid = "00000000-0000-4000-8000-000000000010" as HulyAccountUuid
      const socialId = "social-shannon" as Ref<SocialIdentity> & PersonId
      const dm = makeDirectMessage({
        _id: "dm-1" as Ref<HulyDirectMessage>,
        members: [currentAccountUuid, accountUuid]
      })
      const message = makeMessage({
        _id: "msg-1" as Ref<ChatMessage>,
        space: "dm-1" as Ref<Space>,
        message: "hi",
        modifiedBy: socialId
      })
      const person = makePerson({
        _id: "person-shannon" as Ref<Person>,
        name: "Kerr,Shannon"
      })
      const socialIdentity = makeSocialIdentity({
        _id: socialId,
        attachedTo: "person-shannon" as Ref<Person>
      })
      const layer = createTestLayer({
        directMessages: [dm],
        messages: [message],
        persons: [person],
        socialIdentities: [socialIdentity]
      })

      const result = yield* listDirectMessageMessages({
        dm: directMessageIdentifier("dm-1")
      }).pipe(Effect.provide(layer))

      expect(result.messages).toHaveLength(1)
      expect(assertAt(result.messages, 0).body).toBe("hi")
      expect(assertAt(result.messages, 0).sender).toBe("Kerr,Shannon")
    }))

  it.effect("omits sender when DM members do not cover the message author", () =>
    Effect.gen(function*() {
      const dm = makeDirectMessage({ _id: "dm-1" as Ref<HulyDirectMessage>, members: [currentAccountUuid] })
      const message = makeMessage({ space: "dm-1" as Ref<Space>, message: "anon" })
      const layer = createTestLayer({ directMessages: [dm], messages: [message] })

      const result = yield* listDirectMessageMessages({
        dm: directMessageIdentifier("dm-1")
      }).pipe(Effect.provide(layer))

      expect(assertAt(result.messages, 0).sender).toBeUndefined()
    }))

  it.effect("propagates DirectMessageNotFoundError for unknown identifier", () =>
    Effect.gen(function*() {
      const layer = createTestLayer({})

      const exit = yield* Effect.exit(
        listDirectMessageMessages({ dm: directMessageIdentifier("nope") }).pipe(Effect.provide(layer))
      )

      expect(Exit.isFailure(exit)).toBe(true)
    }))
})

describe("sendDirectMessage", () => {
  it.effect("addCollection is called with the DM as space and the message body as markup", () =>
    Effect.gen(function*() {
      const dm = makeDirectMessage({ _id: "dm-1" as Ref<HulyDirectMessage>, members: [currentAccountUuid] })
      const capture: MockConfig["captureAddCollection"] = {}
      const layer = createTestLayer({ directMessages: [dm], captureAddCollection: capture })

      const result = yield* sendDirectMessage({
        dm: directMessageIdentifier("dm-1"),
        body: "hello world"
      }).pipe(Effect.provide(layer))

      expect(result.dmId).toBe("dm-1")
      expect(typeof result.id).toBe("string")
      expect(capture.attributes?.message).toBeDefined()
    }))

  it.effect("fails when DM cannot be resolved", () =>
    Effect.gen(function*() {
      const layer = createTestLayer({})

      const exit = yield* Effect.exit(
        sendDirectMessage({
          dm: directMessageIdentifier("dm-missing"),
          body: "hi"
        }).pipe(Effect.provide(layer))
      )

      expect(Exit.isFailure(exit)).toBe(true)
    }))
})

describe("updateDirectMessage", () => {
  it.effect("updates an existing DM message body and stamps editedOn", () =>
    Effect.gen(function*() {
      const dm = makeDirectMessage({ _id: "dm-1" as Ref<HulyDirectMessage>, members: [currentAccountUuid] })
      const message = makeMessage({
        _id: "msg-1" as Ref<ChatMessage>,
        space: "dm-1" as Ref<Space>
      })
      const capture: MockConfig["captureUpdateDoc"] = {}
      const layer = createTestLayer({
        directMessages: [dm],
        messages: [message],
        captureUpdateDoc: capture
      })

      const result = yield* updateDirectMessage({
        dm: directMessageIdentifier("dm-1"),
        messageId: messageBrandId("msg-1"),
        body: "edited"
      }).pipe(Effect.provide(layer))

      expect(result.id).toBe("msg-1")
      expect(result.updated).toBe(true)
      expect(capture.operations).toBeDefined()
      expect(capture.operations?.message).toBeDefined()
      expect(capture.operations?.editedOn).toBeTypeOf("number")
    }))

  it.effect("fails with MessageNotFoundError when message id is unknown", () =>
    Effect.gen(function*() {
      const dm = makeDirectMessage({ _id: "dm-1" as Ref<HulyDirectMessage>, members: [currentAccountUuid] })
      const layer = createTestLayer({ directMessages: [dm], messages: [] })

      const exit: Exit.Exit<unknown, DirectMessageNotFoundError | MessageNotFoundError | unknown> = yield* Effect.exit(
        updateDirectMessage({
          dm: directMessageIdentifier("dm-1"),
          messageId: messageBrandId("missing"),
          body: "x"
        }).pipe(Effect.provide(layer))
      )

      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) {
        expect(exit.cause.toString()).toContain("MessageNotFoundError")
      }
    }))
})

describe("deleteDirectMessage", () => {
  it.effect("removeDoc is called for the resolved message", () =>
    Effect.gen(function*() {
      const dm = makeDirectMessage({ _id: "dm-1" as Ref<HulyDirectMessage>, members: [currentAccountUuid] })
      const message = makeMessage({
        _id: "msg-1" as Ref<ChatMessage>,
        space: "dm-1" as Ref<Space>
      })
      const capture: MockConfig["captureRemoveDoc"] = {}
      const layer = createTestLayer({
        directMessages: [dm],
        messages: [message],
        captureRemoveDoc: capture
      })

      const result = yield* deleteDirectMessage({
        dm: directMessageIdentifier("dm-1"),
        messageId: messageBrandId("msg-1")
      }).pipe(Effect.provide(layer))

      expect(result.deleted).toBe(true)
      expect(capture.called).toBe(true)
    }))

  it.effect("fails with MessageNotFoundError when message id is unknown", () =>
    Effect.gen(function*() {
      const dm = makeDirectMessage({ _id: "dm-1" as Ref<HulyDirectMessage>, members: [currentAccountUuid] })
      const layer = createTestLayer({ directMessages: [dm], messages: [] })

      const exit = yield* Effect.exit(
        deleteDirectMessage({
          dm: directMessageIdentifier("dm-1"),
          messageId: messageBrandId("missing")
        }).pipe(Effect.provide(layer))
      )

      expect(Exit.isFailure(exit)).toBe(true)
    }))
})

describe("createDirectMessage", () => {
  it.effect("returns existing one-to-one DM with created=false", () =>
    Effect.gen(function*() {
      const billAccount = "00000000-0000-4000-8000-000000000016" as HulyAccountUuid
      const billPerson = makePerson({ _id: "person-bill" as Ref<Person>, name: "Smith,Bill" })
      const billEmployee = makeEmployee({
        _id: "person-bill" as Ref<HulyEmployee>,
        name: "Smith,Bill",
        personUuid: billAccount
      })
      const existingDm = makeDirectMessage({
        _id: "dm-bill" as Ref<HulyDirectMessage>,
        members: [currentAccountUuid, billAccount]
      })
      const capture: MockConfig["captureCreateDoc"] = {}
      const layer = createTestLayer({
        directMessages: [existingDm],
        persons: [billPerson],
        employees: [billEmployee],
        captureCreateDoc: capture
      })

      const result = yield* createDirectMessage({ person: personName("Smith,Bill") }).pipe(Effect.provide(layer))

      expect(result.id).toBe("dm-bill")
      expect(result.created).toBe(false)
      expect(capture.id).toBeUndefined()
    }))

  it.effect("returns an existing DM whose members are stored in the opposite order", () =>
    Effect.gen(function*() {
      const billAccount = "00000000-0000-4000-8000-000000000016" as HulyAccountUuid
      const billPerson = makePerson({ _id: "person-bill" as Ref<Person>, name: "Smith,Bill" })
      const billEmployee = makeEmployee({
        _id: "person-bill" as Ref<HulyEmployee>,
        name: "Smith,Bill",
        personUuid: billAccount
      })
      const existingDm = makeDirectMessage({
        _id: "dm-bill" as Ref<HulyDirectMessage>,
        members: [billAccount, currentAccountUuid]
      })
      const capture: MockConfig["captureCreateDoc"] = {}
      const layer = createTestLayer({
        directMessages: [existingDm],
        persons: [billPerson],
        employees: [billEmployee],
        captureCreateDoc: capture
      })

      const result = yield* createDirectMessage({ person: personName("Smith,Bill") }).pipe(Effect.provide(layer))

      expect(result.id).toBe("dm-bill")
      expect(result.created).toBe(false)
      expect(capture.id).toBeUndefined()
    }))

  it.effect("creates a new one-to-one DM when none exists, with sorted members", () =>
    Effect.gen(function*() {
      const billAccount = "00000000-0000-4000-8000-000000000016" as HulyAccountUuid
      const billPerson = makePerson({ _id: "person-bill" as Ref<Person>, name: "Smith,Bill" })
      const billEmployee = makeEmployee({
        _id: "person-bill" as Ref<HulyEmployee>,
        name: "Smith,Bill",
        personUuid: billAccount
      })
      const capture: MockConfig["captureCreateDoc"] = {}
      const layer = createTestLayer({
        directMessages: [],
        persons: [billPerson],
        employees: [billEmployee],
        captureCreateDoc: capture
      })

      const result = yield* createDirectMessage({ person: personName("Smith,Bill") }).pipe(Effect.provide(layer))

      expect(result.created).toBe(true)
      expect(typeof result.id).toBe("string")
      expect(capture.class).toBe(chunter.class.DirectMessage)
      const attrs = capture.attributes as Data<HulyDirectMessage> | undefined
      expect(attrs?.private).toBe(true)
      expect(attrs?.archived).toBe(false)
      expect(attrs?.name).toBe("")
      expect(attrs?.members).toEqual([billAccount, currentAccountUuid].sort())
    }))

  it.effect("ignores group DMs when looking for an existing one-to-one", () =>
    Effect.gen(function*() {
      const billAccount = "00000000-0000-4000-8000-000000000016" as HulyAccountUuid
      const extraAccount = "00000000-0000-4000-8000-000000000013" as HulyAccountUuid
      const billPerson = makePerson({ _id: "person-bill" as Ref<Person>, name: "Smith,Bill" })
      const billEmployee = makeEmployee({
        _id: "person-bill" as Ref<HulyEmployee>,
        name: "Smith,Bill",
        personUuid: billAccount
      })
      const groupDm = makeDirectMessage({
        _id: "dm-group" as Ref<HulyDirectMessage>,
        members: [currentAccountUuid, billAccount, extraAccount]
      })
      const layer = createTestLayer({
        directMessages: [groupDm],
        persons: [billPerson],
        employees: [billEmployee]
      })

      const result = yield* createDirectMessage({ person: personName("Smith,Bill") }).pipe(Effect.provide(layer))

      expect(result.created).toBe(true)
      expect(result.id).not.toBe("dm-group")
    }))

  it.effect("resolves the participant by exact email social identity", () =>
    Effect.gen(function*() {
      const billAccount = "00000000-0000-4000-8000-000000000016" as HulyAccountUuid
      const billPerson = makePerson({ _id: "person-bill" as Ref<Person>, name: "Smith,Bill" })
      const billEmployee = makeEmployee({
        _id: "person-bill" as Ref<HulyEmployee>,
        name: "Smith,Bill",
        personUuid: billAccount
      })
      const billIdentity = makeSocialIdentity({
        attachedTo: "person-bill" as Ref<Person>,
        type: SocialIdType.EMAIL,
        value: "bill@example.com"
      })
      const layer = createTestLayer({
        persons: [billPerson],
        employees: [billEmployee],
        socialIdentities: [billIdentity]
      })

      const result = yield* createDirectMessage({ person: email("bill@example.com") }).pipe(Effect.provide(layer))

      expect(result.created).toBe(true)
    }))

  it.effect("resolves the participant by exact email contact channel", () =>
    Effect.gen(function*() {
      const billAccount = "00000000-0000-4000-8000-000000000016" as HulyAccountUuid
      const billPerson = makePerson({ _id: "person-bill" as Ref<Person>, name: "Smith,Bill" })
      const billEmployee = makeEmployee({
        _id: "person-bill" as Ref<HulyEmployee>,
        name: "Smith,Bill",
        personUuid: billAccount
      })
      const billChannel = makeContactChannel({
        attachedTo: "person-bill" as Ref<Person>,
        value: "bill@example.com"
      })
      const layer = createTestLayer({
        persons: [billPerson],
        employees: [billEmployee],
        contactChannels: [billChannel]
      })

      const result = yield* createDirectMessage({ person: email("bill@example.com") }).pipe(Effect.provide(layer))

      expect(result.created).toBe(true)
    }))

  it.effect("falls back to an email channel when a matching social identity points to no person", () =>
    Effect.gen(function*() {
      const billAccount = "00000000-0000-4000-8000-000000000016" as HulyAccountUuid
      const billPerson = makePerson({ _id: "person-bill" as Ref<Person>, name: "Smith,Bill" })
      const billEmployee = makeEmployee({
        _id: "person-bill" as Ref<HulyEmployee>,
        name: "Smith,Bill",
        personUuid: billAccount
      })
      const orphanIdentity = makeSocialIdentity({
        attachedTo: "person-orphan" as Ref<Person>,
        type: SocialIdType.EMAIL,
        value: "bill@example.com"
      })
      const billChannel = makeContactChannel({
        attachedTo: "person-bill" as Ref<Person>,
        value: "bill@example.com"
      })
      const layer = createTestLayer({
        persons: [billPerson],
        employees: [billEmployee],
        socialIdentities: [orphanIdentity],
        contactChannels: [billChannel]
      })

      const result = yield* createDirectMessage({ person: email("bill@example.com") }).pipe(Effect.provide(layer))

      expect(result.created).toBe(true)
    }))

  it.effect("does not resolve partial display-name matches", () =>
    Effect.gen(function*() {
      const billPerson = makePerson({ _id: "person-bill" as Ref<Person>, name: "Smith,Bill" })
      const billEmployee = makeEmployee({
        _id: "person-bill" as Ref<HulyEmployee>,
        name: "Smith,Bill",
        personUuid: "00000000-0000-4000-8000-000000000016" as HulyAccountUuid
      })
      const layer = createTestLayer({ persons: [billPerson], employees: [billEmployee] })

      const exit = yield* Effect.exit(
        createDirectMessage({ person: personName("Smith") }).pipe(Effect.provide(layer))
      )

      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) {
        expect(exit.cause.toString()).toContain("PersonNotFoundError")
      }
    }))

  it.effect("fails when an exact display name matches multiple persons", () =>
    Effect.gen(function*() {
      const firstPerson = makePerson({ _id: "person-first" as Ref<Person>, name: "Smith,Bill" })
      const secondPerson = makePerson({ _id: "person-second" as Ref<Person>, name: "Smith,Bill" })
      const layer = createTestLayer({ persons: [firstPerson, secondPerson] })

      const exit = yield* Effect.exit(
        createDirectMessage({ person: personName("Smith,Bill") }).pipe(Effect.provide(layer))
      )

      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) {
        expect(exit.cause.toString()).toContain("PersonIdentifierAmbiguousError")
      }
    }))

  it.effect("fails when exact email social identities match multiple persons", () =>
    Effect.gen(function*() {
      const firstPerson = makePerson({ _id: "person-first" as Ref<Person>, name: "Smith,Bill" })
      const secondPerson = makePerson({ _id: "person-second" as Ref<Person>, name: "Jones,Ada" })
      const firstIdentity = makeSocialIdentity({
        _id: "social-first" as Ref<SocialIdentity> & PersonId,
        attachedTo: "person-first" as Ref<Person>,
        type: SocialIdType.EMAIL,
        value: "shared@example.com"
      })
      const secondIdentity = makeSocialIdentity({
        _id: "social-second" as Ref<SocialIdentity> & PersonId,
        attachedTo: "person-second" as Ref<Person>,
        type: SocialIdType.EMAIL,
        value: "shared@example.com"
      })
      const layer = createTestLayer({
        persons: [firstPerson, secondPerson],
        socialIdentities: [firstIdentity, secondIdentity]
      })

      const exit = yield* Effect.exit(
        createDirectMessage({ person: email("shared@example.com") }).pipe(Effect.provide(layer))
      )

      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) {
        expect(exit.cause.toString()).toContain("PersonIdentifierAmbiguousError")
      }
    }))

  it.effect("fails when an exact email channel matches multiple persons", () =>
    Effect.gen(function*() {
      const firstPerson = makePerson({ _id: "person-first" as Ref<Person>, name: "Smith,Bill" })
      const secondPerson = makePerson({ _id: "person-second" as Ref<Person>, name: "Jones,Ada" })
      const firstChannel = makeContactChannel({
        _id: "channel-first" as Ref<ContactChannel>,
        attachedTo: "person-first" as Ref<Person>,
        value: "shared@example.com"
      })
      const secondChannel = makeContactChannel({
        _id: "channel-second" as Ref<ContactChannel>,
        attachedTo: "person-second" as Ref<Person>,
        value: "shared@example.com"
      })
      const layer = createTestLayer({
        persons: [firstPerson, secondPerson],
        contactChannels: [firstChannel, secondChannel]
      })

      const exit = yield* Effect.exit(
        createDirectMessage({ person: email("shared@example.com") }).pipe(Effect.provide(layer))
      )

      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) {
        expect(exit.cause.toString()).toContain("PersonIdentifierAmbiguousError")
      }
    }))

  it.effect("fails with CannotDirectMessageSelfError when identifier resolves to caller's account", () =>
    Effect.gen(function*() {
      const selfPerson = makePerson({ _id: "person-self" as Ref<Person>, name: "Kerr,Shannon" })
      const selfEmployee = makeEmployee({
        _id: "person-self" as Ref<HulyEmployee>,
        name: "Kerr,Shannon",
        personUuid: currentAccountUuid
      })
      const layer = createTestLayer({ persons: [selfPerson], employees: [selfEmployee] })

      const exit = yield* Effect.exit(
        createDirectMessage({ person: personName("Kerr,Shannon") }).pipe(Effect.provide(layer))
      )

      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) {
        expect(exit.cause.toString()).toContain("CannotDirectMessageSelfError")
      }
    }))

  it.effect("fails with PersonNotFoundError when identifier matches no person", () =>
    Effect.gen(function*() {
      const layer = createTestLayer({})

      const exit = yield* Effect.exit(
        createDirectMessage({ person: personName("Nobody,Here") }).pipe(Effect.provide(layer))
      )

      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) {
        expect(exit.cause.toString()).toContain("PersonNotFoundError")
      }
    }))

  it.effect("fails with PersonNotAnEmployeeError when person has no Employee mixin / personUuid", () =>
    Effect.gen(function*() {
      const externalPerson = makePerson({ _id: "person-ext" as Ref<Person>, name: "Outside,Contact" })
      // No Employee mixin row for this person.
      const layer = createTestLayer({ persons: [externalPerson], employees: [] })

      const exit = yield* Effect.exit(
        createDirectMessage({ person: personName("Outside,Contact") }).pipe(Effect.provide(layer))
      )

      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) {
        expect(exit.cause.toString()).toContain("PersonNotAnEmployeeError")
      }
    }))
})
