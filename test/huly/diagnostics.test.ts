import { describe, it } from "@effect/vitest"
import { Effect, Logger, LogLevel } from "effect"
import { expect } from "vitest"

import { makeDiagnosticsScope } from "../../src/huly/diagnostics.js"

const captureLogs = <A>(effect: Effect.Effect<A>): Effect.Effect<{
  readonly result: A
  readonly logs: ReadonlyArray<{
    readonly level: string
    readonly value: unknown
  }>
}> =>
  Effect.gen(function*() {
    const consoleService = yield* Effect.console
    const logs: Array<{ readonly level: string; readonly value: unknown }> = []
    const capture = (level: string) => (value: unknown) => {
      logs.push({ level, value })
    }
    const logger = Logger.make((entry) => String(entry.message)).pipe(Logger.withLeveledConsole)
    const result = yield* effect.pipe(
      Effect.provide(Logger.replace(Logger.defaultLogger, logger)),
      Logger.withMinimumLogLevel(LogLevel.Info),
      Effect.withConsole({
        ...consoleService,
        unsafe: {
          ...consoleService.unsafe,
          info: capture("info"),
          warn: capture("warn")
        }
      })
    )
    return { result, logs }
  })

describe("Diagnostics", () => {
  it.effect("warnAgent accumulates a tool warning and writes an operator warning log", () =>
    Effect.gen(function*() {
      const scope = yield* makeDiagnosticsScope
      const warning = {
        code: "status_metadata_unresolved" as const,
        message: "Status metadata was degraded."
      }

      const { logs } = yield* captureLogs(scope.service.warnAgent(warning))
      const warnings = yield* scope.drainWarnings

      expect(warnings).toEqual([warning])
      expect(logs).toEqual([{
        level: "warn",
        value: "Agent-visible tool warning [status_metadata_unresolved]: Status metadata was degraded."
      }])
    }))

  it.effect("trail writes an operator log without accumulating tool warnings", () =>
    Effect.gen(function*() {
      const scope = yield* makeDiagnosticsScope

      const { logs } = yield* captureLogs(scope.service.trail("metadata recovered from model"))
      const warnings = yield* scope.drainWarnings

      expect(warnings).toEqual([])
      expect(logs).toEqual([{
        level: "info",
        value: "Diagnostic trail: metadata recovered from model"
      }])
    }))
})
