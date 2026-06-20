import {
  deleteRelatedIssueSpaceTargetParamsJsonSchema,
  DeleteRelatedIssueSpaceTargetResultSchema,
  listRelatedIssueTargetsParamsJsonSchema,
  ListRelatedIssueTargetsResultSchema,
  parseDeleteRelatedIssueSpaceTargetParams,
  parseListRelatedIssueTargetsParams,
  parseSetRelatedIssueTargetParams,
  setRelatedIssueTargetParamsJsonSchema,
  SetRelatedIssueTargetResultSchema
} from "../../domain/schemas/related-issue-targets.js"
import {
  deleteRelatedIssueSpaceTarget,
  listRelatedIssueTargets,
  setRelatedIssueTarget
} from "../../huly/operations/related-issue-targets.js"
import { defineTool, type RegisteredTool } from "./registry.js"

const CATEGORY = "issues" as const

export const relatedIssueTargetTools: ReadonlyArray<RegisteredTool> = [
  defineTool(
    {
      name: "list_related_issue_targets",
      description:
        "List rules that choose the default destination project for related issues. A spaceRule says related issues from one space default to targetProject. A classRule says related issues for one object class default to targetProject. targetProject is a project identifier, or null for no default destination project.",
      category: CATEGORY,
      inputSchema: listRelatedIssueTargetsParamsJsonSchema,
      resultSchema: ListRelatedIssueTargetsResultSchema
    },
    parseListRelatedIssueTargetsParams,
    listRelatedIssueTargets
  ),
  defineTool(
    {
      name: "set_related_issue_target",
      description:
        "Set the default destination project for related issues from a space or object class. For space, creates or updates a spaceRule. For objectClass, only updates an existing classRule; this tool never creates classRule targets. Pass targetProject as a project identifier, or null to clear the default destination project.",
      category: CATEGORY,
      inputSchema: setRelatedIssueTargetParamsJsonSchema,
      resultSchema: SetRelatedIssueTargetResultSchema
    },
    parseSetRelatedIssueTargetParams,
    setRelatedIssueTarget
  ),
  defineTool(
    {
      name: "delete_related_issue_space_target",
      description:
        "Delete the spaceRule that chooses the default destination project for related issues from one space. This only deletes spaceRule targets; classRule deletion is intentionally unsupported because class rules may be model-provided.",
      category: CATEGORY,
      inputSchema: deleteRelatedIssueSpaceTargetParamsJsonSchema,
      resultSchema: DeleteRelatedIssueSpaceTargetResultSchema
    },
    parseDeleteRelatedIssueSpaceTargetParams,
    deleteRelatedIssueSpaceTarget
  )
]
