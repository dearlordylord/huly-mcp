import { Effect } from "effect"

import { Diagnostics, makeDiagnosticsScope } from "../../src/huly/diagnostics.js"

export const withDiagnostics = <A, E, R>(
  effect: Effect.Effect<A, E, R>
): Effect.Effect<A, E, Exclude<R, Diagnostics>> =>
  Effect.gen(function*() {
    const diagnostics = yield* makeDiagnosticsScope
    return yield* effect.pipe(Effect.provideService(Diagnostics, diagnostics.service))
  })
