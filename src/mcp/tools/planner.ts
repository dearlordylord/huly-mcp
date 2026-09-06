import {
  completeTodoParamsJsonSchema,
  createTodoParamsJsonSchema,
  CreateTodoResultSchema,
  DEFAULT_LIMIT,
  deleteTodoParamsJsonSchema,
  DeleteTodoResultSchema,
  getTodoParamsJsonSchema,
  HULY_NATIVE_REFERENCE_MARKDOWN_INPUT,
  listTodosParamsJsonSchema,
  parseCompleteTodoParams,
  parseCreateTodoParams,
  parseDeleteTodoParams,
  parseGetTodoParams,
  parseListTodosParams,
  parseReopenTodoParams,
  parseScheduleTodoParams,
  parseUnscheduleTodoParams,
  parseUpdateTodoParams,
  reopenTodoParamsJsonSchema,
  scheduleTodoParamsJsonSchema,
  ScheduleTodoResultSchema,
  TodoDetailSchema,
  unscheduleTodoParamsJsonSchema,
  UnscheduleTodoResultSchema,
  updateTodoParamsJsonSchema
} from "../../domain/schemas.js"
import {
  CompleteTodoResultSchema,
  ListTodosResultSchema,
  ReopenTodoResultSchema,
  UpdateTodoResultSchema
} from "../../domain/schemas/planner.js"
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
} from "../../huly/operations/planner.js"
import { defineTool, type RegisteredTool } from "./registry.js"
const CATEGORY = "planner" as const
export const plannerTools = [
  defineTool(
    {
      name: "list_todos",
      description: `List Huly Planner ToDos. Empty input returns up to ${DEFAULT_LIMIT} ToDos in planner order with all completion states. Use owner, issue, document, title, due date, priority, visibility, or completion filters to narrow results. Issue and document filters cannot be combined.`,
      category: CATEGORY,
      inputSchema: listTodosParamsJsonSchema,
      resultSchema: ListTodosResultSchema
    },
    parseListTodosParams,
    listTodos
  ),
  defineTool(
    {
      name: "get_todo",
      description:
        "Get one Planner ToDo by raw todoId or by a human locator such as issue + title + owner or attachedTo.type=document with teamspace/document + title. Returns stable ToDo fields, owner, attachment context, description, labels count, and work slot count.",
      category: CATEGORY,
      inputSchema: getTodoParamsJsonSchema,
      resultSchema: TodoDetailSchema
    },
    parseGetTodoParams,
    getTodo
  ),
  defineTool(
    {
      name: "create_todo",
      description:
        "Create a Planner ToDo. Omit attachedTo for a personal ToDo, pass attachedTo.type=issue with project and identifier for an issue action item, or pass attachedTo.type=document with teamspace and document names or IDs for a document action item. Document ToDos are private by default. Omit owner to use the authenticated user. Description supports markdown. " +
        HULY_NATIVE_REFERENCE_MARKDOWN_INPUT,
      category: CATEGORY,
      inputSchema: createTodoParamsJsonSchema,
      resultSchema: CreateTodoResultSchema
    },
    parseCreateTodoParams,
    createTodo
  ),
  defineTool(
    {
      name: "update_todo",
      description:
        "Update a Planner ToDo by human locator or raw todoId. Human locators can target an issue or document attachment. Supports title, markdown description, owner, dueDate including null to clear, priority, and visibility. " +
        HULY_NATIVE_REFERENCE_MARKDOWN_INPUT,
      category: CATEGORY,
      inputSchema: updateTodoParamsJsonSchema,
      resultSchema: UpdateTodoResultSchema
    },
    parseUpdateTodoParams,
    updateTodo
  ),
  defineTool(
    {
      name: "complete_todo",
      description:
        "Complete a Planner ToDo by raw todoId or human locator, including a document attachment locator, by setting doneOn. Huly may trim future work slots and run issue automation when the ToDo is attached to an issue.",
      category: CATEGORY,
      inputSchema: completeTodoParamsJsonSchema,
      resultSchema: CompleteTodoResultSchema
    },
    parseCompleteTodoParams,
    completeTodo
  ),
  defineTool(
    {
      name: "reopen_todo",
      description:
        "Reopen a completed Planner ToDo by raw todoId or human locator, including a document attachment locator, by clearing doneOn. Human locators search completed ToDos by default; raw todoId locators target that exact ToDo.",
      category: CATEGORY,
      inputSchema: reopenTodoParamsJsonSchema,
      resultSchema: ReopenTodoResultSchema
    },
    parseReopenTodoParams,
    reopenTodo
  ),
  defineTool(
    {
      name: "delete_todo",
      description:
        "Delete a Planner ToDo by raw todoId or human locator, including a document attachment locator. This is destructive; deleting the last open issue ToDo can cause Huly classic issue status automation, while document ToDos do not change issue counters.",
      category: CATEGORY,
      inputSchema: deleteTodoParamsJsonSchema,
      annotations: { destructiveHint: true, idempotentHint: true },
      resultSchema: DeleteTodoResultSchema
    },
    parseDeleteTodoParams,
    deleteTodo
  ),
  defineTool(
    {
      name: "schedule_todo",
      description:
        "Schedule a Planner ToDo by raw todoId or human locator, including a document attachment locator. Creates a Planner-visible blocking work slot on the authenticated user's personal calendar, owned by their primary social identity and including them as a participant. Fails actionably when the identity, employee, or writable calendar prerequisite is unavailable.",
      category: CATEGORY,
      inputSchema: scheduleTodoParamsJsonSchema,
      resultSchema: ScheduleTodoResultSchema
    },
    parseScheduleTodoParams,
    scheduleTodo
  ),
  defineTool(
    {
      name: "unschedule_todo",
      description:
        "Remove ToDo work slots. Pass either workSlotId to remove one slot, or a raw ToDo ID/human locator (including a document attachment locator) with scope=all or scope=future and optional from.",
      category: CATEGORY,
      inputSchema: unscheduleTodoParamsJsonSchema,
      annotations: { destructiveHint: true, idempotentHint: true },
      resultSchema: UnscheduleTodoResultSchema
    },
    parseUnscheduleTodoParams,
    unscheduleTodo
  )
] as const satisfies ReadonlyArray<RegisteredTool>
