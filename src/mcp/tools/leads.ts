import {
  createLeadParamsJsonSchema,
  CreateLeadResultSchema,
  deleteLeadParamsJsonSchema,
  DeleteLeadResultSchema,
  getLeadParamsJsonSchema,
  GetLeadResultSchema,
  listFunnelsParamsJsonSchema,
  ListFunnelsResultSchema,
  listLeadsParamsJsonSchema,
  ListLeadsResultSchema,
  parseCreateLeadParams,
  parseDeleteLeadParams,
  parseGetLeadParams,
  parseListFunnelsParams,
  parseListLeadsParams,
  parseMoveLeadParams,
  parseUpdateLeadParams,
  moveLeadParamsJsonSchema,
  MoveLeadResultSchema,
  updateLeadParamsJsonSchema,
  LeadMutationResultSchema
} from "../../domain/schemas/leads.js"
import {
  createFunnelParamsJsonSchema,
  CreateFunnelResultSchema,
  deleteFunnelParamsJsonSchema,
  DeleteFunnelResultSchema,
  FunnelDetailSchema,
  funnelMutationParamsJsonSchema,
  FunnelMutationResultSchema,
  getFunnelParamsJsonSchema,
  parseCreateFunnelParams,
  parseDeleteFunnelParams,
  parseFunnelMutationParams,
  parseGetFunnelParams,
  parseUpdateFunnelParams,
  updateFunnelParamsJsonSchema
} from "../../domain/schemas/funnels.js"
import { createLead } from "../../huly/operations/leads-create.js"
import { deleteLead, moveLead, updateLead } from "../../huly/operations/leads-mutations.js"
import {
  archiveFunnel,
  createFunnel,
  deleteFunnel,
  getFunnel,
  listFunnels,
  updateFunnel
} from "../../huly/operations/funnels.js"
import { getLead, listLeads } from "../../huly/operations/leads.js"
import { defineHulyWorkspaceTool, defineTool, type RegisteredTool } from "./registry.js"

const CATEGORY = "leads" as const

export const leadTools = [
  defineTool(
    {
      name: "list_funnels",
      description:
        "List all Huly sales funnels (lead pipelines). Returns each funnel's stable ID and display name, sorted by name. Supports filtering by archived status.",
      category: CATEGORY,
      inputSchema: listFunnelsParamsJsonSchema,
      resultSchema: ListFunnelsResultSchema
    },
    parseListFunnelsParams,
    listFunnels
  ),
  defineTool(
    {
      name: "get_funnel",
      description:
        "Get one funnel by stable _id or exact name. Ambiguous names are rejected. Returns the full stable Funnel/Project projection, validated Lead workflow, content counts, deletion impact, and explicit unsupported-field classifications.",
      category: CATEGORY,
      inputSchema: getFunnelParamsJsonSchema,
      resultSchema: FunnelDetailSchema
    },
    parseGetFunnelParams,
    getFunnel
  ),
  defineHulyWorkspaceTool(
    {
      name: "create_funnel",
      description:
        "Create a native Huly funnel after validating its Funnel project type, Lead task types, workflow statuses, membership, and owners. Full description accepts Markdown and preserves current-workspace native references. Creation is idempotent only for one exact existing name; the result explicitly reports whether that existing funnel is archived, and ambiguous names are rejected.",
      category: CATEGORY,
      inputSchema: createFunnelParamsJsonSchema,
      resultSchema: CreateFunnelResultSchema
    },
    parseCreateFunnelParams,
    createFunnel
  ),
  defineHulyWorkspaceTool(
    {
      name: "update_funnel",
      description:
        "Update a funnel resolved by stable _id or exact unambiguous name. Validates the existing Funnel project type/workflow and membership before mutation. Null clears description or fullDescription; Markdown native references are preserved.",
      category: CATEGORY,
      inputSchema: updateFunnelParamsJsonSchema,
      resultSchema: FunnelMutationResultSchema
    },
    parseUpdateFunnelParams,
    updateFunnel
  ),
  defineTool(
    {
      name: "archive_funnel",
      description:
        "Archive a funnel without deleting it. Returns lead/comment/attachment impact so the caller can assess the hidden native content. Already archived funnels are an idempotent no-op.",
      category: CATEGORY,
      inputSchema: funnelMutationParamsJsonSchema,
      resultSchema: FunnelMutationResultSchema
    },
    parseFunnelMutationParams,
    archiveFunnel
  ),
  defineTool(
    {
      name: "delete_funnel",
      description:
        "Permanently delete an exact funnel only after it is archived and empty. First call get_funnel or archive_funnel, then pass the observed impact counts as expectedLeads, expectedComments, and expectedAttachments. Deletion fails if any count changed after that preflight snapshot.",
      category: CATEGORY,
      inputSchema: deleteFunnelParamsJsonSchema,
      resultSchema: DeleteFunnelResultSchema
    },
    parseDeleteFunnelParams,
    deleteFunnel
  ),
  defineTool(
    {
      name: "list_leads",
      description:
        "Query Huly leads in a funnel with optional filters. Pass the funnel ID returned by list_funnels, or a funnel name for convenience lookup. Returns leads sorted by modification date (newest first). Supports filtering by status, assignee, and title search.",
      category: CATEGORY,
      inputSchema: listLeadsParamsJsonSchema,
      resultSchema: ListLeadsResultSchema
    },
    parseListLeadsParams,
    listLeads
  ),
  defineTool(
    {
      name: "get_lead",
      description:
        "Retrieve full details for a Huly lead including markdown description, customer name, funnel ID and funnel name, and status. Lead identifiers follow the upstream Huly format like 'LEAD-1'.",
      category: CATEGORY,
      inputSchema: getLeadParamsJsonSchema,
      resultSchema: GetLeadResultSchema
    },
    parseGetLeadParams,
    getLead
  ),
  defineTool(
    {
      name: "create_lead",
      description:
        "Create one native Huly lead in an active funnel for an existing person or organization. Resolve the funnel by ID or exact name; identify the customer explicitly as person or organization; optionally choose an employee assignee, a workflow status matched exactly after normalization (trimmed, case-insensitive, and ignoring spaces, hyphens, and underscores), and Markdown description. Automatically applies the Customer mixin when needed, preserves native Huly references, and returns both leadId and LEAD-<number>. This tool never creates a person or organization inline.",
      category: CATEGORY,
      inputSchema: createLeadParamsJsonSchema,
      resultSchema: CreateLeadResultSchema
    },
    parseCreateLeadParams,
    createLead
  ),
  defineTool(
    {
      name: "update_lead",
      description:
        "Update a native Huly lead by funnel ID or exact name and LEAD-<number> identifier. Supported fields are title, Markdown description, a workflow status matched exactly after normalization (trimmed, case-insensitive, and ignoring spaces, hyphens, and underscores), employee assignee, start date, due date, and Customer mixin description. Omitted fields are unchanged; pass null explicitly to clear description, assignee, dates, or customer description. Existing people are resolved exactly and ambiguous identifiers fail.",
      category: CATEGORY,
      inputSchema: updateLeadParamsJsonSchema,
      resultSchema: LeadMutationResultSchema
    },
    parseUpdateLeadParams,
    updateLead
  ),
  defineTool(
    {
      name: "move_lead",
      description:
        "Move a native Huly lead to another active funnel after validating both native Funnel project types and Lead workflows. Pass a destination status matched exactly after normalization (trimmed, case-insensitive, and ignoring spaces, hyphens, and underscores), or omit status to map the current status name; incompatible or ambiguous mappings fail without writing.",
      category: CATEGORY,
      inputSchema: moveLeadParamsJsonSchema,
      resultSchema: MoveLeadResultSchema
    },
    parseMoveLeadParams,
    moveLead
  ),
  defineTool(
    {
      name: "delete_lead",
      description:
        "Preview native lead deletion impact by default. The preview reads authoritative comment, attachment, and label relation counts. To permanently delete, pass execute=true together with the exact counts returned by the preview; deletion fails if impact changed.",
      category: CATEGORY,
      inputSchema: deleteLeadParamsJsonSchema,
      resultSchema: DeleteLeadResultSchema
    },
    parseDeleteLeadParams,
    deleteLead
  )
] as const satisfies ReadonlyArray<RegisteredTool>
