import { PostHog } from "posthog-node"
import { Schema } from "effect"

import { writeStderrLine } from "../utils/stderr.js"
import { VERSION } from "../version.js"
import { mcpTelemetryContext, type TelemetryRuntimeContext } from "./context.js"
import type { TelemetryOperations } from "./telemetry.js"

const POSTHOG_API_KEY = "phc_TGfFqCGdnF0p68wuFzd5WSw1IsBvOJW0YgoMJDyZPjm"
const SHUTDOWN_TIMEOUT_MS = 2000

type SessionStartProperties = {
  readonly transport: "stdio" | "http" | "cli"
  readonly auth_method: "token" | "password"
  readonly tool_count: number
  readonly toolsets: ReadonlyArray<string> | null
}

const ToolCalledPropertiesSchema = Schema.Struct({
  tool_name: Schema.String,
  call_path: Schema.Literals(["direct", "invoke_tool"]),
  status: Schema.Literals(["success", "error"]),
  duration_ms: Schema.Number,
  client_kind: Schema.optionalKey(Schema.String),
  resolved_mode: Schema.optionalKey(Schema.String),
  error_tag: Schema.optionalKey(Schema.String),
  input_bytes: Schema.optionalKey(Schema.Number),
  output_bytes: Schema.optionalKey(Schema.Number),
  edit_mode: Schema.optionalKey(Schema.String)
})
type ToolCalledProperties = Schema.Schema.Type<typeof ToolCalledPropertiesSchema>

type FirstListToolsProperties = { readonly client_kind?: string; readonly resolved_mode?: string }

type TelemetryEvent =
  | { readonly event: "session_start"; readonly properties: SessionStartProperties }
  | { readonly event: "first_list_tools"; readonly properties?: FirstListToolsProperties }
  | { readonly event: "tool_called"; readonly properties: ToolCalledProperties }
  | { readonly event: "session_end"; readonly properties?: undefined }

interface PostHogClientPort {
  readonly capture: (event: {
    readonly distinctId: string
    readonly event: string
    readonly properties: Record<string, unknown>
  }) => void
  readonly shutdown: (timeoutMs?: number) => Promise<void>
}

export interface PostHogTelemetryDependencies {
  readonly createClient: () => PostHogClientPort
  readonly createSessionId: () => string
  readonly writeDebug: (message: string) => void
}

const defaultDependencies: PostHogTelemetryDependencies = {
  createClient: () =>
    new PostHog(POSTHOG_API_KEY, { host: "https://us.i.posthog.com", flushAt: 10, flushInterval: 60000 }),
  createSessionId: () => crypto.randomUUID(),
  writeDebug: (message) => {
    writeStderrLine(message)
  }
}

export const createPostHogTelemetry = (
  debug: boolean,
  dependencies: PostHogTelemetryDependencies = defaultDependencies,
  context: TelemetryRuntimeContext = mcpTelemetryContext
): TelemetryOperations => {
  const client = dependencies.createClient()
  const sessionId = dependencies.createSessionId()
  let listToolsSent = false

  const debugLog = (message: string): void => {
    if (debug) {
      dependencies.writeDebug(message)
    }
  }

  const capture = ({ event, properties }: TelemetryEvent): void => {
    try {
      client.capture({
        distinctId: sessionId,
        event,
        properties: {
          session_id: sessionId,
          version: VERSION,
          package_name: context.packageName,
          surface: context.surface,
          $ip: null,
          ...properties
        }
      })
    } catch (e) {
      debugLog(`[telemetry] capture error: ${String(e)}`)
    }
  }

  return {
    sessionStart: (props) => {
      debugLog(`[telemetry] session_start: ${JSON.stringify(props)}`)
      capture({
        event: "session_start",
        properties: {
          transport: props.transport,
          auth_method: props.authMethod,
          tool_count: props.toolCount,
          toolsets: props.toolsets
        }
      })
    },

    firstListTools: (props) => {
      if (listToolsSent) return
      listToolsSent = true
      debugLog(`[telemetry] first_list_tools: ${JSON.stringify(props ?? {})}`)
      capture(
        props === undefined
          ? { event: "first_list_tools" }
          : {
              event: "first_list_tools",
              properties: { client_kind: props.clientKind, resolved_mode: props.resolvedMode }
            }
      )
    },

    toolCalled: (props) => {
      debugLog(`[telemetry] tool_called: ${JSON.stringify(props)}`)
      capture({
        event: "tool_called",
        properties: {
          tool_name: props.toolName,
          call_path: props.callPath ?? "direct",
          status: props.status,
          duration_ms: props.durationMs,
          ...(props.clientKind !== undefined && { client_kind: props.clientKind }),
          ...(props.resolvedMode !== undefined && { resolved_mode: props.resolvedMode }),
          ...(props.errorTag !== undefined && { error_tag: props.errorTag }),
          ...(props.inputBytes !== undefined && { input_bytes: props.inputBytes }),
          ...(props.outputBytes !== undefined && { output_bytes: props.outputBytes }),
          ...(props.editMode !== undefined && { edit_mode: props.editMode })
        }
      })
    },

    shutdown: async () => {
      capture({ event: "session_end" })
      debugLog("[telemetry] shutting down")
      try {
        await client.shutdown(SHUTDOWN_TIMEOUT_MS)
      } catch (e) {
        debugLog(`[telemetry] shutdown error: ${String(e)}`)
      }
    }
  }
}

export const createPostHogTelemetryWithContext = (
  debug: boolean,
  context: TelemetryRuntimeContext
): TelemetryOperations => createPostHogTelemetry(debug, defaultDependencies, context)
