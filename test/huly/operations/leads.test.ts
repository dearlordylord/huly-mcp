import { describe, it } from "@effect/vitest"
import { AvatarType, type Contact, type Organization as HulyOrganization, type Person } from "@hcengineering/contact"
import type { Doc, Ref, Status, WithLookup } from "@hcengineering/core"
import { Effect } from "effect"
import { expect } from "vitest"
import { assertAt } from "../../../src/utils/assertions.js"

import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import { Diagnostics, makeDiagnosticsScope } from "../../../src/huly/diagnostics.js"
import { HulyConnectionError } from "../../../src/huly/errors.js"
import { contact, core, task } from "../../../src/huly/huly-plugins.js"
import { leadClassIds } from "../../../src/huly/lead-plugin.js"
import { getLead, listFunnels, listLeads } from "../../../src/huly/operations/leads.js"
import { email, funnelReference, leadIdentifier, statusName } from "../../helpers/brands.js"
import { withDiagnostics } from "../../helpers/diagnostics.js"
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
  kind: Ref<Doc>
  rank: string
  isDone?: boolean
  comments?: number
  attachments?: number
  labels?: number
  status: Ref<Status>
  assignee: Ref<Person> | null
  description: string | null
  startDate: number | null
  dueDate: number | null
  attachedTo: Ref<Contact>
  attachedToClass: Ref<Doc>
  collection: "leads"
  parents: ReadonlyArray<unknown>
  modifiedOn: number
  createdOn: number
  $lookup?: { assignee?: Person | undefined; attachedTo?: Contact | HulyOrganization | undefined }
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
  kind: docRef<Doc>("lead:taskType:Lead"),
  rank: "0|hzzzzz:",
  isDone: false,
  comments: 0,
  attachments: 0,
  labels: 0,
  status: statusRef("status-1"),
  assignee: personRef("person-1"),
  description: null,
  startDate: null,
  dueDate: null,
  attachedTo: contactRef("customer-1"),
  attachedToClass: contact.class.Person,
  collection: "leads",
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

const makeOrganization = (id: string, name: string): HulyOrganization => {
  const organization: HulyOrganization = {
    _id: docRef<HulyOrganization>(id),
    _class: contact.class.Organization,
    space: contact.space.Contacts,
    modifiedBy: corePersonId("user"),
    modifiedOn: 0,
    createdBy: corePersonId("user"),
    createdOn: 0,
    name,
    city: "",
    avatarType: AvatarType.COLOR,
    members: 0,
    description: null
  }
  return organization
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
  customerDescriptionMarkup?: string
  fetchMarkupResult?: string
  fetchMarkupCalls?: Array<{ readonly objectClass: string; readonly attribute: string }>
  funnels?: ReadonlyArray<MockFunnel>
  leads?: ReadonlyArray<MockLead>
  organizations?: ReadonlyArray<HulyOrganization>
  persons?: ReadonlyArray<Person>
  projectType?: ReturnType<typeof makeProjectType>
  statusQueryError?: HulyConnectionError
  modelStatuses?: ReadonlyArray<MockStatus>
  statuses?: ReadonlyArray<MockStatus>
}

const readQuery = (query: unknown): Record<string, unknown> => (query ?? {}) as Record<string, unknown>

const createLookupLead = (
  lead: MockLead,
  people: ReadonlyArray<Person>,
  customers: ReadonlyArray<Contact | HulyOrganization>,
  lookup: Record<string, unknown> | undefined
): MockLead | WithLookup<MockLead> => ({
  ...lead,
  $lookup: {
    assignee:
      lookup?.assignee && lead.assignee !== null ? people.find((person) => person._id === lead.assignee) : undefined,
    attachedTo: lookup?.attachedTo ? customers.find((customer) => customer._id === lead.attachedTo) : undefined
  }
})

const createTestLayer = (config: LeadMockConfig) => {
  const contacts = config.contacts ?? []
  const funnels = config.funnels ?? [makeFunnel()]
  const leads = config.leads ?? []
  const organizations = config.organizations ?? []
  const persons = config.persons ?? []
  const statuses = config.statuses ?? [makeStatus("status-1", "Active")]
  const modelStatuses = config.modelStatuses ?? []
  const projectType = config.projectType ?? makeProjectType(statuses.map((status) => String(status._id)))

  const findAllImpl: HulyClientOperations["findAll"] = ((_class: unknown, query: unknown, options?: unknown) => {
    if (_class === leadClassIds.class.Funnel) {
      const q = readQuery(query)
      const filtered =
        q.archived !== undefined ? funnels.filter((funnel) => funnel.archived === q.archived) : [...funnels]
      return Effect.succeed(findResult(filtered))
    }

    if (_class === leadClassIds.class.Lead) {
      const q = readQuery(query)
      const lookup = readQuery(options).lookup as Record<string, unknown> | undefined
      const filtered = leads
        .filter((lead) => q.space === undefined || lead.space === q.space)
        .filter((lead) => q.status === undefined || lead.status === q.status)
        .filter((lead) => q.assignee === undefined || lead.assignee === q.assignee)
        .map((lead) => createLookupLead(lead, persons, [...contacts, ...organizations], lookup))

      return Effect.succeed(findResult(filtered))
    }

    if (_class === core.class.Status) {
      if (config.statusQueryError !== undefined) {
        return Effect.fail(config.statusQueryError)
      }

      const q = readQuery(query)
      const idFilter = q._id
      const filtered =
        typeof idFilter === "object" && idFilter !== null && "$in" in idFilter
          ? statuses.filter((status) => (idFilter.$in as Array<unknown>).includes(status._id))
          : [...statuses]

      return Effect.succeed(findResult(filtered))
    }

    if (_class === contact.class.Channel) {
      return Effect.succeed(findResult([]))
    }

    return Effect.succeed(findResult([]))
  }) as HulyClientOperations["findAll"]

  const findAllInModelImpl: HulyClientOperations["findAllInModel"] = ((_class: unknown, query: unknown) => {
    if (_class === core.class.Status) {
      const q = readQuery(query)
      const idFilter = q._id
      const filtered =
        typeof idFilter === "object" && idFilter !== null && "$in" in idFilter
          ? modelStatuses.filter((status) => (idFilter.$in as Array<unknown>).includes(status._id))
          : [...modelStatuses]
      return Effect.succeed(findResult(filtered))
    }
    return Effect.succeed(findResult([]))
  }) as HulyClientOperations["findAllInModel"]

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
      return Effect.succeed(
        persons.find(
          (person) => (q._id !== undefined && person._id === q._id) || (q.name !== undefined && person.name === q.name)
        )
      )
    }

    if (_class === contact.class.Contact) {
      return Effect.succeed(contacts.find((customer) => customer._id === q._id))
    }

    if (_class === contact.class.Organization) {
      return Effect.succeed(organizations.find((organization) => organization._id === q._id))
    }

    return Effect.succeed(undefined)
  }) as HulyClientOperations["findOne"]

  return HulyClient.testLayer({
    fetchMarkup: (objectClass, _id, attribute) => {
      config.fetchMarkupCalls?.push({ objectClass: String(objectClass), attribute })
      return Effect.succeed(
        attribute === "customerDescription"
          ? (config.customerDescriptionMarkup ?? "# Customer description")
          : (config.fetchMarkupResult ?? "# Description")
      )
    },
    findAll: findAllImpl,
    findAllInModel: findAllInModelImpl,
    findOne: findOneImpl
  })
}

describe("Lead Operations", () => {
  describe("listFunnels", () => {
    it.effect("returns stable funnel ids instead of funnel names as identifiers", () =>
      Effect.gen(function* () {
        const activeFunnel = makeFunnel({ _id: docRef<MockFunnel>("f-1"), name: "Sales", archived: false })
        const archivedFunnel = makeFunnel({ _id: docRef<MockFunnel>("f-2"), name: "Old Pipeline", archived: true })

        const testLayer = createTestLayer({ funnels: [activeFunnel, archivedFunnel] })
        const result = yield* listFunnels({}).pipe(Effect.provide(testLayer), withDiagnostics)

        expect(result.funnels).toHaveLength(1)
        expect(assertAt(result.funnels, 0).identifier).toBe("f-1")
        expect(assertAt(result.funnels, 0).name).toBe("Sales")
        expect(result.total).toBe(1)
      })
    )

    it.effect("propagates client failures", () =>
      Effect.gen(function* () {
        const testLayer = HulyClient.testLayer({
          findAll: () => Effect.fail(new HulyConnectionError({ message: "findAll failed" }))
        })

        const error = yield* Effect.flip(listFunnels({}).pipe(Effect.provide(testLayer), withDiagnostics))
        expect(error.message).toContain("findAll failed")
      })
    )
  })

  describe("listLeads", () => {
    it.effect("lists leads in a funnel with resolved status, assignee, and customer contact", () =>
      Effect.gen(function* () {
        const assignee = makePerson("person-1", "Smith,Jane")
        const customer = makeContact("customer-1", "Acme,Corp")
        const lead = makeLead({ assignee: personRef("person-1"), attachedTo: contactRef("customer-1") })

        const testLayer = createTestLayer({ contacts: [customer], leads: [lead], persons: [assignee] })

        const result = yield* listLeads({ funnel: funnelReference("funnel-1") }).pipe(
          Effect.provide(testLayer),
          withDiagnostics
        )

        expect(result).toHaveLength(1)
        expect(assertAt(result, 0).identifier).toBe("LEAD-1")
        expect(assertAt(result, 0).status).toBe("Active")
        expect(assertAt(result, 0).assignee).toBe("Smith,Jane")
        expect(assertAt(result, 0).customer).toBe("Acme,Corp")
      })
    )

    it.effect("accepts an exact funnel name lookup", () =>
      Effect.gen(function* () {
        const lead = makeLead()
        const testLayer = createTestLayer({ leads: [lead] })

        const result = yield* listLeads({ funnel: funnelReference("Sales") }).pipe(
          Effect.provide(testLayer),
          withDiagnostics
        )

        expect(result).toHaveLength(1)
        expect(assertAt(result, 0).identifier).toBe("LEAD-1")
      })
    )

    it.effect("rejects colliding exact funnel names", () =>
      Effect.gen(function* () {
        const olderArchived = makeFunnel({
          _id: docRef<MockFunnel>("funnel-archived"),
          archived: true,
          modifiedOn: 1700000000000,
          name: "Sales"
        })
        const newestActive = makeFunnel({
          _id: docRef<MockFunnel>("funnel-active"),
          archived: false,
          modifiedOn: 1700000001000,
          name: "Sales"
        })
        const lead = makeLead({ space: spaceRef("funnel-active") })

        const testLayer = createTestLayer({ funnels: [olderArchived, newestActive], leads: [lead] })

        const error = yield* Effect.flip(
          listLeads({ funnel: funnelReference("Sales") }).pipe(Effect.provide(testLayer), withDiagnostics)
        )
        expect(error._tag).toBe("FunnelIdentifierAmbiguousError")
      })
    )

    it.effect("lists leads with organization customers resolved through the customer mixin lookup", () =>
      Effect.gen(function* () {
        const organization = makeOrganization("customer-1", "Acme Org")
        const lead = makeLead({ attachedTo: contactRef("customer-1") })

        const testLayer = createTestLayer({ leads: [lead], organizations: [organization] })

        const result = yield* listLeads({ funnel: funnelReference("funnel-1") }).pipe(
          Effect.provide(testLayer),
          withDiagnostics
        )

        expect(result).toHaveLength(1)
        expect(assertAt(result, 0).customer).toBe("Acme Org")
      })
    )

    it.effect("filters leads by status name", () =>
      Effect.gen(function* () {
        const statusActive = makeStatus("status-1", "Active")
        const statusWon = makeStatus("status-2", "Won")
        const lead1 = makeLead({ _id: docRef<MockLead>("lead-1"), status: statusRef("status-1") })
        const lead2 = makeLead({
          _id: docRef<MockLead>("lead-2"),
          identifier: "LEAD-2",
          number: 2,
          status: statusRef("status-2")
        })

        const testLayer = createTestLayer({ leads: [lead1, lead2], statuses: [statusActive, statusWon] })

        const result = yield* listLeads({ funnel: funnelReference("funnel-1"), status: statusName("Won") }).pipe(
          Effect.provide(testLayer),
          withDiagnostics
        )

        expect(result).toHaveLength(1)
        expect(assertAt(result, 0).identifier).toBe("LEAD-2")
      })
    )

    it.effect("returns empty array when assignee is not found", () =>
      Effect.gen(function* () {
        const lead = makeLead()
        const testLayer = createTestLayer({ leads: [lead], persons: [] })

        const result = yield* listLeads({
          funnel: funnelReference("funnel-1"),
          assignee: email("nobody@example.com")
        }).pipe(Effect.provide(testLayer), withDiagnostics)

        expect(result).toEqual([])
      })
    )

    it.effect("resolves funnel status names from the local model when server status lookup fails", () =>
      Effect.gen(function* () {
        const lead = makeLead()
        const testLayer = createTestLayer({
          leads: [lead],
          modelStatuses: [makeStatus("status-1", "Active")],
          statusQueryError: new HulyConnectionError({ message: "status lookup failed" })
        })
        const diagnostics = yield* makeDiagnosticsScope

        const result = yield* listLeads({ funnel: funnelReference("funnel-1") }).pipe(
          Effect.provide(testLayer),
          Effect.provideService(Diagnostics, diagnostics.service)
        )
        const warnings = yield* diagnostics.drainWarnings

        expect(assertAt(result, 0).status).toBe("Active")
        expect(warnings).toHaveLength(1)
        expect(assertAt(warnings, 0).message).toContain("missing: 1")
      })
    )

    it.effect("falls back to the workflow status reference when status metadata is absent", () =>
      Effect.gen(function* () {
        const status = "lead:status:Active"
        const result = yield* listLeads({ funnel: funnelReference("funnel-1") }).pipe(
          Effect.provide(
            createTestLayer({
              leads: [makeLead({ status: statusRef(status) })],
              projectType: makeProjectType([status]),
              statuses: []
            })
          ),
          withDiagnostics
        )

        expect(assertAt(result, 0).status).toBe("Active")
      })
    )

    it.effect("propagates a server connection failure when model status metadata is unavailable", () =>
      Effect.gen(function* () {
        const lead = makeLead({ status: statusRef("plainstatus") })
        const diagnostics = yield* makeDiagnosticsScope
        const testLayer = createTestLayer({
          leads: [lead],
          projectType: makeProjectType(["plainstatus"]),
          statusQueryError: new HulyConnectionError({ message: "status lookup failed" })
        })

        const error = yield* Effect.flip(
          listLeads({ funnel: funnelReference("funnel-1") }).pipe(
            Effect.provide(testLayer),
            Effect.provideService(Diagnostics, diagnostics.service)
          )
        )
        const warnings = yield* diagnostics.drainWarnings

        expect(error._tag).toBe("HulyConnectionError")
        expect(warnings).toEqual([])
      })
    )

    it.effect("fails with FunnelNotFoundError when funnel does not exist", () =>
      Effect.gen(function* () {
        const testLayer = createTestLayer({ funnels: [] })

        const error = yield* Effect.flip(
          listLeads({ funnel: funnelReference("missing-funnel") }).pipe(Effect.provide(testLayer), withDiagnostics)
        )

        expect(error._tag).toBe("FunnelNotFoundError")
        if (error._tag !== "FunnelNotFoundError") {
          throw new Error(`Expected FunnelNotFoundError, got ${error._tag}`)
        }
        expect(error.identifier).toBe("missing-funnel")
      })
    )
  })

  describe("getLead", () => {
    it.effect("returns full lead detail with contact customer and stable funnel id", () =>
      Effect.gen(function* () {
        const assignee = makePerson("person-1", "Smith,Jane")
        const customer = makeContact("customer-1", "Acme,Corp")
        const lead = makeLead({
          assignee: personRef("person-1"),
          attachedTo: contactRef("customer-1"),
          description: "blob-ref",
          startDate: 10,
          dueDate: 20
        })
        const fetchMarkupCalls: Array<{ readonly objectClass: string; readonly attribute: string }> = []
        const customerWithMixin = {
          ...customer,
          [leadClassIds.mixin.Customer]: { customerDescription: "customer-description-ref" }
        }

        const testLayer = createTestLayer({
          contacts: [customerWithMixin],
          customerDescriptionMarkup: "# Customer notes",
          fetchMarkupResult: "# Deal notes\nImportant details here.",
          fetchMarkupCalls,
          leads: [lead],
          persons: [assignee]
        })

        const result = yield* getLead({
          funnel: funnelReference("funnel-1"),
          identifier: leadIdentifier("LEAD-1")
        }).pipe(Effect.provide(testLayer), withDiagnostics)

        expect(result.identifier).toBe("LEAD-1")
        expect(result).toMatchObject({
          id: "lead-1",
          number: 1,
          taskType: "lead:taskType:Lead",
          rank: "0|hzzzzz:",
          completed: false,
          comments: 0,
          attachments: 0,
          labels: 0,
          customerId: "customer-1",
          customerType: "person",
          modifiedOn: 1700000000000,
          modifiedBy: "user"
        })
        expect(result.unsupportedFields.map((entry) => entry.field)).toEqual(["parents", "collection"])
        expect(result.status).toBe("Active")
        expect(result.assignee).toBe("Smith,Jane")
        expect(result.customer).toBe("Acme,Corp")
        expect(result.description).toBe("# Deal notes\nImportant details here.")
        expect(result.customerDescription).toBe("# Customer notes")
        expect(result.startDate).toBe(10)
        expect(result.dueDate).toBe(20)
        expect(result.funnel).toBe("funnel-1")
        expect(result.funnelName).toBe("Sales")
        expect(fetchMarkupCalls).toContainEqual({
          objectClass: String(leadClassIds.mixin.Customer),
          attribute: "customerDescription"
        })
      })
    )

    it.effect("normalizes lowercase lead identifiers to upstream LEAD format", () =>
      Effect.gen(function* () {
        const lead = makeLead()
        const testLayer = createTestLayer({ contacts: [makeContact("customer-1", "Acme")], leads: [lead] })

        const result = yield* getLead({
          funnel: funnelReference("funnel-1"),
          identifier: leadIdentifier("lead-1")
        }).pipe(Effect.provide(testLayer), withDiagnostics)

        expect(result.identifier).toBe("LEAD-1")
      })
    )

    it.effect("returns full lead detail with organization customer", () =>
      Effect.gen(function* () {
        const organization = makeOrganization("customer-1", "Acme Org")
        const lead = makeLead({
          attachedTo: contactRef("customer-1"),
          attachedToClass: contact.class.Organization,
          description: "blob-ref"
        })

        const testLayer = createTestLayer({
          fetchMarkupResult: "# Deal notes\nImportant details here.",
          leads: [lead],
          organizations: [organization]
        })

        const result = yield* getLead({
          funnel: funnelReference("funnel-1"),
          identifier: leadIdentifier("LEAD-1")
        }).pipe(Effect.provide(testLayer), withDiagnostics)

        expect(result.customer).toBe("Acme Org")
        expect(result.customerType).toBe("organization")
      })
    )

    it.effect("fails with LeadNotFoundError when lead does not exist", () =>
      Effect.gen(function* () {
        const testLayer = createTestLayer({ leads: [] })

        const error = yield* Effect.flip(
          getLead({ funnel: funnelReference("funnel-1"), identifier: leadIdentifier("LEAD-999") }).pipe(
            Effect.provide(testLayer),
            withDiagnostics
          )
        )

        expect(error._tag).toBe("LeadNotFoundError")
        if (error._tag !== "LeadNotFoundError") {
          throw new Error(`Expected LeadNotFoundError, got ${error._tag}`)
        }
        expect(error.identifier).toBe("LEAD-999")
        expect(error.funnel).toBe("funnel-1")
      })
    )

    it.effect("fails with FunnelNotFoundError when funnel does not exist", () =>
      Effect.gen(function* () {
        const testLayer = createTestLayer({ funnels: [] })

        const error = yield* Effect.flip(
          getLead({ funnel: funnelReference("missing-funnel"), identifier: leadIdentifier("LEAD-1") }).pipe(
            Effect.provide(testLayer),
            withDiagnostics
          )
        )

        expect(error._tag).toBe("FunnelNotFoundError")
        if (error._tag !== "FunnelNotFoundError") {
          throw new Error(`Expected FunnelNotFoundError, got ${error._tag}`)
        }
        expect(error.identifier).toBe("missing-funnel")
      })
    )
  })
})

describe("Lead status resolution failures", () => {
  it.effect("fails when the funnel is missing its ProjectType reference", () =>
    Effect.gen(function* () {
      // A real Huly funnel can lack its `type` ref; the SDK type marks it required, so override it.
      // eslint-disable-next-line no-restricted-syntax -- exercise the runtime guard for a funnel without a ProjectType ref
      const funnelWithoutType = { ...makeFunnel(), type: undefined } as unknown as MockFunnel
      const error = yield* Effect.flip(
        listLeads({ funnel: funnelReference("funnel-1") }).pipe(
          Effect.provide(createTestLayer({ funnels: [funnelWithoutType], leads: [] })),
          withDiagnostics
        )
      )
      expect(error._tag).toBe("HulyDataInvalidError")
    })
  )

  it.effect("fails when the ProjectType has no statuses", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        listLeads({ funnel: funnelReference("funnel-1") }).pipe(
          Effect.provide(createTestLayer({ leads: [], projectType: makeProjectType([]) })),
          withDiagnostics
        )
      )
      expect(error._tag).toBe("HulyDataInvalidError")
    })
  )

  it.effect("fails with InvalidStatusError for an unknown status filter", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        listLeads({ funnel: funnelReference("funnel-1"), status: statusName("Nonexistent") }).pipe(
          Effect.provide(createTestLayer({ leads: [makeLead()], statuses: [makeStatus("status-1", "Active")] })),
          withDiagnostics
        )
      )
      expect(error._tag).toBe("InvalidStatusError")
    })
  )

  it.effect("fails when the ProjectType document is missing its statuses array", () =>
    Effect.gen(function* () {
      // A real Huly ProjectType can lack a statuses array; the SDK type marks it present.
      // eslint-disable-next-line no-restricted-syntax -- exercise the guard for a ProjectType without statuses
      const projectType = { ...makeProjectType([]), statuses: undefined } as unknown as ReturnType<
        typeof makeProjectType
      >
      const error = yield* Effect.flip(
        listLeads({ funnel: funnelReference("funnel-1") }).pipe(
          Effect.provide(createTestLayer({ leads: [], projectType })),
          withDiagnostics
        )
      )
      expect(error._tag).toBe("HulyDataInvalidError")
    })
  )

  it.effect("fails when a lead references a status outside the funnel ProjectType", () =>
    Effect.gen(function* () {
      const lead = makeLead({ status: statusRef("status-orphan") })
      const error = yield* Effect.flip(
        listLeads({ funnel: funnelReference("funnel-1") }).pipe(
          Effect.provide(createTestLayer({ leads: [lead], statuses: [makeStatus("status-1", "Active")] })),
          withDiagnostics
        )
      )
      expect(error._tag).toBe("HulyDataInvalidError")
      expect(error.message).toContain("not defined on the funnel ProjectType")
    })
  )

  it.effect("reports a connection error when a lead summary fails output validation", () =>
    Effect.gen(function* () {
      const lead = makeLead({ modifiedOn: -1 })
      const error = yield* Effect.flip(
        listLeads({ funnel: funnelReference("funnel-1") }).pipe(
          Effect.provide(createTestLayer({ leads: [lead] })),
          withDiagnostics
        )
      )
      expect(error._tag).toBe("HulyDataInvalidError")
    })
  )
})

describe("Lead funnel exact resolution and filter branches", () => {
  it.effect("rejects three colliding funnel names", () =>
    Effect.gen(function* () {
      const archived = makeFunnel({
        _id: docRef<MockFunnel>("f-archived"),
        name: "Sales",
        archived: true,
        modifiedOn: 1700000009000
      })
      const olderActive = makeFunnel({
        _id: docRef<MockFunnel>("f-old"),
        name: "Sales",
        archived: false,
        modifiedOn: 1700000001000
      })
      const newerActive = makeFunnel({
        _id: docRef<MockFunnel>("f-new"),
        name: "Sales",
        archived: false,
        modifiedOn: 1700000005000
      })
      const lead = makeLead({ space: spaceRef("f-new") })

      const error = yield* Effect.flip(
        listLeads({ funnel: funnelReference("Sales") }).pipe(
          Effect.provide(createTestLayer({ funnels: [olderActive, archived, newerActive], leads: [lead] })),
          withDiagnostics
        )
      )
      expect(error._tag).toBe("FunnelIdentifierAmbiguousError")
    })
  )

  it.effect("includes archived funnels when requested", () =>
    Effect.gen(function* () {
      const active = makeFunnel({ _id: docRef<MockFunnel>("f-1"), name: "Sales", archived: false })
      const archived = makeFunnel({ _id: docRef<MockFunnel>("f-2"), name: "Old", archived: true })
      const result = yield* listFunnels({ includeArchived: true }).pipe(
        Effect.provide(createTestLayer({ funnels: [active, archived] })),
        withDiagnostics
      )
      expect(result.funnels).toHaveLength(2)
    })
  )

  it.effect("filters leads by a resolved assignee and a title search", () =>
    Effect.gen(function* () {
      const assignee = makePerson("person-1", "found@example.com")
      const lead = makeLead({ assignee: personRef("person-1"), title: "Big Deal" })
      const result = yield* listLeads({
        funnel: funnelReference("funnel-1"),
        assignee: email("found@example.com"),
        titleSearch: "Deal"
      }).pipe(Effect.provide(createTestLayer({ leads: [lead], persons: [assignee] })), withDiagnostics)
      expect(result).toHaveLength(1)
    })
  )

  it.effect("ignores a blank title search", () =>
    Effect.gen(function* () {
      const lead = makeLead()
      const result = yield* listLeads({ funnel: funnelReference("funnel-1"), titleSearch: "   " }).pipe(
        Effect.provide(createTestLayer({ leads: [lead] })),
        withDiagnostics
      )
      expect(result).toHaveLength(1)
    })
  )
})

describe("getLead branch coverage", () => {
  it.effect("returns null for an explicitly cleared customer description", () =>
    Effect.gen(function* () {
      const customer = {
        ...makeContact("customer-1", "Acme,Corp"),
        [leadClassIds.mixin.Customer]: { customerDescription: null }
      }
      const result = yield* getLead({ funnel: funnelReference("funnel-1"), identifier: leadIdentifier("LEAD-1") }).pipe(
        Effect.provide(createTestLayer({ contacts: [customer], leads: [makeLead()] })),
        withDiagnostics
      )

      expect(result.customerDescription).toBeNull()
    })
  )

  it.effect("returns a lead with no assignee", () =>
    Effect.gen(function* () {
      const lead = makeLead({ assignee: null })
      const result = yield* getLead({ funnel: funnelReference("funnel-1"), identifier: leadIdentifier("LEAD-1") }).pipe(
        Effect.provide(createTestLayer({ contacts: [makeContact("customer-1", "Acme")], leads: [lead] })),
        withDiagnostics
      )
      expect(result.assignee).toBeUndefined()
    })
  )

  it.effect("warns when customer metadata cannot be resolved", () =>
    Effect.gen(function* () {
      const diagnostics = yield* makeDiagnosticsScope
      const result = yield* getLead({ funnel: funnelReference("funnel-1"), identifier: leadIdentifier("LEAD-1") }).pipe(
        Effect.provide(createTestLayer({ leads: [makeLead()] })),
        Effect.provideService(Diagnostics, diagnostics.service)
      )
      const warnings = yield* diagnostics.drainWarnings
      const customerWarnings = warnings.filter((warning) => warning.code === "lead_customer_metadata_degraded")

      expect(result.customerType).toBe("unresolved")
      expect(result.customer).toBeNull()
      expect(customerWarnings).toHaveLength(1)
      expect(assertAt(customerWarnings, 0).message).toContain("customer-1")
    })
  )

  it.effect("reports a connection error when the lead detail fails output validation", () =>
    Effect.gen(function* () {
      const lead = makeLead({ createdOn: -1 })
      const error = yield* Effect.flip(
        getLead({ funnel: funnelReference("funnel-1"), identifier: leadIdentifier("LEAD-1") }).pipe(
          Effect.provide(createTestLayer({ leads: [lead] })),
          withDiagnostics
        )
      )
      expect(error._tag).toBe("HulyDataInvalidError")
    })
  )

  it.effect("rejects malformed customer mixin markup references", () =>
    Effect.gen(function* () {
      const malformedCustomer = {
        ...makeContact("customer-1", "Acme,Corp"),
        [leadClassIds.mixin.Customer]: { customerDescription: 42 }
      }
      const error = yield* Effect.flip(
        getLead({ funnel: funnelReference("funnel-1"), identifier: leadIdentifier("LEAD-1") }).pipe(
          Effect.provide(createTestLayer({ contacts: [malformedCustomer], leads: [makeLead()] })),
          withDiagnostics
        )
      )
      expect(error._tag).toBe("HulyDataInvalidError")
    })
  )
})
