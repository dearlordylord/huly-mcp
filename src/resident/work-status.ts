import { ResidentWorkStatus } from "./status-contract.js"

// Internal owner observations; ResidentWorkStatus owns the serialized projection.
interface OwnerStatus extends Pick<ResidentWorkStatus, "retainedRequests" | "blockedRequests"> {
  readonly closing: boolean
  readonly blocked: boolean
}
interface WorkStatusInput {
  readonly accepting: boolean
  readonly pending: ResidentWorkStatus["pendingAdmissions"]
  readonly drainFailed: boolean
  readonly owners: ReadonlyArray<OwnerStatus>
}
const cleanupBlocked = ({ drainFailed, owners, pending }: WorkStatusInput) =>
  owners.some((owner) => owner.blocked || owner.blockedRequests > 0) ||
  (drainFailed && (owners.length > 0 || pending > 0))

export const makeResidentWorkStatus = (input: WorkStatusInput): ResidentWorkStatus =>
  ResidentWorkStatus.make({
    admission: input.accepting ? "accepting" : "fenced",
    attachments: input.owners.length,
    pendingAdmissions: input.pending,
    retainedRequests: input.owners.reduce((count, owner) => count + owner.retainedRequests, 0),
    blockedRequests: input.owners.reduce((count, owner) => count + owner.blockedRequests, 0),
    drain: cleanupBlocked(input)
      ? "blocked"
      : !input.accepting || input.owners.some((owner) => owner.closing)
        ? "draining"
        : "idle"
  })
