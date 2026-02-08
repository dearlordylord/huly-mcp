import { describe, it } from "@effect/vitest"
import type {
  Channel,
  Employee as HulyEmployee,
  Organization as HulyOrganization,
  Person as HulyPerson
} from "@hcengineering/contact"
import type { Doc, FindResult, PersonId as CorePersonId, Ref } from "@hcengineering/core"
import { Effect } from "effect"
import { expect } from "vitest"
import { Email, PersonId } from "../../../src/domain/schemas/shared.js"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import { contact } from "../../../src/huly/huly-plugins.js"
import {
  createOrganization,
  getPerson,
  listEmployees,
  listOrganizations,
  listPersons,
  updatePerson
} from "../../../src/huly/operations/contacts.js"

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
    modifiedOn: Date.now(),
    createdBy: "user" as CorePersonId,
    createdOn: Date.now(),
    ...overrides
  }
  return data as Channel
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

interface MockConfig {
  persons?: Array<HulyPerson>
  channels?: Array<Channel>
  employees?: Array<HulyEmployee>
  organizations?: Array<HulyOrganization>
  captureCreateDoc?: { data?: Record<string, unknown>; id?: string; class?: unknown }
  captureAddCollection?: { attributes?: Record<string, unknown>; attachedTo?: string; class?: unknown }
  captureUpdateDoc?: { operations?: Record<string, unknown> }
  captureRemoveDoc?: { id?: string }
}

const createTestLayer = (config: MockConfig) => {
  const persons = config.persons ?? []
  const channels = config.channels ?? []
  const employees = config.employees ?? []
  const organizations = config.organizations ?? []

  const matchesLike = (value: string, pattern: string): boolean => {
    const escaped = pattern.replace(/%/g, ".*").replace(/_/g, ".")
    return new RegExp(`^${escaped}$`, "i").test(value)
  }

  const findAllImpl: HulyClientOperations["findAll"] = ((_class: unknown, query: unknown, options?: unknown) => {
    if (_class === contact.class.Person) {
      const q = (query ?? {}) as Record<string, unknown>
      let filtered = persons
      if (q._id !== undefined) {
        const idFilter = q._id as { $in?: Array<unknown> } | unknown
        if (typeof idFilter === "object" && idFilter !== null && "$in" in idFilter) {
          const ids = idFilter.$in as Array<unknown>
          filtered = filtered.filter(p => ids.includes(p._id))
        }
      }
      if (q.name !== undefined) {
        const nameFilter = q.name as { $like?: string } | string
        if (typeof nameFilter === "object" && "$like" in nameFilter) {
          filtered = filtered.filter(p => matchesLike(p.name, nameFilter.$like!))
        }
      }
      const opts = (options ?? {}) as { limit?: number }
      if (opts.limit !== undefined) {
        filtered = filtered.slice(0, opts.limit)
      }
      return Effect.succeed(toFindResult(filtered as Array<Doc>))
    }
    if (_class === contact.class.Channel) {
      const q = query as Record<string, unknown>
      let filtered = channels
      if (q.attachedTo !== undefined) {
        const attachedTo = q.attachedTo as { $in?: Array<unknown> } | unknown
        if (typeof attachedTo === "object" && attachedTo !== null && "$in" in attachedTo) {
          const ids = attachedTo.$in as Array<unknown>
          filtered = filtered.filter(c => ids.includes(c.attachedTo))
        } else {
          filtered = filtered.filter(c => c.attachedTo === q.attachedTo)
        }
      }
      if (q.provider !== undefined) {
        filtered = filtered.filter(c => c.provider === q.provider)
      }
      if (q.value !== undefined) {
        const value = q.value as { $like?: string } | string
        if (typeof value === "object" && "$like" in value) {
          filtered = filtered.filter(c => matchesLike(c.value, value.$like!))
        } else {
          filtered = filtered.filter(c => c.value === value)
        }
      }
      return Effect.succeed(toFindResult(filtered as Array<Doc>))
    }
    if (_class === contact.mixin.Employee) {
      const opts = (options ?? {}) as { limit?: number }
      let filtered = [...employees]
      if (opts.limit !== undefined) {
        filtered = filtered.slice(0, opts.limit)
      }
      return Effect.succeed(toFindResult(filtered as Array<Doc>))
    }
    if (_class === contact.class.Organization) {
      const opts = (options ?? {}) as { limit?: number }
      let filtered = [...organizations]
      if (opts.limit !== undefined) {
        filtered = filtered.slice(0, opts.limit)
      }
      return Effect.succeed(toFindResult(filtered as Array<Doc>))
    }
    if (_class === contact.class.Member) {
      return Effect.succeed(toFindResult([] as Array<Doc>))
    }
    return Effect.succeed(toFindResult([] as Array<Doc>))
  }) as HulyClientOperations["findAll"]

  const findOneImpl: HulyClientOperations["findOne"] = ((_class: unknown, query: unknown) => {
    if (_class === contact.class.Person) {
      const q = query as Record<string, unknown>
      const found = persons.find(p => p._id === q._id)
      return Effect.succeed(found as Doc | undefined)
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

  const removeDocImpl: HulyClientOperations["removeDoc"] = ((
    _class: unknown,
    _space: unknown,
    objectId: unknown
  ) => {
    if (config.captureRemoveDoc) {
      config.captureRemoveDoc.id = String(objectId)
    }
    return Effect.succeed({})
  }) as HulyClientOperations["removeDoc"]

  return HulyClient.testLayer({
    findAll: findAllImpl,
    findOne: findOneImpl,
    createDoc: createDocImpl,
    addCollection: addCollectionImpl,
    updateDoc: updateDocImpl,
    removeDoc: removeDocImpl
  })
}

describe("Contacts Extended Coverage", () => {
  describe("getPerson by email (findPersonByEmail path)", () => {
    // test-revizorro: approved
    it.effect("finds person by email when channel exists", () =>
      Effect.gen(function*() {
        const mockPerson = createMockPerson()
        const mockChannel = createMockChannel({
          value: "john@example.com",
          attachedTo: "person-123" as Ref<Doc>
        })

        const testLayer = createTestLayer({
          persons: [mockPerson],
          channels: [mockChannel]
        })

        const result = yield* getPerson({ email: Email.make("john@example.com") }).pipe(
          Effect.provide(testLayer)
        )

        expect(result.id).toBe("person-123")
        expect(result.email).toBe("john@example.com")
      }))

    // test-revizorro: approved
    it.effect("returns PersonNotFoundError when email channel exists but person does not", () =>
      Effect.gen(function*() {
        const mockChannel = createMockChannel({
          value: "orphan@example.com",
          attachedTo: "nonexistent-person" as Ref<Doc>
        })

        const testLayer = createTestLayer({
          persons: [],
          channels: [mockChannel]
        })

        const error = yield* Effect.flip(
          getPerson({ email: Email.make("orphan@example.com") }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("PersonNotFoundError")
      }))

    // test-revizorro: approved
    it.effect("returns PersonNotFoundError when no matching email channel", () =>
      Effect.gen(function*() {
        const testLayer = createTestLayer({
          persons: [],
          channels: []
        })

        const error = yield* Effect.flip(
          getPerson({ email: Email.make("nobody@example.com") }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("PersonNotFoundError")
      }))
  })

  describe("batchGetEmailsForPersons - duplicate channels", () => {
    // test-revizorro: approved
    it.effect("keeps only first email for a person when multiple channels exist", () =>
      Effect.gen(function*() {
        const person = createMockPerson({
          _id: "person-dup" as Ref<HulyPerson>,
          name: "Dup,Person"
        })
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

        const testLayer = createTestLayer({
          persons: [person],
          channels: [channel1, channel2]
        })

        const result = yield* listPersons({ limit: 10 }).pipe(Effect.provide(testLayer))

        expect(result).toHaveLength(1)
        expect(result[0].email).toBe("first@example.com")
      }))
  })

  describe("listPersons with nameSearch", () => {
    // test-revizorro: suspect | weak assertion: toBeGreaterThanOrEqual(1) doesn't verify filter works, should check exact count and name match
    it.effect("applies nameSearch filter", () =>
      Effect.gen(function*() {
        const person1 = createMockPerson({
          _id: "person-1" as Ref<HulyPerson>,
          name: "Doe,John"
        })
        const person2 = createMockPerson({
          _id: "person-2" as Ref<HulyPerson>,
          name: "Smith,Jane"
        })

        const testLayer = createTestLayer({
          persons: [person1, person2],
          channels: []
        })

        const result = yield* listPersons({ nameSearch: "Doe", limit: 10 }).pipe(
          Effect.provide(testLayer)
        )

        expect(result.length).toBeGreaterThanOrEqual(1)
      }))

    // test-revizorro: approved
    it.effect("ignores empty nameSearch", () =>
      Effect.gen(function*() {
        const person1 = createMockPerson()

        const testLayer = createTestLayer({
          persons: [person1],
          channels: []
        })

        const result = yield* listPersons({ nameSearch: "  ", limit: 10 }).pipe(
          Effect.provide(testLayer)
        )

        expect(result).toHaveLength(1)
      }))
  })

  describe("updatePerson name update branches", () => {
    // test-revizorro: approved
    it.effect("updates only lastName while keeping firstName", () =>
      Effect.gen(function*() {
        const mockPerson = createMockPerson({ name: "Doe,John" })
        const capture: MockConfig["captureUpdateDoc"] = {}

        const testLayer = createTestLayer({
          persons: [mockPerson],
          captureUpdateDoc: capture
        })

        const result = yield* updatePerson({
          personId: PersonId.make("person-123"),
          lastName: "Smith"
        }).pipe(Effect.provide(testLayer))

        expect(result.updated).toBe(true)
        expect(capture.operations?.name).toBe("Smith,John")
      }))

    // test-revizorro: approved
    it.effect("updates city to a non-null value", () =>
      Effect.gen(function*() {
        const mockPerson = createMockPerson({ city: "NYC" })
        const capture: MockConfig["captureUpdateDoc"] = {}

        const testLayer = createTestLayer({
          persons: [mockPerson],
          captureUpdateDoc: capture
        })

        const result = yield* updatePerson({
          personId: PersonId.make("person-123"),
          city: "LA"
        }).pipe(Effect.provide(testLayer))

        expect(result.updated).toBe(true)
        expect(capture.operations?.city).toBe("LA")
      }))
  })

  describe("listEmployees", () => {
    // test-revizorro: scheduled
    it.effect("returns employee summaries with emails", () =>
      Effect.gen(function*() {
        const emp = createMockEmployee({
          _id: "employee-1" as Ref<HulyEmployee>,
          name: "Smith,Jane",
          active: true,
          position: "Developer"
        })
        const empChannel = createMockChannel({
          attachedTo: "employee-1" as Ref<Doc>,
          value: "jane@company.com"
        })

        const testLayer = createTestLayer({
          employees: [emp],
          channels: [empChannel]
        })

        const result = yield* listEmployees({ limit: 10 }).pipe(Effect.provide(testLayer))

        expect(result).toHaveLength(1)
        expect(result[0].name).toBe("Smith,Jane")
        expect(result[0].email).toBe("jane@company.com")
        expect(result[0].active).toBe(true)
        expect(result[0].position).toBe("Developer")
      }))

    // test-revizorro: approved
    it.effect("returns employees without email when no channel exists", () =>
      Effect.gen(function*() {
        const emp = createMockEmployee({
          _id: "employee-2" as Ref<HulyEmployee>,
          name: "Brown,Bob",
          active: false
        })

        const testLayer = createTestLayer({
          employees: [emp],
          channels: []
        })

        const result = yield* listEmployees({ limit: 10 }).pipe(Effect.provide(testLayer))

        expect(result).toHaveLength(1)
        expect(result[0].email).toBeUndefined()
        expect(result[0].active).toBe(false)
      }))

    // test-revizorro: approved
    it.effect("returns employees with position undefined when not set", () =>
      Effect.gen(function*() {
        const emp = createMockEmployee({
          _id: "employee-3" as Ref<HulyEmployee>,
          // eslint-disable-next-line no-restricted-syntax -- test mock requires double cast through unknown
          position: null as unknown as string
        })

        const testLayer = createTestLayer({
          employees: [emp],
          channels: []
        })

        const result = yield* listEmployees({ limit: 10 }).pipe(Effect.provide(testLayer))

        expect(result).toHaveLength(1)
        expect(result[0].position).toBeUndefined()
      }))

    // test-revizorro: approved
    it.effect("returns empty array when no employees", () =>
      Effect.gen(function*() {
        const testLayer = createTestLayer({ employees: [] })

        const result = yield* listEmployees({}).pipe(Effect.provide(testLayer))

        expect(result).toEqual([])
      }))
  })

  describe("listOrganizations", () => {
    // test-revizorro: approved
    it.effect("returns organization summaries", () =>
      Effect.gen(function*() {
        const org = createMockOrganization({
          _id: "org-1" as Ref<HulyOrganization>,
          name: "Acme Corp",
          city: "SF",
          members: 10
        })

        const testLayer = createTestLayer({
          organizations: [org]
        })

        const result = yield* listOrganizations({ limit: 10 }).pipe(Effect.provide(testLayer))

        expect(result).toHaveLength(1)
        expect(result[0].name).toBe("Acme Corp")
        expect(result[0].city).toBe("SF")
        expect(result[0].members).toBe(10)
      }))

    // test-revizorro: approved
    it.effect("returns empty array when no organizations", () =>
      Effect.gen(function*() {
        const testLayer = createTestLayer({ organizations: [] })

        const result = yield* listOrganizations({}).pipe(Effect.provide(testLayer))

        expect(result).toEqual([])
      }))

    // test-revizorro: approved
    it.effect("respects limit", () =>
      Effect.gen(function*() {
        const orgs = [
          createMockOrganization({ _id: "org-1" as Ref<HulyOrganization>, name: "Org 1" }),
          createMockOrganization({ _id: "org-2" as Ref<HulyOrganization>, name: "Org 2" }),
          createMockOrganization({ _id: "org-3" as Ref<HulyOrganization>, name: "Org 3" })
        ]

        const testLayer = createTestLayer({ organizations: orgs })

        const result = yield* listOrganizations({ limit: 2 }).pipe(Effect.provide(testLayer))

        expect(result).toHaveLength(2)
      }))
  })

  describe("createOrganization", () => {
    // test-revizorro: approved
    it.effect("creates organization without members", () =>
      Effect.gen(function*() {
        const capture: MockConfig["captureCreateDoc"] = {}

        const testLayer = createTestLayer({
          captureCreateDoc: capture
        })

        const result = yield* createOrganization({
          name: "New Org"
        }).pipe(Effect.provide(testLayer))

        expect(result.id).toBeDefined()
        expect(capture.data?.name).toBe("New Org")
        expect(capture.data?.city).toBe("")
        expect(capture.data?.members).toBe(0)
      }))

    // test-revizorro: approved
    it.effect("creates organization with member found by ID", () =>
      Effect.gen(function*() {
        const person = createMockPerson({
          _id: "person-1" as Ref<HulyPerson>,
          name: "Doe,John"
        })
        const captureCreateDoc: MockConfig["captureCreateDoc"] = {}
        const captureAddCollection: MockConfig["captureAddCollection"] = {}

        const testLayer = createTestLayer({
          persons: [person],
          captureCreateDoc,
          captureAddCollection
        })

        const result = yield* createOrganization({
          name: "Org With Members",
          members: ["person-1"]
        }).pipe(Effect.provide(testLayer))

        expect(result.id).toBeDefined()
        expect(captureAddCollection.class).toBe(contact.class.Member)
        expect(captureAddCollection.attributes?.contact).toBe("person-1")
      }))

    // test-revizorro: approved
    it.effect("creates organization with member found by email", () =>
      Effect.gen(function*() {
        const person = createMockPerson({
          _id: "person-email-1" as Ref<HulyPerson>,
          name: "EmailPerson,Test"
        })
        const channel = createMockChannel({
          attachedTo: "person-email-1" as Ref<Doc>,
          value: "member@example.com"
        })

        // Override findOne to support email-based person lookup
        const findOneImpl: HulyClientOperations["findOne"] = ((_class: unknown, query: unknown) => {
          if (_class === contact.class.Person) {
            const q = query as Record<string, unknown>
            const found = [person].find(p => p._id === q._id)
            return Effect.succeed(found as Doc | undefined)
          }
          return Effect.succeed(undefined)
        }) as HulyClientOperations["findOne"]

        const findAllImpl: HulyClientOperations["findAll"] = ((_class: unknown, query: unknown, _options?: unknown) => {
          if (_class === contact.class.Channel) {
            const q = query as Record<string, unknown>
            let filtered = [channel]
            if (q.value !== undefined) {
              const value = q.value as { $like?: string } | string
              if (typeof value === "string") {
                filtered = filtered.filter(c => c.value === value)
              }
            }
            if (q.provider !== undefined) {
              filtered = filtered.filter(c => c.provider === q.provider)
            }
            return Effect.succeed(toFindResult(filtered as Array<Doc>))
          }
          return Effect.succeed(toFindResult([] as Array<Doc>))
        }) as HulyClientOperations["findAll"]

        const captureAddCollection: MockConfig["captureAddCollection"] = {}
        const captureCreateDoc: MockConfig["captureCreateDoc"] = {}

        const testLayer = HulyClient.testLayer({
          findAll: findAllImpl,
          findOne: findOneImpl,
          createDoc: ((
            _class: unknown,
            _space: unknown,
            data: unknown,
            id: unknown
          ) => {
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
          members: ["member@example.com"]
        }).pipe(Effect.provide(testLayer))

        expect(result.id).toBeDefined()
        expect(captureAddCollection.attributes?.contact).toBe("person-email-1")
      }))

    // test-revizorro: approved
    it.effect("skips member when neither ID nor email matches", () =>
      Effect.gen(function*() {
        const captureCreateDoc: MockConfig["captureCreateDoc"] = {}
        const captureAddCollection: MockConfig["captureAddCollection"] = {}

        const testLayer = createTestLayer({
          persons: [],
          channels: [],
          captureCreateDoc,
          captureAddCollection
        })

        const result = yield* createOrganization({
          name: "Org No Members",
          members: ["nonexistent-ref"]
        }).pipe(Effect.provide(testLayer))

        expect(result.id).toBeDefined()
        // addCollection for member should not have been called
        expect(captureAddCollection.attributes).toBeUndefined()
      }))

    // test-revizorro: approved
    it.effect("creates organization with empty members array", () =>
      Effect.gen(function*() {
        const captureCreateDoc: MockConfig["captureCreateDoc"] = {}
        const captureAddCollection: MockConfig["captureAddCollection"] = {}

        const testLayer = createTestLayer({
          captureCreateDoc,
          captureAddCollection
        })

        const result = yield* createOrganization({
          name: "Org Empty Members",
          members: []
        }).pipe(Effect.provide(testLayer))

        expect(result.id).toBeDefined()
        expect(captureAddCollection.attributes).toBeUndefined()
      }))
  })
})
