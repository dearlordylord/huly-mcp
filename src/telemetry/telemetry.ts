import { Config, Context, Effect, Layer } from "effect"

import { createNoopTelemetry } from "./noop.js"
import { createPostHogTelemetry } from "./posthog.js"

export type SessionStartProps = {
  readonly transport: "stdio" | "http"
  readonly authMethod: "token" | "password"
  readonly toolCount: number
  readonly toolsets: ReadonlyArray<string> | null
}

export type ToolCalledProps = {
  readonly toolName: string
  readonly status: "success" | "error"
  readonly errorTag?: string | undefined
  readonly durationMs: number
}

export interface TelemetryOperations {
  readonly sessionStart: (props: SessionStartProps) => void
  readonly firstListTools: () => void
  readonly toolCalled: (props: ToolCalledProps) => void
  readonly shutdown: () => Promise<void>
}

const telemetryEnabled = Config.map(
  Config.string("HULY_MCP_TELEMETRY").pipe(Config.withDefault("1")),
  (v) => v !== "0"
)

const telemetryDebug = Config.map(
  Config.string("HULY_MCP_TELEMETRY_DEBUG").pipe(Config.withDefault("0")),
  (v) => v === "1"
)

export class TelemetryService extends Context.Tag("@hulymcp/Telemetry")<
  TelemetryService,
  TelemetryOperations
>() {
  // Config reads have defaults so ConfigError cannot occur; orDie absorbs the impossible error
  static readonly layer: Layer.Layer<TelemetryService> = Layer.effect(
    TelemetryService,
    Effect.gen(function*() {
      const enabled = yield* Effect.orDie(telemetryEnabled)
      const debug = yield* Effect.orDie(telemetryDebug)
      return enabled ? createPostHogTelemetry(debug) : createNoopTelemetry()
    })
  )

  static testLayer(
    ops?: Partial<TelemetryOperations>
  ): Layer.Layer<TelemetryService> {
    return Layer.succeed(TelemetryService, {
      ...createNoopTelemetry(),
      ...ops
    })
  }
}
