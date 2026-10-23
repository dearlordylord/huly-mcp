import { Clock, Duration, Effect } from "effect"

import { ManagedLaunchError, MANAGED_SELECTION_MILLIS } from "./managed-contract.js"

const NANOS_PER_MILLISECOND = 1_000_000n
const expired = () =>
  new ManagedLaunchError({
    reason: "deadline",
    message: "Resident startup exceeded its thirty-second selection budget; no request was replayed"
  })

// Internal runtime port; deadlines are measured by each process's injected clock, never serialized.
export interface StartupBudget {
  readonly within: <A, E, R>(operation: Effect.Effect<A, E, R>) => Effect.Effect<A, E | ManagedLaunchError, R>
}

export const makeStartupBudget = Effect.gen(function* () {
  const deadline = (yield* Clock.monotonicTimeNanos) + BigInt(MANAGED_SELECTION_MILLIS) * NANOS_PER_MILLISECOND
  const within: StartupBudget["within"] = (operation) =>
    Effect.gen(function* () {
      const remaining = deadline - (yield* Clock.monotonicTimeNanos)
      if (remaining <= 0n) return yield* expired()
      return yield* operation.pipe(
        Effect.timeoutOrElse({ duration: Duration.nanos(remaining), orElse: () => Effect.fail(expired()) })
      )
    })
  return { within } satisfies StartupBudget
})
