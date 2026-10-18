import type { AdmissionPolicy } from "./admission-contract.js"
import { makeAttachmentLease, type MonotonicNanos } from "./attachment-lease.js"
import {
  admissionInventory,
  lookupAdmissionMember,
  replaceAdmissionEntry,
  type AttachmentDigest,
  type AdmissionIdentity,
  type AdmissionsState,
  type AdmissionTransition,
  type AdmissionProceed,
  type AdmissionRefusal,
  type AdmissionClose
} from "./admissions-state.js"

// Internal explicit events; policy was parsed at the configuration boundary.
type AdmissionGate =
  | { readonly _tag: "Begin"; readonly id: AdmissionIdentity; readonly now: MonotonicNanos }
  | { readonly _tag: "CheckCapacity"; readonly id: AdmissionIdentity }
  | {
      readonly _tag: "PrepareOwner"
      readonly id: AdmissionIdentity
      readonly key: AttachmentDigest
      readonly now: MonotonicNanos
    }
type PublishOwner<Owner> = { readonly _tag: "PublishOwner"; readonly id: AdmissionIdentity; readonly owner: Owner }
const queuedRefusal = <Owner>(state: AdmissionsState<Owner>, id: AdmissionIdentity): AdmissionRefusal | undefined => {
  if (!state.accepting) return { _tag: "Refuse", kind: "closing" }
  return state.entries.get(id)?._tag === "Queued" ? undefined : { _tag: "Refuse", kind: "unknown" }
}
const begin = <Owner>(
  state: AdmissionsState<Owner>,
  event: Extract<AdmissionGate, { _tag: "Begin" }>
): AdmissionTransition<Owner, AdmissionProceed | AdmissionRefusal> => {
  if (!state.accepting) return { state, decision: { _tag: "Refuse", kind: "closing" } }
  if (state.entries.has(event.id)) return { state, decision: { _tag: "Proceed" } }
  return {
    state: { ...replaceAdmissionEntry(state, event.id, { _tag: "Queued" }), idleSince: event.now },
    decision: { _tag: "Proceed" }
  }
}
const publish = <Owner>(
  state: AdmissionsState<Owner>,
  event: PublishOwner<Owner>
): AdmissionTransition<Owner, AdmissionProceed | AdmissionClose<Owner>> => {
  const entry = state.entries.get(event.id)
  if (entry?._tag !== "Acquiring") throw new Error("Owner publication requires its acquiring admission identity")
  const next = replaceAdmissionEntry(state, event.id, {
    _tag: "Owned",
    key: entry.key,
    lease: entry.lease,
    owner: event.owner,
    pending: true,
    blocked: false
  })
  return {
    state: next,
    decision: state.accepting ? { _tag: "Proceed" } : { _tag: "Close", id: event.id, owner: event.owner }
  }
}
const prepare = <Owner>(
  state: AdmissionsState<Owner>,
  event: Extract<AdmissionGate, { _tag: "PrepareOwner" }>,
  policy: AdmissionPolicy
): AdmissionTransition<Owner, AdmissionProceed | AdmissionRefusal> => {
  const refusal = queuedRefusal(state, event.id)
  if (refusal !== undefined) return { state, decision: refusal }
  if (lookupAdmissionMember(state, event.key) !== undefined)
    return { state, decision: { _tag: "Refuse", kind: "unknown" } }
  return {
    state: replaceAdmissionEntry(state, event.id, {
      _tag: "Acquiring",
      key: event.key,
      lease: makeAttachmentLease(event.now, policy.lease.durationMillis)
    }),
    decision: { _tag: "Proceed" }
  }
}
export function advanceAdmission<Owner>(
  state: AdmissionsState<Owner>,
  event: AdmissionGate,
  policy: AdmissionPolicy
): AdmissionTransition<Owner, AdmissionProceed | AdmissionRefusal>
export function advanceAdmission<Owner>(
  state: AdmissionsState<Owner>,
  event: PublishOwner<Owner>,
  policy: AdmissionPolicy
): AdmissionTransition<Owner, AdmissionProceed | AdmissionClose<Owner>>
export function advanceAdmission<Owner>(
  state: AdmissionsState<Owner>,
  event: AdmissionGate | PublishOwner<Owner>,
  policy: AdmissionPolicy
): AdmissionTransition<Owner, AdmissionProceed | AdmissionRefusal | AdmissionClose<Owner>> {
  switch (event._tag) {
    case "Begin":
      return begin(state, event)
    case "PublishOwner":
      return publish(state, event)
    case "CheckCapacity": {
      const refusal = queuedRefusal(state, event.id)
      if (refusal !== undefined) return { state, decision: refusal }
      return {
        state,
        decision:
          admissionInventory(state).members.length >= policy.capacity
            ? { _tag: "Refuse", kind: "capacity" }
            : { _tag: "Proceed" }
      }
    }
    case "PrepareOwner":
      return prepare(state, event, policy)
  }
}
