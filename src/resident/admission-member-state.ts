import type { LeasePolicy } from "./admission-contract.js"
import { makeAttachmentLease, type MonotonicNanos } from "./attachment-lease.js"
import {
  admissionIsEligible,
  lookupAdmissionMember,
  replaceAdmissionEntry,
  type AttachmentDigest,
  type AdmissionIdentity,
  type AdmissionsState,
  type AdmissionTransition,
  type AdmissionRefusal,
  type AdmissionClose,
  type AdmissionDone,
  type AdmissionOwned
} from "./admissions-state.js"

// Internal owner observations and confirmed cleanup events, never I/O payloads.
export type AdmissionAccess = {
  readonly _tag: "Access"
  readonly id: AdmissionIdentity
  readonly key: AttachmentDigest
  readonly now: MonotonicNanos
  readonly ownerAccepting: boolean
  readonly renew: boolean
  readonly durationMillis: LeasePolicy["durationMillis"]
}
type Retire = {
  readonly _tag: "Retire"
  readonly target:
    | { readonly _tag: "Digest"; readonly key: AttachmentDigest }
    | { readonly _tag: "Identity"; readonly id: AdmissionIdentity }
}
type Cleanup =
  | { readonly _tag: "Closed"; readonly id: AdmissionIdentity; readonly now: MonotonicNanos }
  | { readonly _tag: "CleanupBlocked"; readonly id: AdmissionIdentity }
const access = <Owner>(
  state: AdmissionsState<Owner>,
  event: AdmissionAccess
): AdmissionTransition<Owner, AdmissionRefusal | AdmissionOwned<Owner>> => {
  const entry = state.entries.get(event.id)
  if (
    entry?._tag !== "Owned" ||
    entry.key !== event.key ||
    !event.ownerAccepting ||
    !admissionIsEligible(state, event.id, event.now)
  )
    return { state, decision: { _tag: "Refuse", kind: "unknown" } }
  return {
    state: event.renew
      ? replaceAdmissionEntry(state, event.id, {
          ...entry,
          lease: makeAttachmentLease(event.now, event.durationMillis)
        })
      : state,
    decision: { _tag: "Owner", id: event.id, owner: entry.owner }
  }
}
const retire = <Owner>(
  state: AdmissionsState<Owner>,
  event: Retire
): AdmissionTransition<Owner, AdmissionClose<Owner> | AdmissionDone> => {
  const id = event.target._tag === "Identity" ? event.target.id : lookupAdmissionMember(state, event.target.key)?.id
  if (id === undefined) return { state, decision: { _tag: "Done" } }
  const entry = state.entries.get(id)
  if (entry?._tag !== "Owned") return { state, decision: { _tag: "Done" } }
  return {
    state:
      entry.lease._tag === "Retired"
        ? state
        : replaceAdmissionEntry(state, id, { ...entry, lease: { _tag: "Retired" } }),
    decision: { _tag: "Close", id, owner: entry.owner }
  }
}
const cleanup = <Owner>(state: AdmissionsState<Owner>, event: Cleanup): AdmissionTransition<Owner, AdmissionDone> => {
  const entry = state.entries.get(event.id)
  if (entry?._tag !== "Owned") return { state, decision: { _tag: "Done" } }
  const next =
    event._tag === "CleanupBlocked"
      ? replaceAdmissionEntry(state, event.id, { ...entry, blocked: true })
      : {
          ...replaceAdmissionEntry(state, event.id, entry.pending ? { _tag: "Settling" } : undefined),
          idleSince: event.now
        }
  return { state: next, decision: { _tag: "Done" } }
}
export function advanceMember<Owner>(
  state: AdmissionsState<Owner>,
  event: AdmissionAccess
): AdmissionTransition<Owner, AdmissionRefusal | AdmissionOwned<Owner>>
export function advanceMember<Owner>(
  state: AdmissionsState<Owner>,
  event: Retire
): AdmissionTransition<Owner, AdmissionClose<Owner> | AdmissionDone>
export function advanceMember<Owner>(
  state: AdmissionsState<Owner>,
  event: Cleanup
): AdmissionTransition<Owner, AdmissionDone>
export function advanceMember<Owner>(
  state: AdmissionsState<Owner>,
  event: AdmissionAccess | Retire | Cleanup
): AdmissionTransition<Owner, AdmissionRefusal | AdmissionOwned<Owner> | AdmissionClose<Owner> | AdmissionDone> {
  switch (event._tag) {
    case "Access":
      return access(state, event)
    case "Retire":
      return retire(state, event)
    case "Closed":
    case "CleanupBlocked":
      return cleanup(state, event)
  }
}
