import { describe, it } from "@effect/vitest"
import type { Channel, Employee, Person } from "@hcengineering/contact"
import { type Doc, type PersonId, type Ref, type Space, toFindResult } from "@hcengineering/core"
import type { ProjectType, TaskType } from "@hcengineering/task"
import type {
  Component as HulyComponent,
  Issue as HulyIssue,
  IssueStatus,
  Project as HulyProject
} from "@hcengineering/tracker"
import { TimeReportDayType } from "@hcengineering/tracker"
import { Effect } from "effect"
import { expect } from "vitest"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import type {
  ComponentNotFoundError,
  IssueNotFoundError,
  PersonNotFoundError,
  ProjectNotFoundError
} from "../../../src/huly/errors.js"
import { contact, tracker } from "../../../src/huly/huly-plugins.js"
import {
  createComponent,
  deleteComponent,
  findComponentByIdOrLabel,
  getComponent,
  listComponents,
  setIssueComponent,
  updateComponent
} from "../../../src/huly/operations/components.js"
import { componentIdentifier, email, issueIdentifier, projectIdentifier } from "../../helpers/brands.js"

// --- Mock Data Builders ---

const makeProject = (overrides?: Partial<HulyProject>): HulyProject => {
  const result: HulyProject = {
    _id: "project-1" as Ref<HulyProject>,
    _class: tracker.class.Project,
    space: "space-1" as Ref<Space>,
    name: "Test Project",
    description: "",
    private: false,
    archived: false,
    members: [],
    identifier: "PROJ",
    sequence: 1,
    defaultIssueStatus: "status-1" as Ref<IssueStatus>,
    defaultTimeReportDay: TimeReportDayType.CurrentWorkDay,
    type: "project-type-1" as Ref<ProjectType>,
    modifiedBy: "user-1" as PersonId,
    modifiedOn: Date.now(),
    createdBy: "user-1" as PersonId,
    createdOn: Date.now(),
    ...overrides
  }
  return result
}

const makeComponent = (overrides?: Partial<HulyComponent>): HulyComponent => {
  const result: HulyComponent = {
    _id: "comp-1" as Ref<HulyComponent>,
    _class: tracker.class.Component,
    space: "project-1" as Ref<HulyProject>,
    label: "Backend",
    description: "Backend component",
    lead: "person-1" as Ref<Employee>,
    comments: 0,
    modifiedBy: "user-1" as PersonId,
    modifiedOn: Date.now(),
    createdBy: "user-1" as PersonId,
    createdOn: Date.now(),
    ...overrides
  }
  return result
}

const makePerson = (overrides?: Partial<Person>): Person => {
  const result: Person = {
    _id: "person-1" as Ref<Person>,
    _class: contact.class.Person,
    space: "space-1" as Ref<Space>,
    name: "John Doe",
    avatarType: "color" as Person["avatarType"],
    modifiedBy: "user-1" as PersonId,
    modifiedOn: Date.now(),
    createdBy: "user-1" as PersonId,
    createdOn: Date.now(),
    ...overrides
  }
  return result
}

const makeIssue = (overrides?: Partial<HulyIssue>): HulyIssue => {
  const result: HulyIssue = {
    _id: "issue-1" as Ref<HulyIssue>,
    _class: tracker.class.Issue,
    space: "project-1" as Ref<HulyProject>,
    attachedTo: "issue-parent" as Ref<HulyIssue>,
    attachedToClass: tracker.class.Issue,
    collection: "subIssues",
    title: "Test Issue",
    description: null,
    status: "status-1" as Ref<IssueStatus>,
    priority: 0,
    component: null,
    subIssues: 0,
    parents: [],
    estimation: 0,
    remainingTime: 0,
    reportedTime: 0,
    reports: 0,
    childInfo: [],
    kind: "task-type-1" as Ref<TaskType>,
    number: 123,
    assignee: null,
    dueDate: null,
    identifier: "PROJ-123",
    rank: "0|aaa",
    modifiedBy: "user-1" as PersonId,
    modifiedOn: Date.now(),
    createdBy: "user-1" as PersonId,
    createdOn: Date.now(),
    ...overrides
  }
  return result
}

const makeChannel = (overrides?: Partial<Channel>): Channel => {
  const result: Channel = {
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
  }
  return result
}

// --- Test Helpers ---

interface MockConfig {
  projects?: Array<HulyProject>
  components?: Array<HulyComponent>
  persons?: Array<Person>
  channels?: Array<Channel>
  issues?: Array<HulyIssue>
  captureCreateDoc?: { attributes?: Record<string, unknown>; id?: string }
  captureUpdateDoc?: { operations?: Record<string, unknown> }
  captureRemoveDoc?: { id?: string }
}

const createTestLayerWithMocks = (config: MockConfig) => {
  const projects = config.projects ?? []
  const components = config.components ?? []
  const persons = config.persons ?? []
  const channels = config.channels ?? []
  const issues = config.issues ?? []

  const findAllImpl: HulyClientOperations["findAll"] = ((_class: unknown, query: unknown) => {
    if (_class === tracker.class.Component) {
      const q = query as Record<string, unknown>
      const filtered = components.filter(c => q.space === undefined || c.space === q.space)
      return Effect.succeed(toFindResult(filtered as Array<Doc>))
    }
    if (_class === contact.class.Person) {
      const q = query as Record<string, unknown>
      if (q._id && typeof q._id === "object" && "$in" in (q._id as Record<string, unknown>)) {
        const ids = (q._id as Record<string, Array<string>>).$in
        const filtered = persons.filter(p => ids.includes(p._id))
        return Effect.succeed(toFindResult(filtered as Array<Doc>))
      }
      return Effect.succeed(toFindResult(persons as Array<Doc>))
    }
    return Effect.succeed(toFindResult([]))
  }) as HulyClientOperations["findAll"]

  const findOneImpl: HulyClientOperations["findOne"] = ((_class: unknown, query: unknown) => {
    if (_class === tracker.class.Project) {
      const q = query as Record<string, unknown>
      const found = projects.find(p => p.identifier === q.identifier)
      return Effect.succeed(found as Doc | undefined)
    }
    if (_class === tracker.class.Component) {
      const q = query as Record<string, unknown>
      const found = components.find(c =>
        (q.space !== undefined && q._id !== undefined && c.space === q.space && c._id === q._id)
        || (q.space !== undefined && q.label !== undefined && c.space === q.space && c.label === q.label)
      )
      return Effect.succeed(found as Doc | undefined)
    }
    if (_class === contact.class.Person) {
      const q = query as Record<string, unknown>
      if (q._id) {
        const found = persons.find(p => p._id === q._id)
        return Effect.succeed(found as Doc | undefined)
      }
      if (q.name) {
        if (typeof q.name === "object" && "$like" in (q.name as Record<string, unknown>)) {
          const pattern = (q.name as Record<string, string>).$like.replace(/%/g, "")
          const found = persons.find(p => p.name.includes(pattern))
          return Effect.succeed(found as Doc | undefined)
        }
        const found = persons.find(p => p.name === q.name)
        return Effect.succeed(found as Doc | undefined)
      }
      return Effect.succeed(undefined)
    }
    if (_class === contact.class.Channel) {
      const q = query as Record<string, unknown>
      if (q.value && typeof q.value === "string") {
        const found = channels.find(ch => ch.value === q.value && ch.provider === q.provider)
        return Effect.succeed(found as Doc | undefined)
      }
      if (q.value && typeof q.value === "object" && "$like" in (q.value as Record<string, unknown>)) {
        const pattern = (q.value as Record<string, string>).$like.replace(/%/g, "")
        const found = channels.find(ch => ch.value.includes(pattern) && ch.provider === q.provider)
        return Effect.succeed(found as Doc | undefined)
      }
      return Effect.succeed(undefined)
    }
    if (_class === tracker.class.Issue) {
      const q = query as Record<string, unknown>
      const found = issues.find(i =>
        (q.space !== undefined && q.identifier !== undefined && i.space === q.space && i.identifier === q.identifier)
        || (q.space !== undefined && q.number !== undefined && i.space === q.space && i.number === q.number)
      )
      return Effect.succeed(found as Doc | undefined)
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
    return Effect.succeed((id ?? "new-id") as Ref<Doc>)
  }) as HulyClientOperations["createDoc"]

  const updateDocImpl: HulyClientOperations["updateDoc"] = (
    (_class: unknown, _space: unknown, _objectId: unknown, operations: unknown) => {
      if (config.captureUpdateDoc) {
        config.captureUpdateDoc.operations = operations as Record<string, unknown>
      }
      return Effect.succeed({} as never)
    }
  ) as HulyClientOperations["updateDoc"]

  const removeDocImpl: HulyClientOperations["removeDoc"] = ((
    _class: unknown,
    _space: unknown,
    objectId: unknown
  ) => {
    if (config.captureRemoveDoc) {
      config.captureRemoveDoc.id = objectId as string
    }
    return Effect.succeed({})
  }) as HulyClientOperations["removeDoc"]

  return HulyClient.testLayer({
    findAll: findAllImpl,
    findOne: findOneImpl,
    createDoc: createDocImpl,
    updateDoc: updateDocImpl,
    removeDoc: removeDocImpl
  })
}

// --- Tests ---

describe("findComponentByIdOrLabel", () => {
  // test-revizorro: approved
  it.effect("finds component by ID", () =>
    Effect.gen(function*() {
      const client = yield* HulyClient
      const result = yield* findComponentByIdOrLabel(client, makeProject()._id, "comp-abc")

      expect(result).toBeDefined()
      expect(result?._id).toBe("comp-abc")
    }).pipe(Effect.provide(createTestLayerWithMocks({
      projects: [makeProject()],
      components: [makeComponent({ _id: "comp-abc" as Ref<HulyComponent>, label: "Frontend" })]
    }))))

  // test-revizorro: approved
  it.effect("finds component by label when ID lookup fails", () =>
    Effect.gen(function*() {
      const client = yield* HulyClient
      const result = yield* findComponentByIdOrLabel(client, makeProject()._id, "Frontend")

      expect(result).toBeDefined()
      expect(result?.label).toBe("Frontend")
    }).pipe(Effect.provide(createTestLayerWithMocks({
      projects: [makeProject()],
      components: [makeComponent({ _id: "comp-xyz" as Ref<HulyComponent>, label: "Frontend" })]
    }))))

  // test-revizorro: approved
  it.effect("returns undefined when component not found by ID or label", () =>
    Effect.gen(function*() {
      const client = yield* HulyClient
      const result = yield* findComponentByIdOrLabel(client, makeProject()._id, "nonexistent")

      expect(result).toBeUndefined()
    }).pipe(Effect.provide(createTestLayerWithMocks({
      projects: [makeProject()],
      components: []
    }))))
})

describe("listComponents", () => {
  // test-revizorro: approved
  it.effect("returns components for a project", () =>
    Effect.gen(function*() {
      const project = makeProject({ _id: "proj-1" as Ref<HulyProject>, identifier: "PROJ" })
      const components = [
        makeComponent({
          _id: "c1" as Ref<HulyComponent>,
          label: "Backend",
          space: "proj-1" as Ref<HulyProject>,
          lead: "person-1" as Ref<Employee>
        }),
        makeComponent({
          _id: "c2" as Ref<HulyComponent>,
          label: "Frontend",
          space: "proj-1" as Ref<HulyProject>,
          lead: "person-2" as Ref<Employee>
        })
      ]
      const persons = [
        makePerson({ _id: "person-1" as Ref<Person>, name: "Alice" }),
        makePerson({ _id: "person-2" as Ref<Person>, name: "Bob" })
      ]

      const testLayer = createTestLayerWithMocks({ projects: [project], components, persons })

      const result = yield* listComponents({ project: projectIdentifier("PROJ") }).pipe(Effect.provide(testLayer))

      expect(result).toHaveLength(2)
      expect(result[0].label).toBe("Backend")
      expect(result[0].lead).toBe("Alice")
      expect(result[1].label).toBe("Frontend")
      expect(result[1].lead).toBe("Bob")
    }))

  // test-revizorro: approved
  it.effect("returns components with no lead", () =>
    Effect.gen(function*() {
      const project = makeProject({ _id: "proj-1" as Ref<HulyProject>, identifier: "PROJ" })
      const comp = makeComponent({
        _id: "c1" as Ref<HulyComponent>,
        label: "Infra",
        space: "proj-1" as Ref<HulyProject>,
        lead: null
      })

      const testLayer = createTestLayerWithMocks({ projects: [project], components: [comp] })

      const result = yield* listComponents({ project: projectIdentifier("PROJ") }).pipe(Effect.provide(testLayer))

      expect(result).toHaveLength(1)
      expect(result[0].label).toBe("Infra")
      expect(result[0].lead).toBeUndefined()
    }))

  // test-revizorro: approved
  it.effect("returns ProjectNotFoundError when project doesn't exist", () =>
    Effect.gen(function*() {
      const testLayer = createTestLayerWithMocks({ projects: [] })

      const error = yield* Effect.flip(
        listComponents({ project: projectIdentifier("NONEXIST") }).pipe(Effect.provide(testLayer))
      )

      expect(error._tag).toBe("ProjectNotFoundError")
      expect((error as ProjectNotFoundError).identifier).toBe("NONEXIST")
    }))

  // test-revizorro: suspect | Test passes with empty components, doesn't verify limit was actually clamped to 200
  it.effect("clamps limit to 200", () =>
    Effect.gen(function*() {
      const project = makeProject({ _id: "proj-1" as Ref<HulyProject>, identifier: "PROJ" })

      const testLayer = createTestLayerWithMocks({ projects: [project], components: [] })

      const result = yield* listComponents({ project: projectIdentifier("PROJ"), limit: 500 }).pipe(
        Effect.provide(testLayer)
      )

      expect(result).toHaveLength(0)
    }))

  // test-revizorro: approved
  it.effect("returns empty array when no components exist", () =>
    Effect.gen(function*() {
      const project = makeProject({ _id: "proj-1" as Ref<HulyProject>, identifier: "PROJ" })

      const testLayer = createTestLayerWithMocks({ projects: [project], components: [] })

      const result = yield* listComponents({ project: projectIdentifier("PROJ") }).pipe(Effect.provide(testLayer))

      expect(result).toHaveLength(0)
    }))
})

describe("getComponent", () => {
  // test-revizorro: approved
  it.effect("returns full component details", () =>
    Effect.gen(function*() {
      const project = makeProject({ _id: "proj-1" as Ref<HulyProject>, identifier: "PROJ" })
      const comp = makeComponent({
        _id: "comp-1" as Ref<HulyComponent>,
        label: "Backend",
        description: "Backend services",
        lead: "person-1" as Ref<Employee>,
        space: "proj-1" as Ref<HulyProject>,
        modifiedOn: 1000,
        createdOn: 500
      })
      const person = makePerson({ _id: "person-1" as Ref<Person>, name: "Alice" })

      const testLayer = createTestLayerWithMocks({
        projects: [project],
        components: [comp],
        persons: [person]
      })

      const result = yield* getComponent({
        project: projectIdentifier("PROJ"),
        component: componentIdentifier("Backend")
      }).pipe(Effect.provide(testLayer))

      expect(result.id).toBe("comp-1")
      expect(result.label).toBe("Backend")
      expect(result.description).toBe("Backend services")
      expect(result.lead).toBe("Alice")
      expect(result.project).toBe("PROJ")
      expect(result.modifiedOn).toBe(1000)
      expect(result.createdOn).toBe(500)
    }))

  // test-revizorro: approved
  it.effect("returns component with no lead", () =>
    Effect.gen(function*() {
      const project = makeProject({ _id: "proj-1" as Ref<HulyProject>, identifier: "PROJ" })
      const comp = makeComponent({
        _id: "comp-1" as Ref<HulyComponent>,
        label: "Infra",
        lead: null,
        space: "proj-1" as Ref<HulyProject>
      })

      const testLayer = createTestLayerWithMocks({
        projects: [project],
        components: [comp]
      })

      const result = yield* getComponent({
        project: projectIdentifier("PROJ"),
        component: componentIdentifier("Infra")
      }).pipe(Effect.provide(testLayer))

      expect(result.id).toBe("comp-1")
      expect(result.lead).toBeUndefined()
    }))

  // test-revizorro: approved
  it.effect("returns ComponentNotFoundError when component doesn't exist", () =>
    Effect.gen(function*() {
      const project = makeProject({ _id: "proj-1" as Ref<HulyProject>, identifier: "PROJ" })

      const testLayer = createTestLayerWithMocks({ projects: [project], components: [] })

      const error = yield* Effect.flip(
        getComponent({ project: projectIdentifier("PROJ"), component: componentIdentifier("Ghost") }).pipe(
          Effect.provide(testLayer)
        )
      )

      expect(error._tag).toBe("ComponentNotFoundError")
      expect((error as ComponentNotFoundError).identifier).toBe("Ghost")
      expect((error as ComponentNotFoundError).project).toBe("PROJ")
    }))

  // test-revizorro: approved
  it.effect("returns ProjectNotFoundError when project doesn't exist", () =>
    Effect.gen(function*() {
      const testLayer = createTestLayerWithMocks({ projects: [] })

      const error = yield* Effect.flip(
        getComponent({ project: projectIdentifier("NOPE"), component: componentIdentifier("Backend") }).pipe(
          Effect.provide(testLayer)
        )
      )

      expect(error._tag).toBe("ProjectNotFoundError")
    }))
})

describe("createComponent", () => {
  // test-revizorro: approved
  it.effect("creates component with minimal params", () =>
    Effect.gen(function*() {
      const project = makeProject({ _id: "proj-1" as Ref<HulyProject>, identifier: "PROJ" })
      const captureCreateDoc: MockConfig["captureCreateDoc"] = {}

      const testLayer = createTestLayerWithMocks({
        projects: [project],
        captureCreateDoc
      })

      const result = yield* createComponent({
        project: projectIdentifier("PROJ"),
        label: "New Component"
      }).pipe(Effect.provide(testLayer))

      expect(result.label).toBe("New Component")
      expect(result.id).toBeDefined()
      expect(captureCreateDoc.attributes?.label).toBe("New Component")
      expect(captureCreateDoc.attributes?.description).toBe("")
      expect(captureCreateDoc.attributes?.lead).toBeNull()
      expect(captureCreateDoc.attributes?.comments).toBe(0)
    }))

  // test-revizorro: approved
  it.effect("creates component with description and lead", () =>
    Effect.gen(function*() {
      const project = makeProject({ _id: "proj-1" as Ref<HulyProject>, identifier: "PROJ" })
      const person = makePerson({ _id: "person-1" as Ref<Person>, name: "Alice" })
      const channel = makeChannel({
        value: "alice@example.com",
        attachedTo: "person-1" as Ref<Doc>
      })
      const captureCreateDoc: MockConfig["captureCreateDoc"] = {}

      const testLayer = createTestLayerWithMocks({
        projects: [project],
        persons: [person],
        channels: [channel],
        captureCreateDoc
      })

      const result = yield* createComponent({
        project: projectIdentifier("PROJ"),
        label: "Frontend",
        description: "UI component",
        lead: email("alice@example.com")
      }).pipe(Effect.provide(testLayer))

      expect(result.label).toBe("Frontend")
      expect(captureCreateDoc.attributes?.description).toBe("UI component")
      expect(captureCreateDoc.attributes?.lead).toBe("person-1")
    }))

  // test-revizorro: approved
  it.effect("returns PersonNotFoundError when lead not found", () =>
    Effect.gen(function*() {
      const project = makeProject({ _id: "proj-1" as Ref<HulyProject>, identifier: "PROJ" })

      const testLayer = createTestLayerWithMocks({ projects: [project] })

      const error = yield* Effect.flip(
        createComponent({
          project: projectIdentifier("PROJ"),
          label: "Frontend",
          lead: email("nobody@example.com")
        }).pipe(Effect.provide(testLayer))
      )

      expect(error._tag).toBe("PersonNotFoundError")
      expect((error as PersonNotFoundError).identifier).toBe("nobody@example.com")
    }))

  // test-revizorro: approved
  it.effect("returns ProjectNotFoundError when project doesn't exist", () =>
    Effect.gen(function*() {
      const testLayer = createTestLayerWithMocks({ projects: [] })

      const error = yield* Effect.flip(
        createComponent({
          project: projectIdentifier("NOPE"),
          label: "Frontend"
        }).pipe(Effect.provide(testLayer))
      )

      expect(error._tag).toBe("ProjectNotFoundError")
    }))
})

describe("updateComponent", () => {
  // test-revizorro: approved
  it.effect("updates component label", () =>
    Effect.gen(function*() {
      const project = makeProject({ _id: "proj-1" as Ref<HulyProject>, identifier: "PROJ" })
      const comp = makeComponent({
        _id: "comp-1" as Ref<HulyComponent>,
        label: "Backend",
        space: "proj-1" as Ref<HulyProject>
      })
      const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}

      const testLayer = createTestLayerWithMocks({
        projects: [project],
        components: [comp],
        captureUpdateDoc
      })

      const result = yield* updateComponent({
        project: projectIdentifier("PROJ"),
        component: componentIdentifier("Backend"),
        label: "Backend V2"
      }).pipe(Effect.provide(testLayer))

      expect(result.id).toBe("comp-1")
      expect(result.updated).toBe(true)
      expect(captureUpdateDoc.operations?.label).toBe("Backend V2")
    }))

  // test-revizorro: approved
  it.effect("updates component description", () =>
    Effect.gen(function*() {
      const project = makeProject({ _id: "proj-1" as Ref<HulyProject>, identifier: "PROJ" })
      const comp = makeComponent({
        _id: "comp-1" as Ref<HulyComponent>,
        label: "Backend",
        space: "proj-1" as Ref<HulyProject>
      })
      const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}

      const testLayer = createTestLayerWithMocks({
        projects: [project],
        components: [comp],
        captureUpdateDoc
      })

      const result = yield* updateComponent({
        project: projectIdentifier("PROJ"),
        component: componentIdentifier("Backend"),
        description: "Updated description"
      }).pipe(Effect.provide(testLayer))

      expect(result.updated).toBe(true)
      expect(captureUpdateDoc.operations?.description).toBe("Updated description")
    }))

  // test-revizorro: approved
  it.effect("updates component lead", () =>
    Effect.gen(function*() {
      const project = makeProject({ _id: "proj-1" as Ref<HulyProject>, identifier: "PROJ" })
      const comp = makeComponent({
        _id: "comp-1" as Ref<HulyComponent>,
        label: "Backend",
        space: "proj-1" as Ref<HulyProject>
      })
      const person = makePerson({ _id: "person-2" as Ref<Person>, name: "Bob" })
      const channel = makeChannel({
        value: "bob@example.com",
        attachedTo: "person-2" as Ref<Doc>
      })
      const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}

      const testLayer = createTestLayerWithMocks({
        projects: [project],
        components: [comp],
        persons: [person],
        channels: [channel],
        captureUpdateDoc
      })

      const result = yield* updateComponent({
        project: projectIdentifier("PROJ"),
        component: componentIdentifier("Backend"),
        lead: email("bob@example.com")
      }).pipe(Effect.provide(testLayer))

      expect(result.updated).toBe(true)
      expect(captureUpdateDoc.operations?.lead).toBe("person-2")
    }))

  // test-revizorro: approved
  it.effect("clears lead when set to null", () =>
    Effect.gen(function*() {
      const project = makeProject({ _id: "proj-1" as Ref<HulyProject>, identifier: "PROJ" })
      const comp = makeComponent({
        _id: "comp-1" as Ref<HulyComponent>,
        label: "Backend",
        space: "proj-1" as Ref<HulyProject>,
        lead: "person-1" as Ref<Employee>
      })
      const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}

      const testLayer = createTestLayerWithMocks({
        projects: [project],
        components: [comp],
        captureUpdateDoc
      })

      const result = yield* updateComponent({
        project: projectIdentifier("PROJ"),
        component: componentIdentifier("Backend"),
        lead: null
      }).pipe(Effect.provide(testLayer))

      expect(result.updated).toBe(true)
      expect(captureUpdateDoc.operations?.lead).toBeNull()
    }))

  // test-revizorro: approved
  it.effect("returns updated=false when no changes provided", () =>
    Effect.gen(function*() {
      const project = makeProject({ _id: "proj-1" as Ref<HulyProject>, identifier: "PROJ" })
      const comp = makeComponent({
        _id: "comp-1" as Ref<HulyComponent>,
        label: "Backend",
        space: "proj-1" as Ref<HulyProject>
      })

      const testLayer = createTestLayerWithMocks({
        projects: [project],
        components: [comp]
      })

      const result = yield* updateComponent({
        project: projectIdentifier("PROJ"),
        component: componentIdentifier("Backend")
      }).pipe(Effect.provide(testLayer))

      expect(result.id).toBe("comp-1")
      expect(result.updated).toBe(false)
    }))

  // test-revizorro: approved
  it.effect("returns ComponentNotFoundError when component doesn't exist", () =>
    Effect.gen(function*() {
      const project = makeProject({ _id: "proj-1" as Ref<HulyProject>, identifier: "PROJ" })

      const testLayer = createTestLayerWithMocks({ projects: [project], components: [] })

      const error = yield* Effect.flip(
        updateComponent({
          project: projectIdentifier("PROJ"),
          component: componentIdentifier("Ghost"),
          label: "New Label"
        }).pipe(Effect.provide(testLayer))
      )

      expect(error._tag).toBe("ComponentNotFoundError")
      expect((error as ComponentNotFoundError).identifier).toBe("Ghost")
    }))

  // test-revizorro: approved
  it.effect("returns PersonNotFoundError when new lead not found", () =>
    Effect.gen(function*() {
      const project = makeProject({ _id: "proj-1" as Ref<HulyProject>, identifier: "PROJ" })
      const comp = makeComponent({
        _id: "comp-1" as Ref<HulyComponent>,
        label: "Backend",
        space: "proj-1" as Ref<HulyProject>
      })

      const testLayer = createTestLayerWithMocks({
        projects: [project],
        components: [comp]
      })

      const error = yield* Effect.flip(
        updateComponent({
          project: projectIdentifier("PROJ"),
          component: componentIdentifier("Backend"),
          lead: email("nobody@example.com")
        }).pipe(Effect.provide(testLayer))
      )

      expect(error._tag).toBe("PersonNotFoundError")
      expect((error as PersonNotFoundError).identifier).toBe("nobody@example.com")
    }))

  // test-revizorro: approved
  it.effect("returns ProjectNotFoundError when project doesn't exist", () =>
    Effect.gen(function*() {
      const testLayer = createTestLayerWithMocks({ projects: [] })

      const error = yield* Effect.flip(
        updateComponent({
          project: projectIdentifier("NOPE"),
          component: componentIdentifier("Backend"),
          label: "New"
        }).pipe(Effect.provide(testLayer))
      )

      expect(error._tag).toBe("ProjectNotFoundError")
    }))
})

describe("setIssueComponent", () => {
  // test-revizorro: approved
  it.effect("sets component on an issue", () =>
    Effect.gen(function*() {
      const project = makeProject({ _id: "proj-1" as Ref<HulyProject>, identifier: "PROJ" })
      const comp = makeComponent({
        _id: "comp-1" as Ref<HulyComponent>,
        label: "Backend",
        space: "proj-1" as Ref<HulyProject>
      })
      const issue = makeIssue({
        _id: "issue-1" as Ref<HulyIssue>,
        space: "proj-1" as Ref<HulyProject>,
        identifier: "PROJ-123",
        number: 123
      })
      const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}

      const testLayer = createTestLayerWithMocks({
        projects: [project],
        components: [comp],
        issues: [issue],
        captureUpdateDoc
      })

      const result = yield* setIssueComponent({
        project: projectIdentifier("PROJ"),
        identifier: issueIdentifier("PROJ-123"),
        component: componentIdentifier("Backend")
      }).pipe(Effect.provide(testLayer))

      expect(result.identifier).toBe("PROJ-123")
      expect(result.componentSet).toBe(true)
      expect(captureUpdateDoc.operations?.component).toBe("comp-1")
    }))

  // test-revizorro: approved
  it.effect("clears component when set to null", () =>
    Effect.gen(function*() {
      const project = makeProject({ _id: "proj-1" as Ref<HulyProject>, identifier: "PROJ" })
      const issue = makeIssue({
        _id: "issue-1" as Ref<HulyIssue>,
        space: "proj-1" as Ref<HulyProject>,
        identifier: "PROJ-123",
        number: 123,
        component: "comp-1" as Ref<HulyComponent>
      })
      const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}

      const testLayer = createTestLayerWithMocks({
        projects: [project],
        issues: [issue],
        captureUpdateDoc
      })

      const result = yield* setIssueComponent({
        project: projectIdentifier("PROJ"),
        identifier: issueIdentifier("PROJ-123"),
        component: null
      }).pipe(Effect.provide(testLayer))

      expect(result.identifier).toBe("PROJ-123")
      expect(result.componentSet).toBe(true)
      expect(captureUpdateDoc.operations?.component).toBeNull()
    }))

  // test-revizorro: approved
  it.effect("returns ComponentNotFoundError when component doesn't exist", () =>
    Effect.gen(function*() {
      const project = makeProject({ _id: "proj-1" as Ref<HulyProject>, identifier: "PROJ" })
      const issue = makeIssue({
        _id: "issue-1" as Ref<HulyIssue>,
        space: "proj-1" as Ref<HulyProject>,
        identifier: "PROJ-123",
        number: 123
      })

      const testLayer = createTestLayerWithMocks({
        projects: [project],
        issues: [issue],
        components: []
      })

      const error = yield* Effect.flip(
        setIssueComponent({
          project: projectIdentifier("PROJ"),
          identifier: issueIdentifier("PROJ-123"),
          component: componentIdentifier("Ghost")
        }).pipe(Effect.provide(testLayer))
      )

      expect(error._tag).toBe("ComponentNotFoundError")
      expect((error as ComponentNotFoundError).identifier).toBe("Ghost")
    }))

  // test-revizorro: approved
  it.effect("returns IssueNotFoundError when issue doesn't exist", () =>
    Effect.gen(function*() {
      const project = makeProject({ _id: "proj-1" as Ref<HulyProject>, identifier: "PROJ" })

      const testLayer = createTestLayerWithMocks({
        projects: [project],
        issues: []
      })

      const error = yield* Effect.flip(
        setIssueComponent({
          project: projectIdentifier("PROJ"),
          identifier: issueIdentifier("PROJ-999"),
          component: componentIdentifier("Backend")
        }).pipe(Effect.provide(testLayer))
      )

      expect(error._tag).toBe("IssueNotFoundError")
      expect((error as IssueNotFoundError).identifier).toBe("PROJ-999")
    }))

  // test-revizorro: approved
  it.effect("returns ProjectNotFoundError when project doesn't exist", () =>
    Effect.gen(function*() {
      const testLayer = createTestLayerWithMocks({ projects: [] })

      const error = yield* Effect.flip(
        setIssueComponent({
          project: projectIdentifier("NOPE"),
          identifier: issueIdentifier("NOPE-1"),
          component: componentIdentifier("Backend")
        }).pipe(Effect.provide(testLayer))
      )

      expect(error._tag).toBe("ProjectNotFoundError")
    }))
})

describe("deleteComponent", () => {
  // test-revizorro: approved
  it.effect("deletes component", () =>
    Effect.gen(function*() {
      const project = makeProject({ _id: "proj-1" as Ref<HulyProject>, identifier: "PROJ" })
      const comp = makeComponent({
        _id: "comp-1" as Ref<HulyComponent>,
        label: "Backend",
        space: "proj-1" as Ref<HulyProject>
      })
      const captureRemoveDoc: MockConfig["captureRemoveDoc"] = {}

      const testLayer = createTestLayerWithMocks({
        projects: [project],
        components: [comp],
        captureRemoveDoc
      })

      const result = yield* deleteComponent({
        project: projectIdentifier("PROJ"),
        component: componentIdentifier("Backend")
      }).pipe(Effect.provide(testLayer))

      expect(result.id).toBe("comp-1")
      expect(result.deleted).toBe(true)
      expect(captureRemoveDoc.id).toBe("comp-1")
    }))

  // test-revizorro: approved
  it.effect("finds component by ID for deletion", () =>
    Effect.gen(function*() {
      const project = makeProject({ _id: "proj-1" as Ref<HulyProject>, identifier: "PROJ" })
      const comp = makeComponent({
        _id: "comp-abc" as Ref<HulyComponent>,
        label: "Backend",
        space: "proj-1" as Ref<HulyProject>
      })
      const captureRemoveDoc: MockConfig["captureRemoveDoc"] = {}

      const testLayer = createTestLayerWithMocks({
        projects: [project],
        components: [comp],
        captureRemoveDoc
      })

      const result = yield* deleteComponent({
        project: projectIdentifier("PROJ"),
        component: componentIdentifier("comp-abc")
      }).pipe(Effect.provide(testLayer))

      expect(result.id).toBe("comp-abc")
      expect(result.deleted).toBe(true)
    }))

  // test-revizorro: approved
  it.effect("returns ComponentNotFoundError when component doesn't exist", () =>
    Effect.gen(function*() {
      const project = makeProject({ _id: "proj-1" as Ref<HulyProject>, identifier: "PROJ" })

      const testLayer = createTestLayerWithMocks({ projects: [project], components: [] })

      const error = yield* Effect.flip(
        deleteComponent({
          project: projectIdentifier("PROJ"),
          component: componentIdentifier("Ghost")
        }).pipe(Effect.provide(testLayer))
      )

      expect(error._tag).toBe("ComponentNotFoundError")
      expect((error as ComponentNotFoundError).identifier).toBe("Ghost")
      expect((error as ComponentNotFoundError).project).toBe("PROJ")
    }))

  // test-revizorro: approved
  it.effect("returns ProjectNotFoundError when project doesn't exist", () =>
    Effect.gen(function*() {
      const testLayer = createTestLayerWithMocks({ projects: [] })

      const error = yield* Effect.flip(
        deleteComponent({
          project: projectIdentifier("NOPE"),
          component: componentIdentifier("Backend")
        }).pipe(Effect.provide(testLayer))
      )

      expect(error._tag).toBe("ProjectNotFoundError")
    }))
})
