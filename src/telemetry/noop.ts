import type { TelemetryOperations } from "./telemetry.js"

export const createNoopTelemetry = (): TelemetryOperations => ({
  sessionStart: () => {},
  firstListTools: () => {},
  toolCalled: () => {},
  shutdown: () => Promise.resolve()
})
