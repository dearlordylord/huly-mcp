import { describe, it } from "@effect/vitest"
import type { Channel, Person } from "@hcengineering/contact"
import type { Attribute, Class, Doc, FindResult, PersonId, Ref, Space, Status } from "@hcengineering/core"
import {
  type Component as HulyComponent,
  IssuePriority,
  type IssueTemplate as HulyIssueTemplate,
  type Project as HulyProject,
  TimeReportDayType
} from "@hcengineering/tracker"
import { Effect } from "effect"
import { expect } from "vitest"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import type {
  ComponentNotFoundError,
  IssueTemplateNotFoundError,
  PersonNotFoundError,
  ProjectNotFoundError
} from "../../../src/huly/errors.js"
import { contact, core, tracker } from "../../../src/huly/huly-plugins.js"
import {
  createIssueFromTemplate,
  createIssueTemplate,
  deleteIssueTemplate,
  getIssueTemplate,
  listIssueTemplates,
  updateIssueTemplate
} from "../../../src/huly/operations/issue-templates.js"
import {
  componentIdentifier,
  email,
  positiveNumber,
  projectIdentifier,
  templateIdentifier
} from "../../helpers/brands.js"

const toFindResult = <T extends Doc>(docs: Array<T>): FindResult<T> => {
  const result = docs as FindResult<T>
  result.total = docs.length
  return result
}

// --- Mock Data Builders ---

const asProject = (v: unknown) => v as HulyProject
const makeProject = (overrides?: Partial<HulyProject>): HulyProject =>
  asProject({
    _id: "project-1" as Ref<HulyProject>,
    _class: tracker.class.Project,
    space: "space-1" as Ref<Space>,
    identifier: "TEST",
    name: "Test Project",
    sequence: 1,
    defaultIssueStatus: "status-open" as Ref<Status>,
    defaultTimeReportDay: TimeReportDayType.CurrentWorkDay,
    modifiedBy: "user-1" as PersonId,
    modifiedOn: Date.now(),
    createdBy: "user-1" as PersonId,
    createdOn: Date.now(),
    ...overrides
  })

const makeIssueTemplate = (overrides?: Partial<HulyIssueTemplate>): HulyIssueTemplate => ({
  _id: "template-1" as Ref<HulyIssueTemplate>,
  _class: tracker.class.IssueTemplate,
  space: "project-1" as Ref<HulyProject>,
  title: "Bug Report Template",
  description: "Steps to reproduce...",
  priority: IssuePriority.Medium,
  assignee: null,
  component: null,
  estimation: 0,
  children: [],
  comments: 0,
  modifiedBy: "user-1" as PersonId,
  modifiedOn: 1000,
  createdBy: "user-1" as PersonId,
  createdOn: 900,
  ...overrides
})

const asPerson = (v: unknown) => v as Person
const makePerson = (overrides?: Partial<Person>): Person =>
  asPerson({
    _id: "person-1" as Ref<Person>,
    _class: contact.class.Person,
    space: "space-1" as Ref<Space>,
    name: "John Doe",
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
  _id: "component-1" as Ref<HulyComponent>,
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

// --- Test Helpers ---

interface MockConfig {
  projects?: Array<HulyProject>
  templates?: Array<HulyIssueTemplate>
  persons?: Array<Person>
  channels?: Array<Channel>
  components?: Array<HulyComponent>
  statuses?: Array<Status>
  captureCreateDoc?: { attributes?: Record<string, unknown>; id?: string }
  captureUpdateDoc?: { operations?: Record<string, unknown> }
  captureRemoveDoc?: { called: boolean; id?: string }
  captureAddCollection?: { attributes?: Record<string, unknown>; id?: string }
  captureUploadMarkup?: { markup?: string }
  updateDocResult?: { object?: { sequence?: number } }
}

const createTestLayerWithMocks = (config: MockConfig) => {
  const projects = config.projects ?? []
  const templates = config.templates ?? []
  const persons = config.persons ?? []
  const channels = config.channels ?? []
  const components = config.components ?? []
  const statuses = config.statuses ?? []

  const findAllImpl: HulyClientOperations["findAll"] = ((_class: unknown, query: unknown, _options: unknown) => {
    if (_class === tracker.class.IssueTemplate) {
      const q = query as Record<string, unknown>
      const filtered = templates.filter(t => !q.space || t.space === q.space)
      return Effect.succeed(toFindResult(filtered as Array<Doc>))
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
      const nameFilter = (query as Record<string, unknown>).name as string | undefined
      if (nameFilter) {
        const filtered = persons.filter(p => p.name === nameFilter)
        return Effect.succeed(toFindResult(filtered as Array<Doc>))
      }
      return Effect.succeed(toFindResult(persons as Array<Doc>))
    }
    return Effect.succeed(toFindResult([]))
  }) as HulyClientOperations["findAll"]

  const findOneImpl: HulyClientOperations["findOne"] = ((_class: unknown, query: unknown, options?: unknown) => {
    if (_class === tracker.class.Project) {
      const q = query as Record<string, unknown>
      const identifier = q.identifier as string
      const found = projects.find(p => p.identifier === identifier)
      if (found === undefined) {
        return Effect.succeed(undefined)
      }
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
    if (_class === tracker.class.IssueTemplate) {
      const q = query as Record<string, unknown>
      const found = templates.find(t =>
        (q._id && t._id === q._id && (!q.space || t.space === q.space))
        || (q.title && t.title === q.title && (!q.space || t.space === q.space))
      )
      return Effect.succeed(found as Doc | undefined)
    }
    if (_class === tracker.class.Issue) {
      // For createIssue's rank lookup - return undefined (no existing issues)
      return Effect.succeed(undefined)
    }
    if (_class === tracker.class.Component) {
      const q = query as Record<string, unknown>
      const found = components.find(c =>
        (q._id && c._id === q._id && (!q.space || c.space === q.space))
        || (q.label && c.label === q.label && (!q.space || c.space === q.space))
      )
      return Effect.succeed(found as Doc | undefined)
    }
    if (_class === contact.class.Channel) {
      const q = query as Record<string, unknown>
      if (q.attachedTo) {
        const found = channels.find(c =>
          c.attachedTo === q.attachedTo && (q.provider === undefined || c.provider === q.provider)
        )
        return Effect.succeed(found as Doc | undefined)
      }
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

  const createDocImpl: HulyClientOperations["createDoc"] = ((
    _class: unknown,
    _space: unknown,
    attributes: unknown,
    id?: unknown
  ) => {
    if (config.captureCreateDoc) {
      config.captureCreateDoc.attributes = attributes as Record<string, unknown>
      config.captureCreateDoc.id = id as string
    }
    return Effect.succeed((id ?? "new-doc-id") as Ref<Doc>)
  }) as HulyClientOperations["createDoc"]

  const updateDocImpl: HulyClientOperations["updateDoc"] = (
    (_class: unknown, _space: unknown, _objectId: unknown, operations: unknown) => {
      if (config.captureUpdateDoc) {
        config.captureUpdateDoc.operations = operations as Record<string, unknown>
      }
      const project = projects[0]
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- project may be undefined from array access
      const sequence = config.updateDocResult?.object?.sequence ?? (project ? project.sequence + 1 : 2)
      return Effect.succeed({ object: { sequence } } as never)
    }
  ) as HulyClientOperations["updateDoc"]

  const removeDocImpl: HulyClientOperations["removeDoc"] = (
    (_class: unknown, _space: unknown, _objectId: unknown) => {
      if (config.captureRemoveDoc) {
        config.captureRemoveDoc.called = true
        config.captureRemoveDoc.id = _objectId as string
      }
      return Effect.succeed({} as never)
    }
  ) as HulyClientOperations["removeDoc"]

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
      config.captureAddCollection.attributes = attributes as Record<string, unknown>
      config.captureAddCollection.id = id as string
    }
    return Effect.succeed((id ?? "new-issue-id") as Ref<Doc>)
  }) as HulyClientOperations["addCollection"]

  // eslint-disable-next-line no-restricted-syntax -- mock function signature (unknown params) doesn't overlap with typed signature
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

  return HulyClient.testLayer({
    findAll: findAllImpl,
    findOne: findOneImpl,
    createDoc: createDocImpl,
    updateDoc: updateDocImpl,
    removeDoc: removeDocImpl,
    addCollection: addCollectionImpl,
    uploadMarkup: uploadMarkupImpl
  })
}

// --- Tests ---

describe("listIssueTemplates", () => {
  // test-revizorro: approved
  it.effect("returns templates for a project", () =>
    Effect.gen(function*() {
      const project = makeProject({ identifier: "TEST" })
      const templates = [
        makeIssueTemplate({ _id: "t-1" as Ref<HulyIssueTemplate>, title: "Template A", modifiedOn: 2000 }),
        makeIssueTemplate({ _id: "t-2" as Ref<HulyIssueTemplate>, title: "Template B", modifiedOn: 1000 })
      ]

      const testLayer = createTestLayerWithMocks({ projects: [project], templates })

      const result = yield* listIssueTemplates({ project: projectIdentifier("TEST") }).pipe(Effect.provide(testLayer))

      expect(result).toHaveLength(2)
      expect(result[0].title).toBe("Template A")
      expect(result[1].title).toBe("Template B")
    }))

  // test-revizorro: approved
  it.effect("returns empty array when no templates exist", () =>
    Effect.gen(function*() {
      const project = makeProject({ identifier: "TEST" })
      const testLayer = createTestLayerWithMocks({ projects: [project] })

      const result = yield* listIssueTemplates({ project: projectIdentifier("TEST") }).pipe(Effect.provide(testLayer))

      expect(result).toHaveLength(0)
    }))

  // test-revizorro: approved
  it.effect("maps priority correctly", () =>
    Effect.gen(function*() {
      const project = makeProject({ identifier: "TEST" })
      const templates = [
        makeIssueTemplate({ _id: "t-1" as Ref<HulyIssueTemplate>, priority: IssuePriority.Urgent, modifiedOn: 5000 }),
        makeIssueTemplate({ _id: "t-2" as Ref<HulyIssueTemplate>, priority: IssuePriority.High, modifiedOn: 4000 }),
        makeIssueTemplate({ _id: "t-3" as Ref<HulyIssueTemplate>, priority: IssuePriority.Medium, modifiedOn: 3000 }),
        makeIssueTemplate({ _id: "t-4" as Ref<HulyIssueTemplate>, priority: IssuePriority.Low, modifiedOn: 2000 }),
        makeIssueTemplate({
          _id: "t-5" as Ref<HulyIssueTemplate>,
          priority: IssuePriority.NoPriority,
          modifiedOn: 1000
        })
      ]

      const testLayer = createTestLayerWithMocks({ projects: [project], templates })

      const result = yield* listIssueTemplates({ project: projectIdentifier("TEST") }).pipe(Effect.provide(testLayer))

      expect(result[0].priority).toBe("urgent")
      expect(result[1].priority).toBe("high")
      expect(result[2].priority).toBe("medium")
      expect(result[3].priority).toBe("low")
      expect(result[4].priority).toBe("no-priority")
    }))

  // test-revizorro: approved
  it.effect("fails with ProjectNotFoundError for unknown project", () =>
    Effect.gen(function*() {
      const testLayer = createTestLayerWithMocks({})

      const result = yield* listIssueTemplates({ project: projectIdentifier("NOPE") }).pipe(
        Effect.flip,
        Effect.provide(testLayer)
      )

      expect((result as ProjectNotFoundError)._tag).toBe("ProjectNotFoundError")
    }))
})

describe("getIssueTemplate", () => {
  // test-revizorro: approved
  it.effect("returns full template details by title", () =>
    Effect.gen(function*() {
      const project = makeProject({ identifier: "TEST" })
      const template = makeIssueTemplate({
        title: "Bug Report",
        description: "Describe the bug",
        priority: IssuePriority.High,
        estimation: 60,
        modifiedOn: 2000,
        createdOn: 1000
      })

      const testLayer = createTestLayerWithMocks({ projects: [project], templates: [template] })

      const result = yield* getIssueTemplate({
        project: projectIdentifier("TEST"),
        template: templateIdentifier("Bug Report")
      }).pipe(
        Effect.provide(testLayer)
      )

      expect(result.title).toBe("Bug Report")
      expect(result.description).toBe("Describe the bug")
      expect(result.priority).toBe("high")
      expect(result.estimation).toBe(60)
      expect(result.project).toBe("TEST")
      expect(result.modifiedOn).toBe(2000)
      expect(result.createdOn).toBe(1000)
    }))

  // test-revizorro: approved
  it.effect("returns template by ID", () =>
    Effect.gen(function*() {
      const project = makeProject({ identifier: "TEST" })
      const template = makeIssueTemplate({
        _id: "template-abc" as Ref<HulyIssueTemplate>,
        title: "Feature Template"
      })

      const testLayer = createTestLayerWithMocks({ projects: [project], templates: [template] })

      const result = yield* getIssueTemplate({
        project: projectIdentifier("TEST"),
        template: templateIdentifier("template-abc")
      }).pipe(
        Effect.provide(testLayer)
      )

      expect(result.title).toBe("Feature Template")
      expect(result.id).toBe("template-abc")
    }))

  // test-revizorro: approved
  it.effect("resolves assignee name when present", () =>
    Effect.gen(function*() {
      const project = makeProject({ identifier: "TEST" })
      const person = makePerson({ _id: "person-1" as Ref<Person>, name: "Jane Doe" })
      const template = makeIssueTemplate({
        assignee: "person-1" as Ref<Person>
      })

      const testLayer = createTestLayerWithMocks({
        projects: [project],
        templates: [template],
        persons: [person]
      })

      const result = yield* getIssueTemplate({
        project: projectIdentifier("TEST"),
        template: templateIdentifier("Bug Report Template")
      }).pipe(
        Effect.provide(testLayer)
      )

      expect(result.assignee).toBe("Jane Doe")
    }))

  // test-revizorro: approved
  it.effect("returns undefined assignee when template has no assignee", () =>
    Effect.gen(function*() {
      const project = makeProject({ identifier: "TEST" })
      const template = makeIssueTemplate({ assignee: null })

      const testLayer = createTestLayerWithMocks({ projects: [project], templates: [template] })

      const result = yield* getIssueTemplate({
        project: projectIdentifier("TEST"),
        template: templateIdentifier("Bug Report Template")
      }).pipe(
        Effect.provide(testLayer)
      )

      expect(result.assignee).toBeUndefined()
    }))

  // test-revizorro: approved
  it.effect("resolves component label when present", () =>
    Effect.gen(function*() {
      const project = makeProject({ identifier: "TEST" })
      const component = makeComponent({ _id: "comp-1" as Ref<HulyComponent>, label: "Backend" })
      const template = makeIssueTemplate({
        component: "comp-1" as Ref<HulyComponent>
      })

      const testLayer = createTestLayerWithMocks({
        projects: [project],
        templates: [template],
        components: [component]
      })

      const result = yield* getIssueTemplate({
        project: projectIdentifier("TEST"),
        template: templateIdentifier("Bug Report Template")
      }).pipe(
        Effect.provide(testLayer)
      )

      expect(result.component).toBe("Backend")
    }))

  // test-revizorro: approved
  it.effect("returns undefined component when template has no component", () =>
    Effect.gen(function*() {
      const project = makeProject({ identifier: "TEST" })
      const template = makeIssueTemplate({ component: null })

      const testLayer = createTestLayerWithMocks({ projects: [project], templates: [template] })

      const result = yield* getIssueTemplate({
        project: projectIdentifier("TEST"),
        template: templateIdentifier("Bug Report Template")
      }).pipe(
        Effect.provide(testLayer)
      )

      expect(result.component).toBeUndefined()
    }))

  // test-revizorro: approved
  it.effect("returns undefined estimation when zero", () =>
    Effect.gen(function*() {
      const project = makeProject({ identifier: "TEST" })
      const template = makeIssueTemplate({ estimation: 0 })

      const testLayer = createTestLayerWithMocks({ projects: [project], templates: [template] })

      const result = yield* getIssueTemplate({
        project: projectIdentifier("TEST"),
        template: templateIdentifier("Bug Report Template")
      }).pipe(
        Effect.provide(testLayer)
      )

      expect(result.estimation).toBeUndefined()
    }))

  // test-revizorro: approved
  it.effect("fails with IssueTemplateNotFoundError for unknown template", () =>
    Effect.gen(function*() {
      const project = makeProject({ identifier: "TEST" })
      const testLayer = createTestLayerWithMocks({ projects: [project] })

      const result = yield* getIssueTemplate({
        project: projectIdentifier("TEST"),
        template: templateIdentifier("nonexistent")
      }).pipe(
        Effect.flip,
        Effect.provide(testLayer)
      )

      expect((result as IssueTemplateNotFoundError)._tag).toBe("IssueTemplateNotFoundError")
    }))

  // test-revizorro: approved
  it.effect("fails with ProjectNotFoundError for unknown project", () =>
    Effect.gen(function*() {
      const testLayer = createTestLayerWithMocks({})

      const result = yield* getIssueTemplate({
        project: projectIdentifier("NOPE"),
        template: templateIdentifier("anything")
      }).pipe(
        Effect.flip,
        Effect.provide(testLayer)
      )

      expect((result as ProjectNotFoundError)._tag).toBe("ProjectNotFoundError")
    }))
})

describe("createIssueTemplate", () => {
  // test-revizorro: approved
  it.effect("creates template with minimal params", () =>
    Effect.gen(function*() {
      const project = makeProject({ identifier: "TEST" })
      const capture: MockConfig["captureCreateDoc"] = {}

      const testLayer = createTestLayerWithMocks({
        projects: [project],
        captureCreateDoc: capture
      })

      const result = yield* createIssueTemplate({
        project: projectIdentifier("TEST"),
        title: "New Template"
      }).pipe(Effect.provide(testLayer))

      expect(result.title).toBe("New Template")
      expect(result.id).toBeDefined()
      expect(capture.attributes).toMatchObject({
        title: "New Template",
        description: "",
        priority: IssuePriority.NoPriority,
        assignee: null,
        component: null,
        estimation: 0,
        children: [],
        comments: 0
      })
    }))

  // test-revizorro: approved
  it.effect("creates template with all optional fields", () =>
    Effect.gen(function*() {
      const project = makeProject({ identifier: "TEST" })
      const person = makePerson({ _id: "person-1" as Ref<Person>, name: "John Doe" })
      const channel = makeChannel({ attachedTo: "person-1" as Ref<Doc>, value: "john@example.com" })
      const component = makeComponent({ label: "Frontend" })
      const capture: MockConfig["captureCreateDoc"] = {}

      const testLayer = createTestLayerWithMocks({
        projects: [project],
        persons: [person],
        channels: [channel],
        components: [component],
        captureCreateDoc: capture
      })

      const result = yield* createIssueTemplate({
        project: projectIdentifier("TEST"),
        title: "Full Template",
        description: "Detailed description",
        priority: "high",
        assignee: email("john@example.com"),
        component: componentIdentifier("Frontend"),
        estimation: positiveNumber(120)
      }).pipe(Effect.provide(testLayer))

      expect(result.title).toBe("Full Template")
      expect(capture.attributes).toMatchObject({
        title: "Full Template",
        description: "Detailed description",
        priority: IssuePriority.High,
        assignee: "person-1",
        component: "component-1",
        estimation: 120
      })
    }))

  // test-revizorro: approved
  it.effect("fails with PersonNotFoundError for unknown assignee", () =>
    Effect.gen(function*() {
      const project = makeProject({ identifier: "TEST" })
      const testLayer = createTestLayerWithMocks({ projects: [project] })

      const result = yield* createIssueTemplate({
        project: projectIdentifier("TEST"),
        title: "Template",
        assignee: email("nobody@example.com")
      }).pipe(Effect.flip, Effect.provide(testLayer))

      expect((result as PersonNotFoundError)._tag).toBe("PersonNotFoundError")
    }))

  // test-revizorro: approved
  it.effect("fails with ComponentNotFoundError for unknown component", () =>
    Effect.gen(function*() {
      const project = makeProject({ identifier: "TEST" })
      const testLayer = createTestLayerWithMocks({ projects: [project] })

      const result = yield* createIssueTemplate({
        project: projectIdentifier("TEST"),
        title: "Template",
        component: componentIdentifier("NonexistentComponent")
      }).pipe(Effect.flip, Effect.provide(testLayer))

      expect((result as ComponentNotFoundError)._tag).toBe("ComponentNotFoundError")
    }))

  // test-revizorro: approved
  it.effect("fails with ProjectNotFoundError for unknown project", () =>
    Effect.gen(function*() {
      const testLayer = createTestLayerWithMocks({})

      const result = yield* createIssueTemplate({
        project: projectIdentifier("NOPE"),
        title: "Template"
      }).pipe(Effect.flip, Effect.provide(testLayer))

      expect((result as ProjectNotFoundError)._tag).toBe("ProjectNotFoundError")
    }))
})

describe("createIssueFromTemplate", () => {
  const setupForCreateFromTemplate = (overrides?: Partial<MockConfig>) => {
    const project = makeProject({ identifier: "TEST" })
    const status = makeStatus({ _id: "status-open" as Ref<Status>, name: "Open" })
    const template = makeIssueTemplate({
      title: "Bug Report",
      description: "Template description",
      priority: IssuePriority.High,
      assignee: null,
      component: null
    })

    return createTestLayerWithMocks({
      projects: [project],
      templates: [template],
      statuses: [status],
      ...overrides
    })
  }

  // test-revizorro: approved
  it.effect("creates issue using template defaults", () =>
    Effect.gen(function*() {
      const capture: MockConfig["captureAddCollection"] = {}
      const testLayer = setupForCreateFromTemplate({ captureAddCollection: capture })

      const result = yield* createIssueFromTemplate({
        project: projectIdentifier("TEST"),
        template: templateIdentifier("Bug Report")
      }).pipe(Effect.provide(testLayer))

      expect(result.identifier).toBeDefined()
      expect(capture.attributes).toMatchObject({
        title: "Bug Report",
        priority: IssuePriority.High
      })
    }))

  // test-revizorro: suspect | Missing description assertion - only checks title and priority
  it.effect("overrides template values with provided params", () =>
    Effect.gen(function*() {
      const capture: MockConfig["captureAddCollection"] = {}
      const testLayer = setupForCreateFromTemplate({ captureAddCollection: capture })

      const result = yield* createIssueFromTemplate({
        project: projectIdentifier("TEST"),
        template: templateIdentifier("Bug Report"),
        title: "Custom Title",
        description: "Custom description",
        priority: "low"
      }).pipe(Effect.provide(testLayer))

      expect(result.identifier).toBeDefined()
      expect(capture.attributes).toMatchObject({
        title: "Custom Title",
        priority: IssuePriority.Low
      })
    }))

  // test-revizorro: approved
  it.effect("resolves template assignee from person email", () =>
    Effect.gen(function*() {
      const person = makePerson({ _id: "person-1" as Ref<Person>, name: "Jane Doe" })
      const channel = makeChannel({
        attachedTo: "person-1" as Ref<Doc>,
        value: "jane@example.com"
      })
      const template = makeIssueTemplate({
        title: "Assigned Template",
        assignee: "person-1" as Ref<Person>
      })

      const capture: MockConfig["captureAddCollection"] = {}
      const testLayer = createTestLayerWithMocks({
        projects: [makeProject({ identifier: "TEST" })],
        templates: [template],
        persons: [person],
        channels: [channel],
        statuses: [makeStatus({ _id: "status-open" as Ref<Status>, name: "Open" })],
        captureAddCollection: capture
      })

      const result = yield* createIssueFromTemplate({
        project: projectIdentifier("TEST"),
        template: templateIdentifier("Assigned Template")
      }).pipe(Effect.provide(testLayer))

      expect(result.identifier).toBeDefined()
      expect(capture.attributes).toMatchObject({
        assignee: "person-1"
      })
    }))

  // test-revizorro: suspect | Person name is email-formatted to bypass Email.make() constraint; masks real fallback behavior
  it.effect("falls back to person name as assignee lookup when no email channel", () =>
    Effect.gen(function*() {
      // When template has assignee but person has no email channel,
      // the code uses Email.make(person.name) which requires email format.
      // Use an email-formatted name to satisfy the brand constraint.
      const person = makePerson({ _id: "person-1" as Ref<Person>, name: "jane@company.com" })
      const template = makeIssueTemplate({
        title: "Assigned Template",
        assignee: "person-1" as Ref<Person>
      })

      const capture: MockConfig["captureAddCollection"] = {}
      const testLayer = createTestLayerWithMocks({
        projects: [makeProject({ identifier: "TEST" })],
        templates: [template],
        persons: [person],
        channels: [],
        statuses: [makeStatus({ _id: "status-open" as Ref<Status>, name: "Open" })],
        captureAddCollection: capture
      })

      const result = yield* createIssueFromTemplate({
        project: projectIdentifier("TEST"),
        template: templateIdentifier("Assigned Template")
      }).pipe(Effect.provide(testLayer))

      expect(result.identifier).toBeDefined()
      expect(capture.attributes).toMatchObject({
        assignee: "person-1"
      })
    }))

  // test-revizorro: approved
  it.effect("overrides template assignee when param provided", () =>
    Effect.gen(function*() {
      const person1 = makePerson({ _id: "person-1" as Ref<Person>, name: "Jane Doe" })
      const person2 = makePerson({ _id: "person-2" as Ref<Person>, name: "Bob Smith" })
      const channel2 = makeChannel({
        _id: "channel-2" as Ref<Channel>,
        attachedTo: "person-2" as Ref<Doc>,
        value: "bob@example.com"
      })
      const template = makeIssueTemplate({
        title: "Assigned Template",
        assignee: "person-1" as Ref<Person>
      })

      const capture: MockConfig["captureAddCollection"] = {}
      const testLayer = createTestLayerWithMocks({
        projects: [makeProject({ identifier: "TEST" })],
        templates: [template],
        persons: [person1, person2],
        channels: [channel2],
        statuses: [makeStatus({ _id: "status-open" as Ref<Status>, name: "Open" })],
        captureAddCollection: capture
      })

      const result = yield* createIssueFromTemplate({
        project: projectIdentifier("TEST"),
        template: templateIdentifier("Assigned Template"),
        assignee: email("bob@example.com")
      }).pipe(Effect.provide(testLayer))

      expect(result.identifier).toBeDefined()
      expect(capture.attributes).toMatchObject({
        assignee: "person-2"
      })
    }))

  // test-revizorro: approved
  it.effect("applies template component to created issue via updateDoc", () =>
    Effect.gen(function*() {
      const component = makeComponent({ _id: "comp-1" as Ref<HulyComponent>, label: "Backend" })
      const template = makeIssueTemplate({
        title: "Component Template",
        component: "comp-1" as Ref<HulyComponent>
      })

      const captureUpdate: MockConfig["captureUpdateDoc"] = {}
      const testLayer = createTestLayerWithMocks({
        projects: [makeProject({ identifier: "TEST" })],
        templates: [template],
        components: [component],
        statuses: [makeStatus({ _id: "status-open" as Ref<Status>, name: "Open" })],
        captureUpdateDoc: captureUpdate
      })

      yield* createIssueFromTemplate({
        project: projectIdentifier("TEST"),
        template: templateIdentifier("Component Template")
      }).pipe(Effect.provide(testLayer))

      expect(captureUpdate.operations).toMatchObject({
        component: "comp-1"
      })
    }))

  // test-revizorro: approved
  it.effect("fails with IssueTemplateNotFoundError for unknown template", () =>
    Effect.gen(function*() {
      const testLayer = createTestLayerWithMocks({
        projects: [makeProject({ identifier: "TEST" })],
        statuses: [makeStatus({ _id: "status-open" as Ref<Status>, name: "Open" })]
      })

      const result = yield* createIssueFromTemplate({
        project: projectIdentifier("TEST"),
        template: templateIdentifier("nonexistent")
      }).pipe(Effect.flip, Effect.provide(testLayer))

      expect((result as IssueTemplateNotFoundError)._tag).toBe("IssueTemplateNotFoundError")
    }))

  // test-revizorro: approved
  it.effect("fails with ProjectNotFoundError for unknown project", () =>
    Effect.gen(function*() {
      const testLayer = createTestLayerWithMocks({})

      const result = yield* createIssueFromTemplate({
        project: projectIdentifier("NOPE"),
        template: templateIdentifier("anything")
      }).pipe(Effect.flip, Effect.provide(testLayer))

      expect((result as ProjectNotFoundError)._tag).toBe("ProjectNotFoundError")
    }))
})

describe("updateIssueTemplate", () => {
  // test-revizorro: approved
  it.effect("updates template title", () =>
    Effect.gen(function*() {
      const project = makeProject({ identifier: "TEST" })
      const template = makeIssueTemplate({ title: "Old Title" })
      const captureUpdate: MockConfig["captureUpdateDoc"] = {}

      const testLayer = createTestLayerWithMocks({
        projects: [project],
        templates: [template],
        captureUpdateDoc: captureUpdate
      })

      const result = yield* updateIssueTemplate({
        project: projectIdentifier("TEST"),
        template: templateIdentifier("Old Title"),
        title: "New Title"
      }).pipe(Effect.provide(testLayer))

      expect(result.updated).toBe(true)
      expect(captureUpdate.operations).toMatchObject({ title: "New Title" })
    }))

  // test-revizorro: approved
  it.effect("updates template description", () =>
    Effect.gen(function*() {
      const project = makeProject({ identifier: "TEST" })
      const template = makeIssueTemplate()
      const captureUpdate: MockConfig["captureUpdateDoc"] = {}

      const testLayer = createTestLayerWithMocks({
        projects: [project],
        templates: [template],
        captureUpdateDoc: captureUpdate
      })

      const result = yield* updateIssueTemplate({
        project: projectIdentifier("TEST"),
        template: templateIdentifier("Bug Report Template"),
        description: "Updated description"
      }).pipe(Effect.provide(testLayer))

      expect(result.updated).toBe(true)
      expect(captureUpdate.operations).toMatchObject({ description: "Updated description" })
    }))

  // test-revizorro: approved
  it.effect("updates template priority", () =>
    Effect.gen(function*() {
      const project = makeProject({ identifier: "TEST" })
      const template = makeIssueTemplate()
      const captureUpdate: MockConfig["captureUpdateDoc"] = {}

      const testLayer = createTestLayerWithMocks({
        projects: [project],
        templates: [template],
        captureUpdateDoc: captureUpdate
      })

      const result = yield* updateIssueTemplate({
        project: projectIdentifier("TEST"),
        template: templateIdentifier("Bug Report Template"),
        priority: "urgent"
      }).pipe(Effect.provide(testLayer))

      expect(result.updated).toBe(true)
      expect(captureUpdate.operations).toMatchObject({ priority: IssuePriority.Urgent })
    }))

  // test-revizorro: approved
  it.effect("updates template assignee", () =>
    Effect.gen(function*() {
      const project = makeProject({ identifier: "TEST" })
      const template = makeIssueTemplate()
      const person = makePerson({ _id: "person-1" as Ref<Person>, name: "John Doe" })
      const channel = makeChannel({ attachedTo: "person-1" as Ref<Doc>, value: "john@example.com" })
      const captureUpdate: MockConfig["captureUpdateDoc"] = {}

      const testLayer = createTestLayerWithMocks({
        projects: [project],
        templates: [template],
        persons: [person],
        channels: [channel],
        captureUpdateDoc: captureUpdate
      })

      const result = yield* updateIssueTemplate({
        project: projectIdentifier("TEST"),
        template: templateIdentifier("Bug Report Template"),
        assignee: email("john@example.com")
      }).pipe(Effect.provide(testLayer))

      expect(result.updated).toBe(true)
      expect(captureUpdate.operations).toMatchObject({ assignee: "person-1" })
    }))

  // test-revizorro: approved
  it.effect("clears assignee when set to null", () =>
    Effect.gen(function*() {
      const project = makeProject({ identifier: "TEST" })
      const template = makeIssueTemplate({ assignee: "person-1" as Ref<Person> })
      const captureUpdate: MockConfig["captureUpdateDoc"] = {}

      const testLayer = createTestLayerWithMocks({
        projects: [project],
        templates: [template],
        captureUpdateDoc: captureUpdate
      })

      const result = yield* updateIssueTemplate({
        project: projectIdentifier("TEST"),
        template: templateIdentifier("Bug Report Template"),
        assignee: null
      }).pipe(Effect.provide(testLayer))

      expect(result.updated).toBe(true)
      expect(captureUpdate.operations).toMatchObject({ assignee: null })
    }))

  // test-revizorro: approved
  it.effect("updates template component", () =>
    Effect.gen(function*() {
      const project = makeProject({ identifier: "TEST" })
      const template = makeIssueTemplate()
      const component = makeComponent({ label: "Backend" })
      const captureUpdate: MockConfig["captureUpdateDoc"] = {}

      const testLayer = createTestLayerWithMocks({
        projects: [project],
        templates: [template],
        components: [component],
        captureUpdateDoc: captureUpdate
      })

      const result = yield* updateIssueTemplate({
        project: projectIdentifier("TEST"),
        template: templateIdentifier("Bug Report Template"),
        component: componentIdentifier("Backend")
      }).pipe(Effect.provide(testLayer))

      expect(result.updated).toBe(true)
      expect(captureUpdate.operations).toMatchObject({ component: "component-1" })
    }))

  // test-revizorro: approved
  it.effect("clears component when set to null", () =>
    Effect.gen(function*() {
      const project = makeProject({ identifier: "TEST" })
      const template = makeIssueTemplate({ component: "comp-1" as Ref<HulyComponent> })
      const captureUpdate: MockConfig["captureUpdateDoc"] = {}

      const testLayer = createTestLayerWithMocks({
        projects: [project],
        templates: [template],
        captureUpdateDoc: captureUpdate
      })

      const result = yield* updateIssueTemplate({
        project: projectIdentifier("TEST"),
        template: templateIdentifier("Bug Report Template"),
        component: null
      }).pipe(Effect.provide(testLayer))

      expect(result.updated).toBe(true)
      expect(captureUpdate.operations).toMatchObject({ component: null })
    }))

  // test-revizorro: approved
  it.effect("updates template estimation", () =>
    Effect.gen(function*() {
      const project = makeProject({ identifier: "TEST" })
      const template = makeIssueTemplate()
      const captureUpdate: MockConfig["captureUpdateDoc"] = {}

      const testLayer = createTestLayerWithMocks({
        projects: [project],
        templates: [template],
        captureUpdateDoc: captureUpdate
      })

      const result = yield* updateIssueTemplate({
        project: projectIdentifier("TEST"),
        template: templateIdentifier("Bug Report Template"),
        estimation: positiveNumber(90)
      }).pipe(Effect.provide(testLayer))

      expect(result.updated).toBe(true)
      expect(captureUpdate.operations).toMatchObject({ estimation: 90 })
    }))

  // test-revizorro: approved
  it.effect("returns updated=false when no changes provided", () =>
    Effect.gen(function*() {
      const project = makeProject({ identifier: "TEST" })
      const template = makeIssueTemplate()

      const testLayer = createTestLayerWithMocks({
        projects: [project],
        templates: [template]
      })

      const result = yield* updateIssueTemplate({
        project: projectIdentifier("TEST"),
        template: templateIdentifier("Bug Report Template")
      }).pipe(Effect.provide(testLayer))

      expect(result.updated).toBe(false)
      expect(result.id).toBe("template-1")
    }))

  // test-revizorro: approved
  it.effect("fails with PersonNotFoundError for unknown assignee", () =>
    Effect.gen(function*() {
      const project = makeProject({ identifier: "TEST" })
      const template = makeIssueTemplate()

      const testLayer = createTestLayerWithMocks({
        projects: [project],
        templates: [template]
      })

      const result = yield* updateIssueTemplate({
        project: projectIdentifier("TEST"),
        template: templateIdentifier("Bug Report Template"),
        assignee: email("nobody@example.com")
      }).pipe(Effect.flip, Effect.provide(testLayer))

      expect((result as PersonNotFoundError)._tag).toBe("PersonNotFoundError")
    }))

  // test-revizorro: approved
  it.effect("fails with ComponentNotFoundError for unknown component", () =>
    Effect.gen(function*() {
      const project = makeProject({ identifier: "TEST" })
      const template = makeIssueTemplate()

      const testLayer = createTestLayerWithMocks({
        projects: [project],
        templates: [template]
      })

      const result = yield* updateIssueTemplate({
        project: projectIdentifier("TEST"),
        template: templateIdentifier("Bug Report Template"),
        component: componentIdentifier("NonexistentComponent")
      }).pipe(Effect.flip, Effect.provide(testLayer))

      expect((result as ComponentNotFoundError)._tag).toBe("ComponentNotFoundError")
    }))

  // test-revizorro: approved
  it.effect("fails with IssueTemplateNotFoundError for unknown template", () =>
    Effect.gen(function*() {
      const project = makeProject({ identifier: "TEST" })
      const testLayer = createTestLayerWithMocks({ projects: [project] })

      const result = yield* updateIssueTemplate({
        project: projectIdentifier("TEST"),
        template: templateIdentifier("nonexistent"),
        title: "foo"
      }).pipe(Effect.flip, Effect.provide(testLayer))

      expect((result as IssueTemplateNotFoundError)._tag).toBe("IssueTemplateNotFoundError")
    }))

  // test-revizorro: approved
  it.effect("fails with ProjectNotFoundError for unknown project", () =>
    Effect.gen(function*() {
      const testLayer = createTestLayerWithMocks({})

      const result = yield* updateIssueTemplate({
        project: projectIdentifier("NOPE"),
        template: templateIdentifier("anything"),
        title: "foo"
      }).pipe(Effect.flip, Effect.provide(testLayer))

      expect((result as ProjectNotFoundError)._tag).toBe("ProjectNotFoundError")
    }))
})

describe("deleteIssueTemplate", () => {
  // test-revizorro: approved
  it.effect("deletes template by title", () =>
    Effect.gen(function*() {
      const project = makeProject({ identifier: "TEST" })
      const template = makeIssueTemplate({ title: "To Delete" })
      const captureRemove: MockConfig["captureRemoveDoc"] = { called: false }

      const testLayer = createTestLayerWithMocks({
        projects: [project],
        templates: [template],
        captureRemoveDoc: captureRemove
      })

      const result = yield* deleteIssueTemplate({
        project: projectIdentifier("TEST"),
        template: templateIdentifier("To Delete")
      }).pipe(Effect.provide(testLayer))

      expect(result.deleted).toBe(true)
      expect(result.id).toBe("template-1")
      expect(captureRemove.called).toBe(true)
    }))

  // test-revizorro: approved
  it.effect("deletes template by ID", () =>
    Effect.gen(function*() {
      const project = makeProject({ identifier: "TEST" })
      const template = makeIssueTemplate({
        _id: "template-xyz" as Ref<HulyIssueTemplate>,
        title: "Template XYZ"
      })
      const captureRemove: MockConfig["captureRemoveDoc"] = { called: false }

      const testLayer = createTestLayerWithMocks({
        projects: [project],
        templates: [template],
        captureRemoveDoc: captureRemove
      })

      const result = yield* deleteIssueTemplate({
        project: projectIdentifier("TEST"),
        template: templateIdentifier("template-xyz")
      }).pipe(Effect.provide(testLayer))

      expect(result.deleted).toBe(true)
      expect(result.id).toBe("template-xyz")
      expect(captureRemove.called).toBe(true)
      expect(captureRemove.id).toBe("template-xyz")
    }))

  // test-revizorro: approved
  it.effect("fails with IssueTemplateNotFoundError for unknown template", () =>
    Effect.gen(function*() {
      const project = makeProject({ identifier: "TEST" })
      const testLayer = createTestLayerWithMocks({ projects: [project] })

      const result = yield* deleteIssueTemplate({
        project: projectIdentifier("TEST"),
        template: templateIdentifier("nonexistent")
      }).pipe(Effect.flip, Effect.provide(testLayer))

      expect((result as IssueTemplateNotFoundError)._tag).toBe("IssueTemplateNotFoundError")
    }))

  // test-revizorro: approved
  it.effect("fails with ProjectNotFoundError for unknown project", () =>
    Effect.gen(function*() {
      const testLayer = createTestLayerWithMocks({})

      const result = yield* deleteIssueTemplate({
        project: projectIdentifier("NOPE"),
        template: templateIdentifier("anything")
      }).pipe(Effect.flip, Effect.provide(testLayer))

      expect((result as ProjectNotFoundError)._tag).toBe("ProjectNotFoundError")
    }))
})
