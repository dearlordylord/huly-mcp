import type { Employee } from "@hcengineering/contact"
import {
  type AttachedData,
  type Class,
  type DocumentUpdate,
  type Doc,
  generateId,
  type Ref,
  SortingOrder,
  type Space
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
  TodoVisibility,
  UnscheduleTodoParams,
  UnscheduleTodoResult,
  UpdateTodoParams
} from "../../domain/schemas/planner.js"
import {
  DEFAULT_DOCUMENT_TODO_VISIBILITY,
  DEFAULT_ISSUE_TODO_VISIBILITY,
  DEFAULT_PERSONAL_TODO_VISIBILITY,
  DEFAULT_TODO_PRIORITY,
  UPDATE_TODO_FIELDS
} from "../../domain/schemas/planner.js"
import { Count, SpaceId, Timestamp, TodoId } from "../../domain/schemas/shared.js"
import { HulyClient, type HulyClientError } from "../client.js"
import type { Diagnostics } from "../diagnostics.js"
import type {
  HulyDataInvalidError,
  HulyDomainError,
  NoUpdateFieldsError,
  TodoWorkSlotNotFoundError
} from "../errors.js"
import { TodoWorkSlotNotFoundError as WorkSlotMissing } from "../errors.js"
import { time, tracker } from "../huly-plugins.js"
import { batchGetEmailsForPersons } from "./contacts-shared.js"
import { renderMarkdownPreservingNativeReferences } from "./native-reference-markup.js"
import { createPlannerWorkSlot } from "./planner-scheduling.js"
import { documentMetadataForTodos } from "./planner-document-metadata.js"
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
import { mergeUpdateEntries, requireUpdateFields } from "./update-guards.js"

type PlannerMutationError = PlannerLookupError | HulyClientError | NoUpdateFieldsError | TodoWorkSlotNotFoundError

type TodoableParent = HulyIssue & { readonly todos?: number | undefined }
type WorkSlottedTodo = HulyToDo & { readonly workslots?: number | undefined }

const descriptionForTodo = (
  client: HulyClient["Service"],
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
  client: HulyClient["Service"],
  todo: HulyTodoWithLookup
): Effect.Effect<TodoDetail, HulyClientError | HulyDataInvalidError, Diagnostics> =>
  Effect.gen(function* () {
    const emailMap = yield* batchGetEmailsForPersons(client, uniqueTodoOwnerIds([todo]))
    const documentMetadata = yield* documentMetadataForTodos(client, [todo])
    const description = yield* descriptionForTodo(client, todo)
    return {
      ...todoSummary(todo, emailMap, documentMetadata),
      ...(description === undefined ? {} : { description }),
      ...(todo.attachedSpace === undefined ? {} : { attachedSpace: SpaceId.make(todo.attachedSpace) }),
      ...(todo.createdOn === undefined ? {} : { createdOn: Timestamp.make(todo.createdOn) }),
      modifiedOn: Timestamp.make(todo.modifiedOn)
    }
  })

const uploadTodoDescription = (
  client: HulyClient["Service"],
  objectClass: Ref<Class<HulyToDo>>,
  todoId: Ref<HulyToDo>,
  description: string | undefined
): Effect.Effect<HulyToDo["description"], HulyClientError> =>
  Effect.gen(function* () {
    if (description === undefined || description.trim() === "") return ""
    const rendered = renderMarkdownPreservingNativeReferences(description, client.markupUrlConfig)
    const ref = yield* client.uploadMarkup(objectClass, todoId, "description", rendered.markup, rendered.format)
    return markupRefAsTodoDescription(ref)
  })

type TodoPayload = Omit<AttachedData<HulyToDo>, "attachedSpace"> & { readonly attachedSpace?: Ref<Space> }

const todoPayload = (
  params: CreateTodoParams,
  owner: Ref<Employee>,
  description: HulyToDo["description"],
  rank: TodoRank,
  defaultVisibility: TodoVisibility
): TodoPayload => {
  const data: TodoPayload = {
    workslots: 0,
    title: params.title,
    description,
    priority: stringToTodoPriority(params.priority ?? DEFAULT_TODO_PRIORITY),
    visibility: stringToTodoVisibility(params.visibility ?? defaultVisibility),
    user: owner,
    doneOn: null,
    rank
  }
  if (params.dueDate !== undefined) data.dueDate = params.dueDate
  return data
}

const createTodoRecord = Effect.fn("Planner.createTodoRecord")(function* <T extends HulyToDo, P extends Doc>(
  client: HulyClient["Service"],
  target: { readonly objectClass: Ref<Class<T>>; readonly attachedTo: Ref<P>; readonly attachedToClass: Ref<Class<P>> },
  data: AttachedData<T>,
  todoId: Ref<T>
): Effect.fn.Return<void, HulyClientError> {
  yield* client
    .addCollection(
      target.objectClass,
      time.space.ToDos,
      target.attachedTo,
      target.attachedToClass,
      "todos",
      data,
      todoId
    )
    .pipe(Effect.asVoid)
})

export const listTodos = (
  params: ListTodosParams
): Effect.Effect<Array<TodoSummary>, PlannerLookupError, HulyClient | Diagnostics> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const owner = params.owner === undefined ? undefined : yield* resolveTodoOwner(client, params.owner)
    const attachment =
      params.issue !== undefined
        ? yield* resolveTodoAttachment(client, { type: "issue", ...params.issue })
        : params.document !== undefined
          ? yield* resolveTodoAttachment(client, { type: "document", ...params.document })
          : undefined
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
    const filtered =
      titleSearch === undefined ? todos : todos.filter((todo) => todo.title.toLowerCase().includes(titleSearch))
    const emailMap = yield* batchGetEmailsForPersons(client, uniqueTodoOwnerIds(filtered))
    const documentMetadata = yield* documentMetadataForTodos(client, filtered)
    return filtered.map((todo) => todoSummary(todo, emailMap, documentMetadata))
  })

export const getTodo = (
  params: GetTodoParams
): Effect.Effect<TodoDetail, PlannerLookupError, HulyClient | Diagnostics> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const todo = yield* findTodo(client, params.locator)
    return yield* detailFromTodo(client, todo)
  })

export const createTodo = (params: CreateTodoParams): Effect.Effect<CreateTodoResult, PlannerLookupError, HulyClient> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const owner = yield* resolveTodoOwner(client, params.owner)
    const attachment = yield* resolveTodoAttachment(client, params.attachedTo, { requireWritable: true })
    const rank = yield* latestOpenTodoRank(client, owner)

    if (attachment.type === "issue") {
      const todoId: Ref<HulyProjectToDo> = generateId()
      const description = yield* uploadTodoDescription(client, time.class.ProjectToDo, todoId, params.description)
      const data = {
        ...todoPayload(params, owner, description, rank, DEFAULT_ISSUE_TODO_VISIBILITY),
        attachedSpace: attachment.issue.space
      } satisfies AttachedData<HulyProjectToDo>
      yield* createTodoRecord(
        client,
        {
          objectClass: time.class.ProjectToDo,
          attachedTo: attachment.attachedTo,
          attachedToClass: attachment.attachedToClass
        },
        data,
        todoId
      )
      return { todoId: TodoId.make(todoId) }
    }

    if (attachment.type === "document") {
      const todoId: Ref<HulyToDo> = generateId()
      const description = yield* uploadTodoDescription(client, time.class.ToDo, todoId, params.description)
      const data = {
        ...todoPayload(params, owner, description, rank, DEFAULT_DOCUMENT_TODO_VISIBILITY),
        attachedSpace: toRef<Space>(attachment.document.space)
      } satisfies AttachedData<HulyToDo>
      yield* createTodoRecord(
        client,
        {
          objectClass: time.class.ToDo,
          attachedTo: attachment.attachedTo,
          attachedToClass: attachment.attachedToClass
        },
        data,
        todoId
      )
      return { todoId: TodoId.make(todoId) }
    }

    const todoId: Ref<HulyToDo> = generateId()
    const description = yield* uploadTodoDescription(client, time.class.ToDo, todoId, params.description)
    yield* createTodoRecord(
      client,
      { objectClass: time.class.ToDo, attachedTo: time.ids.NotAttached, attachedToClass: time.class.ToDo },
      todoPayload(params, owner, description, rank, DEFAULT_PERSONAL_TODO_VISIBILITY),
      todoId
    )
    return { todoId: TodoId.make(todoId) }
  })

export const updateTodo = (
  params: UpdateTodoParams
): Effect.Effect<TodoMutationResult, PlannerMutationError, HulyClient> =>
  Effect.gen(function* () {
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
      yield* Effect.gen(function* () {
        if (params.description === undefined) return {}
        if (params.description === null || params.description.trim() === "") return { description: "" }
        const rendered = renderMarkdownPreservingNativeReferences(params.description, client.markupUrlConfig)
        if (todo.description) {
          yield* client.updateMarkup(time.class.ToDo, todo._id, "description", rendered.markup, rendered.format)
          return {}
        }
        const ref = yield* client.uploadMarkup(
          time.class.ToDo,
          todo._id,
          "description",
          rendered.markup,
          rendered.format
        )
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
  Effect.gen(function* () {
    const client = yield* HulyClient
    const todo = yield* findTodo(client, params.locator)
    const doneOn = params.doneOn ?? (yield* Clock.currentTimeMillis)
    yield* client.updateDoc(time.class.ToDo, todo.space, todo._id, { doneOn })
    return { todoId: TodoId.make(todo._id), updated: true }
  })

export const reopenTodo = (
  params: ReopenTodoParams
): Effect.Effect<TodoMutationResult, PlannerMutationError, HulyClient> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const todo = yield* findTodo(client, params.locator, "completed")
    yield* client.updateDoc(time.class.ToDo, todo.space, todo._id, { doneOn: null })
    return { todoId: TodoId.make(todo._id), updated: true }
  })

export const deleteTodo = (
  params: DeleteTodoParams
): Effect.Effect<DeleteTodoResult, PlannerMutationError, HulyClient> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const todo = yield* findTodo(client, params.locator)
    if (todo.attachedToClass === tracker.class.Issue && todo.attachedTo !== time.ids.NotAttached) {
      yield* client.removeDoc(time.class.ProjectToDo, todo.space, toRef<HulyProjectToDo>(todo._id))
      yield* decrementIssueTodoCounter(client, todo)
    } else {
      yield* client.removeDoc(time.class.ToDo, todo.space, todo._id)
    }
    return { todoId: TodoId.make(todo._id), deleted: true }
  })

const decrementIssueTodoCounter = (
  client: HulyClient["Service"],
  todo: HulyToDo
): Effect.Effect<void, HulyClientError> =>
  client
    .updateDoc(
      toRef<Class<TodoableParent>>(tracker.class.Issue),
      todo.attachedSpace ?? todo.space,
      toRef<TodoableParent>(todo.attachedTo),
      { $inc: { todos: -1 } }
    )
    .pipe(Effect.asVoid)

export const scheduleTodo = (
  params: ScheduleTodoParams
): Effect.Effect<ScheduleTodoResult, HulyDomainError, HulyClient> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const todo = yield* findTodo(client, params.locator)
    const description = yield* descriptionForTodo(client, todo)
    const result = yield* createPlannerWorkSlot({
      todoId: TodoId.make(todo._id),
      todoClass: todo._class,
      date: params.date,
      dueDate: params.dueDate,
      title: todoTitleOrFallback(todo.title),
      description: description ?? "",
      visibility: todo.visibility
    })
    return { todoId: TodoId.make(todo._id), workSlotId: result.slotId }
  })

const removeWorkSlot = (client: HulyClient["Service"], slot: HulyWorkSlot): Effect.Effect<void, HulyClientError> =>
  Effect.gen(function* () {
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
      yield* decrementTodoWorkSlotCounter(client, slot)
    }
  })

const decrementTodoWorkSlotCounter = (
  client: HulyClient["Service"],
  slot: HulyWorkSlot
): Effect.Effect<void, HulyClientError> =>
  client
    .updateDoc(
      toRef<Class<WorkSlottedTodo>>(time.class.ToDo),
      time.space.ToDos,
      toRef<WorkSlottedTodo>(slot.attachedTo),
      { $inc: { workslots: -1 } }
    )
    .pipe(Effect.asVoid)

export const unscheduleTodo = (
  params: UnscheduleTodoParams
): Effect.Effect<UnscheduleTodoResult, PlannerMutationError, HulyClient> =>
  Effect.gen(function* () {
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

    const query =
      params.scope === "future"
        ? hulyQuery<HulyWorkSlot>({
            attachedTo: todo._id,
            date: { $gte: params.from ?? (yield* Clock.currentTimeMillis) }
          })
        : hulyQuery<HulyWorkSlot>({ attachedTo: todo._id })
    const slots = yield* client.findAll<HulyWorkSlot>(time.class.WorkSlot, query)
    yield* Effect.all(slots.map((slot) => removeWorkSlot(client, slot)))
    return { todoId: TodoId.make(todo._id), removed: Count.make(slots.length) }
  })
