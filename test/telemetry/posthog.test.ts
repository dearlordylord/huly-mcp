import { beforeEach, describe, expect, it, vi } from "vitest"
import { createPostHogTelemetry } from "../../src/telemetry/posthog.js"

const mockCapture = vi.fn()
const mockShutdown = vi.fn().mockResolvedValue(undefined)

vi.mock("posthog-node", () => ({
  PostHog: class {
    capture = mockCapture
    shutdown = mockShutdown
  }
}))

describe("createPostHogTelemetry", () => {
  beforeEach(() => {
    mockCapture.mockReset()
    mockShutdown.mockReset().mockResolvedValue(undefined)
  })

  describe("sessionStart", () => {
    // test-revizorro: approved
    it("captures event with correct property mapping", () => {
      const telemetry = createPostHogTelemetry(false)
      telemetry.sessionStart({
        transport: "stdio",
        authMethod: "token",
        toolCount: 7,
        toolsets: ["issues", "documents"]
      })

      expect(mockCapture).toHaveBeenCalledOnce()
      const call = mockCapture.mock.calls[0][0]
      expect(call.event).toBe("session_start")
      expect(call.properties).toMatchObject({
        transport: "stdio",
        auth_method: "token",
        tool_count: 7,
        toolsets: ["issues", "documents"]
      })
      expect(call.properties.session_id).toBeTypeOf("string")
      expect(call.properties.version).toBeTypeOf("string")
    })

    // test-revizorro: suspect | missing assertion for tool_count property; testInput sets toolCount: 0 but never verified in expects
    it("maps http transport correctly", () => {
      const telemetry = createPostHogTelemetry(false)
      telemetry.sessionStart({
        transport: "http",
        authMethod: "password",
        toolCount: 0,
        toolsets: null
      })

      const call = mockCapture.mock.calls[0][0]
      expect(call.properties.transport).toBe("http")
      expect(call.properties.auth_method).toBe("password")
      expect(call.properties.toolsets).toBeNull()
    })
  })

  describe("firstListTools", () => {
    // test-revizorro: approved
    it("captures only once; subsequent calls are noop", () => {
      const telemetry = createPostHogTelemetry(false)

      telemetry.firstListTools()
      telemetry.firstListTools()
      telemetry.firstListTools()

      const calls = mockCapture.mock.calls.filter(
        (c) => c[0].event === "first_list_tools"
      )
      expect(calls).toHaveLength(1)
    })

    // test-revizorro: approved
    it("captures with session_id and version in properties", () => {
      const telemetry = createPostHogTelemetry(false)
      telemetry.firstListTools()

      const call = mockCapture.mock.calls[0][0]
      expect(call.event).toBe("first_list_tools")
      expect(call.properties.session_id).toBeTypeOf("string")
      expect(call.properties.version).toBeTypeOf("string")
    })
  })

  describe("toolCalled", () => {
    // test-revizorro: approved
    it("captures with correct property mapping", () => {
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
    })

    // test-revizorro: approved
    it("omits error_tag when not provided", () => {
      const telemetry = createPostHogTelemetry(false)
      telemetry.toolCalled({
        toolName: "get_issue",
        status: "success",
        durationMs: 10
      })

      const call = mockCapture.mock.calls[0][0]
      expect(call.properties).not.toHaveProperty("error_tag")
    })

    // test-revizorro: approved
    it("includes error_tag when provided", () => {
      const telemetry = createPostHogTelemetry(false)
      telemetry.toolCalled({
        toolName: "get_issue",
        status: "error",
        errorTag: "HulyConnectionError",
        durationMs: 150
      })

      const call = mockCapture.mock.calls[0][0]
      expect(call.properties.error_tag).toBe("HulyConnectionError")
      expect(call.properties.status).toBe("error")
    })
  })

  describe("shutdown", () => {
    // test-revizorro: approved
    it("captures session_end then calls client.shutdown with timeout", async () => {
      const telemetry = createPostHogTelemetry(false)
      await telemetry.shutdown()

      const endCalls = mockCapture.mock.calls.filter(
        (c) => c[0].event === "session_end"
      )
      expect(endCalls).toHaveLength(1)
      expect(mockShutdown).toHaveBeenCalledOnce()
      expect(mockShutdown).toHaveBeenCalledWith(2000)
    })

    // test-revizorro: suspect | incomplete verification: doesn't check mockShutdown called or session_end captured before rejection
    it("does not throw when client.shutdown rejects", async () => {
      mockShutdown.mockRejectedValueOnce(new Error("flush timeout"))
      const telemetry = createPostHogTelemetry(false)
      await expect(telemetry.shutdown()).resolves.toBeUndefined()
    })

    // test-revizorro: approved
    it("logs shutdown error in debug mode", async () => {
      const stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {})
      mockShutdown.mockRejectedValueOnce(new Error("flush timeout"))

      const telemetry = createPostHogTelemetry(true)
      await telemetry.shutdown()

      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining("[telemetry] shutdown error")
      )
      stderrSpy.mockRestore()
    })
  })

  describe("debug mode", () => {
    // test-revizorro: approved
    it("logs sessionStart to console.error", () => {
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
    it("logs firstListTools to console.error", () => {
      const stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {})
      const telemetry = createPostHogTelemetry(true)

      telemetry.firstListTools()

      expect(stderrSpy).toHaveBeenCalledWith("[telemetry] first_list_tools")
      stderrSpy.mockRestore()
    })

    // test-revizorro: approved
    it("logs toolCalled to console.error", () => {
      const stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {})
      const telemetry = createPostHogTelemetry(true)

      telemetry.toolCalled({
        toolName: "x",
        status: "success",
        durationMs: 0
      })

      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining("[telemetry] tool_called")
      )
      stderrSpy.mockRestore()
    })

    // test-revizorro: approved
    it("logs shutdown to console.error", async () => {
      const stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {})
      const telemetry = createPostHogTelemetry(true)

      await telemetry.shutdown()

      expect(stderrSpy).toHaveBeenCalledWith("[telemetry] shutting down")
      stderrSpy.mockRestore()
    })
  })

  describe("capture error handling", () => {
    // test-revizorro: approved
    it("does not throw when client.capture throws", () => {
      mockCapture.mockImplementationOnce(() => {
        throw new Error("network down")
      })
      const telemetry = createPostHogTelemetry(false)
      expect(() => telemetry.firstListTools()).not.toThrow()
    })

    // test-revizorro: approved
    it("logs capture error in debug mode", () => {
      const stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {})
      mockCapture.mockImplementationOnce(() => {
        throw new Error("capture failed")
      })
      const telemetry = createPostHogTelemetry(true)
      telemetry.firstListTools()

      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining("[telemetry] capture error")
      )
      stderrSpy.mockRestore()
    })

    // test-revizorro: approved
    it("does not log capture error when debug is off", () => {
      const stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {})
      mockCapture.mockImplementationOnce(() => {
        throw new Error("capture failed")
      })
      const telemetry = createPostHogTelemetry(false)
      telemetry.firstListTools()

      const captureErrorCalls = stderrSpy.mock.calls.filter(
        (c) => typeof c[0] === "string" && c[0].includes("[telemetry] capture error")
      )
      expect(captureErrorCalls).toHaveLength(0)
      stderrSpy.mockRestore()
    })
  })

  describe("session identity", () => {
    // test-revizorro: approved
    it("uses consistent sessionId across all events", () => {
      const telemetry = createPostHogTelemetry(false)
      telemetry.sessionStart({
        transport: "stdio",
        authMethod: "password",
        toolCount: 1,
        toolsets: null
      })
      telemetry.firstListTools()
      telemetry.toolCalled({
        toolName: "x",
        status: "success",
        durationMs: 0
      })

      expect(mockCapture).toHaveBeenCalledTimes(3)
      const ids = mockCapture.mock.calls.map((c) => c[0].distinctId)
      expect(ids[0]).toBe(ids[1])
      expect(ids[1]).toBe(ids[2])
      expect(ids[0]).toMatch(/^[0-9a-f-]{36}$/)
    })

    // test-revizorro: approved
    it("different instances get different session ids", () => {
      const t1 = createPostHogTelemetry(false)
      const t2 = createPostHogTelemetry(false)
      t1.firstListTools()
      t2.firstListTools()

      // Both capture but with different distinctIds
      expect(mockCapture).toHaveBeenCalledTimes(2)
      const id1 = mockCapture.mock.calls[0][0].distinctId
      const id2 = mockCapture.mock.calls[1][0].distinctId
      expect(id1).not.toBe(id2)
    })
  })
})
