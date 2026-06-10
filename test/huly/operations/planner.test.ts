import { describe, it } from "@effect/vitest"
import type { MarkupFormat, MarkupRef } from "@hcengineering/api-client"
import type { Employee, Person } from "@hcengineering/contact"
import {
  type AccountUuid,
  type Class,
  type Doc,
  type PersonId,
  type Ref,
  type Space,
  toFindResult
} from "@hcengineering/core"
import { type ToDo as HulyToDo, ToDoPriority, type WorkSlot as HulyWorkSlot } from "@hcengineering/time"
import type { Issue as HulyIssue, IssueStatus, Project as HulyProject } from "@hcengineering/tracker"
import { IssuePriority, TimeReportDayType } from "@hcengineering/tracker"
import { Effect, TestClock } from "effect"
import { expect } from "vitest"

import { TodoTitle } from "../../../src/domain/schemas/planner.js"
import { Email, Timestamp, WorkSlotId } from "../../../src/domain/schemas/shared.js"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import { contact, time, tracker } from "../../../src/huly/huly-plugins.js"
import { queryFromListFilters, todoSummary } from "../../../src/huly/operations/planner-shared.js"
import {
  completeTodo,
  createTodo,
  deleteTodo,
  getTodo,
  listTodos,
  reopenTodo,
  scheduleTodo,
  unscheduleTodo,
  updateTodo
} from "../../../src/huly/operations/planner.js"
import { toRef } from "../../../src/huly/operations/sdk-boundary.js"
import { issueIdentifier, projectIdentifier, todoId } from "../../helpers/brands.js"

const asProject = (v: unknown) => v as HulyProject
const asIssue = (v: unknown) => v as HulyIssue
const asTodo = (v: unknown) => v as HulyToDo
const asPerson = (v: unknown) => v as Person
const asEmployee = (v: unknown) => v as Employee
const asWorkSlot = (v: unknown) => v as HulyWorkSlot

const todoTitle = TodoTitle.make

const makeProject = (overrides?: Partial<HulyProject>): HulyProject =>
  asProject({
    _id: "project-1" as Ref<HulyProject>,
    _class: tracker.class.Project,
    space: "space-1" as Ref<Space>,
    identifier: "HULY",
    name: "Huly",
    sequence: 1,
    defaultIssueStatus: "status-open" as Ref<IssueStatus>,
    defaultTimeReportDay: TimeReportDayType.CurrentWorkDay,
    modifiedBy: "user-1" as PersonId,
    modifiedOn: 10,
    createdBy: "user-1" as PersonId,
    createdOn: 1,
    ...overrides
  })

const makeIssue = (overrides?: Partial<HulyIssue>): HulyIssue =>
  asIssue({
    _id: "issue-1" as Ref<HulyIssue>,
    _class: tracker.class.Issue,
    space: "project-1" as Ref<HulyProject>,
    identifier: "HULY-94",
    title: todoTitle("Planner issue"),
    description: null,
    status: "status-open" as Ref<IssueStatus>,
    priority: IssuePriority.Medium,
    assignee: null,
    kind: "task-type-1" as Ref<Doc>,
    number: 94,
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
    modifiedOn: 10,
    createdBy: "user-1" as PersonId,
    createdOn: 1,
    ...overrides
  })

const makePerson = (overrides?: Partial<Person>): Person =>
  asPerson({
    _id: "employee-1" as Ref<Person>,
    _class: contact.class.Person,
    space: "space-1" as Ref<Space>,
    name: "Jane Developer",
    modifiedBy: "user-1" as PersonId,
    modifiedOn: 10,
    createdBy: "user-1" as PersonId,
    createdOn: 1,
    ...overrides
  })

const makeEmployee = (overrides?: Partial<Employee>): Employee =>
  asEmployee({
    ...makePerson({ _id: "employee-1" as Ref<Person> }),
    _id: "employee-1" as Ref<Employee>,
    _class: contact.mixin.Employee,
    active: true,
    personUuid: "00000000-0000-4000-8000-000000000001",
    ...overrides
  })

const makeTodo = (overrides?: Partial<HulyToDo>): HulyToDo =>
  asTodo({
    _id: "todo-1" as Ref<HulyToDo>,
    _class: time.class.ToDo,
    space: time.space.ToDos,
    attachedTo: time.ids.NotAttached,
    attachedToClass: time.class.ToDo,
    collection: "todos",
    workslots: 0,
    title: todoTitle("Implement planner tools"),
    description: "",
    priority: ToDoPriority.High,
    visibility: "private",
    doneOn: null,
    user: "employee-1" as Ref<Employee>,
    rank: "0|aaa",
    modifiedBy: "user-1" as PersonId,
    modifiedOn: 10,
    createdBy: "user-1" as PersonId,
    createdOn: 1,
    ...overrides
  })

const makeWorkSlot = (overrides?: Partial<HulyWorkSlot>): HulyWorkSlot =>
  asWorkSlot({
    _id: "slot-1" as Ref<HulyWorkSlot>,
    _class: time.class.WorkSlot,
    space: time.space.ToDos,
    attachedTo: "todo-1" as Ref<HulyToDo>,
    attachedToClass: time.class.ToDo,
    collection: "workslots",
    eventId: "event-1",
    date: Timestamp.make(1_800_000_000_000),
    dueDate: Timestamp.make(1_800_003_600_000),
    title: todoTitle("Slot"),
    description: "",
    allDay: false,
    participants: [],
    reminders: [],
    visibility: "private",
    access: 0,
    calendar: "calendar-1" as Ref<Doc>,
    user: "employee-1" as PersonId,
    blockTime: false,
    modifiedBy: "user-1" as PersonId,
    modifiedOn: 10,
    createdBy: "user-1" as PersonId,
    createdOn: 1,
    ...overrides
  })

interface Captures {
  addCollection?: {
    readonly classId: string
    readonly attachedTo: string
    readonly attachedToClass: string
    readonly collection: string
    readonly attributes: Record<string, unknown>
    readonly id?: string | undefined
  }
  updateDoc?: {
    readonly classId: string
    readonly objectId: string
    readonly operations: Record<string, unknown>
  }
  removeDoc?: {
    readonly classId: string
    readonly objectId: string
  }
  removeCollection?: {
    readonly classId: string
    readonly objectId: string
    readonly attachedTo: string
    readonly attachedToClass: string
    readonly collection: string
  }
  uploadMarkup?: {
    readonly objectId: string
    readonly markup: string
  }
  updateMarkup?: {
    readonly objectId: string
    readonly markup: string
  }
}

interface TestConfig {
  readonly projects?: ReadonlyArray<HulyProject>
  readonly issues?: ReadonlyArray<HulyIssue>
  readonly todos?: ReadonlyArray<HulyToDo>
  readonly persons?: ReadonlyArray<Person>
  readonly employees?: ReadonlyArray<Employee>
  readonly workSlots?: ReadonlyArray<HulyWorkSlot>
  readonly captures?: Captures
  readonly removeCollectionAvailable?: boolean
}

const createLayer = (config: TestConfig) => {
  const projects = [...(config.projects ?? [])]
  const issues = [...(config.issues ?? [])]
  const todos = [...(config.todos ?? [])]
  const persons = [...(config.persons ?? [])]
  const employees = [...(config.employees ?? [])]
  const workSlots = [...(config.workSlots ?? [])]

  const withTodoLookup = (todo: HulyToDo): HulyToDo => {
    const issue = issues.find((i) => i._id === todo.attachedTo)
    const person = persons.find((p) => p._id === todo.user)
    return asTodo({
      ...todo,
      $lookup: { attachedTo: issue, user: person }
    })
  }

  const matchesDoneOn = (actual: number | null, expected: unknown): boolean => {
    if (expected === undefined) return true
    if (typeof expected === "object" && expected !== null && "$ne" in expected) return actual !== expected.$ne
    return actual === expected
  }

  const matchesRange = (actual: number | null | undefined, expected: unknown): boolean => {
    if (expected === undefined) return true
    if (typeof expected !== "object" || expected === null) return actual === expected
    if (actual === null || actual === undefined) return false
    const range = expected as { readonly $gte?: number; readonly $lte?: number }
    return (range.$gte === undefined || actual >= range.$gte) && (range.$lte === undefined || actual <= range.$lte)
  }

  const findOne: HulyClientOperations["findOne"] = ((_class: unknown, query: unknown) => {
    const q = query as Record<string, unknown>
    if (_class === tracker.class.Project) return Effect.succeed(projects.find((p) => p.identifier === q.identifier))
    if (_class === tracker.class.Issue) {
      return Effect.succeed(
        issues.find((i) =>
          (q._id !== undefined && i._id === q._id)
          || (q.identifier !== undefined && i.identifier === q.identifier && i.space === q.space)
          || (q.number !== undefined && i.number === q.number && i.space === q.space)
        )
      )
    }
    if (_class === contact.mixin.Employee) {
      return Effect.succeed(
        employees.find((e) => e._id === q._id || e.name === q.name || e.personUuid === q.personUuid)
      )
    }
    if (_class === time.class.ToDo) {
      const todo = todos.find((t) => q._id === undefined || t._id === q._id)
      return Effect.succeed(todo === undefined ? undefined : withTodoLookup(todo))
    }
    if (_class === time.class.WorkSlot) {
      return Effect.succeed(workSlots.find((s) => q._id === undefined || s._id === q._id))
    }
    return Effect.succeed(undefined)
  }) as HulyClientOperations["findOne"]

  const findAll: HulyClientOperations["findAll"] = ((_class: unknown, query: unknown, options: unknown) => {
    const q = query as Record<string, unknown>
    if (_class === time.class.ToDo) {
      const filtered = todos.filter((todo) =>
        (q._id === undefined || todo._id === q._id)
        && (q.user === undefined || todo.user === q.user)
        && (q.title === undefined || todo.title === q.title)
        && (q.attachedTo === undefined || todo.attachedTo === q.attachedTo)
        && (q.attachedToClass === undefined || todo.attachedToClass === q.attachedToClass)
        && (q.priority === undefined || todo.priority === q.priority)
        && (q.visibility === undefined || todo.visibility === q.visibility)
        && matchesRange(todo.dueDate, q.dueDate)
        && matchesDoneOn(todo.doneOn, q.doneOn)
      )
      const limit =
        typeof options === "object" && options !== null && "limit" in options && typeof options.limit === "number"
          ? options.limit
          : filtered.length
      return Effect.succeed(toFindResult(filtered.slice(0, limit).map(withTodoLookup) as Array<Doc>))
    }
    if (_class === contact.class.Person) {
      const filtered = q.name === undefined ? persons : persons.filter((p) => p.name === q.name)
      return Effect.succeed(toFindResult(filtered as Array<Doc>))
    }
    if (_class === contact.class.Channel) return Effect.succeed(toFindResult([] as Array<Doc>))
    if (_class === time.class.WorkSlot) {
      const filtered = workSlots.filter((slot) =>
        (q.attachedTo === undefined || slot.attachedTo === q.attachedTo) && matchesRange(slot.date, q.date)
      )
      return Effect.succeed(toFindResult(filtered as Array<Doc>))
    }
    return Effect.succeed(toFindResult([]))
  }) as HulyClientOperations["findAll"]

  const addCollection: HulyClientOperations["addCollection"] = ((
    classId: unknown,
    _space: unknown,
    attachedTo: unknown,
    attachedToClass: unknown,
    collection: unknown,
    attributes: unknown,
    id?: unknown
  ) => {
    if (config.captures !== undefined) {
      config.captures.addCollection = {
        classId: String(classId),
        attachedTo: String(attachedTo),
        attachedToClass: String(attachedToClass),
        collection: String(collection),
        attributes: attributes as Record<string, unknown>,
        id: id === undefined ? undefined : String(id)
      }
    }
    return Effect.succeed(toRef<Doc>(String(id ?? "created-id")))
  }) as HulyClientOperations["addCollection"]

  const updateDoc: HulyClientOperations["updateDoc"] =
    ((classId: unknown, _space: unknown, objectId: unknown, ops: unknown) => {
      if (config.captures !== undefined) {
        config.captures.updateDoc = {
          classId: String(classId),
          objectId: String(objectId),
          operations: ops as Record<string, unknown>
        }
      }
      return Effect.succeed({} as never)
    }) as HulyClientOperations["updateDoc"]

  const removeDoc: HulyClientOperations["removeDoc"] = ((classId: unknown, _space: unknown, objectId: unknown) => {
    if (config.captures !== undefined) {
      config.captures.removeDoc = {
        classId: String(classId),
        objectId: String(objectId)
      }
    }
    return Effect.succeed({} as never)
  }) as HulyClientOperations["removeDoc"]

  const removeCollection = ((
    classId: unknown,
    _space: unknown,
    objectId: unknown,
    attachedTo: unknown,
    attachedToClass: unknown,
    collection: unknown
  ) => {
    if (config.captures !== undefined) {
      config.captures.removeCollection = {
        classId: String(classId),
        objectId: String(objectId),
        attachedTo: String(attachedTo),
        attachedToClass: String(attachedToClass),
        collection: String(collection)
      }
    }
    return Effect.succeed(toRef<Doc>(String(attachedTo)))
  }) as NonNullable<HulyClientOperations["removeCollection"]>

  const uploadMarkup: HulyClientOperations["uploadMarkup"] = (
    _class: Ref<Class<Doc>>,
    objectId: Ref<Doc>,
    _attr: string,
    markup: string,
    _format: MarkupFormat
  ) => {
    if (config.captures !== undefined) {
      config.captures.uploadMarkup = { objectId: String(objectId), markup: String(markup) }
    }
    return Effect.succeed("markup-ref" as MarkupRef)
  }

  const updateMarkup: HulyClientOperations["updateMarkup"] =
    ((_class: unknown, objectId: unknown, _attr: unknown, markup: unknown) => {
      if (config.captures !== undefined) {
        config.captures.updateMarkup = { objectId: String(objectId), markup: String(markup) }
      }
      return Effect.succeed(undefined)
    }) as HulyClientOperations["updateMarkup"]

  return HulyClient.testLayer({
    getAccountUuid: () => "00000000-0000-4000-8000-000000000001" as AccountUuid,
    getPrimarySocialId: () => "employee-1" as PersonId,
    findOne,
    findAll,
    addCollection,
    updateDoc,
    ...(config.removeCollectionAvailable === false ? {} : { removeCollection }),
    removeDoc,
    fetchMarkup: () => Effect.succeed("Fetched description"),
    uploadMarkup,
    updateMarkup
  })
}

describe("planner operations", () => {
  it.effect("lists ToDos with stable priority and owner fields", () =>
    Effect.gen(function*() {
      const captures: Captures = {}
      const result = yield* listTodos({ titleSearch: "planner" }).pipe(
        Effect.provide(createLayer({ todos: [makeTodo()], persons: [makePerson()], captures }))
      )

      expect(result).toHaveLength(1)
      expect(result[0].priority).toBe("high")
      expect(result[0].owner.id).toBe("employee-1")
    }))

  it.effect("lists with owner, issue, due, priority, visibility, and title filters", () =>
    Effect.gen(function*() {
      const project = makeProject()
      const issue = makeIssue()
      const todo = makeTodo({
        title: todoTitle("Needle task"),
        attachedTo: issue._id,
        attachedToClass: tracker.class.Issue,
        dueDate: Timestamp.make(1_800_000_000_000),
        priority: ToDoPriority.Medium,
        visibility: "freeBusy"
      })

      const result = yield* listTodos({
        owner: "employee-1",
        issue: { project: projectIdentifier("HULY"), identifier: issueIdentifier("94") },
        title: todoTitle("Needle task"),
        titleSearch: "needle",
        dueFrom: Timestamp.make(1_700_000_000_000),
        dueTo: Timestamp.make(1_900_000_000_000),
        completionState: "all",
        priority: "medium",
        visibility: "freeBusy",
        limit: 5
      }).pipe(
        Effect.provide(createLayer({
          projects: [project],
          issues: [issue],
          todos: [todo, makeTodo({ _id: "todo-2" as Ref<HulyToDo>, title: todoTitle("Other task") })],
          persons: [makePerson()],
          employees: [makeEmployee()],
          captures: {}
        }))
      )

      expect(result).toHaveLength(1)
      expect(result[0].title).toBe("Needle task")
      expect(result[0].priority).toBe("medium")
      expect(result[0].visibility).toBe("freeBusy")
    }))

  it("builds one-sided due date list filters", () => {
    const fromOnly = queryFromListFilters(undefined, undefined, { dueFrom: Timestamp.make(1_700_000_000_000) })
    const toOnly = queryFromListFilters(undefined, undefined, { dueTo: Timestamp.make(1_900_000_000_000) })

    expect(fromOnly.dueDate).toEqual({ $gte: 1_700_000_000_000 })
    expect(toOnly.dueDate).toEqual({ $lte: 1_900_000_000_000 })
  })

  it.effect("returns an empty list when title search filters all rows", () =>
    Effect.gen(function*() {
      const result = yield* listTodos({ titleSearch: "missing" }).pipe(
        Effect.provide(createLayer({ todos: [makeTodo()], captures: {} }))
      )

      expect(result).toEqual([])
    }))

  it.effect("creates a personal ToDo attached to the planner inbox", () =>
    Effect.gen(function*() {
      const captures: Captures = {}
      const result = yield* createTodo({ title: todoTitle("Personal task") }).pipe(
        Effect.provide(createLayer({ captures, employees: [makeEmployee()] }))
      )

      expect(result.todoId).toBeDefined()
      expect(captures.addCollection?.classId).toBe(time.class.ToDo)
      expect(captures.addCollection?.attachedTo).toBe(time.ids.NotAttached)
      expect(captures.addCollection?.attributes.title).toBe("Personal task")
      expect(captures.addCollection?.attributes.visibility).toBe("private")
    }))

  it.effect("creates a personal ToDo with uploaded markdown and due date", () =>
    Effect.gen(function*() {
      const captures: Captures = {}

      yield* createTodo({
        title: todoTitle("Personal task"),
        description: "Body",
        dueDate: Timestamp.make(123),
        priority: "low",
        visibility: "public"
      }).pipe(Effect.provide(createLayer({ captures, employees: [makeEmployee()] })))

      expect(captures.uploadMarkup?.markup).toBe("Body")
      expect(captures.addCollection?.attributes.description).toBe("markup-ref")
      expect(captures.addCollection?.attributes.dueDate).toBe(123)
      expect(captures.addCollection?.attributes.priority).toBe(ToDoPriority.Low)
    }))

  it.effect("creates a personal ToDo without uploading blank markdown", () =>
    Effect.gen(function*() {
      const captures: Captures = {}

      yield* createTodo({ title: todoTitle("Blank body task"), description: "   " }).pipe(
        Effect.provide(createLayer({ captures, employees: [makeEmployee()] }))
      )

      expect(captures.uploadMarkup).toBeUndefined()
      expect(captures.addCollection?.attributes.description).toBe("")
    }))

  it.effect("creates an issue-attached ProjectToDo", () =>
    Effect.gen(function*() {
      const captures: Captures = {}
      const project = makeProject()
      const issue = makeIssue()

      yield* createTodo({
        title: todoTitle("Issue task"),
        attachedTo: { type: "issue", project: projectIdentifier("HULY"), identifier: issueIdentifier("94") }
      }).pipe(
        Effect.provide(createLayer({ projects: [project], issues: [issue], captures, employees: [makeEmployee()] }))
      )

      expect(captures.addCollection?.classId).toBe(time.class.ProjectToDo)
      expect(captures.addCollection?.attachedTo).toBe(issue._id)
      expect(captures.addCollection?.attributes.visibility).toBe("public")
    }))

  it.effect("creates an issue-attached ProjectToDo with due date", () =>
    Effect.gen(function*() {
      const captures: Captures = {}
      const project = makeProject()
      const issue = makeIssue()

      yield* createTodo({
        title: todoTitle("Issue task with due date"),
        dueDate: Timestamp.make(123),
        attachedTo: { type: "issue", project: projectIdentifier("HULY"), identifier: issueIdentifier("94") }
      }).pipe(
        Effect.provide(createLayer({ projects: [project], issues: [issue], captures, employees: [makeEmployee()] }))
      )

      expect(captures.addCollection?.attributes.dueDate).toBe(123)
    }))

  it.effect("gets a ToDo detail with fetched description and issue attachment summary", () =>
    Effect.gen(function*() {
      const issue = makeIssue()
      const todo = makeTodo({
        attachedTo: issue._id,
        attachedToClass: tracker.class.Issue,
        description: "markup-ref",
        visibility: "public"
      })

      const result = yield* getTodo({ locator: { todoId: todoId("todo-1") } }).pipe(
        Effect.provide(createLayer({ todos: [todo], issues: [issue], persons: [makePerson()], captures: {} }))
      )

      expect(result.description).toBe("Fetched description")
      expect(result.attachedTo.type).toBe("issue")
      expect(result.attachedTo.type === "issue" ? result.attachedTo.identifier : undefined).toBe("HULY-94")
      expect(result.visibility).toBe("public")
    }))

  it.effect("gets a ToDo detail without optional description or createdOn", () =>
    Effect.gen(function*() {
      const result = yield* getTodo({
        locator: { title: todoTitle("Completed task"), attachedTo: { type: "none" }, completionState: "all" }
      }).pipe(
        Effect.provide(createLayer({
          todos: [
            asTodo({
              ...makeTodo({
                title: todoTitle("Completed task"),
                description: "",
                doneOn: Timestamp.make(123)
              }),
              createdOn: undefined
            })
          ],
          captures: {}
        }))
      )

      expect(result.description).toBeUndefined()
      expect(result.createdOn).toBeUndefined()
      expect(result.attachedTo.type).toBe("none")
    }))

  it.effect("gets a ToDo detail with attached space", () =>
    Effect.gen(function*() {
      const result = yield* getTodo({ locator: { todoId: todoId("todo-1") } }).pipe(
        Effect.provide(createLayer({
          todos: [
            asTodo({
              ...makeTodo(),
              attachedSpace: "space-2" as Ref<Space>
            })
          ],
          captures: {}
        }))
      )

      expect(result.attachedSpace).toBe("space-2")
    }))

  it("summarizes runtime string count fields and owner email", () => {
    const result = todoSummary(
      asTodo({
        ...makeTodo(),
        workslots: "3",
        labels: "2"
      }),
      new Map([[toRef<Person>("employee-1"), Email.make("jane@example.test")]])
    )

    expect(result.owner.email).toBe("jane@example.test")
    expect(result.workslots).toBe(3)
    expect(result.labels).toBe(2)
  })

  it.effect("gets a ToDo by issue locator", () =>
    Effect.gen(function*() {
      const project = makeProject()
      const issue = makeIssue()
      const todo = makeTodo({
        title: todoTitle("Issue task"),
        attachedTo: issue._id,
        attachedToClass: tracker.class.Issue
      })

      const result = yield* getTodo({
        locator: {
          issue: { project: projectIdentifier("HULY"), identifier: issueIdentifier("94") },
          title: todoTitle("Issue task")
        }
      }).pipe(Effect.provide(createLayer({ projects: [project], issues: [issue], todos: [todo], captures: {} })))

      expect(result.id).toBe("todo-1")
    }))

  it.effect("gets a ToDo by issue locator without title", () =>
    Effect.gen(function*() {
      const project = makeProject()
      const issue = makeIssue()
      const todo = makeTodo({
        title: todoTitle("Issue task"),
        attachedTo: issue._id,
        attachedToClass: tracker.class.Issue
      })

      const result = yield* getTodo({
        locator: {
          issue: { project: projectIdentifier("HULY"), identifier: issueIdentifier("94") }
        }
      }).pipe(Effect.provide(createLayer({ projects: [project], issues: [issue], todos: [todo], captures: {} })))

      expect(result.id).toBe("todo-1")
    }))

  it.effect("gets a ToDo by title and owner locator", () =>
    Effect.gen(function*() {
      const result = yield* getTodo({
        locator: {
          title: todoTitle("Owned task"),
          owner: "employee-1"
        }
      }).pipe(
        Effect.provide(createLayer({
          todos: [makeTodo({ title: todoTitle("Owned task") })],
          employees: [makeEmployee()],
          captures: {}
        }))
      )

      expect(result.id).toBe("todo-1")
    }))

  it.effect("lists unknown attachment summaries and completed filters", () =>
    Effect.gen(function*() {
      const result = yield* listTodos({ completionState: "completed" }).pipe(
        Effect.provide(createLayer({
          todos: [
            makeTodo({
              attachedTo: "external-1" as Ref<Doc>,
              attachedToClass: "external:class:Thing" as Ref<Class<Doc>>,
              doneOn: Timestamp.make(100)
            })
          ],
          captures: {}
        }))
      )

      expect(result[0].attachedTo.type).toBe("unknown")
      expect(result[0].doneOn).toBe(100)
    }))

  it.effect("uses non-empty output fallbacks for legacy blank titles", () =>
    Effect.gen(function*() {
      const issue = makeIssue({ title: "" })
      const result = yield* listTodos({}).pipe(
        Effect.provide(createLayer({
          issues: [issue],
          todos: [
            makeTodo({
              title: "   ",
              attachedTo: issue._id,
              attachedToClass: tracker.class.Issue
            })
          ],
          captures: {}
        }))
      )

      expect(result[0].title).toBe("Untitled ToDo")
      expect(result[0].attachedTo).toMatchObject({ type: "issue", title: todoTitle("HULY-94") })
    }))

  it.effect("returns an ambiguous locator error for duplicate title matches", () =>
    Effect.gen(function*() {
      const error = yield* Effect.flip(
        getTodo({ locator: { title: todoTitle("Duplicate") } }).pipe(
          Effect.provide(createLayer({
            todos: [
              makeTodo({ _id: "todo-1" as Ref<HulyToDo>, title: todoTitle("Duplicate") }),
              makeTodo({ _id: "todo-2" as Ref<HulyToDo>, title: todoTitle("Duplicate") })
            ],
            captures: {}
          }))
        )
      )

      expect(error._tag).toBe("TodoIdentifierAmbiguousError")
    }))

  it.effect("returns not found for missing raw ToDo IDs", () =>
    Effect.gen(function*() {
      const error = yield* Effect.flip(
        getTodo({ locator: { todoId: todoId("missing") } }).pipe(Effect.provide(createLayer({ captures: {} })))
      )

      expect(error._tag).toBe("TodoNotFoundError")
    }))

  it.effect("returns not found for missing title locators", () =>
    Effect.gen(function*() {
      const error = yield* Effect.flip(
        getTodo({ locator: { title: todoTitle("Missing title") } }).pipe(
          Effect.provide(createLayer({ todos: [makeTodo({ title: todoTitle("Other title") })], captures: {} }))
        )
      )

      expect(error._tag).toBe("TodoNotFoundError")
    }))

  it.effect("returns owner resolution errors for missing and non-employee people", () =>
    Effect.gen(function*() {
      const missing = yield* Effect.flip(
        createTodo({ title: todoTitle("Missing owner"), owner: "Missing Person" }).pipe(
          Effect.provide(createLayer({ captures: {} }))
        )
      )
      const notEmployee = yield* Effect.flip(
        createTodo({ title: todoTitle("Not employee owner"), owner: "Jane Developer" }).pipe(
          Effect.provide(createLayer({ persons: [makePerson()], captures: {} }))
        )
      )
      const unaffiliatedAccount = yield* Effect.flip(
        createTodo({ title: todoTitle("Default owner missing") }).pipe(Effect.provide(createLayer({ captures: {} })))
      )

      expect(missing._tag).toBe("PersonNotFoundError")
      expect(notEmployee._tag).toBe("PersonNotAnEmployeeError")
      expect(unaffiliatedAccount._tag).toBe("PersonNotAnEmployeeError")
    }))

  it.effect("updates direct fields and clears due date", () =>
    Effect.gen(function*() {
      const captures: Captures = {}

      yield* updateTodo({
        locator: { todoId: todoId("todo-1") },
        title: todoTitle("Renamed"),
        dueDate: null,
        priority: "urgent",
        visibility: "public"
      }).pipe(Effect.provide(createLayer({ todos: [makeTodo()], captures })))

      expect(captures.updateDoc?.operations.title).toBe("Renamed")
      expect(captures.updateDoc?.operations.priority).toBe(ToDoPriority.Urgent)
      expect(captures.updateDoc?.operations.visibility).toBe("public")
      expect(captures.updateDoc?.operations.$unset).toEqual({ dueDate: "" })
    }))

  it.effect("updates due date to a concrete value and owner by raw employee id", () =>
    Effect.gen(function*() {
      const captures: Captures = {}

      yield* updateTodo({
        locator: { todoId: todoId("todo-1") },
        owner: "employee-2",
        dueDate: Timestamp.make(456)
      }).pipe(
        Effect.provide(createLayer({
          todos: [makeTodo()],
          employees: [makeEmployee({ _id: "employee-2" as Ref<Employee> })],
          captures
        }))
      )

      expect(captures.updateDoc?.operations.user).toBe("employee-2")
      expect(captures.updateDoc?.operations.dueDate).toBe(456)
    }))

  it.effect("updates ToDo owner and markdown description", () =>
    Effect.gen(function*() {
      const captures: Captures = {}

      yield* updateTodo({
        locator: { todoId: todoId("todo-1") },
        owner: "Jane Developer",
        description: "Updated body"
      }).pipe(
        Effect.provide(createLayer({
          todos: [makeTodo({ description: "markup-ref" })],
          persons: [makePerson()],
          employees: [makeEmployee()],
          captures
        }))
      )

      expect(captures.updateMarkup?.markup).toBe("Updated body")
      expect(captures.updateDoc?.operations.user).toBe("employee-1")
    }))

  it.effect("uploads description during update when no description ref exists", () =>
    Effect.gen(function*() {
      const captures: Captures = {}

      yield* updateTodo({ locator: { todoId: todoId("todo-1") }, description: "New body" }).pipe(
        Effect.provide(createLayer({ todos: [makeTodo({ description: "" })], captures }))
      )

      expect(captures.uploadMarkup?.markup).toBe("New body")
      expect(captures.updateDoc?.operations.description).toBe("markup-ref")
    }))

  it.effect("clears description to an empty string", () =>
    Effect.gen(function*() {
      const captures: Captures = {}

      yield* updateTodo({ locator: { todoId: todoId("todo-1") }, description: null }).pipe(
        Effect.provide(createLayer({ todos: [makeTodo({ description: "markup-ref" })], captures }))
      )

      expect(captures.updateDoc?.operations.description).toBe("")
    }))

  it.effect("updates only an existing markdown description without a document update", () =>
    Effect.gen(function*() {
      const captures: Captures = {}

      yield* updateTodo({ locator: { todoId: todoId("todo-1") }, description: "Only markup" }).pipe(
        Effect.provide(createLayer({ todos: [makeTodo({ description: "markup-ref" })], captures }))
      )

      expect(captures.updateMarkup?.markup).toBe("Only markup")
      expect(captures.updateDoc).toBeUndefined()
    }))

  it.effect("completes a ToDo with explicit doneOn", () =>
    Effect.gen(function*() {
      const captures: Captures = {}

      yield* completeTodo({ locator: { todoId: todoId("todo-1") }, doneOn: Timestamp.make(123) }).pipe(
        Effect.provide(createLayer({ todos: [makeTodo()], captures }))
      )

      expect(captures.updateDoc?.objectId).toBe("todo-1")
      expect(captures.updateDoc?.operations.doneOn).toBe(123)
    }))

  it.effect("completes a ToDo using the Effect clock when doneOn is omitted", () =>
    Effect.gen(function*() {
      const captures: Captures = {}

      yield* TestClock.adjust("123 millis")
      yield* completeTodo({ locator: { todoId: todoId("todo-1") } }).pipe(
        Effect.provide(createLayer({ todos: [makeTodo()], captures }))
      )

      expect(captures.updateDoc?.operations.doneOn).toBe(123)
    }))

  it.effect("reopens a completed ToDo", () =>
    Effect.gen(function*() {
      const captures: Captures = {}

      yield* reopenTodo({ locator: { todoId: todoId("todo-1") } }).pipe(
        Effect.provide(createLayer({ todos: [makeTodo({ doneOn: Timestamp.make(123) })], captures }))
      )

      expect(captures.updateDoc?.operations.doneOn).toBeNull()
    }))

  it.effect("reopens a completed ToDo by human locator without requiring completionState", () =>
    Effect.gen(function*() {
      const captures: Captures = {}

      yield* reopenTodo({ locator: { title: todoTitle("Completed by title") } }).pipe(
        Effect.provide(
          createLayer({
            todos: [makeTodo({ title: todoTitle("Completed by title"), doneOn: Timestamp.make(123) })],
            captures
          })
        )
      )

      expect(captures.updateDoc?.objectId).toBe("todo-1")
      expect(captures.updateDoc?.operations.doneOn).toBeNull()
    }))

  it.effect("schedules a ToDo through the work slot collection", () =>
    Effect.gen(function*() {
      const captures: Captures = {}

      yield* scheduleTodo({
        locator: { todoId: todoId("todo-1") },
        date: Timestamp.make(1_800_000_000_000),
        dueDate: Timestamp.make(1_800_003_600_000)
      }).pipe(Effect.provide(createLayer({ todos: [makeTodo({ description: "markup-ref" })], captures })))

      expect(captures.addCollection?.classId).toBe(time.class.WorkSlot)
      expect(captures.addCollection?.attachedTo).toBe("todo-1")
      expect(captures.addCollection?.collection).toBe("workslots")
      expect(captures.addCollection?.attributes.title).toBe("Implement planner tools")
      expect(captures.addCollection?.attributes.description).toBe("Fetched description")
      expect(captures.addCollection?.attributes.visibility).toBe("private")
    }))

  it.effect("deletes a ToDo by raw locator", () =>
    Effect.gen(function*() {
      const captures: Captures = {}

      yield* deleteTodo({ locator: { todoId: todoId("todo-1") } }).pipe(
        Effect.provide(createLayer({ todos: [makeTodo()], captures }))
      )

      expect(captures.removeDoc?.classId).toBe(time.class.ToDo)
      expect(captures.removeDoc?.objectId).toBe("todo-1")
    }))

  it.effect("removes issue-attached ToDos directly and updates the parent issue counter", () =>
    Effect.gen(function*() {
      const captures: Captures = {}
      const issue = makeIssue()

      yield* deleteTodo({ locator: { todoId: todoId("todo-1") } }).pipe(
        Effect.provide(createLayer({
          issues: [issue],
          todos: [
            makeTodo({
              attachedTo: issue._id,
              attachedToClass: tracker.class.Issue,
              attachedSpace: issue.space
            })
          ],
          captures
        }))
      )

      expect(captures.removeDoc?.classId).toBe(time.class.ProjectToDo)
      expect(captures.removeDoc?.objectId).toBe("todo-1")
      expect(captures.removeCollection).toBeUndefined()
      expect(captures.updateDoc?.classId).toBe(tracker.class.Issue)
      expect(captures.updateDoc?.objectId).toBe("issue-1")
      expect(captures.updateDoc?.operations).toEqual({ $inc: { todos: -1 } })
    }))

  it.effect("unschedules one existing work slot by ID", () =>
    Effect.gen(function*() {
      const captures: Captures = {}
      const result = yield* unscheduleTodo({ workSlotId: WorkSlotId.make("slot-1") }).pipe(
        Effect.provide(createLayer({ workSlots: [makeWorkSlot()], captures }))
      )

      expect(result.removed).toBe(1)
      expect(captures.removeCollection?.classId).toBe(time.class.WorkSlot)
      expect(captures.removeCollection?.objectId).toBe("slot-1")
      expect(captures.removeCollection?.attachedTo).toBe("todo-1")
      expect(captures.removeCollection?.attachedToClass).toBe(time.class.ToDo)
      expect(captures.removeCollection?.collection).toBe("workslots")
      expect(captures.updateDoc).toBeUndefined()
    }))

  it.effect("falls back to direct work slot removal when collection removal is unavailable", () =>
    Effect.gen(function*() {
      const captures: Captures = {}
      const result = yield* unscheduleTodo({ workSlotId: WorkSlotId.make("slot-1") }).pipe(
        Effect.provide(createLayer({ workSlots: [makeWorkSlot()], captures, removeCollectionAvailable: false }))
      )

      expect(result.removed).toBe(1)
      expect(captures.removeDoc?.classId).toBe(time.class.WorkSlot)
      expect(captures.removeDoc?.objectId).toBe("slot-1")
      expect(captures.updateDoc?.classId).toBe(time.class.ToDo)
      expect(captures.updateDoc?.objectId).toBe("todo-1")
      expect(captures.updateDoc?.operations).toEqual({ $inc: { workslots: -1 } })
    }))

  it.effect("returns a work-slot not found error", () =>
    Effect.gen(function*() {
      const error = yield* Effect.flip(
        unscheduleTodo({ workSlotId: WorkSlotId.make("missing") }).pipe(Effect.provide(createLayer({ captures: {} })))
      )

      expect(error._tag).toBe("TodoWorkSlotNotFoundError")
    }))

  it.effect("unschedules all slots by ToDo locator", () =>
    Effect.gen(function*() {
      const captures: Captures = {}
      const result = yield* unscheduleTodo({ locator: { todoId: todoId("todo-1") }, scope: "all" }).pipe(
        Effect.provide(createLayer({ todos: [makeTodo()], workSlots: [makeWorkSlot()], captures }))
      )

      expect(result.todoId).toBe("todo-1")
      expect(result.removed).toBe(1)
    }))

  it.effect("unschedules future slots by ToDo locator", () =>
    Effect.gen(function*() {
      const result = yield* unscheduleTodo({
        locator: { todoId: todoId("todo-1") },
        scope: "future",
        from: Timestamp.make(1_700_000_000_000)
      }).pipe(Effect.provide(createLayer({ todos: [makeTodo()], workSlots: [makeWorkSlot()], captures: {} })))

      expect(result.removed).toBe(1)
    }))

  it.effect("unschedules future slots using the current clock when from is omitted", () =>
    Effect.gen(function*() {
      yield* TestClock.adjust("75 millis")
      const result = yield* unscheduleTodo({
        locator: { todoId: todoId("todo-1") },
        scope: "future"
      }).pipe(
        Effect.provide(createLayer({
          todos: [makeTodo()],
          workSlots: [
            makeWorkSlot({ _id: "slot-past" as Ref<HulyWorkSlot>, date: Timestamp.make(50) }),
            makeWorkSlot({ _id: "slot-future" as Ref<HulyWorkSlot>, date: Timestamp.make(100) })
          ],
          captures: {}
        }))
      )

      expect(result.todoId).toBe("todo-1")
      expect(result.removed).toBe(1)
    }))
})
