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
  parseListTaskTypesParams,
  StatusCategoryValues
} from "../../domain/schemas.js"
import { enumValuesDescription } from "../../domain/schemas/shared.js"
import {
  CreateIssueStatusResultSchema,
  CreateTaskTypeResultSchema,
  GetProjectTypeResultSchema,
  ListProjectTypesResultSchema,
  ListTaskTypesResultSchema
} from "../../domain/schemas/task-management.js"
import {
  createIssueStatus,
  createTaskType,
  getProjectType,
  listProjectTypes,
  listTaskTypes
} from "../../huly/operations/task-management.js"
import { defineTool, type RegisteredTool } from "./registry.js"

const CATEGORY = "task-management" as const

export const taskManagementTools: ReadonlyArray<RegisteredTool> = [
  defineTool(
    {
      name: "list_project_types",
      description:
        "List Huly tracker project types/workflow templates. Returns ID, display name, descriptor, task type count, status count, and whether the type appears to be the default Classic tracker type.",
      category: CATEGORY,
      inputSchema: listProjectTypesParamsJsonSchema,
      resultSchema: ListProjectTypesResultSchema
    },
    parseListProjectTypesParams,
    listProjectTypes
  ),
  defineTool(
    {
      name: "get_project_type",
      description:
        "Inspect one Huly tracker project type in a single call. Accepts projectType as ID or display name; when omitted, uses the unambiguous Classic tracker type. Returns task types, statuses, categories, and task-type-to-status mappings.",
      category: CATEGORY,
      inputSchema: getProjectTypeParamsJsonSchema,
      resultSchema: GetProjectTypeResultSchema
    },
    parseGetProjectTypeParams,
    getProjectType
  ),
  defineTool(
    {
      name: "list_task_types",
      description:
        "List Huly issue/task types. Optionally filter by projectType ID or display name. Returns task type identity, parent project type, kind, issue class, and available status count.",
      category: CATEGORY,
      inputSchema: listTaskTypesParamsJsonSchema,
      resultSchema: ListTaskTypesResultSchema
    },
    parseListTaskTypesParams,
    listTaskTypes
  ),
  defineTool(
    {
      name: "create_task_type",
      description:
        "Add a Huly issue/task type to a project type idempotently by normalized name. Copies required workflow configuration from an existing template task type unless templateTaskType is supplied. Returns created, IDs, affected task type IDs, and a workspace-level workflow warning.",
      category: CATEGORY,
      inputSchema: createTaskTypeParamsJsonSchema,
      annotations: { idempotentHint: true },
      resultSchema: CreateTaskTypeResultSchema
    },
    parseCreateTaskTypeParams,
    createTaskType
  ),
  defineTool(
    {
      name: "create_issue_status",
      description:
        `Add a Huly issue workflow status idempotently by normalized name within a project type and task type scope. Accepts category as a Huly SDK task.statusCategory key: ${
          enumValuesDescription(StatusCategoryValues)
        }; taskType may be ID or display name, and omission applies the status to every task type in the project type.`,
      category: CATEGORY,
      inputSchema: createIssueStatusParamsJsonSchema,
      annotations: { idempotentHint: true },
      resultSchema: CreateIssueStatusResultSchema
    },
    parseCreateIssueStatusParams,
    createIssueStatus
  )
]
