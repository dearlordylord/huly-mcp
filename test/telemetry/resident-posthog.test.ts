import { expect, it } from "vitest"

import { Count } from "../../src/domain/schemas/shared.js"

import { mcpTelemetryContext } from "../../src/telemetry/context.js"
import { createPostHogTelemetry } from "../../src/telemetry/posthog.js"

it("emits versioned resident analytics, keeps HTTP transport separate, and flushes once after closure", async () => {
  const timeline: Array<{ readonly event: string; readonly properties?: Record<string, unknown> }> = []
  const telemetry = createPostHogTelemetry(
    false,
    {
      createClient: () => ({
        capture: ({ event, properties }) => {
          timeline.push({ event, properties })
        },
        shutdown: async () => {
          timeline.push({ event: "flush" })
        }
      }),
      createSessionId: () => "backend-session",
      writeDebug: () => {}
    },
    { ...mcpTelemetryContext, runtimeMode: "resident" }
  )
  const id = "00000000-0000-4000-8000-000000000001"
  telemetry.sessionStart({ transport: "http", authMethod: "token", toolCount: 1, toolsets: null })
  telemetry.residentReady()
  telemetry.residentAttachment({ phase: "admitted", attachment_id: id, retained_attachments: Count.make(1) })
  telemetry.residentAttachment({ phase: "activity_observed", attachment_id: id, first_activity: "tool_call" })
  telemetry.toolCalled({ toolName: "list_projects", status: "cancelled", attachmentId: id, durationMs: 10 })
  telemetry.residentFailure({ stage: "work", reason: "capacity", attachment_id: id })
  telemetry.residentAttachment({ phase: "closed", attachment_id: id, duration_ms: 20, reason: "backend_shutdown" })
  await Promise.all([telemetry.shutdown(), telemetry.shutdown()])
  expect(timeline.map(({ event }) => event)).toEqual([
    "session_start",
    "resident_ready",
    "resident_attachment",
    "resident_attachment",
    "tool_called",
    "resident_failure",
    "resident_attachment",
    "session_end",
    "flush"
  ])
  for (const entry of timeline.filter(({ event }) => event !== "flush")) {
    expect(entry.properties).toMatchObject({
      telemetry_schema_version: 2,
      runtime_mode: "resident",
      session_id: "backend-session",
      $ip: null
    })
  }
  expect(timeline[0]?.properties?.transport).toBe("http")
  expect(timeline[4]?.properties).toMatchObject({ attachment_id: id, status: "cancelled", call_path: "direct" })
  expect(Object.keys(timeline[5]?.properties ?? {}).sort((a, b) => a.localeCompare(b))).toEqual([
    "$ip",
    "attachment_id",
    "package_name",
    "reason",
    "runtime_mode",
    "session_id",
    "stage",
    "surface",
    "telemetry_schema_version",
    "version"
  ])
})

it("contains capture, debug and synchronous shutdown failures", async () => {
  const telemetry = createPostHogTelemetry(true, {
    createClient: () => ({
      capture: () => {
        throw new Error("capture")
      },
      shutdown: () => {
        throw new Error("shutdown")
      }
    }),
    createSessionId: () => "session",
    writeDebug: () => {
      throw new Error("debug")
    }
  })
  telemetry.residentReady()
  telemetry.residentFailure({ stage: "startup", reason: "failed" })
  telemetry.residentAttachment({
    phase: "admitted",
    attachment_id: "00000000-0000-4000-8000-000000000001",
    retained_attachments: Count.make(1)
  })
  await telemetry.shutdown()
})
