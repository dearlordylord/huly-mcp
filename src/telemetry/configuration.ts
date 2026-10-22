import { Config } from "effect"

import type { TelemetrySurface } from "./context.js"

const telemetryEnvNames = {
  cli: { debug: "HULY_CLI_TELEMETRY_DEBUG", enabled: "HULY_CLI_TELEMETRY" },
  mcp: { debug: "HULY_MCP_TELEMETRY_DEBUG", enabled: "HULY_MCP_TELEMETRY" }
} satisfies Record<TelemetrySurface, { readonly debug: string; readonly enabled: string }>

// https://consoledonottrack.com: any value other than empty, "0", or "false" opts out.
const doNotTrack = Config.map(
  Config.String("DO_NOT_TRACK").pipe(Config.withDefault("")),
  (v) => !["", "0", "false"].includes(v.trim().toLowerCase())
)

export const telemetryEnabled = (surface: TelemetrySurface) =>
  Config.all([Config.String(telemetryEnvNames[surface].enabled).pipe(Config.withDefault("1")), doNotTrack]).pipe(
    Config.map(([v, optOut]) => v !== "0" && !optOut)
  )

export const telemetryDebug = (surface: TelemetrySurface) =>
  Config.map(Config.String(telemetryEnvNames[surface].debug).pipe(Config.withDefault("0")), (v) => v === "1")
