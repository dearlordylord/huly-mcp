import { Config, Context, Effect, Layer } from "effect"

import type { ClientKind, ToolExposureMode } from "../mcp/tool-mode.js"
import {
  cliTelemetryContext,
  mcpTelemetryContext,
  type TelemetryRuntimeContext,
  type TelemetrySurface
} from "./context.js"
import { createNoopTelemetry } from "./noop.js"
import { createPostHogTelemetryWithContext } from "./posthog.js"

// Telemetry is aggregate usage analytics. It must not include Diagnostics
// messages, workspace content, returned payload data, or backend error text.
export type SessionStartProps = {
  readonly transport: "stdio" | "http" | "cli"
  readonly authMethod: "token" | "password"
  readonly toolCount: number
  readonly toolsets: ReadonlyArray<string> | null
}

export type ToolCalledProps = {
  readonly toolName: string
  readonly status: "success" | "error"
  readonly clientKind?: ClientKind | undefined
  readonly resolvedMode?: ToolExposureMode | undefined
  readonly errorTag?: string | undefined
  readonly durationMs: number
  readonly inputBytes?: number | undefined
  readonly outputBytes?: number | undefined
  readonly editMode?: string | undefined
}

export type FirstListToolsProps = {
  readonly clientKind: ClientKind
  readonly resolvedMode: ToolExposureMode
}

export interface TelemetryOperations {
  readonly sessionStart: (props: SessionStartProps) => void
  readonly firstListTools: (props?: FirstListToolsProps) => void
  readonly toolCalled: (props: ToolCalledProps) => void
  readonly shutdown: () => Promise<void>
}

const telemetryEnvNames = {
  cli: {
    debug: "HULY_CLI_TELEMETRY_DEBUG",
    enabled: "HULY_CLI_TELEMETRY"
  },
  mcp: {
    debug: "HULY_MCP_TELEMETRY_DEBUG",
    enabled: "HULY_MCP_TELEMETRY"
  }
} satisfies Record<TelemetrySurface, { readonly debug: string; readonly enabled: string }>

const telemetryEnabled = (surface: TelemetrySurface) =>
  Config.map(
    Config.string(telemetryEnvNames[surface].enabled).pipe(Config.withDefault("1")),
    (v) => v !== "0"
  )

const telemetryDebug = (surface: TelemetrySurface) =>
  Config.map(
    Config.string(telemetryEnvNames[surface].debug).pipe(Config.withDefault("0")),
    (v) => v === "1"
  )

export class TelemetryService extends Context.Tag("@hulymcp/Telemetry")<
  TelemetryService,
  TelemetryOperations
>() {
  // Config reads have defaults so ConfigError cannot occur; orDie absorbs the impossible error
  static readonly layerForContext = (
    context: TelemetryRuntimeContext
  ): Layer.Layer<TelemetryService> =>
    Layer.effect(
      TelemetryService,
      Effect.gen(function*() {
        const enabled = yield* Effect.orDie(telemetryEnabled(context.surface))
        const debug = yield* Effect.orDie(telemetryDebug(context.surface))
        return enabled ? createPostHogTelemetryWithContext(debug, context) : createNoopTelemetry()
      })
    )

  static readonly layer: Layer.Layer<TelemetryService> = TelemetryService.layerForContext(mcpTelemetryContext)

  static readonly cliLayer: Layer.Layer<TelemetryService> = TelemetryService.layerForContext(cliTelemetryContext)

  static testLayer(
    ops?: Partial<TelemetryOperations>
  ): Layer.Layer<TelemetryService> {
    return Layer.succeed(TelemetryService, {
      ...createNoopTelemetry(),
      ...ops
    })
  }
}
