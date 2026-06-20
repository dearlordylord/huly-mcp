import {
  completeTodoParamsJsonSchema,
  createTodoParamsJsonSchema,
  CreateTodoResultSchema,
  DEFAULT_LIMIT,
  deleteTodoParamsJsonSchema,
  DeleteTodoResultSchema,
  getTodoParamsJsonSchema,
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
export const plannerTools: ReadonlyArray<RegisteredTool> = [
  defineTool(
    {
      name: "list_todos",
      description:
        `List Huly Planner ToDos. Empty input returns up to ${DEFAULT_LIMIT} ToDos in planner order with all completion states. Use owner, issue, title, due date, priority, visibility, or completion filters to narrow results.`,
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
        "Get one Planner ToDo by raw todoId or by human locator such as issue + title + owner. Returns stable ToDo fields, owner, attachment context, description, labels count, and work slot count.",
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
        "Create a Planner ToDo. Omit attachedTo for a personal ToDo, or pass attachedTo.type=issue with project and identifier for an issue action item. Omit owner to use the authenticated user.",
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
        "Update a Planner ToDo by human locator or raw todoId. Supports title, markdown description, owner, dueDate including null to clear, priority, and visibility.",
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
        "Complete a Planner ToDo by setting doneOn. Huly may trim future work slots and run issue automation when the ToDo is attached to an issue.",
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
        "Reopen a completed Planner ToDo by clearing doneOn. Human locators search completed ToDos by default; raw todoId locators target that exact ToDo.",
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
        "Delete a Planner ToDo. This is destructive; deleting the last open issue ToDo can cause Huly classic issue status automation.",
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
        "Schedule a Planner ToDo by raw todoId or human locator, creating a work slot with ToDo title, description, and visibility metadata.",
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
        "Remove ToDo work slots. Pass either workSlotId to remove one slot, locator with scope=all, or locator with scope=future and optional from.",
      category: CATEGORY,
      inputSchema: unscheduleTodoParamsJsonSchema,
      annotations: { destructiveHint: true, idempotentHint: true },
      resultSchema: UnscheduleTodoResultSchema
    },
    parseUnscheduleTodoParams,
    unscheduleTodo
  )
]
