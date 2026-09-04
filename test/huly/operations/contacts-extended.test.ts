import { describe, it } from "@effect/vitest"
import type {
  Channel,
  Contact,
  Employee as HulyEmployee,
  Member as HulyMember,
  Organization as HulyOrganization,
  Person as HulyPerson,
  SocialIdentity
} from "@hcengineering/contact"
import type {
  Class,
  Doc,
  FindResult,
  Mixin,
  MixinUpdate,
  PersonId as CorePersonId,
  Ref,
  Space,
  TxResult
} from "@hcengineering/core"
import { SocialIdType } from "@hcengineering/core"
import { Effect, Result } from "effect"
import { expect } from "vitest"
import { parseSetEmployeePositionParams } from "../../../src/domain/schemas/contacts.js"
import { Email, NonEmptyString, PersonId } from "../../../src/domain/schemas/shared.js"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import { contact } from "../../../src/huly/huly-plugins.js"
import { findPersonByEmailOrName, findPersonByExactEmailOrName } from "../../../src/huly/operations/contacts-shared.js"
import { setEmployeePosition } from "../../../src/huly/operations/employee-position.js"
import { createOrganization, listOrganizations } from "../../../src/huly/operations/organizations.js"
import { getPerson, listEmployees, listPersons, updatePerson } from "../../../src/huly/operations/persons.js"
import { resolveAssignee } from "../../../src/huly/operations/test-management-shared.js"
import { assertAt, assertExists } from "../../../src/utils/assertions.js"
import { memberReference } from "../../helpers/brands.js"
import { docRef } from "../../helpers/huly-sdk.js"
import { toAccountUuid } from "../../../src/huly/operations/sdk-boundary.js"

const toFindResult = <T extends Doc>(docs: Array<T>): FindResult<T> => {
  const result = docs as FindResult<T>
  result.total = docs.length
  return result
}

const createMockPerson = (overrides: Partial<HulyPerson> = {}): HulyPerson => {
  const data = {
    _id: "person-123" as Ref<HulyPerson>,
    _class: contact.class.Person,
    name: "Doe,John",
    city: "NYC",
    space: contact.space.Contacts,
    modifiedOn: 1700000000000,
    modifiedBy: "user" as CorePersonId,
    createdOn: 1699000000000,
    createdBy: "user" as CorePersonId,
    ...overrides
  }
  return data as HulyPerson
}

const createMockChannel = (overrides: Partial<Channel> = {}): Channel => {
  const data = {
    _id: "channel-1" as Ref<Channel>,
    _class: contact.class.Channel,
    space: contact.space.Contacts,
    attachedTo: "person-123" as Ref<Doc>,
    attachedToClass: contact.class.Person,
    collection: "channels",
    provider: contact.channelProvider.Email,
    value: "john@example.com",
    modifiedBy: "user" as CorePersonId,
    modifiedOn: 0,
    createdBy: "user" as CorePersonId,
    createdOn: 0,
    ...overrides
  }
  return data as Channel
}

const createMockSocialIdentity = (overrides: Partial<SocialIdentity> = {}): SocialIdentity => {
  const data = {
    _id: "social-1" as Ref<SocialIdentity>,
    _class: contact.class.SocialIdentity,
    space: contact.space.Contacts,
    attachedTo: "person-123" as Ref<Doc>,
    attachedToClass: contact.class.Person,
    collection: "socialIds",
    key: "email:john@example.com",
    type: SocialIdType.EMAIL,
    value: "john@example.com",
    modifiedBy: "user" as CorePersonId,
    modifiedOn: 0,
    createdBy: "user" as CorePersonId,
    createdOn: 0,
    ...overrides
  }
  return data as SocialIdentity
}

const createMockEmployee = (overrides: Partial<HulyEmployee> = {}): HulyEmployee => {
  const data = {
    _id: "employee-1" as Ref<HulyEmployee>,
    _class: contact.mixin.Employee,
    name: "Smith,Jane",
    city: "LA",
    space: contact.space.Contacts,
    active: true,
    position: "Developer",
    modifiedOn: 1700000000000,
    modifiedBy: "user" as CorePersonId,
    createdOn: 1699000000000,
    createdBy: "user" as CorePersonId,
    ...overrides
  }
  return data as HulyEmployee
}

const createMockOrganization = (overrides: Partial<HulyOrganization> = {}): HulyOrganization => {
  const data = {
    _id: "org-1" as Ref<HulyOrganization>,
    _class: contact.class.Organization,
    name: "Test Corp",
    city: "SF",
    members: 5,
    space: contact.space.Contacts,
    modifiedOn: 1700000000000,
    modifiedBy: "user" as CorePersonId,
    createdOn: 1699000000000,
    createdBy: "user" as CorePersonId,
    ...overrides
  }
  return data as HulyOrganization
}

const createMockMember = (overrides: Partial<HulyMember> = {}): HulyMember => {
  const data = {
    _id: "member-1" as Ref<HulyMember>,
    _class: contact.class.Member,
    space: contact.space.Contacts,
    attachedTo: "org-1" as Ref<HulyOrganization>,
    attachedToClass: contact.class.Organization,
    collection: "members",
    contact: "person-123" as Ref<Contact>,
    modifiedOn: 1700000000000,
    modifiedBy: "user" as CorePersonId,
    createdOn: 1699000000000,
    createdBy: "user" as CorePersonId,
    ...overrides
  }
  return data as HulyMember
}

interface MockConfig {
  persons?: Array<HulyPerson>
  channels?: Array<Channel>
  socialIdentities?: Array<SocialIdentity>
  employees?: Array<HulyEmployee>
  organizations?: Array<HulyOrganization>
  members?: Array<HulyMember>
  capturePersonQuery?: { query?: Record<string, unknown> }
  captureCreateDoc?: { data?: Record<string, unknown>; id?: string; class?: unknown }
  captureAddCollection?: { attributes?: Record<string, unknown>; attachedTo?: string; class?: unknown }
  captureUpdateDoc?: { operations?: Record<string, unknown> }
  captureUpdateMixin?: { attributes?: unknown; objectId?: unknown; objectClass?: unknown; mixin?: unknown }
  captureRemoveDoc?: { id?: string }
}

const createTestLayer = (config: MockConfig) => {
  const persons = config.persons ?? []
  const channels = config.channels ?? []
  const socialIdentities = config.socialIdentities ?? []
  const employees = config.employees ?? []
  const organizations = config.organizations ?? []
  const members = config.members ?? []

  const matchesLike = (value: string, pattern: string): boolean => {
    const escaped = pattern.replace(/%/g, ".*").replace(/_/g, ".")
    return new RegExp(`^${escaped}$`, "i").test(value)
  }

  const findAllImpl: HulyClientOperations["findAll"] = ((_class: unknown, query: unknown, options?: unknown) => {
    if (_class === contact.class.Person) {
      const q = (query ?? {}) as Record<string, unknown>
      if (config.capturePersonQuery !== undefined) {
        config.capturePersonQuery.query = q
      }
      let filtered = persons
      if (q._id !== undefined) {
        const idFilter = q._id as unknown
        if (typeof idFilter === "object" && idFilter !== null && "$in" in idFilter) {
          const ids = idFilter.$in as Array<unknown>
          filtered = filtered.filter((p) => ids.includes(p._id))
        }
      }
      if (q.name !== undefined) {
        const nameFilter = q.name as { $like?: string } | string
        if (typeof nameFilter === "object" && "$like" in nameFilter) {
          filtered = filtered.filter((p) => matchesLike(p.name, assertExists(nameFilter.$like)))
        } else {
          filtered = filtered.filter((p) => p.name === nameFilter)
        }
      }
      const opts = (options ?? {}) as { limit?: number }
      if (opts.limit !== undefined) {
        filtered = filtered.slice(0, opts.limit)
      }
      return Effect.succeed(toFindResult(filtered))
    }
    if (_class === contact.class.Channel) {
      const q = query as Record<string, unknown>
      let filtered = channels
      if (q.attachedTo !== undefined) {
        const attachedTo = q.attachedTo as unknown
        if (typeof attachedTo === "object" && attachedTo !== null && "$in" in attachedTo) {
          const ids = attachedTo.$in as Array<unknown>
          filtered = filtered.filter((c) => ids.includes(c.attachedTo))
        } else {
          filtered = filtered.filter((c) => c.attachedTo === q.attachedTo)
        }
      }
      if (q.provider !== undefined) {
        filtered = filtered.filter((c) => c.provider === q.provider)
      }
      if (q.value !== undefined) {
        const value = q.value as { $like?: string } | string
        if (typeof value === "object" && "$like" in value) {
          filtered = filtered.filter((c) => matchesLike(c.value, assertExists(value.$like)))
        } else {
          filtered = filtered.filter((c) => c.value === value)
        }
      }
      return Effect.succeed(toFindResult(filtered))
    }
    if (_class === contact.class.SocialIdentity) {
      const q = query as Record<string, unknown>
      let filtered = socialIdentities.filter((identity) => {
        if (q.type !== undefined && identity.type !== q.type) return false
        return true
      })
      if (q.attachedTo !== undefined) {
        const attachedTo = q.attachedTo as unknown
        if (typeof attachedTo === "object" && attachedTo !== null && "$in" in attachedTo) {
          const ids = attachedTo.$in as Array<unknown>
          filtered = filtered.filter((identity) => ids.includes(identity.attachedTo))
        } else {
          filtered = filtered.filter((identity) => identity.attachedTo === q.attachedTo)
        }
      }
      if (q.value !== undefined) {
        const value = q.value as { $like?: string } | string
        if (typeof value === "object" && "$like" in value) {
          filtered = filtered.filter((identity) => matchesLike(identity.value, assertExists(value.$like)))
        } else {
          filtered = filtered.filter((identity) => identity.value === value)
        }
      }
      return Effect.succeed(toFindResult(filtered))
    }
    if (_class === contact.mixin.Employee) {
      const opts = (options ?? {}) as { limit?: number }
      let filtered = [...employees]
      if (opts.limit !== undefined) {
        filtered = filtered.slice(0, opts.limit)
      }
      return Effect.succeed(toFindResult(filtered))
    }
    if (_class === contact.class.Organization) {
      const q = (query ?? {}) as Record<string, unknown>
      const opts = (options ?? {}) as { limit?: number }
      let filtered = [...organizations]
      const idFilter = q._id as { $in?: Array<unknown> } | undefined
      const inValues = idFilter?.$in
      if (Array.isArray(inValues)) {
        filtered = filtered.filter((o) => inValues.includes(o._id))
      }
      if (opts.limit !== undefined) {
        filtered = filtered.slice(0, opts.limit)
      }
      return Effect.succeed(toFindResult(filtered))
    }
    if (_class === contact.class.Member) {
      const q = (query ?? {}) as Record<string, unknown>
      const filtered = q.contact === undefined ? members : members.filter((m) => m.contact === q.contact)
      return Effect.succeed(toFindResult(filtered))
    }
    return Effect.succeed(toFindResult([]))
  }) as HulyClientOperations["findAll"]

  const findOneImpl: HulyClientOperations["findOne"] = ((_class: unknown, query: unknown) => {
    if (_class === contact.class.Person) {
      const q = query as Record<string, unknown>
      const found = persons.find((p) => p._id === q._id)
      return Effect.succeed(found)
    }
    if (_class === contact.mixin.Employee) {
      const q = query as Record<string, unknown>
      const found = employees.find((employee) => employee._id === q._id)
      return Effect.succeed(found)
    }
    if (_class === contact.class.SocialIdentity) {
      const q = query as Record<string, unknown>
      const found = socialIdentities.find((identity) => identity.type === q.type && identity.value === q.value)
      return Effect.succeed(found)
    }
    if (_class === contact.class.Channel) {
      const q = query as Record<string, unknown>
      const found = channels.find((channel) => {
        if (q.provider !== undefined && channel.provider !== q.provider) return false
        if (q.value !== undefined) {
          const value = q.value as { $like?: string } | string
          if (typeof value === "object" && "$like" in value) {
            return matchesLike(channel.value, value.$like)
          }
          return channel.value === value
        }
        return true
      })
      return Effect.succeed(found)
    }
    return Effect.succeed(undefined)
  }) as HulyClientOperations["findOne"]

  const createDocImpl: HulyClientOperations["createDoc"] = ((
    _class: unknown,
    _space: unknown,
    data: unknown,
    id: unknown
  ) => {
    if (config.captureCreateDoc) {
      config.captureCreateDoc.data = data as Record<string, unknown>
      config.captureCreateDoc.id = id as string
      config.captureCreateDoc.class = _class
    }
    return Effect.succeed((id ?? "new-id") as Ref<Doc>)
  }) as HulyClientOperations["createDoc"]

  const addCollectionImpl: HulyClientOperations["addCollection"] = ((
    _class: unknown,
    _space: unknown,
    _attachedTo: unknown,
    _attachedToClass: unknown,
    _collection: unknown,
    attributes: unknown
  ) => {
    if (config.captureAddCollection) {
      config.captureAddCollection.attributes = attributes as Record<string, unknown>
      config.captureAddCollection.attachedTo = _attachedTo as string
      config.captureAddCollection.class = _class
    }
    return Effect.succeed("new-channel-id" as Ref<Doc>)
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

  const removeDocImpl: HulyClientOperations["removeDoc"] = ((_class: unknown, _space: unknown, objectId: unknown) => {
    if (config.captureRemoveDoc) {
      config.captureRemoveDoc.id = String(objectId)
    }
    return Effect.succeed({})
  }) as HulyClientOperations["removeDoc"]

  const updateMixinImpl = <D extends Doc, M extends D>(
    _objectId: Ref<D>,
    objectClass: Ref<Class<D>>,
    _objectSpace: Ref<Space>,
    mixin: Ref<Mixin<M>>,
    attributes: MixinUpdate<D, M>
  ): Effect.Effect<TxResult, never> => {
    if (config.captureUpdateMixin !== undefined) {
      config.captureUpdateMixin.attributes = attributes
      config.captureUpdateMixin.objectId = _objectId
      config.captureUpdateMixin.objectClass = objectClass
      config.captureUpdateMixin.mixin = mixin
    }
    return Effect.succeed({})
  }

  return HulyClient.testLayer({
    findAll: findAllImpl,
    findOne: findOneImpl,
    createDoc: createDocImpl,
    addCollection: addCollectionImpl,
    updateDoc: updateDocImpl,
    removeDoc: removeDocImpl,
    updateMixin: updateMixinImpl
  })
}

describe("Contacts Extended Coverage", () => {
  it.effect("resolves a substring email channel to its attached person", () =>
    Effect.gen(function* () {
      const person = createMockPerson()
      const channel = createMockChannel({ value: "john@example.com", attachedTo: person._id })
      const result = yield* Effect.gen(function* () {
        const client = yield* HulyClient
        return yield* findPersonByEmailOrName(client, "john@")
      }).pipe(Effect.provide(createTestLayer({ persons: [person], channels: [channel] })))

      expect(result?._id).toBe(person._id)
    })
  )

  describe("findPersonByExactEmailOrName", () => {
    it.effect("returns the sole Person for one exact email match", () =>
      Effect.gen(function* () {
        const person = createMockPerson()
        const identity = createMockSocialIdentity({ attachedTo: person._id, value: "john@example.com" })
        const testLayer = createTestLayer({ persons: [person], socialIdentities: [identity] })

        const result = yield* Effect.gen(function* () {
          const client = yield* HulyClient
          return yield* findPersonByExactEmailOrName(client, Email.make("john@example.com"))
        }).pipe(Effect.provide(testLayer))

        expect(result?._id).toBe(person._id)
      })
    )

    it.effect("returns undefined when exact email has no identity or channel matches", () =>
      Effect.gen(function* () {
        const testLayer = createTestLayer({ persons: [], channels: [], socialIdentities: [] })

        const result = yield* Effect.gen(function* () {
          const client = yield* HulyClient
          return yield* findPersonByExactEmailOrName(client, Email.make("missing@example.com"))
        }).pipe(Effect.provide(testLayer))

        expect(result).toBeUndefined()
      })
    )

    it.effect("returns undefined when exact email resolves ids but no matching person docs", () =>
      Effect.gen(function* () {
        const identity = createMockSocialIdentity({
          value: "orphan@example.com",
          attachedTo: "orphan-person" as Ref<HulyPerson>
        })
        const testLayer = createTestLayer({ persons: [], socialIdentities: [identity] })

        const result = yield* Effect.gen(function* () {
          const client = yield* HulyClient
          return yield* findPersonByExactEmailOrName(client, Email.make("orphan@example.com"))
        }).pipe(Effect.provide(testLayer))

        expect(result).toBeUndefined()
      })
    )

    it.effect("fails when one exact email identifies distinct Persons", () =>
      Effect.gen(function* () {
        const first = createMockPerson({ _id: docRef<HulyPerson>("person-1") })
        const second = createMockPerson({ _id: docRef<HulyPerson>("person-2") })
        const identities = [
          createMockSocialIdentity({ attachedTo: first._id }),
          createMockSocialIdentity({ attachedTo: second._id })
        ]
        const testLayer = createTestLayer({ persons: [first, second], socialIdentities: identities })

        const error = yield* Effect.flip(
          Effect.gen(function* () {
            const client = yield* HulyClient
            return yield* findPersonByExactEmailOrName(client, Email.make("john@example.com"))
          }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("PersonIdentifierAmbiguousError")
      })
    )
  })

  describe("resolveAssignee", () => {
    it.effect("returns PersonNotFoundError when no contact lookup path matches", () =>
      Effect.gen(function* () {
        const testLayer = createTestLayer({ persons: [], channels: [], socialIdentities: [] })

        const error = yield* Effect.flip(resolveAssignee("missing@example.com").pipe(Effect.provide(testLayer)))

        expect(error._tag).toBe("PersonNotFoundError")
        if (error._tag !== "PersonNotFoundError") throw new Error("expected PersonNotFoundError")
        expect(error.identifier).toBe("missing@example.com")
      })
    )
  })

  describe("getPerson by email (findPersonByEmail path)", () => {
    it.effect("finds person by SocialIdentity email when no email channel exists", () =>
      Effect.gen(function* () {
        const mockPerson = createMockPerson()
        const socialIdentity = createMockSocialIdentity({
          value: "john@example.com",
          attachedTo: "person-123" as Ref<HulyPerson>
        })

        const testLayer = createTestLayer({ persons: [mockPerson], socialIdentities: [socialIdentity] })

        const result = yield* getPerson({ email: Email.make("john@example.com") }).pipe(Effect.provide(testLayer))

        expect(result.id).toBe("person-123")
        expect(result.firstName).toBe("John")
        expect(result.lastName).toBe("Doe")
        expect(result.email).toBe("john@example.com")
      })
    )

    it.effect("finds person by email when channel exists", () =>
      Effect.gen(function* () {
        const mockPerson = createMockPerson()
        const mockChannel = createMockChannel({ value: "john@example.com", attachedTo: "person-123" as Ref<Doc> })

        const testLayer = createTestLayer({ persons: [mockPerson], channels: [mockChannel] })

        const result = yield* getPerson({ email: Email.make("john@example.com") }).pipe(Effect.provide(testLayer))

        expect(result.id).toBe("person-123")
        expect(result.email).toBe("john@example.com")
      })
    )

    it.effect("does not treat SocialIdentity and email channel for the same person as ambiguous", () =>
      Effect.gen(function* () {
        const mockPerson = createMockPerson()
        const socialIdentity = createMockSocialIdentity({
          value: "john@example.com",
          attachedTo: "person-123" as Ref<HulyPerson>
        })
        const mockChannel = createMockChannel({ value: "john@example.com", attachedTo: "person-123" as Ref<Doc> })

        const testLayer = createTestLayer({
          persons: [mockPerson],
          channels: [mockChannel],
          socialIdentities: [socialIdentity]
        })

        const result = yield* getPerson({ email: Email.make("john@example.com") }).pipe(Effect.provide(testLayer))

        expect(result.id).toBe("person-123")
        expect(result.email).toBe("john@example.com")
      })
    )

    it.effect("returns PersonIdentifierAmbiguousError when SocialIdentity and channel point to different people", () =>
      Effect.gen(function* () {
        const socialPerson = createMockPerson({ _id: "person-social" as Ref<HulyPerson>, name: "Social,Person" })
        const channelPerson = createMockPerson({ _id: "person-channel" as Ref<HulyPerson>, name: "Channel,Person" })
        const socialIdentity = createMockSocialIdentity({
          value: "shared@example.com",
          attachedTo: "person-social" as Ref<HulyPerson>
        })
        const mockChannel = createMockChannel({ value: "shared@example.com", attachedTo: "person-channel" as Ref<Doc> })

        const testLayer = createTestLayer({
          persons: [socialPerson, channelPerson],
          channels: [mockChannel],
          socialIdentities: [socialIdentity]
        })

        const error = yield* Effect.flip(
          getPerson({ email: Email.make("shared@example.com") }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("PersonIdentifierAmbiguousError")
      })
    )

    it.effect("returns PersonNotFoundError when email channel exists but person does not", () =>
      Effect.gen(function* () {
        const mockChannel = createMockChannel({
          value: "orphan@example.com",
          attachedTo: "nonexistent-person" as Ref<Doc>
        })

        const testLayer = createTestLayer({ persons: [], channels: [mockChannel] })

        const error = yield* Effect.flip(
          getPerson({ email: Email.make("orphan@example.com") }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("PersonNotFoundError")
      })
    )

    it.effect("returns PersonNotFoundError when no matching email channel", () =>
      Effect.gen(function* () {
        const testLayer = createTestLayer({ persons: [], channels: [] })

        const error = yield* Effect.flip(
          getPerson({ email: Email.make("nobody@example.com") }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("PersonNotFoundError")
      })
    )

    it.effect("includes the organizations a person belongs to", () =>
      Effect.gen(function* () {
        const mockPerson = createMockPerson()
        const mockChannel = createMockChannel({ value: "john@example.com", attachedTo: "person-123" as Ref<Doc> })
        const org = createMockOrganization()
        const member = createMockMember({ contact: "person-123" as Ref<Contact>, attachedTo: "org-1" as Ref<Doc> })

        const testLayer = createTestLayer({
          persons: [mockPerson],
          channels: [mockChannel],
          organizations: [org],
          members: [member]
        })

        const result = yield* getPerson({ email: Email.make("john@example.com") }).pipe(Effect.provide(testLayer))

        expect(result.organizations).toEqual([{ id: "org-1", name: "Test Corp" }])
      })
    )
  })

  describe("batchGetEmailsForPersons - duplicate channels", () => {
    it.effect("falls back to an email SocialIdentity when no email channel exists", () =>
      Effect.gen(function* () {
        const person = createMockPerson({ _id: "person-social-email" as Ref<HulyPerson>, name: "Social,Email" })
        const identity = createMockSocialIdentity({
          attachedTo: "person-social-email" as Ref<HulyPerson>,
          value: "account@example.com"
        })
        const testLayer = createTestLayer({ persons: [person], socialIdentities: [identity] })

        const result = yield* listPersons({ emailSearch: "account", limit: 10 }).pipe(Effect.provide(testLayer))

        expect(result).toHaveLength(1)
        expect(assertAt(result, 0).email).toBe("account@example.com")
      })
    )

    it.effect("prefers an email channel over a SocialIdentity email", () =>
      Effect.gen(function* () {
        const person = createMockPerson({ _id: "person-channel-first" as Ref<HulyPerson>, name: "Channel,First" })
        const channel = createMockChannel({
          attachedTo: "person-channel-first" as Ref<Doc>,
          value: "preferred@example.com"
        })
        const identity = createMockSocialIdentity({
          attachedTo: "person-channel-first" as Ref<HulyPerson>,
          value: "fallback@example.com"
        })
        const testLayer = createTestLayer({ persons: [person], channels: [channel], socialIdentities: [identity] })

        const result = yield* listPersons({ limit: 10 }).pipe(Effect.provide(testLayer))

        expect(assertAt(result, 0).email).toBe("preferred@example.com")
      })
    )

    it.effect("ignores non-email SocialIdentities", () =>
      Effect.gen(function* () {
        const person = createMockPerson({ _id: "person-github" as Ref<HulyPerson>, name: "GitHub,Identity" })
        const identity = createMockSocialIdentity({
          attachedTo: "person-github" as Ref<HulyPerson>,
          type: SocialIdType.GITHUB,
          value: "account@example.com"
        })
        const testLayer = createTestLayer({ persons: [person], socialIdentities: [identity] })

        const result = yield* listPersons({ emailSearch: "account", limit: 10 }).pipe(Effect.provide(testLayer))

        expect(result).toEqual([])
      })
    )

    it.effect("keeps only first email for a person when multiple channels exist", () =>
      Effect.gen(function* () {
        const person = createMockPerson({ _id: "person-dup" as Ref<HulyPerson>, name: "Dup,Person" })
        const channel1 = createMockChannel({
          _id: "ch-1" as Ref<Channel>,
          attachedTo: "person-dup" as Ref<Doc>,
          value: "first@example.com"
        })
        const channel2 = createMockChannel({
          _id: "ch-2" as Ref<Channel>,
          attachedTo: "person-dup" as Ref<Doc>,
          value: "second@example.com"
        })

        const testLayer = createTestLayer({ persons: [person], channels: [channel1, channel2] })

        const result = yield* listPersons({ limit: 10 }).pipe(Effect.provide(testLayer))

        expect(result).toHaveLength(1)
        expect(assertAt(result, 0).email).toBe("first@example.com")
      })
    )

    it.effect("omits invalid Huly email channel values from summaries", () =>
      Effect.gen(function* () {
        const person = createMockPerson({ _id: "person-invalid-email" as Ref<HulyPerson>, name: "Invalid,Email" })
        const channel = createMockChannel({ attachedTo: "person-invalid-email" as Ref<Doc>, value: "" })

        const testLayer = createTestLayer({ persons: [person], channels: [channel] })

        const result = yield* listPersons({ limit: 10 }).pipe(Effect.provide(testLayer))

        expect(result).toHaveLength(1)
        expect(assertAt(result, 0).email).toBeUndefined()
      })
    )

    it.effect("uses the first valid email when an earlier Huly channel value is invalid", () =>
      Effect.gen(function* () {
        const person = createMockPerson({ _id: "person-later-valid-email" as Ref<HulyPerson>, name: "Later,Valid" })
        const invalidChannel = createMockChannel({
          _id: "ch-invalid" as Ref<Channel>,
          attachedTo: "person-later-valid-email" as Ref<Doc>,
          value: "not-an-email"
        })
        const validChannel = createMockChannel({
          _id: "ch-valid" as Ref<Channel>,
          attachedTo: "person-later-valid-email" as Ref<Doc>,
          value: "later@example.com"
        })

        const testLayer = createTestLayer({ persons: [person], channels: [invalidChannel, validChannel] })

        const result = yield* listPersons({ limit: 10 }).pipe(Effect.provide(testLayer))

        expect(result).toHaveLength(1)
        expect(assertAt(result, 0).email).toBe("later@example.com")
      })
    )
  })

  describe("listPersons with nameSearch", () => {
    it.effect("applies nameSearch filter", () =>
      Effect.gen(function* () {
        const person1 = createMockPerson({ _id: "person-1" as Ref<HulyPerson>, name: "Doe,John" })
        const person2 = createMockPerson({ _id: "person-2" as Ref<HulyPerson>, name: "Smith,Jane" })

        const testLayer = createTestLayer({ persons: [person1, person2], channels: [] })

        const result = yield* listPersons({ nameSearch: "Doe", limit: 10 }).pipe(Effect.provide(testLayer))

        expect(result).toHaveLength(1)
        expect(assertAt(result, 0).id).toBe("person-1")
        expect(assertAt(result, 0).name).toBe("Doe,John")
      })
    )

    it.effect("ignores empty nameSearch", () =>
      Effect.gen(function* () {
        const person1 = createMockPerson()

        const testLayer = createTestLayer({ persons: [person1], channels: [] })

        const result = yield* listPersons({ nameSearch: "  ", limit: 10 }).pipe(Effect.provide(testLayer))

        expect(result).toHaveLength(1)
      })
    )

    it.effect("applies a nameRegex filter", () =>
      Effect.gen(function* () {
        const capturePersonQuery: MockConfig["capturePersonQuery"] = {}
        const testLayer = createTestLayer({ persons: [], channels: [], capturePersonQuery })

        yield* listPersons({ nameRegex: "Doe%", limit: 10 }).pipe(Effect.provide(testLayer))

        expect(capturePersonQuery.query?.name).toEqual({ $regex: "Doe%" })
      })
    )

    it.effect("ignores a blank nameRegex", () =>
      Effect.gen(function* () {
        const testLayer = createTestLayer({ persons: [createMockPerson()], channels: [] })

        const result = yield* listPersons({ nameRegex: "   ", limit: 10 }).pipe(Effect.provide(testLayer))

        expect(result).toHaveLength(1)
      })
    )
  })

  describe("updatePerson name update branches", () => {
    it.effect("updates only lastName while keeping firstName", () =>
      Effect.gen(function* () {
        const mockPerson = createMockPerson({ name: "Doe,John" })
        const capture: MockConfig["captureUpdateDoc"] = {}

        const testLayer = createTestLayer({ persons: [mockPerson], captureUpdateDoc: capture })

        const result = yield* updatePerson({ personId: PersonId.make("person-123"), lastName: "Smith" }).pipe(
          Effect.provide(testLayer)
        )

        expect(result.updated).toBe(true)
        expect(capture.operations?.name).toBe("Smith,John")
      })
    )

    it.effect("updates city to a non-null value", () =>
      Effect.gen(function* () {
        const mockPerson = createMockPerson({ city: "NYC" })
        const capture: MockConfig["captureUpdateDoc"] = {}

        const testLayer = createTestLayer({ persons: [mockPerson], captureUpdateDoc: capture })

        const result = yield* updatePerson({ personId: PersonId.make("person-123"), city: "LA" }).pipe(
          Effect.provide(testLayer)
        )

        expect(result.updated).toBe(true)
        expect(capture.operations?.city).toBe("LA")
      })
    )
  })

  describe("listEmployees", () => {
    it.effect("returns a SocialIdentity email when no email channel exists", () =>
      Effect.gen(function* () {
        const emp = createMockEmployee({ _id: "employee-social" as Ref<HulyEmployee>, name: "Social,Employee" })
        const identity = createMockSocialIdentity({
          attachedTo: "employee-social" as Ref<HulyEmployee>,
          value: "employee@example.com"
        })
        const testLayer = createTestLayer({ employees: [emp], socialIdentities: [identity] })

        const result = yield* listEmployees({ limit: 10 }).pipe(Effect.provide(testLayer))

        expect(assertAt(result, 0).email).toBe("employee@example.com")
      })
    )

    it.effect("returns employee summaries with emails", () =>
      Effect.gen(function* () {
        const emp = createMockEmployee({
          _id: "employee-1" as Ref<HulyEmployee>,
          name: "Smith,Jane",
          active: true,
          position: "Developer",
          role: "USER",
          statuses: 2,
          personUuid: toAccountUuid(NonEmptyString.make("11111111-1111-4111-8111-111111111111"))
        })
        const empChannel = createMockChannel({ attachedTo: "employee-1" as Ref<Doc>, value: "jane@company.com" })

        const testLayer = createTestLayer({ employees: [emp], channels: [empChannel] })

        const result = yield* listEmployees({ limit: 10 }).pipe(Effect.provide(testLayer))

        expect(result).toHaveLength(1)
        expect(assertAt(result, 0).name).toBe("Smith,Jane")
        expect(assertAt(result, 0).email).toBe("jane@company.com")
        expect(assertAt(result, 0).city).toBe("LA")
        expect(assertAt(result, 0).role).toBe("USER")
        expect(assertAt(result, 0).statuses).toBe(2)
        expect(assertAt(result, 0).personUuid).toBe("11111111-1111-4111-8111-111111111111")
        expect(assertAt(result, 0).active).toBe(true)
        expect(assertAt(result, 0).position).toBe("Developer")
      })
    )

    it.effect("returns employees without email when no channel exists", () =>
      Effect.gen(function* () {
        const emp = createMockEmployee({ _id: "employee-2" as Ref<HulyEmployee>, name: "Brown,Bob", active: false })

        const testLayer = createTestLayer({ employees: [emp], channels: [] })

        const result = yield* listEmployees({ limit: 10 }).pipe(Effect.provide(testLayer))

        expect(result).toHaveLength(1)
        expect(assertAt(result, 0).email).toBeUndefined()
        expect(assertAt(result, 0).active).toBe(false)
      })
    )

    it.effect("returns employees with position undefined when not set", () =>
      Effect.gen(function* () {
        const emp = createMockEmployee({
          _id: "employee-3" as Ref<HulyEmployee>,
          // eslint-disable-next-line no-restricted-syntax -- null doesn't overlap with string
          position: null as unknown as string
        })

        const testLayer = createTestLayer({ employees: [emp], channels: [] })

        const result = yield* listEmployees({ limit: 10 }).pipe(Effect.provide(testLayer))

        expect(result).toHaveLength(1)
        expect(assertAt(result, 0).position).toBeUndefined()
      })
    )

    it.effect("returns empty array when no employees", () =>
      Effect.gen(function* () {
        const testLayer = createTestLayer({ employees: [] })

        const result = yield* listEmployees({}).pipe(Effect.provide(testLayer))

        expect(result).toEqual([])
      })
    )
  })

  describe("setEmployeePosition", () => {
    it.effect("updates the Contact Employee mixin when addressed by employee ID", () =>
      Effect.gen(function* () {
        const employee = createMockEmployee({ _id: "employee-id" as Ref<HulyEmployee>, position: "Developer" })
        const capture: MockConfig["captureUpdateMixin"] = {}
        const params = yield* parseSetEmployeePositionParams({ employee: "employee-id", position: "Engineering Lead" })

        const result = yield* setEmployeePosition(params).pipe(
          Effect.provide(createTestLayer({ employees: [employee], captureUpdateMixin: capture }))
        )

        expect(result).toEqual({ id: "employee-id", updated: true, position: "Engineering Lead" })
        expect(capture.attributes).toEqual({ position: "Engineering Lead" })
        expect(capture.objectId).toBe("employee-id")
        expect(capture.objectClass).toBe(contact.class.Person)
        expect(capture.mixin).toBe(contact.mixin.Employee)
      })
    )

    it.effect("resolves an exact email and clears whitespace as null", () =>
      Effect.gen(function* () {
        const employee = createMockEmployee({ _id: "employee-email" as Ref<HulyEmployee>, position: "Developer" })
        const person = createMockPerson({ _id: "employee-email" as Ref<HulyPerson>, name: employee.name })
        const channel = createMockChannel({ attachedTo: docRef<Doc>("employee-email"), value: "jane@example.com" })
        const capture: MockConfig["captureUpdateMixin"] = {}
        const params = yield* parseSetEmployeePositionParams({ employee: "jane@example.com", position: "   " })

        const result = yield* setEmployeePosition(params).pipe(
          Effect.provide(
            createTestLayer({
              persons: [person],
              channels: [channel],
              employees: [employee],
              captureUpdateMixin: capture
            })
          )
        )

        expect(result).toEqual({ id: "employee-email", updated: true, position: null })
        expect(capture.attributes).toEqual({ position: null })
      })
    )

    it.effect("resolves an exact display name", () =>
      Effect.gen(function* () {
        const employee = createMockEmployee({ _id: "employee-name" as Ref<HulyEmployee>, name: "Name,Employee" })
        const person = createMockPerson({ _id: "employee-name" as Ref<HulyPerson>, name: employee.name })
        const capture: MockConfig["captureUpdateMixin"] = {}
        const params = yield* parseSetEmployeePositionParams({ employee: "Name,Employee", position: "Manager" })

        const result = yield* setEmployeePosition(params).pipe(
          Effect.provide(createTestLayer({ persons: [person], employees: [employee], captureUpdateMixin: capture }))
        )

        expect(result).toEqual({ id: "employee-name", updated: true, position: "Manager" })
        expect(capture.objectId).toBe("employee-name")
      })
    )

    it.effect("does not write when the normalized position is already current", () =>
      Effect.gen(function* () {
        const employee = createMockEmployee({ _id: "employee-current" as Ref<HulyEmployee>, position: "Developer" })
        const capture: MockConfig["captureUpdateMixin"] = {}
        const params = yield* parseSetEmployeePositionParams({ employee: "employee-current", position: " Developer " })

        const result = yield* setEmployeePosition(params).pipe(
          Effect.provide(createTestLayer({ employees: [employee], captureUpdateMixin: capture }))
        )

        expect(result).toEqual({ id: "employee-current", updated: false, position: "Developer" })
        expect(capture.attributes).toBeUndefined()
      })
    )

    it.effect("rejects an ambiguous exact display name before mutating", () =>
      Effect.gen(function* () {
        const employeeOne = createMockEmployee({ _id: "employee-one" as Ref<HulyEmployee>, name: "Same,Person" })
        const employeeTwo = createMockEmployee({ _id: "employee-two" as Ref<HulyEmployee>, name: "Same,Person" })
        const personOne = createMockPerson({ _id: "employee-one" as Ref<HulyPerson>, name: "Same,Person" })
        const personTwo = createMockPerson({ _id: "employee-two" as Ref<HulyPerson>, name: "Same,Person" })
        const capture: MockConfig["captureUpdateMixin"] = {}
        const params = yield* parseSetEmployeePositionParams({ employee: "Same,Person", position: "Lead" })

        const result = Effect.runSync(
          Effect.result(
            setEmployeePosition(params).pipe(
              Effect.provide(
                createTestLayer({
                  persons: [personOne, personTwo],
                  employees: [employeeOne, employeeTwo],
                  captureUpdateMixin: capture
                })
              )
            )
          )
        )

        expect(Result.isFailure(result)).toBe(true)
        expect(capture.attributes).toBeUndefined()
      })
    )
  })

  describe("listOrganizations", () => {
    it.effect("returns organization summaries", () =>
      Effect.gen(function* () {
        const org = createMockOrganization({
          _id: "org-1" as Ref<HulyOrganization>,
          name: "Acme Corp",
          city: "SF",
          members: 10
        })

        const testLayer = createTestLayer({ organizations: [org] })

        const result = yield* listOrganizations({ limit: 10 }).pipe(Effect.provide(testLayer))

        expect(result).toHaveLength(1)
        expect(assertAt(result, 0).name).toBe("Acme Corp")
        expect(assertAt(result, 0).city).toBe("SF")
        expect(assertAt(result, 0).members).toBe(10)
      })
    )

    it.effect("returns empty array when no organizations", () =>
      Effect.gen(function* () {
        const testLayer = createTestLayer({ organizations: [] })

        const result = yield* listOrganizations({}).pipe(Effect.provide(testLayer))

        expect(result).toEqual([])
      })
    )

    it.effect("respects limit", () =>
      Effect.gen(function* () {
        const orgs = [
          createMockOrganization({ _id: "org-1" as Ref<HulyOrganization>, name: "Org 1" }),
          createMockOrganization({ _id: "org-2" as Ref<HulyOrganization>, name: "Org 2" }),
          createMockOrganization({ _id: "org-3" as Ref<HulyOrganization>, name: "Org 3" })
        ]

        const testLayer = createTestLayer({ organizations: orgs })

        const result = yield* listOrganizations({ limit: 2 }).pipe(Effect.provide(testLayer))

        expect(result).toHaveLength(2)
      })
    )
  })

  describe("createOrganization", () => {
    it.effect("creates organization without members", () =>
      Effect.gen(function* () {
        const capture: MockConfig["captureCreateDoc"] = {}

        const testLayer = createTestLayer({ captureCreateDoc: capture })

        const result = yield* createOrganization({ name: "New Org" }).pipe(Effect.provide(testLayer))

        expect(result.id).toBeDefined()
        expect(capture.data?.name).toBe("New Org")
        expect(capture.data?.city).toBe("")
        expect(capture.data?.members).toBe(0)
      })
    )

    it.effect("creates organization with member found by ID", () =>
      Effect.gen(function* () {
        const person = createMockPerson({ _id: "person-1" as Ref<HulyPerson>, name: "Doe,John" })
        const captureCreateDoc: MockConfig["captureCreateDoc"] = {}
        const captureAddCollection: MockConfig["captureAddCollection"] = {}

        const testLayer = createTestLayer({ persons: [person], captureCreateDoc, captureAddCollection })

        const result = yield* createOrganization({
          name: "Org With Members",
          members: [memberReference("person-1")]
        }).pipe(Effect.provide(testLayer))

        expect(result.id).toBeDefined()
        expect(captureAddCollection.class).toBe(contact.class.Member)
        expect(captureAddCollection.attributes?.contact).toBe("person-1")
      })
    )

    it.effect("creates organization with member found by email", () =>
      Effect.gen(function* () {
        const person = createMockPerson({ _id: "person-email-1" as Ref<HulyPerson>, name: "EmailPerson,Test" })
        const channel = createMockChannel({ attachedTo: "person-email-1" as Ref<Doc>, value: "member@example.com" })

        // Override findOne to support email-based person lookup
        const findOneImpl: HulyClientOperations["findOne"] = ((_class: unknown, query: unknown) => {
          if (_class === contact.class.Person) {
            const q = query as Record<string, unknown>
            const found = [person].find((p) => p._id === q._id)
            return Effect.succeed(found)
          }
          return Effect.succeed(undefined)
        }) as HulyClientOperations["findOne"]

        const findAllImpl: HulyClientOperations["findAll"] = ((_class: unknown, query: unknown, _options?: unknown) => {
          if (_class === contact.class.Person) {
            const q = query as Record<string, unknown>
            const idFilter = q._id
            const ids =
              typeof idFilter === "object" && idFilter !== null && "$in" in idFilter && Array.isArray(idFilter.$in)
                ? idFilter.$in
                : []
            const filtered = ids.length > 0 ? [person].filter((p) => ids.includes(p._id)) : []
            return Effect.succeed(toFindResult(filtered))
          }
          if (_class === contact.class.Channel) {
            const q = query as Record<string, unknown>
            let filtered = [channel]
            if (q.value !== undefined) {
              const value = q.value as { $like?: string } | string
              if (typeof value === "string") {
                filtered = filtered.filter((c) => c.value === value)
              }
            }
            if (q.provider !== undefined) {
              filtered = filtered.filter((c) => c.provider === q.provider)
            }
            return Effect.succeed(toFindResult(filtered))
          }
          return Effect.succeed(toFindResult([]))
        }) as HulyClientOperations["findAll"]

        const captureAddCollection: MockConfig["captureAddCollection"] = {}
        const captureCreateDoc: MockConfig["captureCreateDoc"] = {}

        const testLayer = HulyClient.testLayer({
          findAll: findAllImpl,
          findOne: findOneImpl,
          createDoc: ((_class: unknown, _space: unknown, data: unknown, id: unknown) => {
            captureCreateDoc.data = data as Record<string, unknown>
            return Effect.succeed((id ?? "new-id") as Ref<Doc>)
          }) as HulyClientOperations["createDoc"],
          addCollection: ((
            _class: unknown,
            _space: unknown,
            _attachedTo: unknown,
            _attachedToClass: unknown,
            _collection: unknown,
            attributes: unknown
          ) => {
            captureAddCollection.attributes = attributes as Record<string, unknown>
            captureAddCollection.class = _class
            return Effect.succeed("new-id" as Ref<Doc>)
          }) as HulyClientOperations["addCollection"]
        })

        const result = yield* createOrganization({
          name: "Org By Email",
          members: [memberReference("member@example.com")]
        }).pipe(Effect.provide(testLayer))

        expect(result.id).toBeDefined()
        expect(captureAddCollection.attributes?.contact).toBe("person-email-1")
      })
    )

    it.effect("fails when neither ID nor email matches", () =>
      Effect.gen(function* () {
        const captureCreateDoc: MockConfig["captureCreateDoc"] = {}
        const captureAddCollection: MockConfig["captureAddCollection"] = {}

        const testLayer = createTestLayer({ persons: [], channels: [], captureCreateDoc, captureAddCollection })

        const error = yield* Effect.flip(
          createOrganization({ name: "Org No Members", members: [memberReference("nonexistent-ref")] }).pipe(
            Effect.provide(testLayer)
          )
        )

        expect(error._tag).toBe("PersonNotFoundError")
        expect(captureAddCollection.attributes).toBeUndefined()
      })
    )

    it.effect("creates organization with empty members array", () =>
      Effect.gen(function* () {
        const captureCreateDoc: MockConfig["captureCreateDoc"] = {}
        const captureAddCollection: MockConfig["captureAddCollection"] = {}

        const testLayer = createTestLayer({ captureCreateDoc, captureAddCollection })

        const result = yield* createOrganization({ name: "Org Empty Members", members: [] }).pipe(
          Effect.provide(testLayer)
        )

        expect(result.id).toBeDefined()
        expect(captureAddCollection.attributes).toBeUndefined()
      })
    )
  })
})
