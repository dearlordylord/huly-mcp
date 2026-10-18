// Internal live capabilities are retained by the caller's resource brackets, never serialized.
export type CandidateSelection<Candidate> =
  | { readonly _tag: "Empty" }
  | { readonly _tag: "Selected"; readonly candidate: Candidate }

type Matched<Candidate> = { readonly _tag: "Matched"; readonly candidate: Candidate }
type Completed = { readonly _tag: "Completed"; readonly recordCount: number; readonly capacity: number }
type MatchDecision<Candidate> =
  | { readonly _tag: "Continue"; readonly state: CandidateSelection<Candidate> }
  | { readonly _tag: "Duplicate" }
type SelectionDecision<Candidate> =
  | { readonly _tag: "Existing"; readonly candidate: Candidate }
  | { readonly _tag: "Absent" }
  | { readonly _tag: "Capacity" }

export function advanceCandidateSelection<Candidate>(
  state: CandidateSelection<Candidate>,
  event: Matched<Candidate>
): MatchDecision<Candidate>
export function advanceCandidateSelection<Candidate>(
  state: CandidateSelection<Candidate>,
  event: Completed
): SelectionDecision<Candidate>
export function advanceCandidateSelection<Candidate>(
  state: CandidateSelection<Candidate>,
  event: Matched<Candidate> | Completed
): MatchDecision<Candidate> | SelectionDecision<Candidate> {
  if (event._tag === "Matched")
    return state._tag === "Selected"
      ? { _tag: "Duplicate" }
      : { _tag: "Continue", state: { _tag: "Selected", candidate: event.candidate } }
  if (state._tag === "Selected") return { _tag: "Existing", candidate: state.candidate }
  return event.recordCount === event.capacity ? { _tag: "Capacity" } : { _tag: "Absent" }
}
