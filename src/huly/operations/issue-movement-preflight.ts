import type { Issue as SdkIssue, Project as SdkProject } from "@hcengineering/tracker"
import {
  type MovementIssue as Issue,
  type MovementProject as Project,
  parseMovementIssue,
  parseMovementProject
} from "../../domain/schemas/issue-movement-state.js"
import { HulyDataInvalidError } from "../errors-base.js"
import { Effect } from "effect"

import type { MoveIssueParams } from "../../domain/schemas/issue-movement.js"
import { type IssueIdentifier, type ProjectIdentifier } from "../../domain/schemas/shared.js"
import type { HulyClient, HulyClientError } from "../client.js"
import { tracker } from "../huly-plugins.js"
import {
  ancestorsOf,
  descendantsOf,
  hierarchyProblem,
  type MovementHierarchy,
  movementHierarchy
} from "./issue-movement-hierarchy.js"
import { hulyQuery } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"

const DISCOVERY_LIMIT = 10_001
export type MovementError = HulyClientError | HulyDataInvalidError

// Internal operation plan; boundary snapshots are parsed separately and the plan is not serialized.
export interface MovementPlan {
  readonly root: Issue
  readonly parent: Issue | undefined
  readonly source: Project
  readonly tree: ReadonlyArray<Issue>
  readonly relevant: ReadonlyArray<Issue>
}

export const selectMovementIssue = Effect.fn("movement.selectIssue")(function* (
  client: HulyClient["Service"],
  selector: IssueIdentifier
): Effect.fn.Return<Issue | undefined, MovementError> {
  const matches = yield* client.findAll<SdkIssue>(tracker.class.Issue, hulyQuery<SdkIssue>({ identifier: selector }), {
    limit: DISCOVERY_LIMIT
  })
  const stableMatches = yield* client.findAll<SdkIssue>(
    tracker.class.Issue,
    hulyQuery<SdkIssue>({ _id: toRef<SdkIssue>(selector) }),
    { limit: DISCOVERY_LIMIT }
  )
  if (matches.total > matches.length || stableMatches.total > stableMatches.length) return undefined
  const unique = new Map([...matches, ...stableMatches].map((issue) => [issue._id, issue]))
  const selected = unique.size === 1 ? [...unique.values()][0] : undefined
  return selected?._id === toRef<SdkIssue>(selector) || selected?.identifier === selector
    ? yield* parseIssueState(selected)
    : undefined
})

export const selectMovementProject = Effect.fn("movement.selectProject")(function* (
  client: HulyClient["Service"],
  selector: ProjectIdentifier
): Effect.fn.Return<Project | undefined, MovementError> {
  const matches = yield* client.findAll<SdkProject>(
    tracker.class.Project,
    hulyQuery<SdkProject>({ identifier: selector }),
    { limit: DISCOVERY_LIMIT }
  )
  const stableMatches = yield* client.findAll<SdkProject>(
    tracker.class.Project,
    hulyQuery<SdkProject>({ _id: toRef<SdkProject>(selector) }),
    { limit: DISCOVERY_LIMIT }
  )
  if (matches.total > matches.length || stableMatches.total > stableMatches.length) return undefined
  const unique = new Map([...matches, ...stableMatches].map((project) => [project._id, project]))
  const selected = unique.size === 1 ? [...unique.values()][0] : undefined
  return selected?._id === toRef<SdkProject>(selector) || selected?.identifier === selector
    ? yield* parseProjectState(selected)
    : undefined
})

export const inspectMovementProject = Effect.fn("movement.inspectProject")(function* (
  client: HulyClient["Service"],
  root: Issue
): Effect.fn.Return<MovementHierarchy | undefined, MovementError> {
  const issues = yield* client.findAll<SdkIssue>(
    tracker.class.Issue,
    hulyQuery<SdkIssue>({ space: toRef<SdkProject>(root.space) }),
    { limit: DISCOVERY_LIMIT }
  )
  if (issues.length >= DISCOVERY_LIMIT || issues.total > issues.length) return undefined
  if (new Set(issues.map((issue) => issue._id)).size !== issues.length) return undefined
  return movementHierarchy(yield* Effect.forEach(issues, parseIssueState))
})

const missingSelectorProblem = (
  parent: Issue | undefined,
  project: Project | undefined,
  params: MoveIssueParams
): string | undefined => {
  const parentSelector = params.destination.parent
  if (parentSelector !== undefined && parentSelector !== null && parent === undefined) {
    return "Parent selector must match exactly one issue."
  }
  return params.destination.project !== undefined && project === undefined
    ? "Project selector must match exactly one project."
    : undefined
}

export const movementDestinationProblem = (
  root: Issue,
  parent: Issue | undefined,
  project: Project | undefined,
  params: MoveIssueParams
): string | undefined => {
  const missing = missingSelectorProblem(parent, project, params)
  if (missing !== undefined) return missing
  if (parent !== undefined && project !== undefined && parent.space !== project._id)
    return "Project and parent disagree."
  const destinationSpace = movementSpace(root, parent, project)
  if (destinationSpace !== root.space) return "Cross-project execution is unavailable in this slice."
  return params.resolutions !== undefined
    ? "Resolutions are cross-project-only decisions. Omit resolutions for same-project movement, including no-ops."
    : undefined
}

export const inspectMovementPlan = Effect.fn("movement.inspectPlan")(function* (
  client: HulyClient["Service"],
  root: Issue,
  parent: Issue | undefined,
  source: Project
): Effect.fn.Return<MovementPlan | string, MovementError> {
  const hierarchy = yield* inspectMovementProject(client, root)
  if (hierarchy === undefined) return "Incomplete or duplicate project discovery; safety limit may have been exceeded."
  const observedRoot = hierarchy.byId.get(root._id)
  if (observedRoot === undefined) return "Root changed during inspection."
  const snapshotProblem = inspectedSnapshotProblem(root, observedRoot, parent, hierarchy)
  if (snapshotProblem !== undefined) return snapshotProblem
  const tree = descendantsOf(hierarchy, observedRoot)
  const relevant = [...tree, ...(ancestorsOf(hierarchy, observedRoot) ?? []), ...parentHierarchy(hierarchy, parent)]
  const inconsistent = relevant
    .map((issue) => hierarchyProblem(hierarchy, issue))
    .find((reason) => reason !== undefined)
  if (inconsistent !== undefined) return inconsistent
  const closureProblem = yield* inspectMovementClosure(client, hierarchy, relevant)
  return closureProblem ?? { root: observedRoot, parent, source, tree, relevant }
})

const parentHierarchy = (hierarchy: ReturnType<typeof movementHierarchy>, parent: Issue | undefined) =>
  parent === undefined ? [] : [parent, ...(ancestorsOf(hierarchy, parent) ?? [])]

const movementSpace = (root: Issue, parent: Issue | undefined, project: Project | undefined) =>
  parent?.space ?? project?._id ?? root.space

export const inspectMovementClosure = Effect.fn("movement.inspectClosure")(function* (
  client: HulyClient["Service"],
  hierarchy: ReturnType<typeof movementHierarchy>,
  relevant: ReadonlyArray<Issue>
): Effect.fn.Return<string | undefined, MovementError> {
  const closure = yield* client.findAll<SdkIssue>(
    tracker.class.Issue,
    hulyQuery<SdkIssue>({ attachedTo: { $in: relevant.map((issue) => toRef<SdkIssue>(issue._id)) } }),
    { limit: DISCOVERY_LIMIT }
  )
  if (closure.total > closure.length || closure.length >= DISCOVERY_LIMIT) return "Descendant discovery is incomplete."
  const observed = yield* Effect.forEach(closure, parseIssueState)
  const expected = hierarchy.issues.filter((issue) => relevant.some((parent) => parent._id === issue.attachedTo))
  if (observed.length !== expected.length) return "Child closure changed or discovery is incomplete."
  return observed.every((issue) => closureIssueMatches(hierarchy, issue))
    ? undefined
    : "Foreign-project or changed child; inspect hierarchy."
})

const closureIssueMatches = (hierarchy: ReturnType<typeof movementHierarchy>, observed: Issue) => {
  const previous = hierarchy.byId.get(observed._id)
  return (
    previous !== undefined &&
    previous.attachedTo === observed.attachedTo &&
    previous.space === observed.space &&
    previous.modifiedOn === observed.modifiedOn
  )
}

const inspectedSnapshotProblem = (
  root: Issue,
  observedRoot: Issue,
  parent: Issue | undefined,
  hierarchy: ReturnType<typeof movementHierarchy>
) => {
  if (observedRoot.modifiedOn !== root.modifiedOn) return "Root changed during inspection."
  if (parent === undefined) return undefined
  const observedParent = hierarchy.byId.get(parent._id)
  if (observedParent === undefined || observedParent.modifiedOn !== parent.modifiedOn)
    return "Destination parent changed during inspection."
  return descendantsOf(hierarchy, observedRoot).some((issue) => issue._id === parent._id)
    ? "Destination cannot be the root or a descendant."
    : undefined
}

const parseIssueState = (input: SdkIssue | undefined) =>
  parseMovementIssue(input).pipe(
    Effect.mapError((cause) => new HulyDataInvalidError({ operation: "move_issue", entity: "issue hierarchy", cause }))
  )
const parseProjectState = (input: SdkProject | undefined) =>
  parseMovementProject(input).pipe(
    Effect.mapError((cause) => new HulyDataInvalidError({ operation: "move_issue", entity: "project", cause }))
  )
