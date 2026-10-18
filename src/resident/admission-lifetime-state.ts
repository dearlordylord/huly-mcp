import type { MonotonicNanos } from "./attachment-lease.js"
import { MANAGED_IDLE_MILLIS } from "./managed-contract.js"
import {
  admissionInventory,
  replaceAdmissionEntry,
  type AdmissionIdentity,
  type AdmissionsState,
  type AdmissionTransition,
  type AdmissionDone,
  type AdmissionWait
} from "./admissions-state.js"

// Internal lifetime events, with monotonic time supplied by the Effect shell.
type Change =
  | { readonly _tag: "FinishAttempt"; readonly id: AdmissionIdentity; readonly now: MonotonicNanos }
  | { readonly _tag: "Fence" }
  | { readonly _tag: "DrainFailed" }
  | { readonly _tag: "TouchIdle"; readonly now: MonotonicNanos }
type Idle = { readonly _tag: "Idle"; readonly now: MonotonicNanos }
const IDLE_NANOS = BigInt(MANAGED_IDLE_MILLIS) * 1_000_000n
const POLL_NANOS = 250_000_000n
const finish = <Owner>(
  state: AdmissionsState<Owner>,
  event: Extract<Change, { _tag: "FinishAttempt" }>
): AdmissionsState<Owner> => {
  const entry = state.entries.get(event.id)
  if (entry === undefined || (entry._tag === "Owned" && !entry.pending)) return state
  return {
    ...replaceAdmissionEntry(state, event.id, entry._tag === "Owned" ? { ...entry, pending: false } : undefined),
    idleSince: event.now
  }
}
const idle = <Owner>(
  state: AdmissionsState<Owner>,
  event: Idle
): AdmissionTransition<Owner, AdmissionDone | AdmissionWait> => {
  if (!state.accepting) return { state, decision: { _tag: "Done" } }
  const view = admissionInventory(state)
  if (view.pending > 0 || view.members.length > 0) return { state, decision: { _tag: "Wait", nanos: POLL_NANOS } }
  const remaining = state.idleSince + IDLE_NANOS - event.now
  return remaining <= 0n
    ? { state: { ...state, accepting: false }, decision: { _tag: "Done" } }
    : { state, decision: { _tag: "Wait", nanos: remaining < POLL_NANOS ? remaining : POLL_NANOS } }
}
export function advanceLifetime<Owner>(
  state: AdmissionsState<Owner>,
  event: Change
): AdmissionTransition<Owner, AdmissionDone>
export function advanceLifetime<Owner>(
  state: AdmissionsState<Owner>,
  event: Idle
): AdmissionTransition<Owner, AdmissionDone | AdmissionWait>
export function advanceLifetime<Owner>(
  state: AdmissionsState<Owner>,
  event: Change | Idle
): AdmissionTransition<Owner, AdmissionDone | AdmissionWait> {
  switch (event._tag) {
    case "Idle":
      return idle(state, event)
    case "FinishAttempt":
      return { state: finish(state, event), decision: { _tag: "Done" } }
    case "Fence":
      return { state: { ...state, accepting: false }, decision: { _tag: "Done" } }
    case "DrainFailed":
      return { state: { ...state, drainFailed: true }, decision: { _tag: "Done" } }
    case "TouchIdle":
      return { state: { ...state, idleSince: event.now }, decision: { _tag: "Done" } }
  }
}
