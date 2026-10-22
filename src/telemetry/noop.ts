import type { TelemetryOperations } from "./telemetry.js"

export const createNoopTelemetry = (): TelemetryOperations => ({
  sessionStart: () => {},
  firstListTools: () => {},
  toolCalled: () => {},
  residentReady: () => {},
  residentAttachment: () => {},
  residentFailure: () => {},
  shutdown: () => Promise.resolve()
})
