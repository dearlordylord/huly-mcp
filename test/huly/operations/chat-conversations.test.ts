import { describe, it } from "@effect/vitest"
import type { Channel as HulyChannel, DirectMessage as HulyDirectMessage } from "@hcengineering/chunter"
import type { Employee as HulyEmployee, Person, PersonSpace } from "@hcengineering/contact"
import {
  type AccountUuid as HulyAccountUuid,
  type Class,
  type Data,
  type Doc,
  type DocumentUpdate,
  type PersonId,
  type Ref,
  type Space,
  toFindResult
} from "@hcengineering/core"
import type { DocNotifyContext as HulyDocNotifyContext } from "@hcengineering/notification"
import { Effect, Exit } from "effect"
import { expect } from "vitest"
import { assertAt } from "../../../src/utils/assertions.js"

import { AccountUuid } from "../../../src/domain/schemas/shared.js"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import {
  addChannelMembers,
  archiveChannel,
  createGroupDirectMessage,
  joinChannel,
  leaveChannel,
  listChannelMembers,
  removeChannelMembers,
  setConversationClosed,
  setConversationStarred,
  unarchiveChannel
} from "../../../src/huly/operations/channels.js"
import { channelIdentifier, directMessageIdentifier, email, personName } from "../../helpers/brands.js"

import { chunter, contact, notification } from "../../../src/huly/huly-plugins.js"

const me = "00000000-0000-4000-8000-000000000000" as HulyAccountUuid
const accountA = "00000000-0000-4000-8000-00000000000a" as HulyAccountUuid
const accountB = "00000000-0000-4000-8000-00000000000b" as HulyAccountUuid

const asEmployee = (value: unknown) => value as HulyEmployee
const asPerson = (value: unknown) => value as Person
const asPersonSpace = (value: unknown) => value as PersonSpace

const makeChannel = (overrides?: Partial<HulyChannel>): HulyChannel => ({
  _id: "channel-1" as Ref<HulyChannel>,
  _class: chunter.class.Channel,
  space: "channel-1" as Ref<Space>,
  name: "general",
  topic: "",
  description: "",
  private: false,
  archived: false,
  members: [me],
  owners: [me],
  messages: 0,
  modifiedBy: "social-1" as PersonId,
  modifiedOn: 0,
  createdBy: "social-1" as PersonId,
  createdOn: 0,
  ...overrides
})

const makeDirectMessage = (overrides?: Partial<HulyDirectMessage>): HulyDirectMessage => ({
  _id: "dm-1" as Ref<HulyDirectMessage>,
  _class: chunter.class.DirectMessage,
  space: "dm-1" as Ref<Space>,
  name: "",
  description: "",
  private: true,
  archived: false,
  members: [me, accountA],
  messages: 0,
  modifiedBy: "social-1" as PersonId,
  modifiedOn: 0,
  createdBy: "social-1" as PersonId,
  createdOn: 0,
  ...overrides
})

const makePerson = (id: string, name: string): Person =>
  asPerson({
    _id: id as Ref<Person>,
    _class: contact.class.Person,
    space: "contacts" as Ref<Space>,
    name,
    city: "",
    modifiedBy: "social-1" as PersonId,
    modifiedOn: 0,
    createdBy: "social-1" as PersonId,
    createdOn: 0
  })

const makeEmployee = (id: string, name: string, personUuid: HulyAccountUuid): HulyEmployee =>
  asEmployee({
    ...makePerson(id, name),
    _class: contact.mixin.Employee,
    active: true,
    personUuid
  })

const makePersonSpace = (person: Ref<Person>): PersonSpace =>
  asPersonSpace({
    _id: "person-space-1" as Ref<PersonSpace>,
    _class: contact.class.PersonSpace,
    space: "person-space-1" as Ref<Space>,
    person,
    name: "person-space",
    description: "",
    private: true,
    archived: false,
    members: [me],
    modifiedBy: "social-1" as PersonId,
    modifiedOn: 0,
    createdBy: "social-1" as PersonId,
    createdOn: 0
  })

const makeContext = (overrides?: Partial<HulyDocNotifyContext>): HulyDocNotifyContext => ({
  _id: "ctx-1" as Ref<HulyDocNotifyContext>,
  _class: notification.class.DocNotifyContext,
  space: "person-space-1" as Ref<PersonSpace>,
  user: me,
  objectId: "channel-1" as Ref<Doc>,
  objectClass: chunter.class.Channel as Ref<Class<Doc>>,
  objectSpace: "channel-1" as Ref<Space>,
  isPinned: false,
  hidden: false,
  modifiedBy: "social-1" as PersonId,
  modifiedOn: 0,
  createdBy: "social-1" as PersonId,
  createdOn: 0,
  ...overrides
})

interface TestData {
  readonly channels?: Array<HulyChannel>
  readonly directMessages?: Array<HulyDirectMessage>
  readonly persons?: Array<Person>
  readonly employees?: Array<HulyEmployee>
  readonly ignoreEmployeePersonUuidFilter?: boolean
  readonly personSpaces?: Array<PersonSpace>
  readonly contexts?: Array<HulyDocNotifyContext>
}

const createLayer = (data: TestData) => {
  const channels = data.channels ?? []
  const directMessages = data.directMessages ?? []
  const persons = data.persons ?? []
  const employees = data.employees ?? []
  const personSpaces = data.personSpaces ?? []
  const contexts = data.contexts ?? []

  const findAll: HulyClientOperations["findAll"] = ((_class: unknown, query: unknown) => {
    if (_class === chunter.class.DirectMessage) {
      const q = query as { members?: HulyAccountUuid }
      const member = q.members
      return Effect.succeed(toFindResult(
        member === undefined ? directMessages : directMessages.filter((dm) => dm.members.includes(member))
      ))
    }
    if (_class === contact.mixin.Employee) {
      const q = query as { name?: string; personUuid?: { $in?: Array<HulyAccountUuid> } }
      let result = [...employees]
      if (q.name !== undefined) result = result.filter((employee) => employee.name === q.name)
      if (q.personUuid?.$in !== undefined && data.ignoreEmployeePersonUuidFilter !== true) {
        result = result.filter((employee) =>
          employee.personUuid !== undefined && q.personUuid?.$in?.includes(employee.personUuid) === true
        )
      }
      return Effect.succeed(toFindResult(result))
    }
    if (_class === contact.class.Person) {
      const q = query as { name?: string }
      return Effect.succeed(
        toFindResult(q.name === undefined ? persons : persons.filter((person) => person.name === q.name))
      )
    }
    return Effect.succeed(toFindResult([]))
  }) as HulyClientOperations["findAll"]

  const findOne: HulyClientOperations["findOne"] = ((_class: unknown, query: unknown) => {
    if (_class === chunter.class.Channel) {
      const q = query as { _id?: Ref<HulyChannel>; name?: string }
      return Effect.succeed(
        channels.find((channel) =>
          (q._id !== undefined && channel._id === q._id) || (q.name !== undefined && channel.name === q.name)
        )
      )
    }
    if (_class === chunter.class.DirectMessage) {
      const q = query as { _id?: Ref<HulyDirectMessage> }
      return Effect.succeed(directMessages.find((dm) => q._id !== undefined && dm._id === q._id))
    }
    if (_class === contact.class.Person) {
      const q = query as { _id?: Ref<Person>; name?: string }
      return Effect.succeed(
        persons.find((person) =>
          (q._id !== undefined && person._id === q._id) || (q.name !== undefined && person.name === q.name)
        )
      )
    }
    if (_class === contact.mixin.Employee) {
      const q = query as { _id?: Ref<HulyEmployee>; personUuid?: HulyAccountUuid }
      return Effect.succeed(employees.find((employee) =>
        (q._id !== undefined && employee._id === q._id)
        || (q.personUuid !== undefined && employee.personUuid === q.personUuid)
      ))
    }
    if (_class === contact.class.PersonSpace) {
      const q = query as { person?: Ref<Person> }
      return Effect.succeed(personSpaces.find((space) => q.person !== undefined && space.person === q.person))
    }
    if (_class === notification.class.DocNotifyContext) {
      const q = query as { user?: HulyAccountUuid; objectId?: Ref<Doc>; objectClass?: Ref<Class<Doc>> }
      return Effect.succeed(
        contexts.find((context) =>
          context.user === q.user && context.objectId === q.objectId && context.objectClass === q.objectClass
        )
      )
    }
    return Effect.succeed(undefined)
  }) as HulyClientOperations["findOne"]

  const updateDoc: HulyClientOperations["updateDoc"] = ((
    _class: unknown,
    _space: unknown,
    objectId: unknown,
    operations: unknown
  ) => {
    if (_class === chunter.class.Channel) {
      const channel = channels.find((item) => item._id === objectId)
      Object.assign(channel ?? {}, operations as DocumentUpdate<HulyChannel>)
    }
    if (_class === notification.class.DocNotifyContext) {
      const context = contexts.find((item) => item._id === objectId)
      Object.assign(context ?? {}, operations as DocumentUpdate<HulyDocNotifyContext>)
    }
    return Effect.succeed({})
  }) as HulyClientOperations["updateDoc"]

  const createDoc: HulyClientOperations["createDoc"] =
    ((_class: unknown, space: unknown, attributes: unknown, id?: unknown) => {
      if (_class === chunter.class.DirectMessage) {
        directMessages.push({
          ...(attributes as Data<HulyDirectMessage>),
          _id: id as Ref<HulyDirectMessage>,
          _class: chunter.class.DirectMessage,
          space: space as Ref<Space>,
          modifiedBy: "social-1" as PersonId,
          modifiedOn: 0
        } as HulyDirectMessage)
      }
      if (_class === notification.class.DocNotifyContext) {
        contexts.push({
          ...(attributes as Data<HulyDocNotifyContext>),
          _id: id as Ref<HulyDocNotifyContext>,
          _class: notification.class.DocNotifyContext,
          space: space as Ref<PersonSpace>,
          modifiedBy: "social-1" as PersonId,
          modifiedOn: 0
        } as HulyDocNotifyContext)
      }
      return Effect.succeed(id as Ref<Doc>)
    }) as HulyClientOperations["createDoc"]

  return HulyClient.testLayer({ findAll, findOne, updateDoc, createDoc })
}

const defaultPeople = [
  makePerson("person-self", "Self,User"),
  makePerson("person-a", "A,Person"),
  makePerson("person-b", "B,Person")
]

const defaultEmployees = [
  makeEmployee("person-self", "Self,User", me),
  makeEmployee("person-a", "A,Person", accountA),
  makeEmployee("person-b", "B,Person", accountB)
]

describe("channel member operations", () => {
  it.effect("lists members with account UUIDs and names when available", () =>
    Effect.gen(function*() {
      const channel = makeChannel({ members: [me, accountA] })
      const result = yield* listChannelMembers({ channel: channelIdentifier("general") }).pipe(
        Effect.provide(createLayer({ channels: [channel], employees: defaultEmployees }))
      )

      expect(result.channelId).toBe("channel-1")
      expect(result.members).toEqual([
        { accountUuid: me, name: "Self,User" },
        { accountUuid: accountA, name: "A,Person" }
      ])
    }))

  it.effect("lists an empty channel member set", () =>
    Effect.gen(function*() {
      const channel = makeChannel({ members: [] })
      const result = yield* listChannelMembers({ channel: channelIdentifier("general") }).pipe(
        Effect.provide(createLayer({ channels: [channel] }))
      )

      expect(result.members).toEqual([])
    }))

  it.effect("omits names for employee rows without account UUIDs", () =>
    Effect.gen(function*() {
      const employeeWithoutUuid = asEmployee({
        ...makePerson("person-without-uuid", "NoUuid,Person"),
        _class: contact.mixin.Employee,
        active: true
      })
      const result = yield* listChannelMembers({ channel: channelIdentifier("general") }).pipe(
        Effect.provide(createLayer({
          channels: [makeChannel({ members: [me] })],
          employees: [employeeWithoutUuid],
          ignoreEmployeePersonUuidFilter: true
        }))
      )

      expect(result.members).toEqual([{ accountUuid: me, name: undefined }])
    }))

  it.effect("adds and removes members idempotently using full sorted replacement", () =>
    Effect.gen(function*() {
      const channel = makeChannel({ members: [me], owners: [me] })
      const layer = createLayer({ channels: [channel], persons: defaultPeople, employees: defaultEmployees })

      const added = yield* addChannelMembers({
        channel: channelIdentifier("general"),
        members: [personName("A,Person")]
      }).pipe(Effect.provide(layer))
      const addedAgain = yield* addChannelMembers({
        channel: channelIdentifier("general"),
        members: [email("A,Person")]
      }).pipe(Effect.provide(layer))
      const removed = yield* removeChannelMembers({
        channel: channelIdentifier("general"),
        members: [personName("A,Person")]
      }).pipe(Effect.provide(layer))

      expect(added.changed).toBe(true)
      expect(added.members).toEqual([me, accountA].sort())
      expect(addedAgain.changed).toBe(false)
      expect(removed.changed).toBe(true)
      expect(removed.members).toEqual([me])
    }))

  it.effect("adds members by account UUID without person resolution", () =>
    Effect.gen(function*() {
      const channel = makeChannel({ members: [me], owners: [me] })
      const result = yield* addChannelMembers({
        channel: channelIdentifier("general"),
        members: [AccountUuid.make(accountA)]
      }).pipe(Effect.provide(createLayer({ channels: [channel] })))

      expect(result.changed).toBe(true)
      expect(result.members).toEqual([me, accountA].sort())
    }))

  it.effect("join and leave are idempotent and use the authenticated account", () =>
    Effect.gen(function*() {
      const channel = makeChannel({ members: [accountA], owners: [accountA] })
      const layer = createLayer({ channels: [channel] })

      const joined = yield* joinChannel({ channel: channelIdentifier("general") }).pipe(Effect.provide(layer))
      const joinedAgain = yield* joinChannel({ channel: channelIdentifier("general") }).pipe(Effect.provide(layer))
      const left = yield* leaveChannel({ channel: channelIdentifier("general") }).pipe(Effect.provide(layer))

      expect(joined.changed).toBe(true)
      expect(joinedAgain.changed).toBe(false)
      expect(left.changed).toBe(true)
      expect(left.members).toEqual([accountA])
    }))

  it.effect("allows removal when a channel has no owners list", () =>
    Effect.gen(function*() {
      const channel = makeChannel({ members: [me, accountA] })
      delete (channel as { owners?: ReadonlyArray<HulyAccountUuid> }).owners
      const removed = yield* removeChannelMembers({
        channel: channelIdentifier("general"),
        members: [personName("A,Person")]
      }).pipe(Effect.provide(createLayer({
        channels: [channel],
        persons: defaultPeople,
        employees: defaultEmployees
      })))

      expect(removed.changed).toBe(true)
      expect(removed.members).toEqual([me])
    }))

  it.effect("rejects archived channel mutation, last member removal, and last owner removal", () =>
    Effect.gen(function*() {
      const archived = makeChannel({ archived: true, members: [me], owners: [me] })
      const lastMember = makeChannel({ _id: "last-member" as Ref<HulyChannel>, members: [me], owners: [me] })
      const lastOwner = makeChannel({ _id: "last-owner" as Ref<HulyChannel>, members: [me, accountA], owners: [me] })

      const archivedExit = yield* Effect.exit(
        addChannelMembers({ channel: channelIdentifier("general"), members: [personName("A,Person")] }).pipe(
          Effect.provide(createLayer({ channels: [archived], persons: defaultPeople, employees: defaultEmployees }))
        )
      )
      const lastMemberExit = yield* Effect.exit(
        removeChannelMembers({ channel: channelIdentifier("last-member"), members: [personName("Self,User")] }).pipe(
          Effect.provide(createLayer({ channels: [lastMember], persons: defaultPeople, employees: defaultEmployees }))
        )
      )
      const lastOwnerExit = yield* Effect.exit(
        removeChannelMembers({ channel: channelIdentifier("last-owner"), members: [personName("Self,User")] }).pipe(
          Effect.provide(createLayer({ channels: [lastOwner], persons: defaultPeople, employees: defaultEmployees }))
        )
      )

      expect(Exit.isFailure(archivedExit)).toBe(true)
      if (Exit.isFailure(archivedExit)) {
        expect(archivedExit.cause.toString()).toContain("ChannelArchivedError")
      }
      expect(Exit.isFailure(lastMemberExit)).toBe(true)
      if (Exit.isFailure(lastMemberExit)) {
        expect(lastMemberExit.cause.toString()).toContain("ChannelLastMemberRemovalError")
      }
      expect(Exit.isFailure(lastOwnerExit)).toBe(true)
      if (Exit.isFailure(lastOwnerExit)) {
        expect(lastOwnerExit.cause.toString()).toContain("ChannelLastOwnerRemovalError")
      }
    }))

  it.effect("archives and unarchives idempotently", () =>
    Effect.gen(function*() {
      const channel = makeChannel()
      const layer = createLayer({ channels: [channel] })

      const archived = yield* archiveChannel({ channel: channelIdentifier("general") }).pipe(Effect.provide(layer))
      const archivedAgain = yield* archiveChannel({ channel: channelIdentifier("general") }).pipe(Effect.provide(layer))
      const unarchived = yield* unarchiveChannel({ channel: channelIdentifier("general") }).pipe(Effect.provide(layer))

      expect(archived).toMatchObject({ archived: true, changed: true })
      expect(archivedAgain).toMatchObject({ archived: true, changed: false })
      expect(unarchived).toMatchObject({ archived: false, changed: true })
    }))
})

describe("group direct-message creation", () => {
  it.effect("exact-matches existing group DMs regardless of input order and duplicates", () =>
    Effect.gen(function*() {
      const dm = makeDirectMessage({ members: [accountB, me, accountA] })
      const result = yield* createGroupDirectMessage({
        people: [personName("B,Person"), personName("A,Person"), personName("A,Person")]
      }).pipe(Effect.provide(createLayer({
        directMessages: [dm],
        persons: defaultPeople,
        employees: defaultEmployees
      })))

      expect(result.created).toBe(false)
      expect(result.id).toBe("dm-1")
      expect(result.members).toEqual([accountA, accountB, me].sort())
    }))

  it.effect("creates a group DM when no exact match exists", () =>
    Effect.gen(function*() {
      const directMessages: Array<HulyDirectMessage> = []
      const result = yield* createGroupDirectMessage({
        people: [personName("A,Person"), personName("B,Person")]
      }).pipe(Effect.provide(createLayer({
        directMessages,
        persons: defaultPeople,
        employees: defaultEmployees
      })))

      expect(result.created).toBe(true)
      expect(directMessages).toHaveLength(1)
      expect(assertAt(directMessages, 0).members).toEqual([accountA, accountB, me].sort())
    }))

  it.effect("rejects self-only group DM participant sets after de-dupe", () =>
    Effect.gen(function*() {
      const exit = yield* Effect.exit(
        createGroupDirectMessage({
          people: [personName("Self,User"), personName("Self,User")]
        }).pipe(Effect.provide(createLayer({ persons: defaultPeople, employees: defaultEmployees })))
      )

      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) {
        expect(exit.cause.toString()).toContain("DirectMessageParticipantCountError")
      }
    }))
})

describe("conversation state", () => {
  it.effect("creates a missing channel context and stars it", () =>
    Effect.gen(function*() {
      const contexts: Array<HulyDocNotifyContext> = []
      const channel = makeChannel()
      const result = yield* setConversationStarred({
        channel: channelIdentifier("general"),
        starred: true
      }).pipe(Effect.provide(createLayer({
        channels: [channel],
        employees: defaultEmployees,
        personSpaces: [makePersonSpace("person-self" as Ref<Person>)],
        contexts
      })))

      expect(result.kind).toBe("channel")
      expect(result.objectId).toBe("channel-1")
      expect(result.starred).toBe(true)
      expect(result.closed).toBe(false)
      expect(result.changed).toBe(true)
      expect(assertAt(contexts, 0).isPinned).toBe(true)
    }))

  it.effect("creates a missing channel context without an update when target state is false", () =>
    Effect.gen(function*() {
      const contexts: Array<HulyDocNotifyContext> = []
      const result = yield* setConversationClosed({
        channel: channelIdentifier("general"),
        closed: false
      }).pipe(Effect.provide(createLayer({
        channels: [makeChannel()],
        employees: defaultEmployees,
        personSpaces: [makePersonSpace("person-self" as Ref<Person>)],
        contexts
      })))

      expect(result.closed).toBe(false)
      expect(result.starred).toBe(false)
      expect(result.changed).toBe(true)
      expect(assertAt(contexts, 0).hidden).toBe(false)
    }))

  it.effect("does not update an existing context already in the requested starred state", () =>
    Effect.gen(function*() {
      const context = makeContext({ isPinned: true })
      const result = yield* setConversationStarred({
        channel: channelIdentifier("general"),
        starred: true
      }).pipe(Effect.provide(createLayer({
        channels: [makeChannel()],
        contexts: [context]
      })))

      expect(result.starred).toBe(true)
      expect(result.changed).toBe(false)
    }))

  it.effect("updates existing starred and closed contexts back to false", () =>
    Effect.gen(function*() {
      const starredContext = makeContext({ isPinned: true })
      const unstarred = yield* setConversationStarred({
        channel: channelIdentifier("general"),
        starred: false
      }).pipe(Effect.provide(createLayer({
        channels: [makeChannel()],
        contexts: [starredContext]
      })))

      const closedContext = makeContext({ hidden: true })
      const reopened = yield* setConversationClosed({
        channel: channelIdentifier("general"),
        closed: false
      }).pipe(Effect.provide(createLayer({
        channels: [makeChannel()],
        contexts: [closedContext]
      })))

      expect(unstarred.starred).toBe(false)
      expect(unstarred.changed).toBe(true)
      expect(starredContext.isPinned).toBe(false)
      expect(reopened.closed).toBe(false)
      expect(reopened.changed).toBe(true)
      expect(closedContext.hidden).toBe(false)
    }))

  it.effect("closes an existing DM context without changing DM members", () =>
    Effect.gen(function*() {
      const dm = makeDirectMessage({ _id: "dm-1" as Ref<HulyDirectMessage>, members: [me, accountA] })
      const context = makeContext({
        objectId: "dm-1" as Ref<Doc>,
        objectClass: chunter.class.DirectMessage as Ref<Class<Doc>>,
        objectSpace: "dm-1" as Ref<Space>,
        hidden: false
      })

      const result = yield* setConversationClosed({
        dm: directMessageIdentifier("dm-1"),
        closed: true
      }).pipe(Effect.provide(createLayer({
        directMessages: [dm],
        contexts: [context]
      })))

      expect(result.kind).toBe("direct_message")
      expect(result.closed).toBe(true)
      expect(result.changed).toBe(true)
      expect(dm.members).toEqual([me, accountA])
      expect(context.hidden).toBe(true)
    }))

  it.effect("fails when creating a missing context without a current employee", () =>
    Effect.gen(function*() {
      const exit = yield* Effect.exit(
        setConversationStarred({
          channel: channelIdentifier("general"),
          starred: true
        }).pipe(Effect.provide(createLayer({
          channels: [makeChannel()],
          employees: [],
          personSpaces: [makePersonSpace("person-self" as Ref<Person>)],
          contexts: []
        })))
      )

      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) {
        expect(exit.cause.toString()).toContain("NotificationPersonSpaceNotFoundError")
      }
    }))

  it.effect("fails when creating a missing context without a current person space", () =>
    Effect.gen(function*() {
      const exit = yield* Effect.exit(
        setConversationClosed({
          channel: channelIdentifier("general"),
          closed: true
        }).pipe(Effect.provide(createLayer({
          channels: [makeChannel()],
          employees: defaultEmployees,
          personSpaces: [],
          contexts: []
        })))
      )

      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) {
        expect(exit.cause.toString()).toContain("NotificationPersonSpaceNotFoundError")
      }
    }))
})
