import {
  createMilestoneParamsJsonSchema,
  deleteMilestoneParamsJsonSchema,
  getMilestoneParamsJsonSchema,
  listMilestonesParamsJsonSchema,
  parseCreateMilestoneParams,
  parseDeleteMilestoneParams,
  parseGetMilestoneParams,
  parseListMilestonesParams,
  parseSetIssueMilestoneParams,
  parseUpdateMilestoneParams,
  setIssueMilestoneParamsJsonSchema,
  updateMilestoneParamsJsonSchema
} from "../../domain/schemas.js"
import {
  CreateMilestoneResultSchema,
  DeleteMilestoneResultSchema,
  GetMilestoneResultSchema,
  ListMilestonesResultSchema,
  SetIssueMilestoneResultSchema,
  UpdateMilestoneResultSchema
} from "../../domain/schemas/milestones.js"
import {
  createMilestone,
  deleteMilestone,
  getMilestone,
  listMilestones,
  setIssueMilestone,
  updateMilestone
} from "../../huly/operations/milestones.js"
import { defineTool, type RegisteredTool } from "./registry.js"

const CATEGORY = "milestones" as const

export const milestoneTools: ReadonlyArray<RegisteredTool> = [
  defineTool(
    {
      name: "list_milestones",
      description: "List milestones in a Huly project. Returns milestones sorted by modification date (newest first).",
      category: CATEGORY,
      inputSchema: listMilestonesParamsJsonSchema,
      resultSchema: ListMilestonesResultSchema
    },
    parseListMilestonesParams,
    listMilestones
  ),
  defineTool(
    {
      name: "get_milestone",
      description: "Retrieve full details for a Huly milestone. Use this to view milestone content and metadata.",
      category: CATEGORY,
      inputSchema: getMilestoneParamsJsonSchema,
      resultSchema: GetMilestoneResultSchema
    },
    parseGetMilestoneParams,
    getMilestone
  ),
  defineTool(
    {
      name: "create_milestone",
      description: "Create a new milestone in a Huly project. Returns the created milestone ID and label.",
      category: CATEGORY,
      inputSchema: createMilestoneParamsJsonSchema,
      resultSchema: CreateMilestoneResultSchema
    },
    parseCreateMilestoneParams,
    createMilestone
  ),
  defineTool(
    {
      name: "update_milestone",
      description: "Update fields on an existing Huly milestone. Only provided fields are modified.",
      category: CATEGORY,
      inputSchema: updateMilestoneParamsJsonSchema,
      resultSchema: UpdateMilestoneResultSchema
    },
    parseUpdateMilestoneParams,
    updateMilestone
  ),
  defineTool(
    {
      name: "set_issue_milestone",
      description: "Set or clear the milestone on a Huly issue. Pass null for milestone to clear it.",
      category: CATEGORY,
      inputSchema: setIssueMilestoneParamsJsonSchema,
      resultSchema: SetIssueMilestoneResultSchema
    },
    parseSetIssueMilestoneParams,
    setIssueMilestone
  ),
  defineTool(
    {
      name: "delete_milestone",
      description: "Permanently delete a Huly milestone. This action cannot be undone.",
      category: CATEGORY,
      inputSchema: deleteMilestoneParamsJsonSchema,
      resultSchema: DeleteMilestoneResultSchema
    },
    parseDeleteMilestoneParams,
    deleteMilestone
  )
]
