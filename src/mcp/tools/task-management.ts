import {
  createIssueStatusParamsJsonSchema,
  createTaskTypeParamsJsonSchema,
  getProjectTypeParamsJsonSchema,
  listProjectTypesParamsJsonSchema,
  listTaskTypesParamsJsonSchema,
  parseCreateIssueStatusParams,
  parseCreateTaskTypeParams,
  parseGetProjectTypeParams,
  parseListProjectTypesParams,
  parseListTaskTypesParams
} from "../../domain/schemas.js"
import {
  createIssueStatus,
  createTaskType,
  getProjectType,
  listProjectTypes,
  listTaskTypes
} from "../../huly/operations/task-management.js"
import { createToolHandler, type RegisteredTool } from "./registry.js"

const CATEGORY = "task-management" as const

export const taskManagementTools: ReadonlyArray<RegisteredTool> = [
  {
    name: "list_project_types",
    description:
      "List Huly tracker project types/workflow templates. Returns ID, display name, descriptor, task type count, status count, and whether the type appears to be the default Classic tracker type.",
    category: CATEGORY,
    inputSchema: listProjectTypesParamsJsonSchema,
    handler: createToolHandler("list_project_types", parseListProjectTypesParams, listProjectTypes)
  },
  {
    name: "get_project_type",
    description:
      "Inspect one Huly tracker project type in a single call. Accepts projectType as ID or display name; when omitted, uses the unambiguous Classic tracker type. Returns task types, statuses, categories, and task-type-to-status mappings.",
    category: CATEGORY,
    inputSchema: getProjectTypeParamsJsonSchema,
    handler: createToolHandler("get_project_type", parseGetProjectTypeParams, getProjectType)
  },
  {
    name: "list_task_types",
    description:
      "List Huly issue/task types. Optionally filter by projectType ID or display name. Returns task type identity, parent project type, kind, issue class, and available status count.",
    category: CATEGORY,
    inputSchema: listTaskTypesParamsJsonSchema,
    handler: createToolHandler("list_task_types", parseListTaskTypesParams, listTaskTypes)
  },
  {
    name: "create_task_type",
    description:
      "Add a Huly issue/task type to a project type idempotently by normalized name. Copies required workflow configuration from an existing template task type unless templateTaskType is supplied. Returns created, IDs, affected task type IDs, and a workspace-level workflow warning.",
    category: CATEGORY,
    inputSchema: createTaskTypeParamsJsonSchema,
    annotations: { idempotentHint: true },
    handler: createToolHandler("create_task_type", parseCreateTaskTypeParams, createTaskType)
  },
  {
    name: "create_issue_status",
    description:
      "Add a Huly issue workflow status idempotently by normalized name within a project type and task type scope. Accepts category as backlog, todo, active, done, or canceled; taskType may be ID or display name, and omission applies the status to every task type in the project type.",
    category: CATEGORY,
    inputSchema: createIssueStatusParamsJsonSchema,
    annotations: { idempotentHint: true },
    handler: createToolHandler("create_issue_status", parseCreateIssueStatusParams, createIssueStatus)
  }
]
