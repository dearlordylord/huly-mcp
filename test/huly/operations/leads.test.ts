import { describe, it } from "@effect/vitest"
import { AvatarType, type Contact, type Person } from "@hcengineering/contact"
import type { Doc, Ref, Status, WithLookup } from "@hcengineering/core"
import { Effect } from "effect"
import { expect } from "vitest"

import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import { HulyConnectionError } from "../../../src/huly/errors.js"
import { contact, core, task } from "../../../src/huly/huly-plugins.js"
import { leadClassIds } from "../../../src/huly/lead-plugin.js"
import { getLead, listFunnels, listLeads } from "../../../src/huly/operations/leads.js"
import { email, funnelReference, leadIdentifier, statusName } from "../../helpers/brands.js"
import { contactRef, corePersonId, docRef, findResult, personRef, spaceRef, statusRef } from "../../helpers/huly-sdk.js"

interface MockFunnel extends Doc {
  name: string
  description?: string
  archived: boolean
  type?: Ref<Doc>
}

interface MockLead extends Doc {
  title: string
  identifier: string
  number: number
  status: Ref<Status>
  assignee: Ref<Person> | null
  description: string | null
  attachedTo: Ref<Contact>
  parents: ReadonlyArray<unknown>
  modifiedOn: number
  createdOn: number
  $lookup?: { assignee?: Person | undefined; attachedTo?: Contact | undefined }
}

interface MockStatus extends Doc {
  name: string
}

const makeFunnel = (overrides: Partial<MockFunnel> = {}): MockFunnel => ({
  _id: docRef<MockFunnel>("funnel-1"),
  _class: leadClassIds.class.Funnel,
  space: spaceRef("space"),
  modifiedBy: corePersonId("user"),
  modifiedOn: 1700000000000,
  createdBy: corePersonId("user"),
  createdOn: 1699000000000,
  name: "Sales",
  archived: false,
  type: docRef<Doc>("project-type-1"),
  ...overrides
})

const makeLead = (overrides: Partial<MockLead> = {}): MockLead => ({
  _id: docRef<MockLead>("lead-1"),
  _class: leadClassIds.class.Lead,
  space: spaceRef("funnel-1"),
  modifiedBy: corePersonId("user"),
  modifiedOn: 1700000000000,
  createdBy: corePersonId("user"),
  createdOn: 1699000000000,
  title: "Big Deal",
  identifier: "LEAD-1",
  number: 1,
  status: statusRef("status-1"),
  assignee: personRef("person-1"),
  description: null,
  attachedTo: contactRef("customer-1"),
  parents: [],
  ...overrides
})

const makeStatus = (id: string, name: string): MockStatus => ({
  _id: docRef<MockStatus>(id),
  _class: core.class.Status,
  space: spaceRef("space"),
  modifiedBy: corePersonId("user"),
  modifiedOn: 0,
  createdBy: corePersonId("user"),
  createdOn: 0,
  name
})

const makePerson = (id: string, name: string): Person => {
  const person: Person = {
    _id: personRef(id),
    _class: contact.class.Person,
    space: contact.space.Contacts,
    modifiedBy: corePersonId("user"),
    modifiedOn: 0,
    createdBy: corePersonId("user"),
    createdOn: 0,
    name,
    city: "",
    avatarType: AvatarType.COLOR
  }
  return person
}

const makeContact = (id: string, name: string): Contact => {
  const customer: Contact = {
    _id: contactRef(id),
    _class: contact.class.Contact,
    space: contact.space.Contacts,
    modifiedBy: corePersonId("user"),
    modifiedOn: 0,
    createdBy: corePersonId("user"),
    createdOn: 0,
    name,
    avatarType: AvatarType.COLOR
  }
  return customer
}

const makeProjectType = (statusIds: ReadonlyArray<string>) => ({
  _id: docRef<Doc>("project-type-1"),
  _class: task.class.ProjectType,
  space: spaceRef("space"),
  modifiedBy: corePersonId("user"),
  modifiedOn: 0,
  createdBy: corePersonId("user"),
  createdOn: 0,
  statuses: statusIds.map((id) => ({ _id: statusRef(id) }))
})

interface LeadMockConfig {
  contacts?: ReadonlyArray<Contact>
  fetchMarkupResult?: string
  funnels?: ReadonlyArray<MockFunnel>
  leads?: ReadonlyArray<MockLead>
  persons?: ReadonlyArray<Person>
  projectType?: ReturnType<typeof makeProjectType>
  statusQueryError?: HulyConnectionError
  statuses?: ReadonlyArray<MockStatus>
}

const readQuery = (query: unknown): Record<string, unknown> => (query ?? {}) as Record<string, unknown>

const createLookupLead = (
  lead: MockLead,
  people: ReadonlyArray<Person>,
  customers: ReadonlyArray<Contact>,
  lookup: Record<string, unknown> | undefined
): MockLead | WithLookup<MockLead> => ({
  ...lead,
  $lookup: {
    assignee: lookup?.assignee && lead.assignee !== null
      ? people.find((person) => person._id === lead.assignee)
      : undefined,
    attachedTo: lookup?.attachedTo
      ? customers.find((customer) => customer._id === lead.attachedTo)
      : undefined
  }
})

const createTestLayer = (config: LeadMockConfig) => {
  const contacts = config.contacts ?? []
  const funnels = config.funnels ?? [makeFunnel()]
  const leads = config.leads ?? []
  const persons = config.persons ?? []
  const statuses = config.statuses ?? [makeStatus("status-1", "Active")]
  const projectType = config.projectType ?? makeProjectType(statuses.map((status) => String(status._id)))

  const findAllImpl: HulyClientOperations["findAll"] = ((_class: unknown, query: unknown, options?: unknown) => {
    if (_class === leadClassIds.class.Funnel) {
      const q = readQuery(query)
      const filtered = q.archived !== undefined
        ? funnels.filter((funnel) => funnel.archived === q.archived)
        : [...funnels]
      return Effect.succeed(findResult(filtered))
    }

    if (_class === leadClassIds.class.Lead) {
      const q = readQuery(query)
      const lookup = readQuery(options).lookup as Record<string, unknown> | undefined
      const filtered = leads
        .filter((lead) => q.space === undefined || lead.space === q.space)
        .filter((lead) => q.status === undefined || lead.status === q.status)
        .filter((lead) => q.assignee === undefined || lead.assignee === q.assignee)
        .map((lead) => createLookupLead(lead, persons, contacts, lookup))

      return Effect.succeed(findResult(filtered))
    }

    if (_class === core.class.Status) {
      if (config.statusQueryError !== undefined) {
        return Effect.fail(config.statusQueryError)
      }

      const q = readQuery(query)
      const idFilter = q._id
      const filtered = typeof idFilter === "object" && idFilter !== null && "$in" in idFilter
        ? statuses.filter((status) => (idFilter.$in as Array<unknown>).includes(status._id))
        : [...statuses]

      return Effect.succeed(findResult(filtered))
    }

    if (_class === contact.class.Channel) {
      return Effect.succeed(findResult([]))
    }

    return Effect.succeed(findResult([]))
  }) as HulyClientOperations["findAll"]

  const findOneImpl: HulyClientOperations["findOne"] = ((_class: unknown, query: unknown) => {
    const q = readQuery(query)

    if (_class === task.class.ProjectType) {
      return Effect.succeed(projectType)
    }

    if (_class === leadClassIds.class.Lead) {
      return Effect.succeed(leads.find((lead) => q.identifier !== undefined && lead.identifier === q.identifier))
    }

    if (_class === leadClassIds.class.Funnel) {
      return Effect.succeed(funnels.find((funnel) => funnel._id === q._id))
    }

    if (_class === contact.class.Person) {
      return Effect.succeed(persons.find((person) => person._id === q._id))
    }

    if (_class === contact.class.Contact) {
      return Effect.succeed(contacts.find((customer) => customer._id === q._id))
    }

    return Effect.succeed(undefined)
  }) as HulyClientOperations["findOne"]

  const fetchMarkupImpl: HulyClientOperations["fetchMarkup"] =
    (() => Effect.succeed(config.fetchMarkupResult ?? "# Description")) as HulyClientOperations["fetchMarkup"]

  return HulyClient.testLayer({
    fetchMarkup: fetchMarkupImpl,
    findAll: findAllImpl,
    findOne: findOneImpl
  })
}

describe("Lead Operations", () => {
  describe("listFunnels", () => {
    it.effect("returns stable funnel ids instead of funnel names as identifiers", () =>
      Effect.gen(function*() {
        const activeFunnel = makeFunnel({ _id: docRef<MockFunnel>("f-1"), name: "Sales", archived: false })
        const archivedFunnel = makeFunnel({ _id: docRef<MockFunnel>("f-2"), name: "Old Pipeline", archived: true })

        const testLayer = createTestLayer({ funnels: [activeFunnel, archivedFunnel] })
        const result = yield* listFunnels({}).pipe(Effect.provide(testLayer))

        expect(result.funnels).toHaveLength(1)
        expect(result.funnels[0].identifier).toBe("f-1")
        expect(result.funnels[0].name).toBe("Sales")
        expect(result.total).toBe(1)
      }))

    it.effect("propagates client failures", () =>
      Effect.gen(function*() {
        const testLayer = HulyClient.testLayer({
          findAll: () => Effect.fail(new HulyConnectionError({ message: "findAll failed" }))
        })

        const error = yield* Effect.flip(listFunnels({}).pipe(Effect.provide(testLayer)))
        expect(error.message).toContain("findAll failed")
      }))
  })

  describe("listLeads", () => {
    it.effect("lists leads in a funnel with resolved status, assignee, and customer contact", () =>
      Effect.gen(function*() {
        const assignee = makePerson("person-1", "Smith,Jane")
        const customer = makeContact("customer-1", "Acme,Corp")
        const lead = makeLead({
          assignee: personRef("person-1"),
          attachedTo: contactRef("customer-1")
        })

        const testLayer = createTestLayer({
          contacts: [customer],
          leads: [lead],
          persons: [assignee]
        })

        const result = yield* listLeads({ funnel: funnelReference("funnel-1") }).pipe(Effect.provide(testLayer))

        expect(result).toHaveLength(1)
        expect(result[0].identifier).toBe("LEAD-1")
        expect(result[0].status).toBe("Active")
        expect(result[0].assignee).toBe("Smith,Jane")
        expect(result[0].customer).toBe("Acme,Corp")
      }))

    it.effect("accepts case-insensitive funnel name lookup as a convenience", () =>
      Effect.gen(function*() {
        const lead = makeLead()
        const testLayer = createTestLayer({ leads: [lead] })

        const result = yield* listLeads({ funnel: funnelReference("sales") }).pipe(Effect.provide(testLayer))

        expect(result).toHaveLength(1)
        expect(result[0].identifier).toBe("LEAD-1")
      }))

    it.effect("filters leads by status name", () =>
      Effect.gen(function*() {
        const statusActive = makeStatus("status-1", "Active")
        const statusWon = makeStatus("status-2", "Won")
        const lead1 = makeLead({ _id: docRef<MockLead>("lead-1"), status: statusRef("status-1") })
        const lead2 = makeLead({
          _id: docRef<MockLead>("lead-2"),
          identifier: "LEAD-2",
          number: 2,
          status: statusRef("status-2")
        })

        const testLayer = createTestLayer({
          leads: [lead1, lead2],
          statuses: [statusActive, statusWon]
        })

        const result = yield* listLeads({ funnel: funnelReference("funnel-1"), status: statusName("Won") }).pipe(
          Effect.provide(testLayer)
        )

        expect(result).toHaveLength(1)
        expect(result[0].identifier).toBe("LEAD-2")
      }))

    it.effect("returns empty array when assignee is not found", () =>
      Effect.gen(function*() {
        const lead = makeLead()
        const testLayer = createTestLayer({ leads: [lead], persons: [] })

        const result = yield* listLeads({
          funnel: funnelReference("funnel-1"),
          assignee: email("nobody@example.com")
        }).pipe(Effect.provide(testLayer))

        expect(result).toEqual([])
      }))

    it.effect("fails when funnel status resolution fails", () =>
      Effect.gen(function*() {
        const lead = makeLead()
        const testLayer = createTestLayer({
          leads: [lead],
          statusQueryError: new HulyConnectionError({ message: "status lookup failed" })
        })

        const error = yield* Effect.flip(
          listLeads({ funnel: funnelReference("funnel-1") }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("HulyConnectionError")
        expect(error.message).toContain("status lookup failed")
      }))

    it.effect("fails with FunnelNotFoundError when funnel does not exist", () =>
      Effect.gen(function*() {
        const testLayer = createTestLayer({ funnels: [] })

        const error = yield* Effect.flip(
          listLeads({ funnel: funnelReference("missing-funnel") }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("FunnelNotFoundError")
        if (error._tag !== "FunnelNotFoundError") {
          throw new Error(`Expected FunnelNotFoundError, got ${error._tag}`)
        }
        expect(error.identifier).toBe("missing-funnel")
      }))
  })

  describe("getLead", () => {
    it.effect("returns full lead detail with contact customer and stable funnel id", () =>
      Effect.gen(function*() {
        const assignee = makePerson("person-1", "Smith,Jane")
        const customer = makeContact("customer-1", "Acme,Corp")
        const lead = makeLead({
          assignee: personRef("person-1"),
          attachedTo: contactRef("customer-1"),
          description: "blob-ref"
        })

        const testLayer = createTestLayer({
          contacts: [customer],
          fetchMarkupResult: "# Deal notes\nImportant details here.",
          leads: [lead],
          persons: [assignee]
        })

        const result = yield* getLead({
          funnel: funnelReference("funnel-1"),
          identifier: leadIdentifier("LEAD-1")
        }).pipe(Effect.provide(testLayer))

        expect(result.identifier).toBe("LEAD-1")
        expect(result.status).toBe("Active")
        expect(result.assignee).toBe("Smith,Jane")
        expect(result.customer).toBe("Acme,Corp")
        expect(result.description).toBe("# Deal notes\nImportant details here.")
        expect(result.funnel).toBe("funnel-1")
        expect(result.funnelName).toBe("Sales")
      }))

    it.effect("normalizes lowercase lead identifiers to upstream LEAD format", () =>
      Effect.gen(function*() {
        const lead = makeLead()
        const testLayer = createTestLayer({ leads: [lead] })

        const result = yield* getLead({
          funnel: funnelReference("funnel-1"),
          identifier: leadIdentifier("lead-1")
        }).pipe(Effect.provide(testLayer))

        expect(result.identifier).toBe("LEAD-1")
      }))

    it.effect("fails with LeadNotFoundError when lead does not exist", () =>
      Effect.gen(function*() {
        const testLayer = createTestLayer({ leads: [] })

        const error = yield* Effect.flip(
          getLead({ funnel: funnelReference("funnel-1"), identifier: leadIdentifier("LEAD-999") }).pipe(
            Effect.provide(testLayer)
          )
        )

        expect(error._tag).toBe("LeadNotFoundError")
        if (error._tag !== "LeadNotFoundError") {
          throw new Error(`Expected LeadNotFoundError, got ${error._tag}`)
        }
        expect(error.identifier).toBe("LEAD-999")
        expect(error.funnel).toBe("funnel-1")
      }))

    it.effect("fails with FunnelNotFoundError when funnel does not exist", () =>
      Effect.gen(function*() {
        const testLayer = createTestLayer({ funnels: [] })

        const error = yield* Effect.flip(
          getLead({ funnel: funnelReference("missing-funnel"), identifier: leadIdentifier("LEAD-1") }).pipe(
            Effect.provide(testLayer)
          )
        )

        expect(error._tag).toBe("FunnelNotFoundError")
        if (error._tag !== "FunnelNotFoundError") {
          throw new Error(`Expected FunnelNotFoundError, got ${error._tag}`)
        }
        expect(error.identifier).toBe("missing-funnel")
      }))
  })
})
