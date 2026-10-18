import { leaseIsEligible, leaseWaitNanos, type AttachmentLease, type MonotonicNanos } from "./attachment-lease.js"

// Internal identities and resource capabilities, never serialized or exposed on a wire.
export type AttachmentDigest = string
export interface AdmissionIdentity {
  readonly kind: "AdmissionAttempt"
}
export const makeAdmissionIdentity = (): AdmissionIdentity => ({ kind: "AdmissionAttempt" })
export type AdmissionEntry<Owner> =
  | { readonly _tag: "Queued" }
  | { readonly _tag: "Acquiring"; readonly key: AttachmentDigest; readonly lease: AttachmentLease }
  | { readonly _tag: "Settling" }
  | {
      readonly _tag: "Owned"
      readonly key: AttachmentDigest
      readonly owner: Owner
      readonly lease: AttachmentLease
      readonly pending: boolean
      readonly blocked: boolean
    }
export interface AdmissionsState<Owner> {
  readonly accepting: boolean
  readonly entries: ReadonlyMap<AdmissionIdentity, AdmissionEntry<Owner>>
  readonly idleSince: MonotonicNanos
  readonly drainFailed: boolean
}
export interface AdmissionTransition<Owner, Decision> {
  readonly state: AdmissionsState<Owner>
  readonly decision: Decision
}
export interface AdmissionProceed {
  readonly _tag: "Proceed"
}
export interface AdmissionRefusal {
  readonly _tag: "Refuse"
  readonly kind: "closing" | "capacity" | "unknown"
}
export interface AdmissionDone {
  readonly _tag: "Done"
}
export interface AdmissionClose<Owner> {
  readonly _tag: "Close"
  readonly id: AdmissionIdentity
  readonly owner: Owner
}
export interface AdmissionOwned<Owner> {
  readonly _tag: "Owner"
  readonly id: AdmissionIdentity
  readonly owner: Owner
}
export interface AdmissionWait {
  readonly _tag: "Wait"
  readonly nanos: MonotonicNanos
}

export const makeAdmissionsState = <Owner>(now: MonotonicNanos): AdmissionsState<Owner> => ({
  accepting: true,
  entries: new Map(),
  idleSince: now,
  drainFailed: false
})
export const replaceAdmissionEntry = <Owner>(
  state: AdmissionsState<Owner>,
  id: AdmissionIdentity,
  entry: AdmissionEntry<Owner> | undefined
): AdmissionsState<Owner> => {
  const entries = new Map(state.entries)
  if (entry === undefined) entries.delete(id)
  else entries.set(id, entry)
  return { ...state, entries }
}
export const admissionInventory = <Owner>(state: AdmissionsState<Owner>) => {
  let pending = 0
  const members: Array<{ readonly id: AdmissionIdentity; readonly owner: Owner; readonly blocked: boolean }> = []
  for (const [id, entry] of state.entries) {
    if (entry._tag !== "Owned") pending++
    else {
      if (entry.pending) pending++
      members.push({ id, owner: entry.owner, blocked: entry.blocked })
    }
  }
  return { pending, members }
}
export const lookupAdmissionMember = <Owner>(state: AdmissionsState<Owner>, key: AttachmentDigest) => {
  for (const [id, entry] of state.entries) {
    if (entry._tag === "Owned" && entry.key === key) return { id, owner: entry.owner }
  }
  return undefined
}
export const admissionIsEligible = <Owner>(
  state: AdmissionsState<Owner>,
  id: AdmissionIdentity,
  now: MonotonicNanos
) => {
  const entry = state.entries.get(id)
  return (
    state.accepting &&
    entry !== undefined &&
    (entry._tag === "Acquiring" || entry._tag === "Owned") &&
    leaseIsEligible(entry.lease, now)
  )
}
export const admissionLeaseDelay = <Owner>(
  state: AdmissionsState<Owner>,
  id: AdmissionIdentity,
  now: MonotonicNanos
) => {
  const entry = state.entries.get(id)
  return entry !== undefined && (entry._tag === "Acquiring" || entry._tag === "Owned")
    ? leaseWaitNanos(entry.lease, now)
    : 0n
}
