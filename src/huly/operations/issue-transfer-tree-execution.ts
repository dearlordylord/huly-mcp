import { isDeepStrictEqual } from "node:util"
import type { Issue, Project } from "@hcengineering/tracker"
import { SortingOrder } from "@hcengineering/core"
import { Effect, Schedule, Schema } from "effect"
import type { MoveIssueParams } from "../../domain/schemas/issue-movement.js"
import type { MovementProject } from "../../domain/schemas/issue-movement-state.js"
import { TransferSequenceSchema } from "../../domain/schemas/issue-transfer.js"
import type { TransferTreeWrite } from "../../domain/schemas/issue-transfer-tree.js"
import type { MoveIssueResult } from "../../domain/schemas/issues-results.js"
import { DocId, UrlString, type PositiveInteger } from "../../domain/schemas/shared.js"
import type { HulyClient } from "../client.js"
import { core, tracker } from "../huly-plugins.js"
import { movementNoParent } from "./issue-movement-hierarchy.js"
import type { MovementError } from "./issue-movement-preflight.js"
import { inspectTransferPlan, type TransferPlan } from "./issue-transfer-preflight.js"
import { planTransferTreeWrites } from "./issue-transfer-tree-planning.js"
import { verifyTransferTree } from "./issue-transfer-tree-verification.js"
import { hulyQuery } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"

const parseSequence = (input: unknown) => Schema.decodeUnknownOption(TransferSequenceSchema)(input)
export const transferTreeInspectionGuidance = (prepared: TransferPlan, destination: MovementProject) =>
  `Inspect every stable ID before retry: ${prepared.plan.tree.map((issue) => `MCP get_issue ${JSON.stringify({ project: destination.identifier, identifier: issue._id })}; CLI huly issues get ${destination.identifier} ${issue._id} --json`).join("; ")}. Stable-ID lookup searches the workspace. Do not automatically repeat movement; reserved numbers may leave gaps.`

const failure = (
  outcome: "incomplete" | "indeterminate",
  reason: string,
  prepared: TransferPlan,
  destination: MovementProject
): MoveIssueResult => ({
  outcome,
  reason,
  issueIds: prepared.plan.tree.map((issue) => issue._id),
  inspection: transferTreeInspectionGuidance(prepared, destination)
})
const blocked = (reason: string, prepared: TransferPlan, destination: MovementProject): MoveIssueResult => ({
  outcome: "blocked",
  changed: false,
  discovery: "incomplete",
  destinationId: destination._id,
  reason,
  issueIds: prepared.plan.tree.map((issue) => issue._id),
  inspection: transferTreeInspectionGuidance(prepared, destination)
})

const reinspect = Effect.fn("transfer.reinspectTree")(function* (
  client: HulyClient["Service"],
  prepared: TransferPlan,
  destination: MovementProject,
  params: MoveIssueParams
): Effect.fn.Return<boolean, MovementError> {
  const { root, parent, source } = prepared.plan
  const current = yield* inspectTransferPlan(client, root, parent, source, destination, params)
  return !("conflicts" in current) && isDeepStrictEqual(current, prepared)
})

export const executeTransferTree = Effect.fn("transfer.executeTree")(function* (
  client: HulyClient["Service"],
  prepared: TransferPlan,
  destination: MovementProject,
  params: MoveIssueParams
): Effect.fn.Return<MoveIssueResult, MovementError> {
  if (client.commitTransferTree === undefined && (prepared.tasks.length !== 1 || client.commitTransfer === undefined))
    return blocked("Complete-tree batch adapter is unavailable; no writes performed.", prepared, destination)
  const last = yield* Effect.result(
    client.findOne<Issue>(tracker.class.Issue, hulyQuery<Issue>({ space: toRef<Project>(destination._id) }), {
      sort: { rank: SortingOrder.Descending }
    })
  )
  if (last._tag === "Failure")
    return blocked("Destination ordering inspection failed before writes.", prepared, destination)
  const admission = yield* Effect.result(reinspect(client, prepared, destination, params))
  if (admission._tag === "Failure" || !admission.success)
    return blocked(
      "Tree or protected snapshots changed before allocation; rebuild the request from current stable IDs.",
      prepared,
      destination
    )
  const numbers: Array<PositiveInteger> = []
  for (const _task of prepared.tasks) {
    const allocated = yield* Effect.result(
      client.updateDoc(
        tracker.class.Project,
        core.space.Space,
        toRef<Project>(destination._id),
        { $inc: { sequence: 1 } },
        true
      )
    )
    if (allocated._tag === "Failure")
      return failure(
        "indeterminate",
        "Sequence allocation response unavailable; reservations may have occurred. Task batch was not sent.",
        prepared,
        destination
      )
    const parsed = parseSequence(allocated.success)
    if (parsed._tag === "None")
      return failure(
        "indeterminate",
        "Sequence allocation returned no valid number; reservations may have occurred. Task batch was not sent.",
        prepared,
        destination
      )
    numbers.push(parsed.value.object.sequence)
  }
  const write = planTransferTreeWrites(prepared, destination, numbers, last.success?.rank)
  if (write === undefined)
    return failure(
      "incomplete",
      "Reserved identifiers are incomplete or duplicate; task batch was not sent. Gaps may remain.",
      prepared,
      destination
    )
  const presend = yield* Effect.result(reinspect(client, prepared, destination, params))
  if (presend._tag === "Failure")
    return failure(
      "indeterminate",
      "Pre-send inspection is unavailable after allocation; task batch was not sent.",
      prepared,
      destination
    )
  if (!presend.success)
    return failure(
      "incomplete",
      "Tree or protected snapshots changed after allocation; task batch was not sent. Gaps may remain.",
      prepared,
      destination
    )
  return yield* commitAndVerifyTree(client, prepared, destination, write)
})

const commitAndVerifyTree = Effect.fn("transfer.commitAndVerifyTree")(function* (
  client: HulyClient["Service"],
  prepared: TransferPlan,
  destination: MovementProject,
  write: TransferTreeWrite
): Effect.fn.Return<MoveIssueResult, MovementError> {
  const commit = client.commitTransferTree
  const single = client.commitTransfer
  const rootWrite = write.tasks[0]
  const sent =
    commit !== undefined
      ? commit(write)
      : single !== undefined && rootWrite !== undefined
        ? single(rootWrite)
        : Effect.succeed("condition-not-met")
  const committed = yield* Effect.result(sent)
  if (committed._tag === "Failure")
    return failure(
      "indeterminate",
      "Commit response unavailable; tree movement effects may have occurred. Reserved numbers may leave gaps.",
      prepared,
      destination
    )
  if (committed.success === "condition-not-met")
    return failure(
      "incomplete",
      "SDK refused tree commit conditions after allocation; reserved numbers may leave gaps.",
      prepared,
      destination
    )
  const verification = yield* verifyTransferTree(client, prepared, destination, write).pipe(
    Effect.repeat({
      schedule: Schedule.spaced("200 millis"),
      times: 4,
      while: (value) => value.status !== "consistent"
    }),
    Effect.result
  )
  if (verification._tag === "Failure")
    return failure(
      "indeterminate",
      "Post-send verification reads are unavailable; inspect every stable task ID before retry.",
      prepared,
      destination
    )
  if (verification.success.status === "unavailable")
    return failure("indeterminate", verification.success.reason, prepared, destination)
  if (verification.success.status === "inconsistent")
    return failure("incomplete", verification.success.reason, prepared, destination)
  return {
    outcome: "completed",
    changed: true,
    issueId: prepared.plan.root._id,
    projectId: DocId.make(destination._id),
    parentId: prepared.plan.parent?._id ?? null,
    attributeChanges: prepared.attributeChanges,
    tasks: write.tasks.map((task) => ({
      issueId: task.issueId,
      previousIdentifier: task.expectedHierarchy.identifier,
      identifier: task.identifier,
      parentId: task.parentId === movementNoParent ? null : task.parentId,
      url: UrlString.make(
        `${client.workbenchUrlConfig.baseUrl.replace(/\/+$/, "")}/workbench/${client.workbenchUrlConfig.workspaceUrlSlug}/tracker/${encodeURIComponent(task.identifier)}`
      )
    }))
  }
})
