import { isDeepStrictEqual } from "node:util"
import type { Issue } from "@hcengineering/tracker"
import { Effect, Schema } from "effect"
import type { MovementProject } from "../../domain/schemas/issue-movement-state.js"
import {
  TransferIssueSchema,
  type TransferWrite,
  type TransferInspection
} from "../../domain/schemas/issue-transfer.js"
import type { HulyClient } from "../client.js"
import { tracker } from "../huly-plugins.js"
import {
  hierarchyProblem,
  movementHierarchy,
  movementNoParent,
  type MovementHierarchy
} from "./issue-movement-hierarchy.js"
import { inspectMovementClosure, inspectMovementProject, type MovementError } from "./issue-movement-preflight.js"
import type { TransferPlan } from "./issue-transfer-preflight.js"
import { hulyQuery } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"

const parseObservedIssue = (input: unknown) => Schema.decodeUnknownOption(TransferIssueSchema)(input)

export const verifyTransfer = Effect.fn("transfer.verify")(function* (
  client: HulyClient["Service"],
  prepared: TransferPlan,
  destination: MovementProject,
  write: TransferWrite
): Effect.fn.Return<TransferPlan["plan"]["root"] | undefined, MovementError> {
  const { plan } = prepared
  const source = yield* inspectMovementProject(client, plan.root)
  const target = yield* inspectMovementProject(client, { ...plan.root, space: destination._id })
  const hierarchy = combinedHierarchy(source, target)
  if (hierarchy === undefined) return undefined
  const observed = hierarchy.byId.get(plan.root._id)
  if (observed === undefined || !destinationMatches(observed, destination, write)) return undefined
  if (!hierarchyMatches(plan, hierarchy)) return undefined
  if ((yield* inspectMovementClosure(client, hierarchy, plan.relevant)) !== undefined) return undefined
  if (!(yield* preservedIssueMatches(client, prepared, write))) return undefined
  return (yield* verifyRecords(client, prepared, destination)) ? observed : undefined
})

const hierarchyMatches = (plan: TransferPlan["plan"], hierarchy: MovementHierarchy) =>
  plan.relevant.every((previous) => {
    const current = hierarchy.byId.get(previous._id)
    return current !== undefined && hierarchyProblem(hierarchy, current) === undefined
  })

const preservedIssueMatches = Effect.fn("transfer.verifyPreservation")(function* (
  client: HulyClient["Service"],
  prepared: TransferPlan,
  write: TransferWrite
): Effect.fn.Return<boolean, MovementError> {
  const { plan } = prepared
  const current = yield* client.findOne<Issue>(
    tracker.class.Issue,
    hulyQuery<Issue>({ _id: toRef<Issue>(plan.root._id) })
  )
  const parsed = parseObservedIssue(current)
  if (parsed._tag === "None") return false
  const { number: _oldNumber, rank: _oldRank, ...previous } = prepared.protectedIssue
  const { number, rank, ...preserved } = parsed.value
  return (
    number === write.number &&
    rank === write.rank &&
    isDeepStrictEqual(previous, preserved) &&
    current?.title === plan.root.title
  )
})

const recordsMatch = (previous: TransferPlan["records"], current: TransferInspection, destination: MovementProject) =>
  current.discovery === "complete" &&
  current.blockers.length === 0 &&
  previous.every((old) =>
    current.records.some((record) => isDeepStrictEqual(record, { ...old, space: destination._id }))
  ) &&
  current.records.every((record) => record.space === destination._id)

const destinationMatches = (
  observed: TransferPlan["plan"]["root"],
  destination: MovementProject,
  write: TransferWrite
) =>
  observed.space === destination._id &&
  observed.identifier === write.identifier &&
  observed.attachedTo === write.parentId

const verifyRecords = Effect.fn("transfer.verifyRecords")(function* (
  client: HulyClient["Service"],
  prepared: TransferPlan,
  destination: MovementProject
): Effect.fn.Return<boolean, MovementError> {
  if (client.inspectTransferRecords === undefined) return false
  return recordsMatch(prepared.records, yield* client.inspectTransferRecords(prepared.plan.root._id), destination)
})

const combinedHierarchy = (source: MovementHierarchy | undefined, target: MovementHierarchy | undefined) =>
  source === undefined || target === undefined ? undefined : movementHierarchy([...source.issues, ...target.issues])

export const movementNoopProblem = Effect.fn("movement.inspectNoop")(function* (
  client: HulyClient["Service"],
  plan: TransferPlan["plan"]
): Effect.fn.Return<string | undefined, MovementError> {
  if (!canInspectNoop(client, plan)) return undefined
  const inspect = client.inspectTransferRecords
  if (inspect === undefined) return undefined
  for (const issue of plan.tree) {
    const current = yield* client.findOne<Issue>(
      tracker.class.Issue,
      hulyQuery<Issue>({ _id: toRef<Issue>(issue._id) })
    )
    const parsed = parseObservedIssue(current)
    if (parsed._tag === "None") return "No-op identity inspection failed."
    if (issue.identifier !== `${plan.source.identifier}-${parsed.value.number}`)
      return "Inconsistent issue number/identifier; not a successful no-op."
    const records = yield* inspect(issue._id)
    const problem = ownedNoopProblem(records, issue)
    if (problem !== undefined) return problem
  }
  return undefined
})

const canInspectNoop = (client: HulyClient["Service"], plan: TransferPlan["plan"]) =>
  plan.root.attachedTo === (plan.parent?._id ?? movementNoParent) && client.inspectTransferRecords !== undefined

const ownedNoopProblem = (records: TransferInspection, issue: TransferPlan["plan"]["root"]) => {
  if (records.discovery === "incomplete") return "Incomplete owned-record discovery; not a successful no-op."
  return records.records.some((record) => record.space !== issue.space)
    ? "Owned records remain in another project; not a successful no-op."
    : undefined
}
