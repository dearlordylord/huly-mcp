import { Effect } from "effect"
import type { MoveIssueParams } from "../../domain/schemas/issue-movement.js"
import type { MoveIssueResult } from "../../domain/schemas/issues-results.js"
import { ProjectIdentifier } from "../../domain/schemas/shared.js"
import { HulyClient } from "../client.js"
import {
  movementDestinationProblem,
  type MovementError,
  type MovementPlan,
  selectMovementIssue,
  selectMovementProject
} from "./issue-movement-preflight.js"
import { movementNoParent } from "./issue-movement-hierarchy.js"
import { transferIssue } from "./issue-transfer.js"

const refusal = (reason: string, root?: MovementPlan["root"]): MoveIssueResult => ({
  outcome: "blocked",
  changed: false,
  reason,
  issueIds: root === undefined ? [] : [root._id],
  inspection:
    root === undefined
      ? "Use MCP list_projects {} to obtain a project identifier, then MCP list_issues with that project to inspect tasks. Do not automatically repeat movement."
      : `Inspect MCP get_issue ${JSON.stringify({ project: root.space, identifier: root._id })} or CLI huly issues get ${root.space} ${root._id} --json. Do not automatically repeat movement.`
})

export const moveIssue = Effect.fn("moveIssue")(function* (
  params: MoveIssueParams
): Effect.fn.Return<MoveIssueResult, MovementError, HulyClient> {
  const client = yield* HulyClient
  const root = yield* selectMovementIssue(client, params.issue)
  if (root === undefined) return refusal("Issue selector must match exactly one issue.")
  const parentSelector = params.destination.parent
  const parent =
    parentSelector === undefined || parentSelector === null
      ? undefined
      : yield* selectMovementIssue(client, parentSelector)
  const project =
    params.destination.project === undefined
      ? undefined
      : yield* selectMovementProject(client, params.destination.project)
  const problem = movementDestinationProblem(root, parent, project, params)
  if (problem !== undefined) return refusal(problem, root)
  const source = yield* selectMovementProject(client, ProjectIdentifier.make(root.space))
  if (source === undefined) return refusal("Source project selector must match exactly one project.", root)
  const destination =
    parent === undefined
      ? (project ?? source)
      : yield* selectMovementProject(client, ProjectIdentifier.make(parent.space))
  if (destination === undefined) return refusal("Destination project metadata is unavailable.", root)
  if (
    destination._id === source._id &&
    root.attachedTo === (parent?._id ?? movementNoParent) &&
    params.resolutions !== undefined
  )
    return refusal(
      "Destination is already satisfied. Omit resolutions and inspect the complete tree for a verified no-op; supplied consent must not be reused.",
      root
    )
  return yield* transferIssue(client, root, parent, source, destination, params)
})
