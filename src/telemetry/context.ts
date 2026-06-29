export type TelemetrySurface = "mcp" | "cli"

export interface TelemetryRuntimeContext {
  readonly packageName: "@firfi/huly-mcp" | "@firfi/huly-cli"
  readonly surface: TelemetrySurface
}

export const mcpTelemetryContext: TelemetryRuntimeContext = {
  packageName: "@firfi/huly-mcp",
  surface: "mcp"
}

export const cliTelemetryContext: TelemetryRuntimeContext = {
  packageName: "@firfi/huly-cli",
  surface: "cli"
}
