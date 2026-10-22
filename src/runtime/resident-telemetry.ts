import { Cause, Effect, Exit, type Layer } from "effect"

import { reportTelemetry } from "../telemetry/events.js"
import { TelemetryService, type TelemetryOperations } from "../telemetry/telemetry.js"

/** The generation owns telemetry through startup failure and final attachment cleanup. */
export const withResidentTelemetry = <A, E, R>(
  use: (telemetry: TelemetryOperations) => Effect.Effect<A, E, R>,
  layer: Layer.Layer<TelemetryService> = TelemetryService.residentLayer
) =>
  Effect.acquireUseRelease(
    TelemetryService.pipe(Effect.provide(layer)),
    (telemetry) => {
      let ready = false
      return use({
        ...telemetry,
        residentReady: () => {
          ready = true
          reportTelemetry(telemetry.residentReady)
        }
      }).pipe(
        Effect.onExit((exit) =>
          Effect.sync(() => {
            if (Exit.isFailure(exit) && !Cause.hasInterruptsOnly(exit.cause))
              reportTelemetry(() =>
                telemetry.residentFailure({ stage: ready ? "backend" : "startup", reason: "failed" })
              )
          })
        )
      )
    },
    (telemetry) => Effect.tryPromise(() => telemetry.shutdown()).pipe(Effect.ignore)
  )
