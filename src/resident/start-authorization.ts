// Internal bootstrap decisions. IPC decoding belongs to the process adapter.
export type ChildStartState = "prepared" | "authorized" | "retired"
export type ChildStartEvent = "start" | "disconnect" | "timeout" | "invalid"
export type ChildStartDecision =
  | { readonly state: "authorized"; readonly action: "claim" | "none" }
  | { readonly state: "retired"; readonly action: "exit" | "none" }

export const decideChildStart = (state: ChildStartState, event: ChildStartEvent): ChildStartDecision => {
  if (state !== "prepared") return { state, action: "none" }
  return event === "start" ? { state: "authorized", action: "claim" } : { state: "retired", action: "exit" }
}
