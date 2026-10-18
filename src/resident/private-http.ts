import { Effect } from "effect"
import { Headers } from "effect/http"

export const withResidentHeaderRedaction = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Effect.updateService(Headers.CurrentRedactedNames, (names) => [...names, /^x-huly-/iu, "mcp-session-id"]))
