// Internal resource capabilities and shell observations, never serialized or invoked here.
export type OwnerOutcome = "success" | "interrupts-only" | "failure"
export type PublicationState<Receipt> = {
  readonly attempt:
    | { readonly _tag: "Unattempted" }
    | { readonly _tag: "Attempted" }
    | { readonly _tag: "Recorded"; readonly receipt: Receipt }
  readonly scope:
    | { readonly _tag: "Open" }
    | { readonly _tag: "Closing"; readonly outcome: OwnerOutcome }
    | { readonly _tag: "Settled"; readonly outcome: OwnerOutcome }
}

type Begin = { readonly _tag: "Begin"; readonly sameDirectory: boolean }
type Recorded<Receipt> = { readonly _tag: "Recorded"; readonly receipt: Receipt }
type Fence = { readonly _tag: "Fence"; readonly outcome: OwnerOutcome }
type Settled = { readonly _tag: "Settled" }
type Done = { readonly _tag: "Done" }
type BeginDecision = Done | { readonly _tag: "RefuseAttempt" | "RefuseDirectory" }
type SettlementDecision<Receipt> = { readonly _tag: "Retain" } | { readonly _tag: "Retire"; readonly receipt: Receipt }
type Transition<Receipt, Decision> = { readonly state: PublicationState<Receipt>; readonly decision: Decision }

export const makePublicationState = <Receipt>(): PublicationState<Receipt> => ({
  attempt: { _tag: "Unattempted" },
  scope: { _tag: "Open" }
})

export const publicationIsReady = <Receipt>(state: PublicationState<Receipt>) => state.attempt._tag === "Recorded"

const begin = <Receipt>(state: PublicationState<Receipt>, event: Begin): Transition<Receipt, BeginDecision> => {
  if (state.scope._tag !== "Open" || state.attempt._tag !== "Unattempted")
    return { state, decision: { _tag: "RefuseAttempt" } }
  return {
    state: { ...state, attempt: { _tag: "Attempted" } },
    decision: event.sameDirectory ? { _tag: "Done" } : { _tag: "RefuseDirectory" }
  }
}

const settle = <Receipt>(state: PublicationState<Receipt>): Transition<Receipt, SettlementDecision<Receipt>> => {
  if (state.scope._tag === "Open") throw new Error("Publication scope must be fenced before settlement")
  if (state.scope._tag === "Settled") return { state, decision: { _tag: "Retain" } }
  return {
    state: { ...state, scope: { _tag: "Settled", outcome: state.scope.outcome } },
    decision:
      state.attempt._tag === "Recorded" && state.scope.outcome !== "failure"
        ? { _tag: "Retire", receipt: state.attempt.receipt }
        : { _tag: "Retain" }
  }
}

export function advancePublication<Receipt>(
  state: PublicationState<Receipt>,
  event: Begin
): Transition<Receipt, BeginDecision>
export function advancePublication<Receipt>(
  state: PublicationState<Receipt>,
  event: Recorded<Receipt> | Fence
): Transition<Receipt, Done>
export function advancePublication<Receipt>(
  state: PublicationState<Receipt>,
  event: Settled
): Transition<Receipt, SettlementDecision<Receipt>>
export function advancePublication<Receipt>(
  state: PublicationState<Receipt>,
  event: Begin | Recorded<Receipt> | Fence | Settled
): Transition<Receipt, BeginDecision | SettlementDecision<Receipt>> {
  switch (event._tag) {
    case "Begin":
      return begin(state, event)
    case "Recorded": {
      if (state.attempt._tag !== "Attempted" || state.scope._tag === "Settled")
        throw new Error("Publication receipt requires an unsettled publication attempt")
      return { state: { ...state, attempt: { _tag: "Recorded", receipt: event.receipt } }, decision: { _tag: "Done" } }
    }
    case "Fence":
      return {
        state: state.scope._tag === "Open" ? { ...state, scope: { _tag: "Closing", outcome: event.outcome } } : state,
        decision: { _tag: "Done" }
      }
    case "Settled":
      return settle(state)
  }
}
