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
  CreateProjectResultSchema,
  DeleteProjectResultSchema,
  GetProjectResultSchema,
  ListProjectsResultSchema,
  ListStatusesResultSchema,
  UpdateProjectResultSchema
} from "../../domain/schemas/projects.js"
import {
  createProject,
  deleteProject,
  getProject,
  listProjects,
  listStatuses,
  updateProject
} from "../../huly/operations/projects.js"
import { defineTool, type RegisteredTool } from "./registry.js"

const CATEGORY = "projects" as const

export const projectTools: ReadonlyArray<RegisteredTool> = [
  defineTool(
    {
      name: "list_projects",
      description: "List all Huly projects. Returns projects sorted by name. Supports filtering by archived status.",
      category: CATEGORY,
      inputSchema: listProjectsParamsJsonSchema,
      resultSchema: ListProjectsResultSchema
    },
    parseListProjectsParams,
    listProjects
  ),
  defineTool(
    {
      name: "get_project",
      description:
        "Get full details of a Huly project including its statuses. Returns project name, description, archived flag, default status, and all available statuses.",
      category: CATEGORY,
      inputSchema: getProjectParamsJsonSchema,
      resultSchema: GetProjectResultSchema
    },
    parseGetProjectParams,
    getProject
  ),
  defineTool(
    {
      name: "list_statuses",
      description:
        "List all issue statuses for a Huly project with workflow category and default info. Returns status name, category, and isDefault. Use this to discover valid statuses before creating or updating issues.",
      category: CATEGORY,
      inputSchema: listStatusesParamsJsonSchema,
      resultSchema: ListStatusesResultSchema
    },
    parseListStatusesParams,
    listStatuses
  ),
  defineTool(
    {
      name: "create_project",
      description:
        "Create a new Huly tracker project. Idempotent: returns existing project if one with the same identifier already exists (created=false). Identifier must be 1-5 uppercase alphanumeric chars starting with a letter.",
      category: CATEGORY,
      inputSchema: createProjectParamsJsonSchema,
      resultSchema: CreateProjectResultSchema
    },
    parseCreateProjectParams,
    createProject
  ),
  defineTool(
    {
      name: "update_project",
      description: "Update a Huly project. Only provided fields are modified. Set description to null to clear it.",
      category: CATEGORY,
      inputSchema: updateProjectParamsJsonSchema,
      resultSchema: UpdateProjectResultSchema
    },
    parseUpdateProjectParams,
    updateProject
  ),
  defineTool(
    {
      name: "delete_project",
      description:
        "Permanently delete a Huly project. All issues, milestones, and components in this project will be orphaned. This action cannot be undone.",
      category: CATEGORY,
      inputSchema: deleteProjectParamsJsonSchema,
      resultSchema: DeleteProjectResultSchema
    },
    parseDeleteProjectParams,
    deleteProject
  )
]
