import { PostHog } from "posthog-node"

import { VERSION } from "../version.js"
import type { TelemetryOperations } from "./telemetry.js"

const POSTHOG_API_KEY = "phc_TGfFqCGdnF0p68wuFzd5WSw1IsBvOJW0YgoMJDyZPjm"
const SHUTDOWN_TIMEOUT_MS = 2000

type SessionStartProperties = {
  readonly transport: "stdio" | "http"
  readonly auth_method: "token" | "password"
  readonly tool_count: number
  readonly toolsets: ReadonlyArray<string> | null
}

type ToolCalledProperties = {
  readonly tool_name: string
  readonly status: "success" | "error"
  readonly duration_ms: number
  readonly error_tag?: string
  readonly input_bytes?: number
  readonly output_bytes?: number
  readonly edit_mode?: string
}

type TelemetryEvent =
  | { readonly event: "session_start"; readonly properties: SessionStartProperties }
  | { readonly event: "first_list_tools"; readonly properties?: undefined }
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
    new PostHog(POSTHOG_API_KEY, {
      host: "https://us.i.posthog.com",
      flushAt: 10,
      flushInterval: 60000
    }),
  createSessionId: () => crypto.randomUUID(),
  writeDebug: (message) => {
    console.error(message)
  }
}

export const createPostHogTelemetry = (
  debug: boolean,
  dependencies: PostHogTelemetryDependencies = defaultDependencies
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

    firstListTools: () => {
      if (listToolsSent) return
      listToolsSent = true
      debugLog("[telemetry] first_list_tools")
      capture({ event: "first_list_tools" })
    },

    toolCalled: (props) => {
      debugLog(`[telemetry] tool_called: ${JSON.stringify(props)}`)
      capture({
        event: "tool_called",
        properties: {
          tool_name: props.toolName,
          status: props.status,
          duration_ms: props.durationMs,
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
