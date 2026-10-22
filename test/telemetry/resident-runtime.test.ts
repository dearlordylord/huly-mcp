import { it } from "@effect/vitest"
import { Effect, Exit } from "effect"
import { expect } from "vitest"

import { withResidentTelemetry } from "../../src/runtime/resident-telemetry.js"
import { TelemetryService } from "../../src/telemetry/telemetry.js"
import type { ResidentFailureEvent } from "../../src/telemetry/events.js"

it.effect.each([false, true])(
  "owns the final flush and reports the actual observed failure stage (ready=%s)",
  (ready) =>
    Effect.gen(function* () {
      const events: Array<unknown> = []
      const layer = TelemetryService.testLayer({
        residentReady: () => {
          events.push("ready")
        },
        residentFailure: (event) => {
          events.push(event)
        },
        shutdown: async () => {
          events.push("shutdown")
        }
      })
      const result = yield* withResidentTelemetry(
        (telemetry) =>
          Effect.gen(function* () {
            if (ready) telemetry.residentReady()
            return yield* Effect.die("private failure")
          }),
        layer
      ).pipe(Effect.exit)
      expect(Exit.isFailure(result)).toBe(true)
      expect(events).toEqual([
        ...(ready ? ["ready"] : []),
        { stage: ready ? "backend" : "startup", reason: "failed" },
        "shutdown"
      ])
    })
)

it.effect("does not report cancellation as a crash and ignores a failed final flush", () =>
  Effect.gen(function* () {
    const failures: Array<ResidentFailureEvent> = []
    const result = yield* withResidentTelemetry(
      () => Effect.interrupt,
      TelemetryService.testLayer({
        residentFailure: (event) => {
          failures.push(event)
        },
        shutdown: async () => {
          throw new Error("flush unavailable")
        }
      })
    ).pipe(Effect.exit)
    expect(Exit.isFailure(result)).toBe(true)
    expect(failures).toEqual([])
  })
)
