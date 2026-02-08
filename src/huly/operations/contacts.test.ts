import type { Channel, Person as HulyPerson } from "@hcengineering/contact"
import type { Doc, FindResult, Ref, Space } from "@hcengineering/core"
import { Effect, Exit } from "effect"
import { describe, expect, it } from "vitest"

import { Email, PersonId } from "../../domain/schemas/shared.js"
import type { HulyClientOperations } from "../client.js"
import { HulyClient } from "../client.js"
import { createPerson, deletePerson, getPerson, listPersons, updatePerson } from "./contacts.js"

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/consistent-type-imports -- CJS interop
const contact = require("@hcengineering/contact").default as typeof import("@hcengineering/contact").default

/* eslint-disable @typescript-eslint/consistent-type-assertions -- test mock factories */
const createMockPerson = (overrides: Partial<HulyPerson> = {}): HulyPerson =>
  ({
    _id: "person-123" as Ref<HulyPerson>,
    _class: contact.class.Person,
    name: "Doe,John",
    city: "NYC",
    space: contact.space.Contacts as Ref<Space>,
    modifiedOn: 1700000000000,
    modifiedBy: "user" as Ref<Doc>,
    createdOn: 1699000000000,
    createdBy: "user" as Ref<Doc>,
    ...overrides
  }) as HulyPerson

const createMockChannel = (overrides: Partial<Channel> = {}): Channel =>
  ({
    _id: "channel-1" as Ref<Channel>,
    _class: contact.class.Channel,
    space: contact.space.Contacts as Ref<Space>,
    attachedTo: "person-123" as Ref<Doc>,
    attachedToClass: contact.class.Person,
    collection: "channels",
    provider: contact.channelProvider.Email,
    value: "john@example.com",
    modifiedBy: "user" as Ref<Doc>,
    modifiedOn: Date.now(),
    createdBy: "user" as Ref<Doc>,
    createdOn: Date.now(),
    ...overrides
  }) as Channel
/* eslint-enable @typescript-eslint/consistent-type-assertions */

interface MockConfig {
  persons?: Array<HulyPerson>
  channels?: Array<Channel>
  captureCreateDoc?: { data?: Record<string, unknown> }
  captureAddCollection?: { attributes?: Record<string, unknown> }
  captureUpdateDoc?: { operations?: Record<string, unknown> }
  captureRemoveDoc?: { id?: string }
}

const createTestLayer = (config: MockConfig) => {
  const persons = config.persons ?? []
  const channels = config.channels ?? []

  const findAllImpl: HulyClientOperations["findAll"] = ((_class: unknown, query: unknown) => {
    if (_class === contact.class.Person) {
      return Effect.succeed(persons as unknown as FindResult<Doc>)
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
        filtered = filtered.filter(c => c.value === q.value)
      }
      return Effect.succeed(filtered as unknown as FindResult<Doc>)
    }
    return Effect.succeed([] as unknown as FindResult<Doc>)
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
    }
    return Effect.succeed((id ?? "new-id") as Ref<Doc>)
  }) as HulyClientOperations["createDoc"]

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const addCollectionImpl: any = (
    _class: unknown,
    _space: unknown,
    _attachedTo: unknown,
    _attachedToClass: unknown,
    _collection: unknown,
    attributes: unknown
  ) => {
    if (config.captureAddCollection) {
      config.captureAddCollection.attributes = attributes as Record<string, unknown>
    }
    return Effect.succeed("new-channel-id" as Ref<Doc>)
  }

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

describe("Contacts Operations", () => {
  describe("listPersons", () => {
    it("returns empty array when no persons exist", async () => {
      const testLayer = createTestLayer({ persons: [] })

      const result = await Effect.runPromise(
        listPersons({ limit: 10 }).pipe(Effect.provide(testLayer))
      )

      expect(result).toEqual([])
    })

    it("transforms persons with email channels", async () => {
      const mockPerson = createMockPerson()
      const mockChannel = createMockChannel()

      const testLayer = createTestLayer({
        persons: [mockPerson],
        channels: [mockChannel]
      })

      const result = await Effect.runPromise(
        listPersons({ limit: 10 }).pipe(Effect.provide(testLayer))
      )

      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        id: "person-123",
        name: "Doe,John",
        city: "NYC",
        email: "john@example.com"
      })
    })

    it("handles persons without email", async () => {
      const mockPerson = createMockPerson()

      const testLayer = createTestLayer({
        persons: [mockPerson],
        channels: []
      })

      const result = await Effect.runPromise(
        listPersons({ limit: 10 }).pipe(Effect.provide(testLayer))
      )

      expect(result).toHaveLength(1)
      expect(result[0].email).toBeUndefined()
    })

    it("handles persons without city", async () => {
      // Create person without city - use a spread from a valid person and delete city
      const basePerson = createMockPerson()

      const { city: _city, ...personWithoutCity } = basePerson
      const mockPerson = personWithoutCity as HulyPerson

      const testLayer = createTestLayer({
        persons: [mockPerson],
        channels: []
      })

      const result = await Effect.runPromise(
        listPersons({ limit: 10 }).pipe(Effect.provide(testLayer))
      )

      expect(result).toHaveLength(1)
      expect(result[0].city).toBeUndefined()
    })

    it("correctly associates emails with multiple persons", async () => {
      const person1 = createMockPerson({
        _id: "person-1" as Ref<HulyPerson>,
        name: "Doe,John"
      })
      const person2 = createMockPerson({
        _id: "person-2" as Ref<HulyPerson>,
        name: "Smith,Jane"
      })
      const person3 = createMockPerson({
        _id: "person-3" as Ref<HulyPerson>,
        name: "Brown,Bob"
      })

      const channel1 = createMockChannel({
        _id: "channel-1" as Ref<Channel>,
        attachedTo: "person-1" as Ref<Doc>,
        value: "john@example.com"
      })
      const channel2 = createMockChannel({
        _id: "channel-2" as Ref<Channel>,
        attachedTo: "person-2" as Ref<Doc>,
        value: "jane@example.com"
      })
      const channel3 = createMockChannel({
        _id: "channel-3" as Ref<Channel>,
        attachedTo: "person-3" as Ref<Doc>,
        value: "bob@example.com"
      })

      const testLayer = createTestLayer({
        persons: [person1, person2, person3],
        channels: [channel1, channel2, channel3]
      })

      const result = await Effect.runPromise(
        listPersons({ limit: 10 }).pipe(Effect.provide(testLayer))
      )

      expect(result).toHaveLength(3)
      const resultMap = new Map(result.map(p => [p.id, p]))
      expect(resultMap.get(PersonId.make("person-1"))?.email).toBe("john@example.com")
      expect(resultMap.get(PersonId.make("person-2"))?.email).toBe("jane@example.com")
      expect(resultMap.get(PersonId.make("person-3"))?.email).toBe("bob@example.com")
    })
  })

  describe("getPerson", () => {
    it("returns person by ID", async () => {
      const mockPerson = createMockPerson()
      const mockChannel = createMockChannel()

      const testLayer = createTestLayer({
        persons: [mockPerson],
        channels: [mockChannel]
      })

      const result = await Effect.runPromise(
        getPerson({ personId: PersonId.make("person-123") }).pipe(Effect.provide(testLayer))
      )

      expect(result).toMatchObject({
        id: "person-123",
        firstName: "John",
        lastName: "Doe",
        city: "NYC",
        email: "john@example.com"
      })
    })

    it("fails with PersonNotFoundError when person doesn't exist", async () => {
      const testLayer = createTestLayer({ persons: [] })

      const result = await Effect.runPromiseExit(
        getPerson({ personId: PersonId.make("nonexistent") }).pipe(Effect.provide(testLayer))
      )

      expect(Exit.isFailure(result)).toBe(true)
    })

    it("parses name with comma correctly", async () => {
      const mockPerson = createMockPerson({ name: "Smith,Jane" })

      const testLayer = createTestLayer({
        persons: [mockPerson],
        channels: []
      })

      const result = await Effect.runPromise(
        getPerson({ personId: PersonId.make("person-123") }).pipe(Effect.provide(testLayer))
      )

      expect(result.firstName).toBe("Jane")
      expect(result.lastName).toBe("Smith")
    })

    it("handles name without comma", async () => {
      const mockPerson = createMockPerson({ name: "SingleName" })

      const testLayer = createTestLayer({
        persons: [mockPerson],
        channels: []
      })

      const result = await Effect.runPromise(
        getPerson({ personId: PersonId.make("person-123") }).pipe(Effect.provide(testLayer))
      )

      expect(result.firstName).toBe("SingleName")
      expect(result.lastName).toBe("")
    })

    it("handles name with multiple commas", async () => {
      const mockPerson = createMockPerson({ name: "Doe,John,Jr" })

      const testLayer = createTestLayer({
        persons: [mockPerson],
        channels: []
      })

      const result = await Effect.runPromise(
        getPerson({ personId: PersonId.make("person-123") }).pipe(Effect.provide(testLayer))
      )

      expect(result.firstName).toBe("John,Jr")
      expect(result.lastName).toBe("Doe")
    })

    it("finds person by email", async () => {
      const mockPerson = createMockPerson()
      const mockChannel = createMockChannel({ value: "john@example.com" })

      const testLayer = createTestLayer({
        persons: [mockPerson],
        channels: [mockChannel]
      })

      const result = await Effect.runPromise(
        getPerson({ email: Email.make("john@example.com") }).pipe(Effect.provide(testLayer))
      )

      expect(result).toMatchObject({
        id: "person-123",
        email: "john@example.com"
      })
    })

    it("fails with PersonNotFoundError when email not found", async () => {
      const testLayer = createTestLayer({ persons: [], channels: [] })

      const result = await Effect.runPromiseExit(
        getPerson({ email: Email.make("nonexistent@example.com") }).pipe(Effect.provide(testLayer))
      )

      expect(Exit.isFailure(result)).toBe(true)
    })
  })

  describe("createPerson", () => {
    it("creates person with required fields", async () => {
      const capture: MockConfig["captureCreateDoc"] = {}

      const testLayer = createTestLayer({
        captureCreateDoc: capture
      })

      const result = await Effect.runPromise(
        createPerson({
          firstName: "John",
          lastName: "Doe"
        }).pipe(Effect.provide(testLayer))
      )

      expect(result.id).toBeDefined()
      expect(capture.data?.name).toBe("Doe,John")
      expect(capture.data?.city).toBe("")
    })

    it("creates person with city", async () => {
      const capture: MockConfig["captureCreateDoc"] = {}

      const testLayer = createTestLayer({
        captureCreateDoc: capture
      })

      await Effect.runPromise(
        createPerson({
          firstName: "John",
          lastName: "Doe",
          city: "NYC"
        }).pipe(Effect.provide(testLayer))
      )

      expect(capture.data?.city).toBe("NYC")
    })

    it("creates email channel when email provided", async () => {
      const channelCapture: MockConfig["captureAddCollection"] = {}

      const testLayer = createTestLayer({
        captureAddCollection: channelCapture
      })

      await Effect.runPromise(
        createPerson({
          firstName: "John",
          lastName: "Doe",
          email: Email.make("john@example.com")
        }).pipe(Effect.provide(testLayer))
      )

      expect(channelCapture.attributes?.value).toBe("john@example.com")
    })

    it("skips email channel for empty email", async () => {
      const channelCapture: MockConfig["captureAddCollection"] = {}

      const testLayer = createTestLayer({
        captureAddCollection: channelCapture
      })

      await Effect.runPromise(
        createPerson({
          firstName: "John",
          lastName: "Doe",
          email: Email.make("   ")
        }).pipe(Effect.provide(testLayer))
      )

      expect(channelCapture.attributes).toBeUndefined()
    })
  })

  describe("updatePerson", () => {
    it("returns updated=false when no changes", async () => {
      const mockPerson = createMockPerson()

      const testLayer = createTestLayer({
        persons: [mockPerson]
      })

      const result = await Effect.runPromise(
        updatePerson({ personId: PersonId.make("person-123") }).pipe(Effect.provide(testLayer))
      )

      expect(result.updated).toBe(false)
    })

    it("updates firstName", async () => {
      const mockPerson = createMockPerson({ name: "Doe,John" })
      const capture: MockConfig["captureUpdateDoc"] = {}

      const testLayer = createTestLayer({
        persons: [mockPerson],
        captureUpdateDoc: capture
      })

      const result = await Effect.runPromise(
        updatePerson({
          personId: PersonId.make("person-123"),
          firstName: "Jane"
        }).pipe(Effect.provide(testLayer))
      )

      expect(result.updated).toBe(true)
      expect(capture.operations?.name).toBe("Doe,Jane")
    })

    it("clears city when set to null", async () => {
      const mockPerson = createMockPerson({ city: "NYC" })
      const capture: MockConfig["captureUpdateDoc"] = {}

      const testLayer = createTestLayer({
        persons: [mockPerson],
        captureUpdateDoc: capture
      })

      const result = await Effect.runPromise(
        updatePerson({
          personId: PersonId.make("person-123"),
          city: null
        }).pipe(Effect.provide(testLayer))
      )

      expect(result.updated).toBe(true)
      expect(capture.operations?.city).toBe("")
    })

    it("fails when person not found", async () => {
      const testLayer = createTestLayer({ persons: [] })

      const result = await Effect.runPromiseExit(
        updatePerson({ personId: PersonId.make("nonexistent") }).pipe(Effect.provide(testLayer))
      )

      expect(Exit.isFailure(result)).toBe(true)
    })
  })

  describe("deletePerson", () => {
    it("deletes existing person", async () => {
      const mockPerson = createMockPerson()
      const capture: MockConfig["captureRemoveDoc"] = {}

      const testLayer = createTestLayer({
        persons: [mockPerson],
        captureRemoveDoc: capture
      })

      const result = await Effect.runPromise(
        deletePerson({ personId: PersonId.make("person-123") }).pipe(Effect.provide(testLayer))
      )

      expect(result.deleted).toBe(true)
      expect(capture.id).toBe("person-123")
    })

    it("fails when person not found", async () => {
      const testLayer = createTestLayer({ persons: [] })

      const result = await Effect.runPromiseExit(
        deletePerson({ personId: PersonId.make("nonexistent") }).pipe(Effect.provide(testLayer))
      )

      expect(Exit.isFailure(result)).toBe(true)
    })
  })
})
