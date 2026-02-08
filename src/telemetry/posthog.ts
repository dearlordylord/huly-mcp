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
}

type TelemetryEvent =
  | { readonly event: "session_start"; readonly properties: SessionStartProperties }
  | { readonly event: "first_list_tools"; readonly properties?: undefined }
  | { readonly event: "tool_called"; readonly properties: ToolCalledProperties }
  | { readonly event: "session_end"; readonly properties?: undefined }

export const createPostHogTelemetry = (debug: boolean): TelemetryOperations => {
  const client = new PostHog(POSTHOG_API_KEY, {
    host: "https://us.i.posthog.com",
    flushAt: 10,
    flushInterval: 60000
  })

  const sessionId = crypto.randomUUID()
  let listToolsSent = false

  const capture = ({ event, properties }: TelemetryEvent): void => {
    try {
      client.capture({
        distinctId: sessionId,
        event,
        properties: {
          session_id: sessionId,
          version: VERSION,
          ...properties
        }
      })
    } catch (e) {
      if (debug) {
        console.error(`[telemetry] capture error: ${String(e)}`)
      }
    }
  }

  return {
    sessionStart: (props) => {
      if (debug) {
        console.error(`[telemetry] session_start: ${JSON.stringify(props)}`)
      }
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
      if (debug) {
        console.error("[telemetry] first_list_tools")
      }
      capture({ event: "first_list_tools" })
    },

    toolCalled: (props) => {
      if (debug) {
        console.error(`[telemetry] tool_called: ${JSON.stringify(props)}`)
      }
      capture({
        event: "tool_called",
        properties: {
          tool_name: props.toolName,
          status: props.status,
          duration_ms: props.durationMs,
          ...(props.errorTag !== undefined && { error_tag: props.errorTag })
        }
      })
    },

    shutdown: async () => {
      capture({ event: "session_end" })
      if (debug) {
        console.error("[telemetry] shutting down")
      }
      try {
        await client.shutdown(SHUTDOWN_TIMEOUT_MS)
      } catch (e) {
        if (debug) {
          console.error(`[telemetry] shutdown error: ${String(e)}`)
        }
      }
    }
  }
}
