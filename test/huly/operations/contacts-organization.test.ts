import { describe, it } from "@effect/vitest"
import type {
  Channel,
  Contact,
  Member as HulyMember,
  Organization as HulyOrganization,
  Person as HulyPerson
} from "@hcengineering/contact"
import type { Doc, FindResult, PersonId as CorePersonId, Ref } from "@hcengineering/core"
import { Effect } from "effect"
import { expect } from "vitest"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import { contact } from "../../../src/huly/huly-plugins.js"
import {
  addOrganizationChannel,
  addOrganizationMember,
  deleteOrganization,
  getOrganization,
  listOrganizationMembers,
  listPersonOrganizations,
  makeOrganizationCustomer,
  removeOrganizationMember,
  updateOrganization
} from "../../../src/huly/operations/contacts.js"
import { organizationId, personId } from "../../helpers/brands.js"

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

const createMockOrganization = (overrides: Partial<HulyOrganization> = {}): HulyOrganization => {
  const data = {
    _id: "org-1" as Ref<HulyOrganization>,
    _class: contact.class.Organization,
    name: "Test Corp",
    city: "SF",
    members: 5,
    description: null,
    space: contact.space.Contacts,
    modifiedOn: 1700000000000,
    modifiedBy: "user" as CorePersonId,
    createdOn: 1699000000000,
    createdBy: "user" as CorePersonId,
    ...overrides
  }
  return data as HulyOrganization
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

const createMockMember = (overrides: Partial<HulyMember> = {}): HulyMember => {
  const data = {
    _id: "member-1" as Ref<HulyMember>,
    _class: contact.class.Member,
    space: contact.space.Contacts,
    attachedTo: "org-1" as Ref<Doc>,
    attachedToClass: contact.class.Organization,
    collection: "members",
    contact: "person-123" as Ref<Contact>,
    modifiedBy: "user" as CorePersonId,
    modifiedOn: 0,
    createdBy: "user" as CorePersonId,
    createdOn: 0,
    ...overrides
  }
  return data as HulyMember
}

interface MockConfig {
  persons?: Array<HulyPerson>
  channels?: Array<Channel>
  organizations?: Array<HulyOrganization>
  members?: Array<HulyMember>
  captureCreateDoc?: { data?: Record<string, unknown>; id?: string; class?: unknown }
  captureAddCollection?: { attributes?: Record<string, unknown>; attachedTo?: string; class?: unknown }
  captureUpdateDoc?: { operations?: Record<string, unknown> }
  captureRemoveDoc?: { id?: string }
  captureCreateMixin?: { mixin?: unknown; data?: Record<string, unknown>; objectId?: string }
  fetchMarkupResult?: string
  uploadMarkupResult?: string
}

const createTestLayer = (config: MockConfig) => {
  const persons = config.persons ?? []
  const channels = config.channels ?? []
  const organizations = config.organizations ?? []
  const members = config.members ?? []

  const findAllImpl: HulyClientOperations["findAll"] = ((_class: unknown, query: unknown, _options?: unknown) => {
    if (_class === contact.class.Channel) {
      const q = (query ?? {}) as Record<string, unknown>
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
      return Effect.succeed(toFindResult(filtered))
    }
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
      return Effect.succeed(toFindResult(filtered))
    }
    if (_class === contact.class.Organization) {
      const q = (query ?? {}) as Record<string, unknown>
      let filtered = organizations
      if (q._id !== undefined) {
        const idFilter = q._id as { $in?: Array<unknown> } | unknown
        if (typeof idFilter === "object" && idFilter !== null && "$in" in idFilter) {
          const ids = idFilter.$in as Array<unknown>
          filtered = filtered.filter(o => ids.includes(o._id))
        }
      }
      return Effect.succeed(toFindResult(filtered))
    }
    if (_class === contact.class.Member) {
      const q = (query ?? {}) as Record<string, unknown>
      let filtered = members
      if (q.attachedTo !== undefined) {
        filtered = filtered.filter(m => m.attachedTo === q.attachedTo)
      }
      if (q.contact !== undefined) {
        // eslint-disable-next-line no-restricted-syntax -- test mock: Member.contact is not exposed in the TS interface
        filtered = filtered.filter(m => (m as unknown as Record<string, unknown>).contact === q.contact)
      }
      return Effect.succeed(toFindResult(filtered))
    }
    return Effect.succeed(toFindResult([]))
  }) as HulyClientOperations["findAll"]

  const findOneImpl: HulyClientOperations["findOne"] = ((_class: unknown, query: unknown) => {
    if (_class === contact.class.Organization) {
      const q = query as Record<string, unknown>
      // findOrganizationByIdentifier: first by _id, then by name
      if (q._id !== undefined) {
        const found = organizations.find(o => o._id === q._id)
        return Effect.succeed(found)
      }
      if (q.name !== undefined) {
        const found = organizations.find(o => o.name === q.name)
        return Effect.succeed(found)
      }
      return Effect.succeed(undefined)
    }
    if (_class === contact.class.Person) {
      const q = query as Record<string, unknown>
      const found = persons.find(p => p._id === q._id)
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
    return Effect.succeed("new-collection-id" as Ref<Doc>)
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

  const fetchMarkupImpl: HulyClientOperations["fetchMarkup"] = ((
    _objectClass: unknown,
    _objectId: unknown,
    _objectAttr: unknown,
    _id: unknown,
    _format: unknown
  ) => {
    return Effect.succeed(config.fetchMarkupResult ?? "# Mock description")
  }) as HulyClientOperations["fetchMarkup"]

  const uploadMarkupImpl: HulyClientOperations["uploadMarkup"] = ((
    _objectClass: unknown,
    _objectId: unknown,
    _objectAttr: unknown,
    _markup: unknown,
    _format: unknown
  ) => {
    return Effect.succeed((config.uploadMarkupResult ?? "markup-ref-1") as unknown)
  }) as HulyClientOperations["uploadMarkup"]

  const createMixinImpl: HulyClientOperations["createMixin"] = ((
    objectId: unknown,
    _objectClass: unknown,
    _objectSpace: unknown,
    mixin: unknown,
    attributes: unknown
  ) => {
    if (config.captureCreateMixin) {
      config.captureCreateMixin.objectId = objectId as string
      config.captureCreateMixin.mixin = mixin
      config.captureCreateMixin.data = attributes as Record<string, unknown>
    }
    return Effect.succeed({})
  }) as HulyClientOperations["createMixin"]

  return HulyClient.testLayer({
    findAll: findAllImpl,
    findOne: findOneImpl,
    createDoc: createDocImpl,
    addCollection: addCollectionImpl,
    updateDoc: updateDocImpl,
    removeDoc: removeDocImpl,
    fetchMarkup: fetchMarkupImpl,
    uploadMarkup: uploadMarkupImpl,
    createMixin: createMixinImpl
  })
}

describe("Organization CRUD, Customer Mixin, Channels, and Membership", () => {
  describe("getOrganization", () => {
    // test-revizorro: approved
    it.effect("finds organization by ID and returns details with description", () =>
      Effect.gen(function*() {
        // eslint-disable-next-line no-restricted-syntax -- test mock: description is MarkupBlobRef at runtime but typed as null in mock
        const org = createMockOrganization({ description: "some-markup-ref" as unknown as null })

        const testLayer = createTestLayer({
          organizations: [org],
          fetchMarkupResult: "# About Test Corp"
        })

        const result = yield* getOrganization({ identifier: "org-1" }).pipe(
          Effect.provide(testLayer)
        )

        expect(result.id).toBe("org-1")
        expect(result.name).toBe("Test Corp")
        expect(result.city).toBe("SF")
        expect(result.description).toBe("# About Test Corp")
        expect(result.members).toBe(5)
      }))

    // test-revizorro: approved
    it.effect("finds organization by name when ID does not match", () =>
      Effect.gen(function*() {
        const org = createMockOrganization()

        const testLayer = createTestLayer({ organizations: [org] })

        const result = yield* getOrganization({ identifier: "Test Corp" }).pipe(
          Effect.provide(testLayer)
        )

        expect(result.id).toBe("org-1")
        expect(result.name).toBe("Test Corp")
      }))

    // test-revizorro: approved
    it.effect("returns undefined description when org has null description", () =>
      Effect.gen(function*() {
        const org = createMockOrganization({ description: null })

        const testLayer = createTestLayer({ organizations: [org] })

        const result = yield* getOrganization({ identifier: "org-1" }).pipe(
          Effect.provide(testLayer)
        )

        expect(result.description).toBeUndefined()
      }))

    // test-revizorro: approved
    it.effect("returns OrganizationNotFoundError when not found", () =>
      Effect.gen(function*() {
        const testLayer = createTestLayer({ organizations: [] })

        const error = yield* Effect.flip(
          getOrganization({ identifier: "nonexistent" }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("OrganizationNotFoundError")
      }))
  })

  describe("updateOrganization", () => {
    // test-revizorro: approved
    it.effect("updates name and city", () =>
      Effect.gen(function*() {
        const org = createMockOrganization()
        const capture: MockConfig["captureUpdateDoc"] = {}

        const testLayer = createTestLayer({
          organizations: [org],
          captureUpdateDoc: capture
        })

        const result = yield* updateOrganization({
          organizationId: organizationId("org-1"),
          name: "New Name",
          city: "LA"
        }).pipe(Effect.provide(testLayer))

        expect(result.updated).toBe(true)
        expect(capture.operations?.name).toBe("New Name")
        expect(capture.operations?.city).toBe("LA")
      }))

    // test-revizorro: approved
    it.effect("uploads description via uploadMarkup", () =>
      Effect.gen(function*() {
        const org = createMockOrganization()
        const capture: MockConfig["captureUpdateDoc"] = {}

        const testLayer = createTestLayer({
          organizations: [org],
          captureUpdateDoc: capture,
          uploadMarkupResult: "markup-ref-new"
        })

        const result = yield* updateOrganization({
          organizationId: organizationId("org-1"),
          description: "# New description"
        }).pipe(Effect.provide(testLayer))

        expect(result.updated).toBe(true)
        expect(capture.operations?.description).toBe("markup-ref-new")
      }))

    // test-revizorro: approved
    it.effect("sets description to null when empty string provided", () =>
      Effect.gen(function*() {
        const org = createMockOrganization()
        const capture: MockConfig["captureUpdateDoc"] = {}

        const testLayer = createTestLayer({
          organizations: [org],
          captureUpdateDoc: capture
        })

        const result = yield* updateOrganization({
          organizationId: organizationId("org-1"),
          description: ""
        }).pipe(Effect.provide(testLayer))

        expect(result.updated).toBe(true)
        expect(capture.operations?.description).toBeNull()
      }))

    // test-revizorro: approved
    it.effect("converts null city to empty string", () =>
      Effect.gen(function*() {
        const org = createMockOrganization()
        const capture: MockConfig["captureUpdateDoc"] = {}

        const testLayer = createTestLayer({
          organizations: [org],
          captureUpdateDoc: capture
        })

        const result = yield* updateOrganization({
          organizationId: organizationId("org-1"),
          // eslint-disable-next-line no-restricted-syntax -- test boundary: Schema.NullOr encodes null at runtime but TS sees string
          city: null as unknown as string
        }).pipe(Effect.provide(testLayer))

        expect(result.updated).toBe(true)
        expect(capture.operations?.city).toBe("")
      }))

    // test-revizorro: approved
    it.effect("returns updated:false when no changes provided", () =>
      Effect.gen(function*() {
        const org = createMockOrganization()

        const testLayer = createTestLayer({ organizations: [org] })

        const result = yield* updateOrganization({
          organizationId: organizationId("org-1")
        }).pipe(Effect.provide(testLayer))

        expect(result.updated).toBe(false)
      }))

    // test-revizorro: approved
    it.effect("returns OrganizationNotFoundError when org not found", () =>
      Effect.gen(function*() {
        const testLayer = createTestLayer({ organizations: [] })

        const error = yield* Effect.flip(
          updateOrganization({ organizationId: organizationId("missing") }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("OrganizationNotFoundError")
      }))
  })

  describe("deleteOrganization", () => {
    // test-revizorro: approved
    it.effect("deletes organization and returns deleted:true", () =>
      Effect.gen(function*() {
        const org = createMockOrganization()
        const capture: MockConfig["captureRemoveDoc"] = {}

        const testLayer = createTestLayer({
          organizations: [org],
          captureRemoveDoc: capture
        })

        const result = yield* deleteOrganization({ organizationId: organizationId("org-1") }).pipe(
          Effect.provide(testLayer)
        )

        expect(result.deleted).toBe(true)
        expect(result.id).toBe("org-1")
        expect(capture.id).toBe("org-1")
      }))

    // test-revizorro: approved
    it.effect("returns OrganizationNotFoundError when org not found", () =>
      Effect.gen(function*() {
        const testLayer = createTestLayer({ organizations: [] })

        const error = yield* Effect.flip(
          deleteOrganization({ organizationId: organizationId("missing") }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("OrganizationNotFoundError")
      }))
  })

  describe("makeOrganizationCustomer", () => {
    // test-revizorro: approved
    it.effect("applies customer mixin to organization", () =>
      Effect.gen(function*() {
        const org = createMockOrganization()
        const capture: MockConfig["captureCreateMixin"] = {}

        const testLayer = createTestLayer({
          organizations: [org],
          captureCreateMixin: capture
        })

        const result = yield* makeOrganizationCustomer({ organizationId: organizationId("org-1") }).pipe(
          Effect.provide(testLayer)
        )

        expect(result.applied).toBe(true)
        expect(result.id).toBe("org-1")
        expect(capture.mixin).toBe("lead:mixin:Customer")
      }))

    // test-revizorro: approved
    it.effect("returns applied:false when mixin already present", () =>
      Effect.gen(function*() {
        const org = createMockOrganization() // Simulate mixin already applied by adding the key to the org object
         // eslint-disable-next-line no-restricted-syntax -- test boundary: mixin presence check uses string key lookup
        ;(org as unknown as Record<string, unknown>)["lead:mixin:Customer"] = {}

        const testLayer = createTestLayer({ organizations: [org] })

        const result = yield* makeOrganizationCustomer({ organizationId: organizationId("org-1") }).pipe(
          Effect.provide(testLayer)
        )

        expect(result.applied).toBe(false)
        expect(result.id).toBe("org-1")
      }))

    // test-revizorro: approved
    it.effect("returns OrganizationNotFoundError when org not found", () =>
      Effect.gen(function*() {
        const testLayer = createTestLayer({ organizations: [] })

        const error = yield* Effect.flip(
          makeOrganizationCustomer({ organizationId: organizationId("missing") }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("OrganizationNotFoundError")
      }))
  })

  describe("addOrganizationChannel", () => {
    // test-revizorro: approved
    it.effect("adds email channel to organization", () =>
      Effect.gen(function*() {
        const org = createMockOrganization()
        const capture: MockConfig["captureAddCollection"] = {}

        const testLayer = createTestLayer({
          organizations: [org],
          captureAddCollection: capture
        })

        const result = yield* addOrganizationChannel({
          organizationId: organizationId("org-1"),
          provider: "email",
          value: "info@testcorp.com"
        }).pipe(Effect.provide(testLayer))

        expect(result.added).toBe(true)
        expect(capture.class).toBe(contact.class.Channel)
        expect(capture.attachedTo).toBe("org-1")
        expect(capture.attributes?.provider).toBe(contact.channelProvider.Email)
        expect(capture.attributes?.value).toBe("info@testcorp.com")
      }))

    // test-revizorro: approved
    it.effect("adds linkedin channel (case-insensitive provider)", () =>
      Effect.gen(function*() {
        const org = createMockOrganization()
        const capture: MockConfig["captureAddCollection"] = {}

        const testLayer = createTestLayer({
          organizations: [org],
          captureAddCollection: capture
        })

        const result = yield* addOrganizationChannel({
          organizationId: organizationId("org-1"),
          provider: "LinkedIn",
          value: "https://linkedin.com/company/test"
        }).pipe(Effect.provide(testLayer))

        expect(result.added).toBe(true)
        expect(capture.attributes?.provider).toBe(contact.channelProvider.LinkedIn)
      }))

    // test-revizorro: approved
    it.effect("returns error for unknown provider", () =>
      Effect.gen(function*() {
        const org = createMockOrganization()

        const testLayer = createTestLayer({ organizations: [org] })

        const error = yield* Effect.flip(
          addOrganizationChannel({
            organizationId: organizationId("org-1"),
            provider: "fax",
            value: "555-1234"
          }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("OrganizationNotFoundError")
      }))

    // test-revizorro: approved
    it.effect("returns OrganizationNotFoundError when org not found", () =>
      Effect.gen(function*() {
        const testLayer = createTestLayer({ organizations: [] })

        const error = yield* Effect.flip(
          addOrganizationChannel({
            organizationId: organizationId("missing"),
            provider: "email",
            value: "test@test.com"
          }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("OrganizationNotFoundError")
      }))
  })

  describe("addOrganizationMember", () => {
    // test-revizorro: approved
    it.effect("adds person as member by person ID", () =>
      Effect.gen(function*() {
        const org = createMockOrganization()
        const person = createMockPerson()
        const capture: MockConfig["captureAddCollection"] = {}

        const testLayer = createTestLayer({
          organizations: [org],
          persons: [person],
          captureAddCollection: capture
        })

        const result = yield* addOrganizationMember({
          organizationId: organizationId("org-1"),
          personIdentifier: "person-123"
        }).pipe(Effect.provide(testLayer))

        expect(result.added).toBe(true)
        expect(capture.class).toBe(contact.class.Member)
        expect(capture.attachedTo).toBe("org-1")
        expect(capture.attributes?.contact).toBe("person-123")
      }))

    // test-revizorro: approved
    it.effect("adds person as member by email", () =>
      Effect.gen(function*() {
        const org = createMockOrganization()
        const person = createMockPerson({
          _id: "person-email-1" as Ref<HulyPerson>
        })
        const channel = createMockChannel({
          attachedTo: "person-email-1" as Ref<Doc>,
          value: "member@example.com"
        })
        const capture: MockConfig["captureAddCollection"] = {}

        const testLayer = createTestLayer({
          organizations: [org],
          persons: [person],
          channels: [channel],
          captureAddCollection: capture
        })

        const result = yield* addOrganizationMember({
          organizationId: organizationId("org-1"),
          personIdentifier: "member@example.com"
        }).pipe(Effect.provide(testLayer))

        expect(result.added).toBe(true)
        expect(capture.attributes?.contact).toBe("person-email-1")
      }))

    // test-revizorro: approved
    it.effect("returns error when person not found", () =>
      Effect.gen(function*() {
        const org = createMockOrganization()

        const testLayer = createTestLayer({
          organizations: [org],
          persons: [],
          channels: []
        })

        const error = yield* Effect.flip(
          addOrganizationMember({
            organizationId: organizationId("org-1"),
            personIdentifier: "nonexistent"
          }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("OrganizationNotFoundError")
      }))
  })

  describe("listOrganizationMembers", () => {
    // test-revizorro: approved
    it.effect("returns members with person details and emails", () =>
      Effect.gen(function*() {
        const org = createMockOrganization()
        const person = createMockPerson()
        const member = createMockMember({
          attachedTo: "org-1" as Ref<Doc>,
          contact: "person-123" as Ref<Contact>
        })
        const channel = createMockChannel({
          attachedTo: "person-123" as Ref<Doc>,
          value: "john@example.com"
        })

        const testLayer = createTestLayer({
          organizations: [org],
          persons: [person],
          members: [member],
          channels: [channel]
        })

        const result = yield* listOrganizationMembers({ organizationId: organizationId("org-1") }).pipe(
          Effect.provide(testLayer)
        )

        expect(result.organizationId).toBe("org-1")
        expect(result.members).toHaveLength(1)
        expect(result.members[0].personId).toBe("person-123")
        expect(result.members[0].name).toBe("Doe,John")
        expect(result.members[0].email).toBe("john@example.com")
      }))

    // test-revizorro: approved
    it.effect("returns empty members array when no members exist", () =>
      Effect.gen(function*() {
        const org = createMockOrganization()

        const testLayer = createTestLayer({
          organizations: [org],
          members: []
        })

        const result = yield* listOrganizationMembers({ organizationId: organizationId("org-1") }).pipe(
          Effect.provide(testLayer)
        )

        expect(result.organizationId).toBe("org-1")
        expect(result.members).toEqual([])
      }))

    // test-revizorro: approved
    it.effect("returns OrganizationNotFoundError when org not found", () =>
      Effect.gen(function*() {
        const testLayer = createTestLayer({ organizations: [] })

        const error = yield* Effect.flip(
          listOrganizationMembers({ organizationId: organizationId("missing") }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("OrganizationNotFoundError")
      }))
  })

  describe("listPersonOrganizations", () => {
    // test-revizorro: approved
    it.effect("returns organizations a person belongs to by personId", () =>
      Effect.gen(function*() {
        const person = createMockPerson()
        const org = createMockOrganization()
        const member = createMockMember({
          attachedTo: "org-1" as Ref<Doc>,
          contact: "person-123" as Ref<Contact>
        })

        const testLayer = createTestLayer({
          persons: [person],
          organizations: [org],
          members: [member]
        })

        const result = yield* listPersonOrganizations({ personId: personId("person-123") }).pipe(
          Effect.provide(testLayer)
        )

        expect(result.personId).toBe("person-123")
        expect(result.organizations).toHaveLength(1)
        expect(result.organizations[0].id).toBe("org-1")
        expect(result.organizations[0].name).toBe("Test Corp")
      }))

    // test-revizorro: approved
    it.effect("returns empty organizations when person has no memberships", () =>
      Effect.gen(function*() {
        const person = createMockPerson()

        const testLayer = createTestLayer({
          persons: [person],
          members: []
        })

        const result = yield* listPersonOrganizations({ personId: personId("person-123") }).pipe(
          Effect.provide(testLayer)
        )

        expect(result.personId).toBe("person-123")
        expect(result.organizations).toEqual([])
      }))

    // test-revizorro: approved
    it.effect("returns PersonNotFoundError when person not found", () =>
      Effect.gen(function*() {
        const testLayer = createTestLayer({ persons: [] })

        const error = yield* Effect.flip(
          listPersonOrganizations({ personId: personId("nonexistent") }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("PersonNotFoundError")
      }))
  })

  describe("removeOrganizationMember", () => {
    // test-revizorro: approved
    it.effect("removes member and returns removed:true", () =>
      Effect.gen(function*() {
        const org = createMockOrganization()
        const person = createMockPerson()
        const member = createMockMember({
          attachedTo: "org-1" as Ref<Doc>,
          contact: "person-123" as Ref<Contact>
        })
        const capture: MockConfig["captureRemoveDoc"] = {}

        const testLayer = createTestLayer({
          organizations: [org],
          persons: [person],
          members: [member],
          captureRemoveDoc: capture
        })

        const result = yield* removeOrganizationMember({
          organizationId: organizationId("org-1"),
          personIdentifier: "person-123"
        }).pipe(Effect.provide(testLayer))

        expect(result.removed).toBe(true)
        expect(result.id).toBe("org-1")
        expect(capture.id).toBe("member-1")
      }))

    // test-revizorro: approved
    it.effect("returns removed:false when person is not a member", () =>
      Effect.gen(function*() {
        const org = createMockOrganization()
        const person = createMockPerson()

        const testLayer = createTestLayer({
          organizations: [org],
          persons: [person],
          members: []
        })

        const result = yield* removeOrganizationMember({
          organizationId: organizationId("org-1"),
          personIdentifier: "person-123"
        }).pipe(Effect.provide(testLayer))

        expect(result.removed).toBe(false)
      }))

    // test-revizorro: approved
    it.effect("returns error when person not found", () =>
      Effect.gen(function*() {
        const org = createMockOrganization()

        const testLayer = createTestLayer({
          organizations: [org],
          persons: [],
          channels: []
        })

        const error = yield* Effect.flip(
          removeOrganizationMember({
            organizationId: organizationId("org-1"),
            personIdentifier: "ghost"
          }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("OrganizationNotFoundError")
      }))

    // test-revizorro: approved
    it.effect("returns OrganizationNotFoundError when org not found", () =>
      Effect.gen(function*() {
        const testLayer = createTestLayer({ organizations: [] })

        const error = yield* Effect.flip(
          removeOrganizationMember({
            organizationId: organizationId("missing"),
            personIdentifier: "person-123"
          }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("OrganizationNotFoundError")
      }))
  })
})
