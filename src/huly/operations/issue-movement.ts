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
  const selected = yield* selectMovementContext(client, root, params)
  if (selected.status === "refused") return refusal(selected.reason, root)
  const { parent, source, destination } = selected
  if (satisfiedConsent(root, parent, source, destination, params))
    return refusal(
      "Destination is already satisfied. Omit resolutions and inspect the complete tree for a verified no-op; supplied consent must not be reused.",
      root
    )
  return yield* transferIssue(client, root, parent, source, destination, params)
})

// Internal selection proof; boundary project/issue schemas own every selected snapshot.
type MovementSelection =
  | { readonly status: "refused"; readonly reason: string }
  | {
      readonly status: "ready"
      readonly parent: MovementPlan["parent"]
      readonly source: MovementPlan["source"]
      readonly destination: MovementPlan["source"]
    }
const selectRequestedParent = Effect.fn("movement.selectRequestedParent")(function* (
  client: HulyClient["Service"],
  params: MoveIssueParams
): Effect.fn.Return<MovementPlan["parent"], MovementError> {
  const selector = params.destination.parent
  return selector === undefined || selector === null ? undefined : yield* selectMovementIssue(client, selector)
})
const selectRequestedProject = Effect.fn("movement.selectRequestedProject")(function* (
  client: HulyClient["Service"],
  params: MoveIssueParams
): Effect.fn.Return<MovementPlan["source"] | undefined, MovementError> {
  return params.destination.project === undefined
    ? undefined
    : yield* selectMovementProject(client, params.destination.project)
})
const selectMovementContext = Effect.fn("movement.selectContext")(function* (
  client: HulyClient["Service"],
  root: MovementPlan["root"],
  params: MoveIssueParams
): Effect.fn.Return<MovementSelection, MovementError> {
  const parent = yield* selectRequestedParent(client, params)
  const project = yield* selectRequestedProject(client, params)
  const problem = movementDestinationProblem(root, parent, project, params)
  if (problem !== undefined) return { status: "refused", reason: problem }
  const source = yield* selectMovementProject(client, ProjectIdentifier.make(root.space))
  if (source === undefined)
    return { status: "refused", reason: "Source project selector must match exactly one project." }
  const destination =
    parent === undefined
      ? (project ?? source)
      : yield* selectMovementProject(client, ProjectIdentifier.make(parent.space))
  if (destination === undefined) return { status: "refused", reason: "Destination project metadata is unavailable." }
  return { status: "ready", parent, source, destination }
})
const satisfiedConsent = (
  root: MovementPlan["root"],
  parent: MovementPlan["parent"],
  source: MovementPlan["source"],
  destination: MovementPlan["source"],
  params: MoveIssueParams
) =>
  destination._id === source._id &&
  root.attachedTo === (parent?._id ?? movementNoParent) &&
  params.resolutions !== undefined
