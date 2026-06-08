import type { Employee } from "@hcengineering/contact"
import {
  type AttachedData,
  type Class,
  type DocumentUpdate,
  generateId,
  type Ref,
  SortingOrder
} from "@hcengineering/core"
import {
  type ProjectToDo as HulyProjectToDo,
  type ToDo as HulyToDo,
  type WorkSlot as HulyWorkSlot
} from "@hcengineering/time"
import type { Issue as HulyIssue } from "@hcengineering/tracker"
import { Clock, Effect } from "effect"

import type {
  CompleteTodoParams,
  CreateTodoParams,
  CreateTodoResult,
  DeleteTodoParams,
  DeleteTodoResult,
  GetTodoParams,
  ListTodosParams,
  ReopenTodoParams,
  ScheduleTodoParams,
  ScheduleTodoResult,
  TodoDetail,
  TodoMutationResult,
  TodoRank,
  TodoSummary,
  UnscheduleTodoParams,
  UnscheduleTodoResult,
  UpdateTodoParams
} from "../../domain/schemas/planner.js"
import { UPDATE_TODO_FIELDS } from "../../domain/schemas/planner.js"
import { Count, SpaceId, Timestamp, TodoId } from "../../domain/schemas/shared.js"
import { HulyClient, type HulyClientError } from "../client.js"
import type { HulyDomainError, NoUpdateFieldsError, TodoWorkSlotNotFoundError } from "../errors.js"
import { TodoWorkSlotNotFoundError as WorkSlotMissing } from "../errors.js"
import { time, tracker } from "../huly-plugins.js"
import { batchGetEmailsForPersons } from "./contacts-shared.js"
import {
  findTodo,
  type HulyTodoWithLookup,
  latestOpenTodoRank,
  markupRefAsTodoDescription,
  type PlannerLookupError,
  queryFromListFilters,
  resolveTodoAttachment,
  resolveTodoOwner,
  stringToTodoPriority,
  stringToTodoVisibility,
  todoDescriptionAsMarkupRef,
  todoLookup,
  todoSummary,
  todoTitleOrFallback,
  uniqueTodoOwnerIds
} from "./planner-shared.js"
import { clampLimit, hulyQuery, withLookup } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"
import { createPlannerWorkSlot } from "./time.js"
import { mergeUpdateEntries, requireUpdateFields } from "./update-guards.js"

type PlannerMutationError = PlannerLookupError | HulyClientError | NoUpdateFieldsError | TodoWorkSlotNotFoundError

type TodoableParent = HulyIssue & { readonly todos?: number | undefined }
type WorkSlottedTodo = HulyToDo & { readonly workslots?: number | undefined }

const descriptionForTodo = (
  client: HulyClient["Type"],
  todo: HulyToDo
): Effect.Effect<string | undefined, HulyClientError> =>
  todo.description
    ? client.fetchMarkup(
      time.class.ToDo,
      todo._id,
      "description",
      todoDescriptionAsMarkupRef(todo.description),
      "markdown"
    )
    : Effect.succeed(undefined)

const detailFromTodo = (
  client: HulyClient["Type"],
  todo: HulyTodoWithLookup
): Effect.Effect<TodoDetail, HulyClientError> =>
  Effect.gen(function*() {
    const emailMap = yield* batchGetEmailsForPersons(client, uniqueTodoOwnerIds([todo]))
    const description = yield* descriptionForTodo(client, todo)
    return {
      ...todoSummary(todo, emailMap),
      ...(description === undefined ? {} : { description }),
      ...(todo.attachedSpace === undefined ? {} : { attachedSpace: SpaceId.make(todo.attachedSpace) }),
      ...(todo.createdOn === undefined ? {} : { createdOn: Timestamp.make(todo.createdOn) }),
      modifiedOn: Timestamp.make(todo.modifiedOn)
    }
  })

const uploadTodoDescription = (
  client: HulyClient["Type"],
  objectClass: Ref<Class<HulyToDo>>,
  todoId: Ref<HulyToDo>,
  description: string | undefined
): Effect.Effect<HulyToDo["description"], HulyClientError> =>
  Effect.gen(function*() {
    if (description === undefined || description.trim() === "") return ""
    const ref = yield* client.uploadMarkup(objectClass, todoId, "description", description, "markdown")
    return markupRefAsTodoDescription(ref)
  })

const createPersonalTodo = (
  client: HulyClient["Type"],
  params: CreateTodoParams,
  owner: Ref<Employee>,
  todoId: Ref<HulyToDo>,
  description: HulyToDo["description"],
  rank: TodoRank
): Effect.Effect<void, HulyClientError> => {
  const data: AttachedData<HulyToDo> = {
    workslots: 0,
    title: params.title,
    description,
    priority: stringToTodoPriority(params.priority ?? "no-priority"),
    visibility: stringToTodoVisibility(params.visibility ?? "private"),
    user: owner,
    doneOn: null,
    rank
  }
  if (params.dueDate !== undefined) data.dueDate = params.dueDate
  return client.addCollection(
    time.class.ToDo,
    time.space.ToDos,
    time.ids.NotAttached,
    time.class.ToDo,
    "todos",
    data,
    todoId
  ).pipe(Effect.asVoid)
}

const createIssueTodo = (
  client: HulyClient["Type"],
  params: CreateTodoParams,
  owner: Ref<Employee>,
  issue: HulyIssue,
  todoId: Ref<HulyProjectToDo>,
  description: HulyToDo["description"],
  rank: TodoRank
): Effect.Effect<void, HulyClientError> => {
  const data: AttachedData<HulyProjectToDo> = {
    workslots: 0,
    title: params.title,
    description,
    priority: stringToTodoPriority(params.priority ?? "no-priority"),
    visibility: stringToTodoVisibility(params.visibility ?? "public"),
    user: owner,
    doneOn: null,
    attachedSpace: issue.space,
    rank
  }
  if (params.dueDate !== undefined) data.dueDate = params.dueDate
  return client.addCollection(
    time.class.ProjectToDo,
    time.space.ToDos,
    issue._id,
    tracker.class.Issue,
    "todos",
    data,
    todoId
  ).pipe(Effect.asVoid)
}

export const listTodos = (
  params: ListTodosParams
): Effect.Effect<Array<TodoSummary>, PlannerLookupError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const owner = params.owner === undefined ? undefined : yield* resolveTodoOwner(client, params.owner)
    const attachment = params.issue === undefined
      ? undefined
      : yield* resolveTodoAttachment(client, { type: "issue", ...params.issue })
    const query = queryFromListFilters(owner, attachment, {
      title: params.title,
      dueFrom: params.dueFrom,
      dueTo: params.dueTo,
      completionState: params.completionState,
      priority: params.priority,
      visibility: params.visibility
    })

    const todos = yield* client.findAll<HulyTodoWithLookup>(
      time.class.ToDo,
      hulyQuery<HulyTodoWithLookup>(query),
      withLookup<HulyTodoWithLookup>(
        { limit: clampLimit(params.limit), sort: { rank: SortingOrder.Ascending } },
        todoLookup
      )
    )
    const titleSearch = params.titleSearch?.toLowerCase()
    const filtered = titleSearch === undefined
      ? todos
      : todos.filter((todo) => todo.title.toLowerCase().includes(titleSearch))
    const emailMap = yield* batchGetEmailsForPersons(client, uniqueTodoOwnerIds(filtered))
    return filtered.map((todo) => todoSummary(todo, emailMap))
  })

export const getTodo = (
  params: GetTodoParams
): Effect.Effect<TodoDetail, PlannerLookupError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const todo = yield* findTodo(client, params.locator)
    return yield* detailFromTodo(client, todo)
  })

export const createTodo = (
  params: CreateTodoParams
): Effect.Effect<CreateTodoResult, PlannerLookupError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const owner = yield* resolveTodoOwner(client, params.owner)
    const attachment = yield* resolveTodoAttachment(client, params.attachedTo)
    const rank = yield* latestOpenTodoRank(client, owner)

    if (attachment.type === "issue" && attachment.issue !== undefined) {
      const todoId: Ref<HulyProjectToDo> = generateId()
      const description = yield* uploadTodoDescription(client, time.class.ProjectToDo, todoId, params.description)
      yield* createIssueTodo(client, params, owner, attachment.issue, todoId, description, rank)
      return { todoId: TodoId.make(todoId) }
    }

    const todoId: Ref<HulyToDo> = generateId()
    const description = yield* uploadTodoDescription(client, time.class.ToDo, todoId, params.description)
    yield* createPersonalTodo(client, params, owner, todoId, description, rank)
    return { todoId: TodoId.make(todoId) }
  })

export const updateTodo = (
  params: UpdateTodoParams
): Effect.Effect<TodoMutationResult, PlannerMutationError, HulyClient> =>
  Effect.gen(function*() {
    yield* requireUpdateFields("update_todo", params, UPDATE_TODO_FIELDS)
    const client = yield* HulyClient
    const todo = yield* findTodo(client, params.locator)

    const updateEntries = [
      params.title === undefined ? {} : { title: params.title },
      params.owner === undefined ? {} : { user: yield* resolveTodoOwner(client, params.owner) },
      params.dueDate === undefined
        ? {}
        : params.dueDate === null
        ? { $unset: { dueDate: "" } }
        : { dueDate: params.dueDate },
      params.priority === undefined ? {} : { priority: stringToTodoPriority(params.priority) },
      params.visibility === undefined ? {} : { visibility: stringToTodoVisibility(params.visibility) },
      yield* Effect.gen(function*() {
        if (params.description === undefined) return {}
        if (params.description === null || params.description.trim() === "") return { description: "" }
        if (todo.description) {
          yield* client.updateMarkup(time.class.ToDo, todo._id, "description", params.description, "markdown")
          return {}
        }
        const ref = yield* client.uploadMarkup(time.class.ToDo, todo._id, "description", params.description, "markdown")
        return { description: markupRefAsTodoDescription(ref) }
      })
    ] satisfies ReadonlyArray<DocumentUpdate<HulyToDo>>

    const updateOps: DocumentUpdate<HulyToDo> = mergeUpdateEntries(updateEntries)
    if (Object.keys(updateOps).length > 0) {
      yield* client.updateDoc(time.class.ToDo, todo.space, todo._id, updateOps)
    }
    return { todoId: TodoId.make(todo._id), updated: true }
  })

export const completeTodo = (
  params: CompleteTodoParams
): Effect.Effect<TodoMutationResult, PlannerMutationError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const todo = yield* findTodo(client, params.locator)
    const doneOn = params.doneOn ?? (yield* Clock.currentTimeMillis)
    yield* client.updateDoc(time.class.ToDo, todo.space, todo._id, { doneOn })
    return { todoId: TodoId.make(todo._id), updated: true }
  })

export const reopenTodo = (
  params: ReopenTodoParams
): Effect.Effect<TodoMutationResult, PlannerMutationError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const todo = yield* findTodo(client, params.locator, "completed")
    yield* client.updateDoc(time.class.ToDo, todo.space, todo._id, { doneOn: null })
    return { todoId: TodoId.make(todo._id), updated: true }
  })

export const deleteTodo = (
  params: DeleteTodoParams
): Effect.Effect<DeleteTodoResult, PlannerMutationError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const todo = yield* findTodo(client, params.locator)
    if (todo.attachedToClass === tracker.class.Issue && todo.attachedTo !== time.ids.NotAttached) {
      if (client.removeCollection !== undefined) {
        yield* client.removeCollection(
          time.class.ProjectToDo,
          todo.space,
          toRef<HulyProjectToDo>(todo._id),
          toRef<HulyIssue>(todo.attachedTo),
          tracker.class.Issue,
          "todos"
        )
      } else {
        yield* client.removeDoc(time.class.ToDo, todo.space, todo._id)
      }
      yield* decrementIssueTodoCounter(client, todo)
    } else {
      yield* client.removeDoc(time.class.ToDo, todo.space, todo._id)
    }
    return { todoId: TodoId.make(todo._id), deleted: true }
  })

const decrementIssueTodoCounter = (
  client: HulyClient["Type"],
  todo: HulyToDo
): Effect.Effect<void, HulyClientError> =>
  client.updateDoc(
    toRef<Class<TodoableParent>>(tracker.class.Issue),
    todo.attachedSpace ?? todo.space,
    toRef<TodoableParent>(todo.attachedTo),
    { $inc: { todos: -1 } }
  ).pipe(Effect.asVoid)

export const scheduleTodo = (
  params: ScheduleTodoParams
): Effect.Effect<ScheduleTodoResult, HulyDomainError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const todo = yield* findTodo(client, params.locator)
    const description = yield* descriptionForTodo(client, todo)
    const result = yield* createPlannerWorkSlot({
      todoId: TodoId.make(todo._id),
      date: params.date,
      dueDate: params.dueDate,
      title: todoTitleOrFallback(todo.title),
      description: description ?? "",
      visibility: todo.visibility
    })
    return { todoId: TodoId.make(todo._id), workSlotId: result.slotId }
  })

const removeWorkSlot = (
  client: HulyClient["Type"],
  slot: HulyWorkSlot
): Effect.Effect<void, HulyClientError> =>
  Effect.gen(function*() {
    if (client.removeCollection !== undefined) {
      yield* client.removeCollection(
        time.class.WorkSlot,
        slot.space,
        slot._id,
        toRef<WorkSlottedTodo>(slot.attachedTo),
        toRef<Class<WorkSlottedTodo>>(time.class.ToDo),
        "workslots"
      )
    } else {
      yield* client.removeDoc(time.class.WorkSlot, slot.space, slot._id)
    }
    yield* client.updateDoc(
      toRef<Class<WorkSlottedTodo>>(time.class.ToDo),
      time.space.ToDos,
      toRef<WorkSlottedTodo>(slot.attachedTo),
      { $inc: { workslots: -1 } }
    )
  })

export const unscheduleTodo = (
  params: UnscheduleTodoParams
): Effect.Effect<UnscheduleTodoResult, PlannerMutationError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient

    if ("workSlotId" in params) {
      const slot = yield* client.findOne<HulyWorkSlot>(
        time.class.WorkSlot,
        hulyQuery<HulyWorkSlot>({ _id: toRef<HulyWorkSlot>(params.workSlotId) })
      )
      if (slot === undefined) return yield* new WorkSlotMissing({ workSlotId: params.workSlotId })
      yield* removeWorkSlot(client, slot)
      return { todoId: TodoId.make(slot.attachedTo), removed: Count.make(1) }
    }

    const todo = yield* findTodo(client, params.locator)

    const query = params.scope === "future"
      ? hulyQuery<HulyWorkSlot>({
        attachedTo: todo._id,
        date: { $gte: params.from ?? (yield* Clock.currentTimeMillis) }
      })
      : hulyQuery<HulyWorkSlot>({ attachedTo: todo._id })
    const slots = yield* client.findAll<HulyWorkSlot>(time.class.WorkSlot, query)
    yield* Effect.all(slots.map((slot) => removeWorkSlot(client, slot)))
    return { todoId: TodoId.make(todo._id), removed: Count.make(slots.length) }
  })
