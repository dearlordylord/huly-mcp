import type { Visibility as HulyVisibility } from "@hcengineering/calendar"
import type { Employee, Person } from "@hcengineering/contact"
import type { Class, Doc, DocumentQuery, MarkupBlobRef, Ref, Space, WithLookup } from "@hcengineering/core"
import { SortingOrder } from "@hcengineering/core"
import { makeRank } from "@hcengineering/rank"
import { type ToDo as HulyToDo, ToDoPriority } from "@hcengineering/time"
import type { Issue as HulyIssue, Project as HulyProject } from "@hcengineering/tracker"
import { Effect } from "effect"

import type {
  TodoAttachmentInput,
  TodoAttachmentSummary,
  TodoCompletionState,
  TodoLocator,
  TodoOwnerSummary,
  TodoPriority,
  TodoRank,
  TodoSummary,
  TodoVisibility
} from "../../domain/schemas/planner.js"
import { TodoAttachmentTitle, TodoRank as TodoRankSchema, TodoTitle } from "../../domain/schemas/planner.js"
import {
  Count,
  DocId,
  Email,
  IssueId,
  IssueIdentifier,
  type NonEmptyString,
  ObjectClassName,
  PersonId,
  PersonName,
  ProjectIdentifier,
  Timestamp,
  TodoId
} from "../../domain/schemas/shared.js"
import { assertAt, isExistent } from "../../utils/assertions.js"
import { HulyClient, type HulyClientError } from "../client.js"
import type {
  IssueNotFoundError,
  PersonIdentifierAmbiguousError,
  PersonNotAnEmployeeError,
  PersonNotFoundError,
  ProjectNotFoundError,
  TodoIdentifierAmbiguousError
} from "../errors.js"
import {
  PersonNotAnEmployeeError as PersonNotEmployee,
  PersonNotFoundError as PersonMissing,
  TodoIdentifierAmbiguousError as AmbiguousTodo,
  TodoNotFoundError
} from "../errors.js"
import { contact, time, tracker } from "../huly-plugins.js"
import { findPersonByExactEmailOrName } from "./contacts-shared.js"
import { findProjectAndIssue } from "./issues-shared.js"
import { hulyNonEmptyTextOrFallback } from "./non-empty-text.js"
import { hulyQuery, type StrictDocumentQuery, withLookup } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"

export type HulyTodoWithLookup = WithLookup<HulyToDo> & {
  readonly $lookup?: {
    readonly user?: Person
    readonly attachedTo?: HulyIssue
  }
}

export const todoLookup = {
  user: contact.class.Person,
  attachedTo: tracker.class.Issue
} as const

interface ResolvedTodoAttachment {
  readonly type: "none" | "issue"
  readonly attachedTo: Ref<Doc>
  readonly attachedToClass: Ref<Class<Doc>>
  readonly attachedSpace?: Ref<Space> | undefined
  readonly project?: HulyProject | undefined
  readonly issue?: HulyIssue | undefined
}

export type PlannerLookupError =
  | HulyClientError
  | ProjectNotFoundError
  | IssueNotFoundError
  | PersonIdentifierAmbiguousError
  | PersonNotFoundError
  | PersonNotAnEmployeeError
  | TodoIdentifierAmbiguousError
  | TodoNotFoundError

const TODO_PRIORITY_TO_STRING = {
  [ToDoPriority.NoPriority]: "no-priority",
  [ToDoPriority.Low]: "low",
  [ToDoPriority.Medium]: "medium",
  [ToDoPriority.High]: "high",
  [ToDoPriority.Urgent]: "urgent"
} as const satisfies Record<ToDoPriority, TodoPriority>

const STRING_TO_TODO_PRIORITY = {
  "no-priority": ToDoPriority.NoPriority,
  low: ToDoPriority.Low,
  medium: ToDoPriority.Medium,
  high: ToDoPriority.High,
  urgent: ToDoPriority.Urgent
} as const satisfies Record<TodoPriority, ToDoPriority>

const todoPriorityToString = (priority: ToDoPriority): TodoPriority => TODO_PRIORITY_TO_STRING[priority]
export const stringToTodoPriority = (priority: TodoPriority): ToDoPriority => STRING_TO_TODO_PRIORITY[priority]

const TODO_VISIBILITY_TO_HULY = {
  public: "public",
  freeBusy: "freeBusy",
  private: "private"
} as const satisfies Record<TodoVisibility, HulyVisibility>

const HULY_VISIBILITY_TO_TODO = {
  public: "public",
  freeBusy: "freeBusy",
  private: "private"
} as const satisfies Record<HulyVisibility, TodoVisibility>

const todoVisibilityToString = (visibility: HulyVisibility): TodoVisibility => HULY_VISIBILITY_TO_TODO[visibility]
export const stringToTodoVisibility = (visibility: TodoVisibility): HulyVisibility =>
  TODO_VISIBILITY_TO_HULY[visibility]

// SDK: ToDo["description"] is Markup, but persisted markup references are plain strings.
export const todoDescriptionAsMarkupRef = (description: HulyToDo["description"]): MarkupBlobRef =>
  // eslint-disable-next-line no-restricted-syntax -- Brands are erased at runtime; both SDK markup refs are strings.
  description as MarkupBlobRef

export const markupRefAsTodoDescription = (ref: MarkupBlobRef | null): HulyToDo["description"] => ref ?? ""

const UNTITLED_TODO = TodoTitle.make("Untitled ToDo")

// Huly can contain legacy/API-created blank titles; MCP output keeps list/get responses non-empty.
export const todoTitleOrFallback = (title: string): TodoTitle =>
  hulyNonEmptyTextOrFallback(TodoTitle, title, UNTITLED_TODO)

const attachmentTitleOrFallback = (title: string, fallback: string): TodoAttachmentTitle =>
  hulyNonEmptyTextOrFallback(TodoAttachmentTitle, title, TodoAttachmentTitle.make(fallback))

export const resolveTodoOwner = (
  client: HulyClient["Type"],
  owner?: NonEmptyString
): Effect.Effect<
  Ref<Employee>,
  HulyClientError | PersonIdentifierAmbiguousError | PersonNotFoundError | PersonNotAnEmployeeError
> =>
  Effect.gen(function*() {
    if (owner === undefined) {
      const employee = yield* client.findOne<Employee>(
        contact.mixin.Employee,
        hulyQuery<Employee>({ personUuid: client.getAccountUuid() })
      )
      if (employee === undefined) {
        return yield* new PersonNotEmployee({ identifier: "authenticated user" })
      }
      return employee._id
    }

    const byId = yield* client.findOne<Employee>(
      contact.mixin.Employee,
      hulyQuery<Employee>({ _id: toRef<Employee>(owner) })
    )
    if (byId !== undefined) return byId._id

    const personRef = owner.includes("@") ? Email.make(owner) : PersonName.make(owner)
    const person = yield* findPersonByExactEmailOrName(client, personRef)
    if (person === undefined) {
      return yield* new PersonMissing({ identifier: owner })
    }

    const employee = yield* client.findOne<Employee>(
      contact.mixin.Employee,
      hulyQuery<Employee>({ _id: toRef<Employee>(person._id) })
    )
    if (employee === undefined) {
      return yield* new PersonNotEmployee({ identifier: owner })
    }
    return employee._id
  })

export const resolveTodoAttachment = (
  client: HulyClient["Type"],
  attachment?: TodoAttachmentInput
): Effect.Effect<
  ResolvedTodoAttachment,
  HulyClientError | ProjectNotFoundError | IssueNotFoundError,
  never
> =>
  Effect.gen(function*() {
    if (attachment?.type === "issue") {
      const { issue, project } = yield* findProjectAndIssue({
        project: attachment.project,
        identifier: attachment.identifier
      }).pipe(Effect.provideService(HulyClient, client))
      return {
        type: "issue",
        attachedTo: issue._id,
        attachedToClass: tracker.class.Issue,
        attachedSpace: issue.space,
        project,
        issue
      }
    }

    return {
      type: "none",
      attachedTo: time.ids.NotAttached,
      attachedToClass: time.class.ToDo
    }
  })

export const latestOpenTodoRank = (
  client: HulyClient["Type"],
  owner: Ref<Employee>
): Effect.Effect<TodoRank, HulyClientError> =>
  Effect.gen(function*() {
    const latestTodo = yield* client.findOne<HulyToDo>(
      time.class.ToDo,
      hulyQuery<HulyToDo>({
        user: owner,
        doneOn: null
      }),
      { sort: { rank: SortingOrder.Ascending } }
    )
    return TodoRankSchema.make(makeRank(undefined, latestTodo?.rank))
  })

const applyCompletionState = (
  query: StrictDocumentQuery<HulyToDo>,
  completionState: TodoCompletionState | undefined
): void => {
  if (completionState === "open") query.doneOn = null
  if (completionState === "completed") {
    const completedFilter: DocumentQuery<HulyToDo>["doneOn"] = { $ne: null }
    query.doneOn = completedFilter
  }
}

const queryForAttachment = (
  query: StrictDocumentQuery<HulyToDo>,
  attachment: ResolvedTodoAttachment
): void => {
  query.attachedTo = attachment.attachedTo
  query.attachedToClass = attachment.attachedToClass
}

// Error diagnostics use compact JSON because locators are already LLM-facing shapes.
const describeLocator = (locator: TodoLocator): string => JSON.stringify(locator)

export const queryFromListFilters = (
  owner: Ref<Employee> | undefined,
  attachment: ResolvedTodoAttachment | undefined,
  filters: {
    readonly title?: NonEmptyString | undefined
    readonly dueFrom?: Timestamp | undefined
    readonly dueTo?: Timestamp | undefined
    readonly completionState?: TodoCompletionState | undefined
    readonly priority?: TodoPriority | undefined
    readonly visibility?: TodoVisibility | undefined
  }
): StrictDocumentQuery<HulyToDo> => {
  const query: StrictDocumentQuery<HulyToDo> = {}
  if (owner !== undefined) query.user = owner
  if (attachment !== undefined) queryForAttachment(query, attachment)
  if (filters.title !== undefined) query.title = filters.title
  if (filters.dueFrom !== undefined || filters.dueTo !== undefined) {
    query.dueDate = {}
    if (filters.dueFrom !== undefined) query.dueDate.$gte = filters.dueFrom
    if (filters.dueTo !== undefined) query.dueDate.$lte = filters.dueTo
  }
  applyCompletionState(query, filters.completionState)
  if (filters.priority !== undefined) query.priority = stringToTodoPriority(filters.priority)
  if (filters.visibility !== undefined) query.visibility = stringToTodoVisibility(filters.visibility)
  return query
}

const queryFromLocator = (
  owner: Ref<Employee> | undefined,
  attachment: ResolvedTodoAttachment | undefined,
  locator: Exclude<TodoLocator, { readonly todoId: unknown }>,
  defaultCompletionState: TodoCompletionState
): StrictDocumentQuery<HulyToDo> => {
  const query: StrictDocumentQuery<HulyToDo> = {}
  if ("title" in locator && locator.title !== undefined) query.title = locator.title
  if (owner !== undefined) query.user = owner
  if (attachment !== undefined) queryForAttachment(query, attachment)
  applyCompletionState(query, locator.completionState ?? defaultCompletionState)
  return query
}

export const findTodo = (
  client: HulyClient["Type"],
  locator: TodoLocator,
  defaultCompletionState: TodoCompletionState = "open"
): Effect.Effect<HulyToDo, PlannerLookupError> =>
  Effect.gen(function*() {
    if ("todoId" in locator) {
      const todo = yield* client.findOne<HulyToDo>(
        time.class.ToDo,
        hulyQuery<HulyToDo>({ _id: toRef<HulyToDo>(locator.todoId) }),
        withLookup<HulyToDo>(undefined, todoLookup)
      )
      if (todo === undefined) return yield* new TodoNotFoundError({ locator: describeLocator(locator) })
      return todo
    }

    const owner = "owner" in locator ? yield* resolveTodoOwner(client, locator.owner) : undefined
    const attachment = "issue" in locator
      ? yield* resolveTodoAttachment(client, { type: "issue", ...locator.issue })
      : "attachedTo" in locator
      ? yield* resolveTodoAttachment(client, locator.attachedTo)
      : undefined

    const todos = yield* client.findAll<HulyToDo>(
      time.class.ToDo,
      hulyQuery<HulyToDo>(queryFromLocator(owner, attachment, locator, defaultCompletionState)),
      { limit: 2, sort: { rank: SortingOrder.Ascending } }
    )

    if (todos.length === 0) return yield* new TodoNotFoundError({ locator: describeLocator(locator) })
    if (todos.length > 1) {
      return yield* new AmbiguousTodo({ locator: describeLocator(locator), matches: todos.length })
    }
    return assertAt(todos, 0)
  })

const todoOwnerSummary = (
  todo: HulyTodoWithLookup,
  emailByPersonId: ReadonlyMap<Ref<Person>, Email>
): TodoOwnerSummary => {
  const ownerId = toRef<Person>(todo.user)
  const name = todo.$lookup?.user?.name
  const email = emailByPersonId.get(ownerId)
  return {
    id: PersonId.make(ownerId),
    ...(name === undefined ? {} : { name: PersonName.make(name) }),
    ...(email === undefined ? {} : { email })
  }
}

const todoAttachmentSummary = (todo: HulyTodoWithLookup): TodoAttachmentSummary => {
  if (todo.attachedTo === time.ids.NotAttached) return { type: "none" }
  const issue = todo.$lookup?.attachedTo
  if (todo.attachedToClass === tracker.class.Issue && issue !== undefined) {
    const identifier = IssueIdentifier.make(issue.identifier)
    const segments = identifier.split("-")
    const project = assertAt(segments, 0)
    return {
      type: "issue",
      id: IssueId.make(issue._id),
      project: ProjectIdentifier.make(project),
      identifier,
      title: attachmentTitleOrFallback(issue.title, issue.identifier)
    }
  }
  return {
    type: "unknown",
    id: DocId.make(todo.attachedTo),
    class: ObjectClassName.make(todo.attachedToClass)
  }
}

const runtimeCount = (value: unknown): Count => Count.make(Number(value))

const runtimeTimestampOrNull = (value: unknown): Timestamp | null | undefined =>
  value === undefined || value === null ? value : Timestamp.make(Number(value))

export const todoSummary = (
  todo: HulyTodoWithLookup,
  emailByPersonId: ReadonlyMap<Ref<Person>, Email>
): TodoSummary => {
  const labels = Reflect.get(todo, "labels")
  return {
    id: TodoId.make(todo._id),
    title: todoTitleOrFallback(todo.title),
    priority: todoPriorityToString(todo.priority),
    visibility: todoVisibilityToString(todo.visibility),
    owner: todoOwnerSummary(todo, emailByPersonId),
    attachedTo: todoAttachmentSummary(todo),
    workslots: runtimeCount(Reflect.get(todo, "workslots")),
    ...(todo.dueDate === undefined ? {} : { dueDate: runtimeTimestampOrNull(todo.dueDate) }),
    doneOn: runtimeTimestampOrNull(todo.doneOn),
    ...(labels === undefined ? {} : { labels: runtimeCount(labels) })
  }
}

export const uniqueTodoOwnerIds = (todos: ReadonlyArray<HulyToDo>): Array<Ref<Person>> =>
  [...new Set(todos.map((todo) => todo.user).filter(isExistent))].map(toRef<Person>)
