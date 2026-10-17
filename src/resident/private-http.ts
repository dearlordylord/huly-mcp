import { Effect } from "effect"
import { Headers } from "effect/http"

import { RESIDENT_ATTACHMENT_HEADER } from "./admission-contract.js"

export const withResidentHeaderRedaction = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.updateService(Headers.CurrentRedactedNames, (names) => [
      ...names,
      RESIDENT_ATTACHMENT_HEADER,
      "mcp-session-id"
    ])
  )
