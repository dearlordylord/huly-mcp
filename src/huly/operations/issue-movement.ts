import type { Issue as SdkIssue, Project as SdkProject } from "@hcengineering/tracker"
import { Effect, Schedule } from "effect"

import type { MoveIssueParams } from "../../domain/schemas/issue-movement.js"
import type { MoveIssueResult } from "../../domain/schemas/issues-results.js"
import { DocId, IssueId, ProjectIdentifier, UrlString } from "../../domain/schemas/shared.js"
import { HulyClient } from "../client.js"
import { toRef } from "./sdk-boundary.js"
import { tracker } from "../huly-plugins.js"
import {
  descendantsOf,
  hierarchyProblem,
  type MovementHierarchy,
  movementNoParent
} from "./issue-movement-hierarchy.js"
import {
  inspectMovementClosure,
  inspectMovementPlan,
  inspectMovementProject,
  movementDestinationProblem,
  type MovementError,
  type MovementPlan,
  selectMovementIssue,
  selectMovementProject
} from "./issue-movement-preflight.js"

const VERIFY_ATTEMPTS = 5

// Internal verification proof carrying the root read from the verified snapshot.
interface VerifiedMovement {
  readonly hierarchy: MovementHierarchy
  readonly root: MovementPlan["root"]
}
const issueIds = (plan: MovementPlan) => plan.tree.map((issue) => IssueId.make(issue._id))
const inspection = (plan: MovementPlan) =>
  `Inspect current state before any retry: ${plan.tree
    .map(
      (issue) =>
        `MCP get_issue ${JSON.stringify({ project: plan.source.identifier, identifier: issue.identifier })}; CLI huly issues get ${plan.source.identifier} ${issue.identifier}`
    )
    .join("; ")}. Do not automatically repeat movement.`

const refusal = (reason: string, root?: Effect.Success<ReturnType<typeof selectMovementIssue>>): MoveIssueResult => ({
  outcome: "blocked",
  changed: false,
  reason,
  issueIds: root === undefined ? [] : [IssueId.make(root._id)],
  inspection:
    "Use MCP list_projects {} to obtain the project identifier, then MCP list_issues with that project identifier to inspect the reported stable issue IDs. Do not automatically repeat movement."
})

const executeMove = Effect.fn("movement.execute")(function* (
  client: HulyClient["Service"],
  plan: MovementPlan
): Effect.fn.Return<void, MovementError> {
  const { parent, root, tree } = plan
  yield* client.updateDoc(tracker.class.Issue, toRef<SdkProject>(root.space), toRef<SdkIssue>(root._id), {
    attachedTo: parent === undefined ? tracker.ids.NoParent : toRef<SdkIssue>(parent._id)
  })
  for (const child of tree.filter((issue) => issue._id !== root._id)) {
    yield* client.updateDoc(tracker.class.Issue, toRef<SdkProject>(child.space), toRef<SdkIssue>(child._id), {
      attachedTo: toRef<SdkIssue>(child.attachedTo)
    })
  }
  if (root.attachedTo !== movementNoParent) {
    yield* client.updateDoc(tracker.class.Issue, toRef<SdkProject>(root.space), toRef<SdkIssue>(root.attachedTo), {
      $inc: { subIssues: -1 }
    })
  }
  if (parent !== undefined) {
    yield* client.updateDoc(tracker.class.Issue, toRef<SdkProject>(root.space), toRef<SdkIssue>(parent._id), {
      $inc: { subIssues: 1 }
    })
  }
})

const verifyMove = Effect.fn("movement.verify")(function* (
  client: HulyClient["Service"],
  plan: MovementPlan
): Effect.fn.Return<VerifiedMovement | undefined, MovementError> {
  const hierarchy = yield* inspectMovementProject(client, plan.root)
  const target = plan.parent?._id ?? movementNoParent
  if (hierarchy === undefined) return undefined
  const observedRoot = hierarchy.byId.get(plan.root._id)
  if (observedRoot === undefined) return undefined
  if (observedRoot.attachedTo !== target) return undefined
  const treeIsPreserved = verificationMatches(plan, hierarchy, observedRoot)
  if (!treeIsPreserved) return undefined
  const closureProblem = yield* inspectMovementClosure(client, hierarchy, plan.relevant)
  return closureProblem === undefined ? { hierarchy, root: observedRoot } : undefined
})

const uncertain = (outcome: "incomplete" | "indeterminate", reason: string, plan: MovementPlan): MoveIssueResult => ({
  outcome,
  reason,
  issueIds: issueIds(plan),
  inspection: inspection(plan)
})

const completeMove = (
  plan: MovementPlan,
  verified: VerifiedMovement,
  client: HulyClient["Service"]
): MoveIssueResult => {
  const noOp = plan.root.attachedTo === (plan.parent?._id ?? movementNoParent)
  return {
    ...(noOp ? ({ outcome: "no-op", changed: false } as const) : ({ outcome: "completed", changed: true } as const)),
    issueId: IssueId.make(plan.root._id),
    projectId: DocId.make(plan.root.space),
    parentId: plan.parent === undefined ? null : IssueId.make(plan.parent._id),
    tasks: descendantsOf(verified.hierarchy, verified.root).map((issue) => ({
      issueId: IssueId.make(issue._id),
      previousIdentifier: issue.identifier,
      identifier: issue.identifier,
      url: UrlString.make(
        `${client.workbenchUrlConfig.baseUrl.replace(/\/+$/, "")}/workbench/${client.workbenchUrlConfig.workspaceUrlSlug}/tracker/${encodeURIComponent(issue.identifier)}`
      ),
      parentId: issue.attachedTo === movementNoParent ? null : IssueId.make(issue.attachedTo)
    }))
  }
}

const runMovementPlan = Effect.fn("movement.runPlan")(function* (
  client: HulyClient["Service"],
  plan: MovementPlan
): Effect.fn.Return<MoveIssueResult, MovementError> {
  const noOp = plan.root.attachedTo === (plan.parent?._id ?? movementNoParent)
  if (!noOp) {
    const execution = yield* Effect.result(executeMove(client, plan))
    if (execution._tag === "Failure")
      return uncertain("indeterminate", "A move write failed; some writes may have occurred.", plan)
  }
  const verification = yield* verifyMove(client, plan).pipe(
    Effect.repeat({
      schedule: Schedule.spaced("200 millis"),
      times: VERIFY_ATTEMPTS - 1,
      while: (value) => value === undefined
    }),
    Effect.result
  )
  if (verification._tag === "Failure")
    return uncertain("indeterminate", "Verification failed; inspect current state.", plan)
  return verification.success === undefined
    ? uncertain("incomplete", "Observed hierarchy did not satisfy the destination after bounded verification.", plan)
    : completeMove(plan, verification.success, client)
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
  const plan = yield* inspectMovementPlan(client, root, parent, source)
  return typeof plan === "string" ? refusal(plan, root) : yield* runMovementPlan(client, plan)
})

const treePreserved = (plan: MovementPlan, hierarchy: MovementHierarchy, root: MovementPlan["root"]) => {
  const currentTree = descendantsOf(hierarchy, root)
  if (currentTree.length !== plan.tree.length) return false
  return plan.tree.every((previous) => {
    const current = hierarchy.byId.get(previous._id)
    if (current === undefined || current.space !== previous.space || current.identifier !== previous.identifier)
      return false
    return previous._id === plan.root._id || current.attachedTo === previous.attachedTo
  })
}

const verificationMatches = (plan: MovementPlan, hierarchy: MovementHierarchy, root: MovementPlan["root"]) =>
  treePreserved(plan, hierarchy, root) &&
  plan.relevant.every((previous) => {
    const issue = hierarchy.byId.get(previous._id)
    return issue !== undefined && hierarchyProblem(hierarchy, issue) === undefined
  })
