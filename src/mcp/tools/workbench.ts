import {
  listWorkbenchApplicationsParamsJsonSchema,
  ListWorkbenchApplicationsResultSchema,
  parseListWorkbenchApplicationsParams
} from "../../domain/schemas/workbench.js"
import { listWorkbenchApplications } from "../../huly/operations/workbench.js"
import { defineTool, type RegisteredTool } from "./registry.js"

const CATEGORY = "workbench" as const

export const workbenchTools = [
  defineTool(
    {
      name: "list_workbench_applications",
      description:
        "List read-only Huly Workbench application model declarations by exact URL alias or case-insensitive alias substring. Returns untranslated labelId values, static model flags, the authenticated account's caller-scoped hiddenByPreference state, and summarized declarative space/special/group navigation without executing components, resource callbacks, or query builders. Legacy space-navigation entries without a stable id are omitted with an agent-visible warning. Application presence is not proof that a plugin, integration provider, worker, API, role, permission, or effective browser visibility is enabled. Personal tabs, active browser state, widgets, widget tabs/preferences, and all Workbench mutations are intentionally unsupported because they are private or browser-local and lack a reliable human-readable agent workflow.",
      category: CATEGORY,
      inputSchema: listWorkbenchApplicationsParamsJsonSchema,
      resultSchema: ListWorkbenchApplicationsResultSchema
    },
    parseListWorkbenchApplicationsParams,
    listWorkbenchApplications
  )
] as const satisfies ReadonlyArray<RegisteredTool>
