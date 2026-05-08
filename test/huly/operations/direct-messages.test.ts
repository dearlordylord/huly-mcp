import { describe, it } from "@effect/vitest"
import type { ChatMessage, DirectMessage as HulyDirectMessage } from "@hcengineering/chunter"
import type { Employee as HulyEmployee, Person, SocialIdentity } from "@hcengineering/contact"
import {
  type AccountUuid as HulyAccountUuid,
  type Doc,
  type PersonId,
  type Ref,
  SocialIdType,
  type Space,
  toFindResult
} from "@hcengineering/core"
import { Effect, Exit } from "effect"
import { expect } from "vitest"

import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import type {
  DirectMessageIdentifierAmbiguousError,
  DirectMessageNotFoundError,
  MessageNotFoundError
} from "../../../src/huly/errors.js"
import {
  deleteDirectMessage,
  findDirectMessage,
  listDirectMessageMessages,
  sendDirectMessage,
  updateDirectMessage
} from "../../../src/huly/operations/direct-messages.js"
import { directMessageIdentifier, messageBrandId } from "../../helpers/brands.js"

import { chunter, contact } from "../../../src/huly/huly-plugins.js"

// --- Factory helpers (mirror the channels.test.ts pattern, no module mocks) ---

const asEmployee = (v: unknown) => v as HulyEmployee
const asPerson = (v: unknown) => v as Person

const currentAccountUuid = "test-account-uuid" as HulyAccountUuid

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

interface MockConfig {
  directMessages?: Array<HulyDirectMessage>
  messages?: Array<ChatMessage>
  employees?: Array<HulyEmployee>
  persons?: Array<Person>
  socialIdentities?: Array<SocialIdentity>
  captureAddCollection?: { attributes?: Record<string, unknown>; id?: string }
  captureUpdateDoc?: { operations?: Record<string, unknown> }
  captureRemoveDoc?: { called?: boolean }
}

const createTestLayer = (config: MockConfig) => {
  const directMessages = config.directMessages ?? []
  const messages = config.messages ?? []
  const employees = config.employees ?? []
  const persons = config.persons ?? []
  const socialIdentities = config.socialIdentities ?? []

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
      const q = query as { _id?: { $in?: Array<Ref<Person>> } }
      if (q._id?.$in !== undefined) {
        const wanted = q._id.$in
        return Effect.succeed(toFindResult(persons.filter((p) => wanted.includes(p._id))))
      }
      return Effect.succeed(toFindResult(persons))
    }
    if (_class === contact.class.SocialIdentity) {
      const q = query as { _id?: { $in?: Array<PersonId> } }
      if (q._id?.$in !== undefined) {
        const wanted = q._id.$in
        return Effect.succeed(toFindResult(socialIdentities.filter((si) => wanted.includes(si._id))))
      }
      return Effect.succeed(toFindResult(socialIdentities))
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
    _space: unknown,
    _attributes: unknown,
    id?: unknown
  ) => Effect.succeed((id ?? "new-id") as Ref<Doc>)) as HulyClientOperations["createDoc"]

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
        members: ["account-other" as HulyAccountUuid]
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
      const accountUuid = "account-shannon" as HulyAccountUuid
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
        personUuid: "account-stranger" as HulyAccountUuid
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
      const otherAccountUuid = "account-other" as HulyAccountUuid
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
      const accountUuid = "account-shannon" as HulyAccountUuid
      const unrelatedAccountUuid = "account-unrelated" as HulyAccountUuid
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
      const accountUuid = "account-shannon" as HulyAccountUuid
      const extraAccountUuid = "account-extra" as HulyAccountUuid
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
      const firstAccountUuid = "account-first" as HulyAccountUuid
      const secondAccountUuid = "account-second" as HulyAccountUuid
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
      const accountUuid = "account-shannon" as HulyAccountUuid
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
      expect(result.messages[0].body).toBe("hi")
      expect(result.messages[0].sender).toBe("Kerr,Shannon")
    }))

  it.effect("omits sender when DM members do not cover the message author", () =>
    Effect.gen(function*() {
      const dm = makeDirectMessage({ _id: "dm-1" as Ref<HulyDirectMessage>, members: [currentAccountUuid] })
      const message = makeMessage({ space: "dm-1" as Ref<Space>, message: "anon" })
      const layer = createTestLayer({ directMessages: [dm], messages: [message] })

      const result = yield* listDirectMessageMessages({
        dm: directMessageIdentifier("dm-1")
      }).pipe(Effect.provide(layer))

      expect(result.messages[0].sender).toBeUndefined()
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
