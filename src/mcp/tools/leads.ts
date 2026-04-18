import {
  getLeadParamsJsonSchema,
  listFunnelsParamsJsonSchema,
  listLeadsParamsJsonSchema,
  parseGetLeadParams,
  parseListFunnelsParams,
  parseListLeadsParams
} from "../../domain/schemas/leads.js"
import { getLead, listFunnels, listLeads } from "../../huly/operations/leads.js"
import { createToolHandler, type RegisteredTool } from "./registry.js"

const CATEGORY = "leads" as const

export const leadTools: ReadonlyArray<RegisteredTool> = [
  {
    name: "list_funnels",
    description:
      "List all Huly sales funnels (lead pipelines). Returns funnels sorted by name. Supports filtering by archived status.",
    category: CATEGORY,
    inputSchema: listFunnelsParamsJsonSchema,
    handler: createToolHandler(
      "list_funnels",
      parseListFunnelsParams,
      listFunnels
    )
  },
  {
    name: "list_leads",
    description:
      "Query Huly leads in a funnel with optional filters. Returns leads sorted by modification date (newest first). Supports filtering by status, assignee, and title search.",
    category: CATEGORY,
    inputSchema: listLeadsParamsJsonSchema,
    handler: createToolHandler(
      "list_leads",
      parseListLeadsParams,
      listLeads
    )
  },
  {
    name: "get_lead",
    description:
      "Retrieve full details for a Huly lead including markdown description, customer name, and status. Use this to view lead content and metadata.",
    category: CATEGORY,
    inputSchema: getLeadParamsJsonSchema,
    handler: createToolHandler(
      "get_lead",
      parseGetLeadParams,
      getLead
    )
  }
]
