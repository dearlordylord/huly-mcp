/**
 * Per-tool diagnostics channel.
 *
 * Use warnAgent only when the returned tool payload differs from the documented
 * happy path: synthesized names, partial metadata resolution, or sentinel
 * categories caused by infrastructure failure. warnAgent is surfaced in the MCP
 * tool result and also emits an operator log line.
 * Diagnostics messages are not telemetry; do not send warning messages, payload
 * data, or backend error text to PostHog.
 *
 * Use trail for operator-only breadcrumbs that must never reach the agent. The
 * MCP logging capability was considered for these diagnostics and deliberately
 * deferred; warnings travel in the tool result envelope instead.
 */
import { Context, Effect, Ref } from "effect"

import type { ToolWarning } from "../domain/schemas/tool-warnings.js"

interface DiagnosticsOperations {
  readonly warnAgent: (warning: ToolWarning) => Effect.Effect<void>
  readonly trail: (message: string) => Effect.Effect<void>
}

export class Diagnostics extends Context.Tag("@hulymcp/Diagnostics")<
  Diagnostics,
  DiagnosticsOperations
>() {}

interface DiagnosticsScope {
  readonly service: DiagnosticsOperations
  readonly drainWarnings: Effect.Effect<ReadonlyArray<ToolWarning>>
}

const warningLogText = (warning: ToolWarning): string =>
  `Agent-visible tool warning [${warning.code}]: ${warning.message}`

export const makeDiagnosticsScope: Effect.Effect<DiagnosticsScope> = Effect.gen(function*() {
  const warningsRef = yield* Ref.make<ReadonlyArray<ToolWarning>>([])

  return {
    service: {
      warnAgent: (warning) =>
        Ref.update(warningsRef, (warnings) => [...warnings, warning]).pipe(
          Effect.zipRight(Effect.logWarning(warningLogText(warning)))
        ),
      trail: (message) => Effect.logInfo(`Diagnostic trail: ${message}`)
    },
    drainWarnings: Ref.get(warningsRef)
  }
})
