import type {
  Channel,
  ChannelProvider,
  Organization as HulyOrganization,
  Person as HulyPerson
} from "@hcengineering/contact"
import type { Class, Doc, FindOptions, FindResult, PersonId as CorePersonId, Ref } from "@hcengineering/core"
import { toFindResult } from "@hcengineering/core"
import { Effect, Exit } from "effect"
import { describe, expect, it } from "vitest"
import { assertAt } from "../../utils/assertions.js"

import { ChannelId } from "../../domain/schemas/shared.js"
import type { HulyClientOperations } from "../client.js"
import { HulyClient } from "../client.js"
import { contact } from "../huly-plugins.js"
import { channelIdentifier } from "./contact-channel-locators.js"
import {
  addOrganizationChannel,
  addPersonChannel,
  listContactChannelProviders,
  listOrganizationChannels,
  listPersonChannels,
  removeOrganizationChannel,
  removePersonChannel,
  updateOrganizationChannel,
  updatePersonChannel
} from "./contact-channels.js"
import { toRef } from "./sdk-boundary.js"

const testRef: typeof toRef = toRef

// Brands are erased at runtime; the SDK PersonId brand is a string in test fixtures.
const testCorePersonId = (id: string): CorePersonId => id as CorePersonId

const mockPerson = (overrides: Partial<HulyPerson> = {}): HulyPerson => {
  const data = {
    _id: testRef<HulyPerson>("person-1"),
    _class: contact.class.Person,
    name: "Doe,Jane",
    city: "",
    space: contact.space.Contacts,
    modifiedOn: 0,
    modifiedBy: testCorePersonId("user"),
    createdOn: 0,
    createdBy: testCorePersonId("user"),
    ...overrides
  }
  // The SDK Person type carries additional generated model detail not relevant to these fixtures.
  return data as HulyPerson
}

const mockOrganization = (overrides: Partial<HulyOrganization> = {}): HulyOrganization => {
  const data = {
    _id: testRef<HulyOrganization>("org-1"),
    _class: contact.class.Organization,
    name: "Acme",
    city: "",
    description: null,
    members: 0,
    space: contact.space.Contacts,
    modifiedOn: 0,
    modifiedBy: testCorePersonId("user"),
    createdOn: 0,
    createdBy: testCorePersonId("user"),
    ...overrides
  }
  // The SDK Organization type carries additional generated model detail not relevant to these fixtures.
  return data as HulyOrganization
}

const mockChannel = (overrides: Partial<Channel> = {}): Channel => {
  const data: Channel = {
    _id: testRef<Channel>("channel-1"),
    _class: contact.class.Channel,
    space: contact.space.Contacts,
    attachedTo: testRef<Doc>("person-1"),
    attachedToClass: contact.class.Person,
    collection: "channels",
    provider: contact.channelProvider.Email,
    value: "jane@example.com",
    modifiedBy: testCorePersonId("user"),
    modifiedOn: 0,
    createdBy: testCorePersonId("user"),
    createdOn: 0,
    ...overrides
  }
  return data
}

interface TestState {
  readonly persons?: ReadonlyArray<HulyPerson>
  readonly organizations?: ReadonlyArray<HulyOrganization>
  readonly channels?: Array<Channel>
}

type SupportedContactClassTag = "person" | "organization" | "channel"

const assertNever = (value: never): never => {
  throw new Error(`Unhandled contact class in test fixture: ${String(value)}`)
}

const supportedContactClassTag = (_class: Ref<Class<Doc>>): SupportedContactClassTag | undefined => {
  if (_class === contact.class.Person) return "person"
  if (_class === contact.class.Organization) return "organization"
  if (_class === contact.class.Channel) return "channel"
  return undefined
}

const queryValue = (query: unknown, key: string): unknown =>
  typeof query === "object" && query !== null ? query[key as keyof typeof query] : undefined

const matchesId = (docId: string, filter: unknown): boolean => {
  if (typeof filter === "object" && filter !== null && "$in" in filter) {
    const values = filter.$in
    return Array.isArray(values) && values.includes(docId)
  }
  return filter === undefined || filter === docId
}

const filterChannels = (channels: ReadonlyArray<Channel>, query: unknown): Array<Channel> =>
  channels.filter((channel) =>
    matchesId(channel._id, queryValue(query, "_id"))
    && matchesId(String(channel.attachedTo), queryValue(query, "attachedTo"))
    && (queryValue(query, "attachedToClass") === undefined
      || channel.attachedToClass === queryValue(query, "attachedToClass"))
    && (queryValue(query, "provider") === undefined || channel.provider === queryValue(query, "provider"))
    && (queryValue(query, "value") === undefined || channel.value === queryValue(query, "value"))
  )

const testLayer = (state: TestState) => {
  const persons = state.persons ?? []
  const organizations = state.organizations ?? []
  const channels = state.channels ?? []
  const nextChannelNumber = { value: 1 }

  // HulyClientOperations methods are generic; this fixture only implements the classes exercised here.
  const findAllSupportedClass = (
    tag: SupportedContactClassTag,
    query: unknown
  ): Effect.Effect<FindResult<Doc>> => {
    switch (tag) {
      case "person": {
        const result = persons.filter((person) =>
          matchesId(person._id, queryValue(query, "_id"))
          && (queryValue(query, "name") === undefined || person.name === queryValue(query, "name"))
        )
        return Effect.succeed(toFindResult(result.map((doc) => doc as Doc)))
      }
      case "organization": {
        const result = organizations.filter((organization) =>
          matchesId(organization._id, queryValue(query, "_id"))
          && (queryValue(query, "name") === undefined || organization.name === queryValue(query, "name"))
        )
        return Effect.succeed(toFindResult(result.map((doc) => doc as Doc)))
      }
      case "channel":
        return Effect.succeed(toFindResult(filterChannels(channels, query).map((doc) => doc as Doc)))
      default:
        return assertNever(tag)
    }
  }

  const findAllImpl = ((
    _class: Ref<Class<Doc>>,
    query: unknown,
    _options?: FindOptions<Doc>
  ): Effect.Effect<FindResult<Doc>> => {
    const tag = supportedContactClassTag(_class)
    if (tag !== undefined) {
      return findAllSupportedClass(tag, query)
    }
    return Effect.succeed(toFindResult<Doc>([]))
  }) as HulyClientOperations["findAll"]

  // The fake findOne delegates to the generic fake findAll and preserves the SDK operation shape.
  const findOneImpl = ((
    _class: Ref<Class<Doc>>,
    query: Parameters<HulyClientOperations["findAll"]>[1],
    options?: FindOptions<Doc>
  ) => Effect.map(findAllImpl(_class, query, options), (result) => result.at(0))) as HulyClientOperations[
    "findOne"
  ]

  const addCollectionImpl = ((
    _class: Ref<Class<Doc>>,
    _space: Ref<Doc>,
    attachedTo: Ref<Doc>,
    attachedToClass: Ref<Class<Doc>>,
    _collection: string,
    attributes: unknown
  ) => {
    const channelAttributes = attributes as { readonly provider?: Channel["provider"]; readonly value?: string }
    const id = testRef<Channel>(`new-channel-${nextChannelNumber.value}`)
    nextChannelNumber.value += 1
    const newChannel = mockChannel({
      _id: id,
      attachedTo,
      attachedToClass,
      value: channelAttributes.value ?? ""
    })
    channels.push(
      channelAttributes.provider === undefined
        ? newChannel
        : mockChannel({ ...newChannel, provider: channelAttributes.provider })
    )
    return Effect.succeed(id)
  }) as HulyClientOperations["addCollection"]

  // The fake updateDoc accepts the SDK operation shape and narrows to channel updates for this suite.
  const updateDocImpl = ((
    _class: Ref<Class<Doc>>,
    _space: Ref<Doc>,
    objectId: Ref<Doc>,
    operations: unknown
  ) => {
    const channelOperations = operations as { readonly provider?: Channel["provider"]; readonly value?: string }
    const index = channels.findIndex((channel) => channel._id === objectId)
    if (index >= 0) {
      const current = assertAt(channels, index)
      channels[index] = mockChannel({
        ...current,
        provider: channelOperations.provider ?? current.provider,
        value: channelOperations.value ?? current.value
      })
    }
    return Effect.succeed({})
  }) as HulyClientOperations["updateDoc"]

  // The fake removeDoc accepts the SDK operation shape and removes only in-memory channel docs here.
  const removeDocImpl: HulyClientOperations["removeDoc"] = ((
    _class: Ref<Class<Doc>>,
    _space: Ref<Doc>,
    objectId: Ref<Doc>
  ) => {
    const index = channels.findIndex((channel) => channel._id === objectId)
    if (index >= 0) channels.splice(index, 1)
    return Effect.succeed({})
  }) as HulyClientOperations["removeDoc"]

  return HulyClient.testLayer({
    addCollection: addCollectionImpl,
    findAll: findAllImpl,
    findOne: findOneImpl,
    removeDoc: removeDocImpl,
    updateDoc: updateDocImpl
  })
}

const failureTag = (exit: Exit.Exit<unknown, unknown>): string | undefined => {
  if (!Exit.isFailure(exit)) return undefined
  const cause = exit.cause
  return cause._tag === "Fail" && typeof cause.error === "object" && cause.error !== null && "_tag" in cause.error
    ? String(cause.error._tag)
    : undefined
}

describe("Contact Channel Operations", () => {
  it("lists supported provider labels through the operation wrapper", async () => {
    await expect(Effect.runPromise(listContactChannelProviders())).resolves.toContain("email")
  })

  it("formats channelId locators for diagnostics", () => {
    expect(channelIdentifier({ _tag: "channelId", channelId: ChannelId.make("channel-1") })).toBe("channel-1")
  })

  it("lists person and organization channels with labels and metadata", async () => {
    const channels = [
      mockChannel({ items: 2, lastMessage: 100 }),
      mockChannel({
        _id: testRef<Channel>("org-channel-1"),
        attachedTo: testRef<Doc>("org-1"),
        attachedToClass: contact.class.Organization,
        provider: contact.channelProvider.Homepage,
        value: "https://example.com"
      })
    ]
    const layer = testLayer({ persons: [mockPerson()], organizations: [mockOrganization()], channels })

    const person = await Effect.runPromise(listPersonChannels({ person: "person-1" }).pipe(Effect.provide(layer)))
    const organization = await Effect.runPromise(
      listOrganizationChannels({ organizationId: "org-1" }).pipe(Effect.provide(layer))
    )

    expect(person.channels).toEqual([{
      channelId: "channel-1",
      provider: "email",
      value: "jane@example.com",
      items: 2,
      lastMessage: 100
    }])
    expect(organization.channels).toEqual([{
      channelId: "org-channel-1",
      provider: "homepage",
      value: "https://example.com"
    }])
  })

  it("resolves person channels by exact email and exact display name", async () => {
    const layer = testLayer({ persons: [mockPerson()], channels: [mockChannel()] })

    const byEmail = await Effect.runPromise(
      listPersonChannels({ person: "jane@example.com" }).pipe(Effect.provide(layer))
    )
    const byName = await Effect.runPromise(listPersonChannels({ person: "Doe,Jane" }).pipe(Effect.provide(layer)))

    expect(byEmail.personId).toBe("person-1")
    expect(byName.personId).toBe("person-1")
  })

  it("adds channels idempotently by provider plus value", async () => {
    const channels = [mockChannel()]
    const layer = testLayer({ persons: [mockPerson()], channels })

    const existing = await Effect.runPromise(
      addPersonChannel({ person: "person-1", provider: "email", value: "jane@example.com" }).pipe(
        Effect.provide(layer)
      )
    )
    const added = await Effect.runPromise(
      addPersonChannel({ person: "person-1", provider: "phone", value: "+15551234" }).pipe(Effect.provide(layer))
    )

    expect(existing.added).toBe(false)
    expect(existing.channel.channelId).toBe("channel-1")
    expect(added.added).toBe(true)
    expect(channels).toHaveLength(2)
  })

  it("keeps add_organization_channel result fields and includes channel summary", async () => {
    const channels: Array<Channel> = []
    const layer = testLayer({ organizations: [mockOrganization()], channels })

    const result = await Effect.runPromise(
      addOrganizationChannel({ organizationId: "Acme", provider: "homepage", value: "https://example.com" }).pipe(
        Effect.provide(layer)
      )
    )

    expect(result.id).toBe("org-1")
    expect(result.added).toBe(true)
    expect(result.channel).toEqual({
      channelId: "new-channel-1",
      provider: "homepage",
      value: "https://example.com"
    })
  })

  it("updates by channelId and by provider plus value", async () => {
    const channels = [mockChannel()]
    const layer = testLayer({ persons: [mockPerson()], channels })

    const byId = await Effect.runPromise(
      updatePersonChannel({ person: "person-1", channelId: ChannelId.make("channel-1"), newValue: "jane@new.test" })
        .pipe(
          Effect.provide(layer)
        )
    )
    const byProviderValue = await Effect.runPromise(
      updatePersonChannel({
        person: "person-1",
        provider: "email",
        value: "jane@new.test",
        newProvider: "github",
        newValue: "janehub"
      }).pipe(Effect.provide(layer))
    )

    expect(byId.updated).toBe(true)
    expect(byId.channel.value).toBe("jane@new.test")
    expect(byProviderValue.updated).toBe(true)
    expect(assertAt(channels, 0).provider).toBe(contact.channelProvider.GitHub)
    expect(assertAt(channels, 0).value).toBe("janehub")
  })

  it("returns updated=false when target value is unchanged", async () => {
    const layer = testLayer({ persons: [mockPerson()], channels: [mockChannel()] })

    const result = await Effect.runPromise(
      updatePersonChannel({
        person: "person-1",
        channelId: ChannelId.make("channel-1"),
        newValue: "jane@example.com"
      }).pipe(
        Effect.provide(layer)
      )
    )

    expect(result.updated).toBe(false)
  })

  it("updates provider-only targets and returns absent channelId removals accurately", async () => {
    const channels = [mockChannel()]
    const layer = testLayer({ persons: [mockPerson()], channels })
    const invalidRemove: Parameters<typeof removePersonChannel>[0] = { person: "person-1" }

    const updated = await Effect.runPromise(
      updatePersonChannel({
        person: "person-1",
        channelId: ChannelId.make("channel-1"),
        newProvider: "profile"
      }).pipe(Effect.provide(layer))
    )
    const missingById = await Effect.runPromise(
      removePersonChannel({ person: "person-1", channelId: ChannelId.make("missing-channel") }).pipe(
        Effect.provide(layer)
      )
    )
    const invalid = await Effect.runPromiseExit(removePersonChannel(invalidRemove).pipe(Effect.provide(layer)))

    expect(updated.channel).toEqual({
      channelId: "channel-1",
      provider: "profile",
      value: "jane@example.com"
    })
    expect(missingById).toEqual({ personId: "person-1", removed: false, channelId: "missing-channel" })
    expect(failureTag(invalid)).toBe("InvalidContactChannelLocatorError")
  })

  it("rejects provider-only updates to email when the existing value is not an email", async () => {
    const layer = testLayer({
      persons: [mockPerson()],
      channels: [
        mockChannel({
          provider: contact.channelProvider.Phone,
          value: "+15551234"
        })
      ]
    })

    const invalid = await Effect.runPromiseExit(
      updatePersonChannel({
        person: "person-1",
        channelId: ChannelId.make("channel-1"),
        newProvider: "email"
      }).pipe(Effect.provide(layer))
    )

    expect(failureTag(invalid)).toBe("InvalidContactChannelValueError")
  })

  it("removes by provider plus value and returns removed=false for absent locators", async () => {
    const channels = [mockChannel()]
    const layer = testLayer({ persons: [mockPerson()], channels })

    const missing = await Effect.runPromise(
      removePersonChannel({ person: "person-1", provider: "phone", value: "+1555" }).pipe(Effect.provide(layer))
    )
    const removed = await Effect.runPromise(
      removePersonChannel({ person: "person-1", provider: "email", value: "jane@example.com" }).pipe(
        Effect.provide(layer)
      )
    )

    expect(missing.removed).toBe(false)
    expect(removed).toEqual({ personId: "person-1", removed: true, channelId: "channel-1" })
    expect(channels).toHaveLength(0)
  })

  it("removes by channelId and validates direct email-provider operation values", async () => {
    const channels = [mockChannel()]
    const layer = testLayer({ persons: [mockPerson()], channels })

    const invalid = await Effect.runPromiseExit(
      addPersonChannel({ person: "person-1", provider: "email", value: "not-email" }).pipe(Effect.provide(layer))
    )
    const removed = await Effect.runPromise(
      removePersonChannel({ person: "person-1", channelId: ChannelId.make("channel-1") }).pipe(Effect.provide(layer))
    )

    expect(failureTag(invalid)).toBe("InvalidContactChannelValueError")
    expect(removed.removed).toBe(true)
    expect(channels).toHaveLength(0)
  })

  it("updates and removes organization channels", async () => {
    const channels = [
      mockChannel({
        _id: testRef<Channel>("org-channel-1"),
        attachedTo: testRef<Doc>("org-1"),
        attachedToClass: contact.class.Organization
      })
    ]
    const layer = testLayer({ organizations: [mockOrganization()], channels })

    const updated = await Effect.runPromise(
      updateOrganizationChannel({
        organizationId: "org-1",
        channelId: ChannelId.make("org-channel-1"),
        newValue: "ops@example.com"
      }).pipe(Effect.provide(layer))
    )
    const removed = await Effect.runPromise(
      removeOrganizationChannel({ organizationId: "org-1", channelId: ChannelId.make("org-channel-1") }).pipe(
        Effect.provide(layer)
      )
    )
    const missing = await Effect.runPromise(
      removeOrganizationChannel({ organizationId: "org-1", provider: "homepage", value: "https://missing.test" }).pipe(
        Effect.provide(layer)
      )
    )

    expect(updated.organizationId).toBe("org-1")
    expect(updated.channel.value).toBe("ops@example.com")
    expect(removed).toEqual({ organizationId: "org-1", removed: true, channelId: "org-channel-1" })
    expect(missing).toEqual({ organizationId: "org-1", removed: false })
  })

  it("fails for ambiguous person names, ambiguous channel locators, missing owners, and update conflicts", async () => {
    const duplicatePerson = mockPerson({ _id: testRef<HulyPerson>("person-2") })
    const duplicateChannel = mockChannel({ _id: testRef<Channel>("channel-2") })
    const conflictChannel = mockChannel({
      _id: testRef<Channel>("channel-3"),
      provider: contact.channelProvider.Phone,
      value: "+1555"
    })
    const layer = testLayer({
      persons: [mockPerson(), duplicatePerson],
      channels: [mockChannel(), duplicateChannel, conflictChannel]
    })

    const ambiguousPerson = await Effect.runPromiseExit(
      listPersonChannels({ person: "Doe,Jane" }).pipe(Effect.provide(layer))
    )
    const ambiguousChannel = await Effect.runPromiseExit(
      updatePersonChannel({
        person: "person-1",
        provider: "email",
        value: "jane@example.com",
        newValue: "jane2@example.com"
      }).pipe(Effect.provide(layer))
    )
    const missingOwner = await Effect.runPromiseExit(
      addPersonChannel({ person: "missing", provider: "phone", value: "+1" }).pipe(Effect.provide(layer))
    )
    const conflict = await Effect.runPromiseExit(
      updatePersonChannel({
        person: "person-1",
        channelId: ChannelId.make("channel-1"),
        newProvider: "phone",
        newValue: "+1555"
      }).pipe(Effect.provide(layer))
    )
    const missingUpdateTarget = await Effect.runPromiseExit(
      updatePersonChannel({
        person: "person-1",
        channelId: ChannelId.make("missing-channel"),
        newValue: "missing@example.com"
      }).pipe(Effect.provide(layer))
    )

    expect(failureTag(ambiguousPerson)).toBe("PersonIdentifierAmbiguousError")
    expect(failureTag(ambiguousChannel)).toBe("ContactChannelIdentifierAmbiguousError")
    expect(failureTag(missingOwner)).toBe("PersonNotFoundError")
    expect(failureTag(conflict)).toBe("ContactChannelConflictError")
    expect(failureTag(missingUpdateTarget)).toBe("ContactChannelNotFoundError")
  })

  it("fails for ambiguous and missing organization owners", async () => {
    const layer = testLayer({
      organizations: [mockOrganization(), mockOrganization({ _id: testRef<HulyOrganization>("org-2") })]
    })

    const ambiguous = await Effect.runPromiseExit(
      listOrganizationChannels({ organizationId: "Acme" }).pipe(Effect.provide(layer))
    )
    const missing = await Effect.runPromiseExit(
      listOrganizationChannels({ organizationId: "Missing Org" }).pipe(Effect.provide(layer))
    )

    expect(failureTag(ambiguous)).toBe("OrganizationIdentifierAmbiguousError")
    expect(failureTag(missing)).toBe("OrganizationNotFoundError")
  })

  it("reports missing provider-value update targets and invalid locator shapes", async () => {
    const layer = testLayer({ persons: [mockPerson()], channels: [mockChannel()] })
    const invalidLocator: Parameters<typeof updatePersonChannel>[0] = {
      person: "person-1",
      newValue: "jane2@example.com"
    }

    const missingProviderValue = await Effect.runPromiseExit(
      updatePersonChannel({
        person: "person-1",
        provider: "phone",
        value: "+1555",
        newValue: "+1666"
      }).pipe(Effect.provide(layer))
    )
    const invalid = await Effect.runPromiseExit(updatePersonChannel(invalidLocator).pipe(Effect.provide(layer)))
    const noUpdateFields = await Effect.runPromiseExit(
      updatePersonChannel({ person: "person-1", channelId: ChannelId.make("channel-1") }).pipe(Effect.provide(layer))
    )

    expect(failureTag(missingProviderValue)).toBe("ContactChannelNotFoundError")
    expect(failureTag(invalid)).toBe("InvalidContactChannelLocatorError")
    expect(failureTag(noUpdateFields)).toBe("NoUpdateFieldsError")
  })

  it("fails ambiguous remove locators and invalid existing provider refs", async () => {
    const channels = [
      mockChannel(),
      mockChannel({ _id: testRef<Channel>("channel-2") }),
      mockChannel({
        _id: testRef<Channel>("channel-3"),
        provider: testRef<ChannelProvider>("contact:channelProvider:Fax")
      })
    ]
    const layer = testLayer({ persons: [mockPerson()], channels })

    const ambiguousRemove = await Effect.runPromiseExit(
      removePersonChannel({ person: "person-1", provider: "email", value: "jane@example.com" }).pipe(
        Effect.provide(layer)
      )
    )
    const invalidProvider = await Effect.runPromiseExit(
      updatePersonChannel({
        person: "person-1",
        channelId: ChannelId.make("channel-3"),
        newValue: "valid@example.com"
      }).pipe(Effect.provide(layer))
    )

    expect(failureTag(ambiguousRemove)).toBe("ContactChannelIdentifierAmbiguousError")
    expect(failureTag(invalidProvider)).toBe("InvalidContactProviderError")
  })

  it("preserves channel metadata in update responses", async () => {
    const channels = [mockChannel({ items: 3, lastMessage: 200 })]
    const layer = testLayer({ persons: [mockPerson()], channels })

    const result = await Effect.runPromise(
      updatePersonChannel({
        person: "person-1",
        channelId: ChannelId.make("channel-1"),
        newValue: "jane2@example.com"
      }).pipe(Effect.provide(layer))
    )

    expect(result.channel).toEqual({
      channelId: "channel-1",
      provider: "email",
      value: "jane2@example.com",
      items: 3,
      lastMessage: 200
    })
  })
})
