import { beforeEach, describe, expect, it, vi } from "vitest"
import { createPostHogTelemetry, type PostHogTelemetryDependencies } from "../../src/telemetry/posthog.js"

const mockCapture = vi.fn()
const mockShutdown = vi.fn().mockResolvedValue(undefined)
const debugMessages: Array<string> = []
let sessionCounter = 0

const makeDependencies = (): PostHogTelemetryDependencies => ({
  createClient: () => ({
    capture: mockCapture,
    shutdown: mockShutdown
  }),
  createSessionId: () => {
    sessionCounter++
    return `00000000-0000-4000-8000-${sessionCounter.toString().padStart(12, "0")}`
  },
  writeDebug: (message) => {
    debugMessages.push(message)
  }
})

const createTelemetry = (debug: boolean) => createPostHogTelemetry(debug, makeDependencies())

describe("createPostHogTelemetry", () => {
  beforeEach(() => {
    mockCapture.mockReset()
    mockShutdown.mockReset().mockResolvedValue(undefined)
    debugMessages.length = 0
    sessionCounter = 0
  })

  describe("sessionStart", () => {
    // test-revizorro: approved
    it("captures event with correct property mapping", () => {
      const telemetry = createTelemetry(false)
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

    // test-revizorro: approved
    it("maps http transport correctly", () => {
      const telemetry = createTelemetry(false)
      telemetry.sessionStart({
        transport: "http",
        authMethod: "password",
        toolCount: 0,
        toolsets: null
      })

      const call = mockCapture.mock.calls[0][0]
      expect(call.properties.transport).toBe("http")
      expect(call.properties.auth_method).toBe("password")
      expect(call.properties.tool_count).toBe(0)
      expect(call.properties.toolsets).toBeNull()
    })
  })

  describe("firstListTools", () => {
    // test-revizorro: approved
    it("captures only once; subsequent calls are noop", () => {
      const telemetry = createTelemetry(false)

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
      const telemetry = createTelemetry(false)
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
      const telemetry = createTelemetry(false)
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
      const telemetry = createTelemetry(false)
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
      const telemetry = createTelemetry(false)
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

    it("includes input_bytes and output_bytes when provided", () => {
      const telemetry = createTelemetry(false)
      telemetry.toolCalled({
        toolName: "edit_document",
        status: "success",
        durationMs: 50,
        inputBytes: 1234,
        outputBytes: 567
      })

      const call = mockCapture.mock.calls[0][0]
      expect(call.properties.input_bytes).toBe(1234)
      expect(call.properties.output_bytes).toBe(567)
    })

    it("omits input_bytes and output_bytes when not provided", () => {
      const telemetry = createTelemetry(false)
      telemetry.toolCalled({
        toolName: "list_issues",
        status: "success",
        durationMs: 10
      })

      const call = mockCapture.mock.calls[0][0]
      expect(call.properties).not.toHaveProperty("input_bytes")
      expect(call.properties).not.toHaveProperty("output_bytes")
    })

    it("includes edit_mode when provided", () => {
      const telemetry = createTelemetry(false)
      telemetry.toolCalled({
        toolName: "edit_document",
        status: "success",
        durationMs: 30,
        editMode: "search_and_replace"
      })

      const call = mockCapture.mock.calls[0][0]
      expect(call.properties.edit_mode).toBe("search_and_replace")
    })

    it("omits edit_mode when not provided", () => {
      const telemetry = createTelemetry(false)
      telemetry.toolCalled({
        toolName: "list_issues",
        status: "success",
        durationMs: 10
      })

      const call = mockCapture.mock.calls[0][0]
      expect(call.properties).not.toHaveProperty("edit_mode")
    })
  })

  describe("shutdown", () => {
    // test-revizorro: approved
    it("captures session_end then calls client.shutdown with timeout", async () => {
      const telemetry = createTelemetry(false)
      await telemetry.shutdown()

      const endCalls = mockCapture.mock.calls.filter(
        (c) => c[0].event === "session_end"
      )
      expect(endCalls).toHaveLength(1)
      expect(mockShutdown).toHaveBeenCalledOnce()
      expect(mockShutdown).toHaveBeenCalledWith(2000)
    })

    // test-revizorro: approved
    it("does not throw when client.shutdown rejects", async () => {
      mockShutdown.mockRejectedValueOnce(new Error("flush timeout"))
      const telemetry = createTelemetry(false)
      await expect(telemetry.shutdown()).resolves.toBeUndefined()

      // session_end should still have been captured before the rejection
      const endCalls = mockCapture.mock.calls.filter(
        (c) => c[0].event === "session_end"
      )
      expect(endCalls).toHaveLength(1)
      expect(mockShutdown).toHaveBeenCalledOnce()
    })

    // test-revizorro: approved
    it("logs shutdown error in debug mode", async () => {
      mockShutdown.mockRejectedValueOnce(new Error("flush timeout"))

      const telemetry = createTelemetry(true)
      await telemetry.shutdown()

      expect(debugMessages).toContainEqual(expect.stringContaining("[telemetry] shutdown error"))
    })
  })

  describe("debug mode", () => {
    // test-revizorro: approved
    it("logs sessionStart to console.error", () => {
      const telemetry = createTelemetry(true)

      telemetry.sessionStart({
        transport: "http",
        authMethod: "password",
        toolCount: 3,
        toolsets: null
      })

      expect(debugMessages).toContainEqual(expect.stringContaining("[telemetry] session_start"))
    })

    // test-revizorro: approved
    it("logs firstListTools to console.error", () => {
      const telemetry = createTelemetry(true)

      telemetry.firstListTools()

      expect(debugMessages).toContain("[telemetry] first_list_tools")
    })

    // test-revizorro: approved
    it("logs toolCalled to console.error", () => {
      const telemetry = createTelemetry(true)

      telemetry.toolCalled({
        toolName: "x",
        status: "success",
        durationMs: 0
      })

      expect(debugMessages).toContainEqual(expect.stringContaining("[telemetry] tool_called"))
    })

    // test-revizorro: approved
    it("logs shutdown to console.error", async () => {
      const telemetry = createTelemetry(true)

      await telemetry.shutdown()

      expect(debugMessages).toContain("[telemetry] shutting down")
    })
  })

  describe("capture error handling", () => {
    // test-revizorro: approved
    it("does not throw when client.capture throws", () => {
      mockCapture.mockImplementationOnce(() => {
        throw new Error("network down")
      })
      const telemetry = createTelemetry(false)
      expect(() => telemetry.firstListTools()).not.toThrow()
    })

    // test-revizorro: approved
    it("logs capture error in debug mode", () => {
      mockCapture.mockImplementationOnce(() => {
        throw new Error("capture failed")
      })
      const telemetry = createTelemetry(true)
      telemetry.firstListTools()

      expect(debugMessages).toContainEqual(expect.stringContaining("[telemetry] capture error"))
    })

    // test-revizorro: approved
    it("does not log capture error when debug is off", () => {
      mockCapture.mockImplementationOnce(() => {
        throw new Error("capture failed")
      })
      const telemetry = createTelemetry(false)
      telemetry.firstListTools()

      expect(debugMessages.filter((message) => message.includes("[telemetry] capture error"))).toHaveLength(0)
    })
  })

  describe("session identity", () => {
    // test-revizorro: approved
    it("uses consistent sessionId across all events", () => {
      const telemetry = createTelemetry(false)
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
      const t1 = createTelemetry(false)
      const t2 = createTelemetry(false)
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
