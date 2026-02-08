import { describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { afterEach, beforeEach, expect, vi } from "vitest"
import { createNoopTelemetry } from "../../src/telemetry/noop.js"
import { createPostHogTelemetry } from "../../src/telemetry/posthog.js"
import { TelemetryService } from "../../src/telemetry/telemetry.js"

const mockCapture = vi.fn()
const mockShutdown = vi.fn().mockResolvedValue(undefined)

vi.mock("posthog-node", () => ({
  PostHog: class {
    capture = mockCapture
    shutdown = mockShutdown
  }
}))

describe("Telemetry", () => {
  beforeEach(() => {
    mockCapture.mockClear()
    mockShutdown.mockClear()
  })

  describe("createNoopTelemetry", () => {
    // test-revizorro: approved
    it("all methods are callable without throwing", () => {
      const noop = createNoopTelemetry()
      expect(() =>
        noop.sessionStart({
          transport: "stdio",
          authMethod: "password",
          toolCount: 10,
          toolsets: null
        })
      ).not.toThrow()
      expect(() => noop.firstListTools()).not.toThrow()
      expect(() =>
        noop.toolCalled({
          toolName: "test",
          status: "success",
          durationMs: 100
        })
      ).not.toThrow()
    })

    // test-revizorro: approved
    it("shutdown resolves", async () => {
      const noop = createNoopTelemetry()
      await expect(noop.shutdown()).resolves.toBeUndefined()
    })
  })

  describe("createPostHogTelemetry", () => {
    // test-revizorro: approved
    it("sessionStart captures with correct event and properties", () => {
      const telemetry = createPostHogTelemetry(false)
      telemetry.sessionStart({
        transport: "stdio",
        authMethod: "token",
        toolCount: 5,
        toolsets: ["issues"]
      })

      expect(mockCapture).toHaveBeenCalledOnce()
      const call = mockCapture.mock.calls[0][0]
      expect(call.event).toBe("session_start")
      expect(call.properties).toMatchObject({
        transport: "stdio",
        auth_method: "token",
        tool_count: 5,
        toolsets: ["issues"]
      })
      expect(call.properties.session_id).toBeTypeOf("string")
      expect(call.properties.version).toBeTypeOf("string")
    })

    // test-revizorro: approved
    it("toolCalled captures with correct event and properties", () => {
      const telemetry = createPostHogTelemetry(false)
      telemetry.toolCalled({
        toolName: "list_issues",
        status: "success",
        durationMs: 42
      })

      expect(mockCapture).toHaveBeenCalledOnce()
      const call = mockCapture.mock.calls[0][0]
      expect(call.event).toBe("tool_called")
      expect(call.properties).toMatchObject({
        tool_name: "list_issues",
        status: "success",
        duration_ms: 42
      })
      expect(call.properties).not.toHaveProperty("error_tag")
    })

    // test-revizorro: approved
    it("toolCalled with error captures errorTag", () => {
      const telemetry = createPostHogTelemetry(false)
      telemetry.toolCalled({
        toolName: "get_issue",
        status: "error",
        errorTag: "HulyConnectionError",
        durationMs: 150
      })

      expect(mockCapture).toHaveBeenCalledOnce()
      const call = mockCapture.mock.calls[0][0]
      expect(call.properties).toMatchObject({
        status: "error",
        error_tag: "HulyConnectionError"
      })
    })

    // test-revizorro: approved
    it("sessionId is consistent across calls", () => {
      const telemetry = createPostHogTelemetry(false)
      telemetry.sessionStart({
        transport: "stdio",
        authMethod: "password",
        toolCount: 1,
        toolsets: null
      })
      telemetry.toolCalled({
        toolName: "x",
        status: "success",
        durationMs: 0
      })

      expect(mockCapture).toHaveBeenCalledTimes(2)
      const id1 = mockCapture.mock.calls[0][0].distinctId
      const id2 = mockCapture.mock.calls[1][0].distinctId
      expect(id1).toBe(id2)
      expect(id1).toMatch(/^[0-9a-f-]{36}$/)
    })

    // test-revizorro: approved
    it("firstListTools deduplicates — only first call captures", () => {
      const telemetry = createPostHogTelemetry(false)

      telemetry.firstListTools()
      telemetry.firstListTools()
      telemetry.firstListTools()

      const listToolsCalls = mockCapture.mock.calls.filter(
        (c) => c[0].event === "first_list_tools"
      )
      expect(listToolsCalls).toHaveLength(1)
    })

    // test-revizorro: approved
    it("debug mode logs to stderr", () => {
      const stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {})
      const telemetry = createPostHogTelemetry(true)

      telemetry.sessionStart({
        transport: "http",
        authMethod: "password",
        toolCount: 3,
        toolsets: null
      })

      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining("[telemetry] session_start")
      )

      stderrSpy.mockRestore()
    })

    // test-revizorro: approved
    it("shutdown captures session_end then flushes", async () => {
      const telemetry = createPostHogTelemetry(false)
      await telemetry.shutdown()

      const endCalls = mockCapture.mock.calls.filter(
        (c) => c[0].event === "session_end"
      )
      expect(endCalls).toHaveLength(1)
      expect(mockShutdown).toHaveBeenCalledOnce()
      expect(mockShutdown).toHaveBeenCalledWith(2000)
    })

    // test-revizorro: approved
    it("capture failure does not throw", () => {
      mockCapture.mockImplementationOnce(() => {
        throw new Error("network down")
      })
      const telemetry = createPostHogTelemetry(false)
      expect(() => telemetry.firstListTools()).not.toThrow()
    })
  })

  describe("TelemetryService", () => {
    it.scoped("layer provides telemetry with default config (enabled)", () =>
      Effect.gen(function*() {
        const telemetry = yield* TelemetryService
        expect(telemetry.sessionStart).toBeTypeOf("function")
        expect(telemetry.firstListTools).toBeTypeOf("function")
        expect(telemetry.toolCalled).toBeTypeOf("function")
        expect(telemetry.shutdown).toBeTypeOf("function")
      }).pipe(Effect.provide(TelemetryService.layer)))

    it.scoped("testLayer provides noop by default", () =>
      Effect.gen(function*() {
        const telemetry = yield* TelemetryService
        telemetry.sessionStart({
          transport: "stdio",
          authMethod: "password",
          toolCount: 1,
          toolsets: null
        })
        telemetry.toolCalled({
          toolName: "x",
          status: "success",
          durationMs: 0
        })
        // noop should not have called the mock
        expect(mockCapture).not.toHaveBeenCalled()
      }).pipe(Effect.provide(TelemetryService.testLayer())))

    it.scoped("testLayer allows overriding operations", () => {
      let called = false
      return Effect.gen(function*() {
        const telemetry = yield* TelemetryService
        telemetry.firstListTools()
        expect(called).toBe(true)
      }).pipe(Effect.provide(TelemetryService.testLayer({
        firstListTools: () => {
          called = true
        }
      })))
    })
  })

  describe("Layer selection via env", () => {
    const envKey = "HULY_MCP_TELEMETRY"
    let original: string | undefined

    beforeEach(() => {
      original = process.env[envKey]
    })

    afterEach(() => {
      if (original === undefined) {
        delete process.env[envKey]
      } else {
        process.env[envKey] = original
      }
    })

    it.scoped("HULY_MCP_TELEMETRY=0 yields noop (no captures)", () => {
      process.env[envKey] = "0"
      return Effect.gen(function*() {
        const telemetry = yield* TelemetryService
        telemetry.sessionStart({
          transport: "stdio",
          authMethod: "password",
          toolCount: 0,
          toolsets: null
        })
        telemetry.toolCalled({
          toolName: "test",
          status: "success",
          durationMs: 10
        })
        // noop implementation: PostHog capture should not be called
        expect(mockCapture).not.toHaveBeenCalled()
      }).pipe(Effect.provide(TelemetryService.layer))
    })
  })
})
