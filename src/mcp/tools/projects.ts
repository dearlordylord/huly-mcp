import {
  createProjectParamsJsonSchema,
  deleteProjectParamsJsonSchema,
  getProjectParamsJsonSchema,
  listProjectsParamsJsonSchema,
  listStatusesParamsJsonSchema,
  parseCreateProjectParams,
  parseDeleteProjectParams,
  parseGetProjectParams,
  parseListProjectsParams,
  parseListStatusesParams,
  parseUpdateProjectParams,
  updateProjectParamsJsonSchema
} from "../../domain/schemas.js"
import {
  createProject,
  deleteProject,
  getProject,
  listProjects,
  listStatuses,
  updateProject
} from "../../huly/operations/projects.js"
import { createToolHandler, type RegisteredTool } from "./registry.js"

const CATEGORY = "projects" as const

export const projectTools: ReadonlyArray<RegisteredTool> = [
  {
    name: "list_projects",
    description: "List all Huly projects. Returns projects sorted by name. Supports filtering by archived status.",
    category: CATEGORY,
    inputSchema: listProjectsParamsJsonSchema,
    handler: createToolHandler(
      "list_projects",
      parseListProjectsParams,
      listProjects
    )
  },
  {
    name: "get_project",
    description:
      "Get full details of a Huly project including its statuses. Returns project name, description, archived flag, default status, and all available statuses.",
    category: CATEGORY,
    inputSchema: getProjectParamsJsonSchema,
    handler: createToolHandler(
      "get_project",
      parseGetProjectParams,
      getProject
    )
  },
  {
    name: "list_statuses",
    description:
      "List all issue statuses for a Huly project with category info. Returns status name, isDone, isCanceled, and isDefault flags. Use this to discover valid statuses before creating or updating issues.",
    category: CATEGORY,
    inputSchema: listStatusesParamsJsonSchema,
    handler: createToolHandler(
      "list_statuses",
      parseListStatusesParams,
      listStatuses
    )
  },
  {
    name: "create_project",
    description:
      "Create a new Huly tracker project. Idempotent: returns existing project if one with the same identifier already exists (created=false). Identifier must be 1-5 uppercase alphanumeric chars starting with a letter.",
    category: CATEGORY,
    inputSchema: createProjectParamsJsonSchema,
    handler: createToolHandler(
      "create_project",
      parseCreateProjectParams,
      createProject
    )
  },
  {
    name: "update_project",
    description: "Update a Huly project. Only provided fields are modified. Set description to null to clear it.",
    category: CATEGORY,
    inputSchema: updateProjectParamsJsonSchema,
    handler: createToolHandler(
      "update_project",
      parseUpdateProjectParams,
      updateProject
    )
  },
  {
    name: "delete_project",
    description:
      "Permanently delete a Huly project. All issues, milestones, and components in this project will be orphaned. This action cannot be undone.",
    category: CATEGORY,
    inputSchema: deleteProjectParamsJsonSchema,
    handler: createToolHandler(
      "delete_project",
      parseDeleteProjectParams,
      deleteProject
    )
  }
]
