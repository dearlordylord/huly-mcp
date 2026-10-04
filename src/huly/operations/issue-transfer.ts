import type { Issue, Project } from "@hcengineering/tracker"
import { SortingOrder } from "@hcengineering/core"
import { makeRank } from "@hcengineering/rank"
import { Effect, Schedule, Schema } from "effect"
import type { MoveIssueParams } from "../../domain/schemas/issue-movement.js"
import type { MovementIssue, MovementProject } from "../../domain/schemas/issue-movement-state.js"
import { TransferSequenceSchema, type TransferWrite } from "../../domain/schemas/issue-transfer.js"
import type { MoveIssueResult } from "../../domain/schemas/issues-results.js"
import { DocId, IssueId, IssueIdentifier, NonEmptyString, UrlString } from "../../domain/schemas/shared.js"
import type { HulyClient } from "../client.js"
import { core, tracker } from "../huly-plugins.js"
import { movementNoParent } from "./issue-movement-hierarchy.js"
import { type MovementError, type MovementPlan } from "./issue-movement-preflight.js"
import { inspectTransferPlan, type TransferPlan } from "./issue-transfer-preflight.js"
import { verifyTransfer } from "./issue-transfer-verification.js"
import { hulyQuery } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"

const guidance = (root: MovementIssue, source: MovementProject, destination: MovementProject) =>
  `Inspect stable ID with MCP get_issue ${JSON.stringify({ project: source.identifier, identifier: root._id })} or CLI huly issues get ${source.identifier} ${root._id} --json. Stable-ID lookup searches the workspace even if its project changed. Also inspect MCP get_issue ${JSON.stringify({ project: destination.identifier, identifier: root._id })}. Do not automatically repeat movement; sequence gaps may remain.`

const failure = (
  outcome: "incomplete" | "indeterminate",
  reason: string,
  plan: MovementPlan,
  destination: MovementProject
): MoveIssueResult => ({
  outcome,
  reason,
  issueIds: [plan.root._id],
  inspection: guidance(plan.root, plan.source, destination)
})

export const transferIssue = Effect.fn("transferIssue")(function* (
  client: HulyClient["Service"],
  root: MovementIssue,
  parent: MovementIssue | undefined,
  source: MovementProject,
  destination: MovementProject,
  params: MoveIssueParams
): Effect.fn.Return<MoveIssueResult, MovementError> {
  const inspection = guidance(root, source, destination)
  const preparedResult = yield* Effect.result(inspectTransferPlan(client, root, parent, source, destination, params))
  if (preparedResult._tag === "Failure")
    return {
      outcome: "blocked",
      changed: false,
      reason: `Pre-write inspection failed: ${preparedResult.failure.message}`,
      issueIds: [root._id],
      inspection
    }
  const prepared = preparedResult.success
  if ("conflicts" in prepared)
    return {
      outcome: "blocked",
      changed: false,
      reason: `${prepared.conflicts.map((entry) => entry.reason).join(" ")} ${prepared.limitation}`,
      conflicts: prepared.conflicts,
      destinationId: destination._id,
      issueIds: [root._id],
      inspection
    }
  return yield* executeTransfer(client, prepared, destination)
})

const executeTransfer = Effect.fn("transfer.execute")(function* (
  client: HulyClient["Service"],
  prepared: TransferPlan,
  destination: MovementProject
): Effect.fn.Return<MoveIssueResult, MovementError> {
  const { plan } = prepared
  const { parent, root, source } = plan
  const inspection = guidance(root, source, destination)
  const commit = client.commitTransfer
  if (commit === undefined)
    return {
      outcome: "blocked",
      changed: false,
      reason: "Transfer commit adapter unavailable.",
      issueIds: [root._id],
      inspection
    }
  const last = yield* Effect.result(
    client.findOne<Issue>(tracker.class.Issue, hulyQuery<Issue>({ space: toRef<Project>(destination._id) }), {
      sort: { rank: SortingOrder.Descending }
    })
  )
  if (last._tag === "Failure")
    return {
      outcome: "blocked",
      changed: false,
      reason: "Destination ordering inspection failed before writes.",
      issueIds: [root._id],
      inspection
    }
  const allocation = yield* Effect.result(
    client.updateDoc(
      tracker.class.Project,
      core.space.Space,
      toRef<Project>(destination._id),
      { $inc: { sequence: 1 } },
      true
    )
  )
  if (allocation._tag === "Failure")
    return failure(
      "indeterminate",
      "Sequence allocation response unavailable; allocation may have occurred. Task move was not sent.",
      plan,
      destination
    )
  const sequence = Schema.decodeUnknownOption(TransferSequenceSchema)(allocation.success)
  if (sequence._tag === "None")
    return failure(
      "indeterminate",
      "Sequence result unavailable or invalid; allocation may have occurred. Task move was not sent.",
      plan,
      destination
    )
  const write: TransferWrite = {
    issueId: root._id,
    sourceId: source._id,
    destinationId: destination._id,
    previousParent: root.attachedTo,
    parentId: parent?._id ?? movementNoParent,
    modifiedOn: root.modifiedOn,
    number: sequence.value.object.sequence,
    identifier: IssueIdentifier.make(`${destination.identifier}-${sequence.value.object.sequence}`),
    rank: NonEmptyString.make(makeRank(last.success?.rank, undefined)),
    records: prepared.records.records
  }
  return yield* commitAndVerify(client, prepared, destination, write, commit)
})

const commitAndVerify = Effect.fn("transfer.commitAndVerify")(function* (
  client: HulyClient["Service"],
  prepared: TransferPlan,
  destination: MovementProject,
  write: TransferWrite,
  commit: NonNullable<HulyClient["Service"]["commitTransfer"]>
): Effect.fn.Return<MoveIssueResult, MovementError> {
  const { plan } = prepared
  const { parent, root } = plan
  const committed = yield* Effect.result(commit(write))
  if (committed._tag === "Failure")
    return failure(
      "indeterminate",
      "Commit response unavailable; movement effects may have occurred. Number was reserved and may leave a gap.",
      plan,
      destination
    )
  if (committed.success === "condition-not-met")
    return failure(
      "incomplete",
      "SDK refused commit conditions after sequence allocation. Number reservation is an effect and may leave a gap; inspect before retry.",
      plan,
      destination
    )
  const verified = yield* verifyTransfer(client, prepared, destination, write).pipe(
    Effect.repeat({ schedule: Schedule.spaced("200 millis"), times: 4, while: (value) => value === undefined }),
    Effect.result
  )
  if (verified._tag === "Failure")
    return failure("indeterminate", "Post-send state unavailable; inspect before retry.", plan, destination)
  if (verified.success === undefined)
    return failure(
      "incomplete",
      "Observed movement state remained inconsistent after bounded verification.",
      plan,
      destination
    )
  return {
    outcome: "completed",
    changed: true,
    issueId: root._id,
    projectId: DocId.make(destination._id),
    parentId: parent?._id ?? null,
    tasks: [
      {
        issueId: IssueId.make(root._id),
        previousIdentifier: root.identifier,
        identifier: IssueIdentifier.make(verified.success.identifier),
        parentId: verified.success.attachedTo === movementNoParent ? null : verified.success.attachedTo,
        url: UrlString.make(
          `${client.workbenchUrlConfig.baseUrl.replace(/\/+$/, "")}/workbench/${client.workbenchUrlConfig.workspaceUrlSlug}/tracker/${encodeURIComponent(verified.success.identifier)}`
        )
      }
    ]
  }
})
