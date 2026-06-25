import * as fc from "fast-check"
import { describe, expect, it } from "vitest"

import { createPostHogTelemetry, type PostHogTelemetryDependencies } from "../../src/telemetry/posthog.js"
import type { SessionStartProps, ToolCalledProps } from "../../src/telemetry/telemetry.js"
import { propertyTestParameters } from "../helpers/property.js"

type TelemetryOperation =
  | { readonly props: SessionStartProps; readonly type: "sessionStart" }
  | { readonly type: "firstListTools" }
  | { readonly props: ToolCalledProps; readonly type: "toolCalled" }

type TimelineEntry =
  | {
    readonly distinctId: string
    readonly event: string
    readonly properties: Record<string, unknown>
    readonly type: "capture"
  }
  | { readonly timeoutMs: number | undefined; readonly type: "shutdown" }

const categoryArbitrary = fc.stringMatching(/^[a-z][a-z0-9_-]{0,16}$/)
const sessionStartArbitrary = fc.record({
  authMethod: fc.constantFrom("token", "password"),
  toolCount: fc.integer({ min: 0, max: 10_000 }),
  toolsets: fc.option(fc.array(categoryArbitrary, { maxLength: 8 }), { nil: null }),
  transport: fc.constantFrom("stdio", "http")
}) satisfies fc.Arbitrary<SessionStartProps>

const toolCalledArbitrary = fc.record(
  {
    clientKind: fc.constantFrom(
      "claude-code",
      "claude-ai",
      "cursor",
      "windsurf",
      "github-copilot",
      "codex",
      "opencode",
      "unknown"
    ),
    durationMs: fc.integer({ min: 0, max: 3_600_000 }),
    editMode: fc.string({ maxLength: 24 }),
    errorTag: fc.string({ maxLength: 48 }),
    inputBytes: fc.integer({ min: 0, max: 10_000_000 }),
    outputBytes: fc.integer({ min: 0, max: 10_000_000 }),
    resolvedMode: fc.constantFrom("native", "proxy"),
    status: fc.constantFrom("success", "error"),
    toolName: fc.stringMatching(/^[a-z][a-z0-9_]{0,40}$/)
  },
  { requiredKeys: ["durationMs", "status", "toolName"] }
) satisfies fc.Arbitrary<ToolCalledProps>

const operationArbitrary = fc.oneof(
  sessionStartArbitrary.map((props): TelemetryOperation => ({ props, type: "sessionStart" })),
  fc.constant({ type: "firstListTools" }),
  toolCalledArbitrary.map((props): TelemetryOperation => ({ props, type: "toolCalled" }))
) satisfies fc.Arbitrary<TelemetryOperation>

const makeDependencies = (
  timeline: Array<TimelineEntry>,
  rejectShutdown: boolean
): PostHogTelemetryDependencies => ({
  createClient: () => ({
    capture: (event) => {
      timeline.push({
        distinctId: event.distinctId,
        event: event.event,
        properties: event.properties,
        type: "capture"
      })
    },
    shutdown: (timeoutMs) => {
      timeline.push({ timeoutMs, type: "shutdown" })
      return rejectShutdown ? Promise.reject(new Error("flush failed")) : Promise.resolve()
    }
  }),
  createSessionId: () => "00000000-0000-4000-8000-000000000001",
  writeDebug: () => {}
})

const applyOperation = (
  telemetry: ReturnType<typeof createPostHogTelemetry>,
  operation: TelemetryOperation
): void => {
  switch (operation.type) {
    case "sessionStart":
      telemetry.sessionStart(operation.props)
      break
    case "firstListTools":
      telemetry.firstListTools()
      break
    case "toolCalled":
      telemetry.toolCalled(operation.props)
      break
  }
}

const expectedEvents = (operations: ReadonlyArray<TelemetryOperation>): ReadonlyArray<string> => {
  let firstListToolsSeen = false
  const events: Array<string> = []

  for (const operation of operations) {
    switch (operation.type) {
      case "sessionStart":
        events.push("session_start")
        break
      case "firstListTools":
        if (!firstListToolsSeen) {
          events.push("first_list_tools")
          firstListToolsSeen = true
        }
        break
      case "toolCalled":
        events.push("tool_called")
        break
    }
  }

  return events
}

const expectedEventProperties = (
  operations: ReadonlyArray<TelemetryOperation>
): ReadonlyArray<Readonly<Record<string, unknown>>> => {
  let firstListToolsSeen = false
  const properties: Array<Readonly<Record<string, unknown>>> = []

  for (const operation of operations) {
    switch (operation.type) {
      case "sessionStart":
        properties.push({
          auth_method: operation.props.authMethod,
          tool_count: operation.props.toolCount,
          toolsets: operation.props.toolsets,
          transport: operation.props.transport
        })
        break
      case "firstListTools":
        if (!firstListToolsSeen) {
          properties.push({})
          firstListToolsSeen = true
        }
        break
      case "toolCalled":
        properties.push({
          duration_ms: operation.props.durationMs,
          status: operation.props.status,
          tool_name: operation.props.toolName,
          ...(operation.props.clientKind === undefined ? {} : { client_kind: operation.props.clientKind }),
          ...(operation.props.editMode === undefined ? {} : { edit_mode: operation.props.editMode }),
          ...(operation.props.errorTag === undefined ? {} : { error_tag: operation.props.errorTag }),
          ...(operation.props.inputBytes === undefined ? {} : { input_bytes: operation.props.inputBytes }),
          ...(operation.props.outputBytes === undefined ? {} : { output_bytes: operation.props.outputBytes }),
          ...(operation.props.resolvedMode === undefined ? {} : { resolved_mode: operation.props.resolvedMode })
        })
        break
    }
  }

  return properties
}

const captureEntries = (
  timeline: ReadonlyArray<TimelineEntry>
): ReadonlyArray<Extract<TimelineEntry, { readonly type: "capture" }>> =>
  timeline.filter((entry) => entry.type === "capture")

describe("createPostHogTelemetry properties", () => {
  it("captures generated operation sequences in order with one first_list_tools event", async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(operationArbitrary, { maxLength: 30 }), async (operations) => {
        const timeline: Array<TimelineEntry> = []
        const telemetry = createPostHogTelemetry(false, makeDependencies(timeline, false))

        for (const operation of operations) {
          applyOperation(telemetry, operation)
        }

        const captures = captureEntries(timeline)

        expect(captures.map((entry) => entry.event)).toEqual(expectedEvents(operations))
        expect(captures.map((entry) => {
          const { $ip: _ip, session_id: _sessionId, version: _version, ...eventProperties } = entry.properties
          return eventProperties
        })).toEqual(expectedEventProperties(operations))
        expect(captures.filter((entry) => entry.event === "first_list_tools")).toHaveLength(
          operations.some((operation) => operation.type === "firstListTools") ? 1 : 0
        )
        for (const entry of captures) {
          expect(entry.distinctId).toBe("00000000-0000-4000-8000-000000000001")
          expect(entry.properties.session_id).toBe("00000000-0000-4000-8000-000000000001")
          expect(entry.properties.version).toBeTypeOf("string")
          expect(entry.properties.$ip).toBeNull()
        }
      }),
      propertyTestParameters
    )
  })

  it("emits session_end before flushing and swallows generated shutdown failures", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(operationArbitrary, { maxLength: 20 }),
        fc.boolean(),
        async (operations, rejectShutdown) => {
          const timeline: Array<TimelineEntry> = []
          const telemetry = createPostHogTelemetry(false, makeDependencies(timeline, rejectShutdown))

          for (const operation of operations) {
            applyOperation(telemetry, operation)
          }
          await expect(telemetry.shutdown()).resolves.toBeUndefined()

          expect(timeline.at(-2)).toMatchObject({ event: "session_end", type: "capture" })
          expect(timeline.at(-1)).toEqual({ timeoutMs: 2000, type: "shutdown" })
        }
      ),
      propertyTestParameters
    )
  })
})
