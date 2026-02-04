import { listProjectsParamsJsonSchema, parseListProjectsParams } from "../../domain/schemas.js"
import { listProjects } from "../../huly/operations/projects.js"
import { createToolHandler, type RegisteredTool } from "./registry.js"

const CATEGORY = "Projects" as const

export const projectTools: ReadonlyArray<RegisteredTool> = [
  {
    name: "list_projects",
    description: "List all Huly projects. Returns projects sorted by name. Supports filtering by archived status.",
    category: CATEGORY,
    inputSchema: listProjectsParamsJsonSchema,
    handler: createToolHandler(
      "list_projects",
      parseListProjectsParams,
      (params) => listProjects(params)
    )
  }
]
