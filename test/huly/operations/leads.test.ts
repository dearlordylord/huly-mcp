import { describe, it } from "@effect/vitest"
import type { Person } from "@hcengineering/contact"
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

// --- Helpers ---

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
  attachedTo: Ref<Doc>
  parents: ReadonlyArray<unknown>
  modifiedOn: number
  createdOn: number
  $lookup?: { assignee?: Person | undefined }
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
  identifier: "SALES-1",
  number: 1,
  status: "status-1" as Ref<Status>,
  assignee: "person-1" as Ref<Person>,
  description: null,
  attachedTo: "customer-1" as Ref<Doc>,
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

const makeProjectType = (statusIds: Array<string>) => ({
  _id: "project-type-1" as Ref<Doc>,
  _class: task.class.ProjectType,
  space: "space" as Ref<Space>,
  modifiedBy: "user" as CorePersonId,
  modifiedOn: 0,
  createdBy: "user" as CorePersonId,
  createdOn: 0,
  statuses: statusIds.map(id => ({ _id: id as Ref<Status> }))
})

// --- Mock layer builder ---

interface LeadMockConfig {
  funnels?: Array<MockFunnel>
  leads?: Array<MockLead>
  statuses?: Array<MockStatus>
  projectType?: ReturnType<typeof makeProjectType>
  persons?: Array<Person>
  fetchMarkupResult?: string
}

const createTestLayer = (config: LeadMockConfig) => {
  const funnels = config.funnels ?? [makeFunnel()]
  const leads = config.leads ?? []
  const statuses = config.statuses ?? [makeStatus("status-1", "Active")]
  const projectType = config.projectType ?? makeProjectType(statuses.map(s => s._id as string))
  const persons = config.persons ?? []

  const findAllImpl: HulyClientOperations["findAll"] = ((_class: unknown, query: unknown, _options?: unknown) => {
    if (_class === leadClassIds.class.Funnel) {
      const q = (query ?? {}) as Record<string, unknown>
      let filtered = [...funnels]
      if (q.archived !== undefined) {
        filtered = filtered.filter(f => f.archived === q.archived)
      }
      return Effect.succeed(toFindResult(filtered))
    }
    if (_class === leadClassIds.class.Lead) {
      const q = (query ?? {}) as Record<string, unknown>
      let filtered = [...leads]
      if (q.space !== undefined) {
        filtered = filtered.filter(l => l.space === q.space)
      }
      if (q.status !== undefined) {
        filtered = filtered.filter(l => l.status === q.status)
      }
      if (q.assignee !== undefined) {
        filtered = filtered.filter(l => l.assignee === q.assignee)
      }
      // Attach $lookup.assignee if requested
      const opts = (_options ?? {}) as { lookup?: Record<string, unknown> }
      if (opts.lookup?.assignee) {
        filtered = filtered.map(l => {
          const assigneePerson = persons.find(p => p._id === l.assignee)
          const withLookup: MockLead = { ...l, $lookup: { assignee: assigneePerson } }
          return withLookup
        })
      }
      return Effect.succeed(toFindResult(filtered))
    }
    if (_class === core.class.Status) {
      const q = (query ?? {}) as Record<string, unknown>
      let filtered = [...statuses]
      if (q._id !== undefined) {
        const idFilter = q._id as { $in?: Array<unknown> } | unknown
        if (typeof idFilter === "object" && idFilter !== null && "$in" in idFilter) {
          const ids = idFilter.$in as Array<unknown>
          filtered = filtered.filter(s => ids.includes(s._id))
        }
      }
      return Effect.succeed(toFindResult(filtered))
    }
    if (_class === contact.class.Person) {
      const q = (query ?? {}) as Record<string, unknown>
      let filtered = [...persons]
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
          const pattern = nameFilter.$like.replace(/%/g, ".*").replace(/_/g, ".")
          filtered = filtered.filter(p => new RegExp(`^${pattern}$`, "i").test(p.name))
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
      const found = leads.find(l =>
        (q.identifier !== undefined && l.identifier === q.identifier)
        || (q.number !== undefined && l.number === q.number)
      )
      return Effect.succeed(found)
    }
    if (_class === leadClassIds.class.Funnel) {
      const q = query as Record<string, unknown>
      const found = funnels.find(f => f._id === q._id)
      return Effect.succeed(found)
    }
    if (_class === contact.class.Person) {
      const q = query as Record<string, unknown>
      const found = persons.find(p => p._id === q._id)
      return Effect.succeed(found)
    }
    return Effect.succeed(undefined)
  }) as HulyClientOperations["findOne"]

  const fetchMarkupImpl: HulyClientOperations["fetchMarkup"] =
    (() => Effect.succeed(config.fetchMarkupResult ?? "# Description")) as HulyClientOperations["fetchMarkup"]

  return HulyClient.testLayer({
    findAll: findAllImpl,
    findOne: findOneImpl,
    fetchMarkup: fetchMarkupImpl
  })
}

// --- Tests ---

describe("Lead Operations", () => {
  describe("listFunnels", () => {
    it.effect("returns active funnels excluding archived", () =>
      Effect.gen(function*() {
        const activeFunnel = makeFunnel({ _id: "f-1" as Ref<MockFunnel>, name: "Sales", archived: false })
        const archivedFunnel = makeFunnel({ _id: "f-2" as Ref<MockFunnel>, name: "Old Pipeline", archived: true })

        const testLayer = createTestLayer({ funnels: [activeFunnel, archivedFunnel] })

        const result = yield* listFunnels({}).pipe(Effect.provide(testLayer))

        expect(result.funnels).toHaveLength(1)
        expect(result.funnels[0].name).toBe("Sales")
        expect(result.total).toBe(1)
      }))

    it.effect("returns all funnels when includeArchived is true", () =>
      Effect.gen(function*() {
        const activeFunnel = makeFunnel({ _id: "f-1" as Ref<MockFunnel>, name: "Sales", archived: false })
        const archivedFunnel = makeFunnel({ _id: "f-2" as Ref<MockFunnel>, name: "Old Pipeline", archived: true })

        const testLayer = createTestLayer({ funnels: [activeFunnel, archivedFunnel] })

        const result = yield* listFunnels({ includeArchived: true }).pipe(Effect.provide(testLayer))

        expect(result.funnels).toHaveLength(2)
        expect(result.total).toBe(2)
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
    it.effect("lists leads in a funnel with resolved status, assignee, and customer", () =>
      Effect.gen(function*() {
        const assignee = makePerson("person-1", "Smith,Jane")
        const customer = makePerson("customer-1", "Acme,Corp")
        const lead = makeLead({
          assignee: "person-1" as Ref<Person>,
          attachedTo: "customer-1" as Ref<Doc>
        })

        const testLayer = createTestLayer({
          leads: [lead],
          persons: [assignee, customer]
        })

        const result = yield* listLeads({ funnel: funnelIdentifier("Sales") }).pipe(Effect.provide(testLayer))

        expect(result).toHaveLength(1)
        expect(result[0].identifier).toBe("SALES-1")
        expect(result[0].title).toBe("Big Deal")
        expect(result[0].status).toBe("Active")
        expect(result[0].assignee).toBe("Smith,Jane")
        expect(result[0].customer).toBe("Acme,Corp")
      }))

    it.effect("filters leads by status name", () =>
      Effect.gen(function*() {
        const statusActive = makeStatus("status-1", "Active")
        const statusWon = makeStatus("status-2", "Won")
        const lead1 = makeLead({ _id: "lead-1" as Ref<MockLead>, status: "status-1" as Ref<Status> })
        const lead2 = makeLead({
          _id: "lead-2" as Ref<MockLead>,
          identifier: "SALES-2",
          number: 2,
          status: "status-2" as Ref<Status>
        })

        const testLayer = createTestLayer({
          leads: [lead1, lead2],
          statuses: [statusActive, statusWon]
        })

        const result = yield* listLeads({ funnel: funnelIdentifier("Sales"), status: statusName("Won") }).pipe(
          Effect.provide(testLayer)
        )

        expect(result).toHaveLength(1)
        expect(result[0].identifier).toBe("SALES-2")
      }))

    it.effect("returns empty array when assignee is not found", () =>
      Effect.gen(function*() {
        const lead = makeLead()

        const testLayer = createTestLayer({
          leads: [lead],
          persons: []
        })

        const result = yield* listLeads({ funnel: funnelIdentifier("Sales"), assignee: email("nobody@example.com") })
          .pipe(
            Effect.provide(testLayer)
          )

        expect(result).toEqual([])
      }))

    it.effect("fails with FunnelNotFoundError when funnel does not exist", () =>
      Effect.gen(function*() {
        const testLayer = createTestLayer({ funnels: [] })

        const error = yield* Effect.flip(
          listLeads({ funnel: funnelIdentifier("Nonexistent") }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("FunnelNotFoundError")
        expect((error as FunnelNotFoundError).identifier).toBe("Nonexistent")
      }))
  })

  describe("getLead", () => {
    it.effect("returns full lead detail with description", () =>
      Effect.gen(function*() {
        const assignee = makePerson("person-1", "Smith,Jane")
        const customer = makePerson("customer-1", "Acme,Corp")
        const lead = makeLead({
          assignee: "person-1" as Ref<Person>,
          attachedTo: "customer-1" as Ref<Doc>,
          description: "blob-ref" as string
        })

        const testLayer = createTestLayer({
          leads: [lead],
          persons: [assignee, customer],
          fetchMarkupResult: "# Deal notes\nImportant details here."
        })

        const result = yield* getLead({ funnel: funnelIdentifier("Sales"), identifier: leadIdentifier("SALES-1") })
          .pipe(
            Effect.provide(testLayer)
          )

        expect(result.identifier).toBe("SALES-1")
        expect(result.title).toBe("Big Deal")
        expect(result.status).toBe("Active")
        expect(result.assignee).toBe("Smith,Jane")
        expect(result.customer).toBe("Acme,Corp")
        expect(result.description).toBe("# Deal notes\nImportant details here.")
        expect(result.funnel).toBe("Sales")
      }))

    it.effect("finds lead by identifier string", () =>
      Effect.gen(function*() {
        const lead = makeLead({ identifier: "SALES-1", number: 1 })

        const testLayer = createTestLayer({
          leads: [lead],
          persons: [makePerson("person-1", "Smith,Jane")]
        })

        const result = yield* getLead({ funnel: funnelIdentifier("Sales"), identifier: leadIdentifier("SALES-1") })
          .pipe(
            Effect.provide(testLayer)
          )

        expect(result.identifier).toBe("SALES-1")
      }))

    it.effect("fails with LeadNotFoundError when lead does not exist", () =>
      Effect.gen(function*() {
        const testLayer = createTestLayer({ leads: [] })

        const error = yield* Effect.flip(
          getLead({ funnel: funnelIdentifier("Sales"), identifier: leadIdentifier("SALES-999") }).pipe(
            Effect.provide(testLayer)
          )
        )

        expect(error._tag).toBe("LeadNotFoundError")
        expect((error as LeadNotFoundError).identifier).toBe("SALES-999")
        expect((error as LeadNotFoundError).funnel).toBe("Sales")
      }))

    it.effect("fails with FunnelNotFoundError when funnel does not exist", () =>
      Effect.gen(function*() {
        const testLayer = createTestLayer({ funnels: [] })

        const error = yield* Effect.flip(
          getLead({ funnel: funnelIdentifier("Nonexistent"), identifier: leadIdentifier("SALES-1") }).pipe(
            Effect.provide(testLayer)
          )
        )

        expect(error._tag).toBe("FunnelNotFoundError")
        expect((error as FunnelNotFoundError).identifier).toBe("Nonexistent")
      }))
  })
})
