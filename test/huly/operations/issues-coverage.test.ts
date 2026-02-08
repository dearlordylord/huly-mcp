import { describe, it } from "@effect/vitest"
import { AvatarType, type Channel, type Person } from "@hcengineering/contact"
import type {
  Attribute,
  Class,
  Doc,
  FindResult,
  MarkupBlobRef,
  PersonId,
  Ref,
  Space,
  Status
} from "@hcengineering/core"
import type { ProjectType, TaskType } from "@hcengineering/task"
import type {
  Component as HulyComponent,
  Issue as HulyIssue,
  IssueStatus,
  Project as HulyProject
} from "@hcengineering/tracker"
import { IssuePriority, TimeReportDayType } from "@hcengineering/tracker"
import { Effect } from "effect"
import { expect } from "vitest"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import type { InvalidStatusError, PersonNotFoundError } from "../../../src/huly/errors.js"
import { contact, core, task, tracker } from "../../../src/huly/huly-plugins.js"
import { createIssue, getIssue, listIssues, updateIssue } from "../../../src/huly/operations/issues.js"
import { componentIdentifier, email, issueIdentifier, projectIdentifier, statusName } from "../../helpers/brands.js"

const toFindResult = <T extends Doc>(docs: Array<T>): FindResult<T> => {
  const result = docs as FindResult<T>
  result.total = docs.length
  return result
}

const makeProject = (overrides?: Partial<HulyProject>): HulyProject => {
  const base = {
    _id: "project-1" as Ref<HulyProject>,
    _class: tracker.class.Project,
    space: "space-1" as Ref<Space>,
    identifier: "TEST",
    name: "Test Project",
    description: "",
    private: false,
    members: [],
    archived: false,
    sequence: 1,
    type: "project-type-1" as Ref<ProjectType>,
    defaultIssueStatus: "status-open" as Ref<IssueStatus>,
    defaultTimeReportDay: TimeReportDayType.CurrentWorkDay,
    modifiedBy: "user-1" as PersonId,
    modifiedOn: Date.now(),
    createdBy: "user-1" as PersonId,
    createdOn: Date.now(),
    ...overrides
  }
  return base as HulyProject
}

const makeIssue = (overrides?: Partial<HulyIssue>): HulyIssue => ({
  _id: "issue-1" as Ref<HulyIssue>,
  _class: tracker.class.Issue,
  space: "project-1" as Ref<HulyProject>,
  identifier: "TEST-1",
  title: "Test Issue",
  description: null,
  status: "status-open" as Ref<IssueStatus>,
  priority: IssuePriority.Medium,
  assignee: null,
  kind: "task-type-1" as Ref<TaskType>,
  number: 1,
  dueDate: null,
  rank: "0|aaa",
  attachedTo: "no-parent" as Ref<HulyIssue>,
  attachedToClass: tracker.class.Issue,
  collection: "subIssues",
  component: null,
  subIssues: 0,
  parents: [],
  estimation: 0,
  remainingTime: 0,
  reportedTime: 0,
  reports: 0,
  childInfo: [],
  modifiedBy: "user-1" as PersonId,
  modifiedOn: Date.now(),
  createdBy: "user-1" as PersonId,
  createdOn: Date.now(),
  ...overrides
})

const makeStatus = (overrides?: Partial<Status>): Status => ({
  _id: "status-1" as Ref<Status>,
  _class: "core:class:Status" as Ref<Class<Status>>,
  space: "space-1" as Ref<Space>,
  ofAttribute: "tracker:attribute:IssueStatus" as Ref<Attribute<Status>>,
  name: "Open",
  modifiedBy: "user-1" as PersonId,
  modifiedOn: Date.now(),
  createdBy: "user-1" as PersonId,
  createdOn: Date.now(),
  ...overrides
})

const makePerson = (overrides?: Partial<Person>): Person => ({
  _id: "person-1" as Ref<Person>,
  _class: contact.class.Person,
  space: "space-1" as Ref<Space>,
  name: "John Doe",
  avatarType: AvatarType.COLOR,
  modifiedBy: "user-1" as PersonId,
  modifiedOn: Date.now(),
  createdBy: "user-1" as PersonId,
  createdOn: Date.now(),
  ...overrides
})

const makeChannel = (overrides?: Partial<Channel>): Channel => ({
  _id: "channel-1" as Ref<Channel>,
  _class: contact.class.Channel,
  space: "space-1" as Ref<Space>,
  attachedTo: "person-1" as Ref<Doc>,
  attachedToClass: contact.class.Person,
  collection: "channels",
  provider: contact.channelProvider.Email,
  value: "john@example.com",
  modifiedBy: "user-1" as PersonId,
  modifiedOn: Date.now(),
  createdBy: "user-1" as PersonId,
  createdOn: Date.now(),
  ...overrides
})

const makeComponent = (overrides?: Partial<HulyComponent>): HulyComponent => ({
  _id: "comp-1" as Ref<HulyComponent>,
  _class: tracker.class.Component,
  space: "project-1" as Ref<HulyProject>,
  label: "Frontend",
  description: "",
  lead: null,
  comments: 0,
  modifiedBy: "user-1" as PersonId,
  modifiedOn: Date.now(),
  createdBy: "user-1" as PersonId,
  createdOn: Date.now(),
  ...overrides
})

interface MockConfig {
  projects?: Array<HulyProject>
  issues?: Array<HulyIssue>
  statuses?: Array<Status>
  persons?: Array<Person>
  channels?: Array<Channel>
  components?: Array<HulyComponent>
  captureIssueQuery?: { query?: Record<string, unknown>; options?: Record<string, unknown> }
  markupContent?: Record<string, string>
  captureUpdateDoc?: { operations?: Record<string, unknown> }
  captureAddCollection?: { attributes?: Record<string, unknown>; id?: string; class?: unknown }
  captureUploadMarkup?: { markup?: string }
  captureUpdateMarkup?: { markup?: string }
  updateDocResult?: { object?: { sequence?: number } }
}

const createTestLayerWithMocks = (config: MockConfig) => {
  const projects = config.projects ?? []
  const issues = config.issues ?? []
  const statuses = config.statuses ?? []
  const persons = config.persons ?? []
  const channels = config.channels ?? []
  const components = config.components ?? []

  const findAllImpl: HulyClientOperations["findAll"] = ((_class: unknown, query: unknown, options: unknown) => {
    if (_class === tracker.class.Issue) {
      if (config.captureIssueQuery) {
        config.captureIssueQuery.query = query as Record<string, unknown>
        config.captureIssueQuery.options = options as Record<string, unknown>
      }
      const opts = options as { sort?: Record<string, number>; lookup?: Record<string, unknown> } | undefined
      let result = [...issues]
      if (opts?.sort?.modifiedOn !== undefined) {
        const direction = opts.sort.modifiedOn
        result = result.sort((a, b) => direction * (a.modifiedOn - b.modifiedOn))
      }
      if (opts?.lookup?.assignee) {
        result = result.map(issue => {
          const assigneePerson = issue.assignee
            ? persons.find(p => String(p._id) === String(issue.assignee))
            : undefined
          return { ...issue, $lookup: { assignee: assigneePerson } }
        })
      }
      return Effect.succeed(toFindResult(result as Array<Doc>))
    }
    if (String(_class) === String(core.class.Status)) {
      const q = query as Record<string, unknown>
      const inQuery = q._id as { $in?: Array<Ref<Status>> } | undefined
      if (inQuery?.$in) {
        const filtered = statuses.filter(s => inQuery.$in!.includes(s._id))
        return Effect.succeed(toFindResult(filtered as Array<Doc>))
      }
      return Effect.succeed(toFindResult(statuses as Array<Doc>))
    }
    if (_class === contact.class.Channel) {
      const value = (query as Record<string, unknown>).value as string
      const filtered = channels.filter(c => c.value === value)
      return Effect.succeed(toFindResult(filtered as Array<Doc>))
    }
    if (_class === contact.class.Person) {
      return Effect.succeed(toFindResult(persons as Array<Doc>))
    }
    return Effect.succeed(toFindResult([]))
  }) as HulyClientOperations["findAll"]

  const findOneImpl: HulyClientOperations["findOne"] = ((_class: unknown, query: unknown, options?: unknown) => {
    if (_class === tracker.class.Project) {
      const identifier = (query as Record<string, unknown>).identifier as string
      const found = projects.find(p => p.identifier === identifier)
      if (found === undefined) return Effect.succeed(undefined)
      const opts = options as { lookup?: Record<string, unknown> } | undefined
      if (opts?.lookup?.type) {
        const projectWithLookup = {
          ...found,
          $lookup: {
            type: {
              _id: "project-type-1",
              statuses: statuses.map(s => ({ _id: s._id }))
            }
          }
        }
        return Effect.succeed(projectWithLookup as Doc)
      }
      return Effect.succeed(found as Doc)
    }
    if (_class === tracker.class.Issue) {
      const q = query as Record<string, unknown>
      const found = issues.find(i =>
        (q.identifier && i.identifier === q.identifier)
        || (q.number && i.number === q.number)
        || (q.space && i.space === q.space && !q.identifier && !q.number)
      )
      return Effect.succeed(found as Doc | undefined)
    }
    if (_class === tracker.class.Component) {
      const q = query as Record<string, unknown>
      const found = components.find(c => (q._id && c._id === q._id) || (q.label && c.label === q.label))
      return Effect.succeed(found as Doc | undefined)
    }
    if (_class === contact.class.Channel) {
      const q = query as Record<string, unknown>
      const value = q.value as string | { $like: string } | undefined
      if (typeof value === "string") {
        const found = channels.find(c => c.value === value && (q.provider === undefined || c.provider === q.provider))
        return Effect.succeed(found as Doc | undefined)
      }
      if (value && typeof value === "object" && "$like" in value) {
        const pattern = value.$like.replace(/%/g, "")
        const found = channels.find(c =>
          c.value.includes(pattern) && (q.provider === undefined || c.provider === q.provider)
        )
        return Effect.succeed(found as Doc | undefined)
      }
      return Effect.succeed(undefined)
    }
    if (_class === contact.class.Person) {
      const q = query as Record<string, unknown>
      if (q._id) {
        const found = persons.find(p => p._id === q._id)
        return Effect.succeed(found as Doc | undefined)
      }
      if (q.name) {
        if (typeof q.name === "string") {
          const found = persons.find(p => p.name === q.name)
          return Effect.succeed(found as Doc | undefined)
        }
        if (typeof q.name === "object" && "$like" in (q.name as Record<string, unknown>)) {
          const pattern = (q.name as Record<string, string>).$like.replace(/%/g, "")
          const found = persons.find(p => p.name.includes(pattern))
          return Effect.succeed(found as Doc | undefined)
        }
      }
      return Effect.succeed(undefined)
    }
    return Effect.succeed(undefined)
  }) as HulyClientOperations["findOne"]

  const fetchMarkupImpl: HulyClientOperations["fetchMarkup"] = (
    (_objectClass: unknown, _objectId: unknown, _objectAttr: unknown, id: unknown) => {
      const content = (config.markupContent ?? {})[id as string] ?? ""
      return Effect.succeed(content)
    }
  ) as HulyClientOperations["fetchMarkup"]

  const updateDocImpl: HulyClientOperations["updateDoc"] = (
    (_class: unknown, _space: unknown, _objectId: unknown, operations: unknown) => {
      if (config.captureUpdateDoc) {
        config.captureUpdateDoc.operations = operations as Record<string, unknown>
      }
      const project = projects[0]
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- project may be undefined from array access
      const sequence = (config.updateDocResult?.object?.sequence) ?? (project ? project.sequence + 1 : 1)
      return Effect.succeed({ object: { sequence } } as never)
    }
  ) as HulyClientOperations["updateDoc"]

  const addCollectionImpl: HulyClientOperations["addCollection"] = ((
    _class: unknown,
    _space: unknown,
    _attachedTo: unknown,
    _attachedToClass: unknown,
    _collection: unknown,
    attributes: unknown,
    id?: unknown
  ) => {
    if (config.captureAddCollection) {
      config.captureAddCollection.class = _class
      config.captureAddCollection.attributes = attributes as Record<string, unknown>
      config.captureAddCollection.id = id as string
    }
    return Effect.succeed((id ?? "new-issue-id") as Ref<Doc>)
  }) as HulyClientOperations["addCollection"]

  // eslint-disable-next-line no-restricted-syntax -- mock function signature doesn't overlap with typed signature
  const uploadMarkupImpl: HulyClientOperations["uploadMarkup"] = ((
    _objectClass: unknown,
    _objectId: unknown,
    _objectAttr: unknown,
    markup: unknown
  ) => {
    if (config.captureUploadMarkup) {
      config.captureUploadMarkup.markup = markup as string
    }
    return Effect.succeed("markup-ref-123")
  }) as unknown as HulyClientOperations["uploadMarkup"]

  const updateMarkupImpl: HulyClientOperations["updateMarkup"] = ((
    _objectClass: unknown,
    _objectId: unknown,
    _objectAttr: unknown,
    markup: unknown
  ) => {
    if (config.captureUpdateMarkup) {
      config.captureUpdateMarkup.markup = markup as string
    }
    return Effect.succeed(undefined)
  }) as HulyClientOperations["updateMarkup"]

  const removeDocImpl: HulyClientOperations["removeDoc"] = (() => {
    return Effect.succeed({})
  }) as HulyClientOperations["removeDoc"]

  return HulyClient.testLayer({
    findAll: findAllImpl,
    findOne: findOneImpl,
    fetchMarkup: fetchMarkupImpl,
    updateDoc: updateDocImpl,
    addCollection: addCollectionImpl,
    uploadMarkup: uploadMarkupImpl,
    updateMarkup: updateMarkupImpl,
    removeDoc: removeDocImpl
  })
}

describe("Issues Coverage - resolveStatusName", () => {
  // test-revizorro: approved
  it.effect("fails with HulyError when status ID not found in project status list", () =>
    Effect.gen(function*() {
      const project = makeProject({ identifier: "TEST" })
      const openStatus = makeStatus({ _id: "status-open" as Ref<Status>, name: "Open" })
      const issue = makeIssue({
        identifier: "TEST-1",
        status: "status-unknown" as Ref<Status>
      })

      const testLayer = createTestLayerWithMocks({
        projects: [project],
        issues: [issue],
        statuses: [openStatus]
      })

      const error = yield* Effect.flip(
        listIssues({ project: projectIdentifier("TEST") }).pipe(Effect.provide(testLayer))
      )

      expect(error._tag).toBe("HulyError")
      expect(error.message).toContain("status-unknown")
      expect(error.message).toContain("not found in project status list")
    }))
})

describe("Issues Coverage - listIssues status filters", () => {
  // test-revizorro: approved
  it.effect("open filter excludes done and canceled statuses", () =>
    Effect.gen(function*() {
      const project = makeProject({ identifier: "TEST" })
      const statuses = [
        makeStatus({
          _id: "status-open" as Ref<Status>,
          name: "Open",
          category: task.statusCategory.Active
        }),
        makeStatus({
          _id: "status-done" as Ref<Status>,
          name: "Done",
          category: task.statusCategory.Won
        }),
        makeStatus({
          _id: "status-canceled" as Ref<Status>,
          name: "Canceled",
          category: task.statusCategory.Lost
        })
      ]
      const issues = [
        makeIssue({ identifier: "TEST-1", status: "status-open" as Ref<Status> })
      ]
      const captureQuery: MockConfig["captureIssueQuery"] = {}

      const testLayer = createTestLayerWithMocks({
        projects: [project],
        issues,
        statuses,
        captureIssueQuery: captureQuery
      })

      yield* listIssues({ project: projectIdentifier("TEST"), status: statusName("open") }).pipe(
        Effect.provide(testLayer)
      )

      expect(captureQuery.query?.status).toEqual({
        $nin: ["status-done", "status-canceled"]
      })
    }))

  // test-revizorro: approved
  it.effect("open filter with no done/canceled statuses does not set $nin", () =>
    Effect.gen(function*() {
      const project = makeProject({ identifier: "TEST" })
      const statuses = [
        makeStatus({
          _id: "status-open" as Ref<Status>,
          name: "Open",
          category: task.statusCategory.Active
        })
      ]
      const issues = [
        makeIssue({ identifier: "TEST-1", status: "status-open" as Ref<Status> })
      ]
      const captureQuery: MockConfig["captureIssueQuery"] = {}

      const testLayer = createTestLayerWithMocks({
        projects: [project],
        issues,
        statuses,
        captureIssueQuery: captureQuery
      })

      yield* listIssues({ project: projectIdentifier("TEST"), status: statusName("open") }).pipe(
        Effect.provide(testLayer)
      )

      expect(captureQuery.query?.status).toBeUndefined()
    }))

  // test-revizorro: approved
  it.effect("done filter includes only done statuses", () =>
    Effect.gen(function*() {
      const project = makeProject({ identifier: "TEST" })
      const statuses = [
        makeStatus({
          _id: "status-open" as Ref<Status>,
          name: "Open",
          category: task.statusCategory.Active
        }),
        makeStatus({
          _id: "status-done" as Ref<Status>,
          name: "Done",
          category: task.statusCategory.Won
        })
      ]
      const issues = [
        makeIssue({ identifier: "TEST-1", status: "status-done" as Ref<Status> })
      ]
      const captureQuery: MockConfig["captureIssueQuery"] = {}

      const testLayer = createTestLayerWithMocks({
        projects: [project],
        issues,
        statuses,
        captureIssueQuery: captureQuery
      })

      yield* listIssues({ project: projectIdentifier("TEST"), status: statusName("done") }).pipe(
        Effect.provide(testLayer)
      )

      expect(captureQuery.query?.status).toEqual({
        $in: ["status-done"]
      })
    }))

  // test-revizorro: approved
  it.effect("done filter returns empty when no done statuses exist", () =>
    Effect.gen(function*() {
      const project = makeProject({ identifier: "TEST" })
      const statuses = [
        makeStatus({
          _id: "status-open" as Ref<Status>,
          name: "Open",
          category: task.statusCategory.Active
        })
      ]

      const testLayer = createTestLayerWithMocks({
        projects: [project],
        issues: [makeIssue()],
        statuses
      })

      const result = yield* listIssues({ project: projectIdentifier("TEST"), status: statusName("done") }).pipe(
        Effect.provide(testLayer)
      )

      expect(result).toEqual([])
    }))

  // test-revizorro: suspect | mock ProjectType.statuses missing category field—isCanceled won't be computed
  it.effect("canceled filter includes only canceled statuses", () =>
    Effect.gen(function*() {
      const project = makeProject({ identifier: "TEST" })
      const statuses = [
        makeStatus({
          _id: "status-open" as Ref<Status>,
          name: "Open",
          category: task.statusCategory.Active
        }),
        makeStatus({
          _id: "status-canceled" as Ref<Status>,
          name: "Canceled",
          category: task.statusCategory.Lost
        })
      ]
      const issues = [
        makeIssue({ identifier: "TEST-1", status: "status-canceled" as Ref<Status> })
      ]
      const captureQuery: MockConfig["captureIssueQuery"] = {}

      const testLayer = createTestLayerWithMocks({
        projects: [project],
        issues,
        statuses,
        captureIssueQuery: captureQuery
      })

      yield* listIssues({ project: projectIdentifier("TEST"), status: statusName("canceled") }).pipe(
        Effect.provide(testLayer)
      )

      expect(captureQuery.query?.status).toEqual({
        $in: ["status-canceled"]
      })
    }))

  // test-revizorro: approved
  it.effect("canceled filter returns empty when no canceled statuses exist", () =>
    Effect.gen(function*() {
      const project = makeProject({ identifier: "TEST" })
      const statuses = [
        makeStatus({
          _id: "status-open" as Ref<Status>,
          name: "Open",
          category: task.statusCategory.Active
        })
      ]

      const testLayer = createTestLayerWithMocks({
        projects: [project],
        issues: [makeIssue()],
        statuses
      })

      const result = yield* listIssues({ project: projectIdentifier("TEST"), status: statusName("canceled") }).pipe(
        Effect.provide(testLayer)
      )

      expect(result).toEqual([])
    }))

  // test-revizorro: approved
  it.effect("custom status name resolves via resolveStatusByName", () =>
    Effect.gen(function*() {
      const project = makeProject({ identifier: "TEST" })
      const statuses = [
        makeStatus({ _id: "status-review" as Ref<Status>, name: "In Review" }),
        makeStatus({ _id: "status-open" as Ref<Status>, name: "Open" })
      ]
      const issues = [
        makeIssue({ identifier: "TEST-1", status: "status-review" as Ref<Status> })
      ]
      const captureQuery: MockConfig["captureIssueQuery"] = {}

      const testLayer = createTestLayerWithMocks({
        projects: [project],
        issues,
        statuses,
        captureIssueQuery: captureQuery
      })

      yield* listIssues({ project: projectIdentifier("TEST"), status: statusName("In Review") }).pipe(
        Effect.provide(testLayer)
      )

      expect(captureQuery.query?.status).toBe("status-review")
    }))

  // test-revizorro: approved
  it.effect("custom status name fails with InvalidStatusError when not found", () =>
    Effect.gen(function*() {
      const project = makeProject({ identifier: "TEST" })
      const statuses = [
        makeStatus({ _id: "status-open" as Ref<Status>, name: "Open" })
      ]

      const testLayer = createTestLayerWithMocks({
        projects: [project],
        issues: [],
        statuses
      })

      const error = yield* Effect.flip(
        listIssues({ project: projectIdentifier("TEST"), status: statusName("Nonexistent Status") }).pipe(
          Effect.provide(testLayer)
        )
      )

      expect(error._tag).toBe("InvalidStatusError")
      expect((error as InvalidStatusError).status).toBe("Nonexistent Status")
    }))
})

describe("Issues Coverage - listIssues assignee filter", () => {
  // test-revizorro: approved
  it.effect("returns empty when assignee not found", () =>
    Effect.gen(function*() {
      const project = makeProject({ identifier: "TEST" })
      const statuses = [makeStatus({ _id: "status-open" as Ref<Status>, name: "Open" })]

      const testLayer = createTestLayerWithMocks({
        projects: [project],
        issues: [makeIssue()],
        statuses,
        persons: [],
        channels: []
      })

      const result = yield* listIssues({
        project: projectIdentifier("TEST"),
        assignee: email("nobody@example.com")
      }).pipe(Effect.provide(testLayer))

      expect(result).toEqual([])
    }))

  // test-revizorro: approved
  it.effect("sets assignee query when person found", () =>
    Effect.gen(function*() {
      const project = makeProject({ identifier: "TEST" })
      const person = makePerson({ _id: "person-1" as Ref<Person>, name: "John Doe" })
      const channel = makeChannel({ attachedTo: "person-1" as Ref<Doc>, value: "john@example.com" })
      const statuses = [makeStatus({ _id: "status-open" as Ref<Status>, name: "Open" })]
      const issues = [makeIssue({ assignee: "person-1" as Ref<Person> })]
      const captureQuery: MockConfig["captureIssueQuery"] = {}

      const testLayer = createTestLayerWithMocks({
        projects: [project],
        issues,
        statuses,
        persons: [person],
        channels: [channel],
        captureIssueQuery: captureQuery
      })

      yield* listIssues({ project: projectIdentifier("TEST"), assignee: email("john@example.com") }).pipe(
        Effect.provide(testLayer)
      )

      expect(captureQuery.query?.assignee).toBe("person-1")
    }))
})

describe("Issues Coverage - listIssues titleSearch", () => {
  // test-revizorro: approved
  it.effect("sets $like query for titleSearch", () =>
    Effect.gen(function*() {
      const project = makeProject({ identifier: "TEST" })
      const statuses = [makeStatus({ _id: "status-open" as Ref<Status>, name: "Open" })]
      const captureQuery: MockConfig["captureIssueQuery"] = {}

      const testLayer = createTestLayerWithMocks({
        projects: [project],
        issues: [],
        statuses,
        captureIssueQuery: captureQuery
      })

      yield* listIssues({ project: projectIdentifier("TEST"), titleSearch: "bug fix" }).pipe(Effect.provide(testLayer))

      expect(captureQuery.query?.title).toEqual({ $like: "%bug fix%" })
    }))

  // test-revizorro: approved
  it.effect("skips titleSearch when empty or whitespace-only", () =>
    Effect.gen(function*() {
      const project = makeProject({ identifier: "TEST" })
      const statuses = [makeStatus({ _id: "status-open" as Ref<Status>, name: "Open" })]
      const captureQuery: MockConfig["captureIssueQuery"] = {}

      const testLayer = createTestLayerWithMocks({
        projects: [project],
        issues: [],
        statuses,
        captureIssueQuery: captureQuery
      })

      yield* listIssues({ project: projectIdentifier("TEST"), titleSearch: "   " }).pipe(Effect.provide(testLayer))

      expect(captureQuery.query?.title).toBeUndefined()
    }))
})

describe("Issues Coverage - listIssues descriptionSearch", () => {
  // test-revizorro: approved
  it.effect("sets $search query for descriptionSearch", () =>
    Effect.gen(function*() {
      const project = makeProject({ identifier: "TEST" })
      const statuses = [makeStatus({ _id: "status-open" as Ref<Status>, name: "Open" })]
      const captureQuery: MockConfig["captureIssueQuery"] = {}

      const testLayer = createTestLayerWithMocks({
        projects: [project],
        issues: [],
        statuses,
        captureIssueQuery: captureQuery
      })

      yield* listIssues({ project: projectIdentifier("TEST"), descriptionSearch: "error handling" }).pipe(
        Effect.provide(testLayer)
      )

      expect(captureQuery.query?.$search).toBe("error handling")
    }))

  // test-revizorro: approved
  it.effect("skips descriptionSearch when empty or whitespace-only", () =>
    Effect.gen(function*() {
      const project = makeProject({ identifier: "TEST" })
      const statuses = [makeStatus({ _id: "status-open" as Ref<Status>, name: "Open" })]
      const captureQuery: MockConfig["captureIssueQuery"] = {}

      const testLayer = createTestLayerWithMocks({
        projects: [project],
        issues: [],
        statuses,
        captureIssueQuery: captureQuery
      })

      yield* listIssues({ project: projectIdentifier("TEST"), descriptionSearch: "  " }).pipe(Effect.provide(testLayer))

      expect(captureQuery.query?.$search).toBeUndefined()
    }))
})

describe("Issues Coverage - listIssues component filter", () => {
  // test-revizorro: approved
  it.effect("filters by component when found", () =>
    Effect.gen(function*() {
      const project = makeProject({ identifier: "TEST" })
      const statuses = [makeStatus({ _id: "status-open" as Ref<Status>, name: "Open" })]
      const comp = makeComponent({ _id: "comp-1" as Ref<HulyComponent>, label: "Frontend" })
      const captureQuery: MockConfig["captureIssueQuery"] = {}

      const testLayer = createTestLayerWithMocks({
        projects: [project],
        issues: [],
        statuses,
        components: [comp],
        captureIssueQuery: captureQuery
      })

      yield* listIssues({ project: projectIdentifier("TEST"), component: componentIdentifier("Frontend") }).pipe(
        Effect.provide(testLayer)
      )

      expect(captureQuery.query?.component).toBe("comp-1")
    }))

  // test-revizorro: approved
  it.effect("returns empty when component not found", () =>
    Effect.gen(function*() {
      const project = makeProject({ identifier: "TEST" })
      const statuses = [makeStatus({ _id: "status-open" as Ref<Status>, name: "Open" })]

      const testLayer = createTestLayerWithMocks({
        projects: [project],
        issues: [makeIssue()],
        statuses,
        components: []
      })

      const result = yield* listIssues({
        project: projectIdentifier("TEST"),
        component: componentIdentifier("NonexistentComponent")
      }).pipe(Effect.provide(testLayer))

      expect(result).toEqual([])
    }))
})

describe("Issues Coverage - extractUpdatedSequence", () => {
  // test-revizorro: approved
  it.effect("uses TxIncResult decoded sequence when updateDoc returns proper shape", () =>
    Effect.gen(function*() {
      const project = makeProject({ identifier: "TEST", sequence: 5 })

      const captureAddCollection: MockConfig["captureAddCollection"] = {}

      const testLayer = createTestLayerWithMocks({
        projects: [project],
        issues: [],
        statuses: [],
        captureAddCollection,
        updateDocResult: { object: { sequence: 42 } }
      })

      const result = yield* createIssue({
        project: projectIdentifier("TEST"),
        title: "Sequence Test"
      }).pipe(Effect.provide(testLayer))

      expect(result.identifier).toBe("TEST-42")
    }))

  // test-revizorro: approved
  it.effect("falls back to project.sequence + 1 when updateDoc returns non-decodable result", () =>
    Effect.gen(function*() {
      const project = makeProject({ identifier: "TEST", sequence: 10 })

      const findAllImpl: HulyClientOperations["findAll"] = ((_class: unknown) => {
        if (String(_class) === String(core.class.Status)) {
          return Effect.succeed(toFindResult([]))
        }
        return Effect.succeed(toFindResult([]))
      }) as HulyClientOperations["findAll"]

      const findOneImpl: HulyClientOperations["findOne"] = ((_class: unknown, _query: unknown, options?: unknown) => {
        if (_class === tracker.class.Project) {
          const opts = options as { lookup?: Record<string, unknown> } | undefined
          if (opts?.lookup?.type) {
            return Effect.succeed({
              ...project,
              $lookup: { type: { _id: "pt-1", statuses: [] } }
            } as Doc)
          }
          return Effect.succeed(project as Doc)
        }
        return Effect.succeed(undefined)
      }) as HulyClientOperations["findOne"]

      const updateDocImpl: HulyClientOperations["updateDoc"] = (() =>
        Effect.succeed({ notAnObject: true } as never)) as HulyClientOperations["updateDoc"]

      const addCollectionImpl: HulyClientOperations["addCollection"] = ((
        _class: unknown,
        _space: unknown,
        _attachedTo: unknown,
        _attachedToClass: unknown,
        _collection: unknown,
        _attributes: unknown,
        id?: unknown
      ) => Effect.succeed((id ?? "new-issue-id") as Ref<Doc>)) as HulyClientOperations["addCollection"]

      const uploadMarkupImpl: HulyClientOperations["uploadMarkup"] = (() =>
        Effect.succeed("markup-ref" as never)) as HulyClientOperations["uploadMarkup"]

      const testLayer = HulyClient.testLayer({
        findAll: findAllImpl,
        findOne: findOneImpl,
        updateDoc: updateDocImpl,
        addCollection: addCollectionImpl,
        uploadMarkup: uploadMarkupImpl
      })

      const result = yield* createIssue({
        project: projectIdentifier("TEST"),
        title: "Fallback Sequence"
      }).pipe(Effect.provide(testLayer))

      expect(result.identifier).toBe("TEST-11")
    }))
})

describe("Issues Coverage - resolveAssignee", () => {
  // test-revizorro: approved
  it.effect("fails with PersonNotFoundError when person not found", () =>
    Effect.gen(function*() {
      const project = makeProject({ identifier: "TEST", sequence: 1 })

      const testLayer = createTestLayerWithMocks({
        projects: [project],
        issues: [],
        statuses: [],
        persons: [],
        channels: [],
        updateDocResult: { object: { sequence: 2 } }
      })

      const error = yield* Effect.flip(
        createIssue({
          project: projectIdentifier("TEST"),
          title: "Assignee Test",
          assignee: email("ghost@example.com")
        }).pipe(Effect.provide(testLayer))
      )

      expect(error._tag).toBe("PersonNotFoundError")
      expect((error as PersonNotFoundError).identifier).toBe("ghost@example.com")
    }))

  // test-revizorro: approved
  it.effect("resolves person successfully when found by email", () =>
    Effect.gen(function*() {
      const project = makeProject({ identifier: "TEST", sequence: 1 })
      const person = makePerson({ _id: "person-1" as Ref<Person>, name: "Jane" })
      const channel = makeChannel({ attachedTo: "person-1" as Ref<Doc>, value: "jane@example.com" })

      const captureAddCollection: MockConfig["captureAddCollection"] = {}

      const testLayer = createTestLayerWithMocks({
        projects: [project],
        issues: [],
        statuses: [],
        persons: [person],
        channels: [channel],
        captureAddCollection,
        updateDocResult: { object: { sequence: 2 } }
      })

      yield* createIssue({
        project: projectIdentifier("TEST"),
        title: "With Assignee",
        assignee: email("jane@example.com")
      }).pipe(Effect.provide(testLayer))

      expect(captureAddCollection.attributes?.assignee).toBe("person-1")
    }))
})

describe("Issues Coverage - resolveStatusByName", () => {
  // test-revizorro: approved
  it.effect("resolves status by case-insensitive name match", () =>
    Effect.gen(function*() {
      const project = makeProject({ identifier: "TEST", sequence: 1 })
      const statuses = [
        makeStatus({ _id: "status-progress" as Ref<Status>, name: "In Progress" })
      ]
      const captureAddCollection: MockConfig["captureAddCollection"] = {}

      const testLayer = createTestLayerWithMocks({
        projects: [project],
        issues: [],
        statuses,
        captureAddCollection,
        updateDocResult: { object: { sequence: 2 } }
      })

      yield* createIssue({
        project: projectIdentifier("TEST"),
        title: "Status Test",
        status: statusName("in progress")
      }).pipe(Effect.provide(testLayer))

      expect(captureAddCollection.attributes?.status).toBe("status-progress")
    }))

  // test-revizorro: approved
  it.effect("fails with InvalidStatusError when status name not found", () =>
    Effect.gen(function*() {
      const project = makeProject({ identifier: "TEST", sequence: 1 })
      const statuses = [
        makeStatus({ _id: "status-open" as Ref<Status>, name: "Open" })
      ]

      const testLayer = createTestLayerWithMocks({
        projects: [project],
        issues: [],
        statuses,
        updateDocResult: { object: { sequence: 2 } }
      })

      const error = yield* Effect.flip(
        createIssue({
          project: projectIdentifier("TEST"),
          title: "Bad Status",
          status: statusName("Nonexistent")
        }).pipe(Effect.provide(testLayer))
      )

      expect(error._tag).toBe("InvalidStatusError")
      expect((error as InvalidStatusError).status).toBe("Nonexistent")
      expect((error as InvalidStatusError).project).toBe("TEST")
    }))
})

describe("Issues Coverage - createIssue full flow", () => {
  // test-revizorro: approved
  it.effect("creates issue with all optional params: priority, status, assignee, description", () =>
    Effect.gen(function*() {
      const project = makeProject({ identifier: "TEST", sequence: 5 })
      const person = makePerson({ _id: "person-1" as Ref<Person>, name: "Dev" })
      const channel = makeChannel({ attachedTo: "person-1" as Ref<Doc>, value: "dev@example.com" })
      const statuses = [
        makeStatus({ _id: "status-progress" as Ref<Status>, name: "In Progress" })
      ]

      const captureAddCollection: MockConfig["captureAddCollection"] = {}
      const captureUploadMarkup: MockConfig["captureUploadMarkup"] = {}

      const testLayer = createTestLayerWithMocks({
        projects: [project],
        issues: [makeIssue({ rank: "0|zzz" })],
        statuses,
        persons: [person],
        channels: [channel],
        captureAddCollection,
        captureUploadMarkup,
        updateDocResult: { object: { sequence: 6 } }
      })

      const result = yield* createIssue({
        project: projectIdentifier("TEST"),
        title: "Full Issue",
        description: "# Details",
        priority: "urgent",
        status: statusName("In Progress"),
        assignee: email("dev@example.com")
      }).pipe(Effect.provide(testLayer))

      expect(result.identifier).toBe("TEST-6")
      expect(captureAddCollection.attributes?.title).toBe("Full Issue")
      expect(captureAddCollection.attributes?.priority).toBe(IssuePriority.Urgent)
      expect(captureAddCollection.attributes?.status).toBe("status-progress")
      expect(captureAddCollection.attributes?.assignee).toBe("person-1")
      expect(captureAddCollection.attributes?.description).toBe("markup-ref-123")
      expect(captureUploadMarkup.markup).toBe("# Details")
    }))

  // test-revizorro: approved
  it.effect("skips status lookup when status not provided (uses findProject instead)", () =>
    Effect.gen(function*() {
      const project = makeProject({
        identifier: "TEST",
        sequence: 1,
        defaultIssueStatus: "status-default" as Ref<Status>
      })

      const captureAddCollection: MockConfig["captureAddCollection"] = {}

      const testLayer = createTestLayerWithMocks({
        projects: [project],
        issues: [],
        statuses: [],
        captureAddCollection,
        updateDocResult: { object: { sequence: 2 } }
      })

      yield* createIssue({
        project: projectIdentifier("TEST"),
        title: "Default Status"
      }).pipe(Effect.provide(testLayer))

      expect(captureAddCollection.attributes?.status).toBe("status-default")
    }))
})

describe("Issues Coverage - updateIssue branches", () => {
  // test-revizorro: approved
  it.effect("updates priority", () =>
    Effect.gen(function*() {
      const project = makeProject({ identifier: "TEST" })
      const issue = makeIssue({ identifier: "TEST-1", number: 1 })
      const statuses = [makeStatus({ _id: "status-open" as Ref<Status>, name: "Open" })]
      const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}

      const testLayer = createTestLayerWithMocks({
        projects: [project],
        issues: [issue],
        statuses,
        captureUpdateDoc
      })

      yield* updateIssue({
        project: projectIdentifier("TEST"),
        identifier: issueIdentifier("TEST-1"),
        priority: "low"
      }).pipe(Effect.provide(testLayer))

      expect(captureUpdateDoc.operations?.priority).toBe(IssuePriority.Low)
    }))

  // test-revizorro: approved
  it.effect("updates status", () =>
    Effect.gen(function*() {
      const project = makeProject({ identifier: "TEST" })
      const issue = makeIssue({ identifier: "TEST-1", number: 1 })
      const statuses = [
        makeStatus({ _id: "status-done" as Ref<Status>, name: "Done" })
      ]
      const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}

      const testLayer = createTestLayerWithMocks({
        projects: [project],
        issues: [issue],
        statuses,
        captureUpdateDoc
      })

      yield* updateIssue({
        project: projectIdentifier("TEST"),
        identifier: issueIdentifier("TEST-1"),
        status: statusName("Done")
      }).pipe(Effect.provide(testLayer))

      expect(captureUpdateDoc.operations?.status).toBe("status-done")
    }))

  // test-revizorro: approved
  it.effect("updates assignee by email", () =>
    Effect.gen(function*() {
      const project = makeProject({ identifier: "TEST" })
      const issue = makeIssue({ identifier: "TEST-1", number: 1 })
      const person = makePerson({ _id: "person-1" as Ref<Person> })
      const channel = makeChannel({ attachedTo: "person-1" as Ref<Doc>, value: "dev@example.com" })
      const statuses = [makeStatus({ _id: "status-open" as Ref<Status>, name: "Open" })]
      const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}

      const testLayer = createTestLayerWithMocks({
        projects: [project],
        issues: [issue],
        statuses,
        persons: [person],
        channels: [channel],
        captureUpdateDoc
      })

      yield* updateIssue({
        project: projectIdentifier("TEST"),
        identifier: issueIdentifier("TEST-1"),
        assignee: email("dev@example.com")
      }).pipe(Effect.provide(testLayer))

      expect(captureUpdateDoc.operations?.assignee).toBe("person-1")
    }))

  // test-revizorro: approved
  it.effect("unassigns with null assignee", () =>
    Effect.gen(function*() {
      const project = makeProject({ identifier: "TEST" })
      const issue = makeIssue({
        identifier: "TEST-1",
        number: 1,
        assignee: "person-1" as Ref<Person>
      })
      const statuses = [makeStatus({ _id: "status-open" as Ref<Status>, name: "Open" })]
      const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}

      const testLayer = createTestLayerWithMocks({
        projects: [project],
        issues: [issue],
        statuses,
        captureUpdateDoc
      })

      yield* updateIssue({
        project: projectIdentifier("TEST"),
        identifier: issueIdentifier("TEST-1"),
        assignee: null
      }).pipe(Effect.provide(testLayer))

      expect(captureUpdateDoc.operations?.assignee).toBeNull()
    }))

  // test-revizorro: approved
  it.effect("clears description with empty string", () =>
    Effect.gen(function*() {
      const project = makeProject({ identifier: "TEST" })
      const issue = makeIssue({
        identifier: "TEST-1",
        number: 1,
        description: "old-ref" as MarkupBlobRef
      })
      const statuses = [makeStatus({ _id: "status-open" as Ref<Status>, name: "Open" })]
      const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}

      const testLayer = createTestLayerWithMocks({
        projects: [project],
        issues: [issue],
        statuses,
        captureUpdateDoc
      })

      yield* updateIssue({
        project: projectIdentifier("TEST"),
        identifier: issueIdentifier("TEST-1"),
        description: ""
      }).pipe(Effect.provide(testLayer))

      expect(captureUpdateDoc.operations?.description).toBeNull()
    }))

  // test-revizorro: approved
  it.effect("updates description in place when issue already has one", () =>
    Effect.gen(function*() {
      const project = makeProject({ identifier: "TEST" })
      const issue = makeIssue({
        identifier: "TEST-1",
        number: 1,
        description: "existing-markup" as MarkupBlobRef
      })
      const statuses = [makeStatus({ _id: "status-open" as Ref<Status>, name: "Open" })]
      const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}
      const captureUpdateMarkup: MockConfig["captureUpdateMarkup"] = {}

      const testLayer = createTestLayerWithMocks({
        projects: [project],
        issues: [issue],
        statuses,
        captureUpdateDoc,
        captureUpdateMarkup
      })

      const result = yield* updateIssue({
        project: projectIdentifier("TEST"),
        identifier: issueIdentifier("TEST-1"),
        description: "# Updated"
      }).pipe(Effect.provide(testLayer))

      expect(result.updated).toBe(true)
      expect(captureUpdateMarkup.markup).toBe("# Updated")
      expect(captureUpdateDoc.operations?.description).toBeUndefined()
    }))

  // test-revizorro: approved
  it.effect("uploads new description when issue has no existing one", () =>
    Effect.gen(function*() {
      const project = makeProject({ identifier: "TEST" })
      const issue = makeIssue({
        identifier: "TEST-1",
        number: 1,
        description: null
      })
      const statuses = [makeStatus({ _id: "status-open" as Ref<Status>, name: "Open" })]
      const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}
      const captureUploadMarkup: MockConfig["captureUploadMarkup"] = {}

      const testLayer = createTestLayerWithMocks({
        projects: [project],
        issues: [issue],
        statuses,
        captureUpdateDoc,
        captureUploadMarkup
      })

      const result = yield* updateIssue({
        project: projectIdentifier("TEST"),
        identifier: issueIdentifier("TEST-1"),
        description: "# New Desc"
      }).pipe(Effect.provide(testLayer))

      expect(result.updated).toBe(true)
      expect(captureUploadMarkup.markup).toBe("# New Desc")
      expect(captureUpdateDoc.operations?.description).toBe("markup-ref-123")
    }))

  // test-revizorro: approved
  it.effect("returns updated=false when no changes provided", () =>
    Effect.gen(function*() {
      const project = makeProject({ identifier: "TEST" })
      const issue = makeIssue({ identifier: "TEST-1", number: 1 })
      const statuses = [makeStatus({ _id: "status-open" as Ref<Status>, name: "Open" })]

      const testLayer = createTestLayerWithMocks({
        projects: [project],
        issues: [issue],
        statuses
      })

      const result = yield* updateIssue({
        project: projectIdentifier("TEST"),
        identifier: issueIdentifier("TEST-1")
      }).pipe(Effect.provide(testLayer))

      expect(result.updated).toBe(false)
      expect(result.identifier).toBe("TEST-1")
    }))

  // test-revizorro: approved
  it.effect("returns updated=true when only description updated in place (no updateDoc call)", () =>
    Effect.gen(function*() {
      const project = makeProject({ identifier: "TEST" })
      const issue = makeIssue({
        identifier: "TEST-1",
        number: 1,
        description: "existing-ref" as MarkupBlobRef
      })
      const statuses = [makeStatus({ _id: "status-open" as Ref<Status>, name: "Open" })]
      const captureUpdateMarkup: MockConfig["captureUpdateMarkup"] = {}

      const testLayer = createTestLayerWithMocks({
        projects: [project],
        issues: [issue],
        statuses,
        captureUpdateMarkup
      })

      const result = yield* updateIssue({
        project: projectIdentifier("TEST"),
        identifier: issueIdentifier("TEST-1"),
        description: "# Only desc changed"
      }).pipe(Effect.provide(testLayer))

      expect(result.updated).toBe(true)
      expect(captureUpdateMarkup.markup).toBe("# Only desc changed")
    }))

  // test-revizorro: approved
  it.effect("updates title field", () =>
    Effect.gen(function*() {
      const project = makeProject({ identifier: "TEST" })
      const issue = makeIssue({ identifier: "TEST-1", number: 1 })
      const statuses = [makeStatus({ _id: "status-open" as Ref<Status>, name: "Open" })]
      const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}

      const testLayer = createTestLayerWithMocks({
        projects: [project],
        issues: [issue],
        statuses,
        captureUpdateDoc
      })

      const result = yield* updateIssue({
        project: projectIdentifier("TEST"),
        identifier: issueIdentifier("TEST-1"),
        title: "Brand New Title"
      }).pipe(Effect.provide(testLayer))

      expect(result.updated).toBe(true)
      expect(captureUpdateDoc.operations?.title).toBe("Brand New Title")
    }))

  // test-revizorro: approved
  it.effect("fails with PersonNotFoundError for unknown assignee in updateIssue", () =>
    Effect.gen(function*() {
      const project = makeProject({ identifier: "TEST" })
      const issue = makeIssue({ identifier: "TEST-1", number: 1 })
      const statuses = [makeStatus({ _id: "status-open" as Ref<Status>, name: "Open" })]

      const testLayer = createTestLayerWithMocks({
        projects: [project],
        issues: [issue],
        statuses,
        persons: [],
        channels: []
      })

      const error = yield* Effect.flip(
        updateIssue({
          project: projectIdentifier("TEST"),
          identifier: issueIdentifier("TEST-1"),
          assignee: email("unknown@example.com")
        }).pipe(Effect.provide(testLayer))
      )

      expect(error._tag).toBe("PersonNotFoundError")
      expect((error as PersonNotFoundError).identifier).toBe("unknown@example.com")
    }))
})

describe("Issues Coverage - getIssue assignee person not found", () => {
  // test-revizorro: approved
  it.effect("returns undefined assignee when issue has assignee ref but person doc not found", () =>
    Effect.gen(function*() {
      const project = makeProject({ identifier: "TEST" })
      const issue = makeIssue({
        identifier: "TEST-1",
        number: 1,
        assignee: "person-gone" as Ref<Person>
      })
      const statuses = [makeStatus({ _id: "status-open" as Ref<Status>, name: "Open" })]

      const testLayer = createTestLayerWithMocks({
        projects: [project],
        issues: [issue],
        statuses,
        persons: []
      })

      const result = yield* getIssue({
        project: projectIdentifier("TEST"),
        identifier: issueIdentifier("TEST-1")
      }).pipe(Effect.provide(testLayer))

      expect(result.assignee).toBeUndefined()
      expect(result.assigneeRef).toBeUndefined()
    }))
})
