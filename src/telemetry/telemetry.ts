import { Context, Effect, Layer } from "effect"

import type { ClientKind, ToolExposureMode } from "../mcp/tool-mode.js"
import { cliTelemetryContext, mcpTelemetryContext, type TelemetryRuntimeContext } from "./context.js"
import { telemetryDebug, telemetryEnabled } from "./configuration.js"
import type { ResidentAttachmentEvent, ResidentFailureEvent, ToolStatus } from "./events.js"
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

/**
 * How the caller reached the operation. Distinct from the exposure mode in
 * `resolvedMode`: a proxy-mode session calls discovery tools directly and reaches
 * every other operation through the `invoke_tool` dispatcher.
 */
export type ToolCallPath = "direct" | "invoke_tool"

// Internal port input; the PostHog adapter schema owns the serialized event properties.
export type ToolCalledProps = {
  // The underlying operation, not the dispatcher: a call routed through invoke_tool
  // reports the resolved target here, so one dimension covers both call paths.
  readonly toolName: string
  readonly callPath?: ToolCallPath | undefined
  readonly status: ToolStatus
  readonly clientKind?: ClientKind | undefined
  readonly resolvedMode?: ToolExposureMode | undefined
  readonly errorTag?: string | undefined
  readonly attachmentId?: string
  readonly durationMs: number
  readonly inputBytes?: number | undefined
  readonly outputBytes?: number | undefined
  readonly editMode?: string | undefined
}

export type FirstListToolsProps = { readonly clientKind: ClientKind; readonly resolvedMode: ToolExposureMode }

export interface TelemetryOperations {
  readonly sessionStart: (props: SessionStartProps) => void
  readonly firstListTools: (props?: FirstListToolsProps) => void
  readonly toolCalled: (props: ToolCalledProps) => void
  readonly residentReady: () => void
  readonly residentAttachment: (event: ResidentAttachmentEvent) => void
  readonly residentFailure: (event: ResidentFailureEvent) => void
  readonly shutdown: () => Promise<void>
}

export interface TelemetryFactories {
  readonly enabled: (debug: boolean, context: TelemetryRuntimeContext) => TelemetryOperations
  readonly disabled: () => TelemetryOperations
}

const defaultTelemetryFactories: TelemetryFactories = {
  enabled: createPostHogTelemetryWithContext,
  disabled: createNoopTelemetry
}

export class TelemetryService extends Context.Service<TelemetryService, TelemetryOperations>()("@hulymcp/Telemetry") {
  static readonly layerForContext = (
    context: TelemetryRuntimeContext,
    factories: TelemetryFactories = defaultTelemetryFactories
  ): Layer.Layer<TelemetryService> =>
    Layer.effect(
      TelemetryService,
      Effect.gen(function* () {
        const enabled = yield* Effect.orDie(telemetryEnabled(context.surface))
        const debug = yield* Effect.orDie(telemetryDebug(context.surface))
        return enabled ? factories.enabled(debug, context) : factories.disabled()
      })
    )

  static readonly layer: Layer.Layer<TelemetryService> = TelemetryService.layerForContext(mcpTelemetryContext)

  static readonly residentLayer = TelemetryService.layerForContext({ ...mcpTelemetryContext, runtimeMode: "resident" })

  static readonly cliLayer: Layer.Layer<TelemetryService> = TelemetryService.layerForContext(cliTelemetryContext)

  static testLayer(ops?: Partial<TelemetryOperations>): Layer.Layer<TelemetryService> {
    return Layer.succeed(TelemetryService, { ...createNoopTelemetry(), ...ops })
  }
}
