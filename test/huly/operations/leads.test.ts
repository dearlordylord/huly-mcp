import { describe, it } from "@effect/vitest"
import type { Contact, Person } from "@hcengineering/contact"
import type { Doc, FindResult, PersonId as CorePersonId, Ref, Space, Status } from "@hcengineering/core"
import { Effect } from "effect"
import { expect } from "vitest"

import { FunnelIdentifier, LeadIdentifier } from "../../../src/domain/schemas/leads.js"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import type { FunnelNotFoundError, LeadNotFoundError } from "../../../src/huly/errors-leads.js"
import { HulyConnectionError } from "../../../src/huly/errors.js"
import { contact, core, task } from "../../../src/huly/huly-plugins.js"
import { leadClassIds } from "../../../src/huly/lead-plugin.js"
import { getLead, listFunnels, listLeads } from "../../../src/huly/operations/leads.js"
import { email, statusName } from "../../helpers/brands.js"

const toFindResult = <T extends Doc>(docs: Array<T>): FindResult<T> => {
  const result = docs as FindResult<T>
  result.total = docs.length
  return result
}

const funnelIdentifier = (value: string) => FunnelIdentifier.make(value)
const leadIdentifier = (value: string) => LeadIdentifier.make(value)

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
  _id: "funnel-1" as Ref<MockFunnel>,
  _class: leadClassIds.class.Funnel,
  space: "space" as Ref<Space>,
  modifiedBy: "user" as CorePersonId,
  modifiedOn: 1700000000000,
  createdBy: "user" as CorePersonId,
  createdOn: 1699000000000,
  name: "Sales",
  archived: false,
  type: "project-type-1" as Ref<Doc>,
  ...overrides
})

const makeLead = (overrides: Partial<MockLead> = {}): MockLead => ({
  _id: "lead-1" as Ref<MockLead>,
  _class: leadClassIds.class.Lead,
  space: "funnel-1" as Ref<Space>,
  modifiedBy: "user" as CorePersonId,
  modifiedOn: 1700000000000,
  createdBy: "user" as CorePersonId,
  createdOn: 1699000000000,
  title: "Big Deal",
  identifier: "LEAD-1",
  number: 1,
  status: "status-1" as Ref<Status>,
  assignee: "person-1" as Ref<Person>,
  description: null,
  attachedTo: "customer-1" as Ref<Contact>,
  parents: [],
  ...overrides
})

const makeStatus = (id: string, name: string): MockStatus => {
  const data = {
    _id: id as Ref<Doc>,
    _class: core.class.Status,
    space: "space" as Ref<Space>,
    modifiedBy: "user" as CorePersonId,
    modifiedOn: 0,
    createdBy: "user" as CorePersonId,
    createdOn: 0,
    name
  }
  return data as MockStatus
}

const makePerson = (id: string, name: string): Person => {
  const data = {
    _id: id as Ref<Person>,
    _class: contact.class.Person,
    space: contact.space.Contacts,
    modifiedBy: "user" as CorePersonId,
    modifiedOn: 0,
    createdBy: "user" as CorePersonId,
    createdOn: 0,
    name,
    city: ""
  }
  return data as Person
}

const makeContact = (id: string, name: string): Contact => {
  const data = {
    _id: id as Ref<Contact>,
    _class: contact.class.Contact,
    space: contact.space.Contacts,
    modifiedBy: "user" as CorePersonId,
    modifiedOn: 0,
    createdBy: "user" as CorePersonId,
    createdOn: 0,
    name
  }
  return data as Contact
}

const makeProjectType = (statusIds: Array<string>) => ({
  _id: "project-type-1" as Ref<Doc>,
  _class: task.class.ProjectType,
  space: "space" as Ref<Space>,
  modifiedBy: "user" as CorePersonId,
  modifiedOn: 0,
  createdBy: "user" as CorePersonId,
  createdOn: 0,
  statuses: statusIds.map((id) => ({ _id: id as Ref<Status> }))
})

interface LeadMockConfig {
  contacts?: Array<Contact>
  fetchMarkupResult?: string
  funnels?: Array<MockFunnel>
  leads?: Array<MockLead>
  persons?: Array<Person>
  projectType?: ReturnType<typeof makeProjectType>
  statusQueryError?: HulyConnectionError
  statuses?: Array<MockStatus>
}

const createTestLayer = (config: LeadMockConfig) => {
  const contacts = config.contacts ?? []
  const funnels = config.funnels ?? [makeFunnel()]
  const leads = config.leads ?? []
  const persons = config.persons ?? []
  const statuses = config.statuses ?? [makeStatus("status-1", "Active")]
  const projectType = config.projectType ?? makeProjectType(statuses.map((status) => status._id as string))

  const findAllImpl: HulyClientOperations["findAll"] = ((_class: unknown, query: unknown, options?: unknown) => {
    if (_class === leadClassIds.class.Funnel) {
      const q = (query ?? {}) as Record<string, unknown>
      let filtered = [...funnels]
      if (q.archived !== undefined) {
        filtered = filtered.filter((funnel) => funnel.archived === q.archived)
      }
      return Effect.succeed(toFindResult(filtered))
    }

    if (_class === leadClassIds.class.Lead) {
      const q = (query ?? {}) as Record<string, unknown>
      let filtered = [...leads]
      if (q.space !== undefined) {
        filtered = filtered.filter((lead) => lead.space === q.space)
      }
      if (q.status !== undefined) {
        filtered = filtered.filter((lead) => lead.status === q.status)
      }
      if (q.assignee !== undefined) {
        filtered = filtered.filter((lead) => lead.assignee === q.assignee)
      }
      const opts = (options ?? {}) as { lookup?: Record<string, unknown> }
      if (opts.lookup?.assignee || opts.lookup?.attachedTo) {
        filtered = filtered.map((lead) => ({
          ...lead,
          $lookup: {
            assignee: opts.lookup?.assignee ? persons.find((person) => person._id === lead.assignee) : undefined,
            attachedTo: opts.lookup?.attachedTo
              ? contacts.find((customer) => customer._id === lead.attachedTo)
              : undefined
          }
        }))
      }
      return Effect.succeed(toFindResult(filtered))
    }

    if (_class === core.class.Status) {
      if (config.statusQueryError !== undefined) {
        return Effect.fail(config.statusQueryError)
      }
      const q = (query ?? {}) as Record<string, unknown>
      let filtered = [...statuses]
      if (q._id !== undefined) {
        const idFilter = q._id as { $in?: Array<unknown> } | unknown
        if (typeof idFilter === "object" && idFilter !== null && "$in" in idFilter) {
          const ids = idFilter.$in as Array<unknown>
          filtered = filtered.filter((status) => ids.includes(status._id))
        }
      }
      return Effect.succeed(toFindResult(filtered))
    }

    if (_class === contact.class.Channel) {
      return Effect.succeed(toFindResult([]))
    }

    return Effect.succeed(toFindResult([]))
  }) as HulyClientOperations["findAll"]

  const findOneImpl: HulyClientOperations["findOne"] = ((_class: unknown, query: unknown) => {
    if (_class === task.class.ProjectType) {
      return Effect.succeed(projectType)
    }

    if (_class === leadClassIds.class.Lead) {
      const q = query as Record<string, unknown>
      const found = leads.find((lead) => (q.identifier !== undefined && lead.identifier === q.identifier))
      return Effect.succeed(found)
    }

    if (_class === leadClassIds.class.Funnel) {
      const q = query as Record<string, unknown>
      const found = funnels.find((funnel) => funnel._id === q._id)
      return Effect.succeed(found)
    }

    if (_class === contact.class.Person) {
      const q = query as Record<string, unknown>
      const found = persons.find((person) => person._id === q._id)
      return Effect.succeed(found)
    }

    if (_class === contact.class.Contact) {
      const q = query as Record<string, unknown>
      const found = contacts.find((customer) => customer._id === q._id)
      return Effect.succeed(found)
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
        const activeFunnel = makeFunnel({ _id: "f-1" as Ref<MockFunnel>, name: "Sales", archived: false })
        const archivedFunnel = makeFunnel({ _id: "f-2" as Ref<MockFunnel>, name: "Old Pipeline", archived: true })

        const testLayer = createTestLayer({ funnels: [activeFunnel, archivedFunnel] })
        const result = yield* listFunnels({}).pipe(Effect.provide(testLayer))

        expect(result.funnels).toHaveLength(1)
        expect(result.funnels[0].identifier).toBe("f-1")
        expect(result.funnels[0].name).toBe("Sales")
        expect(result.total).toBe(1)
      }))

    it.effect("propagates client failures", () =>
      Effect.gen(function*() {
        const findAllImpl: HulyClientOperations["findAll"] = (() =>
          Effect.fail(new HulyConnectionError({ message: "findAll failed" }))) as HulyClientOperations["findAll"]

        const testLayer = HulyClient.testLayer({ findAll: findAllImpl })
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
          assignee: "person-1" as Ref<Person>,
          attachedTo: "customer-1" as Ref<Contact>
        })

        const testLayer = createTestLayer({
          contacts: [customer],
          leads: [lead],
          persons: [assignee]
        })

        const result = yield* listLeads({ funnel: funnelIdentifier("funnel-1") }).pipe(Effect.provide(testLayer))

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

        const result = yield* listLeads({ funnel: funnelIdentifier("sales") }).pipe(Effect.provide(testLayer))

        expect(result).toHaveLength(1)
        expect(result[0].identifier).toBe("LEAD-1")
      }))

    it.effect("filters leads by status name", () =>
      Effect.gen(function*() {
        const statusActive = makeStatus("status-1", "Active")
        const statusWon = makeStatus("status-2", "Won")
        const lead1 = makeLead({ _id: "lead-1" as Ref<MockLead>, status: "status-1" as Ref<Status> })
        const lead2 = makeLead({
          _id: "lead-2" as Ref<MockLead>,
          identifier: "LEAD-2",
          number: 2,
          status: "status-2" as Ref<Status>
        })

        const testLayer = createTestLayer({
          leads: [lead1, lead2],
          statuses: [statusActive, statusWon]
        })

        const result = yield* listLeads({ funnel: funnelIdentifier("funnel-1"), status: statusName("Won") }).pipe(
          Effect.provide(testLayer)
        )

        expect(result).toHaveLength(1)
        expect(result[0].identifier).toBe("LEAD-2")
      }))

    it.effect("returns empty array when assignee is not found", () =>
      Effect.gen(function*() {
        const lead = makeLead()
        const testLayer = createTestLayer({ leads: [lead], persons: [] })

        const result = yield* listLeads({ funnel: funnelIdentifier("funnel-1"), assignee: email("nobody@example.com") })
          .pipe(Effect.provide(testLayer))

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
          listLeads({ funnel: funnelIdentifier("funnel-1") }).pipe(
            Effect.provide(testLayer)
          )
        )

        expect(error._tag).toBe("HulyConnectionError")
        expect(error.message).toContain("status lookup failed")
      }))

    it.effect("fails with FunnelNotFoundError when funnel does not exist", () =>
      Effect.gen(function*() {
        const testLayer = createTestLayer({ funnels: [] })

        const error = yield* Effect.flip(
          listLeads({ funnel: funnelIdentifier("missing-funnel") }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("FunnelNotFoundError")
        expect((error as FunnelNotFoundError).identifier).toBe("missing-funnel")
      }))
  })

  describe("getLead", () => {
    it.effect("returns full lead detail with contact customer and stable funnel id", () =>
      Effect.gen(function*() {
        const assignee = makePerson("person-1", "Smith,Jane")
        const customer = makeContact("customer-1", "Acme,Corp")
        const lead = makeLead({
          assignee: "person-1" as Ref<Person>,
          attachedTo: "customer-1" as Ref<Contact>,
          description: "blob-ref"
        })

        const testLayer = createTestLayer({
          contacts: [customer],
          fetchMarkupResult: "# Deal notes\nImportant details here.",
          leads: [lead],
          persons: [assignee]
        })

        const result = yield* getLead({ funnel: funnelIdentifier("funnel-1"), identifier: leadIdentifier("LEAD-1") })
          .pipe(Effect.provide(testLayer))

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
        const lead = makeLead({ identifier: "LEAD-1", number: 1 })
        const testLayer = createTestLayer({ leads: [lead] })

        const result = yield* getLead({ funnel: funnelIdentifier("funnel-1"), identifier: leadIdentifier("lead-1") })
          .pipe(Effect.provide(testLayer))

        expect(result.identifier).toBe("LEAD-1")
      }))

    it.effect("fails with LeadNotFoundError when lead does not exist", () =>
      Effect.gen(function*() {
        const testLayer = createTestLayer({ leads: [] })

        const error = yield* Effect.flip(
          getLead({ funnel: funnelIdentifier("funnel-1"), identifier: leadIdentifier("LEAD-999") }).pipe(
            Effect.provide(testLayer)
          )
        )

        expect(error._tag).toBe("LeadNotFoundError")
        expect((error as LeadNotFoundError).identifier).toBe("LEAD-999")
        expect((error as LeadNotFoundError).funnel).toBe("funnel-1")
      }))

    it.effect("fails with FunnelNotFoundError when funnel does not exist", () =>
      Effect.gen(function*() {
        const testLayer = createTestLayer({ funnels: [] })

        const error = yield* Effect.flip(
          getLead({ funnel: funnelIdentifier("missing-funnel"), identifier: leadIdentifier("LEAD-1") }).pipe(
            Effect.provide(testLayer)
          )
        )

        expect(error._tag).toBe("FunnelNotFoundError")
        expect((error as FunnelNotFoundError).identifier).toBe("missing-funnel")
      }))
  })
})
