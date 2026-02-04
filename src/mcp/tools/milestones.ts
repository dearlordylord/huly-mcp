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
  createMilestone,
  deleteMilestone,
  getMilestone,
  listMilestones,
  setIssueMilestone,
  updateMilestone
} from "../../huly/operations/milestones.js"
import { createToolHandler, type RegisteredTool } from "./registry.js"

export const milestoneTools: ReadonlyArray<RegisteredTool> = [
  {
    name: "list_milestones",
    description: "List milestones in a Huly project. Returns milestones sorted by modification date (newest first).",
    inputSchema: listMilestonesParamsJsonSchema,
    handler: createToolHandler(
      "list_milestones",
      parseListMilestonesParams,
      (params) => listMilestones(params)
    )
  },
  {
    name: "get_milestone",
    description: "Retrieve full details for a Huly milestone. Use this to view milestone content and metadata.",
    inputSchema: getMilestoneParamsJsonSchema,
    handler: createToolHandler(
      "get_milestone",
      parseGetMilestoneParams,
      (params) => getMilestone(params)
    )
  },
  {
    name: "create_milestone",
    description: "Create a new milestone in a Huly project. Returns the created milestone ID and label.",
    inputSchema: createMilestoneParamsJsonSchema,
    handler: createToolHandler(
      "create_milestone",
      parseCreateMilestoneParams,
      (params) => createMilestone(params)
    )
  },
  {
    name: "update_milestone",
    description: "Update fields on an existing Huly milestone. Only provided fields are modified.",
    inputSchema: updateMilestoneParamsJsonSchema,
    handler: createToolHandler(
      "update_milestone",
      parseUpdateMilestoneParams,
      (params) => updateMilestone(params)
    )
  },
  {
    name: "set_issue_milestone",
    description: "Set or clear the milestone on a Huly issue. Pass null for milestone to clear it.",
    inputSchema: setIssueMilestoneParamsJsonSchema,
    handler: createToolHandler(
      "set_issue_milestone",
      parseSetIssueMilestoneParams,
      (params) => setIssueMilestone(params)
    )
  },
  {
    name: "delete_milestone",
    description: "Permanently delete a Huly milestone. This action cannot be undone.",
    inputSchema: deleteMilestoneParamsJsonSchema,
    handler: createToolHandler(
      "delete_milestone",
      parseDeleteMilestoneParams,
      (params) => deleteMilestone(params)
    )
  }
]
